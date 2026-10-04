"""Fixed operational webhook; no body/header/payload values in error responses."""
import asyncio
import sqlite3

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from starlette.requests import ClientDisconnect

from .ops_monitor import authenticate, decode_event, EventConflict, InvalidEvent, InboxFull

BODY_TIMEOUT_SECONDS = 5


class BodyTooLarge(Exception):
    pass


async def bounded_body(request):
    body = bytearray()
    async for chunk in request.stream():
        if len(body) + len(chunk) > 1024:
            raise BodyTooLarge
        body.extend(chunk)
    return bytes(body)


def make_router(config=None):
    router = APIRouter()

    @router.post("/ops/mexc-monitor")
    async def receive(request: Request):
        def reject(code, detail):
            return JSONResponse(status_code=code, content={"detail": detail})

        # The integration publishes app-state config only after ops startup succeeds.
        active_config = config if config is not None else getattr(
            request.app.state, "ops_monitor_config", None)
        if active_config is None:
            return reject(503, "OPS_MONITOR_DISABLED")
        # Query-string credentials can reach proxy logs before application code.
        if request.query_params:
            return reject(400, "OPS_QUERY_PARAMETERS_FORBIDDEN")
        auth = request.headers.getlist("authorization")
        if len(auth) != 1 or not authenticate(active_config, auth[0]):
            return reject(403, "OPS_AUTHENTICATION_FAILED")
        if request.headers.get("content-type", "").split(";", 1)[0].strip().lower() != "application/json":
            return reject(415, "OPS_JSON_REQUIRED")
        try:
            declared = request.headers.get("content-length")
            if declared is not None and (int(declared) < 0 or int(declared) > 1024):
                return reject(413, "OPS_BODY_TOO_LARGE")
        except ValueError:
            return reject(400, "OPS_CONTENT_LENGTH_INVALID")
        try:
            body = await asyncio.wait_for(bounded_body(request), timeout=BODY_TIMEOUT_SECONDS)
        except BodyTooLarge:
            return reject(413, "OPS_BODY_TOO_LARGE")
        except TimeoutError:
            return reject(408, "OPS_BODY_TIMEOUT")
        except ClientDisconnect:
            return reject(400, "OPS_CLIENT_DISCONNECTED")
        store = getattr(request.app.state, "ops_monitor_store", None)
        if store is None or store.config is not active_config:
            return reject(503, "OPS_STORAGE_UNAVAILABLE")
        try:
            event = decode_event(body, active_config, store.clock())
            outcome, receipt = await asyncio.to_thread(store.accept, event)
        except InvalidEvent:
            return reject(422, "OPS_PAYLOAD_INVALID")
        except EventConflict:
            return reject(409, "OPS_EVENT_ORDER_CONFLICT")
        except (InboxFull, sqlite3.Error, OSError):
            return reject(503, "OPS_INBOX_UNAVAILABLE")
        # This response confirms a durable receipt, never Telegram delivery.
        return JSONResponse(status_code=202 if outcome == "accepted" else 200,
            content={"status": outcome, "receipt_id": receipt["receipt_id"],
                     "delivery_status": receipt["status"]})

    return router
