"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Role } from "@prisma/client";
import { Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/input";
import { ROLES, ROLE_LABELS } from "@/lib/rbac";
import { createUserAction, resetPasswordAction, resetTotpAction, updateUserAction } from "./actions";

interface UserRow {
  id: string; name: string; email: string | null; phone: string | null; role: Role; agentId: string | null;
  active: boolean; totpEnabled: boolean; lastLoginAt: string | null; agent: { groupName: string } | null;
}
type Form = { id?: string; name: string; email: string; phone: string; role: Role; agentId: string; active: boolean; password: string };
const blank: Form = { name: "", email: "", phone: "", role: "OPERATIONS_STAFF", agentId: "", active: true, password: "" };

export function UsersManager({ users, agents, meId }: { users: UserRow[]; agents: { id: string; groupName: string }[]; meId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Form | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [newPw, setNewPw] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error ?? "Failed." });
      if (r.ok) { after?.(); router.refresh(); }
    });

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const { id, password, ...rest } = form;
    run(() => (id ? updateUserAction(id, rest) : createUserAction({ ...rest, password })), () => { setForm(null); setNewPw(""); });
  }

  return (
    <div className="space-y-4">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {!form && <Button onClick={() => { setMsg(null); setForm(blank); }}><Plus className="h-4 w-4" aria-hidden /> Add user</Button>}

      {form && (
        <form onSubmit={submit} className="card space-y-4 p-4 md:p-5">
          <h2 className="text-lg">{form.id ? "Edit user" : "New user"}</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Full name" htmlFor="u-name"><Input id="u-name" required value={form.name} onChange={(e) => set("name", e.target.value)} /></Field>
            <Field label="Role" htmlFor="u-role">
              <Select id="u-role" value={form.role} onChange={(e) => set("role", e.target.value as Role)} disabled={form.id === meId}>
                {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </Select>
            </Field>
            <Field label="E-mail" htmlFor="u-email"><Input id="u-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Phone" htmlFor="u-phone" hint="Nigerian numbers like 0803… are stored as +234803…"><Input id="u-phone" inputMode="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            {form.role === "AGENT" && (
              <Field label="Agent group" htmlFor="u-agent" hint="Agent users are read-only and only see this agent's pilgrims.">
                <Select id="u-agent" required value={form.agentId} onChange={(e) => set("agentId", e.target.value)}>
                  <option value="">Select…</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.groupName}</option>)}
                </Select>
              </Field>
            )}
            {!form.id && (
              <Field label="Initial password" htmlFor="u-pw" hint="At least 10 characters, with a letter and a number.">
                <Input id="u-pw" type="password" autoComplete="new-password" required value={form.password} onChange={(e) => set("password", e.target.value)} />
              </Field>
            )}
          </div>
          {form.id && (
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input type="checkbox" className="h-5 w-5" checked={form.active} disabled={form.id === meId} onChange={(e) => set("active", e.target.checked)} /> Account active
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>{form.id ? "Save changes" : "Create user"}</Button>
            <Button type="button" variant="outline" onClick={() => setForm(null)}>Cancel</Button>
          </div>
          {form.id && (
            <div className="space-y-3 border-t border-border pt-4">
              <h3 className="text-base">Account recovery</h3>
              <div className="flex flex-wrap items-end gap-2">
                <div className="w-full md:w-64"><Field label="New password" htmlFor="u-newpw"><Input id="u-newpw" type="password" autoComplete="new-password" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field></div>
                <Button type="button" variant="outline" disabled={pending || !newPw} onClick={() => run(() => resetPasswordAction(form.id!, newPw), () => setNewPw(""))}>Reset password</Button>
                <Button type="button" variant="outline" disabled={pending} onClick={() => run(() => resetTotpAction(form.id!))}>Remove 2FA</Button>
              </div>
            </div>
          )}
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted">
              <th className="px-4 py-3">Name</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Sign-in</th><th className="px-4 py-3">Status</th><th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium">{u.name}{u.agent && <div className="text-xs font-normal text-muted">{u.agent.groupName}</div>}</td>
                <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                <td className="px-4 py-3 text-muted">{u.email ?? u.phone}</td>
                <td className="px-4 py-3 space-x-1">
                  <Badge tone={u.active ? "success" : "neutral"}>{u.active ? "Active" : "Inactive"}</Badge>
                  {u.role === "SUPER_ADMIN" && (u.totpEnabled ? <Badge tone="primary"><ShieldCheck className="h-3 w-3" aria-hidden /> 2FA</Badge> : <Badge tone="warning">2FA pending</Badge>)}
                </td>
                <td className="px-4 py-3 text-right">
                  <Button size="sm" variant="outline" onClick={() => { setMsg(null); setForm({ id: u.id, name: u.name, email: u.email ?? "", phone: u.phone ?? "", role: u.role, agentId: u.agentId ?? "", active: u.active, password: "" }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
