import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

fs.mkdirSync(config.dataDir, { recursive: true });
export const db = new DatabaseSync(path.join(config.dataDir, 'nusuk.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS records (
  id TEXT PRIMARY KEY,
  collection TEXT NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_coll ON records(collection, created_at);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('admin','staff')),
  pass_hash TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
`);

export const uid = () => crypto.randomBytes(8).toString('hex');
const now = () => new Date().toISOString();

export const records = {
  list(collection) {
    return db.prepare('SELECT * FROM records WHERE collection = ? ORDER BY created_at DESC').all(collection)
      .map(r => ({ id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, ...JSON.parse(r.data) }));
  },
  get(collection, id) {
    const r = db.prepare('SELECT * FROM records WHERE collection = ? AND id = ?').get(collection, id);
    return r && { id: r.id, createdAt: r.created_at, updatedAt: r.updated_at, ...JSON.parse(r.data) };
  },
  create(collection, data) {
    const id = uid(), t = now();
    db.prepare('INSERT INTO records VALUES (?,?,?,?,?)').run(id, collection, JSON.stringify(data), t, t);
    return this.get(collection, id);
  },
  update(collection, id, patch) {
    const cur = this.get(collection, id);
    if (!cur) return null;
    const { id: _i, createdAt: _c, updatedAt: _u, ...rest } = cur;
    db.prepare('UPDATE records SET data = ?, updated_at = ? WHERE collection = ? AND id = ?')
      .run(JSON.stringify({ ...rest, ...patch }), now(), collection, id);
    return this.get(collection, id);
  },
  remove(collection, id) {
    return db.prepare('DELETE FROM records WHERE collection = ? AND id = ?').run(collection, id).changes > 0;
  },
  count(collection) {
    return db.prepare('SELECT COUNT(*) n FROM records WHERE collection = ?').get(collection).n;
  },
};

export const settings = {
  all() {
    return Object.fromEntries(db.prepare('SELECT key, value FROM settings').all().map(r => [r.key, JSON.parse(r.value)]));
  },
  set(key, value) {
    db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value));
  },
};
