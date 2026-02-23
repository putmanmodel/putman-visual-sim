PUTMAN Model Pipeline Visual Simulator

A deterministic, local-only simulator for the PUTMAN pipeline:

M = (V, E, w, t) + context C -> activation S -> beam reconstruction -> interpretation I -> shift metric Delta

The app is a single-page React + TypeScript interface that consumes a framework-agnostic core engine from /core, visualizes the synthetic graph via SVG, and exports reproducible artifacts.

What it demonstrates
- Seeded synthetic graph generation with configurable node count, edge density, and prior/new overlap.
- Activation scoring from context and weighted structure.
- Rigidity pruning (rho) over weak nodes/edges.
- Beam reconstruction with width k.
- Recursive updates across depth d.
- Interpretation summaries (I) and per-step shift metric (Delta) using cosine distance between interpretation centroids.
- Deterministic runlogs with per-step internals and export support.
ç
Project layout
- /core: Framework-agnostic TypeScript simulation engine.
- /app: Vite + React + TypeScript UI and Vitest tests.
- /specs: Preset JSON configs (stable, drift, collapse).

Run locally

```
cd app
npm install
npm run dev
```

Build and tests:

```
npm run build
npm run test
```

Reproduce presets
1. Start the app.
2. Click one preset button in the left panel:
- stable: low drift, moderate rigidity.
- drift: high drift and stronger recursive movement.
- collapse: high rigidity, aggressive pruning.
3. Click Run to regenerate with that preset.
4. Use Export SVG for the current graph view and Export JSON Runlog for full step traces.

Determinism check

Vitest includes core determinism assertions in:

app/tests/core.determinism.test.ts

It verifies:
- same seed + params => identical runlog and hash
- different seeds => different runlog hashes

GitHub Pages

GitHub Actions workflow:

.github/workflows/deploy-pages.yml

On pushes to main, it builds /app and deploys static output to GitHub Pages.

License

This project is licensed under Creative Commons Attribution–NonCommercial 4.0 International (CC BY-NC 4.0).
See LICENSE.

Contact

putmanmodel@pm.me
