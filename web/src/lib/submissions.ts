import { randomUUID } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { put, list, del } from "@vercel/blob";
import type { Market } from "@/lib/content";
import type { PackageType } from "@/lib/pricing";

export type PaymentStatus =
  | "pending"
  | "checkout_created"
  | "paid"
  | "mock_paid";

export type StorageBackend = "local" | "blob";

export type SubmissionRecord = {
  id: string;
  market: Market;
  packageType: PackageType;
  email: string;
  phone: string;
  customAnswers: Record<string, unknown>;
  originalFileName: string;
  storedFileName: string;
  /** Local absolute path OR remote blob URL */
  filePath: string;
  fileUrl?: string;
  storageBackend?: StorageBackend;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  paymentStatus: PaymentStatus;
  amountMajor: number;
  currency: "PLN" | "NOK";
  checkoutSessionId?: string;
  paidEmailSentAt?: string;
  receivedEmailSentAt?: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const STORE_FILE = path.join(DATA_DIR, "submissions.json");
const BLOB_META_PREFIX = "rada-pism/submissions/";
const BLOB_FILE_PREFIX = "rada-pism/uploads/";

function useBlobStore(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN?.trim());
}

export function getStorageMode(): StorageBackend {
  return useBlobStore() ? "blob" : "local";
}

async function ensureDirs() {
  await mkdir(DATA_DIR, { recursive: true });
  await mkdir(UPLOADS_DIR, { recursive: true });
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

async function readStoreLocal(): Promise<SubmissionRecord[]> {
  await ensureDirs();
  try {
    const raw = await readFile(STORE_FILE, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as SubmissionRecord[]) : [];
  } catch {
    return [];
  }
}

async function writeStoreLocal(records: SubmissionRecord[]) {
  await ensureDirs();
  await writeFile(STORE_FILE, JSON.stringify(records, null, 2), "utf8");
}

async function readStoreBlob(): Promise<SubmissionRecord[]> {
  const { blobs } = await list({ prefix: BLOB_META_PREFIX });
  const records: SubmissionRecord[] = [];
  for (const blob of blobs) {
    if (!blob.pathname.endsWith(".json")) continue;
    try {
      const res = await fetch(blob.url, { cache: "no-store" });
      if (!res.ok) continue;
      const record = (await res.json()) as SubmissionRecord;
      if (record?.id) records.push(record);
    } catch {
      /* skip corrupt */
    }
  }
  return records;
}

async function putSubmissionBlob(record: SubmissionRecord) {
  await put(`${BLOB_META_PREFIX}${record.id}.json`, JSON.stringify(record, null, 2), {
    access: "public",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

async function readStore(): Promise<SubmissionRecord[]> {
  if (useBlobStore()) {
    try {
      return await readStoreBlob();
    } catch (err) {
      console.error("[rada-pism/storage] blob list failed, falling back to local", err);
      return readStoreLocal();
    }
  }
  return readStoreLocal();
}

export async function saveUploadedFile(
  buffer: Buffer,
  originalName: string,
  mimeType: string,
): Promise<{
  storedFileName: string;
  filePath: string;
  fileUrl?: string;
  storageBackend: StorageBackend;
}> {
  const ext = safeExtension(originalName, mimeType);
  const storedFileName = `${randomUUID()}${ext}`;

  if (useBlobStore()) {
    try {
      const blob = await put(`${BLOB_FILE_PREFIX}${storedFileName}`, buffer, {
        access: "public",
        contentType: mimeType || "application/octet-stream",
        addRandomSuffix: false,
      });
      return {
        storedFileName,
        filePath: blob.url,
        fileUrl: blob.url,
        storageBackend: "blob",
      };
    } catch (err) {
      console.error("[rada-pism/storage] blob upload failed, falling back to local", err);
    }
  }

  await ensureDirs();
  const filePath = path.join(UPLOADS_DIR, storedFileName);
  await writeFile(filePath, buffer);
  return { storedFileName, filePath, storageBackend: "local" };
}

export async function createSubmission(
  input: Omit<SubmissionRecord, "createdAt" | "paymentStatus"> & {
    paymentStatus?: PaymentStatus;
  },
): Promise<SubmissionRecord> {
  const record: SubmissionRecord = {
    ...input,
    storageBackend: input.storageBackend ?? getStorageMode(),
    createdAt: new Date().toISOString(),
    paymentStatus: input.paymentStatus ?? "pending",
  };

  if (useBlobStore()) {
    try {
      await putSubmissionBlob(record);
      return record;
    } catch (err) {
      console.error("[rada-pism/storage] blob meta write failed, local fallback", err);
    }
  }

  const records = await readStoreLocal();
  records.push(record);
  await writeStoreLocal(records);
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
  if (useBlobStore()) {
    try {
      const { blobs } = await list({ prefix: `${BLOB_META_PREFIX}${id}.json` });
      const hit = blobs.find((b) => b.pathname.endsWith(`${id}.json`));
      if (hit) {
        const res = await fetch(hit.url, { cache: "no-store" });
        if (res.ok) return (await res.json()) as SubmissionRecord;
      }
    } catch (err) {
      console.error("[rada-pism/storage] blob get failed", err);
    }
  }

  const records = await readStoreLocal();
  return records.find((r) => r.id === id) ?? null;
}

export async function updateSubmission(
  id: string,
  patch: Partial<SubmissionRecord>,
): Promise<SubmissionRecord | null> {
  const existing = await getSubmission(id);
  if (!existing) return null;
  const next = { ...existing, ...patch };

  if (useBlobStore()) {
    try {
      await putSubmissionBlob(next);
      return next;
    } catch (err) {
      console.error("[rada-pism/storage] blob update failed, local fallback", err);
    }
  }

  const records = await readStoreLocal();
  const idx = records.findIndex((r) => r.id === id);
  if (idx < 0) {
    records.push(next);
  } else {
    records[idx] = next;
  }
  await writeStoreLocal(records);
  return next;
}

export function getUploadsDir() {
  return UPLOADS_DIR;
}

export function isRemoteFile(record: SubmissionRecord): boolean {
  return (
    record.storageBackend === "blob" ||
    Boolean(record.fileUrl) ||
    /^https?:\/\//i.test(record.filePath)
  );
}

/** Best-effort cleanup helper for tests / retention (unused in UI). */
export async function deleteSubmissionMeta(id: string): Promise<void> {
  if (!useBlobStore()) return;
  try {
    const { blobs } = await list({ prefix: `${BLOB_META_PREFIX}${id}.json` });
    await Promise.all(blobs.map((b) => del(b.url)));
  } catch {
    /* ignore */
  }
}
