import { prisma } from "@/lib/db";
import { assertCan, EXPORT_SCOPE } from "@/lib/rbac";
import { fmtZoned, TZ_KSA, TZ_NG } from "@/lib/tz";
import { CHECK_TYPES, clearanceOf } from "./clearance";
import { effectiveTime } from "./trips";
import { pilgrimScope } from "./scope";
import { type Actor, ServiceError } from "./types";

export const REPORTS = {
  bus_manifest: "Bus manifest", rooming_list: "Rooming list", clearance_by_agent: "Clearance report per agent",
  arrivals_departures: "Arrivals & departures schedule", visa_ticket_status: "Visa & ticket status", payment_status: "Payment status",
  ziyarah_attendance: "Ziyarah attendance", handover_log: "Handover log",
} as const;
export type ReportKey = keyof typeof REPORTS;

/** Spec: export scope per role. */
const ACCESS: Record<(typeof EXPORT_SCOPE)[keyof typeof EXPORT_SCOPE], ReportKey[]> = {
  all: Object.keys(REPORTS) as ReportKey[],
  visa: ["visa_ticket_status"], ticket: ["visa_ticket_status"], payment: ["payment_status"],
  ops: ["bus_manifest", "rooming_list", "clearance_by_agent", "arrivals_departures", "ziyarah_attendance", "handover_log"],
  own: ["clearance_by_agent"],
};
export const reportsFor = (actor: Actor) => ACCESS[EXPORT_SCOPE[actor.role]];

export interface ReportData { title: string; subtitle: string; columns: string[]; rows: string[][] }
const f = (d: Date | null | undefined, tz = TZ_KSA) => fmtZoned(d, tz);

