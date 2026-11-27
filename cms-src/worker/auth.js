// Authentication: PBKDF2 password hashing + D1-backed sessions.
// No passwords or keys ever appear in front-end code.

const enc = new TextEncoder();

function toHex(buf) {
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function hashPassword(password, saltHex) {
  const salt = saltHex
    ? new Uint8Array(saltHex.match(/.{2}/g).map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256);
  return { hash: toHex(bits), salt: toHex(salt) };
}

export async function verifyPassword(password, saltHex, expectedHash) {
  const { hash } = await hashPassword(password, saltHex);
  // constant-time-ish comparison
  if (hash.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

export async function createSession(db, adminId) {
  const token = crypto.randomUUID() + crypto.randomUUID().replace(/-/g, '');
  const expires = new Date(Date.now() + 7 * 86400e3).toISOString();
  await db.prepare('INSERT INTO sessions (token, admin_id, expires_at) VALUES (?,?,?)')
    .bind(token, adminId, expires).run();
  return { token, expires };
}

export function sessionCookie(token, expires) {
  return `huayi_admin=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Expires=${new Date(expires).toUTCString()}`;
}

export function clearCookie() {
  return 'huayi_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0';
}

// Returns the admin row or null.
export async function currentAdmin(request, db) {
  const { getCookie } = await import('./util.js');
  const token = getCookie(request, 'huayi_admin');
  if (!token) return null;
  const row = await db.prepare(
    `SELECT a.id, a.username FROM sessions s JOIN admins a ON a.id = s.admin_id
     WHERE s.token = ? AND s.expires_at > datetime('now')`).bind(token).first();
  return row || null;
}

export async function destroySession(db, request) {
  const { getCookie } = await import('./util.js');
  const token = getCookie(request, 'huayi_admin');
  if (token) await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
}
