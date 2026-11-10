import type { CheckStatus, CheckType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditUpdate, type Db } from "@/lib/audit";
import { assertCan, type Capability } from "@/lib/rbac";
import { notifyRoles } from "@/lib/notify";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";

export const CHECK_TYPES: CheckType[] = ["PAYMENT", "DOCUMENTS", "VISA", "TICKET"];
export const CHECK_CAP: Record<CheckType, Capability> = { PAYMENT: "payment.write", DOCUMENTS: "documents.write", VISA: "visa.write", TICKET: "ticket.write" };
/** Who owns each check (for reminders / blocking messages). */
export const CHECK_OWNER = { PAYMENT: "FINANCE_STAFF", DOCUMENTS: "OPERATIONS_STAFF", VISA: "VISA_OFFICER", TICKET: "TICKET_OFFICER" } as const;

/** Rule 1: GREEN only if all 4 checks are CLEARED. */
export function clearanceOf(checks: { type: CheckType; status: CheckStatus }[]) {
  const blocking = CHECK_TYPES.filter((t) => checks.find((c) => c.type === t)?.status !== "CLEARED");
  return { green: blocking.length === 0, blocking };
}

export async function getClearance(db: Db, pilgrimId: string) {
  return clearanceOf(await db.clearanceCheck.findMany({ where: { pilgrimId } }));
}

/** Rules 4/5 gate: server rejects bus/room actions for RED pilgrims, naming the blocking checks. */
export async function assertNotBlocked(db: Db, pilgrimId: string, what: string) {
  const [p, c] = await Promise.all([db.pilgrim.findUnique({ where: { id: pilgrimId }, select: { fullName: true } }), getClearance(db, pilgrimId)]);
  if (!c.green) throw new ServiceError(`${p?.fullName ?? "Pilgrim"} is RED and cannot be assigned to ${what}. Blocked by: ${c.blocking.join(", ")}.`);
}

/** Core setter used by both people and automatic rules. Audits, and on CLEARED→PENDING alerts the Super Admin (rule 3). */
export async function applyCheck(db: Db, actorId: string | null, pilgrimId: string, type: CheckType, status: CheckStatus, note?: string | null) {
  const before = await db.clearanceCheck.upsert({ where: { pilgrimId_type: { pilgrimId, type } }, update: {}, create: { pilgrimId, type } });
  if (before.status === status && note === undefined) return before;
  const after = await db.clearanceCheck.update({ where: { id: before.id }, data: { status, updatedById: actorId, updatedAt: new Date(), ...(note !== undefined ? { note } : {}) } });
  await auditUpdate({ db, userId: actorId, entity: "ClearanceCheck", entityId: `${pilgrimId}:${type}`, before, after });
  if (before.status === "CLEARED" && status === "PENDING") {
    const p = await db.pilgrim.findUnique({ where: { id: pilgrimId }, select: { fullName: true } });
    await notifyRoles(["SUPER_ADMIN"], { title: "Pilgrim turned RED", body: `${p?.fullName}: ${type} check set back to PENDING.`, link: `/pilgrims/${pilgrimId}` });
  }
  return after;
}

export async function setCheck(actor: Actor, pilgrimId: string, type: CheckType, status: CheckStatus, note?: string) {
  assertCan(actor, CHECK_CAP[type]);
  const p = await prisma.pilgrim.findUnique({ where: { id: pilgrimId }, select: { groupId: true } });
  if (!p) throw new ServiceError("Pilgrim not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, p.groupId);
  return applyCheck(prisma, actor.id, pilgrimId, type, status, note);
}

/** Rule 2: DOCUMENTS clears automatically once passport copy AND payment receipt are both uploaded. */
export async function recomputeDocumentsCheck(db: Db, actorId: string | null, pilgrimId: string) {
  const docs = await db.document.findMany({ where: { pilgrimId, type: { in: ["PASSPORT_COPY", "PAYMENT_RECEIPT"] } }, select: { type: true } });
  const both = docs.some((x) => x.type === "PASSPORT_COPY") && docs.some((x) => x.type === "PAYMENT_RECEIPT");
  if (both) await applyCheck(db, actorId, pilgrimId, "DOCUMENTS", "CLEARED");
}
