import fs from 'node:fs';
import path from 'node:path';
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

// Bump on every release: it versions the static files (cache-busting) and shows in the footer + /api/health.
export const BUILD = '20261009a';

export const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: path.resolve(ROOT, process.env.DATA_DIR || 'data'),
  publicDir: path.join(ROOT, 'public'),
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@nusuk.com.ng').trim().toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Mount point when served under a sub-path, e.g. BASE_PATH=/nusuk  (empty = site root)
  basePath: ('/' + (process.env.BASE_PATH || '').replace(/^\/+|\/+$/g, '')).replace(/^\/$/, ''),
  https: process.env.HTTPS === '1',
  webhook: process.env.NOTIFY_WEBHOOK_URL || '',
};
