"""Independent operational outbox. No provider, Relay, or credential imports."""
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
import hashlib
import json
import math
from pathlib import Path
import secrets
import sqlite3
import time
from uuid import UUID, uuid4


class ConfigError(Exception):
    pass


class InvalidEvent(Exception):
    pass


class EventConflict(Exception):
    pass


class InboxFull(Exception):
    pass


class LostLease(Exception):
    pass


class SafeRetry(Exception):
    def __init__(self, code, delay=30):
        self.code, self.delay = code, delay


class Rejected(Exception):
    pass


@dataclass(frozen=True)
class OpsConfig:
    secret: str = field(repr=False)
    production_checks: frozenset[str] = field(repr=False)
    test_checks: frozenset[str] = field(repr=False)
    durable_dir: Path
    forbidden_secrets: tuple[str, ...] = field(default=(), repr=False)
    protected_databases: tuple[Path, ...] = field(default=(), repr=False)
    max_age: int = 900
    future_slack: int = 30

    def __post_init__(self):
        checks = self.production_checks | self.test_checks
        if (not isinstance(self.secret, str) or not self.secret.isascii()
                or not 32 <= len(self.secret) <= 256
                or any(value and secrets.compare_digest(self.secret, value)
                       for value in self.forbidden_secrets)
                or not 1 <= len(checks) <= 8
                or self.production_checks & self.test_checks
                or not Path(self.durable_dir).is_absolute()
                or not 60 <= self.max_age <= 3600 or not 0 <= self.future_slack <= 60):
            raise ConfigError("OPS_CONFIGURATION_INVALID")
        try:
            if any(str(UUID(value)) != value for value in checks):
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise ConfigError("OPS_CONFIGURATION_INVALID") from None

    @property
    def checks(self):
        return self.production_checks | self.test_checks


def authenticate(config, authorization):
    if config is None:
        return False
    expected = "Bearer " + config.secret
    return isinstance(authorization, str) and authorization.isascii() and secrets.compare_digest(
        authorization, expected)


