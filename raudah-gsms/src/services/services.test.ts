import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { ForbiddenError } from "@/lib/rbac";
import { makeUser, ensureMigrated, resetDb } from "@/tests/db";
import { createAgent, deleteAgent, listAgents, updateAgent } from "./agents";
import { beginTotpEnrollment, confirmTotpEnrollment, createUser, listUsers, resetPassword, updateUser } from "./users";
import { ServiceError } from "./types";
import { authenticator } from "otplib";
import { decryptSecret } from "@/lib/crypto";

beforeAll(ensureMigrated);
beforeEach(resetDb);

const actorOf = (u: { id: string; role: any; agentId?: string | null }) => ({ id: u.id, role: u.role, agentId: u.agentId });

describe("authorisation is enforced in the service layer", () => {
  it("non-admins cannot manage users or agents (403)", async () => {
    for (const role of ["VISA_OFFICER", "TICKET_OFFICER", "FINANCE_STAFF", "OPERATIONS_STAFF", "AGENT"] as const) {
      const a = actorOf(await makeUser(role, { email: `${role}@x.test` }));
      await expect(listUsers(a)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createUser(a, { name: "x", email: "n@x.test", role: "VISA_OFFICER", password: "Password123" })).rejects.toBeInstanceOf(ForbiddenError);
      await expect(listAgents(a)).rejects.toBeInstanceOf(ForbiddenError);
      await expect(createAgent(a, { groupName: "G", contactName: "C" })).rejects.toBeInstanceOf(ForbiddenError);
    }
    expect(await prisma.user.count()).toBe(5);
  });
});

describe("users", () => {
  it("creates a user, hashes the password and writes an audit entry without secrets", async () => {
    const admin = await makeUser("SUPER_ADMIN");
    const u = await createUser(actorOf(admin), { name: "Vera", email: "Vera@X.test ", role: "VISA_OFFICER", password: "Password123" });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: u.id } });
    expect(row.email).toBe("vera@x.test");
    expect(row.passwordHash).not.toContain("Password123");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entity: "User", entityId: u.id, action: "CREATE" } });
    expect(log.userId).toBe(admin.id);
    expect(log.newValue).not.toContain(row.passwordHash);
  });

  it("AGENT users must link to an agent; other roles never keep an agent link", async () => {
    const admin = actorOf(await makeUser("SUPER_ADMIN"));
    await expect(createUser(admin, { name: "A", email: "a@x.test", role: "AGENT", password: "Password123" })).rejects.toBeInstanceOf(ServiceError);
    const agent = await createAgent(admin, { groupName: "Alpha", contactName: "Al" });
    const au = await createUser(admin, { name: "A", email: "a@x.test", role: "AGENT", agentId: agent.id, password: "Password123" });
    expect(au.agentId).toBe(agent.id);
    const ou = await createUser(admin, { name: "O", email: "o@x.test", role: "OPERATIONS_STAFF", agentId: agent.id, password: "Password123" });
    expect(ou.agentId).toBeNull();
  });

  it("rejects weak passwords and duplicate e-mail/phone", async () => {
    const admin = actorOf(await makeUser("SUPER_ADMIN"));
    await expect(createUser(admin, { name: "W", email: "w@x.test", role: "VISA_OFFICER", password: "weak" })).rejects.toThrow(/10 characters/);
    await createUser(admin, { name: "D", email: "d@x.test", phone: "08030000009", role: "VISA_OFFICER", password: "Password123" });
    await expect(createUser(admin, { name: "D2", email: "D@x.test", role: "VISA_OFFICER", password: "Password123" })).rejects.toThrow(/already exists/);
    await expect(createUser(admin, { name: "D3", phone: "+2348030000009", role: "VISA_OFFICER", password: "Password123" })).rejects.toThrow(/already exists/);
  });

  it("every edit is audited with old and new values", async () => {
    const admin = await makeUser("SUPER_ADMIN");
    const target = await makeUser("VISA_OFFICER", { email: "t@x.test" });
    await updateUser(actorOf(admin), target.id, { name: "Renamed", email: "t@x.test", role: "FINANCE_STAFF", active: false });
    const rows = await prisma.auditLog.findMany({ where: { entity: "User", entityId: target.id, action: "UPDATE" } });
    const by = Object.fromEntries(rows.map((r) => [r.field, r]));
    expect(by.name).toMatchObject({ oldValue: "VISA_OFFICER user", newValue: "Renamed", userId: admin.id });
    expect(by.role).toMatchObject({ oldValue: "VISA_OFFICER", newValue: "FINANCE_STAFF" });
    expect(by.active).toMatchObject({ oldValue: "true", newValue: "false" });
    expect(by.email).toBeUndefined(); // unchanged → no row
  });

  it("password reset is audited but the hash is redacted", async () => {
    const admin = await makeUser("SUPER_ADMIN");
    const t = await makeUser("VISA_OFFICER");
    await resetPassword(actorOf(admin), t.id, "NewPassw0rd!!");
    const log = await prisma.auditLog.findFirstOrThrow({ where: { entityId: t.id, field: "passwordHash" } });
    expect(log.oldValue).toBe("[redacted]");
    expect(log.newValue).toBe("[redacted]");
  });

  it("protects against self-lockout and removing the last Super Admin", async () => {
    const admin = await makeUser("SUPER_ADMIN", { email: "a1@x.test" });
    await expect(updateUser(actorOf(admin), admin.id, { name: "Me", email: "a1@x.test", role: "VISA_OFFICER" })).rejects.toThrow(/own role/);
    const other = await makeUser("SUPER_ADMIN", { email: "a2@x.test" });
    await updateUser(actorOf(admin), other.id, { name: "O", email: "a2@x.test", role: "SUPER_ADMIN", active: false }); // ok: admin remains
    const last = await makeUser("SUPER_ADMIN", { email: "a3@x.test" });
    await prisma.user.update({ where: { id: admin.id }, data: { active: false } });
    await expect(updateUser(actorOf(admin), last.id, { name: "L", email: "a3@x.test", role: "VISA_OFFICER" })).rejects.toThrow(/at least one active Super Admin/);
  });
});

