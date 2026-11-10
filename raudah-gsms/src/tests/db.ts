import { execSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { Role } from "@prisma/client";

let migrated = false;
/** Applies migrations to the test database once per test file. */
export function ensureMigrated() {
  if (migrated) return;
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "pipe" });
  migrated = true;
}

export async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
  await prisma.agent.deleteMany();
}

export async function makeUser(role: Role, over: { email?: string; agentId?: string | null; active?: boolean } = {}) {
  return prisma.user.create({
    data: {
      name: `${role} user`,
      email: over.email ?? `${role.toLowerCase()}-${Math.random().toString(36).slice(2, 8)}@t.test`,
      passwordHash: await hashPassword("Password123"),
      role,
      agentId: over.agentId ?? null,
      active: over.active ?? true,
    },
  });
}
