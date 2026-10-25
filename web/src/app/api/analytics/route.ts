import { appendFile, mkdir } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isAnalyticsEventName } from "@/lib/analytics";

export const runtime = "nodejs";

type Body = {
  name?: string;
  market?: string;
  path?: string;
};

export async function POST(request: Request) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ success: false }, { status: 400 });
  }

  const name = String(body.name ?? "");
  if (!isAnalyticsEventName(name)) {
    return NextResponse.json({ success: false, error: "unknown_event" }, { status: 400 });
  }

  const market =
    body.market === "no" || body.market === "pl" ? body.market : undefined;
  const pagePath = String(body.path ?? "").slice(0, 120);

  // Server log only — no PII, no document metadata
  console.info("[rada-pism/analytics]", {
    name,
    market: market ?? null,
    path: pagePath || null,
    at: new Date().toISOString(),
  });

  // Optional local append for pilot dashboards (gitignored via data/)
  if (process.env.NODE_ENV !== "production" || process.env.ANALYTICS_FILE_LOG === "1") {
    try {
      const dir = path.join(process.cwd(), "data");
      await mkdir(dir, { recursive: true });
      await appendFile(
        path.join(dir, "analytics.ndjson"),
        `${JSON.stringify({ name, market, path: pagePath, at: new Date().toISOString() })}\n`,
        "utf8",
      );
    } catch {
      /* ignore FS errors on serverless */
    }
  }

  return NextResponse.json({ success: true });
}
