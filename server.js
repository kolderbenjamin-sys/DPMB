/**
 * Lokální dev server – zrcadlí Vercel strukturu
 * Spuštění: node server.js
 */

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- OPRAVA: Dynamické vytvoření složky temp v adresáři projektu ---
const tempDir = path.join(__dirname, 'temp'); 
if (!fs.existsSync(tempDir)) {
    try {
        console.log(`📁 Vytvářím lokální složku pro data: ${tempDir}`);
        fs.mkdirSync(tempDir, { recursive: true });
    } catch (err) {
        console.error(`❌ Nepodařilo se vytvořit složku ${tempDir}:`, err.message);
    }
}
// ------------------------------------------------

// Auto-install závislosti (ponecháno beze změny)
if (!fs.existsSync(path.join(__dirname, 'node_modules'))) {
    console.log('Instaluji závislosti (npm install)...');
    execSync('npm install', { stdio: 'inherit', cwd: __dirname });
}

// Importy API funkcí
const departures = require('./api/departures');
const stops      = require('./api/stops');
const status     = require('./api/status');

const PORT = 3000;

function mockVercel(handler, url, res) {
    // Vytvoříme falešné objekty, které simulují prostředí Vercel Serverless funkcí
    const req = { 
        query: Object.fromEntries(url.searchParams),
        method: 'GET'
    };
    const mockRes = {
        _status: 200,
        _headers: {},
        status(code) { this._status = code; return this; },
        setHeader(k, v) { this._headers[k] = v; return this; },
        json(data) {
            res.writeHead(this._status, { 'Content-Type': 'application/json; charset=utf-8', ...this._headers });
            res.end(JSON.stringify(data));
        },
        send(data) {
            res.writeHead(this._status, this._headers);
            res.end(data);
        }
    };
    handler(req, mockRes);
}

const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const p   = url.pathname;

    // Směrování API požadavků
    if (p === '/api/departures') return mockVercel(departures, url, res);
    if (p === '/api/stops')      return mockVercel(stops, url, res);
    if (p === '/api/status')     return mockVercel(status, url, res);

    // Statické soubory ze složky public/
    let file = p === '/' ? '/index.html' : p;
    const filePath = path.join(__dirname, 'public', file);
    
    if (fs.existsSync(filePath) && fs.lstatSync(filePath).isFile()) {
        const ext = path.extname(filePath);
        const mime = { 
            '.html':'text/html;charset=utf-8', 
            '.css':'text/css', 
            '.js':'application/javascript', 
            '.json':'application/json',
            '.png':'image/png',
            '.jpg':'image/jpeg',
            '.svg':'image/svg+xml'
        }[ext] || 'text/plain';
        res.writeHead(200, { 'Content-Type': mime });
        res.end(fs.readFileSync(filePath));
    } else {
        res.writeHead(404); 
        res.end('Soubor nenalezen');
    }
});

server.listen(PORT, () => {
    console.log(`\n🚌 DPMB dev server běží → http://localhost:${PORT}`);
    console.log(`📍 Pracovní adresář: ${__dirname}\n`);
});