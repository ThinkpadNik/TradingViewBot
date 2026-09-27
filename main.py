import asyncio
import html
import logging
import os
import secrets
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Annotated, Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request, status
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator


logger = logging.getLogger(__name__)
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.1-pro-preview")
# Pro supports low/medium/high, not the Flash-only minimal setting.
THINKING_LEVEL = "low"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.getenv("TELEGRAM_CHAT_ID")
WEBHOOK_SECRET = os.getenv("WEBHOOK_SECRET")


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    require_settings()
    logging.getLogger("uvicorn.error").info(
        "Gemini configured: model=%s thinking=%s", MODEL_NAME, THINKING_LEVEL
    )
    app.state.telegram_client = httpx.AsyncClient(timeout=httpx.Timeout(10.0, connect=4.0))
    yield
    await app.state.telegram_client.aclose()


app = FastAPI(title="TradingView AI Signal Engine", lifespan=lifespan)
ai_client = genai.Client(api_key=GEMINI_API_KEY)


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
event_time to otwarcie świecy, event_close_time to czas poznania zdarzenia.
open_time/close_time to czas źródłowej świecy każdego interwału, w milisekundach UTC.
Jeżeli migawka nie ma czasu lub wartości, zaznacz brak danych; nie uzupełniaj ich.
Poziomy sweepu to przybliżenie na podstawie OHLC, nie obserwacja zleceń stop.
Uwzględnij OHLCV, ATR, RVOL, CLV, głębokość sweepu i czas reclaimu z JSON.
Nie traktuj wyniku jakości 1–100 jako skalibrowanego prawdopodobieństwa sukcesu.
Nie twierdź, że masz dostęp do wykresu, świeżych cen lub niewysłanych interwałów.

WEJŚCIE:
{payload.model_dump_json(by_alias=True, exclude_none=True)}
"""


async def generate_analysis(payload: TradingViewPayload) -> SignalAnalysis:
    response = await ai_client.aio.models.generate_content(
        model=MODEL_NAME,
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


async def send_telegram_message(request: Request, text: str) -> None:
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = {"chat_id": TELEGRAM_CHAT_ID, "text": text, "parse_mode": "HTML"}
    client: httpx.AsyncClient = request.app.state.telegram_client

    for attempt in range(3):
        response = await client.post(url, json=payload)
        if response.status_code != 429 and response.status_code < 500:
            response.raise_for_status()
            return
        if attempt == 2:
            response.raise_for_status()
        retry_after = response.headers.get("Retry-After")
        delay = float(retry_after) if retry_after and retry_after.isdigit() else 2**attempt
        await asyncio.sleep(delay)


@app.post("/webhook")
async def receive_webhook(
    request: Request,
    payload: TradingViewPayload,
    secret: Annotated[Optional[str], Query()] = None,
    x_webhook_secret: Annotated[Optional[str], Header()] = None,
):
    provided_secret = x_webhook_secret or secret or payload.webhook_secret or ""
    if not WEBHOOK_SECRET or not secrets.compare_digest(provided_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook secret")

    try:
        analysis = await generate_analysis(payload)
        await send_telegram_message(request, render_telegram(payload, analysis))
    except httpx.HTTPError as exc:
        logger.exception("Telegram delivery failed for event_id=%s", payload.event_id)
        raise HTTPException(status_code=502, detail="Telegram delivery failed") from exc
    except Exception as exc:
        # Logujemy klasę i traceback błędu, ale nigdy sekret ani pełny payload.
        logger.exception("Gemini analysis failed for event_id=%s", payload.event_id)
        raise HTTPException(status_code=502, detail="Signal analysis failed") from exc

    return {"status": "success", "event_id": payload.event_id, "ticker": payload.ticker}
