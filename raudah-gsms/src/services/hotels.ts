import type { City, Gender, RoomType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditCreate, auditEvent, auditDelete } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";
import { assertNotBlocked, clearanceOf } from "./clearance";

const CAP: Record<RoomType, number> = { DOUBLE: 2, TRIPLE: 3, QUAD: 4, OTHER: 5 };

export async function createHotel(actor: Actor, groupId: string, i: { name: string; city: City; address?: string; contactPhone?: string }) {
  assertCan(actor, "planning.write");
  await assertGroupWritable(prisma, groupId);
  if (!i.name.trim()) throw new ServiceError("Hotel name is required.");
  const h = await prisma.hotel.create({ data: { groupId, name: i.name.trim(), city: i.city, address: i.address || null, contactPhone: i.contactPhone || null } });
  await auditCreate({ db: prisma, userId: actor.id, entity: "Hotel", entityId: h.id, record: h });
  return h;
}

/** Bulk-add rooms: prefix + numeric range, e.g. 101..110. */
export async function addRooms(actor: Actor, hotelId: string, i: { from: number; to: number; prefix?: string; type: RoomType; capacity?: number; gender?: Gender | null }) {
  assertCan(actor, "planning.write");
  const h = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!h) throw new ServiceError("Hotel not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, h.groupId);
  if (!(i.to >= i.from) || i.to - i.from > 300) throw new ServiceError("Invalid room range (max 300 rooms at a time).");
  const capacity = i.capacity ?? CAP[i.type];
  if (!(capacity >= 1 && capacity <= 10)) throw new ServiceError("Capacity must be between 1 and 10.");
  const data = Array.from({ length: i.to - i.from + 1 }, (_, k) => ({ hotelId, roomNo: `${i.prefix ?? ""}${i.from + k}`, type: i.type, capacity, gender: i.gender ?? null }));
  const r = await prisma.room.createMany({ data, skipDuplicates: true });
  await auditEvent({ db: prisma, userId: actor.id, entity: "Hotel", entityId: hotelId, action: "ADD_ROOMS", note: `${r.count} rooms ${data[0].roomNo}-${data[data.length - 1].roomNo}` });
  return r.count;
}

