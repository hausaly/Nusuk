import { prisma } from "@/lib/db";
import { dateKey, TZ_KSA } from "@/lib/tz";
import { CHECK_TYPES } from "./clearance";
import { effectiveTime } from "./trips";
import { pilgrimScope } from "./scope";
import type { Actor } from "./types";

export async function groupDashboard(actor: Actor, groupId: string) {
  const scope = pilgrimScope(actor, groupId);
  const pilgrims = await prisma.pilgrim.findMany({ where: scope, select: { id: true, journeyStatus: true, checks: { select: { type: true, status: true } } } });
  let green = 0; const redBy: Record<string, number> = Object.fromEntries(CHECK_TYPES.map((t) => [t, 0]));
  for (const p of pilgrims) {
    const blocking = CHECK_TYPES.filter((t) => p.checks.find((c) => c.type === t)?.status !== "CLEARED");
    if (!blocking.length) green++; else blocking.forEach((b) => redBy[b]++);
  }
  const journey: Record<string, number> = {};
  for (const p of pilgrims) journey[p.journeyStatus] = (journey[p.journeyStatus] ?? 0) + 1;

  const now = new Date(), today = dateKey(now, TZ_KSA);
  const trips = await prisma.trip.findMany({ where: { groupId }, orderBy: { scheduledAt: "asc" }, include: { buses: { include: { _count: { select: { passengers: true } } } } } });
  const withCount = async (t: (typeof trips)[number]) => ({
    ...t, eff: effectiveTime(t), seated: t.buses.reduce((s, b) => s + b._count.passengers, 0), hasBus: t.buses.length > 0,
    expected: t.autoKey ? await prisma.ticket.count({ where: { pilgrim: { groupId }, ...(t.type === "ARRIVAL_PICKUP" ? { outFlightNo: t.flightNo!, outArrivalAirport: t.airport! } : { retFlightNo: t.flightNo!, retDepartureAirport: t.airport! }) } }) : null,
  });
  const todays = await Promise.all(trips.filter((t) => (t.type === "ARRIVAL_PICKUP" || t.type === "DEPARTURE_DROPOFF") && dateKey(effectiveTime(t), TZ_KSA) === today).map(withCount));
  const next48 = trips.filter((t) => effectiveTime(t) >= now && effectiveTime(t).getTime() <= now.getTime() + 48 * 3600_000);

  const assignments = actor.role === "AGENT" ? [] : await prisma.roomAssignment.findMany({ where: { room: { hotel: { groupId } } }, select: { checkInAt: true, checkOutAt: true } });
  return {
    total: pilgrims.length, green, red: pilgrims.length - green, redBy, journey,
    arrivals: todays.filter((t) => t.type === "ARRIVAL_PICKUP"), departures: todays.filter((t) => t.type === "DEPARTURE_DROPOFF"),
    pendingCheckIns: assignments.filter((a) => !a.checkInAt).length, pendingCheckOuts: assignments.filter((a) => a.checkInAt && !a.checkOutAt).length,
    next48,
  };
}

export async function roleDashboard(groupId: string) {
  const [unmatched, visaPending, ticketPending, payPending] = await Promise.all([
    prisma.document.findMany({ where: { groupId, status: { in: ["UNMATCHED", "NEEDS_REVIEW", "EXTRACTED"] } }, orderBy: { createdAt: "desc" }, take: 50 }),
    prisma.pilgrim.count({ where: { groupId, checks: { some: { type: "VISA", status: "PENDING" } } } }),
    prisma.pilgrim.count({ where: { groupId, checks: { some: { type: "TICKET", status: "PENDING" } } } }),
    prisma.pilgrim.findMany({ where: { groupId, checks: { some: { type: "PAYMENT", status: "PENDING" } } }, select: { id: true, fullName: true, agent: { select: { groupName: true } } }, orderBy: { fullName: "asc" }, take: 100 }),
  ]);
  return { unmatched, visaPending, ticketPending, payPending };
}
