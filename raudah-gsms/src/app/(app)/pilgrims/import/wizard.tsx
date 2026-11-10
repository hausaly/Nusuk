"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

type Row = { row: number; name: string; passport: string; agent: string; errors: string[] };
type Data = { rows: Record<string, unknown>[]; preview: Row[] };

export function ImportWizard({ preview, commit }: {
  preview: (fd: FormData) => Promise<{ ok: boolean; error?: string; data?: Data }>;
  commit: (rows: Record<string, unknown>[]) => Promise<{ ok: boolean; error?: string; message?: string }>;
}) {
  const router = useRouter();
  const [data, setData] = useState<Data | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const bad = data?.preview.filter((r) => r.errors.length).length ?? 0, good = (data?.preview.length ?? 0) - bad;
  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <form ref={ref} className="card flex flex-wrap items-end gap-3 p-4" onSubmit={(e) => { e.preventDefault(); const fd = new FormData(e.currentTarget); start(async () => { const r = await preview(fd); if (r.ok && r.data) { setData(r.data); setMsg(null); } else setMsg({ tone: "error", text: r.error ?? "Could not read the file." }); }); }}>
        <div className="min-w-0 flex-1"><label htmlFor="file" className="mb-1.5 block text-sm font-medium">Excel (.xlsx) or CSV file</label><Input id="file" name="file" type="file" accept=".xlsx,.csv" required /></div>
        <Button type="submit" disabled={pending}>Preview</Button>
      </form>
      {data && (
        <>
          <div className="flex flex-wrap items-center gap-3"><Badge tone="success">{good} ready</Badge><Badge tone={bad ? "danger" : "neutral"}>{bad} with errors</Badge>
            <Button disabled={pending || !good} onClick={() => start(async () => { const r = await commit(data.rows); setMsg(r.ok ? { tone: "success", text: r.message ?? "Imported." } : { tone: "error", text: r.error ?? "Failed" }); if (r.ok) { setData(null); ref.current?.reset(); router.refresh(); } })}>Import {good} valid row(s)</Button>
            <span className="text-xs text-muted">Rows with errors are skipped; nothing is saved until you confirm.</span></div>
          <div className="card max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[560px] text-sm"><thead><tr className="sticky top-0 bg-surface text-left text-xs uppercase text-muted"><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Passport</th><th className="px-3 py-2">Agent</th><th className="px-3 py-2">Result</th></tr></thead>
              <tbody>{data.preview.map((r) => <tr key={r.row} className="border-t border-border"><td className="px-3 py-2">{r.row}</td><td className="px-3 py-2">{r.name}</td><td className="px-3 py-2 font-mono text-xs">{r.passport}</td><td className="px-3 py-2">{r.agent}</td>
                <td className="px-3 py-2">{r.errors.length ? <span className="text-danger">✕ {r.errors.join("; ")}</span> : <span className="text-success">✓ OK</span>}</td></tr>)}</tbody></table>
          </div>
        </>
      )}
    </div>
  );
}
