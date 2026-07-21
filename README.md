# Aβ42 Fold

A dark-mode, 3D, distributed conformational-search site. Visitors' devices each pick up a
small "work unit" (a short stretch of backbone from **amyloid-beta 1-42**, PDB entry
[1IYT](https://www.rcsb.org/structure/1IYT) — the peptide central to the amyloid hypothesis
of Alzheimer's disease), run a short simulated-annealing search on it in a background
thread, and submit the result. A Netlify Function independently re-scores every submission
and merges it into one shared structure, stored as a JSON file in a GitHub repo, so every
visitor sees the same evolving 3D model.

**Please read this honestly:** the energy function is a simplified, coarse-grained
(C-alpha-only) model, chosen so it can run fast on a phone in a browser tab. It's a real,
working distributed system and a genuine (if toy) optimization problem — a great teaching
tool and demo — but it is not a production molecular-dynamics engine like Folding@home, and
it won't generate new, publishable Alzheimer's science by itself. Say so if anyone asks.

---

## What's in this archive

```
index.html              the page
css/style.css           dark theme
js/app.js                orchestrates everything in the browser
js/viewer.js              three.js 3D renderer
js/foldWorker.js          Web Worker running the simulated-annealing search
js/geometry.js            builds the starting backbone from real helix data (shared w/ server)
js/energy.js              the scoring function (shared w/ server, so scoring is consistent)
data/protein.json         real sequence + secondary-structure annotation for 1IYT
netlify/functions/        the serverless backend (talks to GitHub for you)
netlify.toml              Netlify config + /api/* routes
package.json
```

## How the pieces fit together

- **Netlify** hosts the static site and three small serverless functions:
  `get-status`, `claim-workunit`, `submit-result` (reachable at `/api/status`,
  `/api/claim`, `/api/submit`).
- **GitHub** is the shared database. The functions read and write one file,
  `data/state.json`, in a repo of your choosing, using the GitHub Contents API.
  That's the "seamless GitHub + Netlify" connection you asked for: Netlify does the
  compute/serving, GitHub does the storage, and nothing else is needed (no
  database to provision).
- This design comfortably supports the "up to ~10 devices at once" scale you
  described. It uses simple read-modify-write with automatic retries, which is
  fine at this scale; it is **not** built to survive hundreds of simultaneous
  writers (that would need a real database).

## One important setup decision: one repo, or two?

Every time someone submits a result, the function **commits a change** to
`data/state.json` in your GitHub repo. If that's the *same* repo Netlify is
deploying your site from, GitHub will ping Netlify and Netlify will **rebuild
and redeploy your whole site on every single work-unit submission.** That
still works, but it's slow and wastes your Netlify build minutes.

**Recommended:** use two repos:
1. `protein-fold-site` — the code in this archive; this is what Netlify builds/deploys.
2. `protein-fold-data` — an empty repo (just check "Initialize with a README"
   when you create it) that only ever holds `data/state.json`. Netlify never
   touches this repo; it's purely storage the functions read/write via the API.

If you'd rather keep everything in one repo, that's fine too — just skip step 2
below and point `GITHUB_REPO` at your site repo instead.

---

## Step-by-step setup

### 1. Create your GitHub repo(s)
On github.com, create **protein-fold-site** (for the code) and, if you're
following the recommendation above, **protein-fold-data** (check "Initialize
this repository with a README" so it has a `main` branch already).

### 2. Push this code to `protein-fold-site`
Unzip this archive, then from inside the folder:
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/<your-username>/protein-fold-site.git
git push -u origin main
```

### 3. Create a GitHub token
GitHub → Settings → Developer settings → **Fine-grained personal access
tokens** → Generate new token.
- Resource owner: you
- Repository access: only select **protein-fold-data** (or your single repo)
- Permissions: **Contents → Read and write**
- Copy the token now; you won't see it again.

### 4. Connect Netlify to your site repo
Netlify → **Add new site → Import an existing project** → pick
`protein-fold-site`. Netlify will read `netlify.toml` automatically (build
command: none needed, publish directory `.`, functions directory
`netlify/functions`). Click **Deploy**.

### 5. Add environment variables
In Netlify: **Site configuration → Environment variables**, add:
| Key | Value |
|---|---|
| `GITHUB_TOKEN` | the token from step 3 |
| `GITHUB_OWNER` | your GitHub username or org |
| `GITHUB_REPO` | `protein-fold-data` (or your single repo name) |
| `GITHUB_BRANCH` | `main` |

Then **Deploys → Trigger deploy** once so the functions pick up the new
variables.

### 6. Try it
Open your Netlify URL. Click **Start contributing**. Watch the "My work unit"
view pulse as it optimizes, watch it get submitted, and watch the "Global
best" view update (poll interval is ~6 seconds, or switch back and forth to
force a refresh). Open the site on a second device/tab to see multiple
contributors working at once, exactly as you asked for.

## Customizing
- **Different protein:** edit `data/protein.json` (sequence, helix ranges,
  citation). Everything downstream (geometry, energy, work-unit slicing)
  derives from that file automatically.
- **Work unit size / count:** `UNIT_WIDTH` / `UNIT_STRIDE` in
  `netlify/functions/_state.js`.
- **How hard each unit works:** `ITERATIONS_PER_UNIT` in `js/app.js`.
- **Colors/fonts/layout:** `css/style.css`.

## Known limitations, on purpose
- Greedy-only acceptance (a submission only counts as "accepted" if it's
  strictly better than the current global energy) keeps the merge logic simple
  and race-safe at this scale, at the cost of sometimes rejecting a
  legitimately different-but-not-worse conformation.
- No accounts/auth — contributors are anonymous, randomly generated device IDs
  stored in `localStorage`.
- This is a coarse C-alpha model with a simplified energy function; treat the
  3D structure as illustrative, not as new scientific ground truth.
