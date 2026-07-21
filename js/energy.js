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

  function totalEnergy(coords, helices) {
    const n = coords.length;
    let energy = 0;

    const bondStrength = 8.0;
    const idealBondLength = 3.8;
    const helixStrength = 1.2;
    const idealSpacingI3 = 5.0;
    const idealSpacingI4 = 6.2;
    const clashStrength = 25.0;
    const clashMinDistance = 4.0;

    for (let i = 0; i < n; i++) {
      if (i + 1 < n) {
        const bondDistance = distance(coords[i], coords[i + 1]);
        const bondDelta = bondDistance - idealBondLength;
        energy += bondStrength * bondDelta * bondDelta;
      }

      const inHelix = residueInHelix(i + 1, helices);

      if (inHelix && i + 3 < n) {
        const spacingI3 = distance(coords[i], coords[i + 3]);
        const deltaI3 = spacingI3 - idealSpacingI3;
        energy += helixStrength * deltaI3 * deltaI3;
      }

      if (inHelix && i + 4 < n) {
        const spacingI4 = distance(coords[i], coords[i + 4]);
        const deltaI4 = spacingI4 - idealSpacingI4;
        energy += helixStrength * deltaI4 * deltaI4;
      }

      for (let j = i + 3; j < n; j++) {
        const nonBondedDistance = distance(coords[i], coords[j]);
        if (nonBondedDistance < clashMinDistance) {
          const clashDelta = clashMinDistance - nonBondedDistance;
          energy += clashStrength * clashDelta * clashDelta;
        }
      }
    }

    return energy;
  }

  const api = { totalEnergy, distance };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinEnergy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
