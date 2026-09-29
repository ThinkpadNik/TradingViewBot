import asyncio
import html
import logging
import os
import secrets
import sqlite3
from pathlib import Path
from contextlib import asynccontextmanager, suppress
from dataclasses import dataclass
from typing import Annotated, Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator
from relay_store import RelayStore, EventConflict, QueueFull
from relay_worker import RelayWorker, DeliveryRetry, DeliveryUnknown, DeliveryRejected
from relay_health import readiness


logger = logging.getLogger(__name__)
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.1-pro-preview")
# Pro supports low/medium/high, not the Flash-only minimal setting.
THINKING_LEVEL = "low"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")
RELAY_DB_PATH = os.getenv("RELAY_DB_PATH")
RELAY_WORKER_ENABLED = os.getenv("RELAY_WORKER_ENABLED", "true").lower() == "true"


class Momentum(BaseModel):
    model_config = ConfigDict(extra="ignore")
    rsi: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)
    stoch_k: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)
    stoch_d: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)


class TrendContext(BaseModel):
    model_config = ConfigDict(extra="ignore")
    trend_bias: Optional[str] = Field(default=None, max_length=32)
    higher_timeframe: Optional[str] = Field(default=None, max_length=16)
    higher_trend_bias: Optional[str] = Field(default=None, max_length=32)
    higher_ema50: Optional[FiniteFloat] = Field(default=None, gt=0)
    higher_ema200: Optional[FiniteFloat] = Field(default=None, gt=0)
    ema50: Optional[FiniteFloat] = Field(default=None, gt=0)
    ema200: Optional[FiniteFloat] = Field(default=None, gt=0)
    atr: Optional[FiniteFloat] = Field(default=None, gt=0)
    relative_volume: Optional[FiniteFloat] = Field(default=None, ge=0)


class LiquidityLevels(BaseModel):
    model_config = ConfigDict(extra="ignore")
    swing_high_pool: Optional[FiniteFloat] = Field(default=None, gt=0)
    swing_low_pool: Optional[FiniteFloat] = Field(default=None, gt=0)
    htf_prev_high: Optional[FiniteFloat] = Field(default=None, gt=0)
    htf_prev_low: Optional[FiniteFloat] = Field(default=None, gt=0)


class OscillatorSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    rsi14: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)
    rsi100: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)
    stoch_k: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)
    stoch_d: Optional[FiniteFloat] = Field(default=None, ge=0, le=100)


class ClosedSnapshot(OscillatorSnapshot):
    # Epoch milliseconds. Null means unavailable, never a fabricated zero.
    open_time: Optional[int] = Field(default=None, ge=0)
    close_time: Optional[int] = Field(default=None, ge=0)

    @model_validator(mode="after")
    def validate_clock(self):
        if (self.open_time is None) != (self.close_time is None):
            raise ValueError("Snapshot needs both timestamps or neither")
        if self.close_time is not None and self.close_time <= self.open_time:
            raise ValueError("Snapshot close must follow open")
        if self.close_time is None and any(
            getattr(self, key) is not None for key in ("rsi14", "rsi100", "stoch_k", "stoch_d")
        ):
            raise ValueError("Snapshot values require timestamps")
        return self


class MTFContext(BaseModel):
    model_config = ConfigDict(extra="forbid")
    h1: ClosedSnapshot
    h2: ClosedSnapshot
    h4: ClosedSnapshot
    h12: ClosedSnapshot
    d1: ClosedSnapshot
    w1: ClosedSnapshot


class EventOHLCV(BaseModel):
    model_config = ConfigDict(extra="forbid")
    open: FiniteFloat = Field(gt=0)
    high: FiniteFloat = Field(gt=0)
    low: FiniteFloat = Field(gt=0)
    close: FiniteFloat = Field(gt=0)
    volume: Optional[FiniteFloat] = Field(default=None, ge=0)
    atr14: Optional[FiniteFloat] = Field(default=None, ge=0)
    rvol20: Optional[FiniteFloat] = Field(default=None, ge=0)
    clv: Optional[FiniteFloat] = Field(default=None, ge=0, le=1)

    @model_validator(mode="after")
    def validate_range(self):
        if self.low > min(self.open, self.close) or self.high < max(self.open, self.close):
            raise ValueError("OHLC prices are outside the candle range")
        return self


