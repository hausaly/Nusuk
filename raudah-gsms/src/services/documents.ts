import { randomUUID } from "node:crypto";
import type { Document, DocType, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditEvent, auditUpdate, type Db } from "@/lib/audit";
import { assertCan, type Capability } from "@/lib/rbac";
import { getFile, putFile, deleteFile } from "@/lib/storage";
import { NAME_MATCH_THRESHOLD, nameSimilarity } from "@/lib/names";
import { registerJob, enqueue } from "@/lib/queue";
import { notifyRoles } from "@/lib/notify";
import { airportTz, zonedToUtc, TZ_NG } from "@/lib/tz";
import { type Actor, ServiceError } from "./types";
import { assertGroupWritable } from "./groups";
import { applyCheck, recomputeDocumentsCheck } from "./clearance";
import { extractWithClaude, parseTicketText, parseVisaText, pdfText, REQUIRED, type DocKind, type Extracted } from "./extraction";
import { syncAirportTrips } from "./trips";

const UPLOAD_CAP: Record<DocType, Capability> = { TICKET: "ticket.write", VISA: "visa.write", PASSPORT_COPY: "documents.write", PAYMENT_RECEIPT: "documents.write" };
export const AUTO_CONFIRM_CONF = 0.85;

export interface UploadFile { name: string; data: Buffer }

/** Multi-file upload. Tickets/visas are queued for extraction; passport copies/receipts attach straight to a pilgrim. */
export async function uploadDocuments(actor: Actor, groupId: string, type: DocType, files: UploadFile[], pilgrimId?: string) {
  assertCan(actor, UPLOAD_CAP[type]);
  await assertGroupWritable(prisma, groupId);
  if (!files.length) throw new ServiceError("Choose at least one PDF.");
  const direct = type === "PASSPORT_COPY" || type === "PAYMENT_RECEIPT";
  if (direct) {
    const p = pilgrimId ? await prisma.pilgrim.findFirst({ where: { id: pilgrimId, groupId } }) : null;
    if (!p) throw new ServiceError("Select the pilgrim this document belongs to.");
  }
  const created: Document[] = [];
  for (const f of files) {
    if (f.data.subarray(0, 5).toString() !== "%PDF-") throw new ServiceError(`${f.name} is not a PDF file.`);
    if (f.data.length > 15 * 1024 * 1024) throw new ServiceError(`${f.name} is larger than 15 MB.`);
    const fileKey = `groups/${groupId}/${randomUUID()}.pdf`;
    await putFile(fileKey, f.data);
    const doc = await prisma.document.create({ data: { groupId, type, fileKey, fileName: f.name.slice(0, 200), uploadedById: actor.id, pilgrimId: direct ? pilgrimId : null, status: direct ? "CONFIRMED" : "UPLOADED" } });
    await auditEvent({ db: prisma, userId: actor.id, entity: "Document", entityId: doc.id, action: "UPLOAD", note: `${type} ${f.name}` });
    created.push(doc);
    if (direct) await recomputeDocumentsCheck(prisma, actor.id, pilgrimId!);
    else await enqueue("extract-document", { documentId: doc.id });
  }
  return created;
}

/* ------------------------------- extraction ------------------------------- */

async function matchPilgrim(db: Db, groupId: string, passportNo?: string, name?: string): Promise<{ id: string; how: string } | null> {
  if (passportNo) {
    const p = await db.pilgrim.findFirst({ where: { groupId, passportNo: passportNo.toUpperCase().replace(/\s/g, "") }, select: { id: true } });
    if (p) return { id: p.id, how: "passport" };
  }
  if (name) {
    const all = await db.pilgrim.findMany({ where: { groupId }, select: { id: true, fullName: true } });
    const scored = all.map((p) => ({ id: p.id, s: nameSimilarity(name, p.fullName) })).sort((a, b) => b.s - a.s);
    if (scored[0] && scored[0].s >= NAME_MATCH_THRESHOLD && (!scored[1] || scored[0].s - scored[1].s > 0.1)) return { id: scored[0].id, how: "name" };
  }
  return null;
}

