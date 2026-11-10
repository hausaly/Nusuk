import { execSync } from "node:child_process";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/password";
import type { Gender, Role } from "@prisma/client";
import { CHECK_TYPES } from "@/services/clearance";

let migrated = false;
/** Applies migrations to the test database once per test file. */
export function ensureMigrated() {
  if (migrated) return;
  execSync("npx prisma migrate deploy", { env: { ...process.env }, stdio: "pipe" });
  migrated = true;
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE "User","Agent","AuditLog","Group","GroupAgent","Pilgrim","ClearanceCheck","Document","Ticket","Visa","Hotel","Room","RoomAssignment","RoomChangeLog","TransportCompany","Trip","TripBus","TripPassenger","ZiyarahItem","Handover","Notification","ReminderRule","ReminderLog" RESTART IDENTITY CASCADE`);
}

let n = 0;
export async function makeUser(role: Role, over: { email?: string; agentId?: string | null; active?: boolean; phone?: string } = {}) {
  return prisma.user.create({
    data: {
      name: `${role} user`, email: over.email ?? `${role.toLowerCase()}-${++n}@t.test`, phone: over.phone,
      passwordHash: await hashPassword("Password123"), role, agentId: over.agentId ?? null, active: over.active ?? true,
    },
  });
}
export const actorOf = (u: { id: string; role: Role; agentId?: string | null }) => ({ id: u.id, role: u.role, agentId: u.agentId });

export async function makeAgent(name = "Agent " + ++n) {
  return prisma.agent.create({ data: { groupName: name, contactName: "Contact" } });
}

export async function makeGroup(over: Partial<{ code: string; start: string; status: "PLANNING" | "ACTIVE" | "ARCHIVED" }> = {}) {
  return prisma.group.create({ data: { code: over.code ?? `UMR-2026-${String(++n).padStart(3, "0")}`, name: "Test group", startDate: new Date(over.start ?? "2026-12-01T00:00:00Z"), endDate: new Date("2026-12-12T00:00:00Z"), arrivalAirport: "JED", departureAirport: "MED", status: over.status ?? "ACTIVE" } });
}

/** `pending` lists checks left PENDING; all others are CLEARED. */
export async function makePilgrim(groupId: string, agentId: string, over: { name?: string; passportNo?: string; gender?: Gender; pending?: string[]; familyLinkId?: string; expiry?: string } = {}) {
  const pending = over.pending ?? [];
  const k = ++n;
  return prisma.pilgrim.create({
    data: {
      groupId, agentId, fullName: over.name ?? `PILGRIM ${k}`, passportNo: over.passportNo ?? `P${String(k).padStart(8, "0")}`, passportExpiry: new Date(over.expiry ?? "2030-01-01T00:00:00Z"), dateOfBirth: new Date("1980-01-01T00:00:00Z"),
      gender: over.gender ?? "M", phoneNigeria: "+2348030000000", emergencyContactName: "Kin", emergencyContactPhone: "+2348030000001", familyLinkId: over.familyLinkId,
      checks: { create: CHECK_TYPES.map((type) => ({ type, status: pending.includes(type) ? ("PENDING" as const) : ("CLEARED" as const) })) },
    },
  });
}
