/* geometry.js
 * Builds a starting C-alpha-only 3D backbone from a protein's helix
 * annotation, using standard alpha-helix parameters (rise 1.5 A/residue,
 * radius 2.3 A, twist 100 deg/residue) and an extended zig-zag for
 * coil/loop residues. This is a coarse-grained starting scaffold, not
 * the literal deposited atomic coordinates.
 *
 * Loaded as a plain script in the browser (attaches to window.ProteinGeometry)
 * and required as a CommonJS module from Netlify Functions.
 */
(function (root) {
  "use strict";

  function inHelix(resIndex1based, helices) {
    for (var i = 0; i < helices.length; i++) {
      if (resIndex1based >= helices[i].start && resIndex1based <= helices[i].end) return true;
    }
    return false;
  }

  // Build initial coordinates. Returns array of {x,y,z} length = residueCount.
  function buildInitialCoordinates(residueCount, helices) {
    var coords = [];
    var pos = { x: 0, y: 0, z: 0 };
    var angle = 0;
    var helixRadius = 2.3;
    var helixRise = 1.5;
    var helixTwistDeg = 100;
    var coilStep = 3.8;
    var dir = 1;

    for (var i = 0; i < residueCount; i++) {
      var res1 = i + 1;
      if (inHelix(res1, helices)) {
        angle += (helixTwistDeg * Math.PI) / 180;
        pos = {
          x: helixRadius * Math.cos(angle),
          y: i * helixRise,
          z: helixRadius * Math.sin(angle)
        };
      } else {
        // simple extended zig-zag for coil/turn regions, continuing
        // roughly from wherever the helix left off
        var prev = coords[i - 1] || { x: 0, y: 0, z: 0 };
        dir = i % 2 === 0 ? 1 : -1;
        pos = {
          x: prev.x + coilStep * 0.55 * dir,
          y: prev.y + coilStep * 0.75,
          z: prev.z + coilStep * 0.25 * dir
        };
      }
      coords.push(pos);
    }
    return coords;
  }

  var api = { buildInitialCoordinates: buildInitialCoordinates, inHelix: inHelix };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinGeometry = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
