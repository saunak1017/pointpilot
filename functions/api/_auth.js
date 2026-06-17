const SESSION_COOKIE = 'pp_session';
const ADMIN_SESSION_COOKIE = 'pp_admin_session';
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;
const PASSWORD_ITERATIONS = 210000;

export const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

export function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) }
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function timingSafeEqual(a, b) {
  const aBytes = base64ToBytes(a);
  const bBytes = base64ToBytes(b);
  if (aBytes.length !== bBytes.length) return false;
  let diff = 0;
  aBytes.forEach((byte, index) => {
    diff |= byte ^ bBytes[index];
  });
  return diff === 0;
}

async function ignoreDuplicateColumn(work) {
  try {
    await work();
  } catch (err) {
    if (!/duplicate column|already exists/i.test(err.message || '')) throw err;
  }
}

export async function ensureAuthSchema(env) {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name TEXT,
      password_salt TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS admin_sessions (
      token TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TEXT NOT NULL
    )`),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_admin_id ON admin_sessions(admin_id)'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_admin_sessions_expires_at ON admin_sessions(expires_at)')
  ]);
}

export async function ensureBookingsSchema(env) {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS bookings (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL CHECK (json_valid(payload)),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  )`).run();
  await ignoreDuplicateColumn(() => env.DB.prepare('ALTER TABLE bookings ADD COLUMN user_id TEXT').run());
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_bookings_user_updated_at ON bookings(user_id, updated_at DESC)').run();
}

export async function ensureAppSchema(env) {
  await ensureAuthSchema(env);
  await ensureBookingsSchema(env);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name || ''
  };
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PASSWORD_ITERATIONS },
    keyMaterial,
    256
  );
  return {
    salt: bytesToBase64(salt),
    hash: bytesToBase64(new Uint8Array(bits))
  };
}

export async function verifyPassword(password, salt, expectedHash) {
  const { hash } = await hashPassword(password, base64ToBytes(salt));
  return timingSafeEqual(hash, expectedHash);
}

export function getSessionToken(request, cookieName = SESSION_COOKIE) {
  const cookie = request.headers.get('Cookie') || '';
  return cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${cookieName}=`))
    ?.slice(cookieName.length + 1) || '';
}

export function sessionCookie(token, cookieName = SESSION_COOKIE) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

export function clearSessionCookie(cookieName = SESSION_COOKIE) {
  return `${cookieName}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export async function createSession(env, userId) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, userId, now.toISOString(), expiresAt).run();
  return token;
}

export async function createAdminSession(env, adminId) {
  const token = crypto.randomUUID();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + SESSION_MAX_AGE_SECONDS * 1000).toISOString();
  await env.DB.prepare(
    'INSERT INTO admin_sessions (token, admin_id, created_at, expires_at) VALUES (?, ?, ?, ?)'
  ).bind(token, adminId, now.toISOString(), expiresAt).run();
  return token;
}

export function adminSessionCookie(token) {
  return sessionCookie(token, ADMIN_SESSION_COOKIE);
}

export function clearAdminSessionCookie() {
  return clearSessionCookie(ADMIN_SESSION_COOKIE);
}

export function getAdminSessionToken(request) {
  return getSessionToken(request, ADMIN_SESSION_COOKIE);
}

export async function getAuthenticatedAdmin(request, env) {
  if (!env.DB) return null;
  await ensureAuthSchema(env);
  const token = getAdminSessionToken(request);
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT admins.id, admins.email, admins.name
     FROM admin_sessions
     JOIN admins ON admins.id = admin_sessions.admin_id
     WHERE admin_sessions.token = ? AND admin_sessions.expires_at > ?`
  ).bind(token, now).first();
  return row || null;
}

export async function requireAdmin(request, env) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });
  await ensureAuthSchema(env);
  const admin = await getAuthenticatedAdmin(request, env);
  if (!admin) return jsonResponse({ error: 'Admin sign in required.' }, { status: 401 });
  return admin;
}

export async function getAuthenticatedUser(request, env) {
  if (!env.DB) return null;
  await ensureAuthSchema(env);
  const token = getSessionToken(request);
  if (!token) return null;
  const now = new Date().toISOString();
  const row = await env.DB.prepare(
    `SELECT users.id, users.email, users.name
     FROM sessions
     JOIN users ON users.id = sessions.user_id
     WHERE sessions.token = ? AND sessions.expires_at > ?`
  ).bind(token, now).first();
  return row || null;
}

export async function requireUser(request, env) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });
  await ensureAppSchema(env);
  const user = await getAuthenticatedUser(request, env);
  if (!user) return jsonResponse({ error: 'Sign in required.' }, { status: 401 });
  return user;
}
