import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { fmtBoth } from "@/lib/tz";
import { groupDashboard, roleDashboard } from "@/services/dashboard";
import { effectiveTime } from "@/services/trips";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { PageHeader, Stat, Table } from "@/components/ui/bits";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Dashboard" };
const JOURNEY: [string, string][] = [["IN_MAKKAH", "In Makkah"], ["IN_MADINAH", "In Madinah"], ["IN_TRANSIT", "In transit"], ["DEPARTED", "Departed"]];

export default async function Home() {
  const user = await requirePageUser();
  const { current } = await getGroupContext(user);
  if (!current)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <h1 className="text-2xl text-primary">Welcome, {user.name.split(" ")[0]}</h1>
        <Alert tone="info">{can(user.role, "groups.manage") ? <>No groups yet. <Link className="font-medium underline" href="/groups">Create the first group</Link>.</> : "No group is available to you yet."}</Alert>
      </div>
    );
  const d = await groupDashboard(user, current.id);
  const rd = user.role === "AGENT" ? null : await roleDashboard(current.id);
  const isStaff = user.role !== "AGENT";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader title={user.role === "AGENT" ? "My pilgrims" : "Group dashboard"} sub={`${current.code} · ${current.name} · signed in as ${ROLE_LABELS[user.role]}`} />

      <section aria-label="Clearance" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Pilgrims" value={d.total} />
        <Stat label="Cleared (green)" value={d.green} tone="success" />
        <Stat label="Blocked (red)" value={d.red} tone="danger" hint={d.red ? Object.entries(d.redBy).filter(([, n]) => n).map(([k, n]) => `${k.toLowerCase()} ${n}`).join(" · ") : undefined} />
        <Stat label="Journey" value={<span className="text-base font-sans">{JOURNEY.map(([k, l]) => <span key={k} className="mr-3 inline-block"><b className="text-xl font-heading text-primary">{d.journey[k] ?? 0}</b> <span className="text-xs text-muted">{l}</span></span>)}</span>} />
      </section>

      {d.red > 0 && (
        <div className="card p-4">
          <h2 className="mb-2 text-lg">Blocked pilgrims by check</h2>
          <div className="flex flex-wrap gap-2">
            {Object.entries(d.redBy).map(([k, n]) => (
              <Link key={k} href={`/pilgrims?status=RED&blocking=${k}`} className="rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2/60 min-h-11 inline-flex items-center gap-2">
                <Badge tone={n ? "danger" : "success"}>{n}</Badge> waiting on {k.toLowerCase()}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isStaff && (
        <>
          <section className="grid gap-4 lg:grid-cols-2">
            {([["Today's arrivals", d.arrivals], ["Today's departures", d.departures]] as const).map(([title, trips]) => (
              <div key={title}>
                <h2 className="mb-2 text-lg">{title}</h2>
                <Table head={["Flight", "Airport", "Time", "Pilgrims", "Buses"]} min={420} empty={trips.length ? undefined : "None today."}>
                  {trips.map((t) => (
                    <tr key={t.id}>
                      <td><Link href={`/trips/${t.id}`} className="font-medium text-primary underline">{t.flightNo}</Link>{t.delayMinutes ? <Badge tone="warning" className="ml-1">+{t.delayMinutes}m</Badge> : null}</td>
                      <td>{t.airport}</td><td className="whitespace-nowrap text-xs">{fmtBoth(t.eff)}</td><td>{t.expected ?? "—"}</td>
                      <td>{t.hasBus ? <Badge tone="success">{t.buses.length} bus · {t.seated} seated</Badge> : <Badge tone="danger">No bus</Badge>}</td>
                    </tr>
                  ))}
                </Table>
              </div>
            ))}
          </section>
          <section className="grid gap-3 sm:grid-cols-3">
            <Stat label="Pending check-ins" value={d.pendingCheckIns} />
            <Stat label="Pending check-outs" value={d.pendingCheckOuts} />
            <Stat label="Trips in next 48 h" value={d.next48.length} />
          </section>
          {d.next48.length > 0 && (
            <Table head={["Trip", "Type", "When"]} min={420}>
              {d.next48.map((t) => <tr key={t.id}><td><Link className="text-primary underline" href={`/trips/${t.id}`}>{t.title}</Link></td><td>{t.type.replace("_", " ").toLowerCase()}</td><td className="whitespace-nowrap text-xs">{fmtBoth(effectiveTime(t))}</td></tr>)}
            </Table>
          )}
        </>
      )}

      {rd && (user.role === "VISA_OFFICER" || user.role === "SUPER_ADMIN") && (
        <section className="card p-4"><h2 className="text-lg">Visas</h2><p className="text-sm text-muted">{rd.visaPending} pilgrim(s) without a confirmed visa. {rd.unmatched.filter((x) => x.type === "VISA").length} PDF(s) in the queue.</p><Button asChild variant="outline" size="sm" className="mt-2"><Link href="/documents?type=VISA">Open visa queue</Link></Button></section>
      )}
      {rd && (user.role === "TICKET_OFFICER" || user.role === "SUPER_ADMIN") && (
        <section className="card p-4"><h2 className="text-lg">Tickets</h2><p className="text-sm text-muted">{rd.ticketPending} pilgrim(s) without a confirmed ticket. {rd.unmatched.filter((x) => x.type === "TICKET").length} PDF(s) in the queue.</p><Button asChild variant="outline" size="sm" className="mt-2"><Link href="/documents?type=TICKET">Open ticket queue</Link></Button></section>
      )}
      {rd && (user.role === "FINANCE_STAFF" || user.role === "SUPER_ADMIN") && (
        <section><h2 className="mb-2 text-lg">Payment pending ({rd.payPending.length})</h2>
          <Table head={["Pilgrim", "Agent"]} min={360} empty={rd.payPending.length ? undefined : "All payments cleared."}>
            {rd.payPending.slice(0, 15).map((p) => <tr key={p.id}><td><Link className="text-primary underline" href={`/pilgrims/${p.id}`}>{p.fullName}</Link></td><td>{p.agent.groupName}</td></tr>)}
          </Table>
        </section>
      )}
      {user.role === "AGENT" && <Alert tone="info">Your account is read-only. Open <Link className="font-medium underline" href="/pilgrims">Pilgrims</Link> to see clearance, flights, hotel and bus for your own pilgrims.</Alert>}
    </div>
  );
}