class StructuralScenario(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["BULLISH_RECLAIM", "BEARISH_RECLAIM"]
    pool: FiniteFloat = Field(gt=0)
    invalidation: FiniteFloat = Field(gt=0)
    sweep_depth_atr: Optional[FiniteFloat] = Field(default=None, ge=0)
    reclaim_bars: int = Field(ge=1, le=5)
    divergence: str = Field(max_length=64)
    stoch_state: str = Field(max_length=64)
    warning: str = Field(max_length=100)


class TradingViewPayload(BaseModel):
    """Strict contract for the JSON produced by the Pine Script alert."""

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True, populate_by_name=True)
    webhook_secret: Optional[str] = Field(default=None, alias="secret", exclude=True, min_length=1, max_length=200)
    event_id: Optional[str] = Field(default=None, min_length=1, max_length=160)
    bar_time: Optional[int] = Field(default=None, ge=0)
    ticker: str = Field(default="UNKNOWN", min_length=1, max_length=80)
    timeframe: str = Field(default="UNKNOWN", min_length=1, max_length=16)
    close: Optional[FiniteFloat] = Field(default=None, gt=0)
    signal_type: Optional[str] = Field(default=None, max_length=64)
    liquidity_event: Optional[str] = Field(default=None, max_length=64)
    momentum: Momentum = Field(default_factory=Momentum)
    trend_context: TrendContext = Field(default_factory=TrendContext)
    liquidity_levels: LiquidityLevels = Field(default_factory=LiquidityLevels)
    payload_schema: Optional[Literal["nikosolution_analyst_v2"]] = Field(default=None, alias="schema")
    script_version: Optional[str] = Field(default=None, max_length=24)
    event_time: Optional[int] = Field(default=None, ge=0)
    event_close_time: Optional[int] = Field(default=None, ge=0)
    chart_timeframe: Optional[str] = Field(default=None, max_length=16)
    mode: Optional[str] = Field(default=None, max_length=64)
    ohlcv: Optional[EventOHLCV] = None
    oscillators: Optional[OscillatorSnapshot] = None
    scenario: Optional[StructuralScenario] = None
    mtf: Optional[MTFContext] = None

    @model_validator(mode="after")
    def validate_mtf_contract(self):
        if self.payload_schema is None:
            if any(x is not None for x in (self.mtf, self.ohlcv, self.scenario)):
                raise ValueError("Extended payload requires a versioned schema")
            return self  # Preserve existing legacy alerts.
        required = (self.event_id, self.bar_time, self.event_time, self.event_close_time,
                    self.close, self.mtf, self.ohlcv, self.scenario, self.oscillators)
        if any(x is None for x in required):
            raise ValueError("Incomplete analyst v2 payload")
        if self.bar_time != self.event_time or self.event_close_time <= self.event_time:
            raise ValueError("Inconsistent event timestamps")
        if self.close != self.ohlcv.close or self.signal_type != self.scenario.type:
            raise ValueError("Legacy and extended event fields disagree")
        for name in type(self.mtf).model_fields:
            snapshot = getattr(self.mtf, name)
            if snapshot.close_time is not None and snapshot.close_time > self.event_close_time:
                raise ValueError("MTF snapshot contains future data")
        return self


