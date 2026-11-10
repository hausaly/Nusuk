import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { SecurityPanel } from "./security-panel";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: { required?: string } }) {
  const user = await requirePageUser();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-4 text-2xl text-primary">Security &amp; password</h1>
      <SecurityPanel
        totpEnabled={user.totpEnabled}
        totpRequired={user.role === "SUPER_ADMIN"}
        showRequiredNotice={searchParams.required === "1" && !user.totpEnabled}
      />
    </div>
  );
}
