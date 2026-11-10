import type { Metadata } from "next";
import Link from "next/link";
import type { CheckType } from "@prisma/client";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { listPilgrims } from "@/services/pilgrims";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { ClearanceBadge, PageHeader, Table } from "@/components/ui/bits";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Pilgrims" };
type SP = { q?: string; status?: "GREEN" | "RED"; blocking?: CheckType; page?: string; agent?: string };

export default async function PilgrimsPage({ searchParams }: { searchParams: SP }) {
  const user = await requirePageUser();
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const [res, agents] = await Promise.all([
    listPilgrims(user, { groupId: current.id, q: searchParams.q, status: searchParams.status, blocking: searchParams.blocking, agentId: searchParams.agent, page: Number(searchParams.page) || 1 }),
    user.role === "AGENT" ? [] : prisma.agent.findMany({ orderBy: { groupName: "asc" } }),
  ]);
  const pages = Math.max(1, Math.ceil(res.total / res.pageSize));
  const qs = (p: number) => { const u = new URLSearchParams(Object.entries({ ...searchParams, page: String(p) }).filter(([, v]) => v) as [string, string][]); return `/pilgrims?${u}`; };
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader title="Pilgrims" sub={`${current.code} · ${res.total} pilgrim(s)`}>
        {can(user.role, "pilgrims.write") && current.status !== "ARCHIVED" && <>
          <Button asChild variant="outline"><Link href="/pilgrims/import">Import Excel/CSV</Link></Button>
          <Button asChild><Link href="/pilgrims/new">Add pilgrim</Link></Button></>}
      </PageHeader>
      <form className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <Input name="q" defaultValue={searchParams.q} placeholder="Name, passport or phone" aria-label="Search pilgrims" className="lg:col-span-2" />
        <Select name="status" defaultValue={searchParams.status ?? ""} aria-label="Clearance"><option value="">All statuses</option><option value="GREEN">Cleared</option><option value="RED">Blocked</option></Select>
        {agents.length > 0 && <Select name="agent" defaultValue={searchParams.agent ?? ""} aria-label="Agent"><option value="">All agents</option>{agents.map((a) => <option key={a.id} value={a.id}>{a.groupName}</option>)}</Select>}
        <Button type="submit" variant="outline">Filter</Button>
      </form>
      <Table head={["Pilgrim", "Passport", "Agent", "Clearance", "Journey"]} min={720} empty={res.rows.length ? undefined : "No pilgrims match."}>
        {res.rows.map((p) => (
          <tr key={p.id}>
            <td><Link href={`/pilgrims/${p.id}`} className="font-medium text-primary underline">{p.fullName}</Link>{p.specialNeeds && <div className="text-xs text-muted">♿ {p.specialNeeds}</div>}</td>
            <td className="font-mono text-xs">{p.passportNo}</td><td>{p.agent.groupName}</td>
            <td><ClearanceBadge green={p.clearance.green} blocking={p.clearance.blocking} /></td>
            <td className="text-xs">{p.journeyStatus.replace("_", " ").toLowerCase()}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">Page {res.page} of {pages}</span>
        <div className="flex gap-2">{res.page > 1 && <Button asChild variant="outline" size="sm"><Link href={qs(res.page - 1)}>Previous</Link></Button>}{res.page < pages && <Button asChild variant="outline" size="sm"><Link href={qs(res.page + 1)}>Next</Link></Button>}</div>
      </div>
    </div>
  );
}
