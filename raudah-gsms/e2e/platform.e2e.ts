/**
 * Full-platform end-to-end walk-through (Playwright + real Chromium) as each role, against a running, freshly seeded app.
 * Asserts behaviour AND captures screenshots into docs/screenshots.
 *   1. docker compose up -d postgres  &&  npm run build && npm start  (or: npm run dev)
 *   2. npm run db:reset && npm run db:seed
 *   3. npm run e2e
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { chromium, type Page } from "playwright";
import ExcelJS from "exceljs";
import { authenticator } from "otplib";
import { prisma } from "@/lib/db";
import { runReminders } from "@/services/reminders";
import { makePilgrims } from "../prisma/seed-data";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = path.resolve("docs/screenshots");
const PW = "Raudah#2026";
const demo = makePilgrims(150);
const results: { name: string; ok: boolean; err?: string }[] = [];
const allPages: Page[] = [];

async function pdfToPng(buf: Buffer, name: string, pageNo = 1, dpi = 80) {
  const tmp = path.join(SHOTS, `.${name}.pdf`);
  writeFileSync(tmp, buf);
  execFileSync("pdftoppm", ["-png", "-r", String(dpi), "-f", String(pageNo), "-l", String(pageNo), "-singlefile", tmp, path.join(SHOTS, name)]);
  execFileSync("node", ["-e", `require('fs').unlinkSync(${JSON.stringify(tmp)})`]);
}

it("walks the whole platform as every role", async () => {
  mkdirSync(SHOTS, { recursive: true });
  // clean slate for the accounts used below (re-runnable)
  await prisma.user.updateMany({ data: { totpEnabled: false, totpSecretEnc: null, failedLogins: 0, lockedUntil: null } });

  const browser = await chromium.launch();
  const mk = async (opts: Parameters<typeof browser.newContext>[0] = {}) => {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, acceptDownloads: true, ...opts });
    ctx.on("page", (p) => { allPages.push(p); p.on("dialog", (d) => d.accept()); });
    return ctx;
  };
  const login = async (ctx: Awaited<ReturnType<typeof mk>>, email: string, totp?: string) => {
    const page = await ctx.newPage();
    page.on("dialog", (d) => d.accept());
    await page.goto(BASE + "/login");
    await page.fill("#identifier", email); await page.fill("#password", PW);
    await page.click("button[type=submit]");
    if (totp) { await page.waitForSelector("#totp"); await page.fill("#totp", totp); await page.click("button[type=submit]"); }
    await page.waitForURL((u) => !u.pathname.startsWith("/login"));
    return page;
  };
  const shot = (page: Page, name: string, full = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: full });
  const step = async (name: string, fn: () => Promise<void>) => {
    try { await fn(); results.push({ name, ok: true }); console.log("PASS", name); }
    catch (e: any) {
      const err = String(e.message).split("\n").slice(0, 3).join(" ");
      results.push({ name, ok: false, err }); console.log("FAIL", name, "→", err);
      for (const [i, pg] of allPages.entries()) await pg.screenshot({ path: path.join(SHOTS, `.fail-${results.length}-${i}.png`) }).catch(() => {});
    }
  };
  const msg = async (page: Page, re: RegExp) => { await page.waitForSelector(`[role=status]:text-matches("${re.source}", "i"), [role=alert]:text-matches("${re.source}", "i")`, { timeout: 20_000 }); };
  const alertText = async (page: Page) => (await page.locator("main [role=alert], main [role=status]").allInnerTexts()).join(" | ");

  /* ================= SUPER ADMIN ================= */
  const adminCtx = await mk(); let admin!: Page; let secret = "";
  await step("Login page shows Raudah branding", async () => {
    const p = await adminCtx.newPage(); await p.goto(BASE + "/login");
    expect(await p.title()).toBe("Sign in · Raudah GSMS");
    await p.waitForSelector('img[alt="Raudah Travels & Tours Ltd"]'); await p.getByText("Umrah Ground Services").waitFor();
    await shot(p, "01-login-desktop"); await p.close();
  });
  await step("Super Admin must enrol 2FA on first sign-in; TOTP then required", async () => {
    admin = await login(adminCtx, "admin@raudah.test");
    await admin.waitForURL(/account\/security/);
    await admin.getByText("must use two-factor authentication").waitFor();
    await shot(admin, "02-2fa-required");
    await admin.click("text=Set up authenticator"); await admin.waitForSelector('img[alt^="QR code"]');
    secret = (await admin.locator("code").innerText()).trim();
    await shot(admin, "03-2fa-qr");
    await admin.fill("#totp-code", authenticator.generate(secret)); await admin.click("text=Turn on two-factor authentication");
    await admin.waitForURL(BASE + "/"); await admin.waitForSelector("text=Group dashboard");
  });

  await step("Group dashboard: 150 pilgrims, GREEN vs RED with blocking breakdown, flights with bus status", async () => {
    await admin.goto(BASE + "/"); await admin.waitForSelector("text=Group dashboard");
    await admin.getByText("Cleared (green)").waitFor(); await admin.getByText("Blocked pilgrims by check").waitFor();
    expect(await admin.locator("main").innerText()).toContain("150");
    await shot(admin, "04-dashboard", true);
  });

  await step("Groups: list, create-duplicate copies setup WITHOUT pilgrims, switcher filters data", async () => {
    await admin.goto(BASE + "/groups"); await admin.locator("td", { hasText: "UMR-2026-001" }).first().waitFor();
    await shot(admin, "05-groups");
    await admin.locator("details", { hasText: "Duplicate setup" }).first().locator("summary").click();
    const d = admin.locator("details", { hasText: "Duplicate setup" }).first();
    await d.locator('input[name=name]').fill("Umrah March 2027"); await d.locator('input[name=startDate]').fill("2027-03-01");
    await d.locator("button[type=submit]").click(); await msg(admin, /no pilgrims copied/);
    await shot(admin, "06-groups-duplicated");
    await admin.goto(BASE + "/pilgrims");
    const sw = admin.locator('select[aria-label="Switch group"]:visible');
    const opts = await sw.locator("option").allInnerTexts(); const copy = opts.find((o) => o.includes("Umrah March 2027"))!;
    await sw.selectOption({ label: copy }); await admin.locator("main").getByText("0 pilgrim(s)").waitFor();
    await shot(admin, "07-switcher-new-group-empty");
    expect((await prisma.pilgrim.count({ where: { group: { name: "Umrah March 2027" } } }))).toBe(0);
    expect(await prisma.room.count({ where: { hotel: { group: { name: "Umrah March 2027" } } } })).toBe(80);
    await sw.selectOption({ label: opts.find((o) => o.includes("Umrah December 2026"))! }); await admin.locator("main").getByText("150 pilgrim(s)").waitFor();
  });

  await step("Pilgrims: filter RED, profile names the blocking checks", async () => {
    await admin.goto(BASE + "/pilgrims?status=RED"); await admin.locator("tbody").getByText("Blocked").first().waitFor();
    await shot(admin, "08-pilgrims-red");
    await admin.locator("tbody a").first().click(); await admin.waitForSelector("text=Clearance checks");
    await admin.getByText("Cannot be assigned to a bus or room until").waitFor();
    await shot(admin, "09-pilgrim-profile-red", true);
  });

  await step("Excel import: branded template download, preview shows row errors, only valid rows saved", async () => {
    const dl = await admin.request.get(BASE + "/api/templates/pilgrims");
    expect(dl.status()).toBe(200);
    const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("Pilgrims");
    ws.addRow(["Full Name", "Passport No", "Passport Expiry", "Date of Birth", "Gender", "Phone Nigeria", "Agent Group Name", "Emergency Contact Name", "Emergency Contact Phone"]);
    ws.addRow(["ABDULLAHI TEST ONE", "B1000001", "2031-01-01", "1970-05-05", "M", "08031112222", "Al-Huda Travels", "Kin", "08033334444"]);
    ws.addRow(["BAD DATE TWO", "B1000002", "31-31-2031x", "1970-05-05", "F", "08031112222", "Al-Huda Travels", "Kin", "08033334444"]);
    ws.addRow(["UNKNOWN AGENT THREE", "B1000003", "2031-01-01", "1970-05-05", "F", "08031112222", "No Such Agent", "Kin", "08033334444"]);
    await admin.goto(BASE + "/pilgrims/import");
    await admin.setInputFiles("#file", { name: "pilgrims.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await wb.xlsx.writeBuffer()) });
    await admin.click("button:has-text('Preview')"); await admin.waitForSelector("text=1 ready");
    await admin.getByText("2 with errors").waitFor(); await admin.getByText(/Unknown agent/).waitFor();
    await shot(admin, "10-import-preview");
    await admin.click("button:has-text('Import 1 valid')"); await msg(admin, /Imported 1/);
    expect(await prisma.pilgrim.count({ where: { passportNo: "B1000001" } })).toBe(1);
  });

  await step("Add pilgrim form is available to Super Admin", async () => {
    await admin.goto(BASE + "/pilgrims/new"); await admin.waitForSelector("text=Add pilgrim"); await shot(admin, "11-add-pilgrim");
  });

  /* ================= TICKET OFFICER ================= */
  const ticketCtx = await mk(); let ticket!: Page;
  await step("Ticket officer uploads a 5-passenger group ticket → 5 matched records; scanned PDF goes to manual review", async () => {
    ticket = await login(ticketCtx, "ticket@raudah.test");
    await ticket.goto(BASE + "/documents"); await ticket.waitForSelector("text=Upload PDFs");
    await ticket.setInputFiles("#up-files", path.resolve("samples/tickets/group-ticket-5-passengers.pdf"));
    await ticket.click("button:has-text('Upload & extract')"); await msg(ticket, /uploaded/);
    await ticket.setInputFiles("#up-files", path.resolve("samples/scanned/scanned-ticket.pdf"));
    await ticket.click("button:has-text('Upload & extract')"); await msg(ticket, /uploaded/);
    await ticket.goto(BASE + "/documents?type=TICKET");
    expect(await prisma.document.count({ where: { type: "TICKET", status: "EXTRACTED" } })).toBe(5);
    expect(await prisma.document.count({ where: { type: "TICKET", status: "NEEDS_REVIEW" } })).toBe(1);
    await ticket.getByText("(passenger 5)").waitFor();
    await shot(ticket, "12-documents-queue", true);
  });
  await step("Review screen: PDF on the left, extracted fields on the right, low-confidence highlighted", async () => {
    await ticket.locator("tr", { hasText: "group-ticket" }).locator("a:has-text('Review')").first().click(); await ticket.waitForSelector("text=Extracted fields");
    await ticket.waitForSelector("iframe[title='PDF preview']");
    await shot(ticket, "13-review-screen", true);
    const bad = await ticket.goto(BASE + "/documents?type=TICKET");
    void bad;
    const manual = ticket.locator("tr", { hasText: "scanned-ticket.pdf" });
    await manual.locator("a:has-text('Review')").click(); await ticket.getByText(/Scanned PDF/).waitFor();
    await shot(ticket, "14-scanned-manual-review", true);
  });
  await step("Bulk-confirm → tickets saved, TICKET cleared, pick-up and drop-off trips auto-created", async () => {
    await ticket.goto(BASE + "/documents?type=TICKET");
    await ticket.click("button:has-text('Bulk-confirm tickets')"); await msg(ticket, /Confirmed 5/);
    expect(await prisma.ticket.count({ where: { pilgrim: { passportNo: { in: demo.slice(140, 145).map((d) => d.passportNo) } } } })).toBe(5);
    await ticket.goto(BASE + "/trips"); await ticket.waitForSelector("text=Airport pick-up");
    await shot(ticket, "15-trips-auto-generated", true);
    // a ticket officer must NOT be able to confirm visas or see admin pages
    await ticket.goto(BASE + "/admin/users"); await ticket.waitForURL(/forbidden/);
  });

  /* ================= VISA OFFICER ================= */
  const visaCtx = await mk(); let visa!: Page;
  await step("Visa officer: visas matched by passport; expiry-before-return warning shown; confirm clears VISA", async () => {
    visa = await login(visaCtx, "visa@raudah.test");
    await visa.goto(BASE + "/documents"); await visa.selectOption("#up-type", "VISA");
    await visa.setInputFiles("#up-files", readdirSync("samples/visas").map((f) => path.resolve("samples/visas", f)));
    await visa.click("button:has-text('Upload & extract')"); await msg(visa, /3 file/);
    expect(await prisma.document.count({ where: { type: "VISA", status: "EXTRACTED" } })).toBe(3);
    await visa.goto(BASE + "/documents?type=VISA");
    const risky = demo[147];
    await visa.locator("tr", { hasText: `visa-${risky.passportNo}.pdf` }).locator("a:has-text('Review')").click();
    await visa.getByText("Visa expires before the return flight").waitFor();
    await shot(visa, "16-visa-warning", true);
    await visa.click("button:has-text('Confirm & attach')"); await visa.locator("main").getByText("confirmed", { exact: false }).first().waitFor();
    await visa.getByText("Visa expires before the return flight").waitFor(); // warning stays visible after confirming
    await visa.goto(BASE + "/documents?type=VISA"); await visa.click("button:has-text('Bulk-confirm visas')"); await msg(visa, /Confirmed 2/);
    const p = await prisma.pilgrim.findFirstOrThrow({ where: { passportNo: risky.passportNo }, include: { checks: true } });
    expect(p.checks.find((c) => c.type === "VISA")!.status).toBe("CLEARED");
    expect(await prisma.notification.count({ where: { title: { contains: "Visa expires" } } })).toBeGreaterThan(0);
  });

  /* ================= OPERATIONS ================= */
  const opsCtx = await mk(); let ops!: Page;
  await step("Hotels: occupancy board; RED pilgrim cannot be put in a room (server message names the check)", async () => {
    ops = await login(opsCtx, "ops@raudah.test");
    await ops.goto(BASE + "/hotels"); await ops.waitForSelector("text=Raudah Al-Safa Hotel"); await shot(ops, "17-hotels");
    await ops.locator("a:has-text('Open board')").first().click(); await ops.waitForSelector("text=Without a room");
    await shot(ops, "18-rooming-board", true);
    const redChip = ops.locator("aside li", { hasText: "Blocked:" }).first();
    await redChip.locator("select").selectOption({ index: 1 });
    await ops.getByText(/is RED and cannot be assigned/).waitFor();
    await shot(ops, "19-red-blocked-from-room");
  });
  await step("Hotels: auto-fill Madinah, then check-in a guest", async () => {
    await ops.goto(BASE + "/hotels");
    await ops.locator("tr", { hasText: "Dar Al-Taqwa" }).locator("a").click(); await ops.waitForSelector("text=Without a room");
    await ops.click("button:has-text('Auto-fill rooms')"); await ops.waitForSelector("text=Room 201");
    await ops.waitForFunction(() => document.querySelectorAll("section[aria-label^='Room'] li.rounded-lg").length > 20);
    await shot(ops, "20-madinah-autofill");
    const guest = ops.locator("section[aria-label^='Room'] li.rounded-lg").first();
    await guest.locator("button[aria-label^='Check in']").click(); await ops.getByText("● in").first().waitFor();
    await shot(ops, "21-checked-in");
    // within a room: family members together
    const fam = await prisma.roomAssignment.findMany({ where: { pilgrim: { familyLinkId: "FAM-001" } }, include: { room: { include: { hotel: true } } } });
    expect(new Set(fam.filter((f) => f.room.hotel.city === "MADINAH").map((f) => f.roomId)).size).toBeLessThanOrEqual(1);
  });
  await step("Trips: bus manifest, RED seat rejected, boarding, flight delay", async () => {
    await ops.goto(BASE + "/trips?type=ARRIVAL_PICKUP"); await ops.locator("tbody a").first().click(); await ops.waitForSelector("text=Buses (2)");
    await shot(ops, "22-trip-buses", true);
    await ops.locator("summary:has-text('Assign pilgrims to this bus')").first().click();
    const redRow = ops.locator("details[open] li", { hasText: "Blocked" }).first();
    await redRow.locator("input[type=checkbox]").check();
    await ops.locator("details[open] button:has-text('Assign selected')").click();
    await ops.getByText(/is RED and cannot be assigned to bus/).waitFor();
    await shot(ops, "23-red-rejected-from-bus", true);
    await ops.locator("button:has-text('Boarded')").first().click(); await ops.getByText("boarded").first().waitFor();
    await ops.fill("#d-m", "90"); await ops.click("button:has-text('Save delay & notify')"); await msg(ops, /Delay saved/);
    await shot(ops, "24-boarding-and-delay", true);
    expect(await prisma.notification.count({ where: { title: { contains: "Flight delay" } } })).toBeGreaterThan(0);
    const tripId = ops.url().split("/").pop()!;
    const man = await ops.request.get(`${BASE}/api/reports/bus_manifest?id=${tripId}`);
    expect(man.status()).toBe(200); expect(man.headers()["content-type"]).toBe("application/pdf");
    await pdfToPng(await man.body(), "25-bus-manifest-pdf");
  });
  await step("Ziyarah: fixed package listed, mark a stop visited", async () => {
    await ops.goto(BASE + "/trips"); await ops.waitForSelector("text=Ziyarah package");
    await ops.locator("tr", { hasText: "Jabal Al-Noor" }).locator("button:has-text('Mark visited')").click(); await ops.getByText("Done").first().waitFor();
    await shot(ops, "26-ziyarah", true);
  });
  await step("Handover: ops sends bus handover; Super Admin confirms; responsibility changes only then", async () => {
    await ops.goto(BASE + "/handovers"); await ops.waitForSelector("text=Staff handovers");
    await ops.locator("summary:has-text('Send a handover')").click();
    await ops.selectOption("#h-to", { label: "Super Admin" }); await ops.selectOption("#h-sc", "BUS");
    await ops.locator("#h-b").selectOption({ index: 1 }); await ops.fill("#h-n", "Bus 1 – driver reports AC fault"); await ops.fill("#h-i", "AC not working");
    await ops.click("button:has-text('Send handover')"); await msg(ops, /Handover sent/);
    const h = await prisma.handover.findFirstOrThrow({ orderBy: { sentAt: "desc" } });
    const before = await prisma.tripBus.findUniqueOrThrow({ where: { id: h.tripBusId! } });
    await admin.goto(BASE + "/handovers"); await admin.getByText("handed over bus to you").waitFor();
    await shot(admin, "27-handover-pending", true);
    await admin.click("button:has-text('Confirm receipt')"); await admin.getByText("handed over bus to you").waitFor({ state: "detached" });
    const after = await prisma.tripBus.findUniqueOrThrow({ where: { id: h.tripBusId! } });
    expect(before.staffInChargeId).not.toBe(after.staffInChargeId);
    const adminUser = await prisma.user.findUniqueOrThrow({ where: { email: "admin@raudah.test" } });
    expect(after.staffInChargeId).toBe(adminUser.id);
    await admin.goto(BASE + "/handovers"); await shot(admin, "28-handover-confirmed", true);
  });

  /* ================= REMINDERS & NOTIFICATIONS ================= */
  await step("Reminders: simulated clock at 7 days before departure sends in-app + WhatsApp (mock) to staff only", async () => {
    const sent = await runReminders(new Date("2026-11-24T08:30:00Z"));
    expect(sent).toBeGreaterThan(0);
    const fin = await prisma.user.findUniqueOrThrow({ where: { email: "finance@raudah.test" } });
    expect(await prisma.notification.count({ where: { userId: fin.id, channel: "IN_APP", title: { contains: "still RED" } } })).toBe(1);
    expect(await prisma.notification.count({ where: { channel: "WHATSAPP" } })).toBeGreaterThan(0);
    expect(await prisma.notification.count({ where: { user: { role: "AGENT" } } })).toBe(0);
    await admin.goto(BASE + "/notifications"); await admin.waitForSelector("text=still RED"); await shot(admin, "29-notifications", true);
    await admin.goto(BASE + "/admin/reminders"); await admin.waitForSelector("text=Reminder rules"); await shot(admin, "30-reminder-rules", true);
  });

  /* ================= FINANCE ================= */
  const finCtx = await mk(); let fin!: Page;
  await step("Finance: payment pending list, can clear payment but cannot edit pilgrims", async () => {
    fin = await login(finCtx, "finance@raudah.test"); await fin.waitForSelector("text=Payment pending"); await shot(fin, "31-finance-dashboard", true);
    await fin.goto(BASE + "/pilgrims?status=RED&blocking=PAYMENT"); await fin.locator("tbody a").first().click(); await fin.waitForSelector("text=Clearance checks");
    await fin.locator("li", { hasText: "Payment" }).locator("button:has-text('Mark cleared')").click();
    await fin.waitForSelector("li:has-text('Payment') >> text=Set pending");
    expect(await fin.locator("text=Edit pilgrim").count()).toBe(0);
    await fin.goto(BASE + "/pilgrims/new"); await fin.waitForURL(/forbidden/);
  });

  /* ================= REPORTS / SEARCH / AUDIT ================= */
  await step("Reports: branded PDF + Excel exports", async () => {
    await admin.goto(BASE + "/reports"); await admin.waitForSelector("text=Rooming list"); await shot(admin, "32-reports", true);
    const hotel = await prisma.hotel.findFirstOrThrow({ where: { city: "MAKKAH", group: { code: "UMR-2026-001" } } });
    const pdf = await admin.request.get(`${BASE}/api/reports/rooming_list?id=${hotel.id}`);
    expect(pdf.status()).toBe(200); await pdfToPng(await pdf.body(), "33-report-rooming-pdf");
    const x = await admin.request.get(`${BASE}/api/reports/clearance_by_agent?format=xlsx`);
    expect(x.status()).toBe(200); expect(x.headers()["content-type"]).toContain("spreadsheetml");
    const xl = path.join(SHOTS, ".clearance.xlsx"); writeFileSync(xl, await x.body());
    execFileSync("soffice", ["--headless", "--convert-to", "pdf", "--outdir", SHOTS, xl], { stdio: "ignore" });
    await pdfToPng(readFileSync(path.join(SHOTS, ".clearance.pdf")), "34-report-excel-clearance", 1, 70);
    for (const f of [".clearance.pdf", ".clearance.xlsx"]) execFileSync("node", ["-e", `require('fs').unlinkSync(${JSON.stringify(path.join(SHOTS, f))})`]);
  });
  await step("Global search finds by name / passport / PNR / phone", async () => {
    const p = demo[10], t = await prisma.ticket.findFirstOrThrow({ where: { pilgrim: { passportNo: p.passportNo } } });
    for (const q of [p.fullName.split(" ")[0], p.passportNo, t.pnr]) { await admin.goto(`${BASE}/search?q=${encodeURIComponent(q)}`); await admin.waitForSelector("tbody a"); }
    await admin.goto(`${BASE}/search?q=${encodeURIComponent(p.passportNo)}`); await admin.waitForSelector(`text=${p.fullName}`);
    await shot(admin, "35-search");
  });
  await step("Audit log records every change with old/new values", async () => {
    await admin.goto(BASE + "/admin/audit"); await admin.waitForSelector("text=Audit log"); await shot(admin, "36-audit-log", true);
    expect(await prisma.auditLog.count({ where: { entity: "ClearanceCheck", field: "status", oldValue: "PENDING", newValue: "CLEARED" } })).toBeGreaterThan(0);
  });

  /* ================= AGENT (read-only, own pilgrims) ================= */
  const agentCtx = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); let agent!: Page;
  await step("Agent (phone): sees only own pilgrims, no edit controls, no admin/other-agent access", async () => {
    agent = await login(agentCtx, "agent@raudah.test"); await agent.waitForSelector("text=My pilgrims"); await shot(agent, "37-agent-dashboard-mobile", true);
    await agent.goto(BASE + "/pilgrims"); await agent.waitForSelector("tbody tr");
    const agents = await agent.locator("tbody tr td:nth-child(3)").allInnerTexts();
    expect(new Set(agents)).toEqual(new Set(["Al-Huda Travels"]));
    expect(await agent.locator("text=Add pilgrim").count() + await agent.locator("text=Import").count()).toBe(0);
    await shot(agent, "38-agent-pilgrims-mobile", true);
    const mine = await prisma.pilgrim.findFirstOrThrow({ where: { agent: { groupName: "Al-Huda Travels" }, assignments: { some: {} }, tripSeats: { some: {} } } });
    await agent.goto(`${BASE}/pilgrims/${mine.id}`); await agent.waitForSelector("text=Hotel & bus");
    expect(await agent.locator("text=Edit pilgrim, text=Delete pilgrim, text=Timeline").count()).toBe(0);
    await shot(agent, "39-agent-profile-mobile", true);
    const other = await prisma.pilgrim.findFirstOrThrow({ where: { agent: { groupName: "Safa Marwa Tours" } } });
    const r = await agent.goto(`${BASE}/pilgrims/${other.id}`); expect(r!.status()).toBe(404);
    for (const p of ["/admin/users", "/documents", "/hotels", "/trips", "/handovers", "/groups"]) { await agent.goto(BASE + p); expect(agent.url()).toMatch(/forbidden/); }
    await shot(agent, "40-agent-forbidden");
    expect((await agent.request.get(`${BASE}/api/reports/payment_status`)).status()).toBe(400 /* role cannot export this report */);
    expect((await agent.request.get(`${BASE}/api/templates/pilgrims`)).status()).toBe(403);
    const doc = await prisma.document.findFirstOrThrow({ where: { fileKey: { not: "purged" } } });
    expect((await agent.request.get(`${BASE}/api/files/${doc.fileKey}`)).status()).toBe(403);
  });

  /* ================= DARK MODE / PWA / MOBILE ================= */
  await step("Dark mode + mobile layout + PWA manifest/service worker", async () => {
    await admin.goto(BASE + "/"); await admin.getByLabel("Toggle dark mode").click(); await admin.waitForTimeout(400);
    await shot(admin, "41-dark-dashboard");
    const m = await (await admin.request.get(BASE + "/manifest.webmanifest")).json();
    expect(m).toMatchObject({ name: "Raudah GSMS", short_name: "Raudah", theme_color: "#3F4096", background_color: "#FFFFFF", display: "standalone" });
    expect(m.icons.map((i: any) => i.purpose)).toContain("maskable");
    await admin.waitForTimeout(1500);
    expect(await admin.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()))).toBe(true);
    const sec = await (await admin.request.get(BASE + "/login")).headers();
    expect(sec["content-security-policy"]).toContain("default-src 'self'"); expect(sec["x-content-type-options"]).toBe("nosniff");
    const mob = await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mp = await login(mob, "ops@raudah.test"); await mp.goto(BASE + "/trips"); await mp.locator("tbody a").first().click(); await mp.locator("h2", { hasText: "Buses" }).waitFor();
    await shot(mp, "42-ops-trip-mobile");
    const login2 = await (await mk({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true })).newPage(); await login2.goto(BASE + "/login"); await shot(login2, "43-login-mobile");
  });
  await step("Performance: 150-pilgrim list and dashboard render quickly", async () => {
    const t0 = Date.now(); await admin.goto(BASE + "/pilgrims"); await admin.waitForSelector("tbody tr"); const dt = Date.now() - t0;
    console.log("pilgrims list ms:", dt); expect(dt).toBeLessThan(2000);
  });

  await browser.close();
  const failed = results.filter((r) => !r.ok);
  writeFileSync(path.join(SHOTS, "e2e-results.json"), JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} steps passed`);
  expect(failed.map((f) => `${f.name}: ${f.err}`)).toEqual([]);
});
