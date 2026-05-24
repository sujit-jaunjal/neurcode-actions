# Operational memory

The per-PR check is a rare alarm. Operational memory is the opposite surface: an **accumulating, pull-first** record of how your repository's operational structure changes over time — "git log for repository architecture".

## What it records (events, not state)

It emits **only deltas**, never standing state. There is no "still healthy", no "72 modules", no gauge. The event types:

| Event | Meaning |
|---|---|
| `coupling-activated` | a structural dependency that wasn't co-changing **started** — *latent → active* |
| `coupling-emerged` | two modules began co-changing with **no** structural dependency (operational-only) |
| `coupling-dormant` | a corridor cooled — no longer co-changing above threshold |
| `coupling-reactivated` | a dormant edge became active again |
| `coupling-cluster-activated` | ≥3 modules began moving together (collapses the pairwise flood) |
| `pressure-emerged` / `pressure-migrated` | the operational center of gravity shifted |
| `boundary-eroded` / `boundary-tightened` | a cross-area boundary became more / less porous |

Each event is one calm, deterministic sentence, grouped by release, newest first.

## How to read it

```
### 0.9.2
- the `frontend/rust-lib` cluster cooled — 4 modules no longer co-changing together.
- `flowy-ai` and `flowy-server` began co-changing with no structural dependency —
  operational-only coupling (9% of PRs).
```

The `flowy-ai ↔ flowy-server` line is the kind of thing nobody writes down: two crates with no declared dependency that started moving together. Knowing *when* that began is useful at release time, during an incident, and when onboarding.

## Where it lives

`mode: memory` writes two files into your repo (default `.neurcode/reports/`):

- **`operational-memory.md`** — human-readable, changelog-style.
- **`operational-memory.jsonl`** — one event per line, git-diffable, machine-readable.

Commit them to track the history in-repo, or just read them from the run's Step Summary. The memory is **re-derivable from your merge history**, so there is no database to trust or lose.

## Cadence

Operational structure changes slowly — **monthly is plenty**, or run it at release boundaries. Most periods produce **no events**, and that is correct: a quiet repository is a healthy one. The few periods with a story are the ones worth reading. See [`examples/operational-memory.yml`](../examples/operational-memory.yml).

## Noise control (why it stays calm)

- A fresh install does **not** dump your whole history as "new" events — the first snapshot is a silent baseline, and a warm-up window absorbs the cold start.
- A coupling that flickers across the threshold for a single release is suppressed (hysteresis), not reported.
- A cross-cutting change touching many modules collapses into **one** cluster event, not C(n,2) pairwise lines.
