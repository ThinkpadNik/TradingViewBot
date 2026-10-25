import { NextResponse } from "next/server";
import { OPERATOR_COOKIE, operatorCookieOptions } from "@/lib/operator-auth";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ success: true });
  res.cookies.set(OPERATOR_COOKIE, "", { ...operatorCookieOptions(0), maxAge: 0 });
  return res;
}
