import { adminSessionCookie, createAdminSession, ensureAuthSchema, jsonHeaders, jsonResponse, normalizeEmail, publicUser, verifyPassword } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });
  await ensureAuthSchema(env);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(body?.email);
  const password = String(body?.password || '');
  const admin = await env.DB.prepare(
    'SELECT id, email, name, password_salt, password_hash FROM admins WHERE email = ?'
  ).bind(email).first();
  if (!admin || !(await verifyPassword(password, admin.password_salt, admin.password_hash))) {
    return jsonResponse({ error: 'Invalid admin email or password.' }, { status: 401 });
  }
  const token = await createAdminSession(env, admin.id);
  return jsonResponse({ admin: publicUser(admin) }, { headers: { 'Set-Cookie': adminSessionCookie(token) } });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
