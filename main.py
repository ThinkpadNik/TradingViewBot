import os
from fastapi import FastAPI, Request, HTTPException
from google import genai
import httpx

app = FastAPI()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY")
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID")

client = genai.Client(api_key=GEMINI_API_KEY)

async def send_telegram_message(text: str):
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    async with httpx.AsyncClient() as http_client:
        payload = {
            "chat_id": TELEGRAM_CHAT_ID,
            "text": text,
            "parse_mode": "Markdown"
        }
        await http_client.post(url, json=payload)

@app.get("/")
def health_check():
    return {"status": "ok", "message": "Serwer TradingView AI dziala!"}

@app.post("/webhook")
async def receive_webhook(request: Request):
    try:
        data = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Nieprawidlowy format JSON")

    ticker = data.get("ticker", "UNKNOWN")
    price = data.get("close", "N/A")
    rsi = data.get("rsi", "N/A")
    tf = data.get("timeframe", "N/A")
    condition = data.get("condition", "Alert")

    prompt = f"""
Jesteś doświadczonym analitykiem technicznym kryptowalut i rynku finansowego.
Otrzymałeś właśnie alert z TradingView:

- **Aktywum:** {ticker}
- **Interwał (Timeframe):** {tf}
- **Cena zamknięcia:** {price}
- **Wskaźnik RSI:** {rsi}
- **Warunek alertu:** {condition}

Zrób błyskawiczną analizę (max 3-4 punkty w punktach):
1. Ocena wskaźnika RSI (wykupienie/wyprzedanie/neutralnie).
2. Krótka interpretacja sygnału w kontekście struktury rynkowej.
3. Sugestia dla tradera (np. poszukaj potwierdzenia na wyższym TF, uważaj na pułapkę).

Pisz zwięźle, konkretnie, profesjonalnie.
"""

    try:
        # Zmieniono model na gemini-1.5-flash
        response = client.models.generate_content(
            model='gemini-1.5-flash',
            contents=prompt,
        )
        ai_analysis = response.text
    except Exception as e:
        ai_analysis = f"Błąd podczas generowania analizy przez AI: {str(e)}"

    telegram_msg = (
        f"🚨 **ALERT TRADINGVIEW: {ticker}** 🚨\n\n"
        f"📊 **Cena:** `{price}` | **RSI:** `{rsi}` | **TF:** `{tf}`\n"
        f"🔔 **Sygnał:** {condition}\n\n"
        f"🤖 **ANALIZA AI:**\n{ai_analysis}"
    )

    await send_telegram_message(telegram_msg)

    return {"status": "success", "analysis": ai_analysis}    rsi = data.get("rsi", "N/A")
    tf = data.get("timeframe", "N/A")
    condition = data.get("condition", "Alert")

    prompt = f"""
Jesteś doświadczonym analitykiem technicznym kryptowalut i rynku finansowego.
Otrzymałeś właśnie alert z TradingView:

- **Aktywum:** {ticker}
- **Interwał (Timeframe):** {tf}
- **Cena zamknięcia:** {price}
- **Wskaźnik RSI:** {rsi}
- **Warunek alertu:** {condition}

Zrób błyskawiczną analizę (max 3-4 punkty w punktach):
1. Ocena wskaźnika RSI (wykupienie/wyprzedanie/neutralnie).
2. Krótka interpretacja sygnału w kontekście struktury rynkowej.
3. Sugestia dla tradera (np. poszukaj potwierdzenia na wyższym TF, uważaj na pułapkę).

Pisz zwięźle, konkretnie, profesjonalnie.
"""

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
        )
        ai_analysis = response.text
    except Exception as e:
        ai_analysis = f"Błąd podczas generowania analizy przez AI: {str(e)}"

    telegram_msg = (
        f"🚨 **ALERT TRADINGVIEW: {ticker}** 🚨\n\n"
        f"📊 **Cena:** `{price}` | **RSI:** `{rsi}` | **TF:** `{tf}`\n"
        f"🔔 **Sygnał:** {condition}\n\n"
        f"🤖 **ANALIZA AI:**\n{ai_analysis}"
    )

    await send_telegram_message(telegram_msg)

    return {"status": "success", "analysis": ai_analysis}
