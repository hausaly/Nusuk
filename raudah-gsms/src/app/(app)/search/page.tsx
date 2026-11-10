import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { searchPilgrims } from "@/services/search";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ClearanceBadge, PageHeader, Table } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: { q?: string } }) {
  const user = await requirePageUser();
  const q = searchParams.q ?? "";
  const rows = await searchPilgrims(user, q);
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Search" sub="Name, passport no., visa no., PNR or phone – across all groups you can access." />
      <form className="flex gap-2" role="search"><Input name="q" defaultValue={q} autoFocus placeholder="e.g. Musa, A1234567, PNR, 0803…" aria-label="Search" /><Button type="submit">Search</Button></form>
      {q.trim().length >= 2 && <Table head={["Pilgrim", "Passport", "Group", "Agent", "Clearance"]} min={640} empty={rows.length ? undefined : "No matches."}>
        {rows.map((p) => <tr key={p.id}><td><Link className="font-medium text-primary underline" href={`/pilgrims/${p.id}`}>{p.fullName}</Link></td><td className="font-mono text-xs">{p.passportNo}</td><td>{p.group.code}</td><td>{p.agent.groupName}</td><td><ClearanceBadge green={p.clearance.green} blocking={p.clearance.blocking} /></td></tr>)}</Table>}
    </div>
  );
}
