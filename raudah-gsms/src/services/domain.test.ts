import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";
import { MockProvider, setWhatsAppProvider } from "@/lib/notify";
import { zonedToUtc } from "@/lib/tz";
import { actorOf, ensureMigrated, makeAgent, makeGroup, makePilgrim, makeUser, resetDb } from "@/tests/db";
import { ServiceError } from "./types";
import { archiveGroup, createGroup, duplicateGroup } from "./groups";
import { createPilgrim, getPilgrim, listPilgrims, updatePilgrim, parseImport, previewImport, commitImport } from "./pilgrims";
import { clearanceOf, setCheck } from "./clearance";
import { assignRoom, autoFillRooms, checkIn, createHotel, addRooms } from "./hotels";
import { addBus, addZiyarah, assignPassengers, createTrip, markBoarding, setDelay, syncAirportTrips } from "./trips";
import { respondHandover, sendHandover } from "./handovers";
import { bulkConfirm, computeWarnings, confirmDocument, uploadDocuments } from "./documents";
import { runReminders } from "./reminders";
import { buildReport } from "./reports";
import { makePilgrims } from "../../prisma/seed-data";

beforeAll(ensureMigrated);
beforeEach(async () => { await resetDb(); MockProvider.sent.length = 0; setWhatsAppProvider(null); });

async function world() {
  const admin = await makeUser("SUPER_ADMIN"), ops = await makeUser("OPERATIONS_STAFF", { phone: "+2348031111111" });
  const agent = await makeAgent("Alpha"), other = await makeAgent("Beta");
  const group = await makeGroup();
  return { admin, ops, agent, other, group, A: actorOf(admin), O: actorOf(ops) };
}

describe("business rule 1/4: clearance and RED blocking (acceptance 1)", () => {
  it("is GREEN only when all 4 checks are CLEARED, and names the blocking checks", async () => {
    expect(clearanceOf([{ type: "PAYMENT", status: "CLEARED" }, { type: "DOCUMENTS", status: "CLEARED" }, { type: "VISA", status: "CLEARED" }, { type: "TICKET", status: "CLEARED" }]).green).toBe(true);
    const c = clearanceOf([{ type: "PAYMENT", status: "PENDING" }, { type: "DOCUMENTS", status: "CLEARED" }, { type: "VISA", status: "CLEARED" }]);
    expect(c.green).toBe(false); expect(c.blocking).toEqual(["PAYMENT", "TICKET"]);
  });

  it("a pilgrim with ANY pending check cannot be added to a bus or a room (server rejects, naming the check)", async () => {
    const { A, group, agent } = await world();
    const red = await makePilgrim(group.id, agent.id, { pending: ["VISA"] }), green = await makePilgrim(group.id, agent.id);
    const hotel = await createHotel(A, group.id, { name: "H", city: "MAKKAH" });
    await addRooms(A, hotel.id, { from: 1, to: 1, type: "QUAD" });
    const room = await prisma.room.findFirstOrThrow({ where: { hotelId: hotel.id } });
    await expect(assignRoom(A, room.id, red.id)).rejects.toThrow(/RED.*VISA/);
    await assignRoom(A, room.id, green.id);

    const trip = await createTrip(A, group.id, { type: "INTERCITY", title: "T", scheduledAt: new Date("2026-12-07T05:00:00Z").toISOString() });
    const bus = await addBus(A, trip.id, { company: "C", vehiclePlate: "X1", busNo: "1", driverName: "D", driverPhone: "1" });
    await expect(assignPassengers(A, bus.id, [red.id])).rejects.toThrow(/RED.*VISA/);
    expect((await assignPassengers(A, bus.id, [green.id, red.id])).added).toBe(1);
    expect(await prisma.tripPassenger.count()).toBe(1);
    await expect(checkIn(A, room.id, red.id)).rejects.toBeInstanceOf(ServiceError);
  });

  it("rule 3: clearing → pending turns RED and notifies the Super Admin; unauthorised roles cannot set a check", async () => {
    const { A, ops, admin, group, agent } = await world();
    const p = await makePilgrim(group.id, agent.id);
    await expect(setCheck(actorOf(ops), p.id, "PAYMENT", "PENDING")).rejects.toBeInstanceOf(ForbiddenError); // OPS cannot touch payment
    await setCheck(actorOf(ops), p.id, "DOCUMENTS", "PENDING");
    const n = await prisma.notification.findMany({ where: { userId: admin.id, channel: "IN_APP" } });
    expect(n).toHaveLength(1); expect(n[0].body).toMatch(/DOCUMENTS.*PENDING/);
    const log = await prisma.auditLog.findFirst({ where: { entity: "ClearanceCheck", entityId: `${p.id}:DOCUMENTS`, field: "status" } });
    expect(log).toMatchObject({ oldValue: "CLEARED", newValue: "PENDING", userId: ops.id });
  });
});

