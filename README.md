# NUSUK CONSULT — Beyond Compliance

Public website + service-request intake + admin dashboard for NUSUK CONSULT.
Zero npm dependencies: Node.js ≥ 22.13 (built-in `node:sqlite`, `node:http`).

## Run

```bash
cp .env.example .env      # set ADMIN_EMAIL / ADMIN_PASSWORD
npm start                 # http://localhost:3000
npm test                  # API + security tests
```

If `ADMIN_PASSWORD` is empty, a random one is printed on first start. Change it in **Dashboard → Users**.

## What it does

| Area | Details |
|---|---|
| Public site | Home, About, Services, Session highlights, Testimonials, Privacy (SPA, hash routes) |
| Service Interest Form | `POST /api/requests` — server-side validation, honeypot, rate limit (10/hour/IP) |
| Ground Service Bookings | Hotel / eSIM / Haramain train request form → `POST /api/bookings` (was "Coming soon") |
| Admin login | Email + password (scrypt), HttpOnly SameSite=Strict session cookie, 12h expiry, login rate limit |
| Dashboard | Overview stats · Service Requests & Bookings (search, status workflow, internal notes, CSV export, delete) · Hotel & eSIM inventory CRUD · Users (admin/staff roles) · Settings (brochure & YouTube links) |
| Roles | `admin`: everything. `staff`: requests, bookings, inventory — no Users/Settings |
| Notifications | Optional `NOTIFY_WEBHOOK_URL` receives a JSON summary of each new request/booking |

## Deploy

Needs a persistent disk for `DATA_DIR` (SQLite file `nusuk.db`).

```bash
docker build -t nusuk-consult .
docker run -p 3000:3000 -v nusuk-data:/data -e HTTPS=1 -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='…' nusuk-consult
```

Put it behind an HTTPS reverse proxy (Caddy/nginx/Cloudflare) and set `HTTPS=1` so cookies are `Secure`
and the proxy's `X-Forwarded-For` is used for rate limiting. Back up by copying `data/nusuk.db`.

## Layout

```
server/   index.js (routes, static, security headers) · db.js · auth.js · validate.js · config.js
public/   index.html · css/style.css · js/app.js (site) · js/admin.js (dashboard, lazy-loaded) · img/
test/     api.test.js
```

## Content to confirm before launch

- Privacy Policy text is still the original placeholder.
- Brochure / YouTube links: add in Dashboard → Settings (buttons stay disabled until set).
- Contact details were inconsistent in the source file; unified to `info@nusuk.com.ng` and "Gombe Road" — edit in `public/index.html` / `public/js/app.js` if wrong.
- Social media links in the footer are plain text (no URLs were supplied).
