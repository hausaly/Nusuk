import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

/**
 * Edge gate: unauthenticated → /login (via withAuth). Super Admins who have not enrolled in 2FA are
 * confined to the security page until they have. Fine-grained RBAC is enforced in the service layer.
 */
export default withAuth(
  function middleware(req) {
    const t = req.nextauth.token;
    const path = req.nextUrl.pathname;
    if (t?.role === "SUPER_ADMIN" && !t.totpEnabled && !path.startsWith("/account/security")) {
      return NextResponse.redirect(new URL("/account/security?required=1", req.url));
    }
    return NextResponse.next();
  },
  { callbacks: { authorized: ({ token }) => !!token }, pages: { signIn: "/login" } },
);

export const config = {
  // Everything except the login page, auth API, static assets and PWA files.
  matcher: ["/((?!login|api/auth|_next/static|_next/image|brand|icons|favicon|icon|apple-icon|manifest|sw\\.js).*)"],
};
