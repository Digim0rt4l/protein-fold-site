(function (root) {
  "use strict";

  function inHelix(residueNumber, helices) {
    for (let i = 0; i < helices.length; i++) {
      if (residueNumber >= helices[i].start && residueNumber <= helices[i].end) return true;
    }
    return false;
  }

  function buildInitialCoordinates(residueCount, helices) {
    const coords = [];
    let position = { x: 0, y: 0, z: 0 };
    let angle = 0;
    const helixRadius = 2.3;
    const helixRise = 1.5;
    const helixTwistRadians = (100 * Math.PI) / 180;
    const coilStep = 3.8;

    for (let i = 0; i < residueCount; i++) {
      const residueNumber = i + 1;
      if (inHelix(residueNumber, helices)) {
        angle += helixTwistRadians;
        position = {
          x: helixRadius * Math.cos(angle),
          y: i * helixRise,
          z: helixRadius * Math.sin(angle)
        };
      } else {
        const previous = coords[i - 1] || { x: 0, y: 0, z: 0 };
        const direction = i % 2 === 0 ? 1 : -1;
        position = {
          x: previous.x + coilStep * 0.55 * direction,
          y: previous.y + coilStep * 0.75,
          z: previous.z + coilStep * 0.25 * direction
        };
      }
      coords.push(position);
    }
    return coords;
  }

  const api = { buildInitialCoordinates, inHelix };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinGeometry = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
