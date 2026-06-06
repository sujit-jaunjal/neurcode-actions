# Changelog

## [Unreleased / v0.3.0-rc.4] - Release Candidate

> **RC - for human review, not for production promotion yet.**
> Preserves `v0.2.4` (Repository Operational Memory) as the existing stable public release.

### Added
- Runtime admission context section now reads optional `.neurcode-admission/*.json` records and reports trust level, governed host, blocked/approved/denied counts, approval-required surfaces, receipt integrity, and source-free maintainer questions.
- Backend receipt summaries can be attached to admission exports with `neurcode session export-admission <sessionId> --receipt receipt.json`. The Action displays receipt ID, key ID, verification status, signed timestamp, and verifier hint without embedding source or full receipt signatures.

### Preserved
- `v0.3.0-rc.3` remains the current published rehearsal ref until RC4 is tagged.
- The Action remains advisory by default and does not claim hard enforcement or proof from self-attested records.

---

## [v0.3.0-rc.3] - Release Candidate

> **RC - for human review, not for production promotion yet.**
> Preserves `v0.2.4` (Repository Operational Memory) as the existing stable public release.

### Fixed
- Updated the JavaScript Action runtime metadata to `node24` and public workflow snippets to `actions/checkout@v5` after live Airflow rehearsal exposed Node.js 20 deprecation warnings in GitHub Actions.

---

## [v0.3.0-rc.2] - Release Candidate

> Superseded by `v0.3.0-rc.3` for external maintainer rehearsal.

### Fixed
- Reduced docs-only noise by restricting auth-sensitive filename matching to code files, so documentation paths such as OAuth/JWT guides do not trigger auth review attention by filename alone.
- Added `uv.lock` to lockfile detection.

---

## [v0.3.0-rc.1] - Release Candidate

> Superseded by `v0.3.0-rc.2`.

### Added
- **Maintainer Report V2**: compact PR triage summary for changed files, subsystem reach, sensitive surfaces, CODEOWNERS routing, admission provenance, deterministic maintainer questions, and trust boundary.
- **Layer 1 standalone advisory**: deterministic PR effect inventory (changed files, subsystem reach, sensitive surfaces, CODEOWNERS analysis) - works with one workflow file, no account or runtime required.
- **Layer 2 runtime-aware admission**: discovers `.neurcode-admission/*.json`, runs Phase A bounded parser and consistency validator, unions coverage identities across multiple partial records, reports self_attested_complete/self_attested_incomplete/self_attested_inconsistent/no_record.
- **Multi-record union**: two partial records covering different files union to `self_attested_complete`.
- **Adversarial hardening**: immutable Git object-store artifact discovery, explicit symlink-mode rejection, direct-child-only discovery, safe filename regex (no traversal, no leading dots), per-file (8 MB) and aggregate byte ceilings.
- **CODEOWNERS from base commit only**: never reads the attacker-controlled PR head; unsupported GitHub CODEOWNERS syntax is surfaced as degraded analysis.
- **Fork-safe**: no secrets required, `pull_request_target` explicitly rejected.
- **Policy modes**: `advisory` (default, never fails) and `strict_self_attested` (experimental, labeled throughout).
- **New outputs**: `review_attention`, `maintainer_questions_count`, and `sensitive_surface_count`.
- **OSS evaluation evidence**: source-free fixture and FastAPI temp-clone rehearsals were used for RC validation; the public distribution documents the result without shipping source fixtures or source harnesses.
- **Bundle provenance**: `PROVENANCE.json` with source commit SHA and bundle SHA-256. CI verifies checksum; does not rebuild (monorepo source is private).

### Preserved
- `v0.2.4` (Repository Operational Memory / scope coherence) is untouched and remains available at `sujit-jaunjal/neurcode-actions@v0.2.4`.

### Deferred (Phase C)
- Cryptographic signing / backend-anchored signed receipts.
- Trusted branch-protection enforcement.
- Hosted dashboard correlation.

---

## [v0.2.4] - Repository Operational Memory (stable)

See prior CHANGELOG for v0.2.4 details.
