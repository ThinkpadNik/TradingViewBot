"""Durable, single-host inbox/outbox. Never stores webhook/API credentials.

SQLite must live on a persistent disk in production. Telegram cannot provide
exactly-once sendMessage: uncertain sends are held for manual reconciliation.
"""
import hashlib
import json
import logging
import sqlite3
from contextlib import contextmanager
from pathlib import Path
import time
import uuid

logger = logging.getLogger(__name__)


class EventConflict(Exception):
    pass


class QueueFull(Exception):
    pass


class LostLease(Exception):
    pass


def canonical(data):
    return json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False)


def has_credentials(value):
    if isinstance(value, dict):
        return any(str(k).lower() in {"secret", "webhook_secret", "api_key", "token", "authorization"}
                   or has_credentials(v) for k, v in value.items())
    return isinstance(value, (list, tuple)) and any(has_credentials(v) for v in value)


class RelayStore:
    def __init__(self, path, clock=time.time):
        self.path = str(Path(path))
        self.clock = clock
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with self.connect() as db:
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS relay_events (
                    event_key TEXT PRIMARY KEY, event_id TEXT NOT NULL,
                    payload_hash TEXT NOT NULL, payload_json TEXT NOT NULL,
                    model TEXT NOT NULL, received_at REAL NOT NULL,
                    updated_at REAL NOT NULL, status TEXT NOT NULL,
                    ai_attempts INTEGER NOT NULL DEFAULT 0,
                    delivery_attempts INTEGER NOT NULL DEFAULT 0,
                    next_attempt_at REAL NOT NULL, lease_until REAL,
                    lease_token TEXT, result_kind TEXT, error_code TEXT,
                    analysis_json TEXT, message_text TEXT, telegram_message_id INTEGER
                );
                CREATE INDEX IF NOT EXISTS relay_due ON relay_events(status,next_attempt_at);
                CREATE TABLE IF NOT EXISTS relay_control (
                    model TEXT PRIMARY KEY, blocked_reason TEXT NOT NULL, updated_at REAL NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=0.5, isolation_level=None)
        db.row_factory = sqlite3.Row
        db.execute("PRAGMA synchronous=FULL")
        db.execute("PRAGMA busy_timeout=500")
        try:
            yield db
        finally:
            db.close()

    @contextmanager
    def transaction(self):
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            try:
                yield db
                db.execute("COMMIT")
            except BaseException:
                db.execute("ROLLBACK")
                raise

    def enqueue(self, payload, model, capacity=10000):
        # Accept only the application's already validated, secret-free projection.
        if has_credentials(payload):
            raise ValueError("credential field in inbox")
        body = canonical(payload)
        fingerprint = hashlib.sha256(body.encode()).hexdigest()
        event_id = payload.get("event_id") or "legacy-" + fingerprint
        key = hashlib.sha256(canonical([payload["ticker"], payload["timeframe"], event_id]).encode()).hexdigest()
        now = self.clock()
        with self.transaction() as db:
            existing = db.execute("SELECT * FROM relay_events WHERE event_key=?", (key,)).fetchone()
            if existing:
                if existing["payload_hash"] != fingerprint:
                    raise EventConflict("same event identity with different content")
                return dict(existing), False
            pending = db.execute("SELECT COUNT(*) FROM relay_events WHERE status NOT IN ('DELIVERED','DELIVERY_FAILED','DELIVERY_UNKNOWN')").fetchone()[0]
            if pending >= capacity:
                raise QueueFull("inbox capacity reached")
            db.execute("""INSERT INTO relay_events
                (event_key,event_id,payload_hash,payload_json,model,received_at,updated_at,status,next_attempt_at)
                VALUES (?,?,?,?,?,?,?,'QUEUED',?)""",
                (key,event_id,fingerprint,body,model,now,now,now))
            return dict(db.execute("SELECT * FROM relay_events WHERE event_key=?", (key,)).fetchone()), True

    def claim(self, stage, lease_seconds=180):
        if stage not in ("analysis", "delivery"):
            raise ValueError("invalid stage")
        now = self.clock()
        with self.transaction() as db:
            # No outside call has been sent for expired ANALYZING leases unless
            # it was an AI call; re-analysis may cost another call, never a send.
            db.execute("""UPDATE relay_events SET status='QUEUED',lease_until=NULL,
                lease_token=NULL,updated_at=? WHERE status='ANALYZING' AND lease_until<=?""", (now,now))
            # A process could crash after Telegram accepted the message but before
            # local commit. Blind resending would risk a duplicate notification.
            interrupted = db.execute("""UPDATE relay_events SET status='DELIVERY_UNKNOWN',
                error_code='SEND_INTERRUPTED',lease_until=NULL,lease_token=NULL,updated_at=?
                WHERE status='SENDING' AND lease_until<=?""", (now,now)).rowcount
            if interrupted:
                logger.error("RELAY_SEND_INTERRUPTED count=%s", interrupted)
            pending, active, count = (("QUEUED", "ANALYZING", "ai_attempts") if stage == "analysis"
                                      else ("READY", "SENDING", "delivery_attempts"))
            row = db.execute("""SELECT * FROM relay_events WHERE status=? AND next_attempt_at<=?
                AND (?!='analysis' OR model NOT IN (SELECT model FROM relay_control))
                ORDER BY received_at,event_key LIMIT 1""", (pending,now,stage)).fetchone()
            if row is None:
                return None
            token = str(uuid.uuid4())
            db.execute(f"""UPDATE relay_events SET status=?,{count}={count}+1,
                lease_until=?,lease_token=?,updated_at=? WHERE event_key=?""",
                (active,now+lease_seconds,token,now,row["event_key"]))
            return dict(db.execute("SELECT * FROM relay_events WHERE event_key=?", (row["event_key"],)).fetchone())

    def transition(self, job, expected, **changes):
        allowed = {"status", "next_attempt_at", "result_kind", "error_code", "analysis_json",
                   "message_text", "telegram_message_id"}
        if not changes.keys() <= allowed:
            raise ValueError("invalid transition fields")
        now = self.clock()
        changes.update(updated_at=now, lease_until=None, lease_token=None)
        with self.transaction() as db:
            changed = db.execute("UPDATE relay_events SET " + ",".join(f"{k}=?" for k in changes)
                + " WHERE event_key=? AND status=? AND lease_token=? AND lease_until>?",
                (*changes.values(),job["event_key"],expected,job["lease_token"],now)).rowcount
            if changed != 1:
                raise LostLease("job no longer owned")

    def block_model(self, model, reason):
        with self.transaction() as db:
            db.execute("""INSERT INTO relay_control VALUES (?,?,?) ON CONFLICT(model)
                DO UPDATE SET blocked_reason=excluded.blocked_reason,updated_at=excluded.updated_at""",
                (model,reason,self.clock()))

    def blocked_reason(self, model):
        with self.connect() as db:
            row = db.execute("SELECT blocked_reason FROM relay_control WHERE model=?", (model,)).fetchone()
            return row[0] if row else None

    def unblock_model(self, model):
        # Operator-only after resolving billing/permissions. Does not replay history.
        with self.transaction() as db:
            db.execute("DELETE FROM relay_control WHERE model=?", (model,))

    def get(self, key):
        with self.connect() as db:
            row = db.execute("SELECT * FROM relay_events WHERE event_key=?", (key,)).fetchone()
            return dict(row) if row else None

    def status(self):
        with self.connect() as db:
            counts = {row[0]: row[1] for row in db.execute("SELECT status,COUNT(*) FROM relay_events GROUP BY status")}
            blocks = [dict(r) for r in db.execute("SELECT * FROM relay_control")]
            oldest = db.execute("SELECT MIN(received_at) FROM relay_events WHERE status IN ('QUEUED','ANALYZING','READY','SENDING')").fetchone()[0]
            attention = [dict(r) for r in db.execute("""SELECT event_key AS receipt_id,
                event_id,status,result_kind,error_code,updated_at FROM relay_events
                WHERE status IN ('DELIVERY_UNKNOWN','DELIVERY_FAILED') OR result_kind='TECHNICAL_ERROR'
                ORDER BY updated_at,event_key LIMIT 20""")]
            result_counts = {r[0]: r[1] for r in db.execute("""SELECT result_kind,COUNT(*)
                FROM relay_events WHERE result_kind IS NOT NULL GROUP BY result_kind""")}
            # Outcome of the newest RECEIVED event with a completed analysis,
            # per model; not the last operation to finish. A delayed old success
            # must not hide a newer event's failure. History remains in attention.
            latest_analysis = [dict(r) for r in db.execute("""SELECT e.model,e.result_kind,
                e.error_code,e.event_key AS receipt_id FROM relay_events e
                WHERE e.ai_attempts>0 AND e.result_kind IS NOT NULL AND NOT EXISTS (
                    SELECT 1 FROM relay_events newer WHERE newer.model=e.model
                    AND newer.ai_attempts>0 AND newer.result_kind IS NOT NULL
                    AND (newer.received_at,newer.event_key)>(e.received_at,e.event_key))
                ORDER BY e.model""")]
            return {"counts": counts, "model_blocks": blocks, "oldest_pending_at": oldest,
                    "attention": attention, "result_counts": result_counts,
                    "latest_analysis": latest_analysis}
