import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const uploadDirectory = path.resolve(process.cwd(), ".data", "uploads");
export const MAX_DELIVERABLE_BYTES = 10 * 1024 * 1024;

function safeFileName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return normalized.slice(0, 100) || "deliverable";
}

function resolveStorageKey(storageKey: string): string {
  const resolvedPath = path.resolve(uploadDirectory, storageKey);
  const uploadPrefix = `${uploadDirectory}${path.sep}`;

  if (!resolvedPath.startsWith(uploadPrefix)) {
    throw new Error("Invalid deliverable storage key.");
  }

  return resolvedPath;
}

export async function storeDeliverable(input: {
  invoiceId: string;
  milestoneId: string;
  file: File;
}): Promise<{
  storageKey: string;
  name: string;
  mimeType: string;
  size: number;
}> {
  if (input.file.size <= 0 || input.file.size > MAX_DELIVERABLE_BYTES) {
    throw new Error("Deliverables must be between 1 byte and 10 MB.");
  }

  const name = safeFileName(input.file.name);
  const storageKey = path.join(
    input.invoiceId,
    input.milestoneId,
    `${crypto.randomUUID()}-${name}`,
  );
  const filePath = resolveStorageKey(storageKey);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, Buffer.from(await input.file.arrayBuffer()));

  return {
    storageKey,
    name,
    mimeType: input.file.type || "application/octet-stream",
    size: input.file.size,
  };
}

export async function readDeliverable(storageKey: string): Promise<Buffer> {
  return readFile(resolveStorageKey(storageKey));
}
