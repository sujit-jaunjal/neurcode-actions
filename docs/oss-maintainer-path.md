# OSS Maintainer Path

Neurcode Runtime Admission Advisory is a zero-account, source-free PR triage report for OSS maintainers.

It is useful by itself, before any team adopts the Neurcode runtime platform.

## Install The Free Action

Copy this workflow into `.github/workflows/neurcode-admission.yml`:

```yaml
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
      - uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.5
```

No Neurcode account, API key, runtime, local CLI, or telemetry endpoint is required.

## What You Get Without An Account

On each pull request, the Action writes a GitHub Step Summary with:

- Changed-file count and change status.
- Subsystems touched, ranked by changed-file count.
- CODEOWNERS zones crossed and owners involved, read from the base commit.
- Clear no-CODEOWNERS and degraded-CODEOWNERS states.
- Deterministic sensitive path categories: CI/workflow, dependency manifests, lockfiles, auth, billing/payment, database/migrations, secrets/config, infrastructure/deploy, and generated files.
- Runtime admission context, usually "No runtime admission record found. This report is PR metadata only." unless the PR includes `.neurcode-admission/*.json`.
- Suggested maintainer questions generated only from deterministic facts.
- A trust boundary that states source-free, no telemetry, advisory by default, and self-attested records are not cryptographic proof.

## Why This Helps Review

Maintainers do not need another scanner-shaped wall of output. They need a 60-second routing cue:

- "This PR crosses 3 CODEOWNERS zones. Are all owners represented in review?"
- "This PR touches CI workflow files. Should workflow changes be reviewed separately?"
- "This PR touches dependency manifests and lockfiles. Are dependency changes intentional and reviewed together?"
- "This PR touches migrations and application code. Is rollout/rollback review needed?"
- "This docs-only PR has no deterministic routing flags."

The Action should help a maintainer decide who needs to look, not pretend to know whether the change is good.

## What It Does Not Do

- It does not read source contents.
- It does not render source snippets or diff hunks.
- It does not upload telemetry.
- It does not require secrets.
- It does not detect vulnerabilities.
- It does not infer AI intent.
- It does not prove that runtime governance ran.
- It does not replace maintainer judgment.

## Runtime Bridge

The Action helps after code reaches a PR. Neurcode runtime governance helps before code lands.

| Mode | PR report status | Meaning |
|---|---|---|
| Action alone | `no_record` | No self-attested runtime admission record was attached. Ordinary PRs can still benefit from review routing. |
| Action plus runtime export | `self_attested_complete`, `self_attested_incomplete`, or `self_attested_inconsistent` plus a Runtime admission context section | The PR includes source-free runtime context from a governed local session: trust level, host, blocked/approved/denied counts, approval-required surfaces, and receipt/integrity status. |
| Full platform | Runtime evidence in the dashboard plus optional PR admission context | Live agent governance with source-free intent summaries, ownership boundaries, exact-path approvals, dashboard workflow, and backend receipts where configured. |

Trust level is explicit. `self_attested` is a claim by the PR author, not proof. `backend_signed` appears only when signed receipt metadata is attached and should be verified before enterprise use.

To attach runtime context after a governed local session:

```bash
neurcode session export-admission
neurcode session export-admission <sessionId> --receipt receipt.json  # optional backend receipt summary
git add .neurcode-admission/*.json
```

## RC Status

`sujit-jaunjal/neurcode-actions@v0.3.0-rc.5` is the current rehearsal ref for Maintainer Report V2. It should be tried on real OSS pull requests before stable promotion.

`sujit-jaunjal/neurcode-actions@v0.2.4` remains the existing stable public release.
