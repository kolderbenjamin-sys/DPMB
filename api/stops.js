const { ensureGTFS, searchStops } = require('./_gtfs');

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const q = req.query.q || '';
  if (q.length < 2) return res.status(200).json([]);

  try {
    await ensureGTFS();
    res.status(200).json(searchStops(q, 12));
  } catch (err) {
    console.error('[stops]', err.message);
    res.status(500).json([]);
  }
};
