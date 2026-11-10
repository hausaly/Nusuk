# Raudah GSMS – Umrah Ground Service Management System

Raudah Travels & Tours Ltd · tracks pilgrims from pre-travel clearance through airport pick-up, hotels, transfers,
ziyarah and drop-off. Next.js 14 (App Router) · TypeScript · PostgreSQL + Prisma · Tailwind · NextAuth.

**Status: all 7 phases built and tested** – see `docs/screenshots/` for the end-to-end run and `DECISIONS.md` for choices and known limits.
See `DECISIONS.md` for choices made along the way.

## Run locally

```bash
cp .env.example .env            # then set NEXTAUTH_SECRET (openssl rand -base64 32) and APP_ENCRYPTION_KEY (openssl rand -hex 32)
docker compose up -d postgres redis minio
npm install
npx prisma migrate deploy
npm run db:seed                 # dev users + 3 agents
npm run dev                     # http://localhost:3000
```

Or everything in containers: `docker compose up --build` (applies migrations on start; run the seed separately).

### Seed logins (password `Raudah#2026`, dev only)

| Role | E-mail |
|---|---|
| Super Admin | admin@raudah.test (must set up 2FA on first sign-in) |
| Visa / Ticket / Finance / Operations | visa@ / ticket@ / finance@ / ops@ `raudah.test` |
| Agent (Al-Huda Travels, read-only) | agent@raudah.test |

## Scripts

`npm run dev | build | start | lint | typecheck | test` · `npm run db:migrate | db:deploy | db:seed | db:reset` ·
`npm run assets:icons` (regenerates favicon/PWA icons from `public/brand/logo.png`; needs Python + Pillow).

Tests (Vitest) use a separate database, `raudah_gsms_test` on the same server (override with `TEST_DATABASE_URL`); create it once:
`createdb raudah_gsms_test`. Migrations are applied automatically by the tests.

## Branding

Tokens live in `tailwind.config.ts` and `src/app/globals.css` (Raudah Blue `#3F4096`, Raudah Red `#E8353B`, Light Grey `#E6E7E8`;
dark mode via the `.dark` class). Headings use Marcellus, UI text Inter. Status colours (green/red/amber) are separate from the brand red.

## Layout

```
prisma/            schema, migrations, seed
src/lib/           rbac, auth, audit, crypto, totp, rate-limit, session helpers
src/services/      business logic + authorization + audit (the only place that writes data)
src/app/           routes (login, dashboard, admin/users|agents|audit, account/security)
src/components/    ui primitives, brand logo, app shell
```

## Modules

Groups & switcher · Pilgrims (CRUD, Excel/CSV import with preview) · Clearance (GREEN/RED, auto rules) · Tickets & visas (PDF upload, extraction,
matching, review, validation warnings) · Hotels & rooms (drag-and-drop board, auto-fill, check-in/out) · Trips & buses (auto pick-up/drop-off,
intercity, ziyarah, boarding, flight delay) · Handovers · Notifications (in-app + WhatsApp) · Reminders (editable rules, Lagos/Riyadh time) ·
Dashboards · Global search · Branded PDF/Excel reports · PWA.

## Seed data and samples

`npm run db:seed` creates 1 group (UMR-2026-001) with 150 pilgrims (mixed clearance), 2 hotels with 40 rooms each, 3 arrival flights + 2 return flights,
1 intercity trip, 4 ziyarah stops, 6 users and 3 agents. `npm run samples` regenerates the sample PDFs in `samples/` (group ticket with 5 passengers,
3 text visas — one expires before the return flight — and 2 scanned PDFs). Upload them in *Tickets & visas* to see extraction.

## Tests

```bash
createdb raudah_gsms_test && npm test          # 65 unit/integration tests (Vitest)
npm run build && npm start                     # then, with the app running on a freshly seeded DB:
npm run e2e                                    # Playwright walkthrough as every role; writes docs/screenshots/
```

## Operations

- Background work: in-process by default; `USE_QUEUE=1` + `npm run worker` (or `docker compose --profile worker up`) uses BullMQ/Redis.
- Env: see `.env.example` — `ANTHROPIC_API_KEY` (scanned-PDF extraction), `WHATSAPP_TOKEN` + `WHATSAPP_PHONE_NUMBER_ID`, `STORAGE_DRIVER=s3` + `S3_*`,
  `DATA_HOSTING_REGION`, `DATA_RETENTION_DAYS`.
- Backups: `npm run backup` / the `backup` compose service (daily dumps; prune per your retention policy).
- Production checklist: strong `NEXTAUTH_SECRET` and `APP_ENCRYPTION_KEY`, HTTPS, change seed passwords (or don't seed), host in your chosen region,
  create/approve the WhatsApp template `raudah_staff_alert`, restrict DB/Redis/MinIO network access.
