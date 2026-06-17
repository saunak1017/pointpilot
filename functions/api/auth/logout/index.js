import { clearSessionCookie, getSessionToken, jsonHeaders, jsonResponse } from '../../_auth.js';

export async function onRequestPost({ request, env }) {
  if (env.DB) {
    const token = getSessionToken(request);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
  }
  return jsonResponse({ ok: true }, { headers: { 'Set-Cookie': clearSessionCookie() } });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