export async function deleteRoom(actor: Actor, roomId: string) {
  assertCan(actor, "planning.write");
  const r = await prisma.room.findUnique({ where: { id: roomId }, include: { hotel: true, _count: { select: { assignments: true } } } });
  if (!r) throw new ServiceError("Room not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, r.hotel.groupId);
  if (r._count.assignments) throw new ServiceError("Room has guests assigned.");
  await prisma.room.delete({ where: { id: roomId } });
  await auditDelete({ db: prisma, userId: actor.id, entity: "Room", entityId: roomId, record: { roomNo: r.roomNo, hotelId: r.hotelId } });
}

/** Assign (or move) a pilgrim to a room. Rejects RED pilgrims, full rooms and gender mismatches (rules 4 & 5). */
export async function assignRoom(actor: Actor, roomId: string, pilgrimId: string, reason?: string) {
  assertCan(actor, "planning.write");
  return prisma.$transaction(async (tx) => {
    const room = await tx.room.findUnique({ where: { id: roomId }, include: { hotel: true, assignments: true } });
    if (!room) throw new ServiceError("Room not found.", "NOT_FOUND");
    await assertGroupWritable(tx, room.hotel.groupId);
    const p = await tx.pilgrim.findFirst({ where: { id: pilgrimId, groupId: room.hotel.groupId } });
    if (!p) throw new ServiceError("Pilgrim not found in this group.", "NOT_FOUND");
    await assertNotBlocked(tx, pilgrimId, `room ${room.roomNo}`);
    if (room.gender && room.gender !== p.gender) throw new ServiceError(`Room ${room.roomNo} is ${room.gender === "M" ? "male" : "female"}-only.`);
    if (room.assignments.some((a) => a.pilgrimId === pilgrimId)) return room;
    if (room.assignments.length >= room.capacity) throw new ServiceError(`Room ${room.roomNo} is full (${room.capacity}).`);
    const existing = await tx.roomAssignment.findFirst({ where: { pilgrimId, room: { hotelId: room.hotelId }, checkOutAt: null }, include: { room: true } });
    if (existing) {
      if (existing.checkInAt) throw new ServiceError("Pilgrim is already checked in; check out before moving.");
      await tx.roomAssignment.delete({ where: { id: existing.id } });
    }
    await tx.roomAssignment.create({ data: { roomId, pilgrimId } });
    await tx.roomChangeLog.create({ data: { pilgrimId, fromRoomId: existing?.roomId ?? null, toRoomId: roomId, byId: actor.id, reason: reason ?? (existing ? "Moved" : "Assigned") } });
    await auditEvent({ db: tx, userId: actor.id, entity: "RoomAssignment", entityId: pilgrimId, action: existing ? "MOVE" : "ASSIGN", note: `${room.hotel.name} ${room.roomNo}` });
    return room;
  });
}

export async function unassignRoom(actor: Actor, roomId: string, pilgrimId: string) {
  assertCan(actor, "planning.write");
  const a = await prisma.roomAssignment.findUnique({ where: { roomId_pilgrimId: { roomId, pilgrimId } }, include: { room: { include: { hotel: true } } } });
  if (!a) return;
  await assertGroupWritable(prisma, a.room.hotel.groupId);
  if (a.checkInAt && !a.checkOutAt) throw new ServiceError("Pilgrim is checked in; check out first.");
  await prisma.roomAssignment.delete({ where: { id: a.id } });
  await prisma.roomChangeLog.create({ data: { pilgrimId, fromRoomId: roomId, toRoomId: null, byId: actor.id, reason: "Unassigned" } });
  await auditEvent({ db: prisma, userId: actor.id, entity: "RoomAssignment", entityId: pilgrimId, action: "UNASSIGN", note: a.room.roomNo });
}

/**
 * Auto-fill: GREEN pilgrims without a room in this hotel. Family members (familyLinkId) stay together, then grouped by agent.
 * Best-fit room, respecting gender; mixed families only go into rooms with no gender restriction.
 */
export async function autoFillRooms(actor: Actor, hotelId: string) {
  assertCan(actor, "planning.write");
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, include: { rooms: { include: { assignments: { include: { pilgrim: true } } } } } });
  if (!hotel) throw new ServiceError("Hotel not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, hotel.groupId);
  const assigned = new Set(hotel.rooms.flatMap((r) => r.assignments.map((a) => a.pilgrimId)));
  const pilgrims = await prisma.pilgrim.findMany({ where: { groupId: hotel.groupId, id: { notIn: [...assigned] } }, include: { checks: true }, orderBy: [{ agentId: "asc" }, { fullName: "asc" }] });
  const green = pilgrims.filter((p) => clearanceOf(p.checks).green);
  const redSkipped = pilgrims.length - green.length;

  type Unit = { members: typeof green; agentId: string };
  const byFamily = new Map<string, typeof green>(); const units: Unit[] = [];
  for (const p of green) {
    if (p.familyLinkId) byFamily.set(p.familyLinkId, [...(byFamily.get(p.familyLinkId) ?? []), p]);
    else units.push({ members: [p], agentId: p.agentId });
  }
  for (const m of byFamily.values()) units.push({ members: m, agentId: m[0].agentId });
  units.sort((a, b) => b.members.length - a.members.length || a.agentId.localeCompare(b.agentId));

  const state = hotel.rooms.map((r) => ({ id: r.id, no: r.roomNo, cap: r.capacity, gender: r.gender, occ: r.assignments.length, agents: new Set(r.assignments.map((a) => a.pilgrim.agentId)), genders: new Set(r.assignments.map((a) => a.pilgrim.gender)) }));
  const plan: { roomId: string; pilgrimId: string }[] = []; const unplaced: string[] = [];
  for (const u of units) {
    const gs = new Set(u.members.map((m) => m.gender));
    const family = u.members.length > 1;
    const genderOk = (r: (typeof state)[number]) =>
      r.gender ? gs.size === 1 && gs.has(r.gender) : family || new Set([...gs, ...r.genders]).size === 1; // unrestricted rooms mix only for families
    const fits = state.filter((r) => r.cap - r.occ >= u.members.length && genderOk(r));
    fits.sort((a, b) => (b.agents.has(u.agentId) ? 1 : 0) - (a.agents.has(u.agentId) ? 1 : 0) || (a.cap - a.occ) - (b.cap - b.occ) || (a.gender ? 0 : 1) - (b.gender ? 0 : 1));
    const r = fits[0];
    if (!r) { unplaced.push(...u.members.map((m) => m.fullName)); continue; }
    for (const m of u.members) { plan.push({ roomId: r.id, pilgrimId: m.id }); r.occ++; r.genders.add(m.gender); }
    r.agents.add(u.agentId);
  }
  await prisma.$transaction(async (tx) => {
    for (const x of plan) {
      await tx.roomAssignment.create({ data: x });
      await tx.roomChangeLog.create({ data: { pilgrimId: x.pilgrimId, toRoomId: x.roomId, byId: actor.id, reason: "Auto-fill" } });
    }
    await auditEvent({ db: tx, userId: actor.id, entity: "Hotel", entityId: hotelId, action: "AUTO_FILL", note: `${plan.length} placed, ${unplaced.length} unplaced, ${redSkipped} RED skipped` });
  });
  return { placed: plan.length, unplaced, redSkipped };
}