describe("two-factor enrolment", () => {
  it("stores the secret encrypted, enables only after a valid code", async () => {
    const sa = await makeUser("SUPER_ADMIN");
    const { secret } = await beginTotpEnrollment(actorOf(sa));
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: sa.id } });
    expect(stored.totpEnabled).toBe(false);
    expect(stored.totpSecretEnc).not.toContain(secret);
    expect(decryptSecret(stored.totpSecretEnc!)).toBe(secret);
    await expect(confirmTotpEnrollment(actorOf(sa), "000000")).rejects.toBeInstanceOf(ServiceError);
    await confirmTotpEnrollment(actorOf(sa), authenticator.generate(secret));
    expect((await prisma.user.findUniqueOrThrow({ where: { id: sa.id } })).totpEnabled).toBe(true);
    expect(await prisma.auditLog.count({ where: { action: "2FA_ENABLED", entityId: sa.id } })).toBe(1);
  });
});

describe("agents", () => {
  it("CRUD is audited; delete is blocked while users are linked", async () => {
    const admin = actorOf(await makeUser("SUPER_ADMIN"));
    const ag = await createAgent(admin, { groupName: "Beta", contactName: "Bo", phone: "08031112222" });
    expect(ag.phone).toBe("+2348031112222");
    await updateAgent(admin, ag.id, { groupName: "Beta", contactName: "Bob" });
    expect(await prisma.auditLog.findFirst({ where: { entity: "Agent", field: "contactName", oldValue: "Bo", newValue: "Bob" } })).not.toBeNull();
    await createUser(admin, { name: "AU", email: "au@x.test", role: "AGENT", agentId: ag.id, password: "Password123" });
    await expect(deleteAgent(admin, ag.id)).rejects.toThrow(/Deactivate/);
    await prisma.user.deleteMany({ where: { agentId: ag.id } });
    await deleteAgent(admin, ag.id);
    expect(await prisma.auditLog.count({ where: { entity: "Agent", action: "DELETE" } })).toBe(1);
  });
});