export async function processDocument({ documentId }: { documentId: string }) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || (doc.type !== "TICKET" && doc.type !== "VISA")) return;
  const kind = doc.type as DocKind;
  try {
    const buf = await getFile(doc.fileKey);
    const text = await pdfText(buf);
    let records: Extracted[] = text.trim().length > 40 ? (kind === "TICKET" ? parseTicketText(text) : parseVisaText(text)) : [];
    let usedLlm = false;
    if (!records.length) { const r = await extractWithClaude(buf, kind); if (r) { records = r; usedLlm = true; } }
    if (!records.length) {
      await prisma.document.update({ where: { id: doc.id }, data: { status: "NEEDS_REVIEW", extractedJson: { fields: {} }, fieldConfidence: {}, error: text.trim().length <= 40 ? "Scanned PDF – automatic reading is not available (no ANTHROPIC_API_KEY). Enter the details manually." : "Layout not recognised. Enter the details manually." } });
      return;
    }
    for (let i = 0; i < records.length; i++) {
      const rec = records[i];
      const m = await matchPilgrim(prisma, doc.groupId, rec.fields.passportNo, rec.fields.passengerName);
      const missing = REQUIRED[kind].filter((k) => !rec.fields[k]);
      const lowConf = Object.values(rec.confidence).some((c) => c < AUTO_CONFIRM_CONF);
      const status = !m ? "UNMATCHED" : missing.length || lowConf ? "NEEDS_REVIEW" : "EXTRACTED";
      const data = { pilgrimId: m?.id ?? null, status, extractedJson: { fields: rec.fields, matchedBy: m?.how ?? null, llm: usedLlm } as Prisma.InputJsonValue, fieldConfidence: rec.confidence as Prisma.InputJsonValue, error: null } as const;
      if (i === 0) await prisma.document.update({ where: { id: doc.id }, data });
      else await prisma.document.create({ data: { ...data, groupId: doc.groupId, type: doc.type, fileKey: doc.fileKey, fileName: doc.fileName, passengerIndex: i, uploadedById: doc.uploadedById } });
    }
  } catch (e: any) {
    await prisma.document.update({ where: { id: doc.id }, data: { status: "NEEDS_REVIEW", error: `Extraction failed: ${e.message}` } });
  }
}
registerJob("extract-document", processDocument);

/* ------------------------------- validation ------------------------------- */

export interface Warning { code: string; message: string }

/** Spec warnings: name mismatch, visa expiring before return, passport <6 months, duplicate ticket/visa numbers. */
export async function computeWarnings(db: Db, p: { id: string; fullName: string; passportExpiry: Date; groupId: string }, ctx: {
  name?: string; ticketNo?: string; visaNo?: string; visaExpiry?: Date | null; returnAt?: Date | null; travelAt?: Date | null;
}): Promise<Warning[]> {
  const w: Warning[] = [];
  if (ctx.name && nameSimilarity(ctx.name, p.fullName) < NAME_MATCH_THRESHOLD) w.push({ code: "NAME_MISMATCH", message: `Name on document ("${ctx.name}") differs from passport name ("${p.fullName}").` });
  if (ctx.visaExpiry && ctx.returnAt && ctx.visaExpiry < ctx.returnAt) w.push({ code: "VISA_EXPIRES_BEFORE_RETURN", message: "Visa expires before the return flight." });
  const travel = ctx.travelAt ?? (await db.group.findUnique({ where: { id: p.groupId }, select: { startDate: true } }))?.startDate;
  if (travel) { const lim = new Date(travel); lim.setUTCMonth(lim.getUTCMonth() + 6); if (p.passportExpiry < lim) w.push({ code: "PASSPORT_EXPIRING", message: "Passport expires within 6 months of travel." }); }
  if (ctx.ticketNo && (await db.ticket.count({ where: { ticketNo: ctx.ticketNo, NOT: { pilgrimId: p.id } } }))) w.push({ code: "DUP_TICKET", message: `Ticket number ${ctx.ticketNo} is already used by another pilgrim.` });
  if (ctx.visaNo && (await db.visa.count({ where: { visaNo: ctx.visaNo, NOT: { pilgrimId: p.id } } }))) w.push({ code: "DUP_VISA", message: `Visa number ${ctx.visaNo} is already used by another pilgrim.` });
  return w;
}

async function ctxFromFields(db: Db, kind: DocKind, f: Record<string, string>, pilgrimId: string) {
  if (kind === "TICKET") {
    const ret = f.retDepartureAt ? zonedToUtc(f.retDepartureAt, airportTz(f.retDepartureAirport || "JED")) : null;
    const out = f.outDepartureAt ? zonedToUtc(f.outDepartureAt, airportTz(f.outDepartureAirport || "LOS")) : null;
    return { name: f.passengerName, ticketNo: f.ticketNo, travelAt: out, returnAt: ret };
  }
  const t = await db.ticket.findUnique({ where: { pilgrimId } });
  return { name: f.passengerName, visaNo: f.visaNo, visaExpiry: f.expiryDate ? new Date(f.expiryDate + "T23:59:59Z") : null, returnAt: t?.retDepartureAt ?? null };
}

