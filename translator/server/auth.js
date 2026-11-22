import crypto from 'node:crypto';
import { db, uid, nowIso } from './db.js';
import { config } from './config.js';

const SESSION_MS = 1000 * 60 * 60 * 12;

export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  return `scrypt$${salt.toString('hex')}$${crypto.scryptSync(pw, salt, 64).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, salt, hash] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const key = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(hash, 'hex'));
}
export const publicUser = u => u && { id: u.id, name: u.name, email: u.email, role: u.role, translatorId: u.translator_id, active: !!u.active, createdAt: u.created_at };

export function createUser({ name, email, role, password, translatorId = '' }) {
  const id = uid();
  db.prepare('INSERT INTO users (id,name,email,role,pass_hash,translator_id,active,created_at) VALUES (?,?,?,?,?,?,1,?)')
    .run(id, name, email.toLowerCase(), role, hashPassword(password), translatorId, nowIso());
  return id;
}

/** Create the first administrator if no users exist. */
export function bootstrapAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  const generated = !config.adminPassword;
  const password = config.adminPassword || crypto.randomBytes(9).toString('base64url');
  createUser({ name: 'Administrator', email: config.adminEmail, role: 'admin', password, translatorId: 'HET/T001' });
  console.log(`\n  First-run admin created\n    email:    ${config.adminEmail}\n    password: ${generated ? password + '   (generated — change it in Admin → Users)' : '(from ADMIN_PASSWORD)'}\n`);
}

const DUMMY_HASH = hashPassword('hausaly-dummy');
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

export function login(email, password) {
  const u = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim().toLowerCase());
  // Unknown email: still run scrypt so response time doesn't reveal which emails exist.
  const ok = verifyPassword(String(password), u ? u.pass_hash : DUMMY_HASH) && !!u && !!u.active;
  if (!ok) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(sha(token), u.id, Date.now() + SESSION_MS);
  return { token, user: publicUser(u) };
}
export function logout(token) { if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token)); }
export function userFromToken(token) {
  if (!token) return null;
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  const row = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND u.active = 1').get(sha(token));
  return publicUser(row) || null;
}
export const dropSessions = userId => db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
export const sessionMaxAge = SESSION_MS / 1000;
