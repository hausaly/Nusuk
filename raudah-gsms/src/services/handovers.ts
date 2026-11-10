import type { HandoverScope } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditEvent } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { notifyUsers } from "@/lib/notify";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";

export async function sendHandover(actor: Actor, groupId: string, i: { toStaffId: string; scope: HandoverScope; pilgrimIds?: string[]; tripBusId?: string; hotelId?: string; notes?: string; issues?: string }) {
  assertCan(actor, "field.write");
  await assertGroupWritable(prisma, groupId);
  if (i.toStaffId === actor.id) throw new ServiceError("Choose a different staff member.");
  const to = await prisma.user.findFirst({ where: { id: i.toStaffId, active: true, role: { not: "AGENT" } } });
  if (!to) throw new ServiceError("Receiving staff member not found.");
  if (i.scope === "PILGRIMS" && !i.pilgrimIds?.length) throw new ServiceError("Select at least one pilgrim.");
  if (i.scope === "BUS" && !i.tripBusId) throw new ServiceError("Select a bus.");
  if (i.scope === "HOTEL" && !i.hotelId) throw new ServiceError("Select a hotel.");
  const h = await prisma.handover.create({ data: { groupId, fromStaffId: actor.id, toStaffId: i.toStaffId, scope: i.scope, pilgrimIds: i.pilgrimIds ?? [], tripBusId: i.tripBusId || null, hotelId: i.hotelId || null, notes: i.notes || null, issues: i.issues || null } });
  await auditEvent({ db: prisma, userId: actor.id, entity: "Handover", entityId: h.id, action: "SEND", note: i.scope });
  await notifyUsers([i.toStaffId], { title: "Handover waiting for you", body: `A ${i.scope.toLowerCase()} handover was sent to you. Please confirm.`, link: "/handovers" });
  return h;
}

/** Rule 8: responsibility changes only after the receiver confirms. */
export async function respondHandover(actor: Actor, id: string, accept: boolean) {
  const h = await prisma.handover.findUnique({ where: { id } });
  if (!h) throw new ServiceError("Handover not found.", "NOT_FOUND");
  if (h.toStaffId !== actor.id) throw new ServiceError("Only the receiving staff member can respond.");
  if (h.status !== "SENT") throw new ServiceError("This handover was already answered.");
  await assertGroupWritable(prisma, h.groupId);
  await prisma.$transaction(async (tx) => {
    await tx.handover.update({ where: { id }, data: { status: accept ? "CONFIRMED" : "REJECTED", confirmedAt: accept ? new Date() : null } });
    if (accept) {
      if (h.scope === "PILGRIMS") await tx.pilgrim.updateMany({ where: { id: { in: h.pilgrimIds } }, data: { currentResponsibleStaffId: h.toStaffId } });
      if (h.scope === "BUS" && h.tripBusId) {
        await tx.tripBus.update({ where: { id: h.tripBusId }, data: { staffInChargeId: h.toStaffId } });
        const seats = await tx.tripPassenger.findMany({ where: { tripBusId: h.tripBusId }, select: { pilgrimId: true } });
        await tx.pilgrim.updateMany({ where: { id: { in: seats.map((s) => s.pilgrimId) } }, data: { currentResponsibleStaffId: h.toStaffId } });
      }
      if (h.scope === "HOTEL" && h.hotelId) {
        const as = await tx.roomAssignment.findMany({ where: { room: { hotelId: h.hotelId } }, select: { pilgrimId: true } });
        await tx.pilgrim.updateMany({ where: { id: { in: as.map((a) => a.pilgrimId) } }, data: { currentResponsibleStaffId: h.toStaffId } });
      }
    }
    await auditEvent({ db: tx, userId: actor.id, entity: "Handover", entityId: id, action: accept ? "CONFIRM" : "REJECT" });
  });
  await notifyUsers([h.fromStaffId], { title: accept ? "Handover confirmed" : "Handover rejected", body: `Your ${h.scope.toLowerCase()} handover was ${accept ? "confirmed" : "rejected"}.`, link: "/handovers" });
}
