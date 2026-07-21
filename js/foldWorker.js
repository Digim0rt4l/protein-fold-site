importScripts("geometry.js", "energy.js");

let running = false;

function cloneDihedrals(dihedrals) {
  return dihedrals.map((d) => ({ phi: d.phi, psi: d.psi, chi1: d.chi1 }));
}

function buildMovableDegreesOfFreedom(sequence) {
  const degreesOfFreedom = [];
  for (let i = 0; i < sequence.length; i++) {
    if (i > 0) degreesOfFreedom.push({ index: i, key: "phi" });
    if (i < sequence.length - 1) degreesOfFreedom.push({ index: i, key: "psi" });
    if (sequence[i] !== "G" && sequence[i] !== "A") degreesOfFreedom.push({ index: i, key: "chi1" });
  }
  return degreesOfFreedom;
}

function runAnnealing(job) {
  const { dihedrals: startDihedrals, helices, sequence, timeBudgetMs } = job;
  const dihedrals = cloneDihedrals(startDihedrals);
  let residues = self.ProteinGeometry.buildBackbone(sequence, dihedrals);
  let energy = self.ProteinEnergy.totalEnergy(residues, dihedrals, helices);

  let bestDihedrals = cloneDihedrals(dihedrals);
  let bestEnergy = energy;

  const degreesOfFreedom = buildMovableDegreesOfFreedom(sequence);
  const startTemp = 3.0;
  const endTemp = 0.02;
  const startTime = Date.now();
  let lastPostTime = startTime;
  let activeResidue = 1;

  while (running) {
    const elapsedMs = Date.now() - startTime;
    if (elapsedMs >= timeBudgetMs) break;

    const progress = elapsedMs / timeBudgetMs;
    const temperature = startTemp * Math.pow(endTemp / startTemp, progress);

    const move = degreesOfFreedom[Math.floor(Math.random() * degreesOfFreedom.length)];
    activeResidue = move.index + 1;
    const previousValue = dihedrals[move.index][move.key];

    const maxStepDeg = 45 * (temperature / startTemp) + 2;
    const proposedValue = previousValue + (Math.random() - 0.5) * 2 * maxStepDeg;
    dihedrals[move.index][move.key] = proposedValue;

    const candidateResidues = self.ProteinGeometry.buildBackbone(sequence, dihedrals);
    const candidateEnergy = self.ProteinEnergy.totalEnergy(candidateResidues, dihedrals, helices);
    const delta = candidateEnergy - energy;
    const accept = delta < 0 || Math.random() < Math.exp(-delta / temperature);

    if (accept) {
      energy = candidateEnergy;
      residues = candidateResidues;
      if (energy < bestEnergy) {
        bestEnergy = energy;
        bestDihedrals = cloneDihedrals(dihedrals);
      }
    } else {
      dihedrals[move.index][move.key] = previousValue;
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
        residues,
        activeResidue
      });
    }
  }

  self.postMessage({ type: "done", dihedrals: bestDihedrals, energy: bestEnergy });
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
