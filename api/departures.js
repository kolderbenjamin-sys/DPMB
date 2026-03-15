const { ensureGTFS, getDepartures } = require('./_gtfs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const stop = req.query.stop || '';
  if (!stop) return res.status(400).json({ error: 'Chybí parametr stop' });

  try {
    await ensureGTFS();
    res.status(200).json(getDepartures(stop, 20));
  } catch (err) {
    console.error('[departures]', err.message);
    res.status(500).json({ error: err.message });
  }
};
