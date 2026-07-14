import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const uploadDirectory = path.resolve(process.cwd(), ".data", "uploads");
export const MAX_DELIVERABLE_BYTES = 10 * 1024 * 1024;

let s3Client: S3Client | undefined;

function safeFileName(name: string): string {
  const normalized = name
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return normalized.slice(0, 100) || "deliverable";
}

function normalizeStorageKey(storageKey: string): string {
  const normalized = storageKey.replace(/\\/g, "/");
  const segments = normalized.split("/");

  if (
    normalized.startsWith("/") ||
    segments.length < 3 ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Invalid deliverable storage key.");
  }

  return normalized;
}

function resolveLocalStorageKey(storageKey: string): string {
  const normalized = normalizeStorageKey(storageKey);
  const resolvedPath = path.resolve(uploadDirectory, ...normalized.split("/"));
  const uploadPrefix = `${uploadDirectory}${path.sep}`;

  if (!resolvedPath.startsWith(uploadPrefix)) {
    throw new Error("Invalid deliverable storage key.");
  }

  return resolvedPath;
}

function objectStorageBucket(): string | null {
  return process.env.S3_BUCKET?.trim() || null;
}

function getS3Client(): S3Client {
  if (s3Client) {
    return s3Client;
  }

  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

  if (Boolean(accessKeyId) !== Boolean(secretAccessKey)) {
    throw new Error(
      "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY must be configured together.",
    );
  }

  s3Client = new S3Client({
    region: process.env.S3_REGION?.trim() || "us-east-1",
    endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
    credentials:
      accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : undefined,
  });

  return s3Client;
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
  const storageKey = normalizeStorageKey(
    [input.invoiceId, input.milestoneId, `${crypto.randomUUID()}-${name}`].join(
      "/",
    ),
  );
  const contents = Buffer.from(await input.file.arrayBuffer());
  const mimeType = input.file.type || "application/octet-stream";
  const bucket = objectStorageBucket();

  if (bucket) {
    await getS3Client().send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        Body: contents,
        ContentLength: contents.byteLength,
        ContentType: mimeType,
      }),
    );
  } else {
    const filePath = resolveLocalStorageKey(storageKey);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, contents);
  }

  return {
    storageKey,
    name,
    mimeType,
    size: input.file.size,
  };
}

export async function readDeliverable(storageKey: string): Promise<Buffer> {
  const normalized = normalizeStorageKey(storageKey);
  const bucket = objectStorageBucket();

  if (!bucket) {
    return readFile(resolveLocalStorageKey(normalized));
  }

  const response = await getS3Client().send(
    new GetObjectCommand({ Bucket: bucket, Key: normalized }),
  );

  if (!response.Body) {
    throw new Error("The deliverable object is empty.");
  }

  return Buffer.from(await response.Body.transformToByteArray());
}

export async function deleteDeliverable(storageKey: string): Promise<void> {
  const normalized = normalizeStorageKey(storageKey);
  const bucket = objectStorageBucket();

  if (bucket) {
    await getS3Client().send(
      new DeleteObjectCommand({ Bucket: bucket, Key: normalized }),
    );
    return;
  }

  try {
    await unlink(resolveLocalStorageKey(normalized));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}
