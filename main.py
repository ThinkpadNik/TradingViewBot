import asyncio
import html
import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, Literal, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException, Query, Request, status
from google import genai
from google.genai import types
from pydantic import BaseModel, ConfigDict, Field, FiniteFloat


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

    model_config = ConfigDict(extra="ignore", str_strip_whitespace=True)
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
    invalidation_sl: Optional[FiniteFloat] = Field(default=None, gt=0)
    targets: list[FiniteFloat] = Field(default_factory=list, max_length=2)
    risk_reward: Optional[FiniteFloat] = Field(default=None, ge=0)
    key_warnings: list[str] = Field(default_factory=list, max_length=4)
    reasoning: str = Field(min_length=1, max_length=700)


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
            temperature=0.2,
            max_output_tokens=500,
        ),
    )
    if not response.text:
        raise RuntimeError("Gemini returned an empty response")
    return SignalAnalysis.model_validate_json(response.text)


def price(value: Optional[float]) -> str:
    return "brak" if value is None else f"{value:g}"


def render_telegram(payload: TradingViewPayload, analysis: SignalAnalysis) -> str:
    targets = ", ".join(price(value) for value in analysis.targets) or "brak"
    warnings = "\n".join(f"• {html.escape(item)}" for item in analysis.key_warnings) or "• Brak"
    return (
        f"🚨 <b>SYGNAŁ SMC I MOMENTUM {html.escape(payload.ticker)}</b>\n\n"
        f"<b>Cena:</b> <code>{price(payload.close)}</code> | <b>TF:</b> <code>{html.escape(payload.timeframe)}</code>\n"
        f"<b>Sygnał:</b> <code>{payload.signal_type}</code> | <b>Płynność:</b> <code>{payload.liquidity_event}</code>\n"
        f"<b>Wynik:</b> <code>{analysis.signal_quality_score}/100</code> | <b>Bias:</b> <code>{analysis.market_bias}</code>\n"
        f"<b>Pewność:</b> <code>{analysis.confidence}</code>\n\n"
        f"<b>Invalidation SL:</b> <code>{price(analysis.invalidation_sl)}</code>\n"
        f"<b>TP:</b> <code>{targets}</code> | <b>R R:</b> <code>{price(analysis.risk_reward)}</code>\n\n"
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

@app.get("/health")
async def health_check():
    return {"status": "ok"}
    
@app.post("/webhook")
async def receive_webhook(
    request: Request,
    payload: TradingViewPayload,
    secret: Annotated[Optional[str], Query()] = None,
    x_webhook_secret: Annotated[Optional[str], Header()] = None,
):
    provided_secret = x_webhook_secret or secret or ""
    if not WEBHOOK_SECRET or not secrets.compare_digest(provided_secret, WEBHOOK_SECRET):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid webhook secret")

    try:
        analysis = await generate_analysis(payload)
        await send_telegram_message(request, render_telegram(payload, analysis))
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Telegram delivery failed") from exc
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Signal analysis failed") from exc

    return {"status": "success", "event_id": payload.event_id, "ticker": payload.ticker}
