import { clearAdminSessionCookie, getAdminSessionToken, jsonHeaders, jsonResponse } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (env.DB) {
    const token = getAdminSessionToken(request);
    if (token) await env.DB.prepare('DELETE FROM admin_sessions WHERE token = ?').bind(token).run();
  }
  return jsonResponse({ ok: true }, { headers: { 'Set-Cookie': clearAdminSessionCookie() } });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
