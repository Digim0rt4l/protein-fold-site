// foldWorker.js -- classic (non-module) worker so importScripts works everywhere.
importScripts("geometry.js", "energy.js");

let running = false;

function cloneCoords(coords) {
  return coords.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

// Position-based relaxation: keeps consecutive C-alpha atoms ~3.8 A apart.
// Atoms strictly outside [lo, hi] act as fixed anchors so a work unit's
// optimization doesn't tear the rest of the chain apart.
function relaxBonds(coords, lo, hi, passes) {
  const IDEAL = 3.8;
  for (let p = 0; p < passes; p++) {
    for (let i = Math.max(0, lo - 1); i < Math.min(coords.length - 1, hi + 1); i++) {
      const a = coords[i], b = coords[i + 1];
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const diff = (d - IDEAL) / d;
      const aFixed = i < lo;
      const bFixed = i + 1 > hi;
      let moveA = 0.5, moveB = 0.5;
      if (aFixed && !bFixed) { moveA = 0; moveB = 1; }
      if (bFixed && !aFixed) { moveA = 1; moveB = 0; }
      if (aFixed && bFixed) continue;
      a.x += diff * dx * moveA; a.y += diff * dy * moveA; a.z += diff * dz * moveA;
      b.x -= diff * dx * moveB; b.y -= diff * dy * moveB; b.z -= diff * dz * moveB;
    }
  }
}

function runAnnealing(job) {
  const { coords: startCoords, helices, unit, iterations } = job;
  let coords = cloneCoords(startCoords);
  let bestCoords = cloneCoords(startCoords);
  let energy = self.ProteinEnergy.totalEnergy(coords, helices);
  let bestEnergy = energy;

  const lo = unit.start - 1; // 0-indexed
  const hi = unit.end - 1;
  const startTemp = 6.0;
  const endTemp = 0.05;

  for (let iter = 0; iter < iterations && running; iter++) {
    const t = iter / iterations;
    const temp = startTemp * Math.pow(endTemp / startTemp, t);

    const idx = lo + Math.floor(Math.random() * (hi - lo + 1));
    const prev = { x: coords[idx].x, y: coords[idx].y, z: coords[idx].z };

    const scale = 1.2 * temp / startTemp + 0.15;
    coords[idx].x += (Math.random() - 0.5) * scale;
    coords[idx].y += (Math.random() - 0.5) * scale;
    coords[idx].z += (Math.random() - 0.5) * scale;

    relaxBonds(coords, lo, hi, 6);

    const newEnergy = self.ProteinEnergy.totalEnergy(coords, helices);
    const delta = newEnergy - energy;
    const accept = delta < 0 || Math.random() < Math.exp(-delta / temp);

    if (accept) {
      energy = newEnergy;
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestCoords = cloneCoords(coords);
      }
    } else {
      coords[idx] = prev;
      relaxBonds(coords, lo, hi, 6);
    }

    if (iter % 15 === 0 || iter === iterations - 1) {
      self.postMessage({
        type: "progress",
        iteration: iter,
        iterations,
        energy,
        bestEnergy,
        coords: cloneCoords(coords),
        activeResidue: idx + 1
      });
    }
  }

  self.postMessage({ type: "done", coords: bestCoords, energy: bestEnergy });
}

self.onmessage = (e) => {
  const msg = e.data;
  if (msg.type === "start") {
    running = true;
    runAnnealing(msg.job);
  } else if (msg.type === "stop") {
    running = false;
  }
};
