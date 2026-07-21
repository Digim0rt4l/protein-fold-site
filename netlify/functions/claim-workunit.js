const { updateJsonFile } = require("./_github");
const { STATE_PATH, CLAIM_TTL_MS, expireOldClaims } = require("./_state");

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Use POST" };
  }

  let clientId;
  try {
    const body = JSON.parse(event.body || "{}");
    clientId = body.clientId;
  } catch (error) {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid JSON body" }) };
  }

  if (!clientId) {
    return { statusCode: 400, body: JSON.stringify({ error: "clientId is required" }) };
  }

  try {
    let chosenUnit = null;
    let snapshot = null;

    await updateJsonFile(
      STATE_PATH,
      (data) => {
        const state = data || require("./_state").freshState();
        expireOldClaims(state);
        const claimedIds = new Set(Object.keys(state.claims));
        chosenUnit = state.units.find((unit) => !claimedIds.has(unit.id)) || state.units[0];
        state.claims[chosenUnit.id] = {
          clientId,
          claimedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + CLAIM_TTL_MS).toISOString()
        };
        snapshot = state;
        return state;
      },
      `claim ${clientId}`
    );

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      body: JSON.stringify({
        unit: chosenUnit,
        coords: snapshot.coords,
        energy: snapshot.energy,
        protein: snapshot.protein,
        leaseMs: CLAIM_TTL_MS
      })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
