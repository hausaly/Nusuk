import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notifyRoles, notifyUsers } from "@/lib/notify";
import { dateKey, hourIn, TZ_KSA, TZ_NG } from "@/lib/tz";
import { assertCan } from "@/lib/rbac";
import { CHECK_OWNER, CHECK_TYPES, clearanceOf } from "./clearance";
import { effectiveTime } from "./trips";
import type { Actor } from "./types";
import { ServiceError } from "./types";

/** Default rules. `minutes` = fire when within N minutes before the event; `hour` = fire once per day from that local hour. */
export const DEFAULT_RULES: { key: string; label: string; offsets: { minutes?: number[]; hour?: number } }[] = [
  { key: "red_before_departure", label: "Pilgrim still RED before Nigeria departure", offsets: { minutes: [7 * 1440, 3 * 1440] } },
  { key: "unmatched_docs", label: "Unmatched ticket/visa PDFs waiting (daily, Lagos hour)", offsets: { hour: 8 } },
  { key: "arrival_no_bus", label: "Arriving flight with no bus assigned", offsets: { minutes: [48 * 60] } },
  { key: "flight_arriving", label: "Flight arriving (to pickup staff in charge)", offsets: { minutes: [6 * 60, 60] } },
  { key: "checkout_due", label: "Hotel check-out due (morning of check-out, KSA hour)", offsets: { hour: 6 } },
  { key: "trip_tomorrow", label: "Intercity transfer / ziyarah tomorrow (evening before, KSA hour)", offsets: { hour: 18 } },
  { key: "return_no_bus", label: "Return flight with no drop-off bus", offsets: { minutes: [48 * 60] } },
  { key: "handover_unconfirmed", label: "Handover not confirmed (minutes after sent)", offsets: { minutes: [30] } },
  { key: "visa_expiring", label: "Visa expiring before return flight (daily sweep, Lagos hour)", offsets: { hour: 8 } },
];

export async function ensureRules() {
  for (const r of DEFAULT_RULES) await prisma.reminderRule.upsert({ where: { key: r.key }, update: {}, create: { key: r.key, label: r.label, offsets: r.offsets, enabled: true } });
}

export async function updateRule(actor: Actor, key: string, i: { enabled: boolean; minutes?: number[]; hour?: number }) {
  assertCan(actor, "users.manage"); // Super Admin only
  const rule = await prisma.reminderRule.findUnique({ where: { key } });
  if (!rule) throw new ServiceError("Rule not found.", "NOT_FOUND");
  const o = rule.offsets as { minutes?: number[]; hour?: number };
  const offsets = { ...(o.minutes ? { minutes: (i.minutes ?? o.minutes).filter((m) => m > 0) } : {}), ...(o.hour !== undefined ? { hour: i.hour ?? o.hour } : {}) };
  if (offsets.hour !== undefined && !(offsets.hour >= 0 && offsets.hour <= 23)) throw new ServiceError("Hour must be 0–23.");
  await prisma.reminderRule.update({ where: { key }, data: { enabled: i.enabled, offsets } });
}

const owners = (r: Role[]) => r;

