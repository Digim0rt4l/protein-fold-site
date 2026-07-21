importScripts("geometry.js", "energy.js");

let running = false;

function cloneCoords(coords) {
  return coords.map((point) => ({ x: point.x, y: point.y, z: point.z }));
}

function relaxBonds(coords, lo, hi, passes) {
  const idealBondLength = 3.8;
  for (let pass = 0; pass < passes; pass++) {
    for (let i = Math.max(0, lo - 1); i < Math.min(coords.length - 1, hi + 1); i++) {
      const a = coords[i];
      const b = coords[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz) || 0.0001;
      const diff = (distance - idealBondLength) / distance;
      const aFixed = i < lo;
      const bFixed = i + 1 > hi;
      if (aFixed && bFixed) continue;
      let moveA = 0.5;
      let moveB = 0.5;
      if (aFixed && !bFixed) {
        moveA = 0;
        moveB = 1;
      }
      if (bFixed && !aFixed) {
        moveA = 1;
        moveB = 0;
      }
      a.x += diff * dx * moveA;
      a.y += diff * dy * moveA;
      a.z += diff * dz * moveA;
      b.x -= diff * dx * moveB;
      b.y -= diff * dy * moveB;
      b.z -= diff * dz * moveB;
    }
  }
}

function runAnnealing(job) {
  const { coords: startCoords, helices, unit, timeBudgetMs } = job;
  const coords = cloneCoords(startCoords);
  let bestCoords = cloneCoords(startCoords);
  let energy = self.ProteinEnergy.totalEnergy(coords, helices);
  let bestEnergy = energy;

  const lo = unit.start - 1;
  const hi = unit.end - 1;
  const startTemp = 6.0;
  const endTemp = 0.05;
  const startTime = Date.now();
  let lastPostTime = startTime;
  let activeResidue = unit.start;

  while (running) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= timeBudgetMs) break;

    const progress = elapsedMs / timeBudgetMs;
    const temperature = startTemp * Math.pow(endTemp / startTemp, progress);

    const idx = lo + Math.floor(Math.random() * (hi - lo + 1));
    activeResidue = idx + 1;
    const previous = { x: coords[idx].x, y: coords[idx].y, z: coords[idx].z };

    const scale = 1.2 * (temperature / startTemp) + 0.15;
    coords[idx].x += (Math.random() - 0.5) * scale;
    coords[idx].y += (Math.random() - 0.5) * scale;
    coords[idx].z += (Math.random() - 0.5) * scale;

    relaxBonds(coords, lo, hi, 6);

    const newEnergy = self.ProteinEnergy.totalEnergy(coords, helices);
    const delta = newEnergy - energy;
    const accept = delta < 0 || Math.random() < Math.exp(-delta / temperature);

    if (accept) {
      energy = newEnergy;
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestCoords = cloneCoords(coords);
      }
    } else {
      coords[idx] = previous;
      relaxBonds(coords, lo, hi, 6);
    }

    const now = Date.now();
    if (now - lastPostTime >= 400) {
      lastPostTime = now;
      self.postMessage({
        type: "progress",
        elapsedMs,
        timeBudgetMs,
        energy,
        bestEnergy,
        coords: cloneCoords(coords),
        activeResidue
      });
    }
  }

  self.postMessage({ type: "done", coords: bestCoords, energy: bestEnergy });
}

self.onmessage = (event) => {
  const message = event.data;
  if (message.type === "start") {
    running = true;
    runAnnealing(message.job);
  } else if (message.type === "stop") {
    running = false;
  }
};
