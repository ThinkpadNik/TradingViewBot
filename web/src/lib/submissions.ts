import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import type { Market } from "@/lib/content";
import type { PackageType } from "@/lib/pricing";

export type PaymentStatus =
  | "pending"
  | "checkout_created"
  | "paid"
  | "mock_paid";

export type SubmissionRecord = {
  id: string;
  market: Market;
  packageType: PackageType;
  email: string;
  phone: string;
  customAnswers: Record<string, unknown>;
  originalFileName: string;
  storedFileName: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  paymentStatus: PaymentStatus;
  amountMajor: number;
  currency: "PLN" | "NOK";
  checkoutSessionId?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const STORE_FILE = path.join(DATA_DIR, "submissions.json");

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });
}

async function readStore(): Promise<SubmissionRecord[]> {
  await ensureDirs();
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SubmissionRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeStore(records: SubmissionRecord[]) {
  await ensureDirs();
  await writeFile(STORE_FILE, JSON.stringify(records, null, 2), "utf8");
}

function safeExtension(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).toLowerCase().replace(/[^\w.]/g, "");
  if (fromName && fromName.length <= 8) return fromName;
  if (mimeType.includes("pdf")) return ".pdf";
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("jpeg") || mimeType.includes("jpg")) return ".jpg";
  if (mimeType.includes("webp")) return ".webp";
  return ".bin";
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{ storedFileName: string; filePath: string }> {
  await ensureDirs();
  const ext = safeExtension(originalName, mimeType);
  const storedFileName = `${randomUUID()}${ext}`;
  const filePath = path.join(UPLOADS_DIR, storedFileName);
  await writeFile(filePath, buffer);
  return { storedFileName, filePath };
}

export async function createSubmission(
  input: Omit<SubmissionRecord, "createdAt" | "paymentStatus"> & {
    paymentStatus?: PaymentStatus;
  },
): Promise<SubmissionRecord> {
  const record: SubmissionRecord = {
    ...input,
    createdAt: new Date().toISOString(),
    paymentStatus: input.paymentStatus ?? "pending",
  };
  const records = await readStore();
  records.push(record);
  await writeStore(records);
  return record;
}

export async function listSubmissions(): Promise<SubmissionRecord[]> {
  const records = await readStore();
  return [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function getSubmission(
  id: string,
): Promise<SubmissionRecord | null> {
  const records = await readStore();
  return records.find((r) => r.id === id) ?? null;
}

export async function updateSubmission(
  id: string,
  patch: Partial<SubmissionRecord>,
): Promise<SubmissionRecord | null> {
  const records = await readStore();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  records[idx] = { ...records[idx], ...patch };
  await writeStore(records);
  return records[idx];
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}
