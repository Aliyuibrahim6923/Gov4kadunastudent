// Storage: Supabase over its REST API (no SDK needed).
//
// Two ways to connect, chosen by which environment variables are set:
//  1. Public key + server secret (default setup):
//       SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, KSV_DB_SECRET
//     The table is closed to the public key; the server calls the secret-gated
//     functions ksv_insert / ksv_list from supabase/functions.sql.
//  2. Service role key:
//       SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//     The server reads and writes the table directly.
// When SUPABASE_URL is unset and we are not on Vercel, an in-memory store is used for local testing.
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const DB_SECRET = process.env.KSV_DB_SECRET || '';
const TABLE = 'responses';
const PAGE = 1000;

const memory = [];
const useMemory = !URL_ && !process.env.VERCEL;
const mode = useMemory ? 'memory' : SERVICE_KEY ? 'service' : PUBLIC_KEY && DB_SECRET ? 'rpc' : 'unconfigured';

function headers(key, extra) {
  const h = { apikey: key, 'Content-Type': 'application/json', ...extra };
  // New-style keys (sb_publishable_ / sb_secret_) go only in `apikey`; legacy JWT keys also as Bearer.
  if (key.startsWith('eyJ')) h.Authorization = 'Bearer ' + key;
  return h;
}

async function call(path, init) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, init);
  if (!res.ok) throw new Error(`Supabase ${init.method || 'GET'} ${path.split('?')[0]} failed: ${res.status} ${await res.text()}`);
  return res;
}

function notConfigured() {
  throw new Error('Supabase is not configured: set SUPABASE_URL and either SUPABASE_PUBLISHABLE_KEY + KSV_DB_SECRET or SUPABASE_SERVICE_ROLE_KEY');
}

async function insert(row) {
  if (mode === 'memory') {
    memory.push({ id: memory.length + 1, created_at: new Date().toISOString(), ...row });
    return;
  }
  if (mode === 'rpc') {
    await call('rpc/ksv_insert', {
      method: 'POST',
      headers: headers(PUBLIC_KEY, { Prefer: 'return=minimal' }),
      body: JSON.stringify({ p_secret: DB_SECRET, p_row: row })
    });
    return;
  }
  if (mode === 'service') {
    await call(TABLE, { method: 'POST', headers: headers(SERVICE_KEY, { Prefer: 'return=minimal' }), body: JSON.stringify(row) });
    return;
  }
  notConfigured();
}

// Reads every response, newest first, in pages of 1000.
async function list() {
  if (mode === 'memory') return memory.slice().reverse();
  if (mode === 'unconfigured') notConfigured();
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let rows;
    if (mode === 'rpc') {
      const res = await call('rpc/ksv_list', {
        method: 'POST',
        headers: headers(PUBLIC_KEY),
        body: JSON.stringify({ p_secret: DB_SECRET, p_limit: PAGE, p_offset: from })
      });
      rows = await res.json();
    } else {
      const res = await call(`${TABLE}?select=*&order=created_at.desc,id.desc`, {
        headers: headers(SERVICE_KEY, { Range: `${from}-${from + PAGE - 1}`, 'Range-Unit': 'items' })
      });
      rows = await res.json();
    }
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

module.exports = { insert, list, useMemory, mode };
