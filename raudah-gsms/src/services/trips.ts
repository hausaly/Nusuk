import type { BoardingStatus, Prisma, TripType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditCreate, auditEvent, auditUpdate, type Db } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { notifyUsers } from "@/lib/notify";
import { dateKey, TZ_KSA } from "@/lib/tz";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";
import { assertNotBlocked, clearanceOf } from "./clearance";

export const effectiveTime = (t: { scheduledAt: Date; delayMinutes: number | null }) => new Date(t.scheduledAt.getTime() + (t.delayMinutes ?? 0) * 60_000);

/**
 * Rule 6: airport trips derive from confirmed tickets, grouped by flight + date + airport. Idempotent; call after any ticket change.
 * Auto trips with no buses are removed when no ticket supports them; trips with buses are kept (and flagged by the UI).
 */
export async function syncAirportTrips(db: Db, groupId: string) {
  const tickets = await db.ticket.findMany({ where: { pilgrim: { groupId } } });
  const want = new Map<string, { type: TripType; flightNo: string; airport: string; at: Date; from: string; to: string }>();
  for (const t of tickets) {
    const ak = `ARRIVAL_PICKUP|${t.outFlightNo}|${dateKey(t.outArrivalAt, TZ_KSA)}|${t.outArrivalAirport}`;
    const cur = want.get(ak);
    if (!cur || t.outArrivalAt < cur.at) want.set(ak, { type: "ARRIVAL_PICKUP", flightNo: t.outFlightNo, airport: t.outArrivalAirport, at: t.outArrivalAt, from: t.outDepartureAirport, to: t.outArrivalAirport });
    const dk = `DEPARTURE_DROPOFF|${t.retFlightNo}|${dateKey(t.retDepartureAt, TZ_KSA)}|${t.retDepartureAirport}`;
    const cd = want.get(dk);
    if (!cd || t.retDepartureAt < cd.at) want.set(dk, { type: "DEPARTURE_DROPOFF", flightNo: t.retFlightNo, airport: t.retDepartureAirport, at: t.retDepartureAt, from: t.retDepartureAirport, to: t.retArrivalAirport });
  }
  for (const [autoKey, w] of want) {
    const title = w.type === "ARRIVAL_PICKUP" ? `Arrival ${w.flightNo} · ${w.airport}` : `Departure ${w.flightNo} · ${w.airport}`;
    await db.trip.upsert({
      where: { groupId_autoKey: { groupId, autoKey } },
      update: { scheduledAt: w.at, title },
      create: { groupId, autoKey, type: w.type, title, flightNo: w.flightNo, airport: w.airport, fromCity: w.from, toCity: w.to, scheduledAt: w.at },
    });
  }
  const existing = await db.trip.findMany({ where: { groupId, autoKey: { not: null } }, include: { _count: { select: { buses: true } } } });
  for (const t of existing) if (!want.has(t.autoKey!) && t._count.buses === 0) await db.trip.delete({ where: { id: t.id } });
}

/** Pilgrims that belong on a trip: flight-matched for airport trips, everyone in the group otherwise. */
export async function candidatePilgrims(tripId: string) {
  const trip = await prisma.trip.findUniqueOrThrow({ where: { id: tripId } });
  let where: Prisma.PilgrimWhereInput = { groupId: trip.groupId };
  if (trip.type === "ARRIVAL_PICKUP") where = { groupId: trip.groupId, ticket: { outFlightNo: trip.flightNo!, outArrivalAirport: trip.airport! } };
  if (trip.type === "DEPARTURE_DROPOFF") where = { groupId: trip.groupId, ticket: { retFlightNo: trip.flightNo!, retDepartureAirport: trip.airport! } };
  const rows = await prisma.pilgrim.findMany({ where, include: { checks: true, agent: { select: { groupName: true } }, ticket: true }, orderBy: { fullName: "asc" } });
  const seated = new Map((await prisma.tripPassenger.findMany({ where: { tripId } })).map((s) => [s.pilgrimId, s.tripBusId]));
  const flightDay = trip.autoKey ? trip.autoKey.split("|")[2] : null;
  return rows
    .filter((p) => !flightDay || !p.ticket || dateKey(trip.type === "ARRIVAL_PICKUP" ? p.ticket.outArrivalAt : p.ticket.retDepartureAt, TZ_KSA) === flightDay)
    .map((p) => ({ ...p, clearance: clearanceOf(p.checks), busId: seated.get(p.id) ?? null }));
}

export interface TripInput { type: TripType; title: string; fromCity?: string; toCity?: string; scheduledAt: string; flightNo?: string; airport?: string; terminal?: string }

export async function createTrip(actor: Actor, groupId: string, i: TripInput) {
  assertCan(actor, "planning.write");
  await assertGroupWritable(prisma, groupId);
  if (!i.title.trim()) throw new ServiceError("Title is required.");
  const at = new Date(i.scheduledAt);
  if (isNaN(+at)) throw new ServiceError("Invalid date/time.");
  const t = await prisma.trip.create({ data: { groupId, type: i.type, title: i.title.trim(), fromCity: i.fromCity || null, toCity: i.toCity || null, scheduledAt: at, flightNo: i.flightNo || null, airport: i.airport?.toUpperCase() || null, terminal: i.terminal || null } });
  await auditCreate({ db: prisma, userId: actor.id, entity: "Trip", entityId: t.id, record: t });
  return t;
}