export async function warningsForDocument(doc: Document, fields: Record<string, string>, pilgrimId: string | null): Promise<Warning[]> {
  if (!pilgrimId) return [];
  const p = await prisma.pilgrim.findUniqueOrThrow({ where: { id: pilgrimId } });
  return computeWarnings(prisma, p, await ctxFromFields(prisma, doc.type as DocKind, fields, pilgrimId));
}

/* -------------------------------- confirm -------------------------------- */

const num = (s: string | undefined) => { const n = Number(s); return Number.isFinite(n) ? n : NaN; };

export async function confirmDocument(actor: Actor, documentId: string, input: { pilgrimId: string; fields: Record<string, string> }) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc || (doc.type !== "TICKET" && doc.type !== "VISA")) throw new ServiceError("Document not found.", "NOT_FOUND");
  assertCan(actor, UPLOAD_CAP[doc.type]);
  await assertGroupWritable(prisma, doc.groupId);
  const kind = doc.type as DocKind;
  const f = Object.fromEntries(Object.entries(input.fields).map(([k, v]) => [k, String(v ?? "").trim()]));
  const missing = REQUIRED[kind].filter((k) => !f[k]);
  if (missing.length) throw new ServiceError(`Missing: ${missing.join(", ")}`);
  const pilgrim = await prisma.pilgrim.findFirst({ where: { id: input.pilgrimId, groupId: doc.groupId } });
  if (!pilgrim) throw new ServiceError("Select the pilgrim this document belongs to.");

  const warnings = await computeWarnings(prisma, pilgrim, await ctxFromFields(prisma, kind, f, pilgrim.id));
  await prisma.$transaction(async (tx) => {
    if (kind === "TICKET") {
      const at = (k: string, ap: string) => zonedToUtc(f[k], airportTz(f[ap]));
      const data = {
        documentId: doc.id, pnr: f.pnr.toUpperCase(), ticketNo: f.ticketNo, airline: f.airline,
        outFlightNo: f.outFlightNo.toUpperCase(), outDepartureAirport: f.outDepartureAirport.toUpperCase(), outDepartureAt: at("outDepartureAt", "outDepartureAirport"),
        outArrivalAirport: f.outArrivalAirport.toUpperCase(), outArrivalAt: at("outArrivalAt", "outArrivalAirport"),
        retFlightNo: f.retFlightNo.toUpperCase(), retDepartureAirport: f.retDepartureAirport.toUpperCase(), retDepartureAt: at("retDepartureAt", "retDepartureAirport"),
        retArrivalAirport: f.retArrivalAirport.toUpperCase(), retArrivalAt: at("retArrivalAt", "retArrivalAirport"),
      };
      const old = await tx.ticket.findUnique({ where: { pilgrimId: pilgrim.id } });
      if (old?.documentId && old.documentId !== doc.id) await tx.document.update({ where: { id: old.documentId }, data: { status: "UNMATCHED", pilgrimId: null } }).catch(() => {});
      if (old) await tx.ticket.delete({ where: { pilgrimId: pilgrim.id } });
      const t = await tx.ticket.create({ data: { ...data, pilgrimId: pilgrim.id } });
      await auditEvent({ db: tx, userId: actor.id, entity: "Ticket", entityId: t.id, action: old ? "UPDATE" : "CREATE", note: JSON.stringify({ pnr: t.pnr, ticketNo: t.ticketNo, out: t.outFlightNo, ret: t.retFlightNo }) });
      await applyCheck(tx, actor.id, pilgrim.id, "TICKET", "CLEARED");
    } else {
      const stay = num(f.permittedStayDays);
      if (!(stay > 0)) throw new ServiceError("Permitted stay must be a number of days.");
      const data = { documentId: doc.id, visaNo: f.visaNo.toUpperCase(), issueDate: new Date(f.issueDate + "T00:00:00Z"), expiryDate: new Date(f.expiryDate + "T00:00:00Z"), permittedStayDays: stay, entryType: f.entryType };
      if (isNaN(+data.issueDate) || isNaN(+data.expiryDate)) throw new ServiceError("Visa dates must be valid (YYYY-MM-DD).");
      const old = await tx.visa.findUnique({ where: { pilgrimId: pilgrim.id } });
      if (old?.documentId && old.documentId !== doc.id) await tx.document.update({ where: { id: old.documentId }, data: { status: "UNMATCHED", pilgrimId: null } }).catch(() => {});
      if (old) await tx.visa.delete({ where: { pilgrimId: pilgrim.id } });
      const v = await tx.visa.create({ data: { ...data, pilgrimId: pilgrim.id } });
      await auditEvent({ db: tx, userId: actor.id, entity: "Visa", entityId: v.id, action: old ? "UPDATE" : "CREATE", note: JSON.stringify({ visaNo: v.visaNo, expiry: f.expiryDate }) });
      await applyCheck(tx, actor.id, pilgrim.id, "VISA", "CLEARED");
    }
    const before = doc;
    const after = await tx.document.update({ where: { id: doc.id }, data: { pilgrimId: pilgrim.id, status: "CONFIRMED", extractedJson: { ...(doc.extractedJson as object), fields: f }, warnings: warnings as unknown as Prisma.InputJsonValue, error: null } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "Document", entityId: doc.id, before: { status: before.status, pilgrimId: before.pilgrimId }, after: { status: after.status, pilgrimId: after.pilgrimId } });
  });
  if (kind === "TICKET") await syncAirportTrips(prisma, doc.groupId);
  const critical = warnings.find((w) => w.code === "VISA_EXPIRES_BEFORE_RETURN");
  if (critical) await notifyRoles(["VISA_OFFICER", "SUPER_ADMIN"], { title: "Visa expires before return flight", body: `${pilgrim.fullName}: ${critical.message}`, link: `/pilgrims/${pilgrim.id}` });
  return { warnings };
}

