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
| Sub-path hosting | `BASE_PATH=/nusuk` |
| Notifications | Optional `NOTIFY_WEBHOOK_URL` receives a JSON summary of each new request/booking |

## DIY Booking (Hotels · HHR Train · Transfers)

- **Hotels (Makkah / Madinah):** guests search by dates and rooms, see results **cheapest first**, review the order, enter their details and pay with **Paystack**. A booking ID (`NC-H-XXXXXX`) and a downloadable PDF slip are created. No login for clients.
- **HHR Train / Transfers:** one-way request forms (Train stations: Makkah, Al-Sulimaniyah - Jeddah, Airport - Jeddah, KAEC; six vehicle types). IDs `NC-T-…` / `NC-R-…`.
- **Admin → Hotel Inventory:** add/edit hotels manually, **bulk upload Excel/CSV** (template provided), attach the supplier's original offer PDF, cover image. Selling price per night = rate × FX rate (SAR) × (1 + mark-up %) + fixed ₦ — mark-up defaults live in **Settings** and are applied automatically on upload.
- **Admin → DIY Orders:** all orders with client details, payment and fulfilment status (Pending / Fulfilled / Cancelled), notes, CSV export and PDF slip.

**Payments (current setup: manual).** With no Paystack key configured, a hotel booking is a *reservation*: the client gets a slip marked "payment pending", your team contacts them with payment details, and you open the order in **DIY Orders** and click **Mark as PAID**. Online card payment is built in but switched off: set `PAYSTACK_SECRET_KEY` and `PUBLIC_URL` (see `.env.example`) and add `<PUBLIC_URL>/api/paystack/webhook` as the Paystack webhook to turn it on later — the Settings page then shows a *Check Paystack connection* button. `PAYMENT_SIMULATION=1` is for demos only.

## Deploy

Needs a persistent disk for `DATA_DIR` (SQLite file `nusuk.db`).

```bash
docker build -t nusuk-consult .
docker run -p 3000:3000 -v nusuk-data:/data -e HTTPS=1 -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='…' nusuk-consult
```

Put it behind an HTTPS reverse proxy (Caddy/nginx/Cloudflare) and set `HTTPS=1` so cookies are `Secure`
and the proxy's `X-Forwarded-For` is used for rate limiting. Back up by copying `data/nusuk.db`.

## Serving under a sub-path (e.g. https://www.hausaly.com/nusuk)

Set `BASE_PATH=/nusuk`. The app then answers only under `/nusuk/…` (`/nusuk` redirects to `/nusuk/`), and the
session cookie is scoped to that path. Your front web server must forward `/nusuk/` **unchanged** (do not strip the prefix):

```nginx
location /nusuk/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
location = /nusuk { return 301 /nusuk/; }
```
```
# Caddy
handle /nusuk* { reverse_proxy 127.0.0.1:3000 }
```

## cPanel shared hosting (Passenger)

Needs **Setup Node.js App** with Node ≥ 22.13. Create the app with Application URL `yourdomain.com/nusuk`,
Startup file `app.cjs`, and env vars `BASE_PATH=/nusuk`, `HTTPS=1`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
`DATA_DIR=/home/<cpanel-user>/nusuk-data` (outside `public_html`).

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
