/* energy.js
 * A simplified, coarse-grained (C-alpha only) scoring function.
 * This is deliberately lightweight so it can run thousands of times per
 * second in a browser tab or phone -- it is an educational stand-in for
 * a real molecular force field, not a substitute for one.
 *
 * Terms:
 *  - bond:   keeps consecutive C-alpha atoms ~3.8 A apart
 *  - helix:  rewards i->i+3 (~5.0 A) and i->i+4 (~6.2 A) spacing inside
 *            the peptide's real, PDB-annotated helical regions
 *  - clash:  steep penalty for any two non-bonded atoms closer than 4.0 A
 *
 * Lower total energy = better/more plausible conformation.
 */
(function (root) {
  "use strict";

  function dist(a, b) {
    var dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  function totalEnergy(coords, helices) {
    var n = coords.length;
    var e = 0;
    var K_BOND = 8.0, IDEAL_BOND = 3.8;
    var K_HELIX = 1.2, IDEAL_I3 = 5.0, IDEAL_I4 = 6.2;
    var K_CLASH = 25.0, CLASH_MIN = 4.0;

    for (var i = 0; i < n; i++) {
      if (i + 1 < n) {
        var d1 = dist(coords[i], coords[i + 1]);
        e += K_BOND * (d1 - IDEAL_BOND) * (d1 - IDEAL_BOND);
      }
      var inHelixI = inHelixFallback(i + 1, helices);

      if (inHelixI && i + 3 < n) {
        var d3 = dist(coords[i], coords[i + 3]);
        e += K_HELIX * (d3 - IDEAL_I3) * (d3 - IDEAL_I3);
      }
      if (inHelixI && i + 4 < n) {
        var d4 = dist(coords[i], coords[i + 4]);
        e += K_HELIX * (d4 - IDEAL_I4) * (d4 - IDEAL_I4);
      }
      for (var j = i + 3; j < n; j++) {
        var dnb = dist(coords[i], coords[j]);
        if (dnb < CLASH_MIN) {
          e += K_CLASH * (CLASH_MIN - dnb) * (CLASH_MIN - dnb);
        }
      }
    }
    return e;
  }

  function inHelixFallback(res1, helices) {
    for (var k = 0; k < helices.length; k++) {
      if (res1 >= helices[k].start && res1 <= helices[k].end) return true;
    }
    return false;
  }

  var api = { totalEnergy: totalEnergy, dist: dist };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.ProteinEnergy = api;
  }
})(typeof window !== "undefined" ? window : globalThis);
