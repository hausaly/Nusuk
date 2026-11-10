"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";

type Result = { ok: boolean; error?: string; message?: string };
type Action = (fd: FormData) => Promise<Result>;

/** <form> wrapper for server actions: shows success/error, refreshes data, optionally resets. */
export function AF({ action, children, submit = "Save", className, reset = true, confirm, variant, hideSubmit }: {
  action: Action; children?: React.ReactNode; submit?: string; className?: string; reset?: boolean; confirm?: string; variant?: ButtonProps["variant"]; hideSubmit?: boolean;
}) {
  const router = useRouter();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  return (
    <form ref={ref} className={className} onSubmit={(e) => {
      e.preventDefault();
      if (confirm && !window.confirm(confirm)) return;
      const fd = new FormData(e.currentTarget);
      start(async () => {
        const r = await action(fd);
        setMsg(r.ok ? { tone: "success", text: r.message ?? "Saved." } : { tone: "error", text: r.error ?? "Failed." });
        if (r.ok) { if (reset) ref.current?.reset(); router.refresh(); }
      });
    }}>
      {msg && <Alert tone={msg.tone} className="mb-3">{msg.text}</Alert>}
      {children}
      {!hideSubmit && <Button type="submit" variant={variant} disabled={pending} className="mt-3">{pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{submit}</Button>}
    </form>
  );
}

/** One-click action button (no inputs). */
export function AB({ action, children, confirm, variant = "outline", size = "sm", className }: {
  action: () => Promise<Result>; children: React.ReactNode; confirm?: string; variant?: ButtonProps["variant"]; size?: ButtonProps["size"]; className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col">
      <Button type="button" variant={variant} size={size} className={className} disabled={pending} onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        start(async () => { const r = await action(); setErr(r.ok ? null : r.error ?? "Failed."); setOk(r.ok ? r.message ?? "Done." : null); router.refresh(); });
      }}>{pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}{children}</Button>
      {err && <span role="alert" className="mt-1 max-w-xs text-xs text-danger">{err}</span>}
      {ok && <span role="status" className="mt-1 max-w-xs text-xs text-success">{ok}</span>}
    </span>
  );
}
