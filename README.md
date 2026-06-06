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
- Optional runtime admission status when `.neurcode-admission/*.json` records are committed.

This is a PR triage report. It is not an AI security scanner, not vulnerability detection, and not a review replacement.

---

## What It Reports

- Changed-file inventory from committed git metadata.
- Top-level subsystem reach.
- CODEOWNERS zones and owner tokens crossed, read from the base commit.
- Sensitive path categories: auth, billing/payment, database/migrations, CI/workflow, infrastructure/deploy, secrets/config, dependency manifests, lockfiles, generated files.
- Optional `.neurcode-admission/*.json` self-attested runtime admission status.
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
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.2
```

Layer 1 runs standalone on every PR. Layer 2 activates only when `.neurcode-admission/*.json` records are present.

---

## Action To Runtime Bridge

The Action is the free OSS wedge. The runtime platform is the before-code-lands governance product.

| Path | What maintainers see in the PR | What it means |
|---|---|---|
| Action alone | Review routing, sensitive path categories, CODEOWNERS crossings, subsystem reach, `admission_verdict: no_record`. | No runtime record was attached. Ordinary PRs can be reviewed normally. |
| Action + runtime admission record | The same report plus `self_attested_complete`, `self_attested_incomplete`, or `self_attested_inconsistent`. | The PR author attached source-free self-attested evidence that local runtime governance was used. |
| Full Neurcode runtime platform | Runtime session records, intent/plan context, exact-path approvals, boundary events, and dashboard review workflow before the PR arrives. | Live agent governance. Stronger backend-anchored receipts are future enterprise evidence, not current OSS Action proof. |

Self-attested records are claims by the PR author. They are useful context, but not cryptographic proof and not enterprise signed receipts.

---

## Quick FAQ

| Question | Answer |
|---|---|
| What is the GitHub Action? | A zero-account, source-free PR triage report for ownership, sensitive path categories, CODEOWNERS routing, and optional runtime admission context. |
| What is runtime governance? | Neurcode's before-code-lands control layer for AI coding sessions: intent/plan records, ownership boundaries, exact-path approvals, and source-free evidence. |
| Do I need an account? | No for the Action. Yes for the hosted runtime platform and dashboard workflow. |
| What data leaves my repo? | The Action does not upload source, diff hunks, prompts, patches, secrets, or telemetry. It runs in GitHub Actions and writes a Step Summary plus outputs. |
| What does the paid platform add? | Live agent governance before writes land, exact-path approvals, source-free runtime evidence, dashboard review workflow, and future stronger enterprise receipts. |
| How do I start as an OSS maintainer? | Install the RC2 workflow on one repo or one PR and score whether the summary is actionable, obvious, or noisy. |
| How do I start as an enterprise team? | Use the Action for PR rehearsal, then evaluate the runtime platform on one AI coding workflow where path ownership or sensitive boundaries matter. |
| Is RC2 stable? | No. `v0.3.0-rc.2` is the current rehearsal ref. `v0.2.4` remains the existing stable public release. |

---

## Step Summary

The Step Summary includes:

- **Maintainer read this first**: changed file count, subsystems touched, sensitive surfaces, CODEOWNERS status, admission status, and review routing cue.
- **Review routing**: CODEOWNERS source, matched areas, owners, unowned changed paths, absent/degraded state.
- **Sensitive surfaces**: deterministic path/category hits only.
- **Subsystem reach**: ranked top-level directories.
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
| `action_blocked` | `true` only in strict mode when admission failed. |

---

## Runtime Admission Provenance

Self-attested records are optional source-free JSON artifacts under `.neurcode-admission/*.json`.

They can help an author state that a local runtime admission process ran, but they are claims by the same principal who authored the diff. They are not cryptographic proof and not enterprise signed receipts.

---

## Strict Self-Attested Mode

```yaml
- uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.2
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

Maintainer Report V2 RC2 was rehearsed against controlled OSS-style scenarios and a FastAPI temp clone before publication. The rehearsal scored generated Step Summary lines as ACTIONABLE, OBVIOUS, or NOISE and checked for source snippets, diff hunks, secrets, telemetry claims, and proof overclaims.

External maintainer feedback is still required before stable promotion.

---

## Bundle Provenance

See [`PROVENANCE.json`](./PROVENANCE.json) for the source commit SHA and SHA-256 of the committed `dist/index.js`. The public repo's CI verifies bundle integrity by checksum match. Signed build attestations are not part of this release.

---

## Existing v0.2.4 Installation Path

`sujit-jaunjal/neurcode-actions@v0.2.4` remains available and untouched as the existing stable pilot surface. This `v0.3.0-rc.2` is an additive release candidate for human review before promotion.

---

## Adoption Bridge Docs

- [OSS maintainer path](./docs/oss-maintainer-path.md)
- [Runtime admission demo story](./docs/runtime-admission-demo-story.md)
- [Maintainer outreach ask](./docs/maintainer-outreach.md)
- [Adoption ladder](./docs/adoption-ladder.md)

---

*No telemetry. No source upload. No AI inference. Same verdict on every machine.*