class SignalAnalysis(BaseModel):
    """The only Gemini response shape accepted by the application."""

    market_bias: Literal["long_watchlist", "short_watchlist", "neutral", "avoid"]
    signal_quality_score: int = Field(ge=1, le=100)
    confidence: Literal["low", "medium", "high"]
    invalidation_sl: Optional[FiniteFloat] = Field(default=None, ge=0)
    targets: list[FiniteFloat] = Field(default_factory=list, max_length=2)
    key_warnings: list[str] = Field(default_factory=list, max_length=4)
    reasoning: str = Field(min_length=1, max_length=700)


@dataclass(frozen=True)
class TradePlan:
    """Deterministic trade math. Gemini never supplies the final R:R shown to users."""

    direction: Optional[Literal["long", "short"]]
    entry: Optional[float]
    invalidation_sl: Optional[float]
    targets: tuple[float, ...]
    risk: Optional[float]
    risk_rewards: tuple[float, ...]
    warnings: tuple[str, ...]


def require_settings() -> None:
    missing = [
        name
        for name, value in {
            "GEMINI_API_KEY": GEMINI_API_KEY,
            "TELEGRAM_BOT_TOKEN": TELEGRAM_BOT_TOKEN,
            "TELEGRAM_CHAT_ID": TELEGRAM_CHAT_ID,
            "WEBHOOK_SECRET": WEBHOOK_SECRET,
        }.items()
        if not value
    ]
    if missing:
        raise RuntimeError("Missing required environment variables: " + ", ".join(missing))
    if not RELAY_DB_PATH or not Path(RELAY_DB_PATH).is_absolute():
        raise RuntimeError("RELAY_DB_PATH must be an absolute path on persistent storage")
    if os.getenv("RENDER"):
        mount = Path(os.getenv("RELAY_DURABLE_DIR", "/var/data"))
        if not os.path.ismount(mount) or not Path(RELAY_DB_PATH).resolve().is_relative_to(mount.resolve()):
            raise RuntimeError("Relay requires a mounted persistent disk, not Render ephemeral storage")


@asynccontextmanager
async def lifespan(app: FastAPI):
    require_settings()
    logging.getLogger("uvicorn.error").info(
        "Gemini configured: model=%s thinking=%s", MODEL_NAME, THINKING_LEVEL
    )
    app.state.telegram_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0))
    app.state.relay_store = RelayStore(RELAY_DB_PATH)

    async def analyze_job(data, model):
        payload = TradingViewPayload.model_validate(data)
        analysis = await generate_analysis(payload, model=model)
        return analysis.model_dump(), render_telegram(payload, analysis)

    async def deliver_job(text):
        return await post_telegram(app.state.telegram_client, text)

    app.state.relay_worker = RelayWorker(app.state.relay_store, analyze_job, deliver_job)
    task = asyncio.create_task(app.state.relay_worker.run()) if RELAY_WORKER_ENABLED else None
    try:
        yield
    finally:
        if task:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task
        await app.state.telegram_client.aclose()


app = FastAPI(title="TradingView AI Signal Engine", lifespan=lifespan)
ai_client = genai.Client(api_key=GEMINI_API_KEY)


@app.exception_handler(RequestValidationError)
async def invalid_request(request, exc):
    # FastAPI's default error body can echo invalid secret values or input bodies.
    return JSONResponse(status_code=422, content={"detail": "Invalid payload",
        "errors": [{"loc": list(e["loc"]), "type": e["type"]} for e in exc.errors()]})


