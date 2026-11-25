// GET /api/responses: all responses for the Directorate dashboard. Requires the admin key.
const crypto = require('crypto');
const { list, useMemory, mode } = require('../lib/store.js');
const { send } = require('../lib/http.js');

// Trimmed so a key pasted with a stray space or newline (in Vercel or the login box) still works.
const EXPECTED = (process.env.ADMIN_KEY || (useMemory ? 'dev-admin-key' : '')).trim();

function keyMatches(given) {
  const expected = EXPECTED;
  if (typeof given === 'string') given = given.trim();
  if (!expected || typeof given !== 'string' || !given) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function explain(e) {
  const m = String((e && e.message) || '');
  if (mode === 'unconfigured' || /not configured/.test(m)) {
    const missing = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'KSV_DB_SECRET'].filter((k) => !process.env[k]);
    return 'The database is not connected: missing in Vercel: ' + (missing.join(', ') || 'database settings') + '. Add them under Settings > Environment Variables, then redeploy.';
  }
  if (/forbidden|42501/.test(m)) return 'The database refused the server secret: KSV_DB_SECRET in Vercel does not match. Check it, then redeploy.';
  if (/ 401 | 403 |Invalid API key|No API key/i.test(m)) return 'The database refused the API key: check SUPABASE_PUBLISHABLE_KEY in Vercel, then redeploy.';
  if (/ENOTFOUND|fetch failed|getaddrinfo/i.test(m)) return 'The database address could not be reached: check SUPABASE_URL in Vercel, then redeploy.';
  return 'Database error. Check the function logs in Vercel.';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }
  if (!EXPECTED) {
    return send(res, 503, { ok: false, error: 'The dashboard is not set up yet: ADMIN_KEY is missing on the server. Add it in Vercel (Settings > Environment Variables), then redeploy.' });
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
    // Only reached with a valid admin key, so it is safe to say what is wrong (never secret values).
    return send(res, 502, { ok: false, error: 'Could not load responses. ' + explain(e) });
  }
};
