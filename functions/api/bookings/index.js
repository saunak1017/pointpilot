const jsonHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store'
};

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...jsonHeaders, ...(init.headers || {}) }
  });
}

function normalizeStoredBooking(row) {
  return {
    ...JSON.parse(row.payload),
    id: row.id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function onRequestGet({ env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });

  const { results } = await env.DB.prepare(
    'SELECT id, payload, created_at, updated_at FROM bookings ORDER BY updated_at DESC, created_at DESC'
  ).all();

  return jsonResponse({ bookings: results.map(normalizeStoredBooking) });
}

export async function onRequestPut({ request, env }) {
  if (!env.DB) return jsonResponse({ error: 'D1 binding DB is not configured.' }, { status: 503 });

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.bookings)) {
    return jsonResponse({ error: 'Expected a JSON body with a bookings array.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const statements = [env.DB.prepare('DELETE FROM bookings')];

  body.bookings.forEach((booking) => {
    if (!booking || typeof booking !== 'object' || !booking.id) return;
    const createdAt = booking.createdAt || now;
    const updatedAt = booking.updatedAt || now;
    statements.push(
      env.DB.prepare(
        'INSERT INTO bookings (id, payload, created_at, updated_at) VALUES (?, ?, ?, ?)'
      ).bind(booking.id, JSON.stringify({ ...booking, createdAt, updatedAt }), createdAt, updatedAt)
    );
  });

  await env.DB.batch(statements);
  return jsonResponse({ ok: true, saved: Math.max(statements.length - 1, 0) });
}

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: jsonHeaders });
}
