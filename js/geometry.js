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
        psi: COIL_PSI_DEG + (random() - 0.5) * 30
      });
    }
    return dihedrals;
  }

  function buildBackbone(residueCount, dihedrals) {
    const atoms = [];

    atoms.push({ name: "N", x: 0, y: 0, z: 0 });
    atoms.push({ name: "CA", x: BOND_LENGTH_N_CA, y: 0, z: 0 });

    const bootstrapAngle = Math.PI - BOND_ANGLE_N_CA_C;
    atoms.push({
      name: "C",
      x: BOND_LENGTH_N_CA + BOND_LENGTH_CA_C * Math.cos(bootstrapAngle),
      y: BOND_LENGTH_CA_C * Math.sin(bootstrapAngle),
      z: 0
    });

    for (let residue = 1; residue < residueCount; residue++) {
      const prevN = atoms[atoms.length - 3];
      const prevCA = atoms[atoms.length - 2];
      const prevC = atoms[atoms.length - 1];

      const psi = dihedrals[residue - 1].psi * DEG_TO_RAD;
      const nextN = placeAtom(prevN, prevCA, prevC, BOND_LENGTH_C_N, BOND_ANGLE_CA_C_N, psi);
      atoms.push({ name: "N", ...nextN });

      const nextCA = placeAtom(prevCA, prevC, atoms[atoms.length - 1], BOND_LENGTH_N_CA, BOND_ANGLE_C_N_CA, OMEGA_TRANS);
      atoms.push({ name: "CA", ...nextCA });

      const phi = dihedrals[residue].phi * DEG_TO_RAD;
      const nextC = placeAtom(prevC, atoms[atoms.length - 2], atoms[atoms.length - 1], BOND_LENGTH_CA_C, BOND_ANGLE_N_CA_C, phi);
      atoms.push({ name: "C", ...nextC });
    }

    const residues = [];
    for (let residue = 0; residue < residueCount; residue++) {
      const base = residue * 3;
      residues.push({ N: atoms[base], CA: atoms[base + 1], C: atoms[base + 2] });
    }
    return residues;
  }

  function caTrace(residues) {
    return residues.map((residue) => ({ x: residue.CA.x, y: residue.CA.y, z: residue.CA.z }));
  }

  const api = {
    defaultDihedrals,
    buildBackbone,
    caTrace
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinGeometry = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