describe("rule 9: pilgrims and agents never receive messages", () => {
  it("notifications go to staff only (in-app + WhatsApp), never to AGENT users", async () => {
    const { A, group, agent, ops } = await world();
    const au = await makeUser("AGENT", { agentId: agent.id, phone: "+2348032222222" });
    const p = await makePilgrim(group.id, agent.id);
    await setCheck(A, p.id, "PAYMENT", "PENDING"); // cleared→pending alerts SUPER_ADMIN
    expect(await prisma.notification.count({ where: { userId: au.id } })).toBe(0);
    expect(MockProvider.sent.every((m) => m.to !== "+2348032222222")).toBe(true);
    void ops;
  });
});

describe("agent row-level security (acceptance 4)", () => {
  it("agent sees only own pilgrims, cannot read another agent's pilgrim, and every write is Forbidden", async () => {
    const { group, agent, other } = await world();
    const mine = await makePilgrim(group.id, agent.id, { name: "MINE ONE" }), theirs = await makePilgrim(group.id, other.id, { name: "THEIRS ONE" });
    const au = actorOf(await makeUser("AGENT", { agentId: agent.id }));
    const list = await listPilgrims(au, { groupId: group.id });
    expect(list.rows.map((r) => r.fullName)).toEqual(["MINE ONE"]);
    expect((await listPilgrims(au, { groupId: group.id, agentId: other.id })).rows.map((r) => r.fullName)).toEqual(["MINE ONE"]); // agent filter param cannot widen scope
    await expect(getPilgrim(au, theirs.id)).rejects.toThrow(/not found/i);
    expect((await getPilgrim(au, mine.id)).id).toBe(mine.id);
    const input = { fullName: "X", passportNo: "A1234567", passportExpiry: "2030-01-01", dateOfBirth: "1980-01-01", gender: "M", agentId: agent.id, phoneNigeria: "0803", emergencyContactName: "k", emergencyContactPhone: "0803" };
    await expect(createPilgrim(au, group.id, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(updatePilgrim(au, mine.id, input)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setCheck(au, mine.id, "PAYMENT", "CLEARED")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(assignRoom(au, "x", mine.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(createTrip(au, group.id, { type: "INTERCITY", title: "t", scheduledAt: "2026-12-01T00:00:00Z" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(sendHandover(au, group.id, { toStaffId: "x", scope: "BUS", tripBusId: "y" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(buildReport(au, "payment_status", group.id)).rejects.toThrow(/cannot export/);
    const r = await buildReport(au, "clearance_by_agent", group.id);
    expect(r.rows.map((x) => x[1])).toEqual(["MINE ONE"]);
  });
});

describe("groups (acceptance 5)", () => {
  it("codes are UMR-YYYY-NNN, and duplicate copies hotels, rooms, trip templates and ziyarah — zero pilgrims", async () => {
    const { A, ops, agent } = await world();
    const g = await createGroup(A, { name: "G1", startDate: "2026-12-01", endDate: "2026-12-12", arrivalAirport: "jed", departureAirport: "MED", supervisorId: ops.id, agentIds: [agent.id] });
    expect(g.code).toMatch(/^UMR-2026-\d{3}$/);
    const g2 = await createGroup(A, { name: "G1b", startDate: "2026-12-05", endDate: "2026-12-15", arrivalAirport: "JED", departureAirport: "MED" });
    expect(g2.code).not.toBe(g.code);
    const h = await createHotel(A, g.id, { name: "Makkah H", city: "MAKKAH" });
    await addRooms(A, h.id, { from: 1, to: 6, type: "QUAD", gender: "F" });
    await createTrip(A, g.id, { type: "INTERCITY", title: "Makkah → Madinah", scheduledAt: "2026-12-07T05:00:00Z" });
    await addZiyarah(A, g.id, { site: "Quba", city: "MADINAH", scheduledAt: "2026-12-09T06:00:00Z" });
    const p = await makePilgrim(g.id, agent.id);
    const trip = await prisma.trip.findFirstOrThrow({ where: { groupId: g.id, type: "INTERCITY" } });
    await addBus(A, trip.id, { company: "C", vehiclePlate: "P", busNo: "1", driverName: "D", driverPhone: "1" });
    void p;

    const copy = await duplicateGroup(A, g.id, { name: "Copy", startDate: "2027-03-01" });
    expect(await prisma.pilgrim.count({ where: { groupId: copy.id } })).toBe(0);
    expect(await prisma.hotel.count({ where: { groupId: copy.id } })).toBe(1);
    expect(await prisma.room.count({ where: { hotel: { groupId: copy.id } } })).toBe(6);
    expect(await prisma.trip.count({ where: { groupId: copy.id } })).toBe(2); // intercity + ziyarah trip
    expect(await prisma.ziyarahItem.count({ where: { groupId: copy.id } })).toBe(1);
    expect(await prisma.tripBus.count({ where: { trip: { groupId: copy.id } } })).toBe(0); // no buses/passengers
    const z = await prisma.ziyarahItem.findFirstOrThrow({ where: { groupId: copy.id } });
    expect(z.scheduledAt.toISOString()).toBe("2027-03-09T06:00:00.000Z"); // shifted +90 days with the new start date
    expect((await prisma.group.findUniqueOrThrow({ where: { id: copy.id } })).supervisorId).toBe(ops.id);
  });

  it("archived groups are read-only", async () => {
    const { A, group, agent } = await world();
    await archiveGroup(A, group.id);
    const input = { fullName: "X", passportNo: "A1234567", passportExpiry: "2030-01-01", dateOfBirth: "1980-01-01", gender: "M", agentId: agent.id, phoneNigeria: "0803", emergencyContactName: "k", emergencyContactPhone: "0803" };
    await expect(createPilgrim(A, group.id, input)).rejects.toThrow(/archived/);
    await expect(createTrip(A, group.id, { type: "INTERCITY", title: "t", scheduledAt: "2026-12-01T00:00:00Z" })).rejects.toThrow(/archived/);
  });
});

describe("audit (acceptance 6)", () => {
  it("pilgrim edits are logged with old and new values", async () => {
    const { O, group, agent } = await world();
    const p = await makePilgrim(group.id, agent.id, { name: "OLD NAME" });
    await updatePilgrim(O, p.id, { fullName: "NEW NAME", passportNo: p.passportNo, passportExpiry: "2030-01-01", dateOfBirth: "1980-01-01", gender: "M", agentId: agent.id, phoneNigeria: "+2348030000000", emergencyContactName: "Kin", emergencyContactPhone: "+2348030000001" });
    expect(await prisma.auditLog.findFirst({ where: { entity: "Pilgrim", entityId: p.id, field: "fullName" } })).toMatchObject({ oldValue: "OLD NAME", newValue: "NEW NAME", action: "UPDATE" });
  });
});

describe("rooms (rule 5)", () => {
  it("respects capacity and room gender; auto-fill keeps families together and skips RED", async () => {
    const { A, group, agent } = await world();
    const h = await createHotel(A, group.id, { name: "H", city: "MAKKAH" });
    await addRooms(A, h.id, { from: 1, to: 2, type: "QUAD", gender: "M" });   // 1,2 male
    await addRooms(A, h.id, { from: 3, to: 4, type: "QUAD", gender: null, prefix: "F" }); // F3,F4 family
    const rooms = await prisma.room.findMany({ where: { hotelId: h.id }, orderBy: { roomNo: "asc" } });
    const female = await makePilgrim(group.id, agent.id, { gender: "F" });
    await expect(assignRoom(A, rooms[0].id, female.id)).rejects.toThrow(/male-only/);
    const m = await Promise.all([1, 2, 3, 4, 5].map(() => makePilgrim(group.id, agent.id)));
    for (const x of m.slice(0, 4)) await assignRoom(A, rooms[0].id, x.id);
    await expect(assignRoom(A, rooms[0].id, m[4].id)).rejects.toThrow(/full/);
    // moving within the hotel logs a room change
    await prisma.roomAssignment.deleteMany({}); await prisma.roomChangeLog.deleteMany({});

    const fam = await Promise.all([makePilgrim(group.id, agent.id, { gender: "M", familyLinkId: "F1" }), makePilgrim(group.id, agent.id, { gender: "F", familyLinkId: "F1" }), makePilgrim(group.id, agent.id, { gender: "F", familyLinkId: "F1" })]);
    const red = await makePilgrim(group.id, agent.id, { pending: ["PAYMENT"] });
    const res = await autoFillRooms(A, h.id);
    expect(res.redSkipped).toBe(1);
    const rf = await prisma.roomAssignment.findMany({ where: { pilgrimId: { in: fam.map((f) => f.id) } } });
    expect(new Set(rf.map((a) => a.roomId)).size).toBe(1); // family together
    expect((await prisma.room.findUniqueOrThrow({ where: { id: rf[0].roomId } })).gender).toBeNull(); // mixed family → unrestricted room
    expect(await prisma.roomAssignment.count({ where: { pilgrimId: red.id } })).toBe(0);
    const moved = await prisma.pilgrim.findMany({ where: { id: female.id } });
    void moved;
  });
});

describe("tickets, visas and trips (acceptance 2 & 3)", () => {
  const sample = path.join(process.cwd(), "samples/tickets/group-ticket-5-passengers.pdf");

  async function demoGroup() {
    const w = await world();
    const demo = makePilgrims(150);
    const pilgrims = [];
    for (const i of [141, 142, 143, 144, 145]) { const d = demo[i - 1]; pilgrims.push(await makePilgrim(w.group.id, w.agent.id, { name: d.fullName, passportNo: d.passportNo, pending: ["TICKET"] })); }
    return { ...w, pilgrims, demo };
  }

  it.skipIf(!existsSync(sample))("a group ticket PDF with 5 passengers creates 5 matched records (acceptance 2)", async () => {
    const { O: _o, admin, group, pilgrims } = await demoGroup();
    const ticketOfficer = actorOf(await makeUser("TICKET_OFFICER"));
    const docs = await uploadDocuments(ticketOfficer, group.id, "TICKET", [{ name: "group.pdf", data: readFileSync(sample) }]);
    expect(docs).toHaveLength(1);
    const all = await prisma.document.findMany({ where: { groupId: group.id, type: "TICKET" }, orderBy: { passengerIndex: "asc" } });
    expect(all, `doc error: ${all[0]?.error} status: ${all[0]?.status}`).toHaveLength(5);
    expect(all.every((d) => d.pilgrimId && d.status === "EXTRACTED")).toBe(true);
    expect(new Set(all.map((d) => d.pilgrimId))).toEqual(new Set(pilgrims.map((p) => p.id)));
    expect(new Set(all.map((d) => d.fileKey)).size).toBe(1); // one PDF, 5 records
    expect((all[0].fieldConfidence as any).pnr).toBeGreaterThanOrEqual(0.85);
    void admin; void _o;
  });

  it.skipIf(!existsSync(sample))("bulk-confirm saves tickets, clears TICKET, auto-creates pick-up and drop-off trips (acceptance 3) and is idempotent", async () => {
    const { group, pilgrims } = await demoGroup();
    const to = actorOf(await makeUser("TICKET_OFFICER"));
    await uploadDocuments(to, group.id, "TICKET", [{ name: "group.pdf", data: readFileSync(sample) }]);
    const r = await bulkConfirm(to, group.id, "TICKET");
    expect(r.confirmed).toBe(5);
    expect(await prisma.ticket.count()).toBe(5);
    const checks = await prisma.clearanceCheck.findMany({ where: { pilgrimId: { in: pilgrims.map((p) => p.id) }, type: "TICKET" } });
    expect(checks.every((c) => c.status === "CLEARED")).toBe(true);
    const trips = await prisma.trip.findMany({ where: { groupId: group.id }, orderBy: { type: "asc" } });
    // one arrival flight; the 5 pilgrims fly back on two different return flights → two drop-off trips
    expect(trips.map((t) => t.type).sort()).toEqual(["ARRIVAL_PICKUP", "DEPARTURE_DROPOFF", "DEPARTURE_DROPOFF"]);
    const arr = trips.find((t) => t.type === "ARRIVAL_PICKUP")!;
    expect(arr.flightNo).toBe("P47122"); expect(arr.airport).toBe("MED");
    expect(arr.scheduledAt.toISOString()).toBe(zonedToUtc("2026-12-03T09:30", "Asia/Riyadh").toISOString()); // KSA local → UTC
    await syncAirportTrips(prisma, group.id); // idempotent
    expect(await prisma.trip.count({ where: { groupId: group.id } })).toBe(3);
  });

  it("warnings: visa expiring before return, passport <6 months, duplicate numbers, name mismatch", async () => {
    const { group, agent } = await world();
    const p = await makePilgrim(group.id, agent.id, { name: "MUSA ADAMU", expiry: "2027-03-01" });
    const q = await makePilgrim(group.id, agent.id);
    await prisma.ticket.create({ data: { pilgrimId: q.id, pnr: "AAAAAA", ticketNo: "1111111111111", airline: "X", outFlightNo: "X1", outDepartureAirport: "LOS", outDepartureAt: new Date(), outArrivalAirport: "JED", outArrivalAt: new Date(), retFlightNo: "X2", retDepartureAirport: "MED", retDepartureAt: new Date(), retArrivalAirport: "LOS", retArrivalAt: new Date() } });
    await prisma.visa.create({ data: { pilgrimId: q.id, visaNo: "V1", issueDate: new Date(), expiryDate: new Date(), permittedStayDays: 30, entryType: "x" } });
    const w = await computeWarnings(prisma, p, { name: "OMAR SULEIMAN", ticketNo: "1111111111111", visaNo: "V1", visaExpiry: new Date("2026-12-10"), returnAt: new Date("2026-12-12"), travelAt: new Date("2026-12-01") });
    expect(w.map((x) => x.code).sort()).toEqual(["DUP_TICKET", "DUP_VISA", "NAME_MISMATCH", "PASSPORT_EXPIRING", "VISA_EXPIRES_BEFORE_RETURN"]);
    expect(await computeWarnings(prisma, p, { name: "Adamu Musa Mr", visaExpiry: new Date("2027-02-01"), returnAt: new Date("2026-12-12"), travelAt: new Date("2026-06-01") })).toEqual([]);
  });

  it("confirming a visa clears VISA; a visa that expires before the return flight alerts Visa officer + Super Admin", async () => {
    const { group, agent, admin } = await world();
    const vo = await makeUser("VISA_OFFICER");
    const p = await makePilgrim(group.id, agent.id, { name: "TEST PILGRIM", pending: ["VISA"] });
    await prisma.ticket.create({ data: { pilgrimId: p.id, pnr: "AAAAAA", ticketNo: "2222222222222", airline: "X", outFlightNo: "X1", outDepartureAirport: "LOS", outDepartureAt: new Date("2026-12-01"), outArrivalAirport: "JED", outArrivalAt: new Date("2026-12-02"), retFlightNo: "X2", retDepartureAirport: "MED", retDepartureAt: new Date("2026-12-12T05:00:00Z"), retArrivalAirport: "LOS", retArrivalAt: new Date("2026-12-12") } });
    const doc = await prisma.document.create({ data: { groupId: group.id, type: "VISA", fileKey: "x", fileName: "v.pdf", uploadedById: vo.id, status: "EXTRACTED" } });
    const r = await confirmDocument(actorOf(vo), doc.id, { pilgrimId: p.id, fields: { visaNo: "V9", passengerName: "TEST PILGRIM", passportNo: p.passportNo, issueDate: "2026-10-01", expiryDate: "2026-12-10", permittedStayDays: "30", entryType: "Umrah" } });
    expect(r.warnings.map((w) => w.code)).toContain("VISA_EXPIRES_BEFORE_RETURN");
    expect((await prisma.clearanceCheck.findUniqueOrThrow({ where: { pilgrimId_type: { pilgrimId: p.id, type: "VISA" } } })).status).toBe("CLEARED");
    expect(await prisma.notification.count({ where: { userId: { in: [vo.id, admin.id] }, title: { contains: "Visa expires" } } })).toBe(2);
    // a ticket officer may not confirm visas
    await expect(confirmDocument(actorOf(await makeUser("TICKET_OFFICER")), doc.id, { pilgrimId: p.id, fields: {} })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("trips: boarding, delay, handover (rules 4, 8)", () => {
  it("one bus per pilgrim per trip, boarding updates journey, delay notifies staff in charge + admin", async () => {
    const { A, ops, admin, group, agent } = await world();
    const p = await makePilgrim(group.id, agent.id);
    const t = await createTrip(A, group.id, { type: "ARRIVAL_PICKUP", title: "Arrival X1", flightNo: "X1", airport: "JED", scheduledAt: "2026-12-02T10:00:00Z" });
    const b1 = await addBus(A, t.id, { company: "C", vehiclePlate: "A", busNo: "1", driverName: "D", driverPhone: "1", staffInChargeId: ops.id });
    const b2 = await addBus(A, t.id, { company: "C", vehiclePlate: "B", busNo: "2", driverName: "D", driverPhone: "1" });
    await assignPassengers(A, b1.id, [p.id]); await assignPassengers(A, b2.id, [p.id]); // moves, not duplicates
    expect(await prisma.tripPassenger.count({ where: { pilgrimId: p.id } })).toBe(1);
    expect((await prisma.tripPassenger.findFirstOrThrow({})).tripBusId).toBe(b2.id);
    await markBoarding(actorOf(ops), t.id, p.id, "BOARDED");
    expect((await prisma.pilgrim.findUniqueOrThrow({ where: { id: p.id } })).journeyStatus).toBe("ARRIVED");
    await expect(markBoarding(actorOf(await makeUser("VISA_OFFICER")), t.id, p.id, "MISSING")).rejects.toBeInstanceOf(ForbiddenError);
    await setDelay(actorOf(ops), t.id, 90);
    expect((await prisma.trip.findUniqueOrThrow({ where: { id: t.id } })).delayMinutes).toBe(90);
    expect(await prisma.notification.count({ where: { userId: ops.id, title: { contains: "delay", mode: "insensitive" } } })).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { userId: admin.id, title: { contains: "delay", mode: "insensitive" } } })).toBeGreaterThan(0);
  });

  it("handover changes responsibility only after the receiver confirms", async () => {
    const { ops, group, agent } = await world();
    const bob = await makeUser("OPERATIONS_STAFF");
    const p = await makePilgrim(group.id, agent.id);
    const h = await sendHandover(actorOf(ops), group.id, { toStaffId: bob.id, scope: "PILGRIMS", pilgrimIds: [p.id], notes: "n" });
    expect((await prisma.pilgrim.findUniqueOrThrow({ where: { id: p.id } })).currentResponsibleStaffId).toBeNull();
    await expect(respondHandover(actorOf(ops), h.id, true)).rejects.toThrow(/receiving/); // sender cannot confirm
    await respondHandover(actorOf(bob), h.id, true);
    expect((await prisma.pilgrim.findUniqueOrThrow({ where: { id: p.id } })).currentResponsibleStaffId).toBe(bob.id);
    await expect(respondHandover(actorOf(bob), h.id, true)).rejects.toThrow(/already/);
  });
});

describe("reminders fire at configured offsets in the correct time zone (acceptance 7)", () => {
  it("RED before departure: fires at 7d and 3d (once each), to the check owner + Super Admin", async () => {
    const { group, agent, admin } = await world();
    const fin = await makeUser("FINANCE_STAFF", { phone: "+2348033333333" });
    await makePilgrim(group.id, agent.id, { pending: ["PAYMENT"] });
    // departure = group start 2026-12-01T00:00Z
    expect(await runReminders(new Date("2026-11-23T23:59:00Z"))).toBe(0);      // 7d + 1min before: too early
    expect(await runReminders(new Date("2026-11-24T00:00:00Z"))).toBe(2);      // exactly 7d: finance + super admin
    expect(await runReminders(new Date("2026-11-24T06:00:00Z"))).toBe(0);      // deduped
    expect(await prisma.notification.count({ where: { userId: fin.id, channel: "IN_APP" } })).toBe(1);
    expect(await prisma.notification.count({ where: { userId: admin.id, channel: "IN_APP" } })).toBe(1);
    expect(MockProvider.sent.some((m) => m.to === "+2348033333333" && m.template.startsWith("raudah_"))).toBe(true); // WhatsApp template prefix
    expect(await runReminders(new Date("2026-11-28T00:00:00Z"))).toBe(2);      // 3d offset fires too
  });

  it("hotel check-out reminder fires from 06:00 KSA (03:00 UTC), not 05:59 KSA; trip-tomorrow from 18:00 KSA", async () => {
    const { A, group, agent } = await world();
    const ops = await makeUser("OPERATIONS_STAFF");
    const h = await createHotel(A, group.id, { name: "Makkah H", city: "MAKKAH" });
    await addRooms(A, h.id, { from: 1, to: 1, type: "QUAD" });
    const room = await prisma.room.findFirstOrThrow({ where: { hotelId: h.id } });
    const p = await makePilgrim(group.id, agent.id);
    await assignRoom(A, room.id, p.id); await checkIn(A, room.id, p.id);
    const trip = await createTrip(A, group.id, { type: "INTERCITY", title: "Makkah → Madinah", fromCity: "MAKKAH", toCity: "MADINAH", scheduledAt: zonedToUtc("2026-12-07T08:00", "Asia/Riyadh").toISOString() });
    void trip;
    expect(await runReminders(new Date("2026-12-07T02:59:00Z"))).toBe(0);      // 05:59 KSA
    expect(await runReminders(new Date("2026-12-07T03:00:00Z"))).toBe(1);      // 06:00 KSA → ops
    expect(await prisma.notification.count({ where: { userId: ops.id, title: { contains: "Check-out due" } } })).toBe(1);
    // evening before (06 Dec): 17:59 KSA = 14:59Z → no; 18:00 KSA = 15:00Z → yes
    const before = await prisma.notification.count();
    await runReminders(new Date("2026-12-06T14:59:00Z"));
    expect(await prisma.notification.count()).toBe(before);
    await runReminders(new Date("2026-12-06T15:00:00Z"));
    expect(await prisma.notification.count({ where: { title: { contains: "Tomorrow" } } })).toBeGreaterThan(0);
  });

  it("arrival with no bus fires 48h before; flight arriving fires 6h and 1h before to the staff in charge; disabled rules do not fire", async () => {
    const { A, ops, group } = await world();
    const t = await createTrip(A, group.id, { type: "ARRIVAL_PICKUP", title: "Arrival SV1", flightNo: "SV1", airport: "JED", scheduledAt: "2026-12-02T15:00:00Z" });
    expect(await runReminders(new Date("2026-11-30T14:59:00Z"))).toBe(0);
    expect(await runReminders(new Date("2026-11-30T15:00:00Z"))).toBe(1);      // 48h → ops "no bus"
    await addBus(A, t.id, { company: "C", vehiclePlate: "A", busNo: "1", driverName: "D", driverPhone: "1", staffInChargeId: ops.id });
    expect(await runReminders(new Date("2026-12-02T08:59:00Z"))).toBe(0);
    expect(await runReminders(new Date("2026-12-02T09:00:00Z"))).toBe(1);      // 6h before
    expect(await runReminders(new Date("2026-12-02T14:00:00Z"))).toBe(1);      // 1h before
    await prisma.reminderRule.update({ where: { key: "flight_arriving" }, data: { enabled: false } });
    const t2 = await createTrip(A, group.id, { type: "ARRIVAL_PICKUP", title: "Arrival SV2", flightNo: "SV2", airport: "JED", scheduledAt: "2026-12-03T15:00:00Z" });
    await addBus(A, t2.id, { company: "C", vehiclePlate: "B", busNo: "2", driverName: "D", driverPhone: "1", staffInChargeId: ops.id });
    expect(await runReminders(new Date("2026-12-03T09:00:00Z"))).toBe(0);
  });

  it("unconfirmed handover reminder 30 min after sending, to both staff", async () => {
    const { ops, group, agent } = await world();
    const bob = await makeUser("OPERATIONS_STAFF");
    const p = await makePilgrim(group.id, agent.id);
    const h = await sendHandover(actorOf(ops), group.id, { toStaffId: bob.id, scope: "PILGRIMS", pilgrimIds: [p.id] });
    expect(await runReminders(new Date(h.sentAt.getTime() + 29 * 60_000))).toBe(0);
    expect(await runReminders(new Date(h.sentAt.getTime() + 30 * 60_000))).toBe(1);
    expect(await prisma.notification.count({ where: { title: { contains: "not confirmed" }, channel: "IN_APP" } })).toBe(2);
  });
});

describe("bulk import", () => {
  it("validates rows (preview), reports errors per row, saves only valid rows", async () => {
    const { A, agent, group } = await world();
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("x");
    ws.addRow(["Raudah Travels & Tours Ltd"]); ws.addRow([]); ws.addRow([]); ws.addRow([]); // branded template header rows
    ws.addRow(["Full Name", "Passport No", "Passport Expiry", "Date of Birth", "Gender", "Phone Nigeria", "Agent Group Name", "Emergency Contact Name", "Emergency Contact Phone"]);
    ws.addRow(["Good One", "A1234567", "2030-05-01", "1980-02-02", "M", "08031234567", "Alpha", "Kin", "08030000000"]);
    ws.addRow(["Bad Date", "A7654321", "not-a-date", "1980-02-02", "M", "08031234567", "Alpha", "Kin", "08030000000"]);
    ws.addRow(["Unknown Agent", "A1111111", "2030-05-01", "1980-02-02", "F", "08031234567", "Nope", "Kin", "08030000000"]);
    ws.addRow(["Dup Passport", "A1234567", "2030-05-01", "1980-02-02", "F", "08031234567", "Alpha", "Kin", "08030000000"]);
    const rows = await parseImport(Buffer.from(await wb.xlsx.writeBuffer()), "t.xlsx");
    expect(rows).toHaveLength(4);
    const prev = await previewImport(A, group.id, rows);
    expect(prev.map((r) => r.errors.length > 0)).toEqual([false, true, true, true]);
    expect(prev[1].errors.join()).toMatch(/Passport expiry/); expect(prev[2].errors.join()).toMatch(/Unknown agent/); expect(prev[3].errors.join()).toMatch(/Duplicate passport/);
    expect(await commitImport(A, group.id, rows)).toEqual({ imported: 1, skipped: 3 });
    const p = await prisma.pilgrim.findFirstOrThrow({ where: { groupId: group.id }, include: { checks: true } });
    expect(p.phoneNigeria).toBe("+2348031234567"); expect(p.checks).toHaveLength(4); expect(p.agentId).toBe(agent.id);
    expect(await prisma.auditLog.count({ where: { entity: "Pilgrim", action: "CREATE" } })).toBe(1);
  });
});
