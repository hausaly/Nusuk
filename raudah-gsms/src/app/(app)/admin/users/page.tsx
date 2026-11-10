import type { Metadata } from "next";
import { requirePageUser } from "@/lib/session";
import { agentOptions } from "@/services/agents";
import { listUsers } from "@/services/users";
import { UsersManager } from "./users-manager";

export const metadata: Metadata = { title: "Users" };

export default async function UsersPage() {
  const actor = await requirePageUser("users.manage");
  const [users, agents] = await Promise.all([listUsers(actor), agentOptions(actor)]);
  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-4 text-2xl text-primary">Users &amp; roles</h1>
      <UsersManager
        meId={actor.id}
        agents={agents}
        users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString() }))}
      />
    </div>
  );
}
