const TIME_BUDGET_MS = 30 * 60 * 1000;
const EPOCH_SIZE = 50;

const els = {
  energy: document.getElementById("stat-energy"),
  improvement: document.getElementById("stat-improvement"),
  completed: document.getElementById("stat-completed"),
  contributors: document.getElementById("stat-contributors"),
  claimed: document.getElementById("stat-claimed"),
  epochNum: document.getElementById("epoch-num"),
  epochPct: document.getElementById("epoch-pct"),
  epochFill: document.getElementById("epoch-fill"),
  deviceStatus: document.getElementById("device-status"),
  deviceUnit: document.getElementById("device-unit"),
  deviceCompleted: document.getElementById("device-completed"),
  unitPct: document.getElementById("unit-pct"),
  unitFill: document.getElementById("unit-fill"),
  runBtn: document.getElementById("run-btn"),
  toggleGlobal: document.getElementById("toggle-global"),
  toggleMine: document.getElementById("toggle-mine"),
  aboutBtn: document.getElementById("about-btn"),
  aboutDialog: document.getElementById("about-dialog"),
  aboutClose: document.getElementById("about-close"),
  statsPanel: document.getElementById("stats-panel"),
  hideStatsBtn: document.getElementById("hide-stats-btn"),
  showStatsBtn: document.getElementById("show-stats-btn")
};

function getClientId() {
  let id = localStorage.getItem("proteinfold_client_id");
  if (!id) {
    id = "dev-" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    localStorage.setItem("proteinfold_client_id", id);
  }
  return id;
}

const clientId = getClientId();

let currentView = "global";
let latestGlobal = null;
let latestMine = null;
let deviceCompletedCount = 0;
let contributing = false;
let worker = null;

function formatEnergy(value) {
  return value == null ? "\u2014" : value.toFixed(2);
}

function residuesFromPhiPsi(phiPsi, sequence) {
  return window.ProteinGeometry.buildBackbone(sequence, phiPsi);
}

function renderCurrentView() {
  if (!window.ProteinViewer) return;
  if (currentView === "global" && latestGlobal) {
    window.ProteinViewer.render(latestGlobal.residues, latestGlobal.helices, null);
  } else if (currentView === "mine" && latestMine) {
    window.ProteinViewer.render(latestMine.residues, latestMine.helices, latestMine.activeResidue);
  } else if (latestGlobal) {
    window.ProteinViewer.render(latestGlobal.residues, latestGlobal.helices, null);
  }
}

function setView(view) {
  currentView = view;
  els.toggleGlobal.classList.toggle("active", view === "global");
  els.toggleMine.classList.toggle("active", view === "mine");
  renderCurrentView();
  if (view === "global") fetchStatus().catch(() => {});
}

function setStatsVisible(visible) {
  els.statsPanel.hidden = !visible;
  els.showStatsBtn.hidden = visible;
}

function updateGlobalStatsUI(data) {
  els.energy.textContent = formatEnergy(data.energy);
  const improvement = data.initialEnergy - data.energy;
  els.improvement.textContent = (improvement >= 0 ? "-" : "+") + Math.abs(improvement).toFixed(2);
  els.completed.textContent = data.stats.totalCompleted;
  els.contributors.textContent = Object.keys(data.stats.contributors || {}).length;
  els.claimed.textContent = String(Object.keys(data.claims || {}).length);

  const epoch = Math.floor(data.stats.totalCompleted / EPOCH_SIZE);
  const percent = Math.round(((data.stats.totalCompleted % EPOCH_SIZE) / EPOCH_SIZE) * 100);
  els.epochNum.textContent = epoch;
  els.epochPct.textContent = percent + "%";
  els.epochFill.style.width = percent + "%";
}

async function fetchStatus() {
  const response = await fetch("/api/status");
  if (!response.ok) throw new Error("status fetch failed");
  const data = await response.json();
  latestGlobal = {
    residues: residuesFromPhiPsi(data.phiPsi, data.protein.sequence),
    helices: data.protein.helices,
    initialEnergy: data.initialEnergy,
    energy: data.energy,
    claims: data.claims,
    stats: data.stats
  };
  updateGlobalStatsUI(latestGlobal);
  if (currentView === "global") renderCurrentView();
  return data;
}

