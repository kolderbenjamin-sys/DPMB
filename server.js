/**
 * Lokální dev server – zrcadlí Vercel strukturu
 * Spuštění: node server.js
 * Otevři:   http://localhost:3000
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Auto-install závislosti
if (!fs.existsSync(path.join(__dirname, 'node_modules', 'unzipper'))) {
  console.log('Instaluji závislosti (npm install)...');
  execSync('npm install', { stdio: 'inherit', cwd: __dirname });
}

const departures = require('./api/departures');
const stops      = require('./api/stops');
const status     = require('./api/status');

const PORT = 3000;

function mockVercel(handler, url, res) {
  const req = { query: Object.fromEntries(url.searchParams) };
  const mockRes = {
    _status: 200,
    _headers: {},
    status(code) { this._status = code; return this; },
    setHeader(k, v) { this._headers[k] = v; return this; },
    json(data) {
      res.writeHead(this._status, { 'Content-Type': 'application/json; charset=utf-8', ...this._headers });
      res.end(JSON.stringify(data));
    }
  };
  handler(req, mockRes);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p   = url.pathname;

  if (p === '/api/departures') return mockVercel(departures, url, res);
  if (p === '/api/stops')      return mockVercel(stops, url, res);
  if (p === '/api/status')     return mockVercel(status, url, res);

  // Serve static files from public/
  let file = p === '/' ? '/index.html' : p;
  const filePath = path.join(__dirname, 'public', file);
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath);
    const mime = { '.html':'text/html;charset=utf-8', '.css':'text/css', '.js':'application/javascript', '.json':'application/json' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(fs.readFileSync(filePath));
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`\n🚌 DPMB dev server běží → http://localhost:${PORT}\n`);
});
