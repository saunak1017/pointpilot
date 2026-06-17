import { ensureAuthSchema, hashPassword, jsonHeaders, jsonResponse, normalizeEmail, publicUser, requireAdmin } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  const { results } = await env.DB.prepare('SELECT id, email, name, created_at FROM users ORDER BY created_at DESC').all();
  return jsonResponse({ users: results.map(publicUser) });
}

export async function onRequestPost({ request, env }) {
  const admin = await requireAdmin(request, env);
  if (admin instanceof Response) return admin;
  await ensureAuthSchema(env);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const name = String(body?.name || '').trim();
  const password = String(body?.password || '');
  if (!email || !email.includes('@')) return jsonResponse({ error: 'Enter a valid email address.' }, { status: 400 });
  if (password.length < 8) return jsonResponse({ error: 'User password must be at least 8 characters.' }, { status: 400 });
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
  if (existing) return jsonResponse({ error: 'A user already exists for that email.' }, { status: 409 });
  const now = new Date().toISOString();
  const userId = crypto.randomUUID();
  const { salt, hash } = await hashPassword(password);
  await env.DB.prepare(
    'INSERT INTO users (id, email, name, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, email, name, salt, hash, now, now).run();
  return jsonResponse({ user: publicUser({ id: userId, email, name }) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
