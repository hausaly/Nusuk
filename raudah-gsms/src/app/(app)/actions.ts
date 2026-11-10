"use server";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import type { BoardingStatus, CheckType, City, Gender, GroupStatus, HandoverScope, RoomType, TripType } from "@prisma/client";
import { safe } from "@/lib/action";
import { requireActor } from "@/lib/session";
import { GROUP_COOKIE } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { zonedToUtc, TZ_KSA } from "@/lib/tz";
import { archiveGroup, createGroup, duplicateGroup, setGroupStatus } from "@/services/groups";
import { commitImport, createPilgrim, deletePilgrim, parseImport, previewImport, updatePilgrim, type PilgrimInput } from "@/services/pilgrims";
import { setCheck } from "@/services/clearance";
import { assignUnmatched, bulkConfirm, confirmDocument, deleteDocument, purgeGroupFiles, uploadDocuments } from "@/services/documents";
import { addRooms, assignRoom, autoFillRooms, checkIn, checkOut, checkRoom, createHotel, deleteRoom, unassignRoom } from "@/services/hotels";
import { addBus, addZiyarah, assignPassengers, autoAssignTrip, createTrip, markBoarding, markZiyarahDone, removeBus, removePassenger, setDelay, updateTripMeta } from "@/services/trips";
import { respondHandover, sendHandover } from "@/services/handovers";
import { runReminders, updateRule } from "@/services/reminders";
import { ServiceError } from "@/services/types";

const s = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (fd: FormData, k: string) => s(fd, k) || undefined;
const ksa = (v: string) => { if (!v) throw new ServiceError("Date/time is required."); return zonedToUtc(v.length === 16 ? v : v + "T00:00", TZ_KSA).toISOString(); };
const done = (msg: string, ...paths: string[]) => { paths.forEach((p) => revalidatePath(p)); return { message: msg }; };

export async function selectGroupAction(groupId: string) {
  cookies().set(GROUP_COOKIE, groupId, { path: "/", httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 90 });
  revalidatePath("/", "layout");
}

/* ------------------------------ groups ------------------------------ */
export async function createGroupAction(fd: FormData) {
  return safe(async () => {
    const a = await requireActor("groups.manage");
    const g = await createGroup(a, { name: s(fd, "name"), startDate: s(fd, "startDate"), endDate: s(fd, "endDate"), arrivalAirport: s(fd, "arrivalAirport"), departureAirport: s(fd, "departureAirport"), supervisorId: o(fd, "supervisorId"), agentIds: fd.getAll("agentIds").map(String) });
    cookies().set(GROUP_COOKIE, g.id, { path: "/" });
    return done(`Group ${g.code} created.`, "/", "/groups");
  });
}
export async function duplicateGroupAction(sourceId: string, fd: FormData) {
  return safe(async () => { const a = await requireActor("groups.manage"); const g = await duplicateGroup(a, sourceId, { name: s(fd, "name"), startDate: s(fd, "startDate") }); return done(`Created ${g.code} from the template (no pilgrims copied).`, "/groups"); });
}
export async function archiveGroupAction(id: string) { return safe(async () => { await archiveGroup(await requireActor("groups.manage"), id); return done("Group archived.", "/", "/groups"); }); }
export async function groupStatusAction(id: string, status: GroupStatus) { return safe(async () => { await setGroupStatus(await requireActor("groups.manage"), id, status); return done("Status updated.", "/", "/groups"); }); }
export async function purgeFilesAction(id: string) { return safe(async () => { const n = await purgeGroupFiles(await requireActor("groups.manage"), id); return done(`${n} file(s) purged.`, "/groups"); }); }

