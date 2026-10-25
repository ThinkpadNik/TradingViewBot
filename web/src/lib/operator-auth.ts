import { createHash, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

export const OPERATOR_COOKIE = "rada_operator_session";

function expectedPassword(): string {
  return process.env.OPERATOR_PASSWORD?.trim() || "rada-pilot";
}

export function getOperatorPasswordHint(): string {
  return process.env.OPERATOR_PASSWORD?.trim()
    ? "Hasło z OPERATOR_PASSWORD"
    : "Domyślne hasło pilotażu (ustaw OPERATOR_PASSWORD w produkcji)";
}

function sessionTokenFor(password: string): string {
  return createHash("sha256")
    .update(`rada-pism-operator:${password}`)
    .digest("hex");
}

export function expectedSessionToken(): string {
  return sessionTokenFor(expectedPassword());
}

export function verifyOperatorPassword(password: string): boolean {
  const expected = Buffer.from(expectedPassword(), "utf8");
  const provided = Buffer.from(password, "utf8");
  if (expected.length !== provided.length) {
    // still run a compare-sized hash check to avoid trivial timing leaks on length alone
    const a = Buffer.from(sessionTokenFor(password), "hex");
    const b = Buffer.from(expectedSessionToken(), "hex");
    try {
      timingSafeEqual(a, b);
    } catch {
      /* ignore */
    }
    return false;
  }
  return timingSafeEqual(expected, provided);
}

export function isValidSessionToken(token: string | undefined | null): boolean {
  if (!token) return false;
  const a = Buffer.from(token, "utf8");
  const b = Buffer.from(expectedSessionToken(), "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function isOperatorAuthenticated(): Promise<boolean> {
  const jar = await cookies();
  return isValidSessionToken(jar.get(OPERATOR_COOKIE)?.value);
}

export function operatorCookieOptions(maxAgeSeconds = 60 * 60 * 12) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: maxAgeSeconds,
  };
}
