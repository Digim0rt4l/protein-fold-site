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

  const ATOM_RADIUS = { N: 1.55, CA: 1.7, C: 1.7 };
  const SIDE_CHAIN_RADIUS = { 1: 1.8, 2: 2.3, 3: 2.8 };
  const CLASH_TOLERANCE = 0.65;

  function residueAtomsWithRadii(residue) {
    const atoms = [
      { position: residue.N, radius: ATOM_RADIUS.N },
      { position: residue.CA, radius: ATOM_RADIUS.CA },
      { position: residue.C, radius: ATOM_RADIUS.C }
    ];
    const sideChainRadius = SIDE_CHAIN_RADIUS[residue.sideChainSize] || SIDE_CHAIN_RADIUS[1];
    if (residue.CB) atoms.push({ position: residue.CB, radius: sideChainRadius });
    if (residue.SC) atoms.push({ position: residue.SC, radius: sideChainRadius });
    return atoms;
  }

  function clashEnergy(residues) {
    const clashStrength = 20.0;
    let energy = 0;

    for (let i = 0; i < residues.length; i++) {
      const atomsI = residueAtomsWithRadii(residues[i]);
      for (let j = i + 2; j < residues.length; j++) {
        const atomsJ = residueAtomsWithRadii(residues[j]);
        for (let a = 0; a < atomsI.length; a++) {
          for (let b = 0; b < atomsJ.length; b++) {
            const threshold = (atomsI[a].radius + atomsJ[b].radius) * CLASH_TOLERANCE;
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

  function residueHasChi1(residue) {
    return residue.residueType !== "G" && residue.residueType !== "A";
  }

  function chi1RotamerEnergy(residues, dihedrals) {
    const springConstant = 4.0;
    let energy = 0;

    for (let i = 0; i < residues.length; i++) {
      if (!residueHasChi1(residues[i])) continue;
      const chi1Rad = (dihedrals[i].chi1 * Math.PI) / 180;
      energy += springConstant * (1 + Math.cos(3 * chi1Rad));
    }
    return energy;
  }

  function totalEnergy(residues, dihedrals, helices) {
    return clashEnergy(residues) + torsionPreferenceEnergy(dihedrals, helices) + chi1RotamerEnergy(residues, dihedrals);
  }

  const api = { totalEnergy };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinEnergy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
