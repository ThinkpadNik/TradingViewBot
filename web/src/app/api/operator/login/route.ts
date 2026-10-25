import { NextResponse } from "next/server";
import {
  expectedSessionToken,
  operatorCookieOptions,
  OPERATOR_COOKIE,
  verifyOperatorPassword,
} from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let password = "";
  try {
    const body = (await request.json()) as { password?: string };
    password = String(body.password ?? "");
  } catch {
    return NextResponse.json(
      { success: false, error: "Oczekiwano JSON z polem password." },
      { status: 400 },
    );
  }

  if (!verifyOperatorPassword(password)) {
    return NextResponse.json(
      { success: false, error: "Nieprawidłowe hasło operatora." },
      { status: 401 },
    );
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(OPERATOR_COOKIE, expectedSessionToken(), operatorCookieOptions());
  return res;
}
