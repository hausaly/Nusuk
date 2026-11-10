import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { assertCan } from "@/lib/rbac";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Audit log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: { page?: string; entity?: string } }) {
  const actor = await requirePageUser("audit.read");
  assertCan(actor, "audit.read");
  const page = Math.max(1, Number(searchParams.page) || 1);
  const where = searchParams.entity ? { entity: searchParams.entity } : {};
  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { at: "desc" }, skip: (page - 1) * PAGE, take: PAGE, include: { user: { select: { name: true } } } }),
    prisma.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const q = (p: number) => `/admin/audit?page=${p}${searchParams.entity ? `&entity=${searchParams.entity}` : ""}`;
  return (
    <div className="mx-auto max-w-6xl">
      <h1 className="mb-1 text-2xl text-primary">Audit log</h1>
      <p className="mb-4 text-sm text-muted">Every create, update and delete, with old and new values. {total} entries.</p>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
            <th className="px-4 py-3">When (UTC)</th><th className="px-4 py-3">Who</th><th className="px-4 py-3">Action</th><th className="px-4 py-3">Record</th><th className="px-4 py-3">Field</th><th className="px-4 py-3">Old</th><th className="px-4 py-3">New</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border align-top last:border-0">
                <td className="whitespace-nowrap px-4 py-2.5 text-muted">{r.at.toISOString().slice(0, 19).replace("T", " ")}</td>
                <td className="px-4 py-2.5">{r.user?.name ?? "System"}</td>
                <td className="px-4 py-2.5 font-medium">{r.action}</td>
                <td className="px-4 py-2.5">{r.entity} <span className="text-xs text-muted">{r.entityId.slice(0, 8)}</span></td>
                <td className="px-4 py-2.5">{r.field ?? "—"}</td>
                <td className="max-w-[16rem] break-words px-4 py-2.5 text-muted">{r.oldValue ?? "—"}</td>
                <td className="max-w-[16rem] break-words px-4 py-2.5">{r.newValue ?? "—"}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted">Nothing logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between text-sm">
        <span className="text-muted">Page {page} of {pages}</span>
        <div className="flex gap-2">
          {page > 1 && <Button asChild variant="outline" size="sm"><Link href={q(page - 1)}>Previous</Link></Button>}
          {page < pages && <Button asChild variant="outline" size="sm"><Link href={q(page + 1)}>Next</Link></Button>}
        </div>
      </div>
    </div>
  );
}
