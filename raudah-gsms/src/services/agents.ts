import { prisma } from "@/lib/db";
import { auditCreate, auditDelete, auditUpdate } from "@/lib/audit";
import { assertCan } from "@/lib/rbac";
import { normalizeEmail, normalizePhone } from "@/lib/utils";
import { type Actor, ServiceError } from "./types";

export interface AgentInput {
  groupName: string;
  contactName: string;
  phone?: string | null;
  email?: string | null;
  active?: boolean;
}

const clean = (i: AgentInput) => ({
  groupName: i.groupName.trim(),
  contactName: i.contactName.trim(),
  phone: normalizePhone(i.phone),
  email: normalizeEmail(i.email),
});

function validate(d: ReturnType<typeof clean>) {
  if (!d.groupName) throw new ServiceError("Agent group name is required.");
  if (!d.contactName) throw new ServiceError("Contact name is required.");
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new ServiceError("Enter a valid e-mail address.");
}

export async function listAgents(actor: Actor) {
  assertCan(actor, "agents.manage");
  return prisma.agent.findMany({
    orderBy: { groupName: "asc" },
    include: { _count: { select: { users: true } } },
  });
}

/** Lightweight list for dropdowns (e.g. linking an AGENT user). */
export async function agentOptions(actor: Actor) {
  assertCan(actor, "users.manage");
  return prisma.agent.findMany({
    where: { active: true },
    orderBy: { groupName: "asc" },
    select: { id: true, groupName: true },
  });
}

export async function createAgent(actor: Actor, input: AgentInput) {
  assertCan(actor, "agents.manage");
  const data = clean(input);
  validate(data);
  if (await prisma.agent.findUnique({ where: { groupName: data.groupName } }))
    throw new ServiceError("An agent with that group name already exists.", "CONFLICT");
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.create({ data });
    await auditCreate({ db: tx, userId: actor.id, entity: "Agent", entityId: agent.id, record: agent });
    return agent;
  });
}

export async function updateAgent(actor: Actor, id: string, input: AgentInput) {
  assertCan(actor, "agents.manage");
  const data = { ...clean(input), active: input.active ?? true };
  validate(data);
  return prisma.$transaction(async (tx) => {
    const before = await tx.agent.findUnique({ where: { id } });
    if (!before) throw new ServiceError("Agent not found.", "NOT_FOUND");
    const dup = await tx.agent.findFirst({ where: { groupName: data.groupName, NOT: { id } } });
    if (dup) throw new ServiceError("An agent with that group name already exists.", "CONFLICT");
    const after = await tx.agent.update({ where: { id }, data });
    await auditUpdate({ db: tx, userId: actor.id, entity: "Agent", entityId: id, before, after });
    return after;
  });
}

/** Deletes an agent only if no user is linked; otherwise ask the admin to deactivate instead. */
export async function deleteAgent(actor: Actor, id: string) {
  assertCan(actor, "agents.manage");
  return prisma.$transaction(async (tx) => {
    const agent = await tx.agent.findUnique({ where: { id }, include: { _count: { select: { users: true } } } });
    if (!agent) throw new ServiceError("Agent not found.", "NOT_FOUND");
    if (agent._count.users > 0)
      throw new ServiceError("This agent has user accounts linked to it. Deactivate it instead of deleting.", "CONFLICT");
    const { _count, ...record } = agent;
    void _count;
    await tx.agent.delete({ where: { id } });
    await auditDelete({ db: tx, userId: actor.id, entity: "Agent", entityId: id, record });
  });
}
