"use client";
import { useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input } from "@/components/ui/input";
import { PASSWORD_RULE } from "@/lib/password-policy";
import { beginTotpAction, changePasswordAction, confirmTotpAction } from "./actions";

type Msg = { tone: "error" | "success"; text: string } | null;

export function SecurityPanel({ totpEnabled, totpRequired, showRequiredNotice }: { totpEnabled: boolean; totpRequired: boolean; showRequiredNotice: boolean }) {
  const { update } = useSession();
  const [pending, start] = useTransition();
  const [qr, setQr] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [totpMsg, setTotpMsg] = useState<Msg>(null);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [pwMsg, setPwMsg] = useState<Msg>(null);

  return (
    <div className="space-y-5">
      {showRequiredNotice && <Alert tone="warning">Super Admin accounts must use two-factor authentication. Set it up below to continue.</Alert>}

      <section className="card space-y-3 p-5">
        <h2 className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" aria-hidden /> Two-factor authentication</h2>
        {totpEnabled ? (
          <Alert tone="success">Two-factor authentication is on.</Alert>
        ) : (
          <>
            <p className="text-sm text-muted">{totpRequired ? "Required for your role. " : "Optional for your role. "}Use an authenticator app such as Google Authenticator, Microsoft Authenticator or Authy.</p>
            {totpMsg && <Alert tone={totpMsg.tone}>{totpMsg.text}</Alert>}
            {!qr ? (
              <Button disabled={pending} onClick={() => start(async () => {
                const r = await beginTotpAction();
                if (r.ok && "data" in r) { setQr(r.data); setTotpMsg(null); } else if (!r.ok) setTotpMsg({ tone: "error", text: r.error });
              })}>Set up authenticator</Button>
            ) : (
              <form className="space-y-3" onSubmit={(e) => {
                e.preventDefault();
                start(async () => {
                  const r = await confirmTotpAction(code);
                  if (r.ok) {
                    await update(); // refresh the JWT so the middleware sees totpEnabled
                    window.location.assign("/"); // hard navigation: skips the router cache that holds the pre-2FA redirect
                  }
                  else setTotpMsg({ tone: "error", text: r.error });
                });
              }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qr.qr} alt="QR code to add Raudah GSMS to your authenticator app" width={220} height={220} className="rounded-xl border border-border bg-white" />
                <p className="text-xs text-muted">Can&apos;t scan? Enter this key manually: <code className="break-all font-mono text-foreground">{qr.secret}</code></p>
                <Field label="6-digit code from the app" htmlFor="totp-code"><Input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required value={code} onChange={(e) => setCode(e.target.value)} /></Field>
                <Button type="submit" disabled={pending}>Turn on two-factor authentication</Button>
              </form>
            )}
          </>
        )}
      </section>

      <section className="card space-y-3 p-5">
        <h2 className="text-lg">Change password</h2>
        {pwMsg && <Alert tone={pwMsg.tone}>{pwMsg.text}</Alert>}
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await changePasswordAction(cur, next);
            setPwMsg(r.ok ? { tone: "success", text: r.message ?? "Password changed." } : { tone: "error", text: r.error });
            if (r.ok) { setCur(""); setNext(""); }
          });
        }}>
          <Field label="Current password" htmlFor="pw-cur"><Input id="pw-cur" type="password" autoComplete="current-password" required value={cur} onChange={(e) => setCur(e.target.value)} /></Field>
          <Field label="New password" htmlFor="pw-new" hint={PASSWORD_RULE}><Input id="pw-new" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} /></Field>
          <Button type="submit" variant="outline" disabled={pending}>Change password</Button>
        </form>
      </section>
    </div>
  );
}
