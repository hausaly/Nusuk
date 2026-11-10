import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fmtBoth } from "@/lib/tz";
import { candidatePilgrims, effectiveTime } from "@/services/trips";
import { AB, AF } from "@/components/forms";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { ClearanceBadge, PageHeader } from "@/components/ui/bits";
import { addBusAction, assignPassengersAction, autoAssignAction, boardingAction, delayAction, removeBusAction, removePassengerAction, tripMetaAction, tripStatusAction } from "../../actions";

export const metadata: Metadata = { title: "Trip" };

export default async function TripPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser("pilgrims.read");
  const trip = await prisma.trip.findUnique({ where: { id: params.id }, include: { group: true, buses: { include: { transportCompany: true, passengers: { include: { pilgrim: { select: { id: true, fullName: true, specialNeeds: true } } }, orderBy: { pilgrim: { fullName: "asc" } } } } } } });
  if (!trip) notFound();
  const archived = trip.group.status === "ARCHIVED";
  const plan = can(user.role, "planning.write") && !archived, field = can(user.role, "field.write") && !archived;
  const [cands, staff] = await Promise.all([candidatePilgrims(trip.id), prisma.user.findMany({ where: { active: true, role: { not: "AGENT" } }, select: { id: true, name: true }, orderBy: { name: "asc" } })]);
  const staffName = new Map(staff.map((s) => [s.id, s.name]));
  const unseated = cands.filter((c) => !c.busId);
  const airport = trip.type === "ARRIVAL_PICKUP" || trip.type === "DEPARTURE_DROPOFF";
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title={trip.title} sub={`${fmtBoth(effectiveTime(trip))}${trip.delayMinutes ? ` · delayed ${trip.delayMinutes} min` : ""}`}>
        <Badge tone={trip.status === "DONE" ? "success" : trip.status === "IN_PROGRESS" ? "warning" : "neutral"}>{trip.status.replace("_", " ").toLowerCase()}</Badge>
        {field && trip.status === "PLANNED" && <AB action={tripStatusAction.bind(null, trip.id, "IN_PROGRESS")}>Start</AB>}
        {field && trip.status !== "DONE" && <AB action={tripStatusAction.bind(null, trip.id, "DONE")}>Mark done</AB>}
        <a className="text-sm text-primary underline" target="_blank" href={`/api/reports/bus_manifest?id=${trip.id}`}>Manifest PDF</a>
        <Link className="text-sm text-primary underline" href="/trips">All trips</Link>
      </PageHeader>

      {airport && (
        <div className="grid gap-4 md:grid-cols-2">
          {field && <section className="card p-4"><h2 className="mb-2 text-lg">Flight delay</h2><AF action={delayAction.bind(null, trip.id)} submit="Save delay & notify" reset={false}><Field label="Delay (minutes)" htmlFor="d-m"><Input id="d-m" name="minutes" type="number" min={0} max={1440} defaultValue={trip.delayMinutes ?? 0} /></Field></AF></section>}
          {plan && <section className="card p-4"><h2 className="mb-2 text-lg">Airport details</h2><AF action={tripMetaAction.bind(null, trip.id)} submit="Save" reset={false}><Field label={`Terminal (${trip.airport})`} htmlFor="t-term"><Input id="t-term" name="terminal" defaultValue={trip.terminal ?? ""} /></Field></AF></section>}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg">Buses ({trip.buses.length})</h2>{plan && trip.buses.length > 0 && <AB variant="default" action={autoAssignAction.bind(null, trip.id)} confirm="Auto-assign all cleared pilgrims across the buses?">Auto-assign cleared pilgrims</AB>}</div>
        {trip.buses.map((b) => (
          <div key={b.id} className="card p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="font-sans text-base font-semibold">Bus {b.busNo} · {b.vehiclePlate}</h3><p className="text-sm text-muted">{b.transportCompany.name} · driver {b.driverName} ({b.driverPhone}) · in charge: {b.staffInChargeId ? staffName.get(b.staffInChargeId) : "—"}</p></div>
              <div className="flex items-center gap-2"><Badge tone="primary">{b.passengers.length} pilgrims</Badge>{plan && <AB variant="ghost" action={removeBusAction.bind(null, trip.id, b.id)} confirm="Remove this bus?">Remove</AB>}</div>
            </div>
            <ul className="mt-3 divide-y divide-border">
              {b.passengers.map((s) => (
                <li key={s.id} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <Link className="min-w-0 flex-1 truncate text-primary underline" href={`/pilgrims/${s.pilgrim.id}`}>{s.pilgrim.fullName}</Link>
                  {s.pilgrim.specialNeeds && <span title={s.pilgrim.specialNeeds}>♿</span>}
                  <Badge tone={s.boardingStatus === "BOARDED" ? "success" : s.boardingStatus === "PENDING" ? "neutral" : "warning"}>{s.boardingStatus.replace("_", " ").toLowerCase()}</Badge>
                  {field && <span className="flex gap-1">
                    <AB variant="outline" action={boardingAction.bind(null, trip.id, s.pilgrim.id, "BOARDED")}>Boarded</AB><AB action={boardingAction.bind(null, trip.id, s.pilgrim.id, "MISSING")}>Missing</AB>
                    {trip.type !== "ARRIVAL_PICKUP" && trip.type !== "DEPARTURE_DROPOFF" && <AB action={boardingAction.bind(null, trip.id, s.pilgrim.id, "STAYED_BEHIND")}>Stayed behind</AB>}</span>}
                  {plan && s.boardingStatus === "PENDING" && <AB variant="ghost" action={removePassengerAction.bind(null, trip.id, s.pilgrim.id)}>✕</AB>}
                </li>
              ))}
              {!b.passengers.length && <li className="py-2 text-sm text-muted">No passengers yet.</li>}
            </ul>
            {plan && unseated.length > 0 && (
              <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-primary">Assign pilgrims to this bus…</summary>
                <AF action={assignPassengersAction.bind(null, trip.id, b.id)} submit="Assign selected" className="mt-2">
                  <ul className="grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">
                    {unseated.map((p) => <li key={p.id}><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" name="pilgrimIds" value={p.id} className="h-5 w-5" /> <span className="truncate">{p.fullName}</span> {!p.clearance.green && <ClearanceBadge green={false} blocking={p.clearance.blocking} compact />}</label></li>)}
                  </ul>
                  <p className="mt-1 text-xs text-muted">Blocked pilgrims are rejected by the server with the blocking check named.</p>
                </AF>
              </details>
            )}
          </div>
        ))}
        {plan && (
          <details className="card p-4" open={!trip.buses.length}><summary className="cursor-pointer text-sm font-medium text-primary">+ Add bus</summary>
            <AF action={addBusAction.bind(null, trip.id)} submit="Add bus" className="mt-3"><div className="grid gap-3 md:grid-cols-3">
              <Field label="Transport company" htmlFor="b-c"><Input id="b-c" name="company" required /></Field><Field label="Vehicle plate" htmlFor="b-p"><Input id="b-p" name="vehiclePlate" required /></Field><Field label="Bus no." htmlFor="b-n"><Input id="b-n" name="busNo" required /></Field>
              <Field label="Driver name" htmlFor="b-d"><Input id="b-d" name="driverName" required /></Field><Field label="Driver phone" htmlFor="b-dp"><Input id="b-dp" name="driverPhone" inputMode="tel" required /></Field>
              <Field label="Staff in charge" htmlFor="b-s"><Select id="b-s" name="staffInChargeId"><option value="">—</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field></div></AF>
          </details>
        )}
      </section>
      <section className="card p-4"><h2 className="text-lg">Not yet on a bus ({unseated.length})</h2>
        <p className="mb-2 text-xs text-muted">{airport ? "Pilgrims whose ticket matches this flight." : trip.type === "ZIYARAH" ? "Ziyarah is a fixed package: all pilgrims of the group are included." : "All pilgrims in the group."}</p>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">{unseated.slice(0, 60).map((p) => <li key={p.id} className="flex items-center gap-2 text-sm"><span className="truncate">{p.fullName}</span><ClearanceBadge green={p.clearance.green} blocking={p.clearance.blocking} compact /></li>)}</ul>
        {unseated.length > 60 && <p className="mt-1 text-xs text-muted">…and {unseated.length - 60} more.</p>}</section>
    </div>
  );
}