export async function buildReport(actor: Actor, key: ReportKey, groupId: string, param?: string): Promise<ReportData> {
  assertCan(actor, "reports.export");
  if (!reportsFor(actor).includes(key)) throw new ServiceError("Your role cannot export this report.");
  const group = await prisma.group.findUnique({ where: { id: groupId } });
  if (!group) throw new ServiceError("Group not found.", "NOT_FOUND");
  const sub = `${group.code} · ${group.name}`;
  const scope = pilgrimScope(actor, groupId);

  switch (key) {
    case "bus_manifest": {
      const trip = await prisma.trip.findFirst({ where: { id: param ?? "", groupId }, include: { buses: { include: { transportCompany: true, passengers: { include: { pilgrim: { include: { agent: true } } } } } } } });
      if (!trip) throw new ServiceError("Select a trip.");
      const rows: string[][] = [];
      for (const b of trip.buses) for (const [i, p] of b.passengers.sort((a, c) => a.pilgrim.fullName.localeCompare(c.pilgrim.fullName)).entries())
        rows.push([`${b.busNo} (${b.vehiclePlate})`, b.transportCompany.name, `${b.driverName} ${b.driverPhone}`, String(i + 1), p.pilgrim.fullName, p.pilgrim.passportNo, p.pilgrim.agent.groupName, p.pilgrim.specialNeeds ?? "", p.boardingStatus]);
      return { title: `Bus manifest – ${trip.title}`, subtitle: `${sub} · ${f(effectiveTime(trip))} KSA`, columns: ["Bus", "Company", "Driver", "#", "Pilgrim", "Passport", "Agent", "Special needs", "Boarding"], rows };
    }
    case "rooming_list": {
      const h = await prisma.hotel.findFirst({ where: { id: param ?? "", groupId }, include: { rooms: { orderBy: { roomNo: "asc" }, include: { assignments: { include: { pilgrim: true } } } } } });
      if (!h) throw new ServiceError("Select a hotel.");
      const rows = h.rooms.flatMap((r) => (r.assignments.length ? r.assignments : [null]).map((a) => [r.roomNo, r.type, r.gender ?? "Family", a?.pilgrim.fullName ?? "(empty)", a?.pilgrim.passportNo ?? "", f(a?.checkInAt), f(a?.checkOutAt)]));
      return { title: `Rooming list – ${h.name}`, subtitle: `${sub} · ${h.city}`, columns: ["Room", "Type", "Gender", "Pilgrim", "Passport", "Check-in", "Check-out"], rows };
    }
    case "clearance_by_agent": {
      const ps = await prisma.pilgrim.findMany({ where: scope, include: { checks: true, agent: true }, orderBy: [{ agent: { groupName: "asc" } }, { fullName: "asc" }] });
      const rows = ps.map((p) => { const c = clearanceOf(p.checks); return [p.agent.groupName, p.fullName, p.passportNo, c.green ? "GREEN" : "RED", c.blocking.join(", ") || "—"]; });
      return { title: "Clearance report per agent", subtitle: sub, columns: ["Agent", "Pilgrim", "Passport", "Status", "Blocked by"], rows };
    }
    case "arrivals_departures": {
      const ts = await prisma.trip.findMany({ where: { groupId, type: { in: ["ARRIVAL_PICKUP", "DEPARTURE_DROPOFF"] } }, orderBy: { scheduledAt: "asc" }, include: { buses: true } });
      return { title: "Arrivals & departures schedule", subtitle: `${sub} · KSA time (Nigeria time in brackets)`, columns: ["Type", "Flight", "Airport", "Terminal", "Time (KSA)", "Time (NG)", "Delay", "Buses"],
        rows: ts.map((t) => [t.type === "ARRIVAL_PICKUP" ? "Arrival" : "Departure", t.flightNo ?? "", t.airport ?? "", t.terminal ?? "", f(effectiveTime(t), TZ_KSA), f(effectiveTime(t), TZ_NG), t.delayMinutes ? `${t.delayMinutes} min` : "", String(t.buses.length)]) };
    }
    case "visa_ticket_status": {
      const ps = await prisma.pilgrim.findMany({ where: { groupId }, include: { visa: true, ticket: true, checks: true }, orderBy: { fullName: "asc" } });
      return { title: "Visa & ticket status", subtitle: sub, columns: ["Pilgrim", "Passport", "Visa", "Visa no.", "Visa expiry", "Ticket", "PNR", "Outbound", "Return"],
        rows: ps.map((p) => [p.fullName, p.passportNo, p.checks.find((c) => c.type === "VISA")?.status ?? "", p.visa?.visaNo ?? "", p.visa ? f(p.visa.expiryDate, TZ_KSA).slice(0, 11) : "", p.checks.find((c) => c.type === "TICKET")?.status ?? "", p.ticket?.pnr ?? "", p.ticket ? `${p.ticket.outFlightNo} ${f(p.ticket.outDepartureAt, TZ_NG)}` : "", p.ticket ? `${p.ticket.retFlightNo} ${f(p.ticket.retDepartureAt, TZ_KSA)}` : ""]) };
    }
    case "payment_status": {
      const ps = await prisma.pilgrim.findMany({ where: { groupId }, include: { checks: true, agent: true }, orderBy: [{ agent: { groupName: "asc" } }, { fullName: "asc" }] });
      return { title: "Payment status", subtitle: sub, columns: ["Agent", "Pilgrim", "Passport", "Payment", "Updated", "Note"],
        rows: ps.map((p) => { const c = p.checks.find((x) => x.type === "PAYMENT"); return [p.agent.groupName, p.fullName, p.passportNo, c?.status ?? "PENDING", f(c?.updatedAt), c?.note ?? ""]; }) };
    }
    case "ziyarah_attendance": {
      const items = await prisma.ziyarahItem.findMany({ where: { groupId }, orderBy: { scheduledAt: "asc" }, include: { trip: { include: { buses: { include: { passengers: true } } } } } });
      return { title: "Ziyarah attendance", subtitle: sub, columns: ["Site", "City", "When (KSA)", "Done", "Seated", "Boarded", "Stayed behind"],
        rows: items.map((z) => { const ps = z.trip.buses.flatMap((b) => b.passengers); return [z.site, z.city, f(z.scheduledAt), z.done ? "Yes" : "No", String(ps.length), String(ps.filter((p) => p.boardingStatus === "BOARDED").length), String(ps.filter((p) => p.boardingStatus === "STAYED_BEHIND").length)]; }) };
    }
    case "handover_log": {
      const hs = await prisma.handover.findMany({ where: { groupId }, orderBy: { sentAt: "desc" } });
      const users = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
      return { title: "Handover log", subtitle: sub, columns: ["Sent", "From", "To", "Scope", "Status", "Confirmed", "Notes", "Issues"],
        rows: hs.map((h) => [f(h.sentAt), users.get(h.fromStaffId) ?? "", users.get(h.toStaffId) ?? "", h.scope, h.status, f(h.confirmedAt), h.notes ?? "", h.issues ?? ""]) };
    }
  }
}
void CHECK_TYPES;
