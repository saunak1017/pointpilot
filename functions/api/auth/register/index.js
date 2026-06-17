import { createSession, hashPassword, jsonHeaders, jsonResponse, normalizeEmail, publicUser, sessionCookie } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });
  if (env.ALLOW_SIGNUPS === 'false') return jsonResponse({ error: 'Signups are disabled for this deployment.' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');

  if (!email || !email.includes('@')) return jsonResponse({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return jsonResponse({ error: 'Password must be at least 8 characters.' }, { status: 400 });

  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'An account already exists for that email.' }, { status: 409 });

  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, email, name, salt, hash, now, now).run();

  const token = await createSession(env, userId);
  return jsonResponse({ user: publicUser({ id: userId, email, name }) }, { headers: { 'Set-Cookie': sessionCookie(token) } });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
