import type { Prisma } from "@prisma/client";
import { can, ForbiddenError } from "@/lib/rbac";
import type { Actor } from "./types";

/** Row-level filter: AGENT users only ever see pilgrims of their own agent. Staff see the whole group. */
export function pilgrimScope(actor: Actor, groupId?: string): Prisma.PilgrimWhereInput {
  if (!can(actor.role, "pilgrims.read") && !can(actor.role, "pilgrims.read.own")) throw new ForbiddenError();
  return {
    ...(groupId ? { groupId } : {}),
    ...(actor.role === "AGENT" ? { agentId: actor.agentId ?? "__none__" } : {}),
  };
}
