import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config, appSecret } from './config.js';

export const db = new DatabaseSync(path.join(config.dataDir, 'hausaly-trl.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','translator')),
  pass_hash TEXT NOT NULL,
  translator_id TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  ref TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  user_id TEXT NOT NULL,
  user_name TEXT NOT NULL,
  status TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_mime TEXT NOT NULL,
  client_ref TEXT NOT NULL DEFAULT '',
  source_lang TEXT NOT NULL DEFAULT '',
  target_lang TEXT NOT NULL,
  layout TEXT NOT NULL,
  translator_id TEXT NOT NULL DEFAULT '',
  translation_date TEXT NOT NULL DEFAULT '',
  engine TEXT NOT NULL DEFAULT '',
  doc TEXT,
  history TEXT NOT NULL DEFAULT '[]',
  pages INTEGER NOT NULL DEFAULT 0,
  revisions INTEGER NOT NULL DEFAULT 0,
  downloads INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  strict INTEGER NOT NULL DEFAULT 0,
  preferred TEXT NOT NULL DEFAULT 'auto',
  job TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tasks_created ON tasks(created_at);
CREATE TABLE IF NOT EXISTS usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts INTEGER NOT NULL,
  engine TEXT NOT NULL,
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS usage_ts ON usage(ts);
`);

export const uid = () => crypto.randomBytes(8).toString('hex');
export const nowIso = () => new Date().toISOString();

export const settings = {
  get(key, fallback = null) {
    const r = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    return r ? JSON.parse(r.value) : fallback;
  },
  set(key, value) {
    db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));
  },
};

// ---- encryption for API keys at rest (AES-256-GCM) ----
export function seal(plain) {
  if (!plain) return '';
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', appSecret(), iv);
  const enc = Buffer.concat([c.update(String(plain), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map(b => b.toString('base64')).join('.');
}
export function unseal(s) {
  if (!s) return '';
  try {
    const [iv, tag, enc] = s.split('.').map(x => Buffer.from(x, 'base64'));
    const d = crypto.createDecipheriv('aes-256-gcm', appSecret(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
  } catch { return ''; }
}
