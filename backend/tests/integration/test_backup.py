import sqlite3

from sqlalchemy import select

from app.core.db import make_engine, session_factory
from app.models.entities import Base, Repository
from app.worker.backup import backup_sqlite


def test_online_backup_copies_rows_and_uses_wal(tmp_path):
    url = f"sqlite:///{tmp_path}/live.db"
    engine = make_engine(url)
    Base.metadata.create_all(engine)
    factory = session_factory(engine)
    with factory() as db:
        db.add(Repository(id="r1", full_name="org/repo", enabled=True, access_state="accessible"))
        db.commit()
        assert db.connection().exec_driver_sql("PRAGMA journal_mode").scalar() == "wal"
        # Taken while the source connection is still open, as in a running deployment.
        copy = backup_sqlite(url, tmp_path / "backups" / "copy.db")
    with sqlite3.connect(copy) as conn:
        assert conn.execute("SELECT full_name FROM repositories").fetchall() == [("org/repo",)]
    assert not (tmp_path / "backups" / "copy.db.partial").exists()
    engine.dispose()
    with session_factory(make_engine(f"sqlite:///{copy}"))() as db:
        assert db.scalar(select(Repository.full_name)) == "org/repo"
