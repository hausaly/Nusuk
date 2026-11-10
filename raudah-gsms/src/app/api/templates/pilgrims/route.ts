import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { can } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { pilgrimTemplateXlsx } from "@/lib/report-render";

export const runtime = "nodejs";
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "pilgrims.write")) return new NextResponse("Forbidden", { status: 403 });
  const agents = (await prisma.agent.findMany({ where: { active: true }, select: { groupName: true } })).map((a) => a.groupName);
  const buf = await pilgrimTemplateXlsx(agents);
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": 'attachment; filename="raudah-pilgrim-import-template.xlsx"' } });
}
