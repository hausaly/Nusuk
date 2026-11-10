import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { fmtBoth } from "@/lib/tz";
import { effectiveTime } from "@/services/trips";
import { AB, AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Table } from "@/components/ui/bits";
import { addZiyarahAction, createTripAction, ziyarahDoneAction } from "../actions";

export const metadata: Metadata = { title: "Trips & buses" };
const LABEL = { ARRIVAL_PICKUP: "Airport pick-up", INTERCITY: "Intercity transfer", ZIYARAH: "Ziyarah", DEPARTURE_DROPOFF: "Airport drop-off" } as const;

export default async function TripsPage({ searchParams }: { searchParams: { type?: keyof typeof LABEL } }) {
  const user = await requirePageUser("pilgrims.read");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const type = searchParams.type && searchParams.type in LABEL ? searchParams.type : undefined;
  const [trips, ziyarah] = await Promise.all([
    prisma.trip.findMany({ where: { groupId: current.id, ...(type ? { type } : {}) }, orderBy: { scheduledAt: "asc" }, include: { buses: { include: { _count: { select: { passengers: true } } } } } }),
    prisma.ziyarahItem.findMany({ where: { groupId: current.id }, orderBy: { scheduledAt: "asc" } }),
  ]);
  const plan = can(user.role, "planning.write") && current.status !== "ARCHIVED", field = can(user.role, "field.write") && current.status !== "ARCHIVED";
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title="Trips & buses" sub={`${current.code} · airport trips are generated automatically from confirmed tickets`} />
      <div className="flex flex-wrap gap-2">
        <Link href="/trips" className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm ${!type ? "bg-primary text-primary-foreground" : "border border-border"}`}>All</Link>
        {(Object.keys(LABEL) as (keyof typeof LABEL)[]).map((t) => <Link key={t} href={`/trips?type=${t}`} className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm ${type === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-surface-2/60"}`}>{LABEL[t]}</Link>)}
      </div>
      <Table head={["Trip", "Type", "When (KSA · NG)", "Buses", "Passengers", "Status"]} min={820} empty={trips.length ? undefined : "No trips yet."}>
        {trips.map((t) => (
          <tr key={t.id}>
            <td><Link href={`/trips/${t.id}`} className="font-medium text-primary underline">{t.title}</Link>{t.terminal && <div className="text-xs text-muted">Terminal {t.terminal}</div>}</td>
            <td>{LABEL[t.type]}</td>
            <td className="whitespace-nowrap text-xs">{fmtBoth(effectiveTime(t))}{t.delayMinutes ? <Badge tone="warning" className="ml-1">+{t.delayMinutes} min</Badge> : null}</td>
            <td>{t.buses.length ? t.buses.length : <Badge tone="danger">none</Badge>}</td><td>{t.buses.reduce((s, b) => s + b._count.passengers, 0)}</td>
            <td><Badge tone={t.status === "DONE" ? "success" : t.status === "IN_PROGRESS" ? "warning" : "neutral"}>{t.status.replace("_", " ").toLowerCase()}</Badge></td>
          </tr>
        ))}
      </Table>

      <section className="space-y-3"><h2 className="text-lg">Ziyarah package <span className="text-sm font-normal text-muted">(fixed for the whole group – every cleared pilgrim is auto-included)</span></h2>
        <Table head={["Site", "City", "When (KSA)", "Visit", ""]} min={560} empty={ziyarah.length ? undefined : "No ziyarah stops yet."}>
          {ziyarah.map((z) => <tr key={z.id}><td className="font-medium"><Link className="text-primary underline" href={`/trips/${z.tripId}`}>{z.site}</Link></td><td>{z.city}</td><td className="whitespace-nowrap text-xs">{fmtBoth(z.scheduledAt)}</td>
            <td>{z.done ? <Badge tone="success">Done</Badge> : <Badge>Planned</Badge>}</td><td>{field && !z.done && <AB action={ziyarahDoneAction.bind(null, z.id)}>Mark visited</AB>}</td></tr>)}
        </Table>
        {plan && <details className="card p-4"><summary className="cursor-pointer text-sm font-medium text-primary">+ Add ziyarah stop</summary>
          <AF action={addZiyarahAction.bind(null, current.id)} submit="Add stop" className="mt-3"><div className="grid gap-3 md:grid-cols-3">
            <Field label="Site" htmlFor="z-s"><Input id="z-s" name="site" required placeholder="Masjid Quba" /></Field>
            <Field label="City" htmlFor="z-c"><Select id="z-c" name="city"><option value="MADINAH">Madinah</option><option value="MAKKAH">Makkah</option><option value="OTHER">Other</option></Select></Field>
            <Field label="Date & time (KSA)" htmlFor="z-d"><Input id="z-d" name="scheduledAt" type="datetime-local" required /></Field></div></AF></details>}
      </section>
      {plan && <details className="card p-4"><summary className="cursor-pointer text-sm font-medium text-primary">+ Add intercity transfer</summary>
        <AF action={createTripAction.bind(null, current.id)} submit="Create trip" className="mt-3"><input type="hidden" name="type" value="INTERCITY" /><div className="grid gap-3 md:grid-cols-4">
          <Field label="Title" htmlFor="t-t"><Input id="t-t" name="title" required defaultValue="Makkah → Madinah" /></Field><Field label="From" htmlFor="t-f"><Input id="t-f" name="fromCity" defaultValue="MAKKAH" /></Field>
          <Field label="To" htmlFor="t-to"><Input id="t-to" name="toCity" defaultValue="MADINAH" /></Field><Field label="Date & time (KSA)" htmlFor="t-d"><Input id="t-d" name="scheduledAt" type="datetime-local" required /></Field></div></AF></details>}
    </div>
  );
}
