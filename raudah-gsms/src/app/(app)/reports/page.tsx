import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { REPORTS, reportsFor, type ReportKey } from "@/services/reports";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/bits";

export const metadata: Metadata = { title: "Reports" };
const NEEDS: Partial<Record<ReportKey, "trip" | "hotel">> = { bus_manifest: "trip", rooming_list: "hotel" };

export default async function ReportsPage() {
  const user = await requirePageUser("reports.export");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const [trips, hotels] = await Promise.all([prisma.trip.findMany({ where: { groupId: current.id }, orderBy: { scheduledAt: "asc" }, select: { id: true, title: true } }), prisma.hotel.findMany({ where: { groupId: current.id }, select: { id: true, name: true } })]);
  const allowed = reportsFor(user);
  const link = "inline-flex min-h-10 items-center rounded-xl border border-border px-3 text-sm hover:bg-surface-2/60";
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <PageHeader title="Reports" sub={`${current.code} · branded PDF and Excel. ${user.role === "AGENT" ? "Only your own pilgrims are included." : ""}`} />
      <div className="grid gap-3 sm:grid-cols-2">
        {allowed.map((k) => (
          <form key={k} action={`/api/reports/${k}`} method="get" target="_blank" className="card flex flex-col gap-3 p-4">
            <h2 className="font-sans text-base font-semibold">{REPORTS[k]}</h2>
            {NEEDS[k] === "trip" && <Select name="id" required aria-label="Trip"><option value="">Select trip…</option>{trips.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}</Select>}
            {NEEDS[k] === "hotel" && <Select name="id" required aria-label="Hotel"><option value="">Select hotel…</option>{hotels.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}</Select>}
            <div className="flex gap-2"><button className={link} type="submit">PDF</button><button className={link} type="submit" name="format" value="xlsx">Excel</button></div>
          </form>
        ))}
      </div>
    </div>
  );
}
