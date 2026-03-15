/**
 * DPMB Brno – GTFS Server
 * ========================
 * Spuštění: node server.js
 * Poté otevři: http://localhost:3000
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Auto-install unzipper if missing
try { require.resolve('unzipper'); } catch {
  console.log('Instaluji závislost "unzipper"...');
  execSync('npm install unzipper', { stdio: 'inherit', cwd: __dirname });
  console.log('Hotovo.');
}
const unzipper = require('unzipper');

const PORT = 3000;
const GTFS_URL = 'https://kordis-jmk.cz/gtfs/gtfs.zip';
const CACHE_DIR = path.join(__dirname, '.gtfs_cache');
const CACHE_ZIP = path.join(CACHE_DIR, 'gtfs.zip');
const CACHE_META = path.join(CACHE_DIR, 'meta.json');
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24h

let gtfsData = null;

function log(msg) { console.log(`[${new Date().toLocaleTimeString('cs-CZ')}] ${msg}`); }

// ── Download ─────────────────────────────────────────────────
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode));
      const total = parseInt(res.headers['content-length'] || '0');
      let received = 0;
      res.on('data', chunk => {
        received += chunk.length;
        if (total) process.stdout.write(`\r  ${Math.round(received/1024/1024)} MB / ${Math.round(total/1024/1024)} MB   `);
      });
      res.pipe(file);
      file.on('finish', () => { process.stdout.write('\n'); file.close(resolve); });
    }).on('error', err => { fs.unlink(dest, () => {}); reject(err); });
  });
}

// ── Parse CSV ────────────────────────────────────────────────
function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of lines[i]) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur); cur = ''; }
      else cur += ch;
    }
    vals.push(cur);
    const row = {};
    headers.forEach((h, idx) => { row[h] = (vals[idx] || '').replace(/^"|"$/g, '').trim(); });
    rows.push(row);
  }
  return rows;
}

// ── Read ZIP entries using unzipper ──────────────────────────
function readZipEntries(zipPath, needed) {
  return new Promise((resolve, reject) => {
    const result = {};
    const chunks = {};
    needed.forEach(n => { chunks[n] = []; });

    fs.createReadStream(zipPath)
      .pipe(unzipper.Parse())
      .on('entry', entry => {
        const name = path.basename(entry.path);
        if (needed.includes(name)) {
          entry.on('data', d => chunks[name].push(d));
          entry.on('end', () => { result[name] = Buffer.concat(chunks[name]).toString('utf8'); });
        } else {
          entry.autodrain();
        }
      })
      .on('finish', () => resolve(result))
      .on('error', reject);
  });
}

// ── Load & parse GTFS ────────────────────────────────────────
async function ensureGTFS() {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });

  let needDownload = true;
  if (fs.existsSync(CACHE_ZIP) && fs.existsSync(CACHE_META)) {
    try {
      const meta = JSON.parse(fs.readFileSync(CACHE_META, 'utf8'));
      if (Date.now() - meta.downloadedAt < CACHE_TTL) {
        log('GTFS cache je čerstvá (' + new Date(meta.downloadedAt).toLocaleString('cs-CZ') + ')');
        needDownload = false;
      }
    } catch {}
  }

  if (needDownload) {
    log('Stahuji GTFS data z kordis-jmk.cz... (může trvat 10–60 s)');
    await downloadFile(GTFS_URL, CACHE_ZIP);
    fs.writeFileSync(CACHE_META, JSON.stringify({ downloadedAt: Date.now() }));
    log('GTFS staženo.');
  }

  log('Rozbaluji a parsuju GTFS...');
  const files = await readZipEntries(CACHE_ZIP, [
    'stops.txt', 'routes.txt', 'trips.txt',
    'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'
  ]);

  log('Parsuju stops...');
  const stops = parseCSV(files['stops.txt'] || '');
  log('Parsuju routes...');
  const routes = parseCSV(files['routes.txt'] || '');
  log('Parsuju trips...');
  const trips = parseCSV(files['trips.txt'] || '');
  log('Parsuju stop_times... (největší soubor, chvíli počkej)');
  const stopTimes = parseCSV(files['stop_times.txt'] || '');
  log('Parsuju calendar...');
  const calendar = parseCSV(files['calendar.txt'] || '');
  const calendarDates = parseCSV(files['calendar_dates.txt'] || '');

  // Build indexes
  const stopsById = {};
  stops.forEach(s => { stopsById[s.stop_id] = s; });

  const routesById = {};
  routes.forEach(r => { routesById[r.route_id] = r; });

  const tripsById = {};
  trips.forEach(t => { tripsById[t.trip_id] = t; });

  const timesByStop = {};
  stopTimes.forEach(st => {
    if (!timesByStop[st.stop_id]) timesByStop[st.stop_id] = [];
    timesByStop[st.stop_id].push(st);
  });

  const calendarById = {};
  calendar.forEach(c => { calendarById[c.service_id] = c; });

  const calDatesByService = {};
  calendarDates.forEach(cd => {
    if (!calDatesByService[cd.service_id]) calDatesByService[cd.service_id] = [];
    calDatesByService[cd.service_id].push(cd);
  });

  gtfsData = { stopsById, routesById, tripsById, timesByStop, calendarById, calDatesByService };
  log(`✅ Hotovo! Zastávek: ${stops.length}, Linek: ${routes.length}, Spojů: ${trips.length}, Časů: ${stopTimes.length}`);
}

// ── Business logic ───────────────────────────────────────────
const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function isServiceActive(serviceId, dateStr, dayOfWeek) {
  const exceptions = (gtfsData.calDatesByService[serviceId] || []);
  for (const ex of exceptions) {
    if (ex.date === dateStr) return ex.exception_type === '1';
  }
  const cal = gtfsData.calendarById[serviceId];
  if (!cal) return false;
  if (dateStr < cal.start_date || dateStr > cal.end_date) return false;
  return cal[DAY_NAMES[dayOfWeek]] === '1';
}

function timeToMinutes(t) {
  if (!t) return -1;
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function getDepartures(stopName, limit = 20) {
  if (!gtfsData) return { error: 'GTFS data nejsou načtena' };
  const { stopsById, routesById, tripsById, timesByStop } = gtfsData;

  const q = stopName.toLowerCase().normalize('NFC');
  const matchedIds = Object.values(stopsById)
    .filter(s => s.stop_name && s.stop_name.toLowerCase().normalize('NFC').includes(q))
    .map(s => s.stop_id);

  if (!matchedIds.length) return { departures: [], stopName, message: 'Zastávka nenalezena' };

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const dow = now.getDay();

  const results = [];
  for (const stopId of matchedIds) {
    for (const st of (timesByStop[stopId] || [])) {
      const depMin = timeToMinutes(st.departure_time);
      if (depMin < 0 || depMin < nowMin - 1 || depMin > nowMin + 90) continue;
      const trip = tripsById[st.trip_id];
      if (!trip || !isServiceActive(trip.service_id, dateStr, dow)) continue;
      const route = routesById[trip.route_id];
      if (!route) continue;
      results.push({
        line: route.route_short_name || route.route_id,
        dest: trip.trip_headsign || route.route_long_name || '—',
        depMin,
        minsLeft: depMin - nowMin,
        routeType: route.route_type,
      });
    }
  }

  const seen = new Set();
  const unique = results
    .sort((a, b) => a.depMin - b.depMin)
    .filter(r => {
      const k = `${r.line}|${r.dest}|${r.depMin}`;
      if (seen.has(k)) return false;
      seen.add(k); return true;
    })
    .slice(0, limit);

  return { departures: unique, stopName };
}

function searchStops(query, limit = 12) {
  if (!gtfsData) return [];
  const q = query.toLowerCase().normalize('NFC');
  const seen = new Set();
  return Object.values(gtfsData.stopsById)
    .filter(s => s.stop_name && s.stop_name.toLowerCase().normalize('NFC').includes(q))
    .filter(s => { if (seen.has(s.stop_name)) return false; seen.add(s.stop_name); return true; })
    .slice(0, limit)
    .map(s => ({ id: s.stop_id, name: s.stop_name }));
}

// ── HTTP Server ───────────────────────────────────────────────
function json(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;

  if (p === '/' || p === '/index.html') {
    const htmlFile = path.join(__dirname, 'dpmb-odjezdova-tabule.html');
    if (!fs.existsSync(htmlFile)) { res.writeHead(404); res.end('dpmb-odjezdova-tabule.html not found'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(fs.readFileSync(htmlFile));
  } else if (p === '/api/departures') {
    const stop = url.searchParams.get('stop') || '';
    if (!stop) { json(res, { error: 'Chybí parametr stop' }); return; }
    json(res, getDepartures(stop, 20));
  } else if (p === '/api/stops') {
    json(res, searchStops(url.searchParams.get('q') || '', 12));
  } else if (p === '/api/status') {
    json(res, { gtfsLoaded: !!gtfsData });
  } else {
    res.writeHead(404); res.end('Not found');
  }
});

(async () => {
  try {
    await ensureGTFS();
    server.listen(PORT, () => {
      log(`🚌 Server běží → http://localhost:${PORT}`);
      log('   Otevři tuto adresu v prohlížeči.');
    });
  } catch (err) {
    console.error('❌ Chyba při startu:', err.message);
    process.exit(1);
  }
})();
