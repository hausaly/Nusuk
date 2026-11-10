import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getFile, verifySignature } from "@/lib/storage";
import { can } from "@/lib/rbac";

/** Streams a stored PDF. Requires a signed-in STAFF session AND a valid, unexpired signature. */
export async function GET(req: Request, { params }: { params: { key: string[] } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!can(user.role, "pilgrims.read")) return new NextResponse("Forbidden", { status: 403 });
  const key = params.key.join("/");
  const u = new URL(req.url);
  if (!verifySignature(key, Number(u.searchParams.get("exp")), u.searchParams.get("sig") ?? "")) return new NextResponse("Link expired or invalid", { status: 403 });
  try {
    const data = await getFile(key);
    return new NextResponse(new Uint8Array(data), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline", "Cache-Control": "private, no-store" } });
  } catch { return new NextResponse("Not found", { status: 404 }); }
}
