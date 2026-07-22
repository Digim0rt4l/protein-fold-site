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
  const BOND_LENGTH_C_O = 1.229;

  const COIL_PHI_DEG = -120;
  const COIL_PSI_DEG = 140;
  const HELIX_PHI_DEG = -57;
  const HELIX_PSI_DEG = -47;
  const CANONICAL_CHI_DEG = 180;

  const BOND_LENGTH_CA_CB = 1.53;
  const BOND_ANGLE_C_CA_CB = 110.5 * DEG_TO_RAD;
  const DIHEDRAL_N_C_CA_CB = 122.5 * DEG_TO_RAD;

  const BOND_LENGTH_SIDECHAIN_LINK = 1.52;
  const BOND_ANGLE_SIDECHAIN_LINK = 114.0 * DEG_TO_RAD;

  const SIDE_CHAIN_SIZE = {
    G: 0, A: 1, S: 1, C: 1,
    V: 2, T: 2, D: 2, N: 2, P: 2, L: 2, I: 2, M: 2, Q: 2, E: 2, H: 2, K: 2,
    F: 3, R: 3, Y: 3, W: 3
  };

  const CHI_COUNT = {
    G: 0, A: 0,
    S: 1, C: 1, T: 1, V: 1,
    D: 2, N: 2, I: 2, L: 2, H: 2, F: 2, Y: 2, W: 2, P: 2,
    M: 3, E: 3, Q: 3,
    K: 4, R: 4
  };

  function hasSideChain(residueType) {
    return residueType !== "G";
  }

  function chiCountFor(residueType) {
    return CHI_COUNT[residueType] || 0;
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

  function placeTrigonalThird(center, subA, subB, bondLength) {
    const dirA = normalize(subtract(subA, center));
    const dirB = normalize(subtract(subB, center));
    const thirdDir = normalize(scaleVector(addVectors(dirA, dirB), -1));
    return addVectors(center, scaleVector(thirdDir, bondLength));
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

  function inHelix(residueNumber, helices) {
    for (let i = 0; i < helices.length; i++) {
      if (residueNumber >= helices[i].start && residueNumber <= helices[i].end) return true;
    }
    return false;
  }

  function defaultDihedrals(residueCount) {
    const random = mulberry32(42);
    const dihedrals = [];
    for (let i = 0; i < residueCount; i++) {
      dihedrals.push({
        phi: COIL_PHI_DEG + (random() - 0.5) * 30,
        psi: COIL_PSI_DEG + (random() - 0.5) * 30,
        chi1: random() * 360 - 180,
        chi2: random() * 360 - 180,
        chi3: random() * 360 - 180,
        chi4: random() * 360 - 180
      });
    }
    return dihedrals;
  }

  function buildReferenceDihedrals(residueCount, helices) {
    const dihedrals = [];
    for (let i = 0; i < residueCount; i++) {
      const residueNumber = i + 1;
      if (inHelix(residueNumber, helices)) {
        dihedrals.push({ phi: HELIX_PHI_DEG, psi: HELIX_PSI_DEG, chi1: CANONICAL_CHI_DEG, chi2: CANONICAL_CHI_DEG, chi3: CANONICAL_CHI_DEG, chi4: CANONICAL_CHI_DEG });
      } else {
        dihedrals.push({ phi: COIL_PHI_DEG, psi: COIL_PSI_DEG, chi1: CANONICAL_CHI_DEG, chi2: CANONICAL_CHI_DEG, chi3: CANONICAL_CHI_DEG, chi4: CANONICAL_CHI_DEG });
      }
    }
    return dihedrals;
  }

  function buildSideChainAtoms(N, CA, CB, dihedral, chiCount) {
    const atoms = [];
    let a = N;
    let b = CA;
    let c = CB;
    const chiKeys = ["chi1", "chi2", "chi3", "chi4"];
    for (let i = 0; i < chiCount; i++) {
      const angle = dihedral[chiKeys[i]] * DEG_TO_RAD;
      const next = placeAtom(a, b, c, BOND_LENGTH_SIDECHAIN_LINK, BOND_ANGLE_SIDECHAIN_LINK, angle);
      atoms.push(next);
      a = b;
      b = c;
      c = next;
    }
    return atoms;
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
      const nextN = residue < residueCount - 1 ? atoms[base + 3] : N;
      const O = placeTrigonalThird(C, CA, nextN, BOND_LENGTH_C_O);
      const CB = hasSideChain(residueType) ? placeAtom(N, C, CA, BOND_LENGTH_CA_CB, BOND_ANGLE_C_CA_CB, DIHEDRAL_N_C_CA_CB) : null;
      const chiCount = chiCountFor(residueType);
      const sideChain = CB ? buildSideChainAtoms(N, CA, CB, dihedrals[residue], chiCount) : [];
      residues.push({ N, CA, C, O, CB, sideChain, residueType, sideChainSize: SIDE_CHAIN_SIZE[residueType] || 1 });
    }
    return residues;
  }

  function centroid(points) {
    const sum = points.reduce((acc, p) => addVectors(acc, p), { x: 0, y: 0, z: 0 });
    return scaleVector(sum, 1 / points.length);
  }

  function jacobiEigenSymmetric4(matrix) {
    const n = 4;
    const a = matrix.map((row) => row.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));

    for (let sweep = 0; sweep < 100; sweep++) {
      let off = 0;
      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q];
      }
      if (off < 1e-14) break;

      for (let p = 0; p < n; p++) {
        for (let q = p + 1; q < n; q++) {
          if (Math.abs(a[p][q]) < 1e-15) continue;
          const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
          const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
          const c = 1 / Math.sqrt(t * t + 1);
          const s = t * c;
          const app = a[p][p];
          const aqq = a[q][q];
          const apq = a[p][q];
          a[p][p] = c * c * app - 2 * s * c * apq + s * s * aqq;
          a[q][q] = s * s * app + 2 * s * c * apq + c * c * aqq;
          a[p][q] = 0;
          a[q][p] = 0;
          for (let i = 0; i < n; i++) {
            if (i !== p && i !== q) {
              const aip = a[i][p];
              const aiq = a[i][q];
              a[i][p] = c * aip - s * aiq;
              a[p][i] = a[i][p];
              a[i][q] = s * aip + c * aiq;
              a[q][i] = a[i][q];
            }
          }
          for (let i = 0; i < n; i++) {
            const vip = v[i][p];
            const viq = v[i][q];
            v[i][p] = c * vip - s * viq;
            v[i][q] = s * vip + c * viq;
          }
        }
      }
    }

    return { eigenvalues: [a[0][0], a[1][1], a[2][2], a[3][3]], eigenvectors: v };
  }

  function kabschRotation(pointsA, pointsB) {
    let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
    for (let i = 0; i < pointsA.length; i++) {
      const p = pointsA[i];
      const q = pointsB[i];
      Sxx += p.x * q.x; Sxy += p.x * q.y; Sxz += p.x * q.z;
      Syx += p.y * q.x; Syy += p.y * q.y; Syz += p.y * q.z;
      Szx += p.z * q.x; Szy += p.z * q.y; Szz += p.z * q.z;
    }

    const K = [
      [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
      [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
      [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
      [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz]
    ];

    const { eigenvalues, eigenvectors } = jacobiEigenSymmetric4(K);
    let maxIndex = 0;
    for (let i = 1; i < 4; i++) if (eigenvalues[i] > eigenvalues[maxIndex]) maxIndex = i;
    const w = eigenvectors[0][maxIndex];
    const x = eigenvectors[1][maxIndex];
    const y = eigenvectors[2][maxIndex];
    const z = eigenvectors[3][maxIndex];

    return [
      [w * w + x * x - y * y - z * z, 2 * (x * y - w * z), 2 * (x * z + w * y)],
      [2 * (x * y + w * z), w * w - x * x + y * y - z * z, 2 * (y * z - w * x)],
      [2 * (x * z - w * y), 2 * (y * z + w * x), w * w - x * x - y * y + z * z]
    ];
  }

  function applyRotation(R, p) {
    return {
      x: R[0][0] * p.x + R[0][1] * p.y + R[0][2] * p.z,
      y: R[1][0] * p.x + R[1][1] * p.y + R[1][2] * p.z,
      z: R[2][0] * p.x + R[2][1] * p.y + R[2][2] * p.z
    };
  }

  function alignedRmsd(pointsA, pointsB) {
    const centroidA = centroid(pointsA);
    const centroidB = centroid(pointsB);
    const centeredA = pointsA.map((p) => subtract(p, centroidA));
    const centeredB = pointsB.map((p) => subtract(p, centroidB));
    const R = kabschRotation(centeredA, centeredB);
    let sumSquares = 0;
    for (let i = 0; i < centeredA.length; i++) {
      const rotated = applyRotation(R, centeredA[i]);
      const diff = subtract(rotated, centeredB[i]);
      sumSquares += dot(diff, diff);
    }
    return Math.sqrt(sumSquares / pointsA.length);
  }

  function caTrace(residues) {
    return residues.map((residue) => residue.CA);
  }

  function rebuildResidueSideChain(residues, index, dihedral) {
    const residue = residues[index];
    if (!residue.CB) return residues;
    const chiCount = chiCountFor(residue.residueType);
    const sideChain = buildSideChainAtoms(residue.N, residue.CA, residue.CB, dihedral, chiCount);
    const updated = residues.slice();
    updated[index] = { N: residue.N, CA: residue.CA, C: residue.C, O: residue.O, CB: residue.CB, sideChain, residueType: residue.residueType, sideChainSize: residue.sideChainSize };
    return updated;
  }

  const api = {
    defaultDihedrals,
    buildReferenceDihedrals,
    buildBackbone,
    rebuildResidueSideChain,
    caTrace,
    alignedRmsd,
    chiCountFor
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinGeometry = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
