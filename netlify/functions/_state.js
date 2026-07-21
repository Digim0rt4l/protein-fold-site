const path = require("path");
const { getJsonFile } = require("./_github");
const geometry = require(path.join(__dirname, "..", "..", "js", "geometry.js"));
const energy = require(path.join(__dirname, "..", "..", "js", "energy.js"));
const protein = require(path.join(__dirname, "..", "..", "data", "protein.json"));

const STATE_PATH = "data/state.json";
const UNIT_WIDTH = 10;
const UNIT_STRIDE = 5;
const CLAIM_TTL_MS = 2 * 60 * 1000; // 2 minutes

function buildUnits(residueCount) {
  const units = [];
  let start = 1;
  let idx = 0;
  while (start <= residueCount) {
    const end = Math.min(start + UNIT_WIDTH - 1, residueCount);
    units.push({ id: `u${idx}`, start, end });
    idx++;
    if (end === residueCount) break;
    start += UNIT_STRIDE;
  }
  return units;
}

function freshState() {
  const coords = geometry.buildInitialCoordinates(protein.residueCount, protein.helices);
  const e = energy.totalEnergy(coords, protein.helices);
  return {
    protein: {
      pdbId: protein.pdbId,
      name: protein.name,
      sequence: protein.sequence,
      helices: protein.helices,
      residueCount: protein.residueCount
    },
    coords,
    energy: e,
    initialEnergy: e,
    units: buildUnits(protein.residueCount),
    claims: {},
    stats: {
      totalCompleted: 0,
      totalAccepted: 0,
      contributors: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    }
  };
}

// Returns { data, sha } -- data is never null; a fresh state is synthesized
// (but NOT saved) if the file doesn't exist yet. The first write (from
// claim or submit) will create it via updateJsonFile's normal sha=null path.
async function loadState() {
  const { data, sha } = await getJsonFile(STATE_PATH);
  if (data) return { data, sha };
  return { data: freshState(), sha: null };
}

function expireOldClaims(state) {
  const now = Date.now();
  const claims = state.claims || {};
  Object.keys(claims).forEach((unitId) => {
    if (new Date(claims[unitId].expiresAt).getTime() < now) delete claims[unitId];
  });
  state.claims = claims;
  return state;
}

module.exports = {
  STATE_PATH,
  CLAIM_TTL_MS,
  freshState,
  loadState,
  expireOldClaims,
  buildUnits
};
