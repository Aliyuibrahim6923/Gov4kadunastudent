# Kaduna Student Voice

A mobile web app for tertiary students across Kaduna State to give structured feedback on the state administration: what to commend, which shortfalls to fix and where to strengthen. The Directorate of Student Mobilization views the results on a protected dashboard.

- **Landing page:** `/` (the Directorate's commitment, the Governor and President, the sponsor below them, and the sponsor's message)
- **Student form:** `/feedback` (four steps, about 5 minutes, works on a 360 px phone)
- **Directorate dashboard:** `/dashboard` (admin key required), with four tabs:
  - **Overview:** headline figures (net satisfaction, PVC, volunteers, coverage), responses over time, sector ratings, an LGA × sector heatmap, programmes, incentives, demographics.
  - **Map:** Kaduna's 23 LGAs shaded by responses, ratings, net satisfaction, PVC share, volunteers or any one sector. Click an LGA to see all its wards, including wards with no responses yet.
  - **Responses:** searchable, sortable, paged data table with quick filters and a full-detail panel for each response (call and WhatsApp links).
  - **Comments:** every written comment, searchable and filterable by type.
  Filters (date range, institution, LGA, ward, gender, level) apply to every tab.
- **Stack:** static HTML/CSS/JS on **Vercel**, two Vercel serverless functions, a **Supabase** Postgres table. No framework and no npm dependencies.

```
index.html          landing page
feedback.html       student form
assets/people/      portraits on the landing page (governor, sponsor, president)
dashboard.html      Directorate dashboard page
dashboard.js        dashboard logic: filters, charts, map, table (no external libraries)
dashboard.css       dashboard styles
data/kaduna-lgas.json  LGA boundaries for the map (geoBoundaries, CC BY 4.0)
config.js           editable lists: institutions, levels, LGAs, sectors, options
styles.css          APC theme (green, white, sky blue), light and dark
data/wards.json     23 LGAs -> 255 wards (from the INEC polling-unit list)
data/pu/<lga>.json  ward -> polling units [code, name], 8,012 in total, loaded on demand
api/submit.js       POST: validate and store one response
api/responses.js    GET: all responses, only with the admin key
lib/                validation, Supabase storage, HTTP helpers
supabase/schema.sql table, indexes, row-level security, duplicate-phone view
supabase/functions.sql secret-gated insert/list functions used by the server
scripts/            local dev server, ward/PU data builder
tests/              validation tests
```

## Setup

### 1. Supabase
The live database is the Supabase project **kaduna-student-voice** (London region). It is already set up: `supabase/schema.sql` and `supabase/functions.sql` have been applied.

For a fresh project: run `supabase/schema.sql`, then `supabase/functions.sql` (replace the placeholder with the SHA-256 of your `KSV_DB_SECRET`, as the file explains), in **SQL Editor**.

How access works:
- Row-level security is on and the table has no policies, so the public key cannot read or write it directly.
- The server calls two functions, `ksv_insert` and `ksv_list`. They refuse any call that does not carry `KSV_DB_SECRET`. The database stores only the secret's SHA-256 hash.
- Supabase's security advisor flags these two functions as callable with the public key. That is intended: without the secret they do nothing.

### 2. Vercel
1. Import this GitHub repository in Vercel. Framework preset: **Other**. No build command is needed.
2. Under **Settings > Environment Variables**, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://dizxrfjzpftesosqusyr.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | the project's publishable key (Supabase > Project Settings > API Keys) |
| `KSV_DB_SECRET` | the server secret (keep private; never in the HTML or the repo) |
| `ADMIN_KEY` | a long random passphrase for the dashboard |

Alternatively, set `SUPABASE_SERVICE_ROLE_KEY` instead of the publishable key and secret.

3. Deploy. To use a custom domain or subdomain, add it under **Settings > Domains**.

### 3. Logo
The official APC logo is in `assets/apc-logo.png`. To replace it, overwrite that file (if it is ever missing, a green-white-blue APC badge is shown).

## Local development

```bash
npm run dev     # http://localhost:3000, form at /feedback, dashboard at /dashboard
npm test
npm run demo    # same as dev, preloaded with 400 fake responses to preview the dashboard
```

Without `SUPABASE_URL` set, the dev server keeps responses in memory and the admin key is `dev-admin-key`. To use the real database locally, export the environment variables from the table above first.

## Day-to-day

- **Partner details** (Prismaforge logo and contacts) are in the "Partner and technical implementer" section of `index.html`; the logo is `assets/partners/prismaforge.jpg`.
- **Change the landing page text or the sponsor's message:** edit `index.html`. To swap a portrait, replace the file in `assets/people/` (portrait 4:5, about 480 px wide).

- **Change the lists** (institutions, levels, sectors, options): edit `config.js`. The form, dashboard and server validation all read it.
- **Rotate the admin key:** change `ADMIN_KEY` in Vercel and redeploy. Existing dashboard sessions stop working.
- **Update wards and polling units** from a new INEC sheet (columns: SN, STATE, LGA, WARD, PU, DELIM, ...):
  `python3 scripts/build_geo.py path/to/KADUNA.xlsx` (needs `pip install openpyxl`).
- **Possible duplicate submissions:** in Supabase run `select * from possible_duplicates;`.
- **Export:** use Download CSV on the dashboard (respects the filters), or export from the Supabase table editor.

## Security and privacy notes

- Consent is required to submit. Contact details are visible only to admin-key holders.
- The server re-validates every field, checks the ward belongs to the chosen LGA, caps text lengths and drops unknown options.
- A hidden honeypot field silently drops bot submissions.
- The admin key is compared in constant time and failed attempts are delayed.
- CSV export prefixes values starting with `=`, `+`, `-` or `@` so spreadsheets do not run them as formulas.
- There is no per-IP rate limit yet. If spam becomes a problem, add Vercel's firewall rate limiting on `/api/submit`.

## Assumptions to confirm

- The PRD lists "13 Kaduna institutions" without naming them. `config.js` uses: ABU Zaria, KASU, NDA, AFIT, Federal University of Applied Sciences Kachia, Kaduna Polytechnic, Nuhu Bamalli Polytechnic, NCAT Zaria, FCE Zaria, KSCOE Gidan Waya, Shehu Idris College of Health Sciences Makarfi, Kaduna State College of Nursing and Midwifery Kafanchan, and College of Agriculture and Animal Science Mando. Edit as needed.
- Ward is a required drop-down and polling unit an optional drop-down, both from the attached INEC list. Students outside Kaduna State type them instead.
