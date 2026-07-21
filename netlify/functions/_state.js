const { getJsonFile } = require("./_github");
const geometry = require("../../js/geometry.js");
const energy = require("../../js/energy.js");
const protein = require("../../data/protein.json");

const STATE_PATH = "data/state.json";
const UNIT_WIDTH = 16;
const UNIT_STRIDE = 8;
const CLAIM_TTL_MS = 40 * 60 * 1000;

function buildUnits(residueCount) {
  const units = [];
  let start = 1;
  let index = 0;
  while (start <= residueCount) {
    const end = Math.min(start + UNIT_WIDTH - 1, residueCount);
    units.push({ id: `u${index}`, start, end });
    index++;
    if (end === residueCount) break;
    start += UNIT_STRIDE;
  }
  return units;
}

function freshState() {
  const coords = geometry.buildInitialCoordinates(protein.residueCount, protein.helices);
  const initialEnergy = energy.totalEnergy(coords, protein.helices);
  return {
    protein: {
      pdbId: protein.pdbId,
      name: protein.name,
      sequence: protein.sequence,
      helices: protein.helices,
      residueCount: protein.residueCount
    },
    coords,
    energy: initialEnergy,
    initialEnergy,
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
