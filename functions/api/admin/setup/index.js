import { adminSessionCookie, createAdminSession, ensureAuthSchema, hashPassword, jsonHeaders, jsonResponse, normalizeEmail, publicUser } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });

  try {
    await ensureAuthSchema(env);
    const adminCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
    if (Number(adminCount?.count || 0) > 0) return jsonResponse({ error: 'Admin account already exists. Sign in instead.' }, { status: 409 });

    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const name = String(body?.name || 'Admin').trim();
    const password = String(body?.password || '');
    if (!email || !email.includes('@')) return jsonResponse({ error: 'Enter a valid email address.' }, { status: 400 });
    if (password.length < 10) return jsonResponse({ error: 'Admin password must be at least 10 characters.' }, { status: 400 });

    const now = new Date().toISOString();
    const adminId = crypto.randomUUID();
    const { salt, hash } = await hashPassword(password);
    await env.DB.prepare(
      'INSERT INTO admins (id, email, name, password_salt, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).bind(adminId, email, name, salt, hash, now, now).run();

    const token = await createAdminSession(env, adminId);
    return jsonResponse({ admin: publicUser({ id: adminId, email, name }) }, { headers: { 'Set-Cookie': adminSessionCookie(token) } });
  } catch (err) {
    return jsonResponse({ error: 'Admin setup failed while checking or updating the D1 auth schema.', detail: err.message }, { status: 500 });
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