/** Check-in / check-out with time and staff; keeps journeyStatus in step. */
export async function checkIn(actor: Actor, roomId: string, pilgrimId: string) {
  assertCan(actor, "field.write");
  const a = await prisma.roomAssignment.findUnique({ where: { roomId_pilgrimId: { roomId, pilgrimId } }, include: { room: { include: { hotel: true } } } });
  if (!a) throw new ServiceError("Pilgrim is not assigned to this room.");
  await assertGroupWritable(prisma, a.room.hotel.groupId);
  await assertNotBlocked(prisma, pilgrimId, `check-in at ${a.room.hotel.name}`);
  if (a.checkInAt) throw new ServiceError("Already checked in.");
  await prisma.$transaction([
    prisma.roomAssignment.update({ where: { id: a.id }, data: { checkInAt: new Date(), checkInById: actor.id, checkOutAt: null, checkOutById: null } }),
    prisma.pilgrim.update({ where: { id: pilgrimId }, data: { journeyStatus: a.room.hotel.city === "MADINAH" ? "IN_MADINAH" : a.room.hotel.city === "MAKKAH" ? "IN_MAKKAH" : "ARRIVED" } }),
  ]);
  await auditEvent({ db: prisma, userId: actor.id, entity: "RoomAssignment", entityId: pilgrimId, action: "CHECK_IN", note: `${a.room.hotel.name} ${a.room.roomNo}` });
}

export async function checkOut(actor: Actor, roomId: string, pilgrimId: string) {
  assertCan(actor, "field.write");
  const a = await prisma.roomAssignment.findUnique({ where: { roomId_pilgrimId: { roomId, pilgrimId } }, include: { room: { include: { hotel: true } } } });
  if (!a?.checkInAt) throw new ServiceError("Pilgrim has not checked in.");
  await assertGroupWritable(prisma, a.room.hotel.groupId);
  if (a.checkOutAt) throw new ServiceError("Already checked out.");
  await prisma.$transaction([
    prisma.roomAssignment.update({ where: { id: a.id }, data: { checkOutAt: new Date(), checkOutById: actor.id } }),
    prisma.pilgrim.update({ where: { id: pilgrimId }, data: { journeyStatus: "IN_TRANSIT" } }),
  ]);
  await auditEvent({ db: prisma, userId: actor.id, entity: "RoomAssignment", entityId: pilgrimId, action: "CHECK_OUT", note: `${a.room.hotel.name} ${a.room.roomNo}` });
}

/** Bulk check-in/out for a whole room. */
export async function checkRoom(actor: Actor, roomId: string, mode: "in" | "out") {
  const as = await prisma.roomAssignment.findMany({ where: { roomId } });
  const errors: string[] = [];
  for (const a of as) { try { await (mode === "in" ? checkIn : checkOut)(actor, roomId, a.pilgrimId); } catch (e: any) { errors.push(e.message); } }
  return { errors };
}

export async function hotelBoard(hotelId: string) {
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, include: { group: true, rooms: { orderBy: { roomNo: "asc" }, include: { assignments: { include: { pilgrim: { include: { checks: true } } } } } } } });
  if (!hotel) throw new ServiceError("Hotel not found.", "NOT_FOUND");
  const assigned = new Set(hotel.rooms.flatMap((r) => r.assignments.map((a) => a.pilgrimId)));
  const free = await prisma.pilgrim.findMany({ where: { groupId: hotel.groupId, id: { notIn: [...assigned] } }, include: { checks: true }, orderBy: { fullName: "asc" } });
  return { hotel, free: free.map((p) => ({ ...p, clearance: clearanceOf(p.checks) })) };
}
