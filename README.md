# Protein Fold Site

A dark-mode, 3D, distributed conformational-search site. Visitors' devices each run an
independent torsion-space search trying to fold the **villin headpiece subdomain (HP36)**
(PDB entry [1VII](https://www.rcsb.org/structure/1VII)), the smallest known naturally
occurring protein that folds cooperatively into one single, stable, well-defined shape,
and the classic small-protein benchmark used to validate folding simulation methods,
from a randomized, unfolded starting chain toward that known fold. Results are
independently re-scored by a server function, and the single best result found so far is
shown to every visitor in real time as a rotating 3D structure, alongside a distance
figure comparing it to a real-geometry reference target.

## Honest framing

The physical model here is a real, working local optimization, not a toy animation: a
full nitrogen/carbon-alpha/carbon/oxygen backbone, built with literature-standard bond
lengths and bond angles, moved only through genuine phi/psi and side-chain torsion-angle
rotations, the same internal-coordinate representation real structural biology software
uses. It is not a production molecular-dynamics engine like Folding@home, it does not
run AlphaFold or any trained structure-prediction model, and it is not a substitute for
tools like AlphaFold or Rosetta. The scoring function is a simplified stand-in for a real
force field: one generic bond length and angle is used for every side-chain link rather
than each amino acid's true distinct geometry, there is no solvent, and there is no
validated all-atom physics. It will not produce new, citable structural biology on its
own. This protein was deliberately chosen because it has one well-defined native fold to
search for; a protein like amyloid-beta, used in an earlier version of this project, does
not have a single native answer to compare against, which is also exactly why tools like
AlphaFold struggle with that class of protein.

## How it works

- **Backbone construction**: each residue contributes an N, C-alpha, C, and carbonyl O
  atom, placed one at a time using the Natural Extension Reference Frame (NeRF)
  algorithm, the standard method for converting torsion angles into 3D coordinates.
  Bond lengths and angles are the widely used Engh & Huber idealized values; every
  peptide bond is assumed trans. The carbonyl oxygen has no independent torsion of its
  own; its position is fully determined by the trigonal-planar geometry of the
  carbonyl carbon once the surrounding backbone atoms are known, matching real
  chemistry, where this atom has no rotatable freedom either.
- **Side chains**: each residue gets a base pseudo-atom fixed to the backbone, sized by
  a rough small/medium/large classification, followed by a chain of further pseudo-atoms,
  one per real rotatable side-chain torsion angle (chi1 through chi4) that amino acid
  actually has, using a real per-residue-type lookup of how many of those angles exist,
  from zero for glycine up to four for the largest side chains. Each link uses a single
  generic bond length and angle rather than atom-specific geometry.
- **Degrees of freedom**: each residue's phi and psi torsion angles, plus as many chi
  angles as that specific amino acid really has. Bonds are geometrically exact by
  construction, not softly enforced.
- **Starting point**: a randomized, extended chain, not the known answer. The real
  helix assignment from the PDB entry is used only inside the scoring function, as a
  bias toward the helical basin in those three regions, so the search has to genuinely
  find its way there.
- **Reference structure and RMSD**: a separate target structure is built once, using the
  same geometry engine, with ideal alpha-helix torsion angles applied to the three real
  helical regions and a canonical side-chain angle throughout. This is a legitimate
  real-geometry approximation of the folded shape, not the literal deposited NMR
  coordinates. The displayed distance figure aligns the current best structure to this
  reference using the Kabsch algorithm (optimal rotation and translation before
  measuring difference) and reports the resulting C-alpha RMSD in Angstroms, the
  standard structural-comparison metric.
- **Scoring function**: a steric clash term between backbone and side-chain atoms that
  aren't close neighbors in the chain, using approximate radii so bulkier side chains
  take up more room; a soft torsional preference pulling phi/psi in the known helical
  regions toward the classic alpha-helix values; and a real three-fold torsional
  preference applied to every chi angle present, the same form used for sp3-sp3 bond
  rotation in real force fields, favoring the three physically staggered rotamer
  positions over the eclipsed ones in between.
- **Search**: simulated annealing with single-torsion "pivot" moves, each device running
  its own independent trajectory for a long, fixed time budget, cooling from a higher to
  a lower temperature over that budget. Parallel tempering (running several chains at
  different fixed temperatures with periodic swaps) was tried and tested directly
  against this at a matched compute budget; it performed measurably worse for this
  specific search landscape, spending too much of the budget on chains that never fully
  refine, so it was not adopted. A side-chain-only move only rebuilds that one residue's
  side chain instead of the entire backbone, validated to produce byte-identical
  results to a full rebuild; this gives a modest, not dramatic, speedup, since the
  dominant per-move cost is the pairwise clash check, not backbone construction.
- **Rendering**: the search itself runs at its full internal speed regardless of what's
  on screen; the browser only receives a new snapshot roughly every 400 milliseconds,
  since posting one after every single move would be wasteful. Rather than snapping
  directly to each new snapshot, the viewer smoothly interpolates every atom's position
  from the previous snapshot to the new one over a short window, so the display reads
  as continuous motion instead of a slideshow of discrete jumps, without changing how
  often or how fast the underlying search actually runs.
- **Aggregation**: every submitted result is independently re-scored server-side (no
  client is trusted blindly), kept as part of a small ensemble of recent independent
  results, and the current best-found result becomes the next trajectory's starting
  point, so successive contributions build on each other.
- **Write safety**: writes use optimistic concurrency (read the file's exact version,
  write only if nothing changed underneath it, retry against fresh data otherwise) so
  two devices writing at nearly the same instant can't silently overwrite each other.
  Retries use exponential backoff with jitter, waiting a little longer and by a
  randomized amount before each attempt, to reduce the chance of two writers repeatedly
  colliding with each other. This is race-and-retry, not a true queue: there is no
  ordering guarantee, and after 5 attempts a write gives up and fails outright rather
  than waiting indefinitely. A true queue would need a persistent process or an external
  queue service, which this static-site-plus-functions architecture doesn't have. A
  submission is only counted toward stats and the ensemble if its trajectory is still a
  genuinely active claim at write time, so a duplicate or replayed submission can't be
  counted twice.
- **Storage**: a Netlify Function reads and writes one shared JSON state file in a
  GitHub repository via the Contents API, so no separate database is required.
  `get-status` keeps a short-lived in-memory cache (a few seconds) so several requests
  landing close together on the same warm instance don't turn into that many separate
  GitHub API reads.
- **Fetching**: the browser has no recurring polling timer at all. It fetches the
  shared status once on initial page load, again whenever the tab regains visibility
  after being backgrounded, and again whenever the person switches to the Global best
  view. A device that's actively contributing gets its freshest data for free: the
  response from submitting a completed trajectory already contains the updated shared
  state, so no separate status fetch is needed while contributing. The tradeoff is
  that a passive viewer who never switches views or backgrounds the tab may see a
  static snapshot until one of those events happens.

## Project structure

```
index.html           the page
css/style.css        dark theme
js/app.js            orchestrates everything in the browser
js/viewer.js         three.js 3D renderer
js/foldWorker.js     Web Worker running the torsion-space search
js/geometry.js       builds the backbone/side chains and the reference/RMSD math (shared w/ server)
js/energy.js         the scoring function (shared w/ server)
data/protein.json    real sequence + secondary-structure annotation for 1VII
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
  drive the backbone and torsion-preference bias; the sequence itself also matters,
  since it determines each residue's real number of side-chain atoms and chi angles.
  A protein without one single well-defined native fold will make the reference/RMSD
  comparison less meaningful, which is exactly why this project moved away from one.
- **How hard each trajectory searches**: `TIME_BUDGET_MS` in `js/app.js`.
- **Ensemble size**: `ENSEMBLE_SIZE` in `netlify/functions/_state.js`.
- **Colors/fonts/layout**: `css/style.css`.

## Known limitations, on purpose

- Side-chain geometry uses one generic bond length and angle per link rather than each
  amino acid's true distinct geometry; the number of chi angles per residue is real, the
  precise geometry of each link is not.
- The reference structure used for the RMSD comparison is a real-geometry approximation
  built from the true helix boundaries, not the literal deposited experimental
  coordinates.
- No side chain has residue-specific ring or branching geometry (e.g. proline's cyclic
  side chain, or the branching in valine/isoleucine/threonine) beyond a generic linear
  chain of pseudo-atoms.
- No solvent and no validated all-atom force field; the scoring function is a
  deliberately simplified clash-plus-torsion-preference model.
- Greedy-only acceptance (a submission only updates the shared best if it's strictly
  better) keeps the merge logic simple and race-safe at small scale.
- No accounts or authentication; contributors are anonymous device IDs stored in
  `localStorage`.
- Each trajectory runs for a fixed time budget rather than a fixed iteration count, so
  behavior stays consistent across devices of different speeds.
