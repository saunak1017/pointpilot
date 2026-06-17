import { getAuthenticatedUser, jsonHeaders, jsonResponse, publicUser } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return jsonResponse({ authAvailable: false, user: null }, { status: 503 });
  const user = await getAuthenticatedUser(request, env);
  return jsonResponse({ authAvailable: true, user: publicUser(user) }, { status: user ? 200 : 401 });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
