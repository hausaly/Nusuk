import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency); real environment variables win.
try {
  for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !line.trim().startsWith('#') && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
} catch {}

// Bump on every release: versions the static files (cache-busting) and shows in the footer + /api/health.
export const BUILD = '20261122a';

export const config = {
  port: Number(process.env.PORT) || 3100,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  publicDir: path.join(ROOT, 'public'),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@hausaly.com').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Mount point, e.g. BASE_PATH=/trl for https://www.hausaly.com/trl  (empty = site root)
  basePath: ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, ''),
  https: process.env.HTTPS === '1',
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB) || 15,
  maxPages: Number(process.env.MAX_PAGES) || 12,
  // Overridable so the engines can be pointed at a test double (see test/).
  endpoints: {
    gemini: process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta',
    openai: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    claude: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com/v1',
  },
};

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'assets'), { recursive: true });

/** Secret used to encrypt API keys stored in the database. APP_SECRET wins; otherwise a random one lives in DATA_DIR. */
export function appSecret() {
  if (process.env.APP_SECRET) return crypto.createHash('sha256').update(process.env.APP_SECRET).digest();
  const f = path.join(config.dataDir, '.secret');
  try { return Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'hex'); } catch {}
  const s = crypto.randomBytes(32);
  fs.writeFileSync(f, s.toString('hex'), { mode: 0o600 });
  return s;
}
