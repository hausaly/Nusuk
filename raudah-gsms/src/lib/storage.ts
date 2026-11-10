import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * File storage with encryption at rest and signed, expiring URLs.
 *  - local driver (default; dev/tests): AES-256-GCM encrypted files under STORAGE_DIR
 *  - s3 driver (STORAGE_DRIVER=s3, MinIO/AWS): server-side encryption (AES256) on the bucket
 * Files are always served through /api/files/<key> which checks the session AND the signature.
 */
const dir = () => path.resolve(process.env.STORAGE_DIR ?? ".storage");
const key32 = () => Buffer.from(process.env.APP_ENCRYPTION_KEY ?? "", "hex");
const safeKey = (k: string) => { if (!/^[\w./-]+$/.test(k) || k.includes("..")) throw new Error("Bad key"); return k; };
const isS3 = () => process.env.STORAGE_DRIVER === "s3";

async function s3() {
  const { S3Client } = await import("@aws-sdk/client-s3");
  return new S3Client({
    region: process.env.S3_REGION ?? "us-east-1", endpoint: process.env.S3_ENDPOINT, forcePathStyle: true,
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
  });
}

export async function putFile(key: string, data: Buffer, contentType = "application/pdf"): Promise<void> {
  safeKey(key);
  if (isS3()) {
    const { PutObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: data, ContentType: contentType, ServerSideEncryption: "AES256" }));
    return;
  }
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key32(), iv);
  const enc = Buffer.concat([c.update(data), c.final()]);
  const file = path.join(dir(), key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, Buffer.concat([iv, c.getAuthTag(), enc]));
}

export async function getFile(key: string): Promise<Buffer> {
  safeKey(key);
  if (isS3()) {
    const { GetObjectCommand } = await import("@aws-sdk/client-s3");
    const r = await (await s3()).send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return Buffer.from(await r.Body!.transformToByteArray());
  }
  const raw = await readFile(path.join(dir(), key));
  const d = createDecipheriv("aes-256-gcm", key32(), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]);
}

export async function deleteFile(key: string): Promise<void> {
  safeKey(key);
  if (isS3()) {
    const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
    await (await s3()).send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
    return;
  }
  await rm(path.join(dir(), key), { force: true });
}

const sign = (key: string, exp: number) => createHmac("sha256", process.env.NEXTAUTH_SECRET ?? "dev").update(`${key}|${exp}`).digest("base64url");

/** Relative signed URL, valid for ttlSeconds (default 5 min). */
export function signedUrl(key: string, ttlSeconds = 300, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + ttlSeconds;
  return `/api/files/${key}?exp=${exp}&sig=${sign(key, exp)}`;
}
export function verifySignature(key: string, exp: number, sig: string, now = Date.now()): boolean {
  if (!exp || exp < Math.floor(now / 1000)) return false;
  const a = Buffer.from(sign(key, exp)), b = Buffer.from(sig);
  return a.length === b.length && timingSafeEqual(a, b);
}
