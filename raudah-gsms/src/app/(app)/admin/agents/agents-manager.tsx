"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/input";
import { deleteAgentAction, saveAgentAction } from "./actions";

interface Row { id: string; groupName: string; contactName: string; phone: string | null; email: string | null; active: boolean; users: number }
type Form = { id: string | null; groupName: string; contactName: string; phone: string; email: string; active: boolean };
const blank: Form = { id: null, groupName: "", contactName: "", phone: "", email: "", active: true };

export function AgentsManager({ agents }: { agents: Row[] }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error ?? "Failed." });
      if (r.ok) { after?.(); router.refresh(); }
    });

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!form && <Button onClick={() => { setMsg(null); setForm(blank); }}><Plus className="h-4 w-4" aria-hidden /> Add agent</Button>}
      {form && (
        <form className="card space-y-4 p-4 md:p-5" onSubmit={(e) => { e.preventDefault(); const { id, ...d } = form; run(() => saveAgentAction(id, d), () => setForm(null)); }}>
          <h2 className="text-lg">{form.id ? "Edit agent" : "New agent"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Agent group name" htmlFor="a-name"><Input id="a-name" required value={form.groupName} onChange={(e) => set("groupName", e.target.value)} /></Field>
            <Field label="Contact name" htmlFor="a-contact"><Input id="a-contact" required value={form.contactName} onChange={(e) => set("contactName", e.target.value)} /></Field>
            <Field label="Phone" htmlFor="a-phone"><Input id="a-phone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="E-mail" htmlFor="a-email"><Input id="a-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
          </div>
          {form.id && <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" checked={form.active} onChange={(e) => set("active", e.target.checked)} /> Active</label>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>Save</Button>
            <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
        </form>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted"><th className="px-4 py-3">Agent group</th><th className="px-4 py-3">Contact</th><th className="px-4 py-3">Users</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" /></tr></thead>
          <tbody>
            {agents.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-muted">No agents yet.</td></tr>}
            {agents.map((a) => (
              <tr key={a.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{a.groupName}</td>
                <td className="px-4 py-3">{a.contactName}<div className="text-xs text-muted">{[a.phone, a.email].filter(Boolean).join(" · ")}</div></td>
                <td className="px-4 py-3">{a.users}</td>
                <td className="px-4 py-3"><Badge tone={a.active ? "success" : "neutral"}>{a.active ? "Active" : "Inactive"}</Badge></td>
                <td className="space-x-2 px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => { setMsg(null); setForm({ id: a.id, groupName: a.groupName, contactName: a.contactName, phone: a.phone ?? "", email: a.email ?? "", active: a.active }); }}>Edit</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => { if (confirm(`Delete ${a.groupName}?`)) run(() => deleteAgentAction(a.id)); }}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