def make_prompt(payload: TradingViewPayload) -> str:
    return f"""Przeanalizuj wyłącznie poniższe dane techniczne w JSON.
Nie wymyślaj poziomów ani danych, których nie ma w wejściu. To narzędzie analityczne,
nie rekomendacja inwestycyjna. Jeżeli setup nie ma potwierdzenia, ustaw bias na avoid
lub neutral i opisz ryzyko. Invalidation musi wynikać ze swingów lub ATR; TP muszą
wynikać z dostępnych poziomów strukturalnych. "higher_trend_bias" opisuje trend
nadrzędny, a "trend_bias" trend interwału wejściowego; podaj ostrzeżenie, jeżeli
którykolwiek z nich nie wspiera sygnału.

Dla schema=nikosolution_analyst_v2 analizuj jawnie mtf.h1, h2, h4, h12, d1 i w1.
To migawki ostatnich dostępnych zamkniętych świec, a nie historia ich przebiegu.
Porównaj RSI14 do RSI100 oraz Stoch K/D pomiędzy interwałami; opisz zgodność,
konflikty i brakujące dane. Nie wnioskuj o kierunku zmian, przecięciu ani dywergencji
z pojedynczej migawki. Pole scenario.divergence dotyczy tylko interwału zdarzenia;
RSI jest próbkowane na potwierdzonych pivotach ceny, nie ma osobnych pivotów RSI.
event_time to otwarcie świecy, event_close_time to planowany czas jej zamknięcia.
Nie utożsamiaj event_close_time z czasem wykonania skryptu lub dostarczenia wiadomości.
open_time/close_time to czas źródłowej świecy każdego interwału, w milisekundach UTC.
Jeżeli migawka nie ma czasu lub wartości, zaznacz brak danych; nie uzupełniaj ich.
Poziomy sweepu to przybliżenie na podstawie OHLC, nie obserwacja zleceń stop.
Uwzględnij OHLCV, ATR, RVOL, CLV, głębokość sweepu i czas reclaimu z JSON.
Nie traktuj wyniku jakości 1–100 jako skalibrowanego prawdopodobieństwa sukcesu.
Nie twierdź, że masz dostęp do wykresu, świeżych cen lub niewysłanych interwałów.

WEJŚCIE:
{payload.model_dump_json(by_alias=True, exclude_none=True)}
"""


async def generate_analysis(payload: TradingViewPayload, *, model=None) -> SignalAnalysis:
    response = await ai_client.aio.models.generate_content(
        model=model or MODEL_NAME,
        contents=make_prompt(payload),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SignalAnalysis,
            thinking_config=types.ThinkingConfig(thinking_level=THINKING_LEVEL),
            max_output_tokens=1024,
        ),
    )
    if not response.text:
        raise RuntimeError("Gemini returned an empty response")
    return SignalAnalysis.model_validate_json(response.text)


def price(value: Optional[float]) -> str:
    return "brak" if value is None else f"{value:g}"


def format_timeframe(value: str) -> str:
    """Render TradingView interval codes in a human-readable form."""
    interval = str(value).strip().upper()
    named = {"D": "1D", "W": "1W", "M": "1M"}
    if interval in named:
        return named[interval]
    if not interval.isdigit():
        return interval

    minutes = int(interval)
    if minutes >= 60 and minutes % 60 == 0:
        return f"{minutes // 60}H"
    return f"{minutes}m"


def infer_direction(payload: TradingViewPayload, analysis: SignalAnalysis) -> Optional[Literal["long", "short"]]:
    signal = (payload.signal_type or "").upper()
    if "BULLISH" in signal or "LONG" in signal:
        return "long"
    if "BEARISH" in signal or "SHORT" in signal:
        return "short"
    if analysis.market_bias == "long_watchlist":
        return "long"
    if analysis.market_bias == "short_watchlist":
        return "short"
    return None