export async function updateTripMeta(actor: Actor, tripId: string, i: { terminal?: string; status?: "PLANNED" | "IN_PROGRESS" | "DONE" }) {
  assertCan(actor, i.status ? "field.write" : "planning.write");
  const before = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!before) throw new ServiceError("Trip not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, before.groupId);
  const after = await prisma.trip.update({ where: { id: tripId }, data: { ...(i.terminal !== undefined ? { terminal: i.terminal || null } : {}), ...(i.status ? { status: i.status } : {}) } });
  await auditUpdate({ db: prisma, userId: actor.id, entity: "Trip", entityId: tripId, before, after });
}

export async function addBus(actor: Actor, tripId: string, i: { company: string; companyPhone?: string; vehiclePlate: string; busNo: string; driverName: string; driverPhone: string; staffInChargeId?: string }) {
  assertCan(actor, "planning.write");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (!trip) throw new ServiceError("Trip not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, trip.groupId);
  for (const [k, v] of Object.entries({ company: i.company, vehiclePlate: i.vehiclePlate, busNo: i.busNo, driverName: i.driverName, driverPhone: i.driverPhone })) if (!v?.trim()) throw new ServiceError(`${k} is required.`);
  const company = await prisma.transportCompany.upsert({ where: { name: i.company.trim() }, update: {}, create: { name: i.company.trim(), phone: i.companyPhone || null } });
  const bus = await prisma.tripBus.create({ data: { tripId, transportCompanyId: company.id, vehiclePlate: i.vehiclePlate.trim().toUpperCase(), busNo: i.busNo.trim(), driverName: i.driverName.trim(), driverPhone: i.driverPhone.trim(), staffInChargeId: i.staffInChargeId || null } });
  await auditCreate({ db: prisma, userId: actor.id, entity: "TripBus", entityId: bus.id, record: bus });
  return bus;
}

export async function removeBus(actor: Actor, busId: string) {
  assertCan(actor, "planning.write");
  const b = await prisma.tripBus.findUnique({ where: { id: busId }, include: { trip: true, passengers: true } });
  if (!b) return;
  await assertGroupWritable(prisma, b.trip.groupId);
  if (b.passengers.some((p) => p.boardingStatus !== "PENDING")) throw new ServiceError("Passengers already boarded on this bus.");
  await prisma.tripBus.delete({ where: { id: busId } });
  await auditEvent({ db: prisma, userId: actor.id, entity: "TripBus", entityId: busId, action: "DELETE", note: b.busNo });
}

/** Rule 4: RED pilgrims cannot be seated; one bus per pilgrim per trip. */
export async function assignPassengers(actor: Actor, busId: string, pilgrimIds: string[]) {
  assertCan(actor, "planning.write");
  const bus = await prisma.tripBus.findUnique({ where: { id: busId }, include: { trip: true } });
  if (!bus) throw new ServiceError("Bus not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, bus.trip.groupId);
  const errors: string[] = []; let added = 0;
  for (const pid of pilgrimIds) {
    try {
      const p = await prisma.pilgrim.findFirst({ where: { id: pid, groupId: bus.trip.groupId } });
      if (!p) throw new ServiceError("Pilgrim not in this group.");
      await assertNotBlocked(prisma, pid, `bus ${bus.busNo}`);
      await prisma.tripPassenger.upsert({ where: { tripId_pilgrimId: { tripId: bus.tripId, pilgrimId: pid } }, update: { tripBusId: busId, boardingStatus: "PENDING" }, create: { tripId: bus.tripId, tripBusId: busId, pilgrimId: pid } });
      added++;
    } catch (e: any) { errors.push(e.message); }
  }
  if (added) await auditEvent({ db: prisma, userId: actor.id, entity: "TripBus", entityId: busId, action: "ASSIGN_PASSENGERS", note: `${added} pilgrims` });
  // surface the first failure when nothing could be seated (single-pilgrim UI flows)
  if (!added && errors.length) throw new ServiceError(errors[0]);
  return { added, errors };
}

export async function removePassenger(actor: Actor, tripId: string, pilgrimId: string) {
  assertCan(actor, "planning.write");
  const trip = await prisma.trip.findUnique({ where: { id: tripId } });
  if (trip) await assertGroupWritable(prisma, trip.groupId);
  await prisma.tripPassenger.deleteMany({ where: { tripId, pilgrimId } });
}

/** Auto-assign all eligible (GREEN) candidates, spreading evenly across the trip's buses. */
export async function autoAssignTrip(actor: Actor, tripId: string) {
  assertCan(actor, "planning.write");
  const buses = await prisma.tripBus.findMany({ where: { tripId }, include: { _count: { select: { passengers: true } } } });
  if (!buses.length) throw new ServiceError("Add at least one bus first.");
  const cands = (await candidatePilgrims(tripId)).filter((c) => !c.busId);
  const green = cands.filter((c) => c.clearance.green);
  const load = new Map(buses.map((b) => [b.id, b._count.passengers]));
  let added = 0;
  for (const c of green) {
    const [busId] = [...load.entries()].sort((a, b) => a[1] - b[1])[0];
    await assignPassengers(actor, busId, [c.id]);
    load.set(busId, (load.get(busId) ?? 0) + 1); added++;
  }
  return { added, redSkipped: cands.length - green.length };
}

export async function markBoarding(actor: Actor, tripId: string, pilgrimId: string, status: BoardingStatus) {
  assertCan(actor, "field.write");
  const seat = await prisma.tripPassenger.findUnique({ where: { tripId_pilgrimId: { tripId, pilgrimId } }, include: { tripBus: { include: { trip: true } } } });
  if (!seat) throw new ServiceError("Pilgrim is not on a bus for this trip.");
  await assertGroupWritable(prisma, seat.tripBus.trip.groupId);
  await prisma.tripPassenger.update({ where: { id: seat.id }, data: { boardingStatus: status, markedById: actor.id, markedAt: new Date() } });
  const trip = seat.tripBus.trip;
  if (status === "BOARDED") {
    if (trip.type === "ARRIVAL_PICKUP") await prisma.pilgrim.update({ where: { id: pilgrimId }, data: { journeyStatus: "ARRIVED" } });
    if (trip.type === "INTERCITY") await prisma.pilgrim.update({ where: { id: pilgrimId }, data: { journeyStatus: "IN_TRANSIT" } });
    if (trip.type === "DEPARTURE_DROPOFF") await prisma.pilgrim.update({ where: { id: pilgrimId }, data: { journeyStatus: "DEPARTED" } });
  }
  await auditEvent({ db: prisma, userId: actor.id, entity: "TripPassenger", entityId: seat.id, action: `BOARDING_${status}`, note: pilgrimId });
}

/** Flight delay: pickup/drop-off time shifts; pickup staff + Super Admin are told immediately. */
export async function setDelay(actor: Actor, tripId: string, minutes: number) {
  assertCan(actor, "field.write");
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 24 * 60) throw new ServiceError("Delay must be 0–1440 minutes.");
  const before = await prisma.trip.findUnique({ where: { id: tripId }, include: { buses: true } });
  if (!before) throw new ServiceError("Trip not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, before.groupId);
  const after = await prisma.trip.update({ where: { id: tripId }, data: { delayMinutes: minutes || null } });
  await auditUpdate({ db: prisma, userId: actor.id, entity: "Trip", entityId: tripId, before, after });
  const sa = await prisma.user.findMany({ where: { role: "SUPER_ADMIN", active: true }, select: { id: true } });
  await notifyUsers([...before.buses.map((b) => b.staffInChargeId).filter(Boolean) as string[], ...sa.map((u) => u.id)], {
    title: `Flight delay: ${before.title}`, body: `Delayed by ${minutes} min. New time ${effectiveTime(after).toISOString().slice(11, 16)} UTC.`, link: `/trips/${tripId}` });
}

/* ------------------------------ ziyarah ------------------------------ */

export async function addZiyarah(actor: Actor, groupId: string, i: { site: string; city: "MAKKAH" | "MADINAH" | "OTHER"; scheduledAt: string }) {
  assertCan(actor, "planning.write");
  await assertGroupWritable(prisma, groupId);
  if (!i.site.trim()) throw new ServiceError("Site is required.");
  const at = new Date(i.scheduledAt);
  if (isNaN(+at)) throw new ServiceError("Invalid date/time.");
  return prisma.$transaction(async (tx) => {
    const trip = await tx.trip.create({ data: { groupId, type: "ZIYARAH", title: `Ziyarah: ${i.site.trim()}`, fromCity: i.city, toCity: i.city, scheduledAt: at } });
    const z = await tx.ziyarahItem.create({ data: { groupId, tripId: trip.id, site: i.site.trim(), city: i.city, scheduledAt: at } });
    await auditCreate({ db: tx, userId: actor.id, entity: "ZiyarahItem", entityId: z.id, record: z });
    return z;
  });
}

export async function markZiyarahDone(actor: Actor, itemId: string) {
  assertCan(actor, "field.write");
  const z = await prisma.ziyarahItem.findUnique({ where: { id: itemId } });
  if (!z) throw new ServiceError("Item not found.", "NOT_FOUND");
  await assertGroupWritable(prisma, z.groupId);
  await prisma.$transaction([
    prisma.ziyarahItem.update({ where: { id: itemId }, data: { done: true, doneAt: new Date() } }),
    prisma.trip.update({ where: { id: z.tripId }, data: { status: "DONE" } }),
  ]);
  await auditEvent({ db: prisma, userId: actor.id, entity: "ZiyarahItem", entityId: itemId, action: "VISIT_DONE", note: z.site });
}
