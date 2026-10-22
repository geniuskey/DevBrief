import os
import sqlite3
import subprocess
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]


def alembic(db: Path, *args: str) -> None:
    env = {**os.environ, "DATABASE_URL": f"sqlite:///{db}"}
    subprocess.run(
        [sys.executable, "-m", "alembic", *args], cwd=BACKEND, env=env, check=True, capture_output=True
    )


def test_sqlite_table_rebuild_keeps_cached_rows(tmp_path):
    # batch_alter_table rebuilds SQLite tables; with FK enforcement on, the DROP
    # cascades into (or is blocked by) rows referencing the rebuilt table.
    db = tmp_path / "upgrade.db"
    alembic(db, "upgrade", "c45656d3d86c")
    with sqlite3.connect(db) as conn:
        conn.execute("INSERT INTO repositories VALUES ('r1', 'org/repo', 1, 'accessible')")
        conn.execute(
            "INSERT INTO commits VALUES ('r1', 'abc', 'alice', 'alice', '2026-10-12 00:00:00', 'msg', 'https://x')"
        )
    alembic(db, "upgrade", "head")
    alembic(db, "downgrade", "c45656d3d86c")
    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT count(*) FROM commits").fetchone() == (1,)