/* ------------------------------ pilgrims ------------------------------ */
const pilgrimInput = (fd: FormData): PilgrimInput => ({
  fullName: s(fd, "fullName"), passportNo: s(fd, "passportNo"), passportExpiry: s(fd, "passportExpiry"), dateOfBirth: s(fd, "dateOfBirth"), gender: s(fd, "gender"), agentId: s(fd, "agentId"),
  phoneNigeria: s(fd, "phoneNigeria"), phoneKsa: o(fd, "phoneKsa"), whatsapp: o(fd, "whatsapp"), specialNeeds: o(fd, "specialNeeds"),
  emergencyContactName: s(fd, "emergencyContactName"), emergencyContactPhone: s(fd, "emergencyContactPhone"), familyLinkId: o(fd, "familyLinkId"),
});
export async function createPilgrimAction(groupId: string, fd: FormData) { return safe(async () => { await createPilgrim(await requireActor("pilgrims.write"), groupId, pilgrimInput(fd)); return done("Pilgrim added.", "/pilgrims", "/"); }); }
export async function updatePilgrimAction(id: string, fd: FormData) { return safe(async () => { await updatePilgrim(await requireActor("pilgrims.write"), id, pilgrimInput(fd)); return done("Pilgrim updated.", `/pilgrims/${id}`, "/pilgrims"); }); }
export async function deletePilgrimAction(id: string) { return safe(async () => { await deletePilgrim(await requireActor("pilgrims.write"), id); return done("Pilgrim deleted.", "/pilgrims", "/"); }); }
export async function setCheckAction(pilgrimId: string, type: CheckType, status: "PENDING" | "CLEARED") {
  return safe(async () => { await setCheck(await requireActor(), pilgrimId, type, status); return done("Check updated.", `/pilgrims/${pilgrimId}`, "/pilgrims", "/"); });
}

/** Step 1: parse + validate, return rows for the preview screen (nothing saved). */
export async function previewImportAction(groupId: string, fd: FormData) {
  return safe<{ rows: Record<string, unknown>[]; preview: { row: number; name: string; passport: string; agent: string; errors: string[] }[] }>(async () => {
    const a = await requireActor("pilgrims.write");
    const file = fd.get("file") as File | null;
    if (!file || !file.size) throw new ServiceError("Choose an Excel or CSV file.");
    if (file.size > 10 * 1024 * 1024) throw new ServiceError("File is larger than 10 MB.");
    const rows = await parseImport(Buffer.from(await file.arrayBuffer()), file.name);
    const preview = (await previewImport(a, groupId, rows)).map((r) => ({ row: r.row, name: r.input.fullName, passport: r.input.passportNo, agent: r.input.agentName, errors: r.errors }));
    return { data: { rows, preview } };
  });
}
/** Step 2: save the valid rows (re-validated server-side). */
export async function commitImportAction(groupId: string, rows: Record<string, unknown>[]) {
  return safe(async () => { const r = await commitImport(await requireActor("pilgrims.write"), groupId, rows); return done(`Imported ${r.imported} pilgrim(s); ${r.skipped} row(s) skipped.`, "/pilgrims", "/"); });
}

/* ------------------------------ documents ------------------------------ */
export async function uploadDocumentsAction(groupId: string, fd: FormData) {
  return safe(async () => {
    const a = await requireActor();
    const type = s(fd, "type") as "TICKET" | "VISA" | "PASSPORT_COPY" | "PAYMENT_RECEIPT";
    const files = await Promise.all(fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).map(async (f) => ({ name: f.name, data: Buffer.from(await f.arrayBuffer()) })));
    const docs = await uploadDocuments(a, groupId, type, files, o(fd, "pilgrimId"));
    return done(`${docs.length} file(s) uploaded${type === "TICKET" || type === "VISA" ? " and processed" : ""}.`, "/documents", "/pilgrims", "/");
  });
}
export async function confirmDocumentAction(docId: string, pilgrimId: string, fd: FormData) {
  return safe(async () => {
    const fields: Record<string, string> = {};
    for (const [k, v] of fd.entries()) if (k.startsWith("f_")) fields[k.slice(2)] = String(v);
    const r = await confirmDocument(await requireActor(), docId, { pilgrimId: o(fd, "pilgrimId") ?? pilgrimId, fields });
    return { message: r.warnings.length ? `Confirmed with ${r.warnings.length} warning(s): ${r.warnings.map((w) => w.message).join(" ")}` : "Confirmed." , ...revalidateAll() };
  });
}
function revalidateAll() { ["/documents", "/pilgrims", "/trips", "/"].forEach((p) => revalidatePath(p)); return {}; }
export async function bulkConfirmAction(groupId: string, type: "TICKET" | "VISA") {
  return safe(async () => { const r = await bulkConfirm(await requireActor(), groupId, type); revalidateAll(); return { message: `Confirmed ${r.confirmed}; ${r.held} held back for manual review.` }; });
}
export async function assignUnmatchedAction(docId: string, fd: FormData) { return safe(async () => { await assignUnmatched(await requireActor(), docId, s(fd, "pilgrimId")); revalidateAll(); return { message: "Pilgrim linked – review and confirm." }; }); }
export async function deleteDocumentAction(docId: string) { return safe(async () => { await deleteDocument(await requireActor(), docId); revalidateAll(); return { message: "Deleted." }; }); }

