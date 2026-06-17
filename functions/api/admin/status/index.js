import { ensureAuthSchema, getAuthenticatedAdmin, jsonHeaders, jsonResponse, publicUser } from '../../_auth.js';

export async function onRequestGet({ request, env }) {
  if (!env.DB) return jsonResponse({ authAvailable: false, hasAdmin: false, admin: null }, { status: 503 });
  await ensureAuthSchema(env);
  const adminCount = await env.DB.prepare('SELECT COUNT(*) AS count FROM admins').first();
  const admin = await getAuthenticatedAdmin(request, env);
  return jsonResponse({ authAvailable: true, hasAdmin: Number(adminCount?.count || 0) > 0, admin: publicUser(admin) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
