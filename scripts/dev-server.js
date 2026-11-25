// Local dev server: serves the static site and the /api functions the way Vercel does.
// Without SUPABASE_URL set it stores responses in memory, and the admin key is "dev-admin-key".
// Usage: npm run dev   (or: PORT=4000 node scripts/dev-server.js)
const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const port = Number(process.env.PORT) || 3000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.geojson': 'application/geo+json' };
if (process.env.SEED) {
  const rows = require('./fake-data.js').make(Number(process.env.SEED) || 300);
  rows.sort((a, b) => a.created_at.localeCompare(b.created_at));
  require('../lib/store.js').seedMemory(rows);
}
const api = { '/api/submit': require('../api/submit.js'), '/api/responses': require('../api/responses.js') };

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (api[url.pathname]) return api[url.pathname](req, res);
  let file = path.join(root, decodeURIComponent(url.pathname));
  if (!file.startsWith(root)) { res.statusCode = 403; return res.end(); }
  if (url.pathname === '/') file = path.join(root, 'index.html');
  else if (!path.extname(file)) file += '.html'; // clean URLs, like Vercel: /feedback -> feedback.html
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode = 404; return res.end('Not found'); }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  });
}).listen(port, () => {
  const mem = require('../lib/store.js').useMemory;
  console.log(`Kaduna Student Voice on http://localhost:${port}  (dashboard: /dashboard)`);
  console.log(mem ? 'Storage: in-memory (admin key: dev-admin-key)' : 'Storage: Supabase');
});
