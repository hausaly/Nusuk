# Raudah GSMS – Umrah Ground Service Management System

Raudah Travels & Tours Ltd · tracks pilgrims from pre-travel clearance through airport pick-up, hotels, transfers,
ziyarah and drop-off. Next.js 14 (App Router) · TypeScript · PostgreSQL + Prisma · Tailwind · NextAuth.

**Status: Phase 1 of 7** – project setup, branding, auth + 2FA, roles, users, agents, audit log.
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
