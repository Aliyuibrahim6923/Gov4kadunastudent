# Kaduna Student Voice

A mobile web app for tertiary students across Kaduna State to give structured feedback on the state administration: what to commend, which shortfalls to fix and where to strengthen. The Directorate of Student Mobilization views the results on a protected dashboard.

- **Landing page:** `/` (the Directorate's commitment, the Governor and President, the sponsor below them, and the sponsor's message)
- **Student form:** `/feedback` (four steps, about 5 minutes, works on a 360 px phone)
- **Directorate dashboard:** `/dashboard` (admin key required)
- **Stack:** static HTML/CSS/JS on **Vercel**, two Vercel serverless functions, a **Supabase** Postgres table. No framework and no npm dependencies.

```
index.html          landing page
feedback.html       student form
assets/people/      portraits on the landing page (governor, sponsor, president)
dashboard.html      Directorate dashboard (filters, charts, comments, CSV)
config.js           editable lists: institutions, levels, LGAs, sectors, options
styles.css          APC theme (green, white, sky blue), light and dark
data/wards.json     23 LGAs -> 255 wards (from the INEC polling-unit list)
data/pu/<lga>.json  ward -> polling units [code, name], 8,012 in total, loaded on demand
api/submit.js       POST: validate and store one response
api/responses.js    GET: all responses, only with the admin key
lib/                validation, Supabase storage, HTTP helpers
supabase/schema.sql table, indexes, row-level security, duplicate-phone view
scripts/            local dev server, ward/PU data builder
tests/              validation tests
```

## Setup

### 1. Supabase
1. Create a project at supabase.com (the free tier is enough).
2. Open **SQL Editor**, paste `supabase/schema.sql` and run it.
3. From **Project Settings > API**, copy the **Project URL** and the **service_role** key.
   The service role key stays on the server (in Vercel). Never put it in the HTML.

Row-level security is on with no policies, so the public anon key cannot read or write the table. Only the Vercel functions can.

### 2. Vercel
1. Import this GitHub repository in Vercel. Framework preset: **Other**. No build command is needed.
2. Under **Settings > Environment Variables**, add:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://YOUR-PROJECT.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | the service_role key |
| `ADMIN_KEY` | a long random passphrase for the dashboard |

3. Deploy. To use a custom domain or subdomain, add it under **Settings > Domains**.

### 3. Logo
The official APC logo is in `assets/apc-logo.png`. To replace it, overwrite that file (if it is ever missing, a green-white-blue APC badge is shown).

## Local development

```bash
npm run dev     # http://localhost:3000, form at /feedback, dashboard at /dashboard
npm test
```

Without `SUPABASE_URL` set, the dev server keeps responses in memory and the admin key is `dev-admin-key`. To use a real database locally, export the three environment variables first.

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
