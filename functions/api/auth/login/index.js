import { createSession, ensureAuthSchema, jsonHeaders, jsonResponse, normalizeEmail, publicUser, sessionCookie, verifyPassword } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });

  try {
    await ensureAuthSchema(env);
    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const password = String(body?.password || '');
    const user = await env.DB.prepare(
      'SELECT id, email, name, password_salt, password_hash FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
      return jsonResponse({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const token = await createSession(env, user.id);
    return jsonResponse({ user: publicUser(user) }, { headers: { 'Set-Cookie': sessionCookie(token) } });
  } catch (err) {
    return jsonResponse({ error: 'Sign in failed. Automatic D1 schema check could not finish.', detail: err.message }, { status: 500 });
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
