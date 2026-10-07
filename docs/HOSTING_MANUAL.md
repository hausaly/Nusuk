# NUSUK CONSULT — Hosting Manual

How the platform was deployed to **https://www.hausaly.com/nusuk/** on **Truehost cPanel (Web Hosting Starter)** using *Setup Node.js App*. Follow this to deploy it again, move it, or recover it.

---

## 1. What you are deploying

| Item | Detail |
|---|---|
| App | Node.js web app (site + request forms + admin dashboard) |
| Dependencies | **None** (no `npm install` needed) |
| Node version | **22.13 or newer** (uses built-in SQLite). Truehost offers 22.23.3 |
| Database | One SQLite file: `nusuk.db` (kept **outside** the code folder) |
| Entry file | `app.cjs` |
| URL path | `/nusuk` (set with `BASE_PATH`) |

**Before you start, confirm:**

- [ ] cPanel has **Setup Node.js App** (search "node" in cPanel's tool search)
- [ ] The version list includes **22.13+**
- [ ] The domain's DNS already points to the hosting (A record = the server IP)
- [ ] You have the project ZIP from GitHub

If either of the first two is missing, the app cannot run on that plan — ask the host to enable Node 22, or use a VPS (Appendix A).

---

## 2. Folder layout (cPanel home = `/home/<cpanel-user>`)

```
/home/<cpanel-user>/
├── nusuk/                  ← APPLICATION ROOT (code lives here)
│   ├── app.cjs             ← startup file
│   ├── package.json
│   ├── server/             ← index.js, db.js, auth.js, validate.js, config.js
│   ├── public/             ← index.html, css/, js/, img/
│   └── test/
├── nusuk-data/             ← DATABASE (created automatically; never delete)
└── public_html/            ← your main website (not touched)
```

> **Golden rule:** the files `app.cjs`, `server/`, `public/` must sit **directly** inside `nusuk/`, not in a sub-folder.

---

## 3. First-time deployment

### Step 1 — Download the project
1. Open the GitHub repository → choose the branch → **Code → Download ZIP**.
2. You get `Nusuk-<branch>.zip`.

### Step 2 — Upload the code
1. cPanel → **File Manager**.
2. Go to `/home/<cpanel-user>` and create a folder named **`nusuk`**.
3. Open `nusuk` → **Upload** → select the ZIP.
4. Right-click the ZIP → **Extract** (into `/home/<cpanel-user>/nusuk`).
5. Open the new folder (`Nusuk-<branch>`), **Select All → Move** to `/home/<cpanel-user>/nusuk`.
   (Turn on **Settings → Show Hidden Files** first.)
6. Delete the empty extracted folder and the ZIP.
7. Check the layout matches section 2.

### Step 3 — Create the Node.js app
cPanel → **Setup Node.js App** → **Create Application**:

| Field | Value |
|---|---|
| Node.js version | **22.x** (e.g. 22.23.3) |
| Application mode | Production |
| Application root | `nusuk` |
| Application URL | pick your domain, and type **`nusuk`** in the path box next to it |
| Application startup file | `app.cjs` |

> ⚠️ Do not leave the path box empty — the site will return 404.

**Environment variables** (Add variable for each):

| Name | Value | Meaning |
|---|---|---|
| `BASE_PATH` | `/nusuk` | Serve under `/nusuk` |
| `HTTPS` | `1` | Secure cookies (site must use https) |
| `ADMIN_EMAIL` | your email | First administrator login |
| `ADMIN_PASSWORD` | a strong password (10+ chars) | First administrator password |
| `DATA_DIR` | `/home/<cpanel-user>/nusuk-data` | Database location (outside `public_html`) |

Click **Create**, then **Start/Restart**.

> `ADMIN_EMAIL`/`ADMIN_PASSWORD` are only read the **first time** the app starts. Change the password later in **Dashboard → Users**, not here.

### Step 4 — Fix the `.htaccess` (required on Truehost)
Truehost adds a WordPress rewrite block that sends every non-file URL to a missing `index.php`. That blocks the app's API (`/nusuk/api/...`) and gives a 404.

1. File Manager → **Settings → Show Hidden Files**.
2. Find the `.htaccess` that contains lines starting `PassengerAppRoot` (cPanel created it when you made the app — in `public_html` or `public_html/nusuk`).
3. **Copy** it first as a backup (`.htaccess.bak`).
4. Edit it and **delete only** the block shown below.

```
# BEGIN WordPress
RewriteEngine On
RewriteBase /
RewriteRule ^index\.php$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.php [L]
# END WordPress
```

Keep the Passenger lines, the HTTPS redirect and the security rules, then continue:

5. Save, then **Restart** the Node app.

### Step 5 — Verify
1. Open `https://www.<domain>/nusuk/api/health` → must show `{"ok":true}`.
2. Open `https://www.<domain>/nusuk/` (keep the trailing slash) → the site loads.
3. Open `/nusuk/#/login` → sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
4. **Immediately** change the admin password: **Dashboard → Users → Edit**.
5. Submit a test request on the Interest Form and confirm it appears in **Dashboard → Service Requests**.

---

## 4. First-time setup inside the dashboard

1. **Users** → change your password; add staff accounts if needed (`staff` cannot see Users/Settings).
2. **Settings → Platform FX rate** → enter Naira per 1 Saudi Riyal (shown in the top bar; hidden until set).
3. **Settings → Brochures / YouTube** → add the links (buttons stay disabled until filled).
4. Replace the **Privacy Policy** placeholder text before launch (`public/js/app.js`, `privacy` view).

---

## 4b. DIY Booking (hotels, HHR train, transfers)

- **Payments are manual by default.** No extra settings are needed: a client reserves a hotel, receives a slip marked *payment pending*, your team contacts them, and you click **Mark as PAID** on the order (Dashboard → DIY Orders).
- **Before clients can book hotels:** set the **Platform FX rate** (Settings) and add hotels (Dashboard → Hotel Inventory — add one by one, or bulk-upload the Excel template). Set your default **mark-up %** in Settings.
- **Uploads on shared hosting:** hotel files are stored next to the database (`nusuk-data/media` and `nusuk-data/offers`) — they are included when you back up `nusuk-data`.
- **Turning on Paystack later:** add `PAYSTACK_SECRET_KEY` (start with the `sk_test_…` key) and `PUBLIC_URL=https://www.hausaly.com/nusuk`, set the Paystack webhook to `https://www.hausaly.com/nusuk/api/paystack/webhook`, restart, then use **Settings → Check Paystack connection**. Never share screenshots showing the secret key.

---

## 5. Updating the live site (after new changes)

1. **Back up** `/home/<cpanel-user>/nusuk-data/nusuk.db` (File Manager → Download).
2. Download the new ZIP from GitHub.
3. In `/home/<cpanel-user>/nusuk` **delete**: folders `public`, `server`, `test`; files `app.cjs`, `package.json`, `README.md`, `Dockerfile`.
   **Never delete:** `tmp`, and the separate `nusuk-data` folder.
4. Upload the ZIP → Extract → Select All inside the extracted folder → **Move** to `nusuk` → delete the leftovers.
5. **Setup Node.js App → Restart.**
6. Test `/nusuk/api/health`, then hard-refresh the site (**Ctrl+Shift+R**).

*Only changed `public/` files (HTML/CSS/JS/images)?* No restart is needed — upload and hard-refresh.
*Changed anything in `server/` or `app.cjs`?* Restart the app.

---

## 6. Backups and recovery

- **Back up:** download `nusuk-data/nusuk.db` regularly (weekly, and before every update). It holds all requests, bookings, users, inventory and settings.
- **Restore:** upload the saved `nusuk.db` back into `nusuk-data/` and restart the app.
- **Lost admin password:** in File Manager, rename `nusuk-data/nusuk.db` to `nusuk.db.old`, set new `ADMIN_EMAIL`/`ADMIN_PASSWORD` variables, restart (a new empty database and admin are created). Re-import is not automatic — keep the old file for reference.

---

## 7. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `hausaly.com/nusuk/` → black **404** page | Application URL path empty, or code one folder too deep | Set path `nusuk` and Save; fix layout (section 2) |
| Page loads but login says **"Request failed"** | App not receiving API calls (WordPress rule in `.htaccess`) or app not running | Step 4; Restart; check `/api/health` |
| `/api/health` → 404 | Same as above | Step 4 |
| `/api/health` → 500/503 or "Incomplete response" | App crashed on start | Open `nusuk/stderr.log` and `nusuk/boot.log` in File Manager |
| No `boot.log` appears | cPanel is not running `app.cjs` | Check startup file name, application root, app is Started |
| Login works but you are logged out at once | `HTTPS=1` but visiting `http://` | Use `https://` |
| Old design still showing | Browser cache | **Ctrl+Shift+R** |
| `.htaccess` block comes back | Truehost regenerated it | Repeat Step 4 |
| Node version list tops out below 22 | Plan limitation | Ask the host to enable Node 22, or use a VPS |

**Diagnostic files** (in `/home/<cpanel-user>/nusuk/`):

- `boot.log` — written by `app.cjs`: startup info, errors, first 30 requests.
- `stderr.log` — written by cPanel: the app's error output.
Delete both once everything works.

**Useful checks**

- Health: `/nusuk/api/health` → `{"ok":true}`
- cPanel → **Metrics → Errors** shows recent Apache errors.

---

## 8. Security checklist

- [ ] Admin password changed from the one used at first start
- [ ] Never share screenshots showing environment-variable values (they include the password)
- [ ] `DATA_DIR` is **outside** `public_html`
- [ ] Site is served over **https** and `HTTPS=1` is set
- [ ] Staff accounts use the `staff` role, not `admin`
- [ ] Database backed up and stored off the server

---

## Appendix A — Deploying on a VPS instead (Docker)

```bash
git clone https://github.com/<owner>/Nusuk && cd Nusuk
docker build -t nusuk-consult .
docker run -d --name nusuk --restart=always -p 127.0.0.1:3000:3000 -v nusuk-data:/data \
  -e BASE_PATH=/nusuk -e HTTPS=1 -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='StrongPassword' nusuk-consult
```
Reverse-proxy `/nusuk` (path unchanged) to `127.0.0.1:3000`:

```
# Caddy
www.example.com { handle /nusuk* { reverse_proxy 127.0.0.1:3000 } }
```
```nginx
# nginx
location /nusuk/ { proxy_pass http://127.0.0.1:3000; proxy_set_header Host $host; proxy_set_header X-Forwarded-For $remote_addr; }
location = /nusuk { return 301 /nusuk/; }
```
Leave `BASE_PATH` empty to serve at the domain root or on a subdomain.

## Appendix B — Environment variable reference

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3000 | Listening port (cPanel/Passenger overrides it) |
| `DATA_DIR` | `./data` | Folder for `nusuk.db` |
| `BASE_PATH` | *(empty)* | Sub-path, e.g. `/nusuk` |
| `HTTPS` | 0 | `1` = secure cookies, trust proxy headers |
| `ADMIN_EMAIL` | admin@nusuk.com.ng | First admin email (first start only) |
| `ADMIN_PASSWORD` | *(random, printed once)* | First admin password (first start only) |
| `NOTIFY_WEBHOOK_URL` | *(empty)* | Optional JSON notification on each new request/booking |

## Appendix C — Quick reference

```
Site:        https://www.hausaly.com/nusuk/
Admin login: https://www.hausaly.com/nusuk/#/login
Health:      https://www.hausaly.com/nusuk/api/health
App root:    /home/<cpanel-user>/nusuk        startup file: app.cjs
Database:    /home/<cpanel-user>/nusuk-data/nusuk.db
Restart:     cPanel → Setup Node.js App → Restart
```
