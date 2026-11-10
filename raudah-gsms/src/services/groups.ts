import type { GroupStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditCreate, auditUpdate } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { type Actor, ServiceError } from "./types";

export interface GroupInput {
  name: string; startDate: string; endDate: string; arrivalAirport: string; departureAirport: string;
  supervisorId?: string | null; agentIds?: string[]; status?: GroupStatus;
}
const d = (s: string) => { const x = new Date(s + (s.length === 10 ? "T00:00:00Z" : "")); if (isNaN(+x)) throw new ServiceError("Invalid date."); return x; };

function clean(i: GroupInput) {
  const name = i.name.trim();
  if (!name) throw new ServiceError("Group name is required.");
  const startDate = d(i.startDate), endDate = d(i.endDate);
  if (endDate < startDate) throw new ServiceError("End date must be on or after the start date.");
  const ap = (v: string) => { const c = v.trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(c)) throw new ServiceError("Airports must be 3-letter codes (e.g. JED, MED)."); return c; };
  return { name, startDate, endDate, arrivalAirport: ap(i.arrivalAirport), departureAirport: ap(i.departureAirport), supervisorId: i.supervisorId || null };
}

/** UMR-YYYY-NNN, sequence per start-year. */
async function nextCode(year: number): Promise<string> {
  const n = await prisma.group.count({ where: { code: { startsWith: `UMR-${year}-` } } });
  return `UMR-${year}-${String(n + 1).padStart(3, "0")}`;
}

export async function createGroup(actor: Actor, input: GroupInput) {
  assertCan(actor, "groups.manage");
  const data = clean(input);
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.$transaction(async (tx) => {
        const code = await nextCode(data.startDate.getUTCFullYear() + attempt * 0);
        const g = await tx.group.create({ data: { ...data, code, status: input.status ?? "PLANNING", agents: { create: (input.agentIds ?? []).map((agentId) => ({ agentId })) } } });
        await auditCreate({ db: tx, userId: actor.id, entity: "Group", entityId: g.id, record: g });
        return g;
      });
    } catch (e: any) { if (e.code !== "P2002") throw e; }
  }
  throw new ServiceError("Could not allocate a group code, try again.");
}

export async function updateGroup(actor: Actor, id: string, input: GroupInput) {
  assertCan(actor, "groups.manage");
  const data = clean(input);
  return prisma.$transaction(async (tx) => {
    const before = await tx.group.findUnique({ where: { id } });
    if (!before) throw new ServiceError("Group not found.", "NOT_FOUND");
    if (before.status === "ARCHIVED") throw new ServiceError("Archived groups are read-only.");
    const after = await tx.group.update({ where: { id }, data: { ...data, ...(input.status ? { status: input.status } : {}) } });
    if (input.agentIds) {
      await tx.groupAgent.deleteMany({ where: { groupId: id } });
      await tx.groupAgent.createMany({ data: input.agentIds.map((agentId) => ({ groupId: id, agentId })) });
    }
    await auditUpdate({ db: tx, userId: actor.id, entity: "Group", entityId: id, before, after });
    return after;
  });
}

export async function archiveGroup(actor: Actor, id: string) {
  assertCan(actor, "groups.manage");
  return prisma.$transaction(async (tx) => {
    const before = await tx.group.findUnique({ where: { id } });
    if (!before) throw new ServiceError("Group not found.", "NOT_FOUND");
    const after = await tx.group.update({ where: { id }, data: { status: "ARCHIVED" } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "Group", entityId: id, before, after });
  });
}

/** Archived groups are read-only: every mutating service calls this. */
export async function assertGroupWritable(db: Pick<typeof prisma, "group">, groupId: string) {
  const g = await db.group.findUnique({ where: { id: groupId }, select: { status: true } });
  if (!g) throw new ServiceError("Group not found.", "NOT_FOUND");
  if (g.status === "ARCHIVED") throw new ServiceError("This group is archived and read-only.");
}

/**
 * Duplicate setup WITHOUT pilgrims: hotels + room inventory, trip templates (intercity + ziyarah, no buses/passengers),
 * ziyarah package, supervisor and agents. Dates shift by the difference between the old and new start dates.
 */
export async function duplicateGroup(actor: Actor, sourceId: string, input: { name: string; startDate: string }) {
  assertCan(actor, "groups.manage");
  const start = d(input.startDate);
  return prisma.$transaction(async (tx) => {
    const src = await tx.group.findUnique({
      where: { id: sourceId },
      include: { agents: true, hotels: { include: { rooms: true } }, trips: { where: { type: { in: ["INTERCITY", "ZIYARAH"] } }, include: { ziyarah: true } } },
    });
    if (!src) throw new ServiceError("Group not found.", "NOT_FOUND");
    const shift = start.getTime() - src.startDate.getTime();
    const sh = (x: Date) => new Date(x.getTime() + shift);
    const code = await nextCode(start.getUTCFullYear());
    const g = await tx.group.create({
      data: {
        code, name: input.name.trim() || `${src.name} (copy)`, startDate: start, endDate: sh(src.endDate),
        arrivalAirport: src.arrivalAirport, departureAirport: src.departureAirport, supervisorId: src.supervisorId, status: "PLANNING",
        agents: { create: src.agents.map((a) => ({ agentId: a.agentId })) },
      },
    });
    for (const h of src.hotels)
      await tx.hotel.create({
        data: { groupId: g.id, name: h.name, city: h.city, address: h.address, contactPhone: h.contactPhone,
          rooms: { create: h.rooms.map((r) => ({ roomNo: r.roomNo, type: r.type, capacity: r.capacity, gender: r.gender })) } },
      });
    for (const t of src.trips) {
      const nt = await tx.trip.create({ data: { groupId: g.id, type: t.type, title: t.title, fromCity: t.fromCity, toCity: t.toCity, scheduledAt: sh(t.scheduledAt), airport: t.airport, terminal: t.terminal } });
      for (const z of t.ziyarah) await tx.ziyarahItem.create({ data: { groupId: g.id, tripId: nt.id, site: z.site, city: z.city, scheduledAt: sh(z.scheduledAt) } });
    }
    await auditCreate({ db: tx, userId: actor.id, entity: "Group", entityId: g.id, record: { ...g, duplicatedFrom: sourceId } });
    return g;
  });
}

/** Groups visible to the actor. Staff: all. Agents: groups where they have pilgrims. */
export async function visibleGroups(actor: Actor) {
  const where = actor.role === "AGENT" ? { pilgrims: { some: { agentId: actor.agentId ?? "__none__" } } } : {};
  return prisma.group.findMany({ where, orderBy: [{ startDate: "desc" }] });
}

export async function setGroupStatus(actor: Actor, id: string, status: GroupStatus) {
  assertCan(actor, "groups.manage");
  return prisma.$transaction(async (tx) => {
    const before = await tx.group.findUnique({ where: { id } });
    if (!before) throw new ServiceError("Group not found.", "NOT_FOUND");
    if (before.status === "ARCHIVED") throw new ServiceError("Archived groups are read-only.");
    const after = await tx.group.update({ where: { id }, data: { status } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "Group", entityId: id, before, after });
  });
}
