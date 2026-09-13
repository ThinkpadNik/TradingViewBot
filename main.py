import os
import httpx
from fastapi import FastAPI, Request
from google import genai

app = FastAPI(title="TradingView AI Signal Engine")

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

ai_client = genai.Client(api_key=GEMINI_API_KEY)

async def send_telegram_message(text: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient(timeout=10.0) as client:
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "Markdown"
        }
        res = await client.post(url, json=payload)
        print(f"Telegram status: {res.status_code}")

@app.post("/webhook")
async def receive_webhook(request: Request):
    data = await request.json()
    print("Odebrano rozszerzony payload:", data)

    # 1. Rozpakowanie danych z Pine Script
    ticker = data.get("ticker", "Nieznany")
    timeframe = data.get("timeframe", "1h")
    close = data.get("close", 0.0)
    signal_type = data.get("signal_type", "BRAK")
    liquidity_event = data.get("liquidity_event", "NONE")

    momentum = data.get("momentum", {})
    rsi = momentum.get("rsi", "N/A")
    stoch_k = momentum.get("stoch_k", "N/A")
    stoch_d = momentum.get("stoch_d", "N/A")

    trend = data.get("trend_context", {})
    trend_bias = trend.get("trend_bias", "N/A")
    ema50 = trend.get("ema50", "N/A")
    ema200 = trend.get("ema200", "N/A")
    atr = trend.get("atr", "N/A")
    rvol = trend.get("relative_volume", "N/A")

    levels = data.get("liquidity_levels", {})
    swing_high = levels.get("swing_high_pool", "N/A")
    swing_low = levels.get("swing_low_pool", "N/A")
    htf_high = levels.get("htf_prev_high", "N/A")
    htf_low = levels.get("htf_prev_low", "N/A")

    # 2. Skonstruowanie promptu dla Gemini (Rola Trader Instytucjonalny / SMC)
    prompt = f"""
Jesteś starszym analitykiem technicznym i traderem instytucjonalnym bazującym na Smart Money Concepts (SMC), strukturze rynku oraz momentum.
Przeanalizuj poniższy pakiet danych telemetrycznych z algorytmu transakcyjnego:

INSTRUMENT I KONTEKST:
- Ticker: {ticker} (TF: {timeframe})
- Aktualna cena zamknięcia: {close}
- Typ sygnału wyzwolonego: {signal_type}
- Zdarzenie płynnościowe: {liquidity_event}

WSKAŹNIKI I ZMIENNOŚĆ:
- RSI: {rsi} | Stoch RSI %K: {stoch_k}, %D: {stoch_d}
- Trend Bias (EMA50 vs EMA200): {trend_bias} (EMA50: {ema50}, EMA200: {ema200})
- Zmienność (ATR): {atr} | Wolumen względny (RVOL): {rvol}

POZIOMY STRUKTURALNE I PŁYNNOŚĆ (LP PRO 8 & HTF):
- Basen płynności powyżej (Swing High): {swing_high}
- Basen płynności poniżej (Swing Low): {swing_low}
- Poprzedni szczyt wyższego interwału (HTF High): {htf_high}
- Poprzedni dołek wyższego interwału (HTF Low): {htf_low}

Zadanie:
Przygotuj precyzyjną, syntetyczną analizę w 3 sekcjach:
1. Ocena Jakości Sygnału: Interpretacja zgarnięcia płynności (Sweep) oraz potwierdzenia na Stoch RSI i RVOL.
2. Zgodność z Trendem: Czy setup jest zgodny z kierunkiem na wyższym TF, czy to próba łapania noża / kontrtrend?
3. Plan Transakcyjny: Konkretny poziom unieważnienia scenariusza (Invalidation/SL bazujący na ATR lub zbadanym swingu) oraz 2 realistyczne cele (Take Profit) oparte na strukturze.

Formatuj przejrzyście, używając punktów i pogrubień. Nie lej wody.
"""

    # 3. Wywołanie modelu Gemini
    response = ai_client.models.generate_content(
        model="gemini-3.6-flash",
        contents=prompt
    )
    analysis = response.text

    # 4. Formatowanie wiadomości Telegram
    telegram_message = (
        f"🚨 *SYGNAŁ SMC & MOMENTUM: {ticker}* 🚨\n\n"
        f"📊 *Cena:* `{close}` | *TF:* `{timeframe}`\n"
        f"🎯 *Kierunek:* `{signal_type}`\n"
        f"💧 *Płynność:* `{liquidity_event}`\n"
        f"📈 *RVOL:* `{rvol}` | *ATR:* `{atr}`\n\n"
        f"{analysis}"
    )

    await send_telegram_message(telegram_message)
    return {"status": "success", "ticker": ticker, "signal": signal_type}
