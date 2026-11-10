import ExcelJS from "exceljs";
import type { CheckType, Gender, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditCreate, auditDelete, auditUpdate } from "@/lib/audit";
import { assertCan, can } from "@/lib/rbac";
import { normalizePhone } from "@/lib/utils";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";
import { CHECK_TYPES, clearanceOf } from "./clearance";
import { pilgrimScope } from "./scope";

export interface PilgrimInput {
  fullName: string; passportNo: string; passportExpiry: string; dateOfBirth: string; gender: string; agentId: string;
  phoneNigeria: string; phoneKsa?: string | null; whatsapp?: string | null; specialNeeds?: string | null;
  emergencyContactName: string; emergencyContactPhone: string; familyLinkId?: string | null;
}

const parseDate = (v: unknown): Date | null => {
  if (v instanceof Date) return isNaN(+v) ? null : new Date(Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate()));
  const s = String(v ?? "").trim();
  if (!s) return null;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s); // DD/MM/YYYY
  const iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : s.slice(0, 10);
  const d = new Date(iso + "T00:00:00Z");
  return isNaN(+d) || !/^\d{4}-\d{2}-\d{2}$/.test(iso) ? null : d;
};

/** Validates + normalises one pilgrim; returns errors instead of throwing (used by import preview too). */
export function validatePilgrim(i: PilgrimInput): { data?: Omit<Prisma.PilgrimUncheckedCreateInput, "groupId">; errors: string[] } {
  const errors: string[] = [];
  const need = (v: string | null | undefined, label: string) => { if (!v || !String(v).trim()) errors.push(`${label} is required`); };
  need(i.fullName, "Full name"); need(i.passportNo, "Passport number"); need(i.phoneNigeria, "Nigeria phone");
  need(i.emergencyContactName, "Emergency contact name"); need(i.emergencyContactPhone, "Emergency contact phone");
  const exp = parseDate(i.passportExpiry), dob = parseDate(i.dateOfBirth);
  if (!exp) errors.push("Passport expiry must be a valid date"); if (!dob) errors.push("Date of birth must be a valid date");
  const g = String(i.gender ?? "").trim().toUpperCase().charAt(0);
  if (g !== "M" && g !== "F") errors.push("Gender must be M or F");
  const passportNo = String(i.passportNo ?? "").replace(/\s/g, "").toUpperCase();
  if (passportNo && !/^[A-Z0-9]{6,12}$/.test(passportNo)) errors.push("Passport number looks invalid");
  if (errors.length) return { errors };
  return {
    errors,
    data: {
      agentId: i.agentId, fullName: i.fullName.trim().replace(/\s+/g, " "), passportNo, passportExpiry: exp!, dateOfBirth: dob!, gender: g as Gender,
      phoneNigeria: normalizePhone(i.phoneNigeria)!, phoneKsa: normalizePhone(i.phoneKsa), whatsapp: normalizePhone(i.whatsapp),
      specialNeeds: i.specialNeeds?.trim() || null, emergencyContactName: i.emergencyContactName.trim(),
      emergencyContactPhone: normalizePhone(i.emergencyContactPhone)!, familyLinkId: i.familyLinkId?.trim() || null,
    },
  };
}

export async function createPilgrim(actor: Actor, groupId: string, input: PilgrimInput) {
  assertCan(actor, "pilgrims.write");
  await assertGroupWritable(prisma, groupId);
  const v = validatePilgrim(input);
  if (!v.data) throw new ServiceError(v.errors.join("; "));
  if (!(await prisma.agent.findUnique({ where: { id: input.agentId } }))) throw new ServiceError("Select an agent.");
  if (await prisma.pilgrim.findUnique({ where: { groupId_passportNo: { groupId, passportNo: v.data.passportNo } } }))
    throw new ServiceError(`Passport ${v.data.passportNo} already exists in this group.`, "CONFLICT");
  return prisma.$transaction(async (tx) => {
    const p = await tx.pilgrim.create({ data: { ...v.data!, groupId, checks: { create: CHECK_TYPES.map((type) => ({ type })) } } });
    await auditCreate({ db: tx, userId: actor.id, entity: "Pilgrim", entityId: p.id, record: p });
    return p;
  });
}

