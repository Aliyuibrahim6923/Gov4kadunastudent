// Storage: Supabase (PostgREST over fetch, no SDK needed).
// When SUPABASE_URL is unset and we are not on Vercel, an in-memory store is used for local testing.
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const TABLE = 'responses';

const memory = [];
const useMemory = !URL_ && !process.env.VERCEL;

function headers(extra) {
  return { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', ...extra };
}

async function insert(row) {
  if (useMemory) {
    memory.push({ id: memory.length + 1, created_at: new Date().toISOString(), ...row });
    return;
  }
  if (!URL_ || !KEY) throw new Error('Supabase is not configured');
  const res = await fetch(`${URL_}/rest/v1/${TABLE}`, {
    method: 'POST',
    headers: headers({ Prefer: 'return=minimal' }),
    body: JSON.stringify(row)
  });
  if (!res.ok) throw new Error(`Supabase insert failed: ${res.status} ${await res.text()}`);
}

// Reads every response, newest first, in pages of 1000.
async function list() {
  if (useMemory) return memory.slice().reverse();
  if (!URL_ || !KEY) throw new Error('Supabase is not configured');
  const page = 1000;
  const out = [];
  for (let from = 0; ; from += page) {
    const res = await fetch(`${URL_}/rest/v1/${TABLE}?select=*&order=created_at.desc`, {
      headers: headers({ Range: `${from}-${from + page - 1}`, 'Range-Unit': 'items' })
    });
    if (!res.ok) throw new Error(`Supabase read failed: ${res.status} ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < page) break;
  }
  return out;
}

module.exports = { insert, list, useMemory };
