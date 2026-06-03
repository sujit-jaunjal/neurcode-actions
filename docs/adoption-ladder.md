# Neurcode Adoption Ladder

## Step 1 — Standalone advisory (this action)

**What you need:** One GitHub workflow file.

**What you get:**
- Deterministic PR effect inventory on every PR (changed files, subsystems, sensitive surfaces, CODEOWNERS crossings).
- `admission_verdict: no_record` — clearly reported, not an error.
- Advisory-only: step summary + outputs, never blocks merge.
- No account, API key, CLI, or local tooling required.

```yaml
- uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.1
```

---

## Step 2 — With local Neurcode runtime

**What you need:** Step 1 + install the Neurcode CLI locally.

**What you get:**
- Session governance during agent coding sessions (pre-write verification, guard posture).
- Self-attested admission records written to `.neurcode/admission/<session-id>.json` (gitignored local state).
- `neurcode admission export` copies the latest selected record to `.neurcode-admission/<session-id>.json`.
- Commit selected exported records to activate Layer 2 in CI.
- Layer 2 activates in CI: per-record validation, multi-record union, covered/uncovered path reporting.

**Trust level:** Self-attested (claim by the diff author). Honest about what it is; never claims to be proof.

```bash
neurcode admission export
git add .neurcode-admission/
```

Use `neurcode admission export <session-id>` to export a specific governed session.

---

## Step 3 — Enterprise hosted *(Phase C — not yet available)*

**What you need:** Steps 1 + 2 + a Neurcode backend account.

**What you get:**
- Backend-anchored signed receipts (not authored by the diff principal).
- Cryptographic proof that governance ran, independently verifiable.
- Trusted branch-protection enforcement.
- Dashboard correlation and multi-approver governance.

Signed attestations are explicitly deferred to Phase C. No infrastructure for this exists in the current release.

---

## Provenance disclaimer

Self-attested provenance in Step 2 is a **claim**: the artifact is authored by the same git identity as the diff and can be fabricated with matching object IDs. This is honestly labeled throughout the action, in summaries, and in this documentation. It provides useful signal but is not a trusted security control.
