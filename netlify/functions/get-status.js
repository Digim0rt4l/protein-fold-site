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
        coords: data.coords,
        energy: data.energy,
        initialEnergy: data.initialEnergy,
        units: data.units,
        claims: data.claims,
        stats: data.stats
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
