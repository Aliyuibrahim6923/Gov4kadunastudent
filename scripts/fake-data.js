// Fake responses for local previews only (npm run demo). Never used in production.
const C = require('../config.js');
const W = require('../data/wards.json');

function make(n, days = 30, seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const v = (o) => (typeof o === 'string' ? o : o.v);
  const some = (a, k) => a.map(v).filter(() => rnd() < k / a.length);
  const first = ['Aisha', 'Musa', 'Grace', 'Ibrahim', 'Fatima', 'John', 'Zainab', 'Daniel', 'Hauwa', 'Samuel', 'Maryam', 'Yusuf'];
  const last = ['Bello', 'Danjuma', 'Yakubu', 'Sani', 'Lawal', 'Gyang', 'Usman', 'Kure', 'Abdullahi', 'Bako', 'Garba', 'Audu'];
  const notes = ['The free buses to campus have really helped.', 'Bursary payments are always late.', 'Insecurity on the roads to campus worries us.',
    'More ICT training centres please.', 'Hostel conditions need urgent attention.', 'NELFUND verification has been stuck for months.',
    'Thank you for the scholarship scheme, please expand it.', 'Internet data support would help remote learning.'];
  // Weight some LGAs more so the map has contrast.
  const lgaW = C.LGAS.flatMap((l, i) => Array(1 + ((i * 7) % 6)).fill(l));
  const now = Date.now();
  const out = [];
  for (let i = 0; i < n; i++) {
    const lga = pick(lgaW);
    const bias = (C.LGAS.indexOf(lga) % 5) - 2; // some LGAs happier than others
    const r = () => Math.max(1, Math.min(5, Math.round(3 + bias * 0.4 + (rnd() - 0.5) * 3)));
    const pus = null;
    const row = {
      id: i + 1,
      created_at: new Date(now - Math.pow(rnd(), 1.6) * days * 864e5).toISOString(),
      name: pick(first) + ' ' + pick(last), phone: '080' + String(10000000 + i * 7919).slice(0, 8),
      whatsapp: null, email: null,
      institution: pick(C.INSTITUTIONS), level: pick(C.LEVELS), lga, ward: pick(W[lga]), pu: pus, pu_code: null,
      gender: pick(C.GENDER), age: pick(C.AGE), pvc: pick(['yes', 'yes', 'plan', 'no']), overall: r(),
      nelfund: pick(C.NELFUND).v, nelfund_reason: null, nelfund_wait: null, nelfund_issue: null, nelfund_rate: null,
      scholarship: pick(C.SCHOLARSHIP).v, other_sch: rnd() < 0.2 ? 'yes' : 'no', other_sch_name: null, other_sch_issue: null,
      transport: pick(C.TRANSPORT).v, transport_rate: null, empower: rnd() < 0.3 ? 'yes' : 'no', empower_name: null,
      commend: some(C.SECTORS, 2), commend_note: rnd() < 0.25 ? pick(notes) : null,
      shortfalls: some(C.SECTORS, 3), shortfall_note: rnd() < 0.35 ? pick(notes) : null,
      want_short: some(C.WANT_SHORT, 2), want_long: some(C.WANT_LONG, 2), incentives: some(C.INCENTIVES, 3),
      priorities: some(C.SECTORS, 3).slice(0, 3), strengthen_note: null, message: rnd() < 0.15 ? pick(notes) : null,
      volunteer: rnd() < 0.35, consent: true
    };
    C.SECTORS.forEach((x) => { row['rate_' + x.v] = rnd() < 0.15 ? null : r(); });
    if (row.nelfund === 'not_applied') row.nelfund_reason = pick(C.NELFUND_REASON).v;
    if (row.nelfund === 'waiting' || row.nelfund === 'rejected') row.nelfund_wait = pick(C.NELFUND_WAIT).v;
    if (['tuition', 'tuition_upkeep', 'waiting', 'rejected'].includes(row.nelfund)) row.nelfund_rate = r();
    if (row.transport === 'yes') row.transport_rate = r();
    if (row.empower === 'yes') row.empower_name = pick(['KADSTEP', 'Skill-Up Artisans', 'Digital Kaduna']);
    if (row.other_sch === 'yes') row.other_sch_name = pick(['PTDF', 'Agbami', 'MTN Foundation']);
    out.push(row);
  }
  return out;
}
module.exports = { make };
