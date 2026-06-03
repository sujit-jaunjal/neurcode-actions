# Neurcode — Runtime Admission Advisory

**Deterministic PR effect inventory and optional runtime admission provenance. One workflow file. No account, API key, or local runtime required.**

[![Bundle Integrity](https://img.shields.io/badge/bundle-integrity%20verified-blue)](./PROVENANCE.json)

---

## What it does

**Layer 1 (always runs — no runtime required):**
- Changed-file effect inventory (paths + change kinds)
- Top-level subsystem and directory reach
- CODEOWNERS boundary crossings (read from base commit, never the PR head; unsupported CODEOWNERS syntax is reported as degraded analysis)
- Sensitive operational surfaces: migrations, CI config, infra, auth, generated code, lock files, secrets config
- All path-metadata only — no source content, no diff text, no AI analysis, no telemetry

**Layer 2 (activates when `.neurcode-admission/*.json` is present):**
- Bounded discovery and parsing of self-attested runtime admission records
- Multi-record union: no single record needs to cover the entire PR
- Reports: `self_attested_complete` · `self_attested_incomplete` · `self_attested_inconsistent` · `no_record`
- Covered and uncovered paths only — no source leakage

**Self-attested provenance is a claim, not cryptographic proof.** Advisory-only by default — never blocks merge.

---

## Quick start

```yaml
# .github/workflows/neurcode-admission.yml
name: Neurcode Admission Advisory
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read   # git metadata only, no source upload
jobs:
  admission-advisory:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0          # both base and head SHAs must be present
      - uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.1
```

---

## Adoption ladder

| Step | What you get |
|---|---|
| **This action (standalone)** | Deterministic PR inventory, CODEOWNERS analysis, sensitive surface detection |
| **+ local Neurcode runtime** | `neurcode admission export` attaches source-free self-attested admission records to your PRs (Layer 2 activates) |
| **+ Enterprise hosted** *(Phase C)* | Backend-anchored signed receipts — cryptographic proof that governance ran |

---

## Inputs

| Input | Default | Description |
|---|---|---|
| `policy` | `advisory` | `advisory` (never fails) or `strict_self_attested` (experimental) |
| `no_record_strict` | `false` | In strict mode, fail when no admission record exists |
| `max_artifacts` | `256` | Maximum `.neurcode-admission/*.json` files to process |
| `max_aggregate_bytes` | `16777216` | Maximum aggregate bytes for all artifacts |

Base and head SHAs are resolved from `github.event.pull_request`. There are no override inputs in V1.

## Outputs

| Output | Description |
|---|---|
| `effect_count` | Files in the committed delta |
| `subsystems` | Comma-separated top-level directories |
| `sensitive_surfaces` | Sensitive surface categories detected |
| `codeowners_zones_crossed` | Distinct ownership zones crossed |
| `codeowners_changed` | `true` if CODEOWNERS appears in the delta |
| `admission_verdict` | `self_attested_complete` · `self_attested_incomplete` · `self_attested_inconsistent` · `no_record` |
| `covered_paths_count` | Paths with admission coverage |
| `uncovered_paths_count` | Paths without coverage |
| `record_count` | Artifacts discovered |
| `usable_record_count` | Artifacts passing validation |
| `action_blocked` | `true` only in strict mode when admission failed |

---

## Trust boundary

- **Fork-safe**: no secrets required on `pull_request` events. Rejects `pull_request_target`.
- **Source-free**: paths, modes, and git blob hashes only. No file content, no diff text.
- **Artifact hardening**: artifacts are read from the immutable PR head Git tree via `git ls-tree` + `git cat-file`, not from the mutable checkout worktree. Symlink entries (mode `120000`) are explicitly rejected. Direct-child blobs only; bounded filename validation; per-file (8 MB) and aggregate byte ceilings.
- **CODEOWNERS**: always read from the **base commit**, never the attacker-controlled PR head. The Action implements a bounded GitHub-compatible subset; unsupported syntax (`!`, `[ ]`, escaped leading `#`) is skipped with bounded diagnostics instead of being misinterpreted.
- **Self-attested ≠ proof**: the diff author is also the artifact author and can fabricate matching object IDs. Cryptographic proof requires a backend-anchored signed receipt (Phase C, not available in this release).

---

## Strict self-attested mode (experimental)

```yaml
- uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.1
  with:
    policy: strict_self_attested   # may fail on incomplete/inconsistent
    no_record_strict: 'false'      # set true to also fail on no_record
```

⚠ **Experimental, labeled throughout.** This mode blocks on self-reported inconsistency, not on independent verification. It is NOT a replacement for enterprise-grade branch protection. Trusted enforcement requires signed receipts (Phase C).

---

## Local runtime export

When the local Neurcode runtime governs an AI coding session, it writes a gitignored record under `.neurcode/admission/`. To attach that source-free record to the PR:

```bash
neurcode admission export
git add .neurcode-admission/
```

Use `neurcode admission export <session-id>` for an explicit session. The record contains git metadata and deterministic hashes only: paths, modes, object IDs, replay/profile hashes, and the self-attested disclaimer. It does not contain source code, diff text, prompts, patches, or secrets.

---

## Bundle provenance

See [`PROVENANCE.json`](./PROVENANCE.json) for the source commit SHA and SHA-256 of the committed `dist/index.js`. The public repo's CI verifies bundle integrity (checksum match), but does **not** rebuild from source — the monorepo source is private. Signed build attestations are Phase C.

---

## Existing v0.2.4 installation path

`sujit-jaunjal/neurcode-actions@v0.2.4` (Repository Operational Memory) remains available and untouched as the existing stable pilot surface. This `v0.3.0-rc.1` is an additive release-candidate for human review before promotion.

---

*No telemetry · No source upload · No AI prose · Same verdict on every machine*
