# Decisions log

Choices made where the spec was silent or ambiguous. Newest phase last.

## Phase 1

1. **Lives in `raudah-gsms/`, not the repo root.** The repository root already hosts a different, working app
   (NUSUK Consult: `package.json`, `Dockerfile`, `public/`, `README.md`). Scaffolding Next.js there would have overwritten it.
   If you want Raudah at the root, move the folder's contents up and delete the old app deliberately.
2. **Pinned versions:** Next 14.2.18, React 18.3, NextAuth **v4** (credentials + JWT sessions; v5 is still beta), Prisma **5.22**,
   Tailwind **3.4** (shadcn/ui-style components are hand-written in `src/components/ui`; no generator needed).
3. **Fonts are self-hosted** via `@fontsource` (Marcellus + Inter) instead of the Google Fonts CDN: works offline/behind
   firewalls and avoids sending visitor IPs to a third party (relevant for PDPL/NDPA).
4. **Schema grows per phase.** Phase 1 migrates only `User`, `Agent`, `AuditLog`. Group/Pilgrim/etc. arrive with their phase as new migrations.
   Extra fields vs. the spec: `User.totpEnabled`, `failedLogins`, `lockedUntil`, `lastLoginAt`; `Agent.active`.
   `User.totpSecret` is stored **AES-256-GCM encrypted** as `totpSecretEnc` (key: `APP_ENCRYPTION_KEY`).
5. **Authorization lives in the service layer** (`assertCan` in `src/services/*`) and is repeated in server actions via `requireActor(cap)`;
   the UI only hides things. `requireActor` re-reads the user from the DB, so deactivation/role changes apply immediately
   even though sessions are JWTs. The capability matrix is a single table in `src/lib/rbac.ts`.
6. **Super Admin 2FA:** a Super Admin without 2FA is confined to `/account/security` by middleware until enrolment completes;
   once enrolled, sign-in requires the TOTP code. An admin can remove another user's 2FA (lost phone); that is audited.
   Users with other roles may also enrol (optional) but are not forced, and the login flow currently only *demands* a code for Super Admins.
7. **Login protection:** sliding-window limiter (5 failures / 15 min per identifier+IP, 20 per IP) **plus** DB account lockout.
   The limiter is in-memory (single instance); move it to Redis when BullMQ/Redis is wired in Phase 5 if running >1 app instance.
   Locked and rate-limited attempts return the same message whether or not the account exists. Unknown accounts still run a bcrypt compare to equalise timing.
8. **Audit log shape:** CREATE/DELETE = one row with a JSON snapshot; UPDATE = one row per changed field with old/new value.
   `passwordHash` and `totpSecretEnc` are always `[redacted]`. Sign-ins (`LOGIN`, `LOGIN_FAILED`) and `2FA_ENABLED` are logged too.
   Audit writes happen in the same DB transaction as the change.
9. **Phone numbers** are normalised on save: Nigerian local `0803…` → `+234803…`; `00…` → `+…`. E-mail is lower-cased.
   Either e-mail or phone can be used to sign in.
10. **AGENT role** has `pilgrims.read.own` and `reports.export` (own pilgrims only; the row-level filter is applied when pilgrims exist, Phase 2/6).
    It has no `*.write` capability. A unit test asserts this.
11. **Guard rails:** you cannot change your own role/deactivate yourself, nor remove the last active Super Admin. Agents with linked users can't be deleted (deactivate instead).
12. **Group switcher** is a visible placeholder in the header until Groups exist (Phase 2).
13. **Seed** (`npm run db:seed`) creates 1 Super Admin, 1 user per role, 3 agents, one shared dev password (`SEED_DEFAULT_PASSWORD`).
    It refuses to run in production without an explicit password. The pilgrims/hotels/flights/PDF seed is added in later phases.
14. **Not verified in this environment:** `docker compose up` (no Docker daemon was available; the compose file passes `docker compose config`).
    Everything else was exercised against local Postgres 16.
