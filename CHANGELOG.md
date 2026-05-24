# Changelog

All notable changes to the Neurcode Action. This repo is a distribution surface:
the bundled `dist/` is built from the private `neurcode` monorepo and exported here.

Versions are conservative during the pilot phase (`v0.x`). Immutable tags never move;
the floating `v0` tag is re-pointed on each release. Pin `@v0.2.4` (or a commit SHA)
for reproducibility. Changes that affect a verdict or a hash are called out explicitly.

## v0.2.4 — Repository Operational Memory

The action is repositioned around **repository operational memory** — a sparse per-PR
operational surface plus an accumulating, replay-safe operational history.

### Added
- **`mode: memory`** — pull-first operational memory. Builds cumulative geography
  snapshots at each release boundary and emits delta-only events: coupling lifecycle
  (latent→active / emerged / dormant / reactivated), pressure migration, boundary
  drift. Writes `operational-memory.md` + `operational-memory.jsonl`. Never comments
  on PRs; never restates standing state.
- **Coupling-cluster collapsing** — a cross-cutting change touching many structurally
  coupled modules now produces **one** cluster event instead of a pairwise flood.
- **`convergence` output** — per-PR remediation lifecycle across pushes
  (`clean` / `converged` / `fix-loop` / `persistent` / `unresolved`).
- **`operational_events`** output (mode=memory), **`memory_min_window`** input.
- Noise suppression: silent install baseline, warm-up window, dormancy hysteresis.

### Changed
- First-run UX: a coherent PR's Step Summary now states plainly that "no comment" is
  the **expected** result; the PR comment and memory carry advisory + reproducibility
  framing.
- Action identity updated to **"Neurcode — Repository Operational Memory"**.

### Notes
- Deterministic and reproducible: a commit always yields the same `scope_hash` and
  memory hash. No model, no network, no telemetry on the OSS path.
- Advisory by default — never blocks a merge unless `scope_coherence_fail: true`.
