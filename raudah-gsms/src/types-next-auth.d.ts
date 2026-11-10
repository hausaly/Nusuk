import type { Role } from "@prisma/client";
import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: { id: string; name?: string | null; email?: string | null; role: Role; agentId: string | null; totpEnabled: boolean };
  }
}
declare module "next-auth/jwt" {
  interface JWT { uid?: string; role?: Role; agentId?: string | null; totpEnabled?: boolean }
}
