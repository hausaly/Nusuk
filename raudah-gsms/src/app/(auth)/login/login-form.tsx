"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";

const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: "That e-mail/phone and password don't match. Please try again.",
  TOTP_INVALID: "That authenticator code is not valid. Please try again.",
  TOO_MANY_ATTEMPTS: "Too many failed attempts. Please wait 15 minutes and try again.",
};

export function LoginForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [needTotp, setNeedTotp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await signIn("credentials", { identifier, password, totp, redirect: false });
    setBusy(false);
    if (res?.ok) { router.replace("/"); router.refresh(); return; }
    if (res?.error === "TOTP_REQUIRED") { setNeedTotp(true); return; }
    if (res?.error === "TOTP_INVALID") setTotp("");
    setError(MESSAGES[res?.error ?? ""] ?? "Could not sign in. Please try again.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="E-mail or phone" htmlFor="identifier">
        <Input id="identifier" name="identifier" autoComplete="username" inputMode="email" required autoFocus
          value={identifier} onChange={(e) => setIdentifier(e.target.value)} disabled={needTotp} />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input id="password" name="password" type="password" autoComplete="current-password" required
          value={password} onChange={(e) => setPassword(e.target.value)} disabled={needTotp} />
      </Field>
      {needTotp && (
        <Field label="Authenticator code" htmlFor="totp" hint="Open your authenticator app and enter the 6-digit code.">
          <Input id="totp" name="totp" inputMode="numeric" autoComplete="one-time-code" maxLength={7} required autoFocus
            value={totp} onChange={(e) => setTotp(e.target.value)} />
        </Field>
      )}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        {needTotp ? "Verify and sign in" : "Sign in"}
      </Button>
      {needTotp && (
        <Button type="button" variant="ghost" className="w-full" onClick={() => { setNeedTotp(false); setTotp(""); setError(null); }}>
          Use a different account
        </Button>
      )}
    </form>
  );
}