def decode_event(body, config, now):
    if config is None or len(body) > 1024:
        raise InvalidEvent("OPS_PAYLOAD_INVALID")

    def unique_pairs(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError
            result[key] = value
        return result

    try:
        data = json.loads(body.decode("utf-8"), object_pairs_hook=unique_pairs)
        if type(data) is not dict or set(data) != {"check_id", "state", "emitted_at"}:
            raise ValueError
        check = data["check_id"]
        if type(check) is not str or len(check) != 36 or str(UUID(check)) != check:
            raise ValueError
        if check not in config.checks or data["state"] not in ("up", "down"):
            raise ValueError
        stamp = data["emitted_at"]
        if type(stamp) is not str or len(stamp) > 40 or "T" not in stamp:
            raise ValueError
        moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
        if moment.tzinfo is None or moment.utcoffset() != timedelta(0):
            raise ValueError
        seconds = moment.timestamp()
        if now - seconds > config.max_age or seconds - now > config.future_slack:
            raise ValueError
        emitted_us = int(seconds) * 1000000 + moment.microsecond
    except (ValueError, TypeError, KeyError, OverflowError, UnicodeError):
        raise InvalidEvent("OPS_PAYLOAD_INVALID") from None
    return {"check_id": check, "state": data["state"], "emitted_us": emitted_us,
            "emitted_at": moment.astimezone(timezone.utc).isoformat(timespec="microseconds")}


def fixed_text(event, is_test):
    title = "🧪 TEST — " if is_test else ""
    label = "TEST monitorowania" if is_test else "Kolektor VR2"
    state_text = ("Monitor MEXC zgłosił brak potwierdzenia działania. Sprawdź usługę."
                  if event["state"] == "down" else "Monitor MEXC ponownie potwierdził działanie.")
    return (f"<b>{title}ALARM TECHNICZNY MEXC</b>\n{state_text}\n"
            f"<b>Zdarzenie UTC:</b> <code>{event['emitted_at']}</code>\n"
            f"<b>Kontrola:</b> {label}\n"
            f"<b>Potwierdzenie:</b> <code>{event['receipt_id'][:12]}</code>\n"
            "To status techniczny, nie sygnał rynkowy. Bez analizy AI.")


class OpsStore:
    def __init__(self, config, clock=time.time):
        self.config, self.clock = config, clock
        root = Path(config.durable_dir).resolve(strict=True)
        self.path = root / "ops_monitor.sqlite3"
        if not root.is_dir() or self.path.is_symlink():
            raise ConfigError("OPS_STORAGE_INVALID")
        for protected in config.protected_databases:
            protected = Path(protected)
            if (self.path.resolve() == protected.resolve()
                    or (self.path.exists() and protected.exists() and self.path.samefile(protected))):
                raise ConfigError("OPS_STORAGE_INVALID")
        with self.connect() as db:
            if db.execute("PRAGMA user_version").fetchone()[0] not in (0, 1):
                raise ConfigError("OPS_STORAGE_INVALID")
            tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if tables - {"ops_checks", "ops_events"}:
                raise ConfigError("OPS_STORAGE_INVALID")
            db.execute("PRAGMA journal_mode=WAL")
            db.executescript("""
                CREATE TABLE IF NOT EXISTS ops_checks (
                    check_id TEXT PRIMARY KEY, state TEXT NOT NULL, emitted_us INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS ops_events (
                    receipt_id TEXT PRIMARY KEY, check_id TEXT NOT NULL,
                    state TEXT NOT NULL, emitted_us INTEGER NOT NULL, emitted_at TEXT NOT NULL,
                    received_at REAL NOT NULL, updated_at REAL NOT NULL, status TEXT NOT NULL,
                    attempts INTEGER NOT NULL DEFAULT 0, next_attempt_at REAL NOT NULL,
                    lease_token TEXT, lease_until REAL, error_code TEXT,
                    telegram_message_id INTEGER);
                CREATE INDEX IF NOT EXISTS ops_due ON ops_events(status,next_attempt_at);
                PRAGMA user_version=1;
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

    def accept(self, event, capacity=10000):
        # Validate again so direct internal callers cannot bypass the allowlist/time bounds.
        event = decode_event(json.dumps({k: event[k] for k in
            ("check_id", "state", "emitted_at")}).encode(), self.config, self.clock())
        key = hashlib.sha256(json.dumps([event["check_id"], event["emitted_us"],
                                       event["state"]], separators=(",", ":")).encode()).hexdigest()
        now = self.clock()
        with self.transaction() as db:
            previous = db.execute("SELECT * FROM ops_events WHERE receipt_id=?", (key,)).fetchone()
            if previous:
                return "duplicate", dict(previous)
            latest = db.execute("SELECT * FROM ops_checks WHERE check_id=?",
                                (event["check_id"],)).fetchone()
            if latest and event["emitted_us"] <= latest["emitted_us"]:
                raise EventConflict("OPS_EVENT_ORDER_CONFLICT")
            if db.execute("SELECT COUNT(*) FROM ops_events").fetchone()[0] >= capacity:
                raise InboxFull("OPS_INBOX_FULL")
            unchanged = latest is not None and latest["state"] == event["state"]
            status = "SUPPRESSED" if unchanged else "READY"
            db.execute("""INSERT INTO ops_events
                (receipt_id,check_id,state,emitted_us,emitted_at,received_at,updated_at,status,next_attempt_at)
                VALUES (?,?,?,?,?,?,?,?,?)""",
                (key,event["check_id"],event["state"],event["emitted_us"],event["emitted_at"],
                 now,now,status,now))
            db.execute("""INSERT INTO ops_checks VALUES (?,?,?) ON CONFLICT(check_id)
                DO UPDATE SET state=excluded.state,emitted_us=excluded.emitted_us""",
                (event["check_id"],event["state"],event["emitted_us"]))
            return "state_unchanged" if unchanged else "accepted", dict(db.execute(
                "SELECT * FROM ops_events WHERE receipt_id=?", (key,)).fetchone())

    def claim(self, lease_seconds=60):
        now = self.clock()
        with self.transaction() as db:
            db.execute("""UPDATE ops_events SET status='DELIVERY_UNKNOWN',
                error_code='SEND_INTERRUPTED',lease_token=NULL,lease_until=NULL,updated_at=?
                WHERE status='SENDING' AND lease_until<=?""", (now,now))
            db.execute("""UPDATE ops_events SET status='DELIVERY_STALE',
                error_code='OUTBOX_TOO_OLD',updated_at=? WHERE status='READY' AND emitted_us<?""",
                (now,int((now-self.config.max_age)*1000000)))
            row = db.execute("""SELECT e.* FROM ops_events e
                WHERE e.status='READY' AND e.next_attempt_at<=? AND NOT EXISTS (
                    SELECT 1 FROM ops_events older WHERE older.check_id=e.check_id
                    AND older.emitted_us<e.emitted_us
                    AND older.status IN ('READY','SENDING','DELIVERY_UNKNOWN'))
                ORDER BY e.emitted_us,e.receipt_id LIMIT 1""", (now,)).fetchone()
            if row is None:
                return None
            token = str(uuid4())
            db.execute("""UPDATE ops_events SET status='SENDING',attempts=attempts+1,
                lease_token=?,lease_until=?,updated_at=? WHERE receipt_id=?""",
                (token,now+lease_seconds,now,row["receipt_id"]))
            return dict(db.execute("SELECT * FROM ops_events WHERE receipt_id=?",
                                   (row["receipt_id"],)).fetchone())

    def finish(self, job, status, error=None, message_id=None, delay=0):
        if status not in {"READY", "DELIVERED", "DELIVERY_FAILED", "DELIVERY_UNKNOWN"}:
            raise ValueError("OPS_TRANSITION_INVALID")
        now = self.clock()
        with self.transaction() as db:
            changed = db.execute("""UPDATE ops_events SET status=?,error_code=?,
                telegram_message_id=?,next_attempt_at=?,updated_at=?,lease_token=NULL,lease_until=NULL
                WHERE receipt_id=? AND status='SENDING' AND lease_token=? AND lease_until>?""",
                (status,error,message_id,now+delay,now,job["receipt_id"],job["lease_token"],now)).rowcount
            if changed != 1:
                raise LostLease("OPS_LEASE_LOST")

    def get(self, receipt_id):
        with self.connect() as db:
            row = db.execute("SELECT * FROM ops_events WHERE receipt_id=?", (receipt_id,)).fetchone()
            return dict(row) if row else None


class OpsWorker:
    def __init__(self, store, deliver, retry_error=SafeRetry, rejection_error=Rejected):
        self.store, self.deliver = store, deliver
        self.retry_error, self.rejection_error = retry_error, rejection_error
        self.last_error = None

    async def deliver_one(self):
        job = await asyncio.to_thread(self.store.claim)
        if job is None:
            return False
        text = fixed_text(job, job["check_id"] in self.store.config.test_checks)
        try:
            message_id = await asyncio.wait_for(self.deliver(text), timeout=20)
            if type(message_id) is not int or message_id <= 0:
                raise RuntimeError("OPS_CONFIRMATION_UNKNOWN")
        except self.retry_error as exc:
            code = getattr(exc, "code", None)
            try:
                delay = float(getattr(exc, "delay", 30))
            except (ValueError, TypeError):
                delay = math.inf
            if code not in {"TELEGRAM_NOT_CONNECTED", "TELEGRAM_RATE_LIMIT"}:
                await asyncio.to_thread(self.store.finish, job, "DELIVERY_UNKNOWN",
                                        "TELEGRAM_CONFIRMATION_UNKNOWN")
            elif not math.isfinite(delay) or not 1 <= delay <= 300:
                await asyncio.to_thread(self.store.finish, job, "DELIVERY_FAILED",
                                        "TELEGRAM_RETRY_DELAY_UNSUPPORTED")
            else:
                delay = max(delay, 30 * 2 ** (job["attempts"]-1))
                await asyncio.to_thread(self.store.finish, job,
                    "READY" if job["attempts"] < 3 else "DELIVERY_FAILED", code, delay=delay)
        except self.rejection_error:
            await asyncio.to_thread(self.store.finish, job, "DELIVERY_FAILED", "TELEGRAM_REJECTED")
        except Exception:
            await asyncio.to_thread(self.store.finish, job, "DELIVERY_UNKNOWN",
                                    "TELEGRAM_CONFIRMATION_UNKNOWN")
        else:
            await asyncio.to_thread(self.store.finish, job, "DELIVERED", message_id=message_id)
        return True

    async def run(self):
        while True:
            try:
                progressed = await self.deliver_one()
                self.last_error = None
            except Exception:
                self.last_error = "OPS_STORAGE_OR_LEASE_ERROR"
                progressed = False
            await asyncio.sleep(0.05 if progressed else 1)
