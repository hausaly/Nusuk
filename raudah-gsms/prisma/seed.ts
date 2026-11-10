/* Phase 1 seed: one SUPER_ADMIN, one user per role, 3 agents. Later phases extend this
   (group with 150 pilgrims, hotels, flights, trips, sample PDFs). Safe to re-run. */
import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const password = process.env.SEED_DEFAULT_PASSWORD ?? "Raudah#2026";
const adminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "admin@raudah.test";

async function main() {
  if (process.env.NODE_ENV === "production" && !process.env.SEED_DEFAULT_PASSWORD)
    throw new Error("Refusing to seed production with the default password. Set SEED_DEFAULT_PASSWORD.");
  const passwordHash = await bcrypt.hash(password, 12);

  const agents = await Promise.all(
    [
      { groupName: "Al-Huda Travels", contactName: "Musa Abdullahi", phone: "+2348030000001", email: "alhuda@agents.raudah.test" },
      { groupName: "Zamzam Hajj & Umrah Services", contactName: "Fatima Bello", phone: "+2348030000002", email: "zamzam@agents.raudah.test" },
      { groupName: "Safa Marwa Tours", contactName: "Ibrahim Yusuf", phone: "+2348030000003", email: "safamarwa@agents.raudah.test" },
    ].map((a) => prisma.agent.upsert({ where: { groupName: a.groupName }, update: {}, create: a })),
  );

  const staff: { name: string; email: string; role: Role; agentId?: string }[] = [
    { name: "Super Admin", email: adminEmail, role: "SUPER_ADMIN" },
    { name: "Visa Officer", email: "visa@raudah.test", role: "VISA_OFFICER" },
    { name: "Ticket Officer", email: "ticket@raudah.test", role: "TICKET_OFFICER" },
    { name: "Finance Staff", email: "finance@raudah.test", role: "FINANCE_STAFF" },
    { name: "Operations Staff", email: "ops@raudah.test", role: "OPERATIONS_STAFF" },
    { name: "Al-Huda Agent", email: "agent@raudah.test", role: "AGENT", agentId: agents[0].id },
  ];
  for (const u of staff)
    await prisma.user.upsert({ where: { email: u.email }, update: {}, create: { ...u, passwordHash } });

  console.log(`Seeded ${staff.length} users and ${agents.length} agents. Password for all: ${password}`);
}

main().finally(() => prisma.$disconnect());
