'use strict';
/*
 * Tiny dependency-free static server for local use and the end-to-end test.
 *   node scripts/serve.cjs [port]      → http://localhost:8080
 *
 * localhost counts as a secure context, so microphone access and the service
 * worker work without HTTPS.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
};
const PUBLIC = /^\/(index\.html|sw\.js|manifest\.webmanifest|(css|js|icons)\/[\w.-]+)?$/;

function createServer() {
  return http.createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    const file = path.join(ROOT, pathname === '/' ? 'index.html' : pathname);
    if (!PUBLIC.test(pathname) || !file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.argv[2]) || 8080;
  createServer().listen(port, '127.0.0.1', () => console.log(`Serving on http://localhost:${port}`));
}
