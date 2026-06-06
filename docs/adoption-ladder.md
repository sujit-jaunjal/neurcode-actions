# Neurcode OSS Adoption Ladder

This ladder is the bridge from the free GitHub Action to runtime governance. Start with the Action. Add runtime only when your team wants governance while AI coding sessions are happening.

## Step 1 - Free GitHub Action

**What you need:** one workflow file.

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

**What maintainers get immediately:**

- A source-free PR triage report on every pull request.
- Changed-file count, subsystem reach, CODEOWNERS crossings, owner tokens, and unowned changed paths.
- Deterministic sensitive path categories such as CI/workflow, dependency manifests, lockfiles, auth, billing/payment, database/migrations, secrets/config, infrastructure/deploy, and generated files.
- Suggested maintainer questions generated only from those facts.
- Docs-only or low-routing PRs that stay quiet when no deterministic routing flag fires.
- `admission_verdict: no_record` clearly reported, not treated as an error.

**What it does not do:**

- Does not read source contents or diff hunks.
- Does not upload telemetry.
- Does not claim vulnerabilities or security severity.
- Does not prove that an AI agent was governed.
- Does not replace maintainer review.

`v0.3.0-rc.2` is the current rehearsal ref. `v0.2.4` remains the existing stable public release.

## Step 2 - Action Plus Runtime Admission Record

**What you need:** Step 1 plus local Neurcode runtime use by the PR author.

When a governed local runtime session produces source-free admission context, the author can export selected records into `.neurcode-admission/*.json` and commit them with the PR.

```bash
neurcode admission export
git add .neurcode-admission/
```

**What maintainers see in the Action report:**

- `self_attested_complete`: usable records claim coverage for every changed path.
- `self_attested_incomplete`: usable records claim coverage for only part of the changed path set.
- `self_attested_inconsistent`: records are malformed or inconsistent with committed git metadata.
- Covered and uncovered path counts.
- Deterministic questions about incomplete or inconsistent records.

**Trust boundary:** these records are self-attested claims by the PR author. They can be useful review context, but they are not cryptographic proof and not enterprise signed receipts.

## Step 3 - Full Neurcode Runtime Governance Platform

**What you need:** Neurcode runtime platform access.

The platform governs before code lands:

- Live agent governance during AI coding sessions.
- Intent and plan records.
- CODEOWNERS and boundary awareness.
- Exact-path approvals for sensitive or owner-controlled writes.
- Source-free evidence for dashboard review workflow.
- Structural understanding of what changed and what depends on it.

This is the paid/enterprise product path. It is different from the free Action: the Action reports on PRs after code exists; the runtime platform supervises the work while it is being attempted.

## Future Enterprise Evidence

Backend-anchored signed receipts are future enterprise evidence. They are not part of the current OSS Action. The current Action can validate self-attested records, but it must not be treated as cryptographic proof or a trusted branch-protection control.

## Which Step Should I Try?

| Situation | Start here |
|---|---|
| I maintain an OSS repo and want a clearer PR summary. | Step 1 |
| I use AI coding agents and want PRs to show source-free runtime context. | Step 2 |
| I need live agent governance, exact-path approvals, and dashboard workflow. | Step 3 |
| I need stable production release semantics today. | Stay on `v0.2.4` or wait for `v0.3.0` stable. |
