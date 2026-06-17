import { ensureAuthSchema, getAuthenticatedUser, jsonHeaders, jsonResponse, publicUser } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return jsonResponse({ authAvailable: false, user: null }, { status: 503 });
  try {
    await ensureAuthSchema(env);
    const user = await getAuthenticatedUser(request, env);
    return jsonResponse({ authAvailable: true, user: publicUser(user) });
  } catch (err) {
    return jsonResponse({ authAvailable: false, user: null, error: 'Account tables are unavailable and automatic setup failed.', detail: err.message }, { status: 503 });
  }
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
