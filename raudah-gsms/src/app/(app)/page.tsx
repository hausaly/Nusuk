import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { can, ROLE_LABELS } from "@/lib/rbac";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Home() {
  const user = await requirePageUser();
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-2xl text-primary">Welcome, {user.name.split(" ")[0]}</h1>
        <p className="mt-1 text-sm text-muted">Signed in as <Badge tone="primary">{ROLE_LABELS[user.role]}</Badge></p>
      </div>
      <div className="card p-5">
        <h2 className="text-lg">Group dashboard</h2>
        <p className="mt-1 text-sm text-muted">
          Clearance status, arrivals, hotels and trips will appear here once groups and pilgrims are set up
          (Phases 2–6).
        </p>
      </div>
      {user.role === "AGENT" && <Alert tone="info">Your account is read-only. You will see your own pilgrims here once your group is loaded.</Alert>}
      {can(user.role, "users.manage") && (
        <Alert tone="info">Start by adding staff in <b>Users</b> and agent companies in <b>Agents</b>.</Alert>
      )}
    </div>
  );
}
