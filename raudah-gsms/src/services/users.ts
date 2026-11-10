import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditCreate, auditEvent, auditUpdate, type Db } from "@/lib/audit";
import { assertCan, ROLES } from "@/lib/rbac";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/password";
import { generateTotpSecret, totpQrDataUrl, totpUri, verifyTotp } from "@/lib/totp";
import { normalizeEmail, normalizePhone } from "@/lib/utils";
import { type Actor, ServiceError } from "./types";

/** Columns that are safe to send to the UI (never the hash / TOTP secret). */
export const userSelect = {
  id: true, name: true, email: true, phone: true, role: true, agentId: true, active: true,
  totpEnabled: true, lastLoginAt: true, createdAt: true,
  agent: { select: { id: true, groupName: true } },
} as const;

export interface UserInput {
  name: string;
  email?: string | null;
  phone?: string | null;
  role: Role;
  agentId?: string | null;
  active?: boolean;
}

async function cleanAndValidate(db: Db, i: UserInput, selfId?: string) {
  const d = {
    name: i.name.trim(),
    email: normalizeEmail(i.email),
    phone: normalizePhone(i.phone),
    role: i.role,
    agentId: i.agentId || null,
    active: i.active ?? true,
  };
  if (!d.name) throw new ServiceError("Name is required.");
  if (!ROLES.includes(d.role)) throw new ServiceError("Unknown role.");
  if (!d.email && !d.phone) throw new ServiceError("Provide an e-mail address or a phone number to sign in with.");
  if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) throw new ServiceError("Enter a valid e-mail address.");
  if (d.role === "AGENT") {
    if (!d.agentId) throw new ServiceError("Agent users must be linked to an Agent group.");
    if (!(await db.agent.findUnique({ where: { id: d.agentId } }))) throw new ServiceError("Linked agent not found.");
  } else d.agentId = null;

  const clash = await db.user.findFirst({
    where: { NOT: selfId ? { id: selfId } : undefined, OR: [...(d.email ? [{ email: d.email }] : []), ...(d.phone ? [{ phone: d.phone }] : [])] },
    select: { email: true },
  });
  if (clash) throw new ServiceError("A user with that e-mail or phone already exists.", "CONFLICT");
  return d;
}

export async function listUsers(actor: Actor) {
  assertCan(actor, "users.manage");
  return prisma.user.findMany({ select: userSelect, orderBy: [{ active: "desc" }, { name: "asc" }] });
}

export async function createUser(actor: Actor, input: UserInput & { password: string }) {
  assertCan(actor, "users.manage");
  const problem = passwordProblem(input.password);
  if (problem) throw new ServiceError(problem);
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const data = await cleanAndValidate(tx, input);
    const user = await tx.user.create({ data: { ...data, passwordHash }, select: undefined });
    await auditCreate({ db: tx, userId: actor.id, entity: "User", entityId: user.id, record: user });
    const { passwordHash: _h, totpSecretEnc: _t, ...safe } = user;
    void _h; void _t;
    return safe;
  });
}

async function activeSuperAdminCount(db: Db, excludingId: string) {
  return db.user.count({ where: { role: "SUPER_ADMIN", active: true, NOT: { id: excludingId } } });
}

export async function updateUser(actor: Actor, id: string, input: UserInput) {
  assertCan(actor, "users.manage");
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new ServiceError("User not found.", "NOT_FOUND");
    const data = await cleanAndValidate(tx, input, id);

    if (id === actor.id && (data.role !== before.role || !data.active))
      throw new ServiceError("You cannot change your own role or deactivate your own account.");
    const losesAdmin = before.role === "SUPER_ADMIN" && before.active && (data.role !== "SUPER_ADMIN" || !data.active);
    if (losesAdmin && (await activeSuperAdminCount(tx, id)) === 0)
      throw new ServiceError("There must be at least one active Super Admin.");

    const after = await tx.user.update({ where: { id }, data });
    await auditUpdate({ db: tx, userId: actor.id, entity: "User", entityId: id, before, after });
    return { id };
  });
}

/** Admin password reset. Also clears any lockout. */
export async function resetPassword(actor: Actor, id: string, newPassword: string) {
  assertCan(actor, "users.manage");
  const problem = passwordProblem(newPassword);
  if (problem) throw new ServiceError(problem);
  const passwordHash = await hashPassword(newPassword);
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new ServiceError("User not found.", "NOT_FOUND");
    const after = await tx.user.update({ where: { id }, data: { passwordHash, failedLogins: 0, lockedUntil: null } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "User", entityId: id, before, after });
  });
}

/** Admin: remove a user's 2FA (lost phone). The Super Admin is then forced to re-enrol on next sign-in. */
export async function resetTotp(actor: Actor, id: string) {
  assertCan(actor, "users.manage");
  return prisma.$transaction(async (tx) => {
    const before = await tx.user.findUnique({ where: { id } });
    if (!before) throw new ServiceError("User not found.", "NOT_FOUND");
    const after = await tx.user.update({ where: { id }, data: { totpSecretEnc: null, totpEnabled: false } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "User", entityId: id, before, after });
  });
}

/* ---------- self-service (any signed-in user acting on their own account) ---------- */

export async function changeOwnPassword(actor: Actor, current: string, next: string) {
  const problem = passwordProblem(next);
  if (problem) throw new ServiceError(problem);
  const me = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!me || !(await verifyPassword(current, me.passwordHash))) throw new ServiceError("Current password is incorrect.");
  const passwordHash = await hashPassword(next);
  await prisma.$transaction(async (tx) => {
    const after = await tx.user.update({ where: { id: me.id }, data: { passwordHash } });
    await auditUpdate({ db: tx, userId: actor.id, entity: "User", entityId: me.id, before: me, after });
  });
}

/** Step 1 of 2FA enrolment: store an encrypted, not-yet-enabled secret and return QR data. */
export async function beginTotpEnrollment(actor: Actor) {
  const me = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!me) throw new ServiceError("User not found.", "NOT_FOUND");
  if (me.totpEnabled) throw new ServiceError("Two-factor authentication is already enabled.");
  const secret = generateTotpSecret();
  await prisma.user.update({ where: { id: me.id }, data: { totpSecretEnc: encryptSecret(secret) } });
  const uri = totpUri(me.email ?? me.phone ?? me.name, secret);
  return { secret, uri, qr: await totpQrDataUrl(uri) };
}

/** Step 2: verify a code from the authenticator app, then enable 2FA. */
export async function confirmTotpEnrollment(actor: Actor, code: string) {
  const me = await prisma.user.findUnique({ where: { id: actor.id } });
  if (!me?.totpSecretEnc) throw new ServiceError("Start the set-up first.");
  if (me.totpEnabled) throw new ServiceError("Two-factor authentication is already enabled.");
  if (!verifyTotp(code, decryptSecret(me.totpSecretEnc))) throw new ServiceError("That code is not valid. Check the time on your phone and try again.");
  await prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: me.id }, data: { totpEnabled: true } });
    await auditEvent({ db: tx, userId: actor.id, entity: "User", entityId: me.id, action: "2FA_ENABLED" });
  });
}
