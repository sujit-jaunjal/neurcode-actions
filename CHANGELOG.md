# Changelog

## [Unreleased / v0.3.0-rc.1] — Release Candidate

> **RC — for human review, not for production promotion yet.**
> Preserves `v0.2.4` (Repository Operational Memory) as the existing stable public release.

### Added
- **Layer 1 standalone advisory**: deterministic PR effect inventory (changed files, subsystem reach, sensitive surfaces, CODEOWNERS analysis) — works with one workflow file, no account or runtime required.
- **Layer 2 runtime-aware admission**: discovers `.neurcode-admission/*.json`, runs Phase A bounded parser and consistency validator, unions coverage identities across multiple partial records, reports self_attested_complete/self_attested_incomplete/self_attested_inconsistent/no_record.
- **Multi-record union**: two partial records covering different files union to `self_attested_complete`.
- **Adversarial hardening**: immutable Git object-store artifact discovery, explicit symlink-mode rejection, direct-child-only discovery, safe filename regex (no traversal, no leading dots), per-file (8 MB) and aggregate byte ceilings.
- **CODEOWNERS from base commit only**: never reads the attacker-controlled PR head; unsupported GitHub CODEOWNERS syntax is surfaced as degraded analysis.
- **Fork-safe**: no secrets required, `pull_request_target` explicitly rejected.
- **Policy modes**: `advisory` (default, never fails) and `strict_self_attested` (experimental, labeled throughout).
- **Step summary**: deterministic, source-free, surfacing Layer 1 + Layer 2 results.
- **Bundle provenance**: `PROVENANCE.json` with source commit SHA and bundle SHA-256. CI verifies checksum; does not rebuild (monorepo source is private).

### Preserved
- `v0.2.4` (Repository Operational Memory / scope coherence) is untouched and remains available at `sujit-jaunjal/neurcode-actions@v0.2.4`.

### Deferred (Phase C)
- Cryptographic signing / backend-anchored signed receipts.
- Trusted branch-protection enforcement.
- Hosted dashboard correlation.

---

## [v0.2.4] — Repository Operational Memory (stable)

See prior CHANGELOG for v0.2.4 details.
