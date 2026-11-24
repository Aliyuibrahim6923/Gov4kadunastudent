// GET /api/responses: all responses for the Directorate dashboard. Requires the admin key.
const crypto = require('crypto');
const { list, useMemory } = require('../lib/store.js');
const { send } = require('../lib/http.js');

function keyMatches(given) {
  const expected = process.env.ADMIN_KEY || (useMemory ? 'dev-admin-key' : '');
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!keyMatches(req.headers['x-admin-key'])) {
    // Small delay to slow down key guessing.
    await new Promise((r) => setTimeout(r, 400));
    return send(res, 401, { ok: false, error: 'Invalid admin key' });
  }
  try {
    const rows = await list();
    rows.forEach((r) => delete r.raw);
    return send(res, 200, { ok: true, rows });
  } catch (e) {
    console.error(e);
    return send(res, 502, { ok: false, error: 'Could not load responses' });
  }
};
