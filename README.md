# Neurcode Runtime Admission Advisory

**A zero-account, source-free PR triage report for ownership, sensitive surfaces, and runtime admission evidence.**

Install one workflow file. The Action produces a concise GitHub Step Summary that helps maintainers route review attention faster for AI-assisted or ordinary pull requests.

No Neurcode account. No API key. No source upload. No telemetry. No local runtime required.

[![Bundle Integrity](https://img.shields.io/badge/bundle-integrity%20verified-blue)](./PROVENANCE.json)

---

## Start Here As An OSS Maintainer

The smallest useful path is:

1. Copy the workflow in the Quick Start section.
2. Run it on one pull request.
3. Use the Step Summary to route review attention.
4. Share whether the report helped, repeated the diff, or created noise.

You get useful signal immediately without a Neurcode account:

- CODEOWNERS zones crossed and owners involved.
- Subsystems touched, ranked by changed-file count.
- Deterministic sensitive path categories such as CI/workflow, dependency manifests, lockfiles, auth, billing/payment, database/migrations, secrets/config, infrastructure/deploy, and generated files.
- Docs-only or low-routing PRs that stay quiet when no deterministic routing flag fires.
- Optional runtime admission context when `.neurcode-admission/*.json` records are committed: trust level, governed host, blocked/approved/denied counts, approval-required surfaces, and receipt/integrity status.

This is a PR triage report. It is not an AI security scanner, not vulnerability detection, and not a review replacement.

---

## What It Reports

- Changed-file inventory from committed git metadata.
- Top-level subsystem reach.
- CODEOWNERS zones and owner tokens crossed, read from the base commit.
- Sensitive path categories: auth, billing/payment, database/migrations, CI/workflow, infrastructure/deploy, secrets/config, dependency manifests, lockfiles, generated files.
- Optional `.neurcode-admission/*.json` runtime admission context.
- Suggested maintainer questions generated from deterministic facts.

The report is advisory by default. It does not replace review, infer AI intent, or claim security vulnerabilities.

---

## Quick Start

```yaml
# .github/workflows/neurcode-admission.yml
name: Neurcode Admission Advisory
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
jobs:
  admission-advisory:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
        with:
          fetch-depth: 0
      - uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.3
```

Layer 1 runs standalone on every PR. Layer 2 activates only when `.neurcode-admission/*.json` records are present.

---

## Action To Runtime Bridge

The Action is the free OSS wedge. The runtime platform is the before-code-lands governance product.

| Path | What maintainers see in the PR | What it means |
|---|---|---|
| Action alone | Review routing, sensitive path categories, CODEOWNERS crossings, subsystem reach, `admission_verdict: no_record`. | No runtime record was attached. Ordinary PRs can be reviewed normally. |
| Action + runtime admission record | The same report plus runtime admission context and `self_attested_complete`, `self_attested_incomplete`, or `self_attested_inconsistent`. | The PR author attached source-free metadata from a governed local runtime session. Trust level is explicit: `self_attested`, `unsigned_local`, or `backend_signed` when signed receipt metadata is attached. |
| Full Neurcode runtime platform | Runtime session records, source-free intent summaries, exact-path approvals, boundary events, dashboard workflow, and backend receipts where configured before the PR arrives. | Live agent governance. Backend-signed receipts are stronger than self-attested records, but still must be verified. |

Self-attested records are claims by the PR author. They are useful context, but not cryptographic proof and not enterprise signed receipts.

---

## Export Runtime Context Into A PR

After a governed local AI coding session:

```bash
# Export the current/latest governed session into a deterministic PR artifact.
neurcode session export-admission

# Or choose a specific session.
neurcode session export-admission <sessionId>

# If you have a backend receipt JSON, attach source-free receipt metadata.
neurcode session export-admission <sessionId> --receipt receipt.json

# Commit the source-free artifact with the PR.
git add .neurcode-admission/*.json
git commit -m "Add Neurcode runtime admission context"
```

The Action discovers `.neurcode-admission/<sessionId>.json` from the PR head git tree and renders a **Runtime admission context** section. The artifact must not contain source code, diff hunks, patch bodies, shell command bodies, secrets, raw prompts, or full receipt signatures. Backend receipt summaries include only source-free receipt ID, key ID, replay hash, signature status, verification status, signed timestamp, and verifier hint.

---

## Quick FAQ

| Question | Answer |
|---|---|
| What is the GitHub Action? | A zero-account, source-free PR triage report for ownership, sensitive path categories, CODEOWNERS routing, and optional runtime admission context. |
| What is runtime governance? | Neurcode's before-code-lands control layer for AI coding sessions: intent/plan records, ownership boundaries, exact-path approvals, and source-free evidence. |
| Do I need an account? | No for the Action. Yes for the hosted runtime platform and dashboard workflow. |
| What data leaves my repo? | The Action does not upload source, diff hunks, prompts, patches, secrets, or telemetry. It runs in GitHub Actions and writes a Step Summary plus outputs. |
| What does the paid platform add? | Live agent governance before writes land, exact-path approvals, source-free runtime evidence, dashboard review workflow, and backend receipt verification when configured. |
| How do I start as an OSS maintainer? | Install the RC3 workflow on one repo or one PR and score whether the summary is actionable, obvious, or noisy. |
| How do I start as an enterprise team? | Use the Action for PR rehearsal, then evaluate the runtime platform on one AI coding workflow where path ownership or sensitive boundaries matter. |
| Is RC3 stable? | No. `v0.3.0-rc.3` is the current rehearsal ref. `v0.2.4` remains the existing stable public release. |

---

## Step Summary

The Step Summary includes:

- **Maintainer read this first**: changed file count, subsystems touched, sensitive surfaces, CODEOWNERS status, admission status, and review routing cue.
- **Review routing**: CODEOWNERS source, matched areas, owners, unowned changed paths, absent/degraded state.
- **Sensitive surfaces**: deterministic path/category hits only.
- **Subsystem reach**: ranked top-level directories.
- **Runtime admission context**: whether a record was found, trust level, session count, governed host, blocked/approved/denied counts, approval-required surfaces, and receipt/integrity status. If no record exists, it says: "No runtime admission record found. This report is PR metadata only."
- **Runtime admission provenance**: `no_record`, `self_attested_complete`, `self_attested_incomplete`, or `self_attested_inconsistent`, with plain-English explanation.
- **Suggested maintainer questions**: deterministic questions such as "This PR crosses 3 CODEOWNERS zones. Are all owners represented in review?"
- **Trust boundary**: source-free, no telemetry, advisory by default, self-attested records are not cryptographic proof.

Long lists are capped with `+N more`. Ordering is stable.

---

## Outputs

| Output | Description |
|---|---|
| `effect_count` | Files in the committed delta. |
| `subsystems` | Comma-separated top-level directories. |
| `sensitive_surfaces` | Sensitive surface categories detected. |
| `sensitive_surface_count` | Number of distinct sensitive surface categories. |
| `codeowners_zones_crossed` | Distinct ownership zones crossed. |
| `codeowners_changed` | `true` if CODEOWNERS appears in the delta. |
| `review_attention` | `simple`, `manual_routing`, or `needs_attention`. |
| `maintainer_questions_count` | Number of deterministic maintainer questions generated. |
| `admission_verdict` | `self_attested_complete`, `self_attested_incomplete`, `self_attested_inconsistent`, or `no_record`. |
| `covered_paths_count` | Paths with admission coverage. |
| `uncovered_paths_count` | Paths without admission coverage. |
| `record_count` | Artifacts discovered. |
| `usable_record_count` | Artifacts passing validation. |
| `runtime_admission_found` | `true` when `.neurcode-admission` metadata was present. |
| `runtime_admission_trust_level` | `none`, `unsigned_local`, `self_attested`, `backend_signed`, or `mixed`. |
| `runtime_admission_session_count` | Governed runtime sessions represented by usable admission records. |
| `runtime_blocked_paths_count` | Paths blocked during represented runtime sessions. |
| `runtime_approved_paths_count` | Exact paths approved during represented runtime sessions. |
| `runtime_denied_paths_count` | Denied paths in represented runtime sessions. |
| `action_blocked` | `true` only in strict mode when admission failed. |

---

## Runtime Admission Provenance

Self-attested records are optional source-free JSON artifacts under `.neurcode-admission/*.json`.

They can help an author state that a local runtime admission process ran, but they are claims by the same principal who authored the diff. They are not cryptographic proof and not enterprise signed receipts.

---

## Strict Self-Attested Mode

```yaml
- uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.3
  with:
    policy: strict_self_attested
    no_record_strict: 'false'
```

Experimental. This can fail on incomplete or inconsistent self-attested records. It is not a trusted branch-protection gate.

---

## Trust Boundary

- Fork-safe: no secrets required on `pull_request` events. Rejects `pull_request_target`.
- Source-free: paths, modes, blob object IDs, CODEOWNERS metadata, file categories, and deterministic hashes only.
- No file contents, diff hunks, prompts, patches, secrets, or telemetry.
- Artifact discovery reads immutable PR-head git objects via `git ls-tree` and `git cat-file`, not the mutable checkout worktree.
- CODEOWNERS is read from the base commit, never the PR head.
- Unsupported CODEOWNERS syntax is reported as degraded analysis instead of guessed.
- Self-attested records are claims, not proof.

---

## RC Evaluation

Maintainer Report V2 was rehearsed against controlled OSS-style scenarios, a FastAPI temp clone, and live Airflow fork PRs before RC3 publication. The rehearsals scored generated Step Summary lines as ACTIONABLE, OBVIOUS, or NOISE and checked for source snippets, diff hunks, secrets, telemetry claims, and proof overclaims.

External maintainer feedback is still required before stable promotion.

---

## Bundle Provenance

See [`PROVENANCE.json`](./PROVENANCE.json) for the source commit SHA and SHA-256 of the committed `dist/index.js`. The public repo's CI verifies bundle integrity by checksum match. Signed build attestations are not part of this release.

---

## Existing v0.2.4 Installation Path

`sujit-jaunjal/neurcode-actions@v0.2.4` remains available and untouched as the existing stable pilot surface. `v0.3.0-rc.3` remains the current published rehearsal ref; this branch is the `v0.3.0-rc.4` candidate for runtime admission bridge behavior.

---

## Adoption Bridge Docs

- [OSS maintainer path](./docs/oss-maintainer-path.md)
- [Runtime admission demo story](./docs/runtime-admission-demo-story.md)
- [Maintainer outreach ask](./docs/maintainer-outreach.md)
- [Adoption ladder](./docs/adoption-ladder.md)

---

*No telemetry. No source upload. No AI inference. Same verdict on every machine.*
