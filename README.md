# Neurcode Runtime Admission Advisory

**A zero-account, source-free PR triage report for ownership, sensitive surfaces, and runtime admission evidence.**

Install one workflow file. The Action produces a concise GitHub Step Summary that helps maintainers route review attention faster for AI-assisted or ordinary pull requests.

No Neurcode account. No API key. No source upload. No telemetry. No local runtime required.

[![Bundle Integrity](https://img.shields.io/badge/bundle-integrity%20verified-blue)](./PROVENANCE.json)

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

## Evaluation Harness

The source-free evaluation harness is included under `evaluation/`.

```bash
node evaluation/oss-report-harness.mjs
```

It runs controlled OSS-style scenarios, scores the report as ACTIONABLE, OBVIOUS, or NOISE, and writes `evaluation/latest-report.md`. Use `--real-repo-url <url>` for optional temp-clone rehearsal.

---

## Bundle Provenance

See [`PROVENANCE.json`](./PROVENANCE.json) for the source commit SHA and SHA-256 of the committed `dist/index.js`. The public repo's CI verifies bundle integrity by checksum match. Signed build attestations are not part of this release.

---

## Existing v0.2.4 Installation Path

`sujit-jaunjal/neurcode-actions@v0.2.4` remains available and untouched as the existing stable pilot surface. This `v0.3.0-rc.2` is an additive release candidate for human review before promotion.

---

*No telemetry. No source upload. No AI inference. Same verdict on every machine.*
