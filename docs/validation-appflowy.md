# Neurcode — AppFlowy Operational Validation Report

*A deterministic replay of Neurcode against AppFlowy's real merge history. No cherry-picking: every PR in the sample is evaluated, and silence counts as a result.*

---

## What Neurcode is

Deterministic operational observability for a repository, delivered as a GitHub Action. It checks whether a change stayed within a coherent operational boundary, and it accumulates a replayable history of how the repository's operational structure evolves. No AI prose, no scores, no dashboard, no telemetry.

## Replay scope

- **Per-PR scope coherence:** 60 most-recent merged PRs, evaluated with repository topology derived from AppFlowy's 78-crate Rust workspace + Flutter app.
- **Operational memory:** 250 merged PRs spanning **2025-03-31 → 2026-03-20** (~1 year), snapshotted at **23 release boundaries** (0.8.x → 0.9.5), with static dependency edges from 78 manifests.
- **Determinism check:** the topology profile hashed identically (`1d9302ffde9e`) across independent runs; re-deriving the operational memory yields a byte-identical event list (`f5e7667ab9d5`).

## Replay methodology & determinism

- **Per-PR:** for each PR, the declared scope (title/body/labels/linked issues) is compared to the actual blast radius (changed files → modules from the workspace topology, plus sensitive-boundary tags). The verdict is one of `coherent | review | incoherent`. No sampling tricks: every PR in the window is scored, and a coherent verdict (silence) is recorded as a result, not skipped.
- **Operational memory:** geography is folded **cumulatively** at each release boundary (all PRs merged on/before the release date), and consecutive snapshots are diffed. Only deltas are emitted; standing state is never recorded. A warm-up baseline absorbs the cold-start of a sampling window opening mid-history, and 1-boundary threshold flaps are suppressed.
- **Determinism:** the reasoning path has no model, no randomness, and no network. Same inputs → same verdict and same memory, byte-for-byte. Every artifact carries a content hash (`scope_hash`, memory hash) a maintainer can reproduce by re-running on the same commit/history. The memory is re-derivable from the merge log — there is no separate database to trust or lose.

## Silence metrics

| Surface | Result |
|---|---|
| PRs — coherent (no comment) | **58 / 60 (97%)** |
| PRs — flagged for review | 2 / 60 (3%) |
| PRs — blocked | 0 |
| Release boundaries with no operational delta (silent) | **19 / 23** |
| Total operational events over ~1 year | **5** |

This is the intended behavior: a maintainer feels almost no Neurcode presence, and the few times it speaks are the times worth reading.

## Strongest findings (per-PR)

Both flagged PRs are genuine declared-vs-actual mismatches, not false positives:

1. **#8023 — `fix:` that reaches the migrations layer.** Labeled *"fix: permission control doesn't work when opening the page at the first time"*; +1,219 / −226 across **69 files in 6 modules** — 51 files in the Flutter UI, and notably **`flowy-sqlite (migrations) ×6`**, which the comment surfaces in bold. A permission *fix* that touches a migrations-tagged module is migration-risk surface, not a point fix. The label sets the wrong reviewer expectation; the diff alone never corrects it. (The comment also bolds an `appflowy_flutter (billing)` tag — an over-broad heuristic match, and we say so plainly; the `migrations` tag is the accurate, load-bearing signal here.)

2. **#7996 — `chore:` that changes search behavior.** Labeled *"chore: index document even content is empty"*; touches `flowy-ai`, `flowy-ai-pub`, `flowy-search`, `flowy-search-pub`, `flowy-core`, `flowy-document`. A "chore" label tells maintainers *safe to skim*; this is a behavioral change to the indexing pipeline spanning AI + search + core, including two public-API (`-pub`) crates.

## Coupling-lifecycle examples (operational memory)

Over the year, the accumulated memory recorded five operational events. A representative slice:

- **0.9.2** — *the `frontend/rust-lib` cluster cooled — 4 modules no longer co-changing together*; and *`flowy-ai` and `flowy-server` began co-changing with no structural dependency — operational-only coupling (9% of PRs).*
- **0.9.5** — *the `frontend` cluster cooled — 3 modules no longer co-changing together.*

Each is a single deterministic sentence, grouped by release. The `flowy-ai ↔ flowy-server` event is the operationally interesting one: two crates with no declared dependency that began moving together — an emergent operational coupling a per-PR reviewer cannot see.

## Standing structural observations (geography)

From the whole-repo map (a one-time snapshot, not an event):

- **Pressure zone:** `frontend/appflowy_flutter` is touched in **71%** of PRs — the operational center of gravity.
- **Latent structural coupling** (a static dependency that does *not* co-change): `flowy-error` is depended on by `flowy-ai`, `flowy-database2`, and `flowy-folder` but rarely changes alongside them; likewise `event-integration-test → flowy-database2 / flowy-folder / flowy-server`. These are the places a change to a shared crate can ripple into dependents that are not being exercised together.

## Workflow survivability

- **Fatigue risk: very low.** ~1 PR comment per ~30 PRs; ~5 operational events per year. This will not train maintainers to ignore it.
- **No content overlap with a code reviewer.** CodeRabbit/Sonar review the code; Neurcode tracks operational boundaries and structural evolution. They can run together without competing.
- **Calm by construction.** Coherent PRs get no comment; resolved flags update in place; silent releases produce nothing.

## Honest limitations

- **The memory needs a long time window.** AppFlowy's high velocity made ~1 year fit in 250 PRs, which is enough here — but on faster repos a small PR sample spans only days and shows nothing. A real deployment should replay full history.
- **Flutter ↔ Rust is cross-language.** AppFlowy's Dart app and Rust crates have no shared manifest graph, so couplings across that boundary are correctly reported as *operational-only* (emergent co-change) rather than *latent structural → active*. The strongest coupling-lifecycle phrasing fires on single-ecosystem dependency graphs (Cargo within `rust-lib`).
- **"Wider than its label suggests" can be arguable.** Permission control genuinely is cross-cutting; a maintainer may reasonably agree the scope is wide. The signal is advisory and rare by design.
- **Low presence is a double edge.** A maintainer may install Neurcode and rarely see it act. The operational memory (consulted at releases/incidents) is the answer to "what was it doing while it was quiet."

## Pilot boundaries (what this validation does and does not claim)

- **Claims:** on AppFlowy's real history, Neurcode is calm (97% PR silence, 19/23 release boundaries silent), accurate when it speaks (two fair findings, zero false positives in the sample), deterministic (reproducible hashes), and produces a coherent year-long operational memory.
- **Does not claim:** that the blocking path is calibrated (0 incoherent verdicts fired — the gate is unproven in the wild, which is why the pilot is advisory-only); that the memory is *indispensable* (that is a multi-month, compounding bet a one-month replay only begins to show); or that cross-language (Flutter↔Rust) couplings can reach the strongest `latent→active` event (they correctly read as operational-only).
- **Scope of replay:** merged PRs only (the population that already passed review). Live behavior on in-flight PRs is what the pilot itself measures.

## Why maintainers may care

- A label-vs-reality catch like #8023/#7996 changes how a PR gets reviewed — before it merges.
- The operational memory answers questions that are otherwise unanswerable: *when did `flowy-ai` and `flowy-server` start moving together? which shared crate (`flowy-error`) is everyone's dependency but no one's co-change?* — useful at release time, during an incident, and when a new contributor needs the lay of the land.
- It is deterministic and lives in your repo: no model to trust, no service to depend on, nothing to clean up if you remove it.
