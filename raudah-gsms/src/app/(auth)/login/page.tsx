import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@/components/brand/logo";
import { getCurrentUser } from "@/lib/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  return (
    <main className="swoosh-bg flex min-h-screen flex-col items-center justify-center bg-[rgb(var(--surface-2)/0.35)] px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo height={88} priority />
          <h1 className="mt-4 text-2xl text-primary">Raudah Travels &amp; Tours Ltd</h1>
          <p className="mt-1 text-sm tracking-wide text-muted">Umrah Ground Services</p>
        </div>
        <div className="card p-6 md:p-8">
          <h2 className="mb-1 text-xl">Sign in</h2>
          <p className="mb-5 text-sm text-muted">Use your e-mail or phone number and password.</p>
          <LoginForm />
        </div>
        <p className="mt-6 text-center text-xs text-muted">Raudah GSMS · Staff and agent access only</p>
      </div>
    </main>
  );
}
