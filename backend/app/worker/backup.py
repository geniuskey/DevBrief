"""Write a consistent online copy of the SQLite database (safe while API/worker run)."""

import argparse
import sqlite3
from pathlib import Path

from sqlalchemy.engine import make_url

from app.core.settings import get_settings


def backup_sqlite(database_url: str, destination: Path) -> Path:
    url = make_url(database_url)
    if url.get_backend_name() != "sqlite" or not url.database or url.database == ":memory:":
        raise SystemExit("backup supports file-based SQLite only; use pg_dump for PostgreSQL")
    destination.parent.mkdir(parents=True, exist_ok=True)
    partial = destination.with_name(destination.name + ".partial")
    source = sqlite3.connect(f"file:{url.database}?mode=ro", uri=True)
    target = sqlite3.connect(partial)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    # Rename last so an interrupted backup never looks complete.
    partial.replace(destination)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("destination", type=Path, help="Backup file path, e.g. /data/backups/devbrief.db")
    args = parser.parse_args()
    print(backup_sqlite(get_settings().database_url, args.destination))


if __name__ == "__main__":
    main()
