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
    let delta = ((a - b + 180) % 360 + 360) % 360 - 180;
    return delta;
  }

  function clashEnergy(residues) {
    const clashMinDistance = 3.0;
    const clashStrength = 20.0;
    let energy = 0;

    for (let i = 0; i < residues.length; i++) {
      for (let j = i + 2; j < residues.length; j++) {
        const atomsI = [residues[i].N, residues[i].CA, residues[i].C];
        const atomsJ = [residues[j].N, residues[j].CA, residues[j].C];
        for (let a = 0; a < atomsI.length; a++) {
          for (let b = 0; b < atomsJ.length; b++) {
            const d = distance(atomsI[a], atomsJ[b]);
            if (d < clashMinDistance) {
              const delta = clashMinDistance - d;
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

  function totalEnergy(residues, dihedrals, helices) {
    return clashEnergy(residues) + torsionPreferenceEnergy(dihedrals, helices);
  }

  const api = { totalEnergy, clashEnergy, torsionPreferenceEnergy, distance, wrappedAngleDeltaDeg };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinEnergy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
