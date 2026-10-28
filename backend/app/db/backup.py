"""Database backup and recovery utility for MarketIQ.

Supports:
- Hot, consistent, atomic backups of SQLite database files using VACUUM INTO
- Point-in-time timestamped backup archiving
- Documented PostgreSQL pg_dump / pg_restore operations
"""
from datetime import datetime, timezone
import logging
from pathlib import Path
import sqlite3
import sys

from ..config import settings

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("marketiq.backup")


def get_backup_dir() -> Path:
    backup_dir = Path("backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir


def backup_sqlite() -> Path:
    """Executes a hot atomic backup of SQLite database without locking out active connections."""
    db_url = settings.database_url
    if not db_url.startswith("sqlite:///"):
        raise ValueError(f"backup_sqlite called on non-sqlite database URL: {db_url}")

    db_path = Path(db_url.replace("sqlite:///", ""))
    if not db_path.exists():
        raise FileNotFoundError(f"Source database file not found at: {db_path.resolve()}")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup_file = get_backup_dir() / f"paper_trading_backup_{timestamp}.db"

    logger.info("Starting hot atomic backup of %s to %s...", db_path, backup_file)

    # Use SQLite VACUUM INTO for online, consistent point-in-time snapshot
    conn = sqlite3.connect(str(db_path))
    try:
        cursor = conn.cursor()
        backup_dest_str = str(backup_file.resolve()).replace("\\", "/")
        cursor.execute(f"VACUUM INTO '{backup_dest_str}'")
        conn.commit()
    finally:
        conn.close()

    logger.info("Backup created successfully: %s (size: %d bytes)", backup_file, backup_file.stat().st_size)
    return backup_file


def restore_sqlite(backup_file_path: str) -> None:
    """Restores SQLite database from a previously generated backup snapshot."""
    src = Path(backup_file_path)
    if not src.exists():
        raise FileNotFoundError(f"Specified backup file does not exist: {src.resolve()}")

    db_url = settings.database_url
    dest = Path(db_url.replace("sqlite:///", ""))

    logger.warning("Restoring database from %s to %s (overwriting existing data)...", src, dest)

    # Make safety copy of current db if it exists
    if dest.exists():
        safety_copy = get_backup_dir() / f"pre_restore_safety_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}.db"
        dest.rename(safety_copy)
        logger.info("Created safety snapshot of previous database at %s", safety_copy)

    # Copy backup to dest
    with open(src, "rb") as f_in, open(dest, "wb") as f_out:
        f_out.write(f_in.read())

    logger.info("Database restoration completed successfully.")


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "backup"
    if action == "backup":
        if "sqlite" in settings.database_url:
            path = backup_sqlite()
            print(f"Backup created at: {path}")
        else:
            print("PostgreSQL detected. Use: pg_dump -Fc $DATABASE_URL > backups/db_backup.dump")
    elif action == "restore":
        if len(sys.argv) < 3:
            print("Usage: python -m app.db.backup restore <path_to_backup_file.db>")
            sys.exit(1)
        restore_sqlite(sys.argv[2])
    else:
        print("Usage: python -m app.db.backup [backup|restore <file>]")