def calculate_trade_plan(payload: TradingViewPayload, analysis: SignalAnalysis) -> TradePlan:
    """Validate direction and calculate all risk metrics from raw levels in Python."""
    entry = float(payload.close) if payload.close is not None else None
    direction = infer_direction(payload, analysis)
    warnings: list[str] = []

    if entry is None or entry <= 0:
        return TradePlan(direction, entry, None, (), None, (), ("Brak poprawnej ceny wejścia.",))
    if direction is None:
        return TradePlan(None, entry, None, (), None, (), ("Nie można jednoznacznie określić kierunku setupu.",))

    sl = float(analysis.invalidation_sl) if analysis.invalidation_sl is not None else None
    if sl is None:
        return TradePlan(direction, entry, None, (), None, (), ("Brak poziomu unieważnienia — plan odrzucony.",))

    if (direction == "long" and sl >= entry) or (direction == "short" and sl <= entry):
        return TradePlan(
            direction,
            entry,
            sl,
            (),
            None,
            (),
            ("SL ma nieprawidłowy kierunek względem ceny wejścia — plan odrzucony.",),
        )

    risk = abs(entry - sl)
    if risk <= max(entry * 1e-10, 1e-8):
        return TradePlan(direction, entry, sl, (), None, (), ("Odległość do SL jest zbyt mała — plan odrzucony.",))

    raw_targets = [float(target) for target in analysis.targets]
    if direction == "long":
        valid_targets = sorted({target for target in raw_targets if target > entry})[:2]
    else:
        valid_targets = sorted({target for target in raw_targets if target < entry}, reverse=True)[:2]

    if len(valid_targets) != len(raw_targets):
        warnings.append("Odrzucono TP po niewłaściwej stronie ceny wejścia.")
    if not valid_targets:
        warnings.append("Brak poprawnych TP — pokazano wyłącznie SL i ryzyko.")

    risk_rewards = tuple(abs(target - entry) / risk for target in valid_targets)
    return TradePlan(direction, entry, sl, tuple(valid_targets), risk, risk_rewards, tuple(warnings))


def render_telegram(payload: TradingViewPayload, analysis: SignalAnalysis) -> str:
    plan = calculate_trade_plan(payload, analysis)
    tp_lines = "\n".join(
        f"<b>TP{index}:</b> <code>{price(target)}</code> | <b>R:R:</b> <code>{ratio:.2f}</code>"
        for index, (target, ratio) in enumerate(zip(plan.targets, plan.risk_rewards), start=1)
    ) or "<b>TP:</b> <code>brak poprawnego celu</code>"
    plan_warnings = [*analysis.key_warnings, *plan.warnings]
    warnings = "\n".join(f"• {html.escape(item)}" for item in plan_warnings) or "• Brak"
    direction_label = {"long": "LONG", "short": "SHORT"}.get(plan.direction, "BRAK")
    return (
        f"🚨 <b>SYGNAŁ SMC I MOMENTUM {html.escape(payload.ticker)}</b>\n\n"
        f"<b>ID zdarzenia:</b> <code>{html.escape(payload.event_id or 'brak')}</code>\n"
        f"<b>Cena:</b> <code>{price(payload.close)}</code> | <b>TF:</b> <code>{html.escape(format_timeframe(payload.timeframe))}</code>\n"
        f"<b>Sygnał:</b> <code>{html.escape(payload.signal_type or 'brak')}</code> | <b>Płynność:</b> <code>{html.escape(payload.liquidity_event or 'brak')}</code>\n"
        f"<b>Wynik:</b> <code>{analysis.signal_quality_score}/100</code> | <b>Bias:</b> <code>{analysis.market_bias}</code>\n"
        f"<b>Pewność:</b> <code>{analysis.confidence}</code> | <b>Plan:</b> <code>{direction_label}</code>\n\n"
        f"<b>Trend nadrzędny:</b> <code>{html.escape(payload.trend_context.higher_trend_bias or 'brak')}</code>"
        f" | <b>TF trendu:</b> <code>{html.escape(format_timeframe(payload.trend_context.higher_timeframe or 'brak'))}</code>\n\n"
        f"<b>Invalidation SL:</b> <code>{price(plan.invalidation_sl)}</code>\n"
        f"<b>Ryzyko do SL:</b> <code>{price(plan.risk)}</code>\n"
        f"{tp_lines}\n\n"
        f"<b>Uzasadnienie</b>\n{html.escape(analysis.reasoning)}\n\n"
        f"<b>Ryzyka</b>\n{warnings}"
    )


