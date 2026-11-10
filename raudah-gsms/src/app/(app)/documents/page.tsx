import type { Metadata } from "next";
import Link from "next/link";
import { requirePageUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { AB, AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader, Table } from "@/components/ui/bits";
import { assignUnmatchedAction, bulkConfirmAction, deleteDocumentAction, uploadDocumentsAction } from "../actions";

export const metadata: Metadata = { title: "Tickets & visas" };
const TONE = { UPLOADED: "neutral", EXTRACTED: "primary", NEEDS_REVIEW: "warning", UNMATCHED: "danger", CONFIRMED: "success" } as const;

export default async function DocumentsPage({ searchParams }: { searchParams: { type?: string; status?: string } }) {
  const user = await requirePageUser("pilgrims.read");
  const { current } = await getGroupContext(user);
  if (!current) return <Alert tone="info">No group selected.</Alert>;
  const type = (["TICKET", "VISA", "PASSPORT_COPY", "PAYMENT_RECEIPT"].includes(searchParams.type ?? "") ? searchParams.type : undefined) as "TICKET" | "VISA" | undefined;
  const status = searchParams.status as "UNMATCHED" | undefined;
  const [docs, pilgrims, counts] = await Promise.all([
    prisma.document.findMany({ where: { groupId: current.id, ...(type ? { type } : {}), ...(status ? { status } : {}) }, orderBy: { createdAt: "desc" }, take: 200, include: { pilgrim: { select: { fullName: true } } } }),
    prisma.pilgrim.findMany({ where: { groupId: current.id }, select: { id: true, fullName: true, passportNo: true }, orderBy: { fullName: "asc" } }),
    prisma.document.groupBy({ by: ["status"], where: { groupId: current.id }, _count: true }),
  ]);
  const n = (s: string) => counts.find((c) => c.status === s)?._count ?? 0;
  const canUp = can(user.role, "ticket.write") || can(user.role, "visa.write") || can(user.role, "documents.write");
  const writable = current.status !== "ARCHIVED";
  const tab = (label: string, q: string, active: boolean) => <Link href={`/documents${q}`} className={`inline-flex min-h-10 items-center rounded-xl px-3 text-sm ${active ? "bg-primary text-primary-foreground" : "border border-border hover:bg-surface-2/60"}`}>{label}</Link>;
  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader title="Tickets & visas" sub={`${current.code} · upload PDFs, review extracted fields, confirm`} />
      {canUp && writable && (
        <section className="card p-4">
          <h2 className="mb-2 text-lg">Upload PDFs</h2>
          <AF action={uploadDocumentsAction.bind(null, current.id)} submit="Upload & extract" className="grid gap-4 md:grid-cols-3">
            <Field label="Document type" htmlFor="up-type"><Select id="up-type" name="type" defaultValue={type ?? "TICKET"}>
              {can(user.role, "ticket.write") && <option value="TICKET">Flight ticket(s)</option>}{can(user.role, "visa.write") && <option value="VISA">Visa(s)</option>}
              {can(user.role, "documents.write") && <><option value="PASSPORT_COPY">Passport copy</option><option value="PAYMENT_RECEIPT">Payment receipt</option></>}</Select></Field>
            <Field label="PDF file(s) – drag in many at once" htmlFor="up-files"><Input id="up-files" name="files" type="file" accept="application/pdf" multiple required /></Field>
            <Field label="Pilgrim (passport copy / receipt only)" htmlFor="up-p"><Select id="up-p" name="pilgrimId"><option value="">—</option>{pilgrims.map((p) => <option key={p.id} value={p.id}>{p.fullName} · {p.passportNo}</option>)}</Select></Field>
          </AF>
          <p className="mt-2 text-xs text-muted">Group tickets with several passengers are split into one record per passenger. Records are matched by passport number, then by name.</p>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {tab(`All (${docs.length})`, "", !type && !status)}{tab("Tickets", "?type=TICKET", type === "TICKET" && !status)}{tab("Visas", "?type=VISA", type === "VISA" && !status)}
        {tab(`Unmatched (${n("UNMATCHED")})`, "?status=UNMATCHED", status === "UNMATCHED")}
        <span className="ml-auto flex gap-2">
          {writable && can(user.role, "ticket.write") && <AB action={bulkConfirmAction.bind(null, current.id, "TICKET")} confirm="Confirm all high-confidence matched tickets?">Bulk-confirm tickets</AB>}
          {writable && can(user.role, "visa.write") && <AB action={bulkConfirmAction.bind(null, current.id, "VISA")} confirm="Confirm all high-confidence matched visas?">Bulk-confirm visas</AB>}
        </span>
      </div>
      <Table head={["File", "Type", "Pilgrim", "Status", ""]} min={720} empty={docs.length ? undefined : "Nothing here yet."}>
        {docs.map((d) => (
          <tr key={d.id}>
            <td className="max-w-[18rem] truncate">{d.fileName}{d.passengerIndex > 0 && <span className="ml-1 text-xs text-muted">(passenger {d.passengerIndex + 1})</span>}{d.error && <div className="text-xs text-warning">{d.error}</div>}</td>
            <td>{d.type.replace("_", " ").toLowerCase()}</td>
            <td>{d.pilgrim ? <Link className="text-primary underline" href={`/pilgrims/${d.pilgrimId}`}>{d.pilgrim.fullName}</Link> : (d.extractedJson as any)?.fields?.passengerName ? <span className="text-muted">{(d.extractedJson as any).fields.passengerName} (no match)</span> : "—"}</td>
            <td><Badge tone={TONE[d.status]}>{d.status.replace("_", " ").toLowerCase()}</Badge></td>
            <td className="space-y-1">
              {(d.type === "TICKET" || d.type === "VISA") && d.status !== "CONFIRMED" && <Link href={`/documents/${d.id}`} className="inline-flex min-h-9 items-center rounded-xl bg-primary px-3 text-sm text-primary-foreground">Review</Link>}
              {d.status === "CONFIRMED" && (d.type === "TICKET" || d.type === "VISA") && <Link href={`/documents/${d.id}`} className="text-sm text-primary underline">View</Link>}
              {d.status === "UNMATCHED" && writable && (
                <AF action={assignUnmatchedAction.bind(null, d.id)} submit="Link" className="flex items-end gap-1">
                  <Select name="pilgrimId" required aria-label="Link to pilgrim" className="max-w-[12rem]"><option value="">Link to…</option>{pilgrims.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</Select>
                </AF>
              )}
              {d.status !== "CONFIRMED" && writable && <div><AB variant="ghost" action={deleteDocumentAction.bind(null, d.id)} confirm="Delete this upload?">Delete</AB></div>}
            </td>
          </tr>
        ))}
      </Table>
    </div>
  );
}
