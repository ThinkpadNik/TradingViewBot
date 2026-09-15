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
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat


logger = logging.getLogger(__name__)
MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
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
wynikać z dostępnych poziomów strukturalnych.

WEJŚCIE:
{payload.model_dump_json()}
"""


async def generate_analysis(payload: TradingViewPayload) -> SignalAnalysis:
    response = await ai_client.aio.models.generate_content(
        model=MODEL_NAME,
        contents=make_prompt(payload),
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=SignalAnalysis,
            thinking_config=types.ThinkingConfig(thinking_level="minimal"),
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
        f"<b>Cena:</b> <code>{price(payload.close)}</code> | <b>TF:</b> <code>{html.escape(format_timeframe(payload.timeframe))}</code>\n"
        f"<b>Sygnał:</b> <code>{html.escape(payload.signal_type or 'brak')}</code> | <b>Płynność:</b> <code>{html.escape(payload.liquidity_event or 'brak')}</code>\n"
        f"<b>Wynik:</b> <code>{analysis.signal_quality_score}/100</code> | <b>Bias:</b> <code>{analysis.market_bias}</code>\n"
        f"<b>Pewność:</b> <code>{analysis.confidence}</code> | <b>Plan:</b> <code>{direction_label}</code>\n\n"
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