async function claimTrajectory() {
  const response = await fetch("/api/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });
  if (!response.ok) throw new Error("claim failed");
  return response.json();
}

async function submitResult(trajectoryId, phiPsi) {
  const response = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, trajectoryId, phiPsi })
  });
  if (!response.ok) throw new Error("submit failed");
  return response.json();
}

function ensureWorker() {
  if (!worker) worker = new Worker("js/foldWorker.js");
  return worker;
}

async function contributionLoop() {
  while (contributing) {
    try {
      els.deviceStatus.textContent = "requesting a trajectory\u2026";
      const claim = await claimTrajectory();
      els.deviceUnit.textContent = claim.trajectoryId.slice(0, 8);
      els.deviceStatus.textContent = "optimizing";

      const helices = claim.protein.helices;
      const sequence = claim.protein.sequence;
      const activeWorker = ensureWorker();

      const result = await new Promise((resolve, reject) => {
        activeWorker.onmessage = (event) => {
          const message = event.data;
          if (message.type === "progress") {
            const percent = Math.round((message.elapsedMs / message.timeBudgetMs) * 100);
            els.unitPct.textContent = percent + "%";
            els.unitFill.style.width = percent + "%";
            latestMine = {
              residues: message.residues,
              helices,
              activeResidue: message.activeResidue
            };
            if (currentView === "mine") renderCurrentView();
          } else if (message.type === "done") {
            resolve(message);
          }
        };
        activeWorker.onerror = reject;
        activeWorker.postMessage({
          type: "start",
          job: { dihedrals: claim.phiPsi, helices, sequence, timeBudgetMs: TIME_BUDGET_MS }
        });
      });

      els.deviceStatus.textContent = "submitting result\u2026";
      const submission = await submitResult(claim.trajectoryId, result.dihedrals);
      deviceCompletedCount += 1;
      els.deviceCompleted.textContent = deviceCompletedCount;

      latestGlobal = {
        residues: residuesFromPhiPsi(submission.phiPsi, sequence),
        helices,
        initialEnergy: latestGlobal ? latestGlobal.initialEnergy : submission.energy,
        energy: submission.energy,
        claims: latestGlobal ? latestGlobal.claims : {},
        stats: submission.stats
      };
      updateGlobalStatsUI(latestGlobal);
      if (currentView === "global") renderCurrentView();
    } catch (error) {
      els.deviceStatus.textContent = "hit a snag, retrying\u2026";
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }
  }
  els.deviceStatus.textContent = "paused";
  els.unitPct.textContent = "0%";
  els.unitFill.style.width = "0%";
}

els.runBtn.addEventListener("click", () => {
  contributing = !contributing;
  els.runBtn.textContent = contributing ? "Pause contributing" : "Start contributing";
  els.runBtn.classList.toggle("running", contributing);
  if (contributing) {
    contributionLoop();
  } else if (worker) {
    worker.postMessage({ type: "stop" });
  }
});

els.toggleGlobal.addEventListener("click", () => setView("global"));
els.toggleMine.addEventListener("click", () => setView("mine"));

els.aboutBtn.addEventListener("click", () => els.aboutDialog.showModal());
els.aboutClose.addEventListener("click", () => els.aboutDialog.close());

els.hideStatsBtn.addEventListener("click", () => setStatsVisible(false));
els.showStatsBtn.addEventListener("click", () => setStatsVisible(true));

document.addEventListener("visibilitychange", () => {
  if (!document.hidden) fetchStatus().catch(() => {});
});

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("viewer");
  if (window.ProteinViewer) window.ProteinViewer.init(container);
  if (typeof Worker === "undefined") {
    els.runBtn.disabled = true;
    els.deviceStatus.textContent = "unsupported browser";
  }
  fetchStatus().catch(() => {});
});
