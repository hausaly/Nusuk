import { CheckCircle2, ShieldX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** GREEN / RED status always shows icon + text (never colour alone); RED names the blocking checks. */
export function ClearanceBadge({ green, blocking = [], compact }: { green: boolean; blocking?: string[]; compact?: boolean }) {
  return green ? (
    <Badge tone="success"><CheckCircle2 className="h-3 w-3" aria-hidden /> Cleared</Badge>
  ) : (
    <span className="inline-flex flex-wrap items-center gap-1">
      <Badge tone="danger"><ShieldX className="h-3 w-3" aria-hidden /> Blocked</Badge>
      {!compact && blocking.map((b) => <Badge key={b} tone="neutral">{b.toLowerCase()}</Badge>)}
    </span>
  );
}

export function PageHeader({ title, children, sub }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="text-2xl text-primary">{title}</h1>{sub && <p className="mt-0.5 text-sm text-muted">{sub}</p>}</div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Table({ head, children, empty, min = 640 }: { head: string[]; children: React.ReactNode; empty?: string; min?: number }) {
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm" style={{ minWidth: min }}>
        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">{head.map((h) => <th key={h} className="px-3 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-border [&>tr:last-child]:border-0 [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-top">{children}</tbody>
      </table>
      {empty && <div className="px-4 py-8 text-center text-sm text-muted">{empty}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, hint }: { label: string; value: React.ReactNode; tone?: "success" | "danger" | "primary"; hint?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 font-sans text-3xl font-semibold tabular-nums", tone === "success" && "text-success", tone === "danger" && "text-danger", tone === "primary" && "text-primary")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export const textArea = "w-full rounded-xl border border-border bg-surface px-3 py-2 text-base md:text-sm";
