/**
 * GTFS loader – čte data/gtfs.zip přímo z repozitáře.
 * Žádné stahování, žádný /tmp. Data jsou součástí projektu.
 *
 * Jak aktualizovat data:
 *   1. Stáhni https://kordis-jmk.cz/gtfs/gtfs.zip
 *   2. Ulož jako data/gtfs.zip (přepiš starý soubor)
 *   3. git add data/gtfs.zip && git commit && git push
 *   → Vercel se automaticky redeplojne s novými daty
 */

const fs   = require('fs');
const path = require('path');

const ZIP_PATH = path.join(__dirname, '..', 'data', 'gtfs.zip');

let gtfsData = null;

function parseCSV(text) {
  const lines = text.replace(/\r/g, '').split('\n').filter(Boolean);
  if (!lines.length) return [];
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = []; let cur = '', inQ = false;
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

function readZip(zipPath, needed) {
  return new Promise((resolve, reject) => {
    const unzipper = require('unzipper');
    const result = {}, chunks = {};
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

function buildIndexes(files) {
  const stops     = parseCSV(files['stops.txt']          || '');
  const routes    = parseCSV(files['routes.txt']         || '');
  const trips     = parseCSV(files['trips.txt']          || '');
  const stopTimes = parseCSV(files['stop_times.txt']     || '');
  const calendar  = parseCSV(files['calendar.txt']       || '');
  const calDates  = parseCSV(files['calendar_dates.txt'] || '');

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
  const calById = {};
  calendar.forEach(c => { calById[c.service_id] = c; });
  const calDatesByService = {};
  calDates.forEach(cd => {
    if (!calDatesByService[cd.service_id]) calDatesByService[cd.service_id] = [];
    calDatesByService[cd.service_id].push(cd);
  });

  return { stopsById, routesById, tripsById, timesByStop, calById, calDatesByService };
}

async function ensureGTFS() {
  if (gtfsData) return gtfsData;

  if (!fs.existsSync(ZIP_PATH)) {
    throw new Error(
      'data/gtfs.zip nenalezen! Stáhni https://kordis-jmk.cz/gtfs/gtfs.zip a ulož jako data/gtfs.zip'
    );
  }

  console.log('[gtfs] Parsuju data/gtfs.zip...');
  const files = await readZip(ZIP_PATH, [
    'stops.txt', 'routes.txt', 'trips.txt',
    'stop_times.txt', 'calendar.txt', 'calendar_dates.txt'
  ]);
  gtfsData = buildIndexes(files);
  console.log('[gtfs] Hotovo. Zastávek:', Object.keys(gtfsData.stopsById).length);
  return gtfsData;
}

const DAY_NAMES = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

function isActive(serviceId, dateStr, dow, data) {
  const exs = data.calDatesByService[serviceId] || [];
  for (const ex of exs) if (ex.date === dateStr) return ex.exception_type === '1';
  const cal = data.calById[serviceId];
  if (!cal) return false;
  if (dateStr < cal.start_date || dateStr > cal.end_date) return false;
  return cal[DAY_NAMES[dow]] === '1';
}

function toMin(t) {
  if (!t) return -1;
  const p = t.split(':');
  return parseInt(p[0]) * 60 + parseInt(p[1]);
}

function getDepartures(stopName, limit = 20) {
  if (!gtfsData) return { error: 'GTFS not loaded' };
  const { stopsById, routesById, tripsById, timesByStop } = gtfsData;

  const q = stopName.toLowerCase().normalize('NFC');
  const ids = Object.values(stopsById)
    .filter(s => s.stop_name && s.stop_name.toLowerCase().normalize('NFC').includes(q))
    .map(s => s.stop_id);

  if (!ids.length) return { departures: [], stopName, message: 'Zastávka nenalezena' };

  const now     = new Date();
  const prague  = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Prague' }));
  const nowMin  = prague.getHours() * 60 + prague.getMinutes();
  const dateStr = `${prague.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  const dow     = now.getDay();

  const results = [];
  for (const stopId of ids) {
    for (const st of (timesByStop[stopId] || [])) {
      const depMin = toMin(st.departure_time);
      if (depMin < 0 || depMin < nowMin - 1 || depMin > nowMin + 90) continue;
      const trip = tripsById[st.trip_id];
      if (!trip || !isActive(trip.service_id, dateStr, dow, gtfsData)) continue;
      const route = routesById[trip.route_id];
      if (!route) continue;
      results.push({
        line: route.route_short_name || route.route_id,
        dest: trip.trip_headsign || route.route_long_name || '—',
        depMin, minsLeft: depMin - nowMin,
        routeType: route.route_type,
      });
    }
  }

  const seen = new Set();
  return {
    departures: results
      .sort((a, b) => a.depMin - b.depMin)
      .filter(r => {
        const k = `${r.line}|${r.dest}|${r.depMin}`;
        if (seen.has(k)) return false;
        seen.add(k); return true;
      })
      .slice(0, limit),
    stopName,
  };
}

function searchStops(query, limit = 12) {
  if (!gtfsData) return [];
  const q = query.toLowerCase().normalize('NFC');
  const seen = new Set();
  return Object.values(gtfsData.stopsById)
    .filter(s => s.stop_name && s.stop_name.toLowerCase().normalize('NFC').includes(q))
    .filter(s => {
      if (seen.has(s.stop_name)) return false;
      seen.add(s.stop_name); return true;
    })
    .slice(0, limit)
    .map(s => ({ id: s.stop_id, name: s.stop_name }));
}

module.exports = { ensureGTFS, getDepartures, searchStops };
