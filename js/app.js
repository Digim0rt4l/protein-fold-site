const ITERATIONS_PER_UNIT = 3000;
const STATUS_POLL_MS = 6000;

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
  aboutClose: document.getElementById("about-close")
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

let currentView = "global"; // 'global' | 'mine'
let latestGlobal = null; // { coords, energy, helices, claims, units, stats, initialEnergy }
let latestMine = null;   // { coords, helices, highlightRange }
let deviceCompletedCount = 0;
let contributing = false;
let worker = null;
let currentUnit = null;

function fmtEnergy(e) {
  return e == null ? "\u2014" : e.toFixed(1);
}

function renderCurrentView() {
  if (!window.ProteinViewer) return;
  if (currentView === "global" && latestGlobal) {
    window.ProteinViewer.render(latestGlobal.coords, latestGlobal.helices, null);
  } else if (currentView === "mine" && latestMine) {
    window.ProteinViewer.render(latestMine.coords, latestMine.helices, latestMine.highlightRange);
  } else if (latestGlobal) {
    window.ProteinViewer.render(latestGlobal.coords, latestGlobal.helices, null);
  }
}

function setView(view) {
  currentView = view;
  els.toggleGlobal.classList.toggle("active", view === "global");
  els.toggleMine.classList.toggle("active", view === "mine");
  renderCurrentView();
}

function updateGlobalStatsUI(data) {
  els.energy.textContent = fmtEnergy(data.energy);
  const improvement = data.initialEnergy - data.energy;
  els.improvement.textContent = (improvement >= 0 ? "-" : "+") + Math.abs(improvement).toFixed(1);
  els.completed.textContent = data.stats.totalCompleted;
  els.contributors.textContent = Object.keys(data.stats.contributors || {}).length;
  const claimedCount = Object.keys(data.claims || {}).length;
  els.claimed.textContent = `${claimedCount} / ${data.units.length}`;

  const EPOCH_SIZE = 50;
  const epoch = Math.floor(data.stats.totalCompleted / EPOCH_SIZE);
  const pct = Math.round(((data.stats.totalCompleted % EPOCH_SIZE) / EPOCH_SIZE) * 100);
  els.epochNum.textContent = epoch;
  els.epochPct.textContent = pct + "%";
  els.epochFill.style.width = pct + "%";
}

async function fetchStatus() {
  const res = await fetch("/api/status");
  if (!res.ok) throw new Error("status fetch failed");
  const data = await res.json();
  latestGlobal = { coords: data.coords, helices: data.protein.helices, initialEnergy: data.initialEnergy, energy: data.energy, units: data.units, claims: data.claims, stats: data.stats };
  updateGlobalStatsUI(latestGlobal);
  if (currentView === "global") renderCurrentView();
  return data;
}

function startPolling() {
  fetchStatus().catch(() => {});
  setInterval(() => fetchStatus().catch(() => {}), STATUS_POLL_MS);
}

async function claimUnit() {
  const res = await fetch("/api/claim", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId })
  });
  if (!res.ok) throw new Error("claim failed");
  return res.json();
}

async function submitResult(unitId, coords) {
  const res = await fetch("/api/submit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, unitId, coords })
  });
  if (!res.ok) throw new Error("submit failed");
  return res.json();
}

function ensureWorker() {
  if (!worker) worker = new Worker("js/foldWorker.js");
  return worker;
}

async function contributionLoop() {
  while (contributing) {
    try {
      els.deviceStatus.textContent = "requesting work unit\u2026";
      const claim = await claimUnit();
      currentUnit = claim.unit;
      els.deviceUnit.textContent = `${claim.unit.id} (res ${claim.unit.start}\u2013${claim.unit.end})`;
      els.deviceStatus.textContent = "optimizing";

      const helices = claim.protein.helices;
      const w = ensureWorker();

      const result = await new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          const msg = e.data;
          if (msg.type === "progress") {
            const pct = Math.round((msg.iteration / msg.iterations) * 100);
            els.unitPct.textContent = pct + "%";
            els.unitFill.style.width = pct + "%";
            latestMine = {
              coords: msg.coords,
              helices,
              highlightRange: { start: claim.unit.start, end: claim.unit.end }
            };
            if (currentView === "mine") renderCurrentView();
          } else if (msg.type === "done") {
            resolve(msg);
          }
        };
        w.onerror = reject;
        w.postMessage({
          type: "start",
          job: { coords: claim.coords, helices, unit: claim.unit, iterations: ITERATIONS_PER_UNIT }
        });
      });

      els.deviceStatus.textContent = "submitting result\u2026";
      const submission = await submitResult(claim.unit.id, result.coords);
      deviceCompletedCount += 1;
      els.deviceCompleted.textContent = deviceCompletedCount;
      updateGlobalStatsUI({
        coords: submission.coords,
        initialEnergy: latestGlobal ? latestGlobal.initialEnergy : submission.energy,
        energy: submission.energy,
        stats: submission.stats,
        units: latestGlobal ? latestGlobal.units : [],
        claims: latestGlobal ? latestGlobal.claims : {},
        protein: { helices }
      });
      latestGlobal = {
        coords: submission.coords,
        helices,
        initialEnergy: latestGlobal ? latestGlobal.initialEnergy : submission.energy,
        energy: submission.energy,
        units: latestGlobal ? latestGlobal.units : [],
        claims: {},
        stats: submission.stats
      };
      if (currentView === "global") renderCurrentView();
    } catch (err) {
      console.error(err);
      els.deviceStatus.textContent = "hit a snag, retrying\u2026";
      await new Promise((r) => setTimeout(r, 4000));
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

window.addEventListener("DOMContentLoaded", () => {
  const container = document.getElementById("viewer");
  if (window.ProteinViewer) window.ProteinViewer.init(container);
  startPolling();
});
