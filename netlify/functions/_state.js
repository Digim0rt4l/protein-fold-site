const { getJsonFile } = require("./_github");
const geometry = require("../../js/geometry.js");
const energy = require("../../js/energy.js");
const protein = require("../../data/protein.json");

const STATE_PATH = "data/state.json";
const CLAIM_TTL_MS = 40 * 60 * 1000;
const ENSEMBLE_SIZE = 12;

function freshState() {
  const phiPsi = geometry.defaultDihedrals(protein.residueCount);
  const residues = geometry.buildBackbone(protein.residueCount, phiPsi);
  const initialEnergy = energy.totalEnergy(residues, phiPsi, protein.helices);
  return {
    protein: {
      pdbId: protein.pdbId,
      name: protein.name,
      sequence: protein.sequence,
      helices: protein.helices,
      residueCount: protein.residueCount
    },
    phiPsi,
    energy: initialEnergy,
    initialEnergy,
    ensemble: [],
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
  Object.keys(claims).forEach((trajectoryId) => {
    if (new Date(claims[trajectoryId].expiresAt).getTime() < now) delete claims[trajectoryId];
  });
  state.claims = claims;
  return state;
}

module.exports = {
  STATE_PATH,
  CLAIM_TTL_MS,
  ENSEMBLE_SIZE,
  freshState,
  loadState,
  expireOldClaims
};
