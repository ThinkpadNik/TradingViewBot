import { NextResponse } from "next/server";
import { getPriceQuote, type PackageType } from "@/lib/pricing";
import { createSubmission, saveUploadedFile } from "@/lib/submissions";
import type { Market } from "@/lib/content";

export const runtime = "nodejs";

type SubmitSuccess = {
  success: true;
  submissionId: string;
  message: string;
  amountLabel: string;
  currency: "PLN" | "NOK";
  paymentMethods: { id: string; label: string }[];
};

type SubmitFailure = {
  success: false;
  error: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED_MARKETS = new Set(["no", "pl"]);
const ALLOWED_PACKAGES = new Set(["response", "guardian"]);

function fail(error: string, status = 400) {
  const body: SubmitFailure = { success: false, error };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return fail("Nieprawidłowe dane formularza (oczekiwano multipart/form-data).");
  }

  const marketRaw = String(formData.get("market") ?? "").trim();
  const packageTypeRaw = String(formData.get("packageType") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const customAnswersRaw = String(formData.get("customAnswers") ?? "");
  const fileEntry = formData.get("file");

  if (!marketRaw || !ALLOWED_MARKETS.has(marketRaw)) {
    return fail("Brak lub nieprawidłowy rynek (market: no | pl).");
  }

  if (!email || !EMAIL_RE.test(email)) {
    return fail("Brak lub nieprawidłowy adres e-mail.");
  }

  if (!(fileEntry instanceof File) || fileEntry.size === 0) {
    return fail("Brak pliku dokumentu.");
  }

  if (!packageTypeRaw || !ALLOWED_PACKAGES.has(packageTypeRaw)) {
    return fail("Brak lub nieprawidłowy typ pakietu (packageType).");
  }

  let customAnswers: Record<string, unknown> = {};
  if (customAnswersRaw.trim()) {
    try {
      const parsed = JSON.parse(customAnswersRaw) as unknown;
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        return fail("Pole customAnswers musi być obiektem JSON.");
      }
      customAnswers = parsed as Record<string, unknown>;
    } catch {
      return fail("Nie udało się sparsować customAnswers (oczekiwano JSON).");
    }
  }

  const market = marketRaw as Market;
  const packageType = packageTypeRaw as PackageType;
  const quote = getPriceQuote(market, packageType);
  const buffer = Buffer.from(await fileEntry.arrayBuffer());
  const mimeType = fileEntry.type || "application/octet-stream";

  const { storedFileName, filePath } = await saveUploadedFile(
    buffer,
    fileEntry.name,
    mimeType,
  );

  const submissionId = `sub_${Date.now()}`;
  const record = await createSubmission({
    id: submissionId,
    market,
    packageType,
    email,
    phone,
    customAnswers,
    originalFileName: fileEntry.name,
    storedFileName,
    filePath,
    mimeType,
    fileSize: buffer.byteLength,
    amountMajor: quote.amountMajor,
    currency: quote.currency,
  });

  console.info("[rada-pism/submit]", {
    submissionId: record.id,
    market: record.market,
    packageType: record.packageType,
    fileName: record.originalFileName,
    storedFileName: record.storedFileName,
    fileSize: record.fileSize,
    amount: quote.label,
    hasPhone: Boolean(phone),
    answerKeys: Object.keys(customAnswers),
  });

  const body: SubmitSuccess = {
    success: true,
    submissionId: record.id,
    message: "Zgłoszenie zapisane. Przejdź do płatności, aby uruchomić realizację.",
    amountLabel: quote.label,
    currency: quote.currency,
    paymentMethods: quote.paymentMethods,
  };

  return NextResponse.json(body, { status: 200 });
}
