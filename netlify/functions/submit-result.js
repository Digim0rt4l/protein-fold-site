const { updateJsonFile } = require("./_github");
const { STATE_PATH, expireOldClaims } = require("./_state");
const energy = require("../../js/energy.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Use POST" };
  }
  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }
  const { clientId, unitId, coords } = body;
  if (!clientId || !unitId || !Array.isArray(coords)) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId, unitId and coords are required" }) };
  }

  try {
    let accepted = false;
    let resultState = null;

    await updateJsonFile(
      STATE_PATH,
      (data) => {
        const state = data || require("./_state").freshState();
        expireOldClaims(state);

        if (coords.length === state.protein.residueCount) {
          const candidateEnergy = energy.totalEnergy(coords, state.protein.helices);
          if (candidateEnergy < state.energy) {
            state.coords = coords;
            state.energy = candidateEnergy;
            accepted = true;
          }
        }

        delete state.claims[unitId];
        state.stats.totalCompleted += 1;
        if (accepted) state.stats.totalAccepted += 1;
        state.stats.contributors[clientId] = (state.stats.contributors[clientId] || 0) + 1;
        state.stats.lastUpdated = new Date().toISOString();

        resultState = state;
        return state;
      },
      `submit ${unitId} from ${clientId}`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        accepted,
        energy: resultState.energy,
        coords: resultState.coords,
        stats: resultState.stats
      })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: String(err.message || err) }) };
  }
};
