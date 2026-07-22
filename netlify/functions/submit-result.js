const { updateJsonFile } = require("./_github");
const { STATE_PATH, ENSEMBLE_SIZE, freshState, expireOldClaims } = require("./_state");
const geometry = require("../../js/geometry.js");
const energy = require("../../js/energy.js");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Use POST" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  const { clientId, trajectoryId, phiPsi } = body;
  if (!clientId || !trajectoryId || !Array.isArray(phiPsi)) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId, trajectoryId and phiPsi are required" }) };
  }

  try {
    let accepted = false;
    let resultState = null;

    await updateJsonFile(
      STATE_PATH,
      (data) => {
        const state = data || freshState();
        expireOldClaims(state);

        if (phiPsi.length === state.protein.residueCount) {
          const residues = geometry.buildBackbone(state.protein.sequence, phiPsi);
          const candidateEnergy = energy.totalEnergy(residues, phiPsi, state.protein.helices);

          state.ensemble.push({ phiPsi, energy: candidateEnergy, submittedAt: new Date().toISOString() });
          state.ensemble.sort((a, b) => a.energy - b.energy);
          state.ensemble = state.ensemble.slice(0, ENSEMBLE_SIZE);

          if (candidateEnergy < state.energy) {
            state.phiPsi = phiPsi;
            state.energy = candidateEnergy;
            accepted = true;
          }
        }

        delete state.claims[trajectoryId];
        state.stats.totalCompleted += 1;
        if (accepted) state.stats.totalAccepted += 1;
        state.stats.contributors[clientId] = (state.stats.contributors[clientId] || 0) + 1;
        state.stats.lastUpdated = new Date().toISOString();

        resultState = state;
        return state;
      },
      `submit ${trajectoryId} from ${clientId}`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        accepted,
        energy: resultState.energy,
        initialEnergy: resultState.initialEnergy,
        phiPsi: resultState.phiPsi,
        ensembleSize: resultState.ensemble.length,
        claims: resultState.claims,
        stats: resultState.stats
      })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
