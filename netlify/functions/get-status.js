const { loadState, expireOldClaims } = require("./_state");

const CACHE_TTL_MS = 8000;
let cachedResponse = null;
let cachedAt = 0;

exports.handler = async function (event) {
  try {
    const now = Date.now();
    if (cachedResponse && now - cachedAt < CACHE_TTL_MS) {
      return cachedResponse;
    }

    const { data } = await loadState();
    expireOldClaims(data);

    const response = {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        protein: data.protein,
        phiPsi: data.phiPsi,
        energy: data.energy,
        initialEnergy: data.initialEnergy,
        ensembleSize: data.ensemble.length,
        claims: data.claims,
        stats: data.stats
      })
    };

    cachedResponse = response;
    cachedAt = now;
    return response;
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
