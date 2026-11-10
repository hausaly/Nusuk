import type { Prisma, PrismaClient } from "@prisma/client";

export type Db = PrismaClient | Prisma.TransactionClient;

/** Fields whose values must never be written to the audit log. */
const REDACT = new Set(["passwordHash", "totpSecretEnc"]);
/** Bookkeeping fields that are not meaningful changes. */
const IGNORE = new Set(["updatedAt", "createdAt"]);

export function serialize(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export function redact(field: string, v: unknown): string | null {
  if (REDACT.has(field)) return v == null ? null : "[redacted]";
  return serialize(v);
}

export interface FieldChange { field: string; oldValue: string | null; newValue: string | null }

/** Pure diff between two records; used for per-field UPDATE audit rows. */
export function diffRecords(before: Record<string, unknown>, after: Record<string, unknown>): FieldChange[] {
  const out: FieldChange[] = [];
  for (const field of Object.keys(after)) {
    if (IGNORE.has(field)) continue;
    const o = serialize(before[field]);
    const n = serialize(after[field]);
    if (o !== n) out.push({ field, oldValue: redact(field, before[field]), newValue: redact(field, after[field]) });
  }
  return out;
}

export function snapshot(rec: Record<string, unknown>): string {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (IGNORE.has(k)) continue;
    o[k] = REDACT.has(k) ? "[redacted]" : v;
  }
  return JSON.stringify(o);
}

interface Base { db: Db; userId: string | null; entity: string; entityId: string }

export const auditCreate = (p: Base & { record: Record<string, unknown> }) =>
  p.db.auditLog.create({
    data: { userId: p.userId, action: "CREATE", entity: p.entity, entityId: p.entityId, newValue: snapshot(p.record) },
  });

export const auditDelete = (p: Base & { record: Record<string, unknown> }) =>
  p.db.auditLog.create({
    data: { userId: p.userId, action: "DELETE", entity: p.entity, entityId: p.entityId, oldValue: snapshot(p.record) },
  });

/** Writes one row per changed field. Returns the number of rows written. */
export async function auditUpdate(
  p: Base & { before: Record<string, unknown>; after: Record<string, unknown> },
): Promise<number> {
  const changes = diffRecords(p.before, p.after);
  if (changes.length)
    await p.db.auditLog.createMany({
      data: changes.map((c) => ({
        userId: p.userId, action: "UPDATE", entity: p.entity, entityId: p.entityId, ...c,
      })),
    });
  return changes.length;
}

/** Free-form event (LOGIN, LOGIN_FAILED, 2FA_ENABLED …). */
export const auditEvent = (p: Base & { action: string; note?: string }) =>
  p.db.auditLog.create({
    data: { userId: p.userId, action: p.action, entity: p.entity, entityId: p.entityId, newValue: p.note ?? null },
  });
