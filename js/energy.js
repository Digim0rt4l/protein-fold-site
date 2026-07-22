(function (root) {
  "use strict";

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function residueInHelix(residueNumber, helices) {
    for (let i = 0; i < helices.length; i++) {
      if (residueNumber >= helices[i].start && residueNumber <= helices[i].end) return true;
    }
    return false;
  }

  function wrappedAngleDeltaDeg(a, b) {
    return (((a - b + 180) % 360) + 360) % 360 - 180;
  }

  const ATOM_RADIUS = { N: 1.55, CA: 1.7, C: 1.7, O: 1.52 };
  const SIDE_CHAIN_RADIUS = { 1: 1.8, 2: 2.3, 3: 2.8 };

  function residueAtomsWithRadii(residue) {
    const atoms = [
      { position: residue.N, radius: ATOM_RADIUS.N },
      { position: residue.CA, radius: ATOM_RADIUS.CA },
      { position: residue.C, radius: ATOM_RADIUS.C },
      { position: residue.O, radius: ATOM_RADIUS.O }
    ];
    const sideChainRadius = SIDE_CHAIN_RADIUS[residue.sideChainSize] || SIDE_CHAIN_RADIUS[1];
    if (residue.CB) atoms.push({ position: residue.CB, radius: sideChainRadius });
    residue.sideChain.forEach((atom) => atoms.push({ position: atom, radius: sideChainRadius }));
    return atoms;
  }

  function clashEnergy(residues) {
    const clashStrength = 20.0;
    const clashTolerance = 0.65;
    let energy = 0;

    for (let i = 0; i < residues.length; i++) {
      const atomsI = residueAtomsWithRadii(residues[i]);
      for (let j = i + 2; j < residues.length; j++) {
        const atomsJ = residueAtomsWithRadii(residues[j]);
        for (let a = 0; a < atomsI.length; a++) {
          for (let b = 0; b < atomsJ.length; b++) {
            const threshold = (atomsI[a].radius + atomsJ[b].radius) * clashTolerance;
            const d = distance(atomsI[a].position, atomsJ[b].position);
            if (d < threshold) {
              const delta = threshold - d;
              energy += clashStrength * delta * delta;
            }
          }
        }
      }
    }
    return energy;
  }

  function torsionPreferenceEnergy(dihedrals, helices) {
    const springConstant = 0.004;
    const helixPhi = -57;
    const helixPsi = -47;
    let energy = 0;

    for (let i = 0; i < dihedrals.length; i++) {
      const residueNumber = i + 1;
      if (!residueInHelix(residueNumber, helices)) continue;
      const deltaPhi = wrappedAngleDeltaDeg(dihedrals[i].phi, helixPhi);
      const deltaPsi = wrappedAngleDeltaDeg(dihedrals[i].psi, helixPsi);
      energy += springConstant * (deltaPhi * deltaPhi + deltaPsi * deltaPsi);
    }
    return energy;
  }

  function chiRotamerEnergy(residues, dihedrals, chiCountFor) {
    const springConstant = 4.0;
    const chiKeys = ["chi1", "chi2", "chi3", "chi4"];
    let energy = 0;

    for (let i = 0; i < residues.length; i++) {
      const chiCount = chiCountFor(residues[i].residueType);
      for (let c = 0; c < chiCount; c++) {
        const chiRad = (dihedrals[i][chiKeys[c]] * Math.PI) / 180;
        energy += springConstant * (1 + Math.cos(3 * chiRad));
      }
    }
    return energy;
  }

  function totalEnergy(residues, dihedrals, helices, chiCountFor) {
    return clashEnergy(residues) + torsionPreferenceEnergy(dihedrals, helices) + chiRotamerEnergy(residues, dihedrals, chiCountFor);
  }

  const api = { totalEnergy };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinEnergy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