export async function updatePilgrim(actor: Actor, id: string, input: PilgrimInput) {
  assertCan(actor, "pilgrims.write");
  const v = validatePilgrim(input);
  if (!v.data) throw new ServiceError(v.errors.join("; "));
  return prisma.$transaction(async (tx) => {
    const before = await tx.pilgrim.findUnique({ where: { id } });
    if (!before) throw new ServiceError("Pilgrim not found.", "NOT_FOUND");
    await assertGroupWritable(tx, before.groupId);
    const dup = await tx.pilgrim.findFirst({ where: { groupId: before.groupId, passportNo: v.data!.passportNo, NOT: { id } } });
    if (dup) throw new ServiceError(`Passport ${v.data!.passportNo} already exists in this group.`, "CONFLICT");
    const after = await tx.pilgrim.update({ where: { id }, data: v.data! });
    await auditUpdate({ db: tx, userId: actor.id, entity: "Pilgrim", entityId: id, before, after });
    return after;
  });
}

export async function deletePilgrim(actor: Actor, id: string) {
  assertCan(actor, "pilgrims.write");
  return prisma.$transaction(async (tx) => {
    const p = await tx.pilgrim.findUnique({ where: { id } });
    if (!p) throw new ServiceError("Pilgrim not found.", "NOT_FOUND");
    await assertGroupWritable(tx, p.groupId);
    const used = (await tx.tripPassenger.count({ where: { pilgrimId: id } })) + (await tx.roomAssignment.count({ where: { pilgrimId: id } }));
    if (used) throw new ServiceError("This pilgrim already has bus/room assignments. Remove them first.");
    await tx.clearanceCheck.deleteMany({ where: { pilgrimId: id } });
    await tx.document.updateMany({ where: { pilgrimId: id }, data: { pilgrimId: null, status: "UNMATCHED" } });
    await tx.ticket.deleteMany({ where: { pilgrimId: id } }); await tx.visa.deleteMany({ where: { pilgrimId: id } });
    await tx.pilgrim.delete({ where: { id } });
    await auditDelete({ db: tx, userId: actor.id, entity: "Pilgrim", entityId: id, record: p });
  });
}

export interface ListFilter { groupId: string; q?: string; status?: "GREEN" | "RED"; blocking?: CheckType; agentId?: string; page?: number; pageSize?: number }

/** Paginated list with clearance computed from the 4 checks. AGENT rows are filtered server-side. */
export async function listPilgrims(actor: Actor, f: ListFilter) {
  const pageSize = f.pageSize ?? 50, page = Math.max(1, f.page ?? 1);
  const and: Prisma.PilgrimWhereInput[] = [pilgrimScope(actor, f.groupId)];
  if (f.agentId && actor.role !== "AGENT") and.push({ agentId: f.agentId });
  if (f.q?.trim()) {
    const q = f.q.trim();
    and.push({ OR: [{ fullName: { contains: q, mode: "insensitive" } }, { passportNo: { contains: q.toUpperCase() } }, { phoneNigeria: { contains: q } }] });
  }
  const notCleared = (t: CheckType): Prisma.PilgrimWhereInput => ({ checks: { some: { type: t, status: "PENDING" } } });
  if (f.status === "RED") and.push({ checks: { some: { status: "PENDING" } } });
  if (f.status === "GREEN") and.push({ checks: { none: { status: "PENDING" } } });
  if (f.blocking) and.push(notCleared(f.blocking));
  const where: Prisma.PilgrimWhereInput = { AND: and };
  const [total, rows] = await Promise.all([
    prisma.pilgrim.count({ where }),
    prisma.pilgrim.findMany({ where, orderBy: { fullName: "asc" }, skip: (page - 1) * pageSize, take: pageSize, include: { checks: true, agent: { select: { groupName: true } } } }),
  ]);
  return { total, page, pageSize, rows: rows.map((p) => ({ ...p, clearance: clearanceOf(p.checks) })) };
}

export async function getPilgrim(actor: Actor, id: string) {
  const p = await prisma.pilgrim.findFirst({
    where: { AND: [{ id }, pilgrimScope(actor)] },
    include: { checks: true, agent: true, group: true, ticket: true, visa: true, documents: { orderBy: { createdAt: "desc" } },
      assignments: { include: { room: { include: { hotel: true } } } }, tripSeats: { include: { tripBus: { include: { trip: true } } } } },
  });
  if (!p) throw new ServiceError("Pilgrim not found.", "NOT_FOUND");
  return { ...p, clearance: clearanceOf(p.checks) };
}

/* ------------------------------ bulk import ------------------------------ */

export const IMPORT_COLUMNS = ["Full Name", "Passport No", "Passport Expiry", "Date of Birth", "Gender", "Phone Nigeria", "Agent Group Name",
  "Emergency Contact Name", "Emergency Contact Phone", "Phone KSA", "WhatsApp", "Special Needs", "Family Link ID"] as const;

const cellText = (v: ExcelJS.CellValue): unknown => {
  if (v && typeof v === "object" && !(v instanceof Date)) { const o = v as any; return o.text ?? o.result ?? (o.richText ? o.richText.map((r: any) => r.text).join("") : ""); }
  return v ?? "";
};

