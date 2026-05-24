# How Neurcode works

Neurcode is deterministic. There is no model and no network in the reasoning path — it reads your repository's structure and your PR/merge history and folds them with pure functions. The same inputs always produce the same output, byte-for-byte.

## Step 1 — Repository topology (derived, not configured)

From your manifests (`Cargo.toml`, `package.json`, `go.mod`, `pubspec.yaml`, Gradle, CMake, …) and directory structure, Neurcode derives a **module partition** of the repo and the **static dependency edges** between modules. Nothing is hardcoded — a Rust workspace, a pnpm monorepo, and a Go module each get their own topology. The result is hashed (`profileHash`) so it's reproducible.

## Step 2 — Per-PR scope coherence (the sparse alarm)

For each PR, Neurcode computes:

- **Declared scope** — the change kind and intent from the title, body, labels, and linked issues (e.g. `docs`, `chore`, `fix`, `feature`).
- **Actual blast radius** — which modules the changed files belong to, plus tags for sensitive boundaries (`migrations`, generated code, etc.) and new import edges.

It then asks: *does the blast radius fit the declared scope?* The verdict is `coherent`, `review`, or `worth-blocking` (`incoherent`). Mechanical PRs (reverts, releases, version bumps, generated-code refreshes) are recognized and not flagged for breadth.

- **Coherent** → no comment. A Step Summary states the silence is expected.
- **Review / incoherent** → one calm, deterministic comment. Advisory; never blocks unless a maintainer opts in.

Across pushes, Neurcode tracks how a PR's coherence evolves — `converged`, `fix-loop`, `persistent`, `unresolved` — and updates the same comment in place instead of adding new ones.

## Step 3 — Operational memory (the accumulating record)

Folding the same per-PR records **cumulatively at each release boundary** yields an operational snapshot of the repo (pressure zones, co-change corridors, coupling classifications). Diffing consecutive snapshots emits **only meaningful deltas**:

- a latent structural dependency that **starts** co-changing (`coupling-activated`),
- two modules that begin co-changing with no structural link (`coupling-emerged`),
- a corridor that **cools** (`coupling-dormant`), or reactivates,
- operational **pressure migrating** between modules,
- a cross-area **boundary eroding or tightening**.

A connected cluster of modules that all start moving together collapses into a single event (so one cross-cutting change is one line, not a combinatorial flood). Standing state is never restated. The result is an append-only, re-derivable history.

## Why deterministic matters

- **Trust by verification.** A maintainer can re-run on the same commit and get the identical verdict and hash. There is nothing to take on faith.
- **No drift.** The memory is re-derivable from your merge history; it is not a database that can rot or be lost.
- **No surprises.** No model means no nondeterministic output, no hallucinated findings, no version-to-version behavior changes you didn't choose.

## What it is not

Not a code reviewer, not a linter, not AI, not a score or grade, not a dashboard, not a productivity tracker, and not a per-developer metric. It observes operational *structure*, and it stays quiet.