/** Bulk-confirm: only matched, fully-extracted, high-confidence rows with no warnings. */
export async function bulkConfirm(actor: Actor, groupId: string, type: "TICKET" | "VISA") {
  assertCan(actor, UPLOAD_CAP[type]);
  const docs = await prisma.document.findMany({ where: { groupId, type, status: "EXTRACTED", pilgrimId: { not: null } } });
  let confirmed = 0; const held: string[] = [];
  for (const d of docs) {
    const fields = (d.extractedJson as any)?.fields ?? {};
    const w = await warningsForDocument(d, fields, d.pilgrimId);
    if (w.length) { held.push(d.fileName); continue; }
    try { await confirmDocument(actor, d.id, { pilgrimId: d.pilgrimId!, fields }); confirmed++; } catch { held.push(d.fileName); }
  }
  return { confirmed, held: held.length };
}

export async function assignUnmatched(actor: Actor, documentId: string, pilgrimId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new ServiceError("Document not found.", "NOT_FOUND");
  assertCan(actor, UPLOAD_CAP[doc.type]);
  await prisma.document.update({ where: { id: documentId }, data: { pilgrimId, status: "NEEDS_REVIEW" } });
}

export async function deleteDocument(actor: Actor, documentId: string) {
  const doc = await prisma.document.findUnique({ where: { id: documentId } });
  if (!doc) throw new ServiceError("Document not found.", "NOT_FOUND");
  assertCan(actor, UPLOAD_CAP[doc.type]);
  if (doc.status === "CONFIRMED" && (doc.type === "TICKET" || doc.type === "VISA")) throw new ServiceError("Confirmed tickets/visas cannot be deleted; upload a corrected one instead.");
  await prisma.document.delete({ where: { id: documentId } });
  if (!(await prisma.document.count({ where: { fileKey: doc.fileKey } }))) await deleteFile(doc.fileKey);
  await auditEvent({ db: prisma, userId: actor.id, entity: "Document", entityId: documentId, action: "DELETE", note: doc.fileName });
  if (doc.pilgrimId && (doc.type === "PASSPORT_COPY" || doc.type === "PAYMENT_RECEIPT")) {
    const left = await prisma.document.findMany({ where: { pilgrimId: doc.pilgrimId, type: { in: ["PASSPORT_COPY", "PAYMENT_RECEIPT"] } } });
    if (!(left.some((x) => x.type === "PASSPORT_COPY") && left.some((x) => x.type === "PAYMENT_RECEIPT"))) await applyCheck(prisma, actor.id, doc.pilgrimId, "DOCUMENTS", "PENDING");
  }
}

/** Data protection: purge stored files of an archived group (rows stay for the audit trail). */
export async function purgeGroupFiles(actor: Actor, groupId: string) {
  assertCan(actor, "groups.manage");
  const g = await prisma.group.findUnique({ where: { id: groupId } });
  if (g?.status !== "ARCHIVED") throw new ServiceError("Only archived groups can be purged.");
  const docs = await prisma.document.findMany({ where: { groupId } });
  const keys = [...new Set(docs.map((d) => d.fileKey))];
  for (const k of keys) await deleteFile(k);
  await prisma.document.deleteMany({ where: { groupId, status: { not: "CONFIRMED" } } });
  await prisma.document.updateMany({ where: { groupId }, data: { fileKey: "purged", error: "File purged (retention policy)" } });
  await auditEvent({ db: prisma, userId: actor.id, entity: "Group", entityId: groupId, action: "PURGE_FILES", note: `${keys.length} files` });
  return keys.length;
}
void TZ_NG;
