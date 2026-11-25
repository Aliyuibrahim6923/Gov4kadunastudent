const test = require('node:test');
const assert = require('node:assert');
const { validate } = require('../lib/validate.js');

const good = () => ({
  name: 'Garba Aliyu', phone: '08031234567', whatsapp: '', email: 'a@b.com',
  institution: 'Kaduna Polytechnic, Kaduna', level: 'HND 1', lga: 'ZARIA', ward: 'TUDUN WADA',
  pu: 'X', puCode: '18-23-01-001', gender: 'Male', age: '22-25', pvc: 'yes',
  overall: 3, ratings: { edu: 4, security: 2, roads: null, power: 9 },
  nelfund: 'not_applied', nelfundReason: 'process', nelfundWait: 'gt6', nelfundRate: 5,
  transport: 'yes', transportRate: 4, otherSch: 'no', otherSchName: 'ignored',
  commend: ['edu', 'bogus'], incentives: ['internet', 'nelfund_guide', 'made_up'], priorities: ['edu', 'jobs', 'roads', 'health'],
  volunteer: 'yes', consent: true
});

test('accepts a valid submission and normalises it', () => {
  const ward = require('../data/wards.json').ZARIA[0];
  const r = validate({ ...good(), ward });
  assert.ok(r.ok, JSON.stringify(r.errors));
  assert.equal(r.row.rate_edu, 4);
  assert.equal(r.row.rate_power, null, 'out-of-range rating dropped');
  assert.equal(r.row.nelfund_wait, null, 'wait only kept when pending');
  assert.equal(r.row.nelfund_rate, null, 'rate only kept when applied');
  assert.equal(r.row.other_sch_name, null);
  assert.deepEqual(r.row.commend, ['edu']);
  assert.deepEqual(r.row.incentives, ['internet', 'nelfund_guide'], 'unknown incentive dropped');
  assert.equal(r.row.priorities.length, 3);
  assert.equal(r.row.volunteer, true);
});

test('rejects missing required fields', () => {
  const r = validate({ name: 'One', phone: '123', consent: false });
  assert.equal(r.ok, false);
  for (const f of ['name', 'phone', 'institution', 'level', 'lga', 'ward', 'gender', 'age', 'overall', 'consent']) {
    assert.ok(r.errors.includes(f), f);
  }
});

test('ward must belong to the chosen LGA', () => {
  const r = validate({ ...good(), lga: 'ZARIA', ward: 'NOT A WARD' });
  assert.ok(r.errors.includes('ward'));
});

test('outside Kaduna State accepts a typed ward', () => {
  const r = validate({ ...good(), lga: 'Outside Kaduna State', ward: 'Wuse' });
  assert.ok(r.ok);
});

test('Other institution needs a name', () => {
  assert.ok(validate({ ...good(), institution: 'Other', institutionOther: '' }).errors.includes('institution'));
  const ward = require('../data/wards.json').ZARIA[0];
  assert.equal(validate({ ...good(), ward, institution: 'Other', institutionOther: 'NTI' }).row.institution, 'Other: NTI');
});

test('every config LGA has wards and a polling-unit file', () => {
  const C = require('../config.js');
  const W = require('../data/wards.json');
  const fs = require('fs');
  for (const l of C.LGAS) {
    assert.ok(W[l] && W[l].length, l);
    const slug = l.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    assert.ok(fs.existsSync(`${__dirname}/../data/pu/${slug}.json`), slug);
  }
});

test('store picks the right connection mode', () => {
  const { execFileSync } = require('child_process');
  const mode = (env) => execFileSync(process.execPath, ['-e', 'process.stdout.write(require("./lib/store.js").mode)'],
    { cwd: `${__dirname}/..`, env: { PATH: process.env.PATH, ...env } }).toString();
  assert.equal(mode({}), 'memory');
  assert.equal(mode({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x', KSV_DB_SECRET: 's' }), 'rpc');
  assert.equal(mode({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'k' }), 'service');
  assert.equal(mode({ VERCEL: '1' }), 'unconfigured');
});
