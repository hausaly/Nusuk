import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { fmtZoned, TZ_NG } from "@/lib/tz";
import { AB, AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Table, textArea } from "@/components/ui/bits";
import { respondHandoverAction, sendHandoverAction } from "../actions";

export const metadata: Metadata = { title: "Handovers" };

export default async function HandoversPage() {
  const user = await requirePageUser("field.write");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const [hs, staff, buses, hotels, pilgrims] = await Promise.all([
    prisma.handover.findMany({ where: { groupId: current.id }, orderBy: { sentAt: "desc" }, take: 100 }),
    prisma.user.findMany({ where: { active: true, role: { not: "AGENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tripBus.findMany({ where: { trip: { groupId: current.id } }, include: { trip: true } }),
    prisma.hotel.findMany({ where: { groupId: current.id } }),
    prisma.pilgrim.findMany({ where: { groupId: current.id }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" } }),
  ]);
  const name = new Map(staff.map((s) => [s.id, s.name]));
  const mine = hs.filter((h) => h.toStaffId === user.id && h.status === "SENT");
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <PageHeader title="Staff handovers" sub="Responsibility changes only after the receiver confirms." />
      {mine.map((h) => (
        <Alert key={h.id} tone="warning"><div className="flex flex-wrap items-center justify-between gap-2"><span><b>{name.get(h.fromStaffId)}</b> handed over {h.scope.toLowerCase()} to you.{h.notes ? ` Notes: ${h.notes}` : ""}{h.issues ? ` Issues: ${h.issues}` : ""}</span>
          <span className="flex gap-2"><AB variant="default" action={respondHandoverAction.bind(null, h.id, true)}>Confirm receipt</AB><AB action={respondHandoverAction.bind(null, h.id, false)}>Reject</AB></span></div></Alert>
      ))}
      {current.status !== "ARCHIVED" && (
        <details className="card p-4"><summary className="cursor-pointer text-sm font-medium text-primary">+ Send a handover</summary>
          <AF action={sendHandoverAction.bind(null, current.id)} submit="Send handover" className="mt-3"><div className="grid gap-3 md:grid-cols-2">
            <Field label="Hand over to" htmlFor="h-to"><Select id="h-to" name="toStaffId" required><option value="">Select…</option>{staff.filter((s) => s.id !== user.id).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Scope" htmlFor="h-sc"><Select id="h-sc" name="scope"><option value="PILGRIMS">Pilgrims</option><option value="BUS">Bus</option><option value="HOTEL">Hotel</option></Select></Field>
            <Field label="Bus (if scope = bus)" htmlFor="h-b"><Select id="h-b" name="tripBusId"><option value="">—</option>{buses.map((b) => <option key={b.id} value={b.id}>{b.trip.title} · bus {b.busNo}</option>)}</Select></Field>
            <Field label="Hotel (if scope = hotel)" htmlFor="h-h"><Select id="h-h" name="hotelId"><option value="">—</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select></Field>
            <Field label="Pilgrims (if scope = pilgrims; hold Ctrl/Cmd to pick several)" htmlFor="h-p"><select id="h-p" name="pilgrimIds" multiple size={6} className={textArea}>{pilgrims.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></Field>
            <div className="space-y-3"><Field label="Notes" htmlFor="h-n"><Input id="h-n" name="notes" /></Field><Field label="Issues" htmlFor="h-i"><Input id="h-i" name="issues" /></Field></div></div></AF></details>
      )}
      <Table head={["Sent (Lagos)", "From → To", "Scope", "Notes / issues", "Status"]} min={720} empty={hs.length ? undefined : "No handovers yet."}>
        {hs.map((h) => <tr key={h.id}><td className="whitespace-nowrap text-xs">{fmtZoned(h.sentAt, TZ_NG)}</td><td>{name.get(h.fromStaffId)} → {name.get(h.toStaffId)}</td><td>{h.scope.toLowerCase()}{h.scope === "PILGRIMS" ? ` (${h.pilgrimIds.length})` : ""}</td><td className="text-xs">{[h.notes, h.issues && `Issues: ${h.issues}`].filter(Boolean).join(" · ") || "—"}</td>
          <td><Badge tone={h.status === "CONFIRMED" ? "success" : h.status === "REJECTED" ? "danger" : "warning"}>{h.status.toLowerCase()}</Badge>{h.confirmedAt && <div className="text-xs text-muted">{fmtZoned(h.confirmedAt, TZ_NG)}</div>}</td></tr>)}
      </Table>
    </div>
  );
}
