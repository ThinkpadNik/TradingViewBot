import { NextResponse } from "next/server";

export const runtime = "nodejs";

type SubmitSuccess = {
  success: true;
  submissionId: string;
  message: string;
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
  const packageType = String(formData.get("packageType") ?? "").trim();
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

  if (!packageType || !ALLOWED_PACKAGES.has(packageType)) {
    return fail("Brak lub nieprawidłowy typ pakietu (packageType).");
  }

  let customAnswers: unknown = {};
  if (customAnswersRaw.trim()) {
    try {
      customAnswers = JSON.parse(customAnswersRaw);
      if (customAnswers === null || typeof customAnswers !== "object") {
        return fail("Pole customAnswers musi być obiektem JSON.");
      }
    } catch {
      return fail("Nie udało się sparsować customAnswers (oczekiwano JSON).");
    }
  }

  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  // Diagnostyka serwerowa — bez treści dokumentu / e-maila w logu
  console.info("[rada-pism/submit]", {
    market: marketRaw,
    packageType,
    fileName: fileEntry.name,
    fileSize: buffer.byteLength,
    mimeType: fileEntry.type || "unknown",
    hasPhone: Boolean(phone),
    answerKeys:
      customAnswers && typeof customAnswers === "object"
        ? Object.keys(customAnswers as Record<string, unknown>)
        : [],
  });

  const submissionId = `sub_${Date.now()}`;
  const body: SubmitSuccess = {
    success: true,
    submissionId,
    message: "Zgłoszenie przyjęte. Skontaktujemy się w sprawie weryfikacji i płatności.",
  };

  return NextResponse.json(body, { status: 200 });
}