/* ------------------------------ hotels ------------------------------ */
export async function createHotelAction(groupId: string, fd: FormData) { return safe(async () => { await createHotel(await requireActor("planning.write"), groupId, { name: s(fd, "name"), city: s(fd, "city") as City, address: o(fd, "address"), contactPhone: o(fd, "contactPhone") }); return done("Hotel added.", "/hotels"); }); }
export async function addRoomsAction(hotelId: string, fd: FormData) {
  return safe(async () => { const n = await addRooms(await requireActor("planning.write"), hotelId, { from: Number(s(fd, "from")), to: Number(s(fd, "to")), prefix: o(fd, "prefix"), type: s(fd, "type") as RoomType, gender: (o(fd, "gender") as Gender) ?? null }); return done(`${n} room(s) added.`, `/hotels/${hotelId}`); });
}
export async function deleteRoomAction(hotelId: string, roomId: string) { return safe(async () => { await deleteRoom(await requireActor("planning.write"), roomId); return done("Room removed.", `/hotels/${hotelId}`); }); }
export async function assignRoomAction(hotelId: string, roomId: string, pilgrimId: string) { return safe(async () => { await assignRoom(await requireActor(), roomId, pilgrimId); return done("Assigned.", `/hotels/${hotelId}`); }); }
export async function unassignRoomAction(hotelId: string, roomId: string, pilgrimId: string) { return safe(async () => { await unassignRoom(await requireActor(), roomId, pilgrimId); return done("Removed.", `/hotels/${hotelId}`); }); }
export async function autoFillAction(hotelId: string) {
  return safe(async () => { const r = await autoFillRooms(await requireActor(), hotelId); revalidatePath(`/hotels/${hotelId}`); return { message: `Placed ${r.placed}. ${r.unplaced.length ? `Could not place ${r.unplaced.length} (no suitable room). ` : ""}${r.redSkipped ? `${r.redSkipped} RED pilgrim(s) skipped.` : ""}` }; });
}
export async function checkAction(hotelId: string, roomId: string, pilgrimId: string, mode: "in" | "out") { return safe(async () => { const a = await requireActor(); await (mode === "in" ? checkIn : checkOut)(a, roomId, pilgrimId); return done(mode === "in" ? "Checked in." : "Checked out.", `/hotels/${hotelId}`, "/"); }); }
export async function checkRoomAction(hotelId: string, roomId: string, mode: "in" | "out") {
  return safe(async () => { const r = await checkRoom(await requireActor(), roomId, mode); revalidatePath(`/hotels/${hotelId}`); if (r.errors.length) throw new ServiceError(r.errors[0]); return { message: "Room updated." }; });
}

