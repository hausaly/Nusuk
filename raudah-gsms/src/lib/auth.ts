import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { auditEvent } from "@/lib/audit";
import { decryptSecret } from "@/lib/crypto";
import { dummyHash, verifyPassword } from "@/lib/password";
import { LOGIN_MAX, LOGIN_WINDOW_MS, loginLimiters } from "@/lib/rate-limit";
import { verifyTotp } from "@/lib/totp";
import { parseIdentifier } from "@/lib/utils";

/** Error codes surfaced to the login form (NextAuth returns them as `result.error`). */
export const AUTH_ERRORS = {
  INVALID: "INVALID_CREDENTIALS",
  TOTP_REQUIRED: "TOTP_REQUIRED",
  TOTP_INVALID: "TOTP_INVALID",
  RATE_LIMITED: "TOO_MANY_ATTEMPTS",
} as const;

const clientIp = (headers: Record<string, unknown> | undefined) => {
  const xf = headers?.["x-forwarded-for"];
  const v = Array.isArray(xf) ? xf[0] : (xf as string | undefined);
  return v?.split(",")[0]?.trim() || "unknown";
};

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 12 * 60 * 60 },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        identifier: { label: "Email or phone", type: "text" },
        password: { label: "Password", type: "password" },
        totp: { label: "Authenticator code", type: "text" },
      },
      async authorize(creds, req) {
        const identifier = (creds?.identifier ?? "").trim();
        const password = creds?.password ?? "";
        const totp = (creds?.totp ?? "").trim();
        if (!identifier || !password) throw new Error(AUTH_ERRORS.INVALID);

        const ip = clientIp(req?.headers as Record<string, unknown> | undefined);
        const { account, ip: ipLimiter } = loginLimiters();
        const key = `${identifier.toLowerCase()}|${ip}`;
        if (account.blocked(key) || ipLimiter.blocked(ip)) throw new Error(AUTH_ERRORS.RATE_LIMITED);

        const fail = async (userId: string | null, why: string, code: string = AUTH_ERRORS.INVALID): Promise<never> => {
          account.hit(key);
          ipLimiter.hit(ip);
          if (userId) {
            const u = await prisma.user.update({ where: { id: userId }, data: { failedLogins: { increment: 1 } } });
            if (u.failedLogins >= LOGIN_MAX())
              await prisma.user.update({ where: { id: userId }, data: { lockedUntil: new Date(Date.now() + LOGIN_WINDOW_MS()) } });
          }
          await auditEvent({ db: prisma, userId, entity: "User", entityId: userId ?? "unknown", action: "LOGIN_FAILED", note: why });
          throw new Error(code);
        };

        const where = parseIdentifier(identifier);
        const user = where.email || where.phone
          ? await prisma.user.findFirst({ where: where.email ? { email: where.email } : { phone: where.phone } })
          : null;

        if (!user) {
          await verifyPassword(password, await dummyHash()); // equalise timing
          return fail(null, "unknown account");
        }
        if (user.lockedUntil && user.lockedUntil > new Date()) throw new Error(AUTH_ERRORS.RATE_LIMITED);
        const ok = await verifyPassword(password, user.passwordHash);
        if (!ok) return fail(user.id, "bad password");
        if (!user.active) return fail(user.id, "inactive account");

        if (user.role === "SUPER_ADMIN" && user.totpEnabled && user.totpSecretEnc) {
          if (!totp) throw new Error(AUTH_ERRORS.TOTP_REQUIRED); // password was right; ask for the code
          if (!verifyTotp(totp, decryptSecret(user.totpSecretEnc))) return fail(user.id, "bad 2FA code", AUTH_ERRORS.TOTP_INVALID);
        }

        account.reset(key);
        await prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
        await auditEvent({ db: prisma, userId: user.id, entity: "User", entityId: user.id, action: "LOGIN" });
        return { id: user.id, name: user.name, email: user.email ?? undefined };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user || trigger === "update" || !token.role) {
        const id = (user?.id ?? token.sub) as string;
        const u = await prisma.user.findUnique({ where: { id } });
        if (u) {
          token.uid = u.id;
          token.role = u.role;
          token.agentId = u.agentId;
          token.totpEnabled = u.totpEnabled;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.role = token.role as Role;
        session.user.agentId = (token.agentId as string | null) ?? null;
        session.user.totpEnabled = Boolean(token.totpEnabled);
      }
      return session;
    },
  },
};
