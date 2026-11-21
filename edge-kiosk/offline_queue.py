"""
SQLite Offline Resilience Queue.
Buffers check-ins locally when internet connectivity is interrupted,
recording exact IST timestamps, device metadata, and JPEG image bytes.
Provides background sync worker to flush records once connectivity is restored.
"""

import logging
import sqlite3
import threading
import time
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, List, Optional, Tuple

from config import config

logger = logging.getLogger(__name__)

IST = timezone(timedelta(hours=5, minutes=30))


def get_current_ist_timestamp() -> str:
    """Return ISO 8601 string in Indian Standard Time (IST) with seconds precision."""
    return datetime.now(IST).isoformat(timespec="seconds")


class OfflineQueue:
    def __init__(self, db_path: str = config.db_path):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _get_connection(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_db(self) -> None:
        with self._lock:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    CREATE TABLE IF NOT EXISTS offline_checkins (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        image_bytes BLOB NOT NULL,
                        timestamp_ist TEXT NOT NULL,
                        latitude REAL,
                        longitude REAL,
                        device_id TEXT NOT NULL,
                        status TEXT DEFAULT 'PENDING',
                        retry_count INTEGER DEFAULT 0,
                        last_error TEXT,
                        created_at TEXT NOT NULL
                    )
                    """
                )
                conn.execute(
                    "CREATE INDEX IF NOT EXISTS idx_status ON offline_checkins(status)"
                )
                conn.commit()

    def enqueue(
        self,
        image_bytes: bytes,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        device_id: str = config.device_id,
        timestamp_ist: Optional[str] = None,
    ) -> int:
        """Store failed check-in locally with exact IST timestamp."""
        ts = timestamp_ist or get_current_ist_timestamp()
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute(
                    """
                    INSERT INTO offline_checkins (
                        image_bytes, timestamp_ist, latitude, longitude, device_id, created_at
                    ) VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (image_bytes, ts, latitude, longitude, device_id, ts),
                )
                conn.commit()
                record_id = cursor.lastrowid
                logger.info(f"Check-in buffered to offline queue (ID: {record_id})")
                return record_id

    def get_pending(self, limit: int = 10) -> List[Dict[str, Any]]:
        """Retrieve up to `limit` pending offline check-ins."""
        with self._lock:
            with self._get_connection() as conn:
                rows = conn.execute(
                    """
                    SELECT id, image_bytes, timestamp_ist, latitude, longitude, device_id, retry_count
                    FROM offline_checkins
                    WHERE status = 'PENDING'
                    ORDER BY id ASC
                    LIMIT ?
                    """,
                    (limit,),
                ).fetchall()
                return [dict(row) for row in rows]

    def mark_synced(self, record_id: int) -> None:
        """Mark record as successfully uploaded to AWS."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute(
                    "UPDATE offline_checkins SET status = 'SYNCED' WHERE id = ?",
                    (record_id,),
                )
                conn.commit()
                logger.info(f"Offline record {record_id} synced successfully.")

    def mark_failed(self, record_id: int, error_msg: str) -> None:
        """Record retry attempt and error message."""
        with self._lock:
            with self._get_connection() as conn:
                conn.execute(
                    """
                    UPDATE offline_checkins
                    SET retry_count = retry_count + 1, last_error = ?
                    WHERE id = ?
                    """,
                    (error_msg[:500], record_id),
                )
                conn.commit()

    def get_pending_count(self) -> int:
        """Get total count of unsynced records."""
        with self._lock:
            with self._get_connection() as conn:
                row = conn.execute(
                    "SELECT COUNT(*) as count FROM offline_checkins WHERE status = 'PENDING'"
                ).fetchone()
                return int(row["count"]) if row else 0


class BackgroundSyncWorker:
    """Threaded worker periodically syncing offline queue records to cloud API."""

    def __init__(
        self,
        queue: OfflineQueue,
        sync_fn,
        interval_sec: float = config.sync_interval_sec,
    ):
        self.queue = queue
        self.sync_fn = sync_fn
        self.interval_sec = interval_sec
        self.running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self.running:
            return
        self.running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        logger.info("Offline sync background worker started.")

    def stop(self) -> None:
        self.running = False
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)
        logger.info("Offline sync background worker stopped.")

    def _run_loop(self) -> None:
        while self.running:
            try:
                pending = self.queue.get_pending(limit=5)
                for item in pending:
                    success = self.sync_fn(item)
                    if success:
                        self.queue.mark_synced(item["id"])
                    else:
                        self.queue.mark_failed(item["id"], "Sync failed")
            except Exception as e:
                logger.error(f"Error in background sync worker: {e}")
            time.sleep(self.interval_sec)
