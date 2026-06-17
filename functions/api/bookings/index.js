import { jsonHeaders, jsonResponse, requireUser } from '../_auth.js';

function normalizeStoredBooking(row) {
  return {
    ...JSON.parse(row.payload),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function onRequestGet({ request, env }) {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const { results } = await env.DB.prepare(
    'SELECT id, payload, created_at, updated_at FROM bookings WHERE user_id = ? ORDER BY updated_at DESC, created_at DESC'
  ).bind(user.id).all();

  return jsonResponse({ bookings: results.map(normalizeStoredBooking) });
}

export async function onRequestPut({ request, env }) {
  const user = await requireUser(request, env);
  if (user instanceof Response) return user;

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.bookings)) {
    return jsonResponse({ error: 'Expected a JSON body with a bookings array.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const statements = [env.DB.prepare('DELETE FROM bookings WHERE user_id = ?').bind(user.id)];

  body.bookings.forEach((booking) => {
    if (!booking || typeof booking !== 'object' || !booking.id) return;
    const createdAt = booking.createdAt || now;
    const updatedAt = booking.updatedAt || now;
    statements.push(
      env.DB.prepare(
        'INSERT INTO bookings (id, user_id, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).bind(booking.id, user.id, JSON.stringify({ ...booking, createdAt, updatedAt }), createdAt, updatedAt)
    );
  });

  await env.DB.batch(statements);
  return jsonResponse({ ok: true, saved: Math.max(statements.length - 1, 0) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
