import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fmtBoth, fmtZoned, TZ_KSA, TZ_NG } from "@/lib/tz";
import { signedUrl } from "@/lib/storage";
import { getPilgrim } from "@/services/pilgrims";
import { computeWarnings, type Warning } from "@/services/documents";
import { CHECK_CAP, CHECK_TYPES } from "@/services/clearance";
import { effectiveTime } from "@/services/trips";
import { ServiceError } from "@/services/types";
import { AB, AF } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ClearanceBadge, PageHeader } from "@/components/ui/bits";
import { PilgrimFields } from "../pilgrim-form";
import { deletePilgrimAction, setCheckAction, updatePilgrimAction } from "../../actions";

export const metadata: Metadata = { title: "Pilgrim" };
const day = (d: Date) => d.toISOString().slice(0, 10);
const Row = ({ k, v }: { k: string; v: React.ReactNode }) => <div className="flex justify-between gap-4 border-b border-border py-1.5 text-sm last:border-0"><dt className="text-muted">{k}</dt><dd className="text-right font-medium">{v || "—"}</dd></div>;

export default async function PilgrimProfile({ params }: { params: { id: string } }) {
  const user = await requirePageUser();
  let p;
  try { p = await getPilgrim(user, params.id); } catch (e) { if (e instanceof ServiceError) notFound(); throw e; }
  const staff = user.role !== "AGENT";
  const canEdit = can(user.role, "pilgrims.write") && p.group.status !== "ARCHIVED";

  const warnings: Warning[] = [];
  if (staff) {
    const names = p.documents.filter((d) => d.type === "TICKET" || d.type === "VISA").map((d) => ((d.extractedJson as any)?.fields?.passengerName as string | undefined)).filter(Boolean) as string[];
    for (const n of new Set(names)) warnings.push(...(await computeWarnings(prisma, p, { name: n })));
    warnings.push(...(await computeWarnings(prisma, p, { ticketNo: p.ticket?.ticketNo, visaNo: p.visa?.visaNo, visaExpiry: p.visa?.expiryDate, returnAt: p.ticket?.retDepartureAt, travelAt: p.ticket?.outDepartureAt })));
  }
  const uniq = [...new Map(warnings.map((w) => [w.message, w])).values()];

  let timeline: { at: Date; action: string; entity: string; field: string | null; oldValue: string | null; newValue: string | null; user: { name: string } | null }[] = [];
  if (staff) {
    const seatIds = p.tripSeats.map((s) => s.id);
    timeline = await prisma.auditLog.findMany({ where: { OR: [{ entityId: p.id }, { entityId: { startsWith: `${p.id}:` } }, { entityId: { in: seatIds } }] }, orderBy: { at: "desc" }, take: 60, include: { user: { select: { name: true } } } });
  }
  const agents = canEdit ? await prisma.agent.findMany({ where: { active: true }, orderBy: { groupName: "asc" } }) : [];
  const users = new Map((await prisma.user.findMany({ select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const room = p.assignments[0];

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={p.fullName} sub={`${p.group.code} · ${p.agent.groupName} · ${p.journeyStatus.replace("_", " ").toLowerCase()}`}>
        <ClearanceBadge green={p.clearance.green} blocking={p.clearance.blocking} />
      </PageHeader>
      {!p.clearance.green && <Alert tone="error"><b>Blocked.</b> Cannot be assigned to a bus or room until: {p.clearance.blocking.map((b) => b.toLowerCase()).join(", ")} {p.clearance.blocking.length > 1 ? "are" : "is"} cleared.</Alert>}
      {uniq.map((w) => <Alert key={w.message} tone="warning">⚠ {w.message}</Alert>)}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-4"><h2 className="mb-2 text-lg">Clearance checks</h2>
          <ul className="space-y-2">{CHECK_TYPES.map((t) => {
            const c = p.checks.find((x) => x.type === t); const ok = c?.status === "CLEARED"; const editable = staff && can(user.role, CHECK_CAP[t]) && p.group.status !== "ARCHIVED";
            return (<li key={t} className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-2 text-sm font-medium">{t[0] + t.slice(1).toLowerCase()} {ok ? <Badge tone="success">Cleared</Badge> : <Badge tone="danger">Pending</Badge>}</span>
              {c?.updatedById && <span className="text-xs text-muted">by {users.get(c.updatedById) ?? "system"} · {fmtZoned(c.updatedAt, TZ_NG)}</span>}
              {editable && <AB action={setCheckAction.bind(null, p.id, t, ok ? "PENDING" : "CLEARED")} confirm={ok ? `Set ${t.toLowerCase()} back to pending? The pilgrim turns RED.` : undefined}>{ok ? "Set pending" : "Mark cleared"}</AB>}
            </li>);
          })}</ul>
          <p className="mt-3 text-xs text-muted">Visa and ticket clear automatically when the PDF is confirmed; documents clear when passport copy and payment receipt are uploaded.</p>
        </section>

        <section className="card p-4"><h2 className="mb-2 text-lg">Details</h2><dl>
          <Row k="Passport" v={<span className="font-mono">{p.passportNo}</span>} /><Row k="Passport expiry" v={day(p.passportExpiry)} /><Row k="Date of birth" v={day(p.dateOfBirth)} /><Row k="Gender" v={p.gender === "M" ? "Male" : "Female"} />
          <Row k="Phone (NG)" v={p.phoneNigeria} /><Row k="Phone (KSA)" v={p.phoneKsa} /><Row k="WhatsApp" v={p.whatsapp} /><Row k="Special needs" v={p.specialNeeds} />
          <Row k="Emergency contact" v={`${p.emergencyContactName} · ${p.emergencyContactPhone}`} /><Row k="Family link" v={p.familyLinkId} />
          <Row k="Responsible staff" v={p.currentResponsibleStaffId ? users.get(p.currentResponsibleStaffId) : null} /></dl></section>

        <section className="card p-4"><h2 className="mb-2 text-lg">Flights</h2>
          {p.ticket ? <dl><Row k="Airline / PNR" v={`${p.ticket.airline} · ${p.ticket.pnr}`} /><Row k="Ticket no." v={p.ticket.ticketNo} />
            <Row k={`Outbound ${p.ticket.outFlightNo}`} v={<>{p.ticket.outDepartureAirport} → {p.ticket.outArrivalAirport}<div className="text-xs font-normal text-muted">Dep {fmtZoned(p.ticket.outDepartureAt, TZ_NG)} NG · Arr {fmtBoth(p.ticket.outArrivalAt)}</div></>} />
            <Row k={`Return ${p.ticket.retFlightNo}`} v={<>{p.ticket.retDepartureAirport} → {p.ticket.retArrivalAirport}<div className="text-xs font-normal text-muted">Dep {fmtBoth(p.ticket.retDepartureAt)} · Arr {fmtZoned(p.ticket.retArrivalAt, TZ_NG)} NG</div></>} /></dl> : <p className="text-sm text-muted">No confirmed ticket yet.</p>}
          {p.visa && <dl className="mt-3 border-t border-border pt-2"><Row k="Visa no." v={p.visa.visaNo} /><Row k="Valid" v={`${day(p.visa.issueDate)} → ${day(p.visa.expiryDate)}`} /><Row k="Stay / entry" v={`${p.visa.permittedStayDays} days · ${p.visa.entryType}`} /></dl>}
        </section>

        <section className="card p-4"><h2 className="mb-2 text-lg">Hotel &amp; bus</h2>
          {room ? <dl><Row k={room.room.hotel.name} v={`Room ${room.room.roomNo}`} /><Row k="Check-in" v={room.checkInAt ? fmtZoned(room.checkInAt, TZ_KSA) : "Not yet"} /><Row k="Check-out" v={room.checkOutAt ? fmtZoned(room.checkOutAt, TZ_KSA) : "—"} /></dl> : <p className="text-sm text-muted">No room assigned yet.</p>}
          <div className="mt-3 border-t border-border pt-2">{p.tripSeats.length ? p.tripSeats.map((s) => <Row key={s.id} k={s.tripBus.trip.title} v={<>Bus {s.tripBus.busNo} <Badge tone={s.boardingStatus === "BOARDED" ? "success" : s.boardingStatus === "PENDING" ? "neutral" : "warning"}>{s.boardingStatus.replace("_", " ").toLowerCase()}</Badge><div className="text-xs font-normal text-muted">{fmtBoth(effectiveTime(s.tripBus.trip))}</div></>} />) : <p className="text-sm text-muted">No bus assigned yet.</p>}</div>
        </section>
      </div>

      {staff && (
        <section className="card p-4"><h2 className="mb-2 text-lg">Attached PDFs</h2>
          {p.documents.length ? <ul className="space-y-1 text-sm">{p.documents.map((d) => <li key={d.id} className="flex flex-wrap items-center gap-2"><Badge tone="primary">{d.type.replace("_", " ").toLowerCase()}</Badge>{d.fileKey !== "purged" ? <a className="text-primary underline" href={signedUrl(d.fileKey)} target="_blank" rel="noreferrer">{d.fileName}</a> : <span className="text-muted">{d.fileName} (purged)</span>}<span className="text-xs text-muted">{d.status.toLowerCase()}</span></li>)}</ul> : <p className="text-sm text-muted">No documents attached.</p>}
          <p className="mt-2 text-xs text-muted">Links are signed and expire after 5 minutes.</p></section>
      )}

      {canEdit && (
        <details className="card p-4"><summary className="cursor-pointer text-lg">Edit pilgrim</summary>
          <AF action={updatePilgrimAction.bind(null, p.id)} reset={false} submit="Save changes" className="mt-3"><PilgrimFields agents={agents} v={{ ...p, passportExpiry: day(p.passportExpiry), dateOfBirth: day(p.dateOfBirth) } as never} /></AF>
          <div className="mt-3"><AB variant="danger" action={deletePilgrimAction.bind(null, p.id)} confirm="Delete this pilgrim permanently?">Delete pilgrim</AB></div>
        </details>
      )}

      {staff && (
        <section className="card p-4"><h2 className="mb-2 text-lg">Timeline &amp; audit history</h2>
          {timeline.length ? <ul className="space-y-1.5 text-sm">{timeline.map((t, i) => <li key={i} className="flex flex-wrap gap-x-2 border-b border-border pb-1.5 last:border-0"><span className="whitespace-nowrap text-xs text-muted">{fmtZoned(t.at, TZ_NG)} NG</span><b>{t.action}</b><span className="text-muted">{t.entity}{t.field ? `.${t.field}` : ""}</span>{(t.oldValue || t.newValue) && <span>{t.oldValue ? `${t.oldValue.slice(0, 60)} → ` : ""}{t.newValue?.slice(0, 80)}</span>}<span className="text-xs text-muted">by {t.user?.name ?? "system"}</span></li>)}</ul> : <p className="text-sm text-muted">No history yet.</p>}
        </section>
      )}
      <Button asChild variant="ghost"><Link href="/pilgrims">← Back to pilgrims</Link></Button>
    </div>
  );
}
