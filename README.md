# Protein Fold Site

A dark-mode, 3D, distributed conformational-search site. Visitors' devices each run an
independent torsion-space search trying to fold **amyloid-beta 1-42** (PDB entry
[1IYT](https://www.rcsb.org/structure/1IYT), the peptide central to the amyloid
hypothesis of Alzheimer's disease) from a randomized, unfolded starting chain toward a
lower-energy, more helix-consistent shape. Results are independently re-scored by a
server function, and the single best result found so far is shown to every visitor in
real time as a rotating 3D structure.

## Honest framing

The physical model here is a real, working local optimization, not a toy animation: a
full nitrogen/carbon-alpha/carbon backbone, built with literature-standard bond lengths
and bond angles, moved only through genuine phi/psi torsion-angle rotations, the same
internal-coordinate representation real structural biology software uses. It is not a
production molecular-dynamics engine like Folding@home, and it is not a substitute for
tools like AlphaFold or Rosetta. The scoring function is a simplified stand-in for a
real force field: side chains are represented by at most two pseudo-atoms and one
rotatable angle each, not real atomic detail; there is no solvent and no validated
all-atom physics. It will not produce new, publishable Alzheimer's science on its own.

## How it works

- **Backbone construction**: each residue contributes an N, C-alpha, and C atom, placed
  one at a time using the Natural Extension Reference Frame (NeRF) algorithm, the
  standard method for converting torsion angles into 3D coordinates. Bond lengths and
  angles are the widely used Engh & Huber idealized values; every peptide bond is
  assumed trans.
- **Side chains**: each residue gets a base pseudo-atom fixed to the backbone, sized by
  a rough small/medium/large classification, and, for residues with a real side chain
  beyond that first atom, a second pseudo-atom that rotates independently around it via
  its own chi1 torsion angle, the same first side-chain torsion real structural biology
  uses. Glycine correctly has no side-chain atom, and alanine correctly has only the
  fixed base atom with no further rotation, matching real chemistry.
- **Degrees of freedom**: each residue's phi and psi torsion angles, plus a chi1 angle
  for residues with more than a bare base side chain. Bonds are geometrically exact by
  construction, not softly enforced.
- **Starting point**: a randomized, extended chain, not the known answer. The real
  helix assignment from the PDB entry is used only inside the scoring function, as a
  bias toward the helical basin in those regions, so the search has to genuinely find
  its way there.
- **Scoring function**: a steric clash term between backbone and side-chain atoms that
  aren't close neighbors in the chain, using approximate radii so bulkier side chains
  take up more room; a soft torsional preference pulling phi/psi in the known helical
  regions toward the classic alpha-helix values; and a real three-fold torsional
  preference on chi1, the same form used for sp3-sp3 bond rotation in real force
  fields, favoring the three physically staggered rotamer positions over the eclipsed
  ones in between.
- **Search**: simulated annealing with single-torsion "pivot" moves, each device running
  its own independent trajectory for a long, fixed time budget, cooling from a higher to
  a lower temperature over that budget.
- **Aggregation**: every submitted result is independently re-scored server-side (no
  client is trusted blindly), kept as part of a small ensemble of recent independent
  results, and the current best-found result becomes the next trajectory's starting
  point, so successive contributions build on each other.
- **Storage**: a Netlify Function reads and writes one shared JSON state file in a
  GitHub repository via the Contents API, so no separate database is required.

## Project structure

```
index.html           the page
css/style.css        dark theme
js/app.js            orchestrates everything in the browser
js/viewer.js         three.js 3D renderer
js/foldWorker.js     Web Worker running the torsion-space search
js/geometry.js       builds the backbone from phi/psi angles (shared w/ server)
js/energy.js         the scoring function (shared w/ server)
data/protein.json    real sequence + secondary-structure annotation for 1IYT
netlify/functions/   serverless backend: claim-workunit, submit-result, get-status
netlify.toml         Netlify build config and /api/* redirects
package.json
```

## Environment variables

The Netlify Functions require these to talk to the GitHub data repository:

| Variable | Purpose |
|---|---|
| `GITHUB_TOKEN` | Fine-grained personal access token with Contents: Read and write on the data repo |
| `GITHUB_OWNER` | GitHub username or org that owns the data repo |
| `GITHUB_REPO` | Name of the repo used as the JSON data store |
| `GITHUB_BRANCH` | Branch to read/write, typically `main` |

## Customizing

- **Different protein**: edit `data/protein.json` (sequence, helix ranges, citation).
  Geometry and scoring derive from it automatically. The residue count and helix ranges
  drive the backbone and torsion-preference bias; the sequence itself also matters now,
  since it determines which residues get a side chain, which get a chi1 angle, and how
  bulky each side chain is treated as being.
- **How hard each trajectory searches**: `TIME_BUDGET_MS` in `js/app.js`.
- **Ensemble size**: `ENSEMBLE_SIZE` in `netlify/functions/_state.js`.
- **Colors/fonts/layout**: `css/style.css`.

## Known limitations, on purpose

- Side chains have at most two pseudo-atoms and one rotatable angle (chi1) each, sized
  by a rough small/medium/large classification, not real atomic detail. Real side
  chains longer than that have further independent rotations (chi2, chi3, chi4) that
  this model does not include, and there is no residue-specific bond geometry beyond
  the size classification. There is no solvent and no validated all-atom force field.
  The scoring function is a deliberately simplified clash-plus-torsion-preference
  model.
- Greedy-only acceptance (a submission only updates the shared best if it's strictly
  better) keeps the merge logic simple and race-safe at small scale.
- No accounts or authentication; contributors are anonymous device IDs stored in
  `localStorage`.
- Each trajectory runs for a fixed time budget rather than a fixed iteration count, so
  behavior stays consistent across devices of different speeds.
