// POST /api/submit: store one student response.
const { validate } = require('../lib/validate.js');
const { insert } = require('../lib/store.js');
const { readJson, send } = require('../lib/http.js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return send(res, 405, { ok: false, error: 'Method not allowed' });
  }
  let body;
  try {
    body = await readJson(req);
  } catch (e) {
    return send(res, e.status || 400, { ok: false, error: 'Invalid request body' });
  }
  // Honeypot: bots fill the hidden "website" field. Pretend success, store nothing.
  if (body && typeof body.website === 'string' && body.website.trim() !== '') {
    return send(res, 200, { ok: true });
  }
  const result = validate(body);
  if (!result.ok) return send(res, 422, { ok: false, error: 'Missing or invalid fields', fields: result.errors });
  try {
    await insert({ ...result.row, raw: body });
    return send(res, 200, { ok: true });
  } catch (e) {
    console.error(e);
    return send(res, 502, { ok: false, error: 'Could not save your response. Please try again.' });
  }
};
