# PUTMAN Visual Simulator

**Live demo:** https://putmanmodel.github.io/putman-visual-sim/

A deterministic, local-only visual simulator for the PUTMAN Model pipeline — showing how a context signal activates a graph, gets pruned by rigidity, reconstructed via a beam, and produces an interpretation shift metric (Δ) over recursive steps.

## Pipeline (high level)

M + C → S → Beam → I → Δ

Where:
- M = graph structure (nodes/edges/weights)
- C = context / cue input
- S = activation state
- I = interpretation summary
- Δ = measured shift across steps

## What you can do in the demo
- Generate a seeded synthetic graph (reproducible)
- Tune rigidity (ρ), beam width (k), and depth (d)
- Watch active/pruned structure update step-by-step
- See Δ change over time (shift / drift / collapse behavior)

**Exports**
- SVG of the current view
- JSON runlog with per-step internals (for replay + analysis)

## Presets
Use the preset buttons as “stories”:
- Stable — low drift, moderate pruning
- Drift — stronger recursive movement and interpretation shift
- Collapse — aggressive pruning and structural loss

## Repo layout
- core/ — framework-agnostic TypeScript engine (deterministic)
- app/ — React + Vite UI (SVG visualization + exports)
- specs/ — preset parameter configs

## Run locally
Run from the repo root:

```
    cd app
    npm install
    npm run dev
```

## Build + test

```
    npm run build
    npm run test
```

## Determinism
A determinism test verifies:
- same seed + params → identical runlog hash
- different seeds → different runlog hash

See: app/tests/core.determinism.test.ts

## Related work
- PUTMAN Model papers (Zenodo): https://doi.org/10.5281/zenodo.15634339
- PUTMAN Model repo: https://github.com/putmanmodel/putman-model-paper

## License
CC BY-NC 4.0 — Creative Commons Attribution–NonCommercial 4.0 International.
See LICENSE.

Contact: putmanmodel@pm.me
