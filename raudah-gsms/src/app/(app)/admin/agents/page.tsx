import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { listAgents } from "@/services/agents";
import { AgentsManager } from "./agents-manager";

export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  const actor = await requirePageUser("agents.manage");
  const agents = await listAgents(actor);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl text-primary">Agents</h1>
      <AgentsManager agents={agents.map((a) => ({ id: a.id, groupName: a.groupName, contactName: a.contactName, phone: a.phone, email: a.email, active: a.active, users: a._count.users }))} />
    </div>
  );
}
