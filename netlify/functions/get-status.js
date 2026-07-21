const { loadState, expireOldClaims } = require("./_state");

exports.handler = async function (event) {
  try {
    const { data } = await loadState();
    expireOldClaims(data);
    return {
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
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
