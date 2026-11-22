# Hausaly EduTravels Ltd — Translation Desk (`/trl`)

Upload a PDF or image → text is read (AI vision/OCR), the source language is detected, the document is translated to **Arabic or English** and placed on your branded certified-translation page → preview, correct, approve → download **PDF** and **Word**. Every task is logged in Records.

Zero npm dependencies. Needs **Node.js ≥ 22.13** (built-in SQLite). Same hosting pattern as the Nusuk app.

## Run locally
```bash
cp .env.example .env     # set ADMIN_PASSWORD, BASE_PATH= (empty for local)
npm start                # http://localhost:3100/
npm test
```

## Deploy at www.hausaly.com/trl (cPanel → Setup Node.js App)
1. Upload this `translator/` folder (e.g. to `~/trl-app`). Do not put it inside `public_html`.
2. Create the app: Node ≥ 22.13, **Application URL** `hausaly.com/trl`, **Startup file** `app.cjs`.
3. Environment variables: `BASE_PATH=/trl`, `HTTPS=1`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DATA_DIR=/home/<cpanel-user>/trl-data`, optionally `APP_SECRET`.
4. Restart the app, open `https://www.hausaly.com/trl/`, sign in, change the password under **Account**.
5. Admin → **AI Engines**: paste keys, press *Test connection*.
Back up the `DATA_DIR` folder (database + artwork). If it fails to start, read `boot.log` next to `app.cjs`.

## AI engines and the "free" question
Engines: **Gemini**, **ChatGPT (OpenAI)**, **Claude (Anthropic)**, tried in the priority order set in Admin. When one hits its quota/rate limit, is overloaded, or its key is rejected, it rests for a while and the next engine takes over automatically (users are told). *Auto* or a chosen engine, with an optional "never switch" switch.
- **Gemini** has a genuine free API tier (key from aistudio.google.com/apikey) — use it first.
- OpenAI/Anthropic **API keys are billed separately** from ChatGPT/Claude.ai accounts; they have no ongoing free tier. Leave them empty if you want strictly zero cost, or use the OpenAI *Base URL* field for any OpenAI-compatible provider that offers a free tier.
- Model names are editable (Admin → AI Engines) because providers retire models.

## Your template / logo
The header, footer band and stamp were cut from your PDF (`public/img`). Replace them any time under Admin → **Branding & layouts → Artwork** (PNG with transparent background). Header text, registered line, contact line, ID prefix, default layout and digit style are editable there too. Translator ID and date are per translation (translator ID prefilled from the user's profile).

## Notes
- PDF download is rendered from the exact preview (image-based, high resolution, always correct Arabic shaping). *Print / Save as vector PDF* gives selectable text via the browser.
- Word: Arabic is right-to-left; the framed body is a page border (Word draws it around the text area; LibreOffice around the whole page). Cream paper tint is preview/PDF only.
- Uploaded originals are deleted when a translation is approved (or after 7 days for abandoned drafts).
- Limits: 10 MB, 12 pages per file (`MAX_UPLOAD_MB`, `MAX_PAGES`). Long documents are translated in one pass.
- Always have a qualified person review before certifying — AI can misread handwriting and stamps.
