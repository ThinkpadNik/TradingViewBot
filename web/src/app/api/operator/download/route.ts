import { createReadStream } from "fs";
import { access, constants, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { Readable } from "stream";
import { isOperatorAuthenticated } from "@/lib/operator-auth";
import { getSubmission, getUploadsDir } from "@/lib/submissions";

export const runtime = "nodejs";

function fail(error: string, status: number) {
  return NextResponse.json({ success: false, error }, { status });
}

function isPathInsideUploads(filePath: string): boolean {
  const uploads = path.resolve(getUploadsDir());
  const resolved = path.resolve(filePath);
  return resolved === uploads || resolved.startsWith(uploads + path.sep);
}

export async function GET(request: Request) {
  if (!(await isOperatorAuthenticated())) {
    return fail("Brak autoryzacji operatora.", 401);
  }

  const { searchParams } = new URL(request.url);
  const submissionId = searchParams.get("submissionId")?.trim();

  if (!submissionId) {
    return fail("Podaj submissionId.", 400);
  }

  const submission = await getSubmission(submissionId);
  if (!submission) {
    return fail("Nie znaleziono zgłoszenia.", 404);
  }

  if (!isPathInsideUploads(submission.filePath)) {
    return fail("Nieprawidłowa ścieżka pliku.", 400);
  }

  try {
    await access(submission.filePath, constants.R_OK);
  } catch {
    return fail("Plik nie istnieje na dysku.", 404);
  }

  const fileStat = await stat(submission.filePath);
  const nodeStream = createReadStream(submission.filePath);
  const webStream = Readable.toWeb(nodeStream) as unknown as ReadableStream;

  const dispositionName = submission.originalFileName.replace(/"/g, "");
  const inline =
    searchParams.get("inline") === "1" &&
    (submission.mimeType.startsWith("image/") ||
      submission.mimeType === "application/pdf");

  return new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": submission.mimeType || "application/octet-stream",
      "Content-Length": String(fileStat.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${dispositionName}"`,
      "Cache-Control": "private, no-store",
      "X-Submission-Id": submission.id,
    },
  });
}
