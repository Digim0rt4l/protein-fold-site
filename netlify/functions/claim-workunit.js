const crypto = require("crypto");
const { updateJsonFile } = require("./_github");
const { STATE_PATH, CLAIM_TTL_MS, freshState, expireOldClaims } = require("./_state");

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
    const trajectoryId = crypto.randomUUID();
    let snapshot = null;

    await updateJsonFile(
      STATE_PATH,
      (data) => {
        const state = data || freshState();
        expireOldClaims(state);
        state.claims[trajectoryId] = {
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
        trajectoryId,
        phiPsi: snapshot.phiPsi,
        protein: snapshot.protein,
        leaseMs: CLAIM_TTL_MS
      })
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: String(error.message || error) }) };
  }
};