/* ------------------------------ trips ------------------------------ */
export async function createTripAction(groupId: string, fd: FormData) {
  return safe(async () => { await createTrip(await requireActor("planning.write"), groupId, { type: s(fd, "type") as TripType, title: s(fd, "title"), fromCity: o(fd, "fromCity"), toCity: o(fd, "toCity"), scheduledAt: ksa(s(fd, "scheduledAt")) }); return done("Trip created.", "/trips"); });
}
export async function addBusAction(tripId: string, fd: FormData) {
  return safe(async () => { await addBus(await requireActor("planning.write"), tripId, { company: s(fd, "company"), companyPhone: o(fd, "companyPhone"), vehiclePlate: s(fd, "vehiclePlate"), busNo: s(fd, "busNo"), driverName: s(fd, "driverName"), driverPhone: s(fd, "driverPhone"), staffInChargeId: o(fd, "staffInChargeId") }); return done("Bus added.", `/trips/${tripId}`); });
}
export async function removeBusAction(tripId: string, busId: string) { return safe(async () => { await removeBus(await requireActor("planning.write"), busId); return done("Bus removed.", `/trips/${tripId}`); }); }
export async function assignPassengersAction(tripId: string, busId: string, fd: FormData) {
  return safe(async () => { const r = await assignPassengers(await requireActor(), busId, fd.getAll("pilgrimIds").map(String)); revalidatePath(`/trips/${tripId}`); return { message: `${r.added} seated.${r.errors.length ? ` ${r.errors.length} rejected: ${r.errors[0]}` : ""}` }; });
}
export async function autoAssignAction(tripId: string) {
  return safe(async () => { const r = await autoAssignTrip(await requireActor(), tripId); revalidatePath(`/trips/${tripId}`); return { message: `${r.added} pilgrim(s) assigned.${r.redSkipped ? ` ${r.redSkipped} RED pilgrim(s) are blocked and were skipped.` : ""}` }; });
}
export async function removePassengerAction(tripId: string, pilgrimId: string) { return safe(async () => { await removePassenger(await requireActor(), tripId, pilgrimId); return done("Removed.", `/trips/${tripId}`); }); }
export async function boardingAction(tripId: string, pilgrimId: string, status: BoardingStatus) { return safe(async () => { await markBoarding(await requireActor(), tripId, pilgrimId, status); return done("Updated.", `/trips/${tripId}`, "/"); }); }
export async function delayAction(tripId: string, fd: FormData) { return safe(async () => { await setDelay(await requireActor(), tripId, Number(s(fd, "minutes") || 0)); return done("Delay saved and staff notified.", `/trips/${tripId}`, "/"); }); }
export async function tripMetaAction(tripId: string, fd: FormData) { return safe(async () => { await updateTripMeta(await requireActor(), tripId, { terminal: s(fd, "terminal") }); return done("Saved.", `/trips/${tripId}`); }); }
export async function tripStatusAction(tripId: string, status: "PLANNED" | "IN_PROGRESS" | "DONE") { return safe(async () => { await updateTripMeta(await requireActor(), tripId, { status }); return done("Status updated.", `/trips/${tripId}`, "/trips"); }); }
export async function addZiyarahAction(groupId: string, fd: FormData) { return safe(async () => { await addZiyarah(await requireActor("planning.write"), groupId, { site: s(fd, "site"), city: s(fd, "city") as City, scheduledAt: ksa(s(fd, "scheduledAt")) }); return done("Ziyarah stop added.", "/trips"); }); }
export async function ziyarahDoneAction(id: string) { return safe(async () => { await markZiyarahDone(await requireActor(), id); return done("Visit marked done.", "/trips"); }); }

/* ------------------------------ handovers / notifications / reminders ------------------------------ */
export async function sendHandoverAction(groupId: string, fd: FormData) {
  return safe(async () => { await sendHandover(await requireActor("field.write"), groupId, { toStaffId: s(fd, "toStaffId"), scope: s(fd, "scope") as HandoverScope, pilgrimIds: fd.getAll("pilgrimIds").map(String), tripBusId: o(fd, "tripBusId"), hotelId: o(fd, "hotelId"), notes: o(fd, "notes"), issues: o(fd, "issues") }); return done("Handover sent.", "/handovers"); });
}
export async function respondHandoverAction(id: string, accept: boolean) { return safe(async () => { await respondHandover(await requireActor(), id, accept); return done(accept ? "Handover confirmed – you are now responsible." : "Handover rejected.", "/handovers"); }); }
export async function markNotificationsReadAction() { return safe(async () => { const a = await requireActor(); await prisma.notification.updateMany({ where: { userId: a.id, readAt: null }, data: { readAt: new Date() } }); return done("All marked as read.", "/notifications", "/"); }); }
export async function updateRuleAction(key: string, fd: FormData) {
  return safe(async () => {
    const a = await requireActor("users.manage");
    const mins = s(fd, "minutes");
    await updateRule(a, key, { enabled: fd.get("enabled") === "on", minutes: mins ? mins.split(",").map((x) => Math.round(Number(x) * 60)).filter(Boolean) : undefined, hour: s(fd, "hour") ? Number(s(fd, "hour")) : undefined });
    return done("Rule saved.", "/admin/reminders");
  });
}
export async function runRemindersAction() { return safe(async () => { await requireActor("users.manage"); const n = await runReminders(); return done(`${n} reminder(s) sent.`, "/admin/reminders", "/notifications"); }); }
