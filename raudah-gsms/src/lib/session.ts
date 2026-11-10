import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { assertCan, type Capability, UnauthorizedError } from "@/lib/rbac";

export interface CurrentUser {
  id: string; name: string; email: string | null; phone: string | null; role: Role;
  agentId: string | null; totpEnabled: boolean;
}

/**
 * Loads the signed-in user FRESH from the database (role/active can change after the JWT was issued).
 * Returns null when signed out or the account has been deactivated.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, email: true, phone: true, role: true, agentId: true, totpEnabled: true, active: true },
  });
  if (!u || !u.active) return null;
  const { active: _a, ...rest } = u;
  void _a;
  return rest;
}

/** For server actions / route handlers: throws instead of redirecting. */
export async function requireActor(cap?: Capability): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new UnauthorizedError();
  if (cap) assertCan(u, cap);
  return u;
}

/** For pages/layouts: redirects to /login when signed out. */
export async function requirePageUser(cap?: Capability): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  if (cap) {
    try { assertCan(u, cap); } catch { redirect("/forbidden"); }
  }
  return u;
}
