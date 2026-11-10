import type { Metadata } from "next";
import Link from "next/link";
import { ShieldAlert } from "lucide-react";

export const metadata: Metadata = { title: "No access" };

export default function Forbidden() {
  return (
    <div className="card mx-auto mt-10 max-w-md p-8 text-center">
      <ShieldAlert className="mx-auto h-10 w-10 text-warning" aria-hidden />
      <h1 className="mt-3 text-xl">You don&apos;t have access to this page</h1>
      <p className="mt-1 text-sm text-muted">Ask a Super Admin if you think you should.</p>
      <Link href="/" className="mt-4 inline-block text-sm font-medium text-primary underline">Back to dashboard</Link>
    </div>
  );
}
