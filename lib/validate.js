// Server-side validation and normalisation of a form submission.
// Returns { ok: true, row } ready for the Supabase `responses` table, or { ok: false, errors }.
const C = require('../config.js');
const WARDS = require('../data/wards.json');

const PHONE_RE = /^\+?\d{10,18}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const vals = (list) => list.map((o) => (typeof o === 'string' ? o : o.v));
const SECTOR_KEYS = vals(C.SECTORS);

function text(v, max) {
  if (v === undefined || v === null) return '';
  return String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim().slice(0, max);
}
function phone(v) {
  return text(v, 30).replace(/[\s\-().]/g, '');
}
function oneOf(v, list) {
  const s = text(v, 200);
  return vals(list).includes(s) ? s : '';
}
function manyOf(v, list, max) {
  if (!Array.isArray(v)) return [];
  const allowed = vals(list);
  const out = [...new Set(v.map((x) => text(x, 40)).filter((x) => allowed.includes(x)))];
  return max ? out.slice(0, max) : out;
}
function rating(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : null;
}

function validate(body) {
  const b = body && typeof body === 'object' ? body : {};
  const errors = [];
  const { short, mid, long } = C.CAPS;

  const name = text(b.name, short).replace(/\s+/g, ' ');
  if (name.split(' ').filter((w) => w.length > 0).length < 2) errors.push('name');

  const ph = phone(b.phone);
  if (!PHONE_RE.test(ph)) errors.push('phone');
  const wa = phone(b.whatsapp);
  if (wa && !PHONE_RE.test(wa)) errors.push('whatsapp');
  const email = text(b.email, mid).toLowerCase();
  if (email && !EMAIL_RE.test(email)) errors.push('email');

  let institution = text(b.institution, mid);
  if (institution === 'Other') {
    const other = text(b.institutionOther, mid);
    institution = other.length >= 2 ? 'Other: ' + other : '';
  } else if (!C.INSTITUTIONS.includes(institution)) institution = '';
  if (!institution) errors.push('institution');

  const level = oneOf(b.level, C.LEVELS);
  if (!level) errors.push('level');

  const lga = text(b.lga, short);
  const inKaduna = C.LGAS.includes(lga);
  if (!inKaduna && lga !== C.OUTSIDE_LGA) errors.push('lga');

  const ward = text(b.ward, short);
  if (inKaduna ? !(WARDS[lga] || []).includes(ward) : ward.length < 2) errors.push('ward');

  const pu = text(b.pu, mid);
  const puCode = /^\d{2}-\d{2}-\d{2}-\d{3}$/.test(text(b.puCode, 20)) ? text(b.puCode, 20) : '';

  const gender = oneOf(b.gender, C.GENDER);
  if (!gender) errors.push('gender');
  const age = oneOf(b.age, C.AGE);
  if (!age) errors.push('age');
  const pvc = oneOf(b.pvc, C.PVC);

  const overall = rating(b.overall);
  if (!overall) errors.push('overall');

  const ratings = {};
  const r = b.ratings && typeof b.ratings === 'object' ? b.ratings : {};
  for (const k of SECTOR_KEYS) ratings['rate_' + k] = rating(r[k]);

  const nelfund = oneOf(b.nelfund, C.NELFUND);
  const nelfundApplied = ['tuition', 'tuition_upkeep', 'waiting', 'rejected'].includes(nelfund);
  const nelfundPending = ['waiting', 'rejected'].includes(nelfund);

  const otherSch = oneOf(b.otherSch, C.YESNO);
  const transport = oneOf(b.transport, C.TRANSPORT);
  const empower = oneOf(b.empower, C.YESNO);

  const priorities = manyOf(b.priorities, C.SECTORS, C.MAX_PRIORITIES);

  if (b.consent !== true) errors.push('consent');

  if (errors.length) return { ok: false, errors };

  const row = {
    name,
    phone: ph,
    whatsapp: wa || null,
    email: email || null,
    institution,
    level,
    lga,
    ward,
    pu: pu || null,
    pu_code: puCode || null,
    gender,
    age,
    pvc: pvc || null,
    overall,
    ...ratings,
    nelfund: nelfund || null,
    nelfund_reason: nelfund === 'not_applied' ? oneOf(b.nelfundReason, C.NELFUND_REASON) || null : null,
    nelfund_wait: nelfundPending ? oneOf(b.nelfundWait, C.NELFUND_WAIT) || null : null,
    nelfund_issue: nelfundPending ? text(b.nelfundIssue, long) || null : null,
    nelfund_rate: nelfundApplied ? rating(b.nelfundRate) : null,
    scholarship: oneOf(b.scholarship, C.SCHOLARSHIP) || null,
    other_sch: otherSch || null,
    other_sch_name: otherSch === 'yes' ? text(b.otherSchName, mid) || null : null,
    other_sch_issue: otherSch === 'yes' ? text(b.otherSchIssue, long) || null : null,
    transport: transport || null,
    transport_rate: transport === 'yes' ? rating(b.transportRate) : null,
    empower: empower || null,
    empower_name: empower === 'yes' ? text(b.empowerName, mid) || null : null,
    commend: manyOf(b.commend, C.SECTORS),
    commend_note: text(b.commendNote, long) || null,
    shortfalls: manyOf(b.shortfalls, C.SECTORS),
    shortfall_note: text(b.shortfallNote, long) || null,
    want_short: manyOf(b.wantShort, C.WANT_SHORT),
    want_long: manyOf(b.wantLong, C.WANT_LONG),
    incentives: manyOf(b.incentives, C.INCENTIVES),
    priorities,
    strengthen_note: text(b.strengthenNote, long) || null,
    message: text(b.message, long) || null,
    volunteer: b.volunteer === 'yes',
    consent: true
  };
  return { ok: true, row };
}

module.exports = { validate, SECTOR_KEYS };
