import { prisma } from "@/lib/db";
import { clearanceOf } from "./clearance";
import { pilgrimScope } from "./scope";
import type { Actor } from "./types";

/** Global search: name, passport no, visa no, PNR, phone. Row-level scope applies (agents: own pilgrims only). */
export async function searchPilgrims(actor: Actor, q: string) {
  const s = q.trim();
  if (s.length < 2) return [];
  const rows = await prisma.pilgrim.findMany({
    where: { AND: [pilgrimScope(actor), { OR: [
      { fullName: { contains: s, mode: "insensitive" } }, { passportNo: { contains: s.toUpperCase() } }, { phoneNigeria: { contains: s } }, { phoneKsa: { contains: s } },
      { visa: { visaNo: { contains: s.toUpperCase() } } }, { ticket: { pnr: { contains: s.toUpperCase() } } }, { ticket: { ticketNo: { contains: s } } },
    ] }] },
    take: 30, orderBy: { fullName: "asc" }, include: { checks: true, group: { select: { code: true } }, agent: { select: { groupName: true } } },
  });
  return rows.map((p) => ({ ...p, clearance: clearanceOf(p.checks) }));
}