async def post_telegram(client: httpx.AsyncClient, text: str) -> int:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"}
    try:
        response = await client.post(url, json=payload)
    except (httpx.ConnectError, httpx.ConnectTimeout, httpx.PoolTimeout):
        raise DeliveryRetry("TELEGRAM_NOT_CONNECTED", 30) from None
    except httpx.HTTPError:
        raise DeliveryUnknown("request may have reached Telegram") from None
    try:
        data = response.json()
    except ValueError:
        raise DeliveryUnknown("invalid confirmation") from None
    if not isinstance(data, dict):
        raise DeliveryUnknown("invalid confirmation")
    if response.status_code == 429 and data.get("ok") is False:
        delay = (data.get("parameters") or {}).get("retry_after", 30)
        try:
            delay = float(delay)
        except (TypeError, ValueError):
            delay = 30
        raise DeliveryRetry("TELEGRAM_RATE_LIMIT", delay)
    if 400 <= response.status_code < 500 and data.get("ok") is False:
        raise DeliveryRejected("explicit API rejection")
    message_id = (data.get("result") or {}).get("message_id") if isinstance(data.get("result"), dict) else None
    if response.status_code != 200 or data.get("ok") is not True or type(message_id) is not int or message_id <= 0:
        raise DeliveryUnknown("missing positive confirmation")
    return message_id


async def send_telegram_message(request: Request, text: str) -> int:
    return await post_telegram(request.app.state.telegram_client, text)


@app.post("/webhook")
async def receive_webhook(
    request: Request,
    payload: TradingViewPayload,
    x_webhook_secret: Annotated[Optional[str], Header()] = None,
):
    # URLs can reach proxy/access logs before application code runs.
    # Existing Pine body authentication and header authentication stay supported.
    if "secret" in request.query_params:
        raise HTTPException(status_code=400, detail="Use body or header authentication, not URL credentials")
    provided_secret = x_webhook_secret or payload.webhook_secret or ""
    if not WEBHOOK_SECRET or not secrets.compare_digest(provided_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook secret")

    try:
        job, inserted = await asyncio.to_thread(request.app.state.relay_store.enqueue,
            payload.model_dump(by_alias=True, exclude_none=True), MODEL_NAME)
    except EventConflict:
        raise HTTPException(status_code=409, detail="Event ID content conflict") from None
    except (QueueFull, sqlite3.Error, OSError):
        raise HTTPException(status_code=503, detail="Durable inbox unavailable") from None
    # This confirms committed receipt, NOT successful analysis or delivery.
    return {"status": "accepted" if inserted else "duplicate", "event_id": job["event_id"],
            "ticker": payload.ticker, "receipt_id": job["event_key"]}


@app.get("/healthz")
async def healthz():
    return {"status": "running", "relay_version": "durable-v1"}


@app.get("/readyz")
async def readyz(request: Request):
    # Monitor this separately; do not use unresolved incidents as a restart loop.
    try:
        store = request.app.state.relay_store
        worker = request.app.state.relay_worker
        summary = await asyncio.to_thread(store.status)
        result = readiness(summary, enabled=RELAY_WORKER_ENABLED,
                           worker_error=worker.last_error,
                           last_heartbeat=worker.last_heartbeat, now=store.clock())
    except (sqlite3.Error, OSError):
        result = {"status": "attention_required", "reasons": ["STORAGE_UNAVAILABLE"]}
    return JSONResponse(status_code=200 if result["status"] == "ready" else 503, content=result)


@app.get("/relay/status")
async def relay_status(request: Request, x_webhook_secret: Annotated[Optional[str], Header()] = None):
    if not WEBHOOK_SECRET or not secrets.compare_digest(x_webhook_secret or "", WEBHOOK_SECRET):
        raise HTTPException(status_code=403, detail="Forbidden")
    summary = await asyncio.to_thread(request.app.state.relay_store.status)
    return {**summary, "worker_enabled": RELAY_WORKER_ENABLED,
            "worker_error": request.app.state.relay_worker.last_error}