export interface ImportRow { row: number; input: PilgrimInput & { agentName: string }; errors: string[] }

export async function parseImport(buf: Buffer, filename: string): Promise<Record<string, unknown>[]> {
  const wb = new ExcelJS.Workbook();
  if (/\.csv$/i.test(filename)) { const { Readable } = await import("node:stream"); await wb.csv.read(Readable.from(buf)); }
  else await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new ServiceError("The file has no sheet.");
  // The header row is the first row (within the top 10) that contains both "full name" and "passport no" (the branded template starts at row 5).
  let headerRow = 1;
  for (let n = 1; n <= Math.min(10, ws.rowCount); n++) {
    const vals: string[] = [];
    ws.getRow(n).eachCell((c) => vals.push(String(cellText(c.value)).trim().toLowerCase()));
    if (vals.includes("full name") && vals.includes("passport no")) { headerRow = n; break; }
  }
  const header: string[] = [];
  ws.getRow(headerRow).eachCell((c, n) => (header[n] = String(cellText(c.value)).trim().toLowerCase()));
  const out: Record<string, unknown>[] = [];
  ws.eachRow((r, n) => {
    if (n <= headerRow) return;
    const o: Record<string, unknown> = { __row: n };
    let any = false;
    header.forEach((h, i) => { if (!h) return; const v = cellText(r.getCell(i).value); o[h] = v; if (String(v).trim()) any = true; });
    if (any) out.push(o);
  });
  return out;
}

/** Row-level validation for the preview screen (nothing is saved). */
export async function previewImport(actor: Actor, groupId: string, rows: Record<string, unknown>[]): Promise<ImportRow[]> {
  assertCan(actor, "pilgrims.write");
  if (rows.length > 2000) throw new ServiceError("Import at most 2000 rows at a time.");
  const agents = await prisma.agent.findMany();
  const existing = new Set((await prisma.pilgrim.findMany({ where: { groupId }, select: { passportNo: true } })).map((p) => p.passportNo));
  const seen = new Set<string>();
  const g = (r: Record<string, unknown>, k: string) => String(r[k.toLowerCase()] ?? "").trim();
  return rows.map((r) => {
    const agentName = g(r, "Agent Group Name");
    const agent = agents.find((a) => a.groupName.toLowerCase() === agentName.toLowerCase());
    const input = {
      agentName, agentId: agent?.id ?? "", fullName: g(r, "Full Name"), passportNo: g(r, "Passport No"),
      passportExpiry: r["passport expiry"] instanceof Date ? (r["passport expiry"] as Date).toISOString().slice(0, 10) : g(r, "Passport Expiry"),
      dateOfBirth: r["date of birth"] instanceof Date ? (r["date of birth"] as Date).toISOString().slice(0, 10) : g(r, "Date of Birth"),
      gender: g(r, "Gender"), phoneNigeria: g(r, "Phone Nigeria"), phoneKsa: g(r, "Phone KSA"), whatsapp: g(r, "WhatsApp"),
      specialNeeds: g(r, "Special Needs"), emergencyContactName: g(r, "Emergency Contact Name"), emergencyContactPhone: g(r, "Emergency Contact Phone"),
      familyLinkId: g(r, "Family Link ID"),
    };
    const v = validatePilgrim(input);
    const errors = [...v.errors];
    if (!agent) errors.push(agentName ? `Unknown agent "${agentName}"` : "Agent Group Name is required");
    const pn = v.data?.passportNo;
    if (pn) { if (existing.has(pn)) errors.push("Passport already in this group"); if (seen.has(pn)) errors.push("Duplicate passport in file"); seen.add(pn); }
    return { row: Number(r.__row ?? 0), input, errors };
  });
}

/** Re-validates and saves all valid rows in one transaction. Invalid rows are skipped and reported. */
export async function commitImport(actor: Actor, groupId: string, rows: Record<string, unknown>[]) {
  assertCan(actor, "pilgrims.write");
  await assertGroupWritable(prisma, groupId);
  const preview = await previewImport(actor, groupId, rows);
  const ok = preview.filter((r) => !r.errors.length);
  await prisma.$transaction(async (tx) => {
    for (const r of ok) {
      const v = validatePilgrim(r.input)!;
      const p = await tx.pilgrim.create({ data: { ...v.data!, groupId, checks: { create: CHECK_TYPES.map((type) => ({ type })) } } });
      await auditCreate({ db: tx, userId: actor.id, entity: "Pilgrim", entityId: p.id, record: { ...p, via: "import" } });
    }
  }, { timeout: 120_000 });
  return { imported: ok.length, skipped: preview.length - ok.length };
}

export { can };
