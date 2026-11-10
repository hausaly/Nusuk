import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getGroupContext } from "@/lib/group-context";
import { buildReport, REPORTS, type ReportKey } from "@/services/reports";
import { reportPdf, reportXlsx } from "@/lib/report-render";
import { ForbiddenError } from "@/lib/rbac";
import { ServiceError } from "@/services/types";
import { auditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { key: string } }) {
  const user = await getCurrentUser();
  if (!user) return new NextResponse("Unauthorized", { status: 401 });
  if (!(params.key in REPORTS)) return new NextResponse("Unknown report", { status: 404 });
  const u = new URL(req.url);
  const fmt = u.searchParams.get("format") === "xlsx" ? "xlsx" : "pdf";
  try {
    const { current } = await getGroupContext(user);
    if (!current) return new NextResponse("No group", { status: 400 });
    const data = await buildReport(user, params.key as ReportKey, current.id, u.searchParams.get("id") ?? undefined);
    await auditEvent({ db: prisma, userId: user.id, entity: "Report", entityId: current.id, action: "EXPORT", note: `${params.key}.${fmt}` });
    const buf = fmt === "pdf" ? await reportPdf(data) : await reportXlsx(data);
    return new NextResponse(new Uint8Array(buf), { headers: {
      "Content-Type": fmt === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `${fmt === "pdf" ? "inline" : "attachment"}; filename="${params.key}-${current.code}.${fmt}"`, "Cache-Control": "private, no-store" } });
  } catch (e) {
    if (e instanceof ForbiddenError) return new NextResponse(e.message, { status: 403 });
    if (e instanceof ServiceError) return new NextResponse(e.message, { status: 400 });
    console.error(e); return new NextResponse("Failed", { status: 500 });
  }
}