/** Evaluates every enabled rule at `now`. Safe to call repeatedly (ReminderLog dedupes). Returns the number of reminders sent. */
export async function runReminders(now: Date = new Date()): Promise<number> {
  await ensureRules();
  const rules = new Map((await prisma.reminderRule.findMany({ where: { enabled: true } })).map((r) => [r.key, r.offsets as { minutes?: number[]; hour?: number }]));
  let sent = 0;
  const once = async (key: string, send: () => Promise<unknown>) => {
    try { await prisma.reminderLog.create({ data: { key } }); } catch { return; } // already fired
    await send(); sent++;
  };
  const within = (event: Date, m: number) => now.getTime() >= event.getTime() - m * 60_000 && now.getTime() < event.getTime();
  const activeGroups = await prisma.group.findMany({ where: { status: { in: ["PLANNING", "ACTIVE"] } } });
  const gid = activeGroups.map((g) => g.id);

  /* RED before departure */
  const red = rules.get("red_before_departure");
  if (red?.minutes) for (const g of activeGroups) {
    const ps = await prisma.pilgrim.findMany({ where: { groupId: g.id }, include: { checks: true, ticket: true } });
    for (const m of red.minutes) {
      const byRole = new Map<Role, number>(); let redCount = 0;
      for (const p of ps) {
        const dep = p.ticket?.outDepartureAt ?? g.startDate;
        const c = clearanceOf(p.checks);
        if (c.green || !within(dep, m)) continue;
        redCount++;
        for (const b of c.blocking) byRole.set(CHECK_OWNER[b], (byRole.get(CHECK_OWNER[b]) ?? 0) + 1);
      }
      if (!redCount) continue;
      for (const [role, n] of byRole)
        await once(`red:${g.id}:${m}:${role}`, () => notifyRoles(owners([role]), { title: `${g.code}: ${n} pilgrim(s) still RED`, body: `${Math.round(m / 1440)} day(s) before departure – ${n} waiting on your check.`, link: "/pilgrims?status=RED" }));
      await once(`red:${g.id}:${m}:SUPER_ADMIN`, () => notifyRoles(["SUPER_ADMIN"], { title: `${g.code}: ${redCount} pilgrim(s) still RED`, body: `${Math.round(m / 1440)} day(s) before departure.`, link: "/pilgrims?status=RED" }));
    }
  }

  /* Unmatched documents, daily from the configured Lagos hour */
  const um = rules.get("unmatched_docs");
  if (um?.hour !== undefined && hourIn(now, TZ_NG) >= um.hour) for (const type of ["TICKET", "VISA"] as const) {
    const n = await prisma.document.count({ where: { groupId: { in: gid }, type, status: { in: ["UNMATCHED", "NEEDS_REVIEW"] } } });
    if (n) await once(`unmatched:${type}:${dateKey(now, TZ_NG)}`, () => notifyRoles([type === "TICKET" ? "TICKET_OFFICER" : "VISA_OFFICER"], { title: `${n} ${type.toLowerCase()} PDF(s) need attention`, body: "Unmatched or needing review.", link: "/documents" }));
  }

  /* Trip-based rules */
  const trips = await prisma.trip.findMany({ where: { groupId: { in: gid }, status: { not: "DONE" } }, include: { buses: true } });
  const noBus = (type: string, key: string) => {
    const r = rules.get(key);
    if (r?.minutes) return trips.filter((t) => t.type === type && !t.buses.length).flatMap((t) => r.minutes!.filter((m) => within(effectiveTime(t), m)).map((m) => ({ t, m })));
    return [];
  };
  for (const { t, m } of noBus("ARRIVAL_PICKUP", "arrival_no_bus"))
    await once(`nobus:${t.id}:${m}`, () => notifyRoles(["OPERATIONS_STAFF"], { title: `No bus for ${t.title}`, body: `Arrives in ≤ ${Math.round(m / 60)} h and has no bus assigned.`, link: `/trips/${t.id}` }));
  for (const { t, m } of noBus("DEPARTURE_DROPOFF", "return_no_bus"))
    await once(`nobus:${t.id}:${m}`, () => notifyRoles(["OPERATIONS_STAFF"], { title: `No drop-off bus for ${t.title}`, body: `Departs in ≤ ${Math.round(m / 60)} h and has no bus assigned.`, link: `/trips/${t.id}` }));

  const fa = rules.get("flight_arriving");
  if (fa?.minutes) for (const t of trips.filter((x) => x.type === "ARRIVAL_PICKUP")) for (const m of fa.minutes)
    if (within(effectiveTime(t), m)) {
      const staff = t.buses.map((b) => b.staffInChargeId).filter(Boolean) as string[];
      if (staff.length) await once(`arriving:${t.id}:${m}`, () => notifyUsers(staff, { title: `Flight arriving: ${t.title}`, body: `Lands in ≤ ${m >= 60 ? Math.round(m / 60) + " h" : m + " min"} (KSA time).`, link: `/trips/${t.id}` }));
    }

  const tm = rules.get("trip_tomorrow");
  if (tm?.hour !== undefined && hourIn(now, TZ_KSA) >= tm.hour) {
    const tomorrow = dateKey(new Date(now.getTime() + 86_400_000), TZ_KSA);
    for (const t of trips.filter((x) => (x.type === "INTERCITY" || x.type === "ZIYARAH") && dateKey(x.scheduledAt, TZ_KSA) === tomorrow)) {
      const staff = t.buses.map((b) => b.staffInChargeId).filter(Boolean) as string[];
      await once(`tomorrow:${t.id}:${tomorrow}`, () => staff.length ? notifyUsers(staff, { title: `Tomorrow: ${t.title}`, body: "Prepare your bus and passenger list.", link: `/trips/${t.id}` }) : notifyRoles(["OPERATIONS_STAFF"], { title: `Tomorrow: ${t.title}`, body: "No staff in charge assigned yet.", link: `/trips/${t.id}` }));
    }
  }

  const co = rules.get("checkout_due");
  if (co?.hour !== undefined && hourIn(now, TZ_KSA) >= co.hour) {
    const today = dateKey(now, TZ_KSA);
    for (const t of trips.filter((x) => x.type === "INTERCITY" && dateKey(x.scheduledAt, TZ_KSA) === today)) {
      const city = (t.fromCity ?? "").toUpperCase();
      if (city !== "MAKKAH" && city !== "MADINAH") continue;
      const n = await prisma.roomAssignment.count({ where: { checkInAt: { not: null }, checkOutAt: null, room: { hotel: { groupId: t.groupId, city } } } });
      if (n) await once(`checkout:${t.id}:${today}`, () => notifyRoles(["OPERATIONS_STAFF"], { title: `Check-out due today (${city})`, body: `${n} pilgrim(s) still checked in before "${t.title}".`, link: "/hotels" }));
    }
  }

  /* Handovers */
  const ho = rules.get("handover_unconfirmed");
  if (ho?.minutes?.length) {
    for (const h of await prisma.handover.findMany({ where: { status: "SENT", groupId: { in: gid } } }))
      if (now.getTime() >= h.sentAt.getTime() + ho.minutes[0] * 60_000)
        await once(`handover:${h.id}`, () => notifyUsers([h.fromStaffId, h.toStaffId], { title: "Handover not confirmed", body: "A handover has been waiting for confirmation.", link: "/handovers" }));
  }

  /* Visa expiring before return */
  const ve = rules.get("visa_expiring");
  if (ve?.hour !== undefined && hourIn(now, TZ_NG) >= ve.hour) {
    const ps = await prisma.pilgrim.findMany({ where: { groupId: { in: gid }, visa: { isNot: null }, ticket: { isNot: null } }, include: { visa: true, ticket: true } });
    for (const p of ps) if (p.visa!.expiryDate < p.ticket!.retDepartureAt)
      await once(`visa:${p.id}:${dateKey(now, TZ_NG)}`, () => notifyRoles(["VISA_OFFICER", "SUPER_ADMIN"], { title: "Visa expires before return flight", body: p.fullName, link: `/pilgrims/${p.id}` }));
  }
  void CHECK_TYPES;
  return sent;
}
