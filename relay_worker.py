"""Crash-aware relay worker. No market rules, credentials or external clients here."""
import asyncio
from datetime import datetime, timezone
import html
import json
import logging

from relay_store import canonical

logger = logging.getLogger(__name__)


class AnalysisFailure(Exception):
    """Allow-listed operational codes, never provider text or model output."""
    CODES = frozenset({"GEMINI_MAX_TOKENS", "GEMINI_EMPTY_RESPONSE",
                       "GEMINI_INVALID_RESPONSE", "GEMINI_FINISH_NOT_STOP",
                       "TELEGRAM_MESSAGE_TOO_LONG", "TELEGRAM_FORMAT_FAILED"})

    def __init__(self, code):
        self.code = code if code in self.CODES else "GEMINI_ANALYSIS_FAILED"
        super().__init__(self.code)


class DeliveryRetry(Exception):
    def __init__(self, code, delay=30):
        self.code, self.delay = code, max(1, min(float(delay), 86400))


class DeliveryUnknown(Exception):
    pass


class DeliveryRejected(Exception):
    pass


def ai_failure(exc):
    """Classify without logging provider text, which may contain input or keys."""
    if isinstance(exc, AnalysisFailure):
        return "fail", exc.code
    code = getattr(exc, "code", None)
    try:
        code = int(code) if code is not None else None
    except (ValueError, TypeError):
        code = None
    detail = getattr(exc, "response_json", None)
    detail = json.dumps(detail, default=str).lower() if detail else str(exc).lower()
    if code in (401, 403, 404, 402):
        return "block", "GEMINI_ACCESS_OR_BILLING"
    if code == 429 and any(s in detail for s in ('limit: 0', 'limit=0', '"quotavalue": "0"', '"quotavalue": 0')):
        return "block", "GEMINI_ZERO_QUOTA"
    if code in (429, 500, 502, 503, 504) or isinstance(exc, (TimeoutError, ConnectionError)):
        return "retry", "GEMINI_TRANSIENT"
    return "fail", "GEMINI_ANALYSIS_FAILED"


def audit_header(job):
    p = json.loads(job["payload_json"])
    stamp = p.get("event_close_time") or p.get("bar_time")
    try:
        when = datetime.fromtimestamp(stamp / 1000, timezone.utc).isoformat() if stamp else "brak"
    except (ValueError, OverflowError, TypeError):
        when = "brak"
    return (f"<b>Zdarzenie UTC:</b> {html.escape(when)}\n"
            f"<b>ID:</b> <code>{html.escape(job['event_id'])}</code>\n"
            "Analiza zapisanej migawki, nie bieżącej ceny.\n\n")


class RelayWorker:
    def __init__(self, store, analyze, deliver, max_age=21600):
        self.store, self.analyze, self.deliver = store, analyze, deliver
        self.max_age = max_age  # delivery freshness, never a trading parameter
        self.last_error = None
        self.last_heartbeat = None

    async def db(self, method, *args, **kwargs):
        return await asyncio.to_thread(method, *args, **kwargs)

    def technical_text(self, job, code):
        return (audit_header(job) + "<b>STATUS TECHNICZNY — BRAK ANALIZY AI</b>\n"
                f"{html.escape(code)}. Zdarzenie zachowane. Nie jest to sygnał ani wynik Gemini.")

    def is_stale(self, job):
        p = json.loads(job["payload_json"])
        event_ms = p.get("event_close_time") or p.get("bar_time")
        ages = [self.store.clock() - job["received_at"]]
        if event_ms is not None:
            ages.append(self.store.clock() - event_ms / 1000)
        return max(ages) > self.max_age

    async def technical(self, job, code):
        text = self.technical_text(job, code)
        await self.db(self.store.transition, job, "ANALYZING", status="READY",
                      error_code=code, result_kind="TECHNICAL_ERROR", message_text=text)

    async def analyze_one(self):
        job = await self.db(self.store.claim, "analysis")
        if job is None:
            return False
        # Cap replay by BOTH queue age and original observation age.
        if self.is_stale(job):
            await self.technical(job, "STALE_EVENT_NOT_ANALYZED")
            return True
        if job["ai_attempts"] > 3:
            await self.technical(job, "GEMINI_ATTEMPTS_EXHAUSTED")
            return True
        try:
            p = json.loads(job["payload_json"])
            analysis, text = await asyncio.wait_for(self.analyze(p, job["model"]), timeout=90)
            text = audit_header(job) + text
            if len(text) > 4000:
                raise AnalysisFailure("TELEGRAM_MESSAGE_TOO_LONG")
        except Exception as exc:
            action, code = ai_failure(exc)
            logger.error("RELAY_ANALYSIS_FAILURE receipt_id=%s code=%s action=%s",
                         job["event_key"], code, action)
            if action == "block":
                await self.db(self.store.block_model, job["model"], code)
            if action == "retry" and job["ai_attempts"] < 3:
                await self.db(self.store.transition, job, "ANALYZING", status="QUEUED",
                              error_code=code, next_attempt_at=self.store.clock() + 30 * 2 ** (job["ai_attempts"] - 1))
            else:
                await self.technical(job, code)
        else:
            await self.db(self.store.transition, job, "ANALYZING", status="READY",
                          analysis_json=canonical(analysis), message_text=text,
                          result_kind="GEMINI_ANALYSIS", error_code=None)
        return True

    async def deliver_one(self):
        job = await self.db(self.store.claim, "delivery")
        if job is None:
            return False
        # READY can wait hours after an explicit retryable transport failure.
        # Never send an expired analysis merely because it was fresh at generation.
        if job["result_kind"] == "GEMINI_ANALYSIS" and self.is_stale(job):
            code = "STALE_EVENT_NOT_DELIVERED"
            await self.db(self.store.transition, job, "SENDING", status="READY",
                          result_kind="TECHNICAL_ERROR", error_code=code,
                          message_text=self.technical_text(job, code),
                          next_attempt_at=self.store.clock())
            return True
        try:
            message_id = await asyncio.wait_for(self.deliver(job["message_text"]), timeout=20)
            if type(message_id) is not int or message_id <= 0:
                raise DeliveryUnknown("missing confirmation")
        except DeliveryRetry as exc:
            await self.db(self.store.transition, job, "SENDING",
                          status="READY" if job["delivery_attempts"] < 3 else "DELIVERY_FAILED",
                          error_code=exc.code, next_attempt_at=self.store.clock() + exc.delay)
        except DeliveryRejected:
            await self.db(self.store.transition, job, "SENDING", status="DELIVERY_FAILED",
                          error_code="TELEGRAM_REJECTED")
        except Exception:
            # Lost response might mean delivered. Do NOT blindly retry.
            await self.db(self.store.transition, job, "SENDING", status="DELIVERY_UNKNOWN",
                          error_code="TELEGRAM_CONFIRMATION_UNKNOWN")
            logger.error("RELAY_DELIVERY_UNKNOWN receipt_id=%s", job["event_key"])
        else:
            await self.db(self.store.transition, job, "SENDING", status="DELIVERED",
                          telegram_message_id=message_id)
        return True

    async def run(self):
        while True:
            self.last_heartbeat = self.store.clock()
            try:
                # Deliver committed outbox records before spending on another AI call.
                progressed = await self.deliver_one() or await self.analyze_one()
                self.last_error = None
            except Exception:
                self.last_error = "WORKER_STORAGE_OR_LEASE_ERROR"
                logger.error(self.last_error)  # never exception repr/provider request URL
                progressed = False
            self.last_heartbeat = self.store.clock()
            await asyncio.sleep(0.05 if progressed else 1)
