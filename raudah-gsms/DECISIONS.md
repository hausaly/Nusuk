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

## Phases 2–7

15. **Group scope.** The group switcher stores the selection in an httpOnly cookie (`gsms_group`). Staff see every group; an AGENT sees only
    groups in which they have pilgrims. Archived groups stay visible/searchable but every mutating service calls `assertGroupWritable`.
16. **Duplicate group** copies hotels + rooms, INTERCITY and ZIYARAH trips (without buses/passengers), ziyarah items, supervisor and agents. Dates
    shift by the difference between the old and new start date. Pilgrims, airport trips (they derive from tickets), buses and handovers are never copied.
17. **Clearance.** `ClearanceCheck` rows are created with the pilgrim. VISA/TICKET clear when the PDF is confirmed; DOCUMENTS clears automatically
    when a passport copy AND payment receipt exist (deleting one sets it back to PENDING). Every change is audited; CLEARED→PENDING alerts the Super Admin.
18. **Extraction.** Text PDFs are parsed with `pdf-parse` + label-based regexes (`Passenger:`, `PNR:`, `Flight:`, `From: LOS 2026-12-01 21:30` …).
    **Layouts the regexes don't recognise, and scanned PDFs, go to the Claude document API** (`ANTHROPIC_API_KEY`, model `EXTRACTION_MODEL`,
    default `claude-sonnet-5-5`). Without a key those documents land in *Needs review* with a message and are filled in by hand on the review screen.
    **The Claude fallback is implemented but was NOT exercised in this build (no API key available); the regex path is covered by tests.**
    Real airline e-ticket layouts vary: expect to add patterns to `parseTicketText` after seeing your actual tickets.
19. **Matching.** Passport number (exact) first; then fuzzy name inside the group (order-insensitive token similarity, ≥0.85 and a clear winner).
    Confidence < 0.85 or a missing required field → *Needs review*; matched + complete → *Extracted* (eligible for bulk-confirm only if there are no warnings).
    Group tickets are split into one `Document` row per passenger that share one stored file.
20. **Times.** Flight times are entered/stored as local airport time → UTC (NG airports = Africa/Lagos, all others = Asia/Riyadh; neither zone has DST).
    Trip times entered in the UI are KSA time. Pages show both zones where relevant.
21. **Airport trips** are keyed `type|flight|KSA-date|airport` and re-synced after every ticket confirmation. Auto trips with no buses disappear
    if no ticket supports them any more; trips that already have buses are kept.
22. **Ziyarah** is a fixed package: every pilgrim in the group is a candidate for every ziyarah trip. Because rule 4 forbids seating RED pilgrims,
    "auto-include" means *all cleared pilgrims*; blocked ones are listed with the blocking checks instead of being seated.
23. **Rooms.** Gender `null` = family/mixed room. Auto-fill: families first (kept together), then grouped by agent, best-fit room; mixed families only
    go in unrestricted rooms; RED pilgrims are skipped and counted. Check-in/out sets `journeyStatus`. Drag-and-drop uses native HTML5 DnD, and every chip also
    has an *Assign to room* select so it works on touch phones.
24. **Hotel check-out reminder.** The data model has no planned check-out date, so "check-out due" fires on the morning (06:00 KSA by default) of an
    INTERCITY trip leaving that hotel's city, if guests are still checked in.
25. **Reminders.** Rules live in `ReminderRule` (editable by the Super Admin: enabled, hours-before offsets or from-hour). `runReminders(now)` is idempotent
    (`ReminderLog` dedupes per rule/entity/offset) and catches up if a tick is missed. It runs in-process every minute by default
    (`instrumentation.ts`), or in a BullMQ worker (`USE_QUEUE=1`, `npm run worker`). *Flight delay* is event-driven (fires immediately from `setDelay`).
    RED-before-departure uses the ticket's outbound departure, or the group start date when there is no ticket yet, and is aggregated per owner role.
26. **WhatsApp.** `notifyUsers` writes an in-app notification and, when the staff member has a phone, a WhatsApp message through a provider interface.
    Without `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID` a mock provider is used (delivery status `MOCK_SENT`). The Meta provider sends the template
    `raudah_staff_alert` with two parameters; **that template must be created and approved in Meta Business Manager** (not verified live here).
    Agents and pilgrims are never notified.
27. **Files.** Stored encrypted (AES-256-GCM with `APP_ENCRYPTION_KEY`) on local disk by default, or in S3/MinIO with `STORAGE_DRIVER=s3` (SSE). They are
    only served through `/api/files/<key>` which requires a staff session *and* a valid HMAC signature (5-minute expiry). The S3 driver code path was not run here.
28. **Reports.** The 8 reports share one data layer rendered to PDF (`@react-pdf/renderer`, Marcellus title, logo, Primary rule, "Page X of Y" footer)
    and Excel (logo, company name, Primary header, frozen header). Which roles get which reports follows the spec's export row; AGENT only gets the clearance
    report for their own pilgrims. Every export is audited.
29. **Data protection.** Hosting region and retention are configuration (`DATA_HOSTING_REGION`, `DATA_RETENTION_DAYS`) documented for the operator;
    a Super Admin can purge the stored files of an ARCHIVED group (rows stay for the audit trail). Automatic retention-based deletion is not scheduled.
30. **Backups.** `scripts/backup.sh` and a `backup` compose service dump PostgreSQL daily. **Pruning old dumps is intentionally left to your retention
    policy**; an automated "delete old backups" step was blocked by the sandbox's safety check and I did not work around it.
31. **PWA.** Manifest + icons + service worker that only caches static assets (pages/API always hit the network so clearance is never stale) and shows an
    offline page. Production headers add a CSP, HSTS, nosniff, frame protection (same-origin, needed for the PDF preview).
32. **pdf-parse quirk.** The first call in a fresh process can throw while pdf.js initialises; `pdfText` retries once (found by the tests).
