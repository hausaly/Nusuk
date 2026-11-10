import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { can } from "@/lib/rbac";
import { signedUrl } from "@/lib/storage";
import { warningsForDocument } from "@/services/documents";
import { LABELS, REQUIRED, TICKET_FIELDS, VISA_FIELDS, type DocKind } from "@/services/extraction";
import { AF } from "@/components/forms";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/bits";
import { confirmDocumentAction } from "../../actions";

export const metadata: Metadata = { title: "Review document" };

export default async function ReviewPage({ params }: { params: { id: string } }) {
  const user = await requirePageUser("pilgrims.read");
  const doc = await prisma.document.findUnique({ where: { id: params.id }, include: { pilgrim: true } });
  if (!doc || (doc.type !== "TICKET" && doc.type !== "VISA")) notFound();
  const kind = doc.type as DocKind;
  const fields = ((doc.extractedJson as any)?.fields ?? {}) as Record<string, string>;
  const conf = (doc.fieldConfidence ?? {}) as Record<string, number>;
  const keys = kind === "TICKET" ? TICKET_FIELDS : VISA_FIELDS;
  const pilgrims = await prisma.pilgrim.findMany({ where: { groupId: doc.groupId }, select: { id: true, fullName: true, passportNo: true }, orderBy: { fullName: "asc" } });
  const warnings = await warningsForDocument(doc, fields, doc.pilgrimId);
  const canEdit = can(user.role, kind === "TICKET" ? "ticket.write" : "visa.write") && doc.status !== "CONFIRMED";
  const url = doc.fileKey !== "purged" ? signedUrl(doc.fileKey) : null;
  const low = (k: string) => (conf[k] !== undefined && conf[k] < 0.85) || (REQUIRED[kind].includes(k) && !fields[k]);
  const type = (k: string) => (k.endsWith("At") ? "datetime-local" : k.endsWith("Date") ? "date" : "text");
  const val = (k: string) => (k.endsWith("At") ? fields[k]?.slice(0, 16) : fields[k]) ?? "";
  return (
    <div className="mx-auto max-w-7xl">
      <PageHeader title={`Review ${kind.toLowerCase()}`} sub={doc.fileName}><Badge tone={doc.status === "CONFIRMED" ? "success" : "warning"}>{doc.status.replace("_", " ").toLowerCase()}</Badge></PageHeader>
      {doc.error && <Alert tone="warning" className="mb-3">{doc.error}</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card overflow-hidden"><div className="border-b border-border px-3 py-2 text-xs uppercase tracking-wide text-muted">Original PDF</div>
          {url ? <iframe title="PDF preview" src={url} className="h-[70vh] w-full" /> : <p className="p-6 text-sm text-muted">File purged.</p>}</div>
        <div className="card p-4">
          <h2 className="mb-1 text-lg">Extracted fields</h2>
          <p className="mb-3 text-xs text-muted"><span className="inline-block h-2.5 w-2.5 rounded-sm border-2 border-warning align-middle" /> Highlighted = confidence below 85% or missing – please check against the PDF.</p>
          {warnings.map((w) => <Alert key={w.code} tone="warning" className="mb-2">⚠ {w.message}</Alert>)}
          {canEdit ? (
            <AF action={confirmDocumentAction.bind(null, doc.id, doc.pilgrimId ?? "")} reset={false} submit="Confirm & attach">
              <Field label="Pilgrim" htmlFor="pilgrimId"><Select id="pilgrimId" name="pilgrimId" required defaultValue={doc.pilgrimId ?? ""}><option value="">Select pilgrim…</option>{pilgrims.map((p) => <option key={p.id} value={p.id}>{p.fullName} · {p.passportNo}</option>)}</Select></Field>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {keys.map((k) => (
                  <Field key={k} label={`${LABELS[k]}${conf[k] !== undefined ? ` · ${Math.round(conf[k] * 100)}%` : ""}`} htmlFor={`f_${k}`}>
                    <Input id={`f_${k}`} name={`f_${k}`} type={type(k)} defaultValue={val(k)} className={low(k) ? "border-2 border-warning" : ""} aria-invalid={low(k) || undefined} />
                  </Field>
                ))}
              </div>
            </AF>
          ) : (
            <dl className="space-y-1 text-sm">{keys.map((k) => <div key={k} className="flex justify-between border-b border-border py-1"><dt className="text-muted">{LABELS[k]}</dt><dd className="font-medium">{fields[k] ?? "—"}</dd></div>)}</dl>
          )}
          {doc.pilgrim && <p className="mt-3 text-sm">Attached to <Link className="text-primary underline" href={`/pilgrims/${doc.pilgrim.id}`}>{doc.pilgrim.fullName}</Link>.</p>}
        </div>
      </div>
    </div>
  );
}
