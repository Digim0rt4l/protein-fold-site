(function (root) {
  "use strict";

  const DEG_TO_RAD = Math.PI / 180;

  const BOND_LENGTH_N_CA = 1.458;
  const BOND_LENGTH_CA_C = 1.525;
  const BOND_LENGTH_C_N = 1.329;

  const BOND_ANGLE_N_CA_C = 111.0 * DEG_TO_RAD;
  const BOND_ANGLE_CA_C_N = 117.2 * DEG_TO_RAD;
  const BOND_ANGLE_C_N_CA = 121.7 * DEG_TO_RAD;

  const OMEGA_TRANS = 180 * DEG_TO_RAD;

  const COIL_PHI_DEG = -120;
  const COIL_PSI_DEG = 140;

  const BOND_LENGTH_CA_CB = 1.53;
  const BOND_ANGLE_C_CA_CB = 110.5 * DEG_TO_RAD;
  const DIHEDRAL_N_C_CA_CB = 122.5 * DEG_TO_RAD;

  const BOND_LENGTH_CB_SC = 1.52;
  const BOND_ANGLE_CA_CB_SC = 114.0 * DEG_TO_RAD;

  const SIDE_CHAIN_SIZE = {
    G: 0, A: 1, S: 1, C: 1,
    V: 2, T: 2, D: 2, N: 2, P: 2, L: 2, I: 2, M: 2, Q: 2, E: 2, H: 2, K: 2,
    F: 3, R: 3, Y: 3, W: 3
  };

  function hasSideChain(residueType) {
    return residueType !== "G";
  }

  function hasChi1(residueType) {
    return residueType !== "G" && residueType !== "A";
  }

  function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }

  function addVectors(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function scaleVector(a, scalar) {
    return { x: a.x * scalar, y: a.y * scalar, z: a.z * scalar };
  }

  function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function cross(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function vectorLength(a) {
    return Math.sqrt(dot(a, a));
  }

  function normalize(a) {
    const length = vectorLength(a) || 1e-9;
    return scaleVector(a, 1 / length);
  }

  function placeAtom(a, b, c, bondLength, bondAngleRad, dihedralRad) {
    const bc = normalize(subtract(c, b));
    const n = normalize(cross(subtract(b, a), bc));
    const m = cross(n, bc);
    const localX = -bondLength * Math.cos(bondAngleRad);
    const localY = bondLength * Math.sin(bondAngleRad) * Math.cos(dihedralRad);
    const localZ = -bondLength * Math.sin(bondAngleRad) * Math.sin(dihedralRad);
    return addVectors(c, addVectors(scaleVector(bc, localX), addVectors(scaleVector(m, localY), scaleVector(n, localZ))));
  }

  function mulberry32(seed) {
    let state = seed;
    return function () {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function defaultDihedrals(residueCount) {
    const random = mulberry32(42);
    const dihedrals = [];
    for (let i = 0; i < residueCount; i++) {
      dihedrals.push({
        phi: COIL_PHI_DEG + (random() - 0.5) * 30,
        psi: COIL_PSI_DEG + (random() - 0.5) * 30,
        chi1: random() * 360 - 180
      });
    }
    return dihedrals;
  }

  function buildBackbone(sequence, dihedrals) {
    const residueCount = sequence.length;
    const atoms = [];

    atoms.push({ x: 0, y: 0, z: 0 });
    atoms.push({ x: BOND_LENGTH_N_CA, y: 0, z: 0 });

    const bootstrapAngle = Math.PI - BOND_ANGLE_N_CA_C;
    atoms.push({
      x: BOND_LENGTH_N_CA + BOND_LENGTH_CA_C * Math.cos(bootstrapAngle),
      y: BOND_LENGTH_CA_C * Math.sin(bootstrapAngle),
      z: 0
    });

    for (let residue = 1; residue < residueCount; residue++) {
      const prevN = atoms[atoms.length - 3];
      const prevCA = atoms[atoms.length - 2];
      const prevC = atoms[atoms.length - 1];

      const psi = dihedrals[residue - 1].psi * DEG_TO_RAD;
      atoms.push(placeAtom(prevN, prevCA, prevC, BOND_LENGTH_C_N, BOND_ANGLE_CA_C_N, psi));

      const nextCA = placeAtom(prevCA, prevC, atoms[atoms.length - 1], BOND_LENGTH_N_CA, BOND_ANGLE_C_N_CA, OMEGA_TRANS);
      atoms.push(nextCA);

      const phi = dihedrals[residue].phi * DEG_TO_RAD;
      atoms.push(placeAtom(prevC, atoms[atoms.length - 2], atoms[atoms.length - 1], BOND_LENGTH_CA_C, BOND_ANGLE_N_CA_C, phi));
    }

    const residues = [];
    for (let residue = 0; residue < residueCount; residue++) {
      const base = residue * 3;
      const residueType = sequence[residue];
      const N = atoms[base];
      const CA = atoms[base + 1];
      const C = atoms[base + 2];
      const CB = hasSideChain(residueType) ? placeAtom(N, C, CA, BOND_LENGTH_CA_CB, BOND_ANGLE_C_CA_CB, DIHEDRAL_N_C_CA_CB) : null;
      const chi1 = dihedrals[residue].chi1 * DEG_TO_RAD;
      const SC = hasChi1(residueType) ? placeAtom(N, CA, CB, BOND_LENGTH_CB_SC, BOND_ANGLE_CA_CB_SC, chi1) : null;
      residues.push({ N, CA, C, CB, SC, residueType, sideChainSize: SIDE_CHAIN_SIZE[residueType] || 1 });
    }
    return residues;
  }

  const api = {
    defaultDihedrals,
    buildBackbone
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinGeometry = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
