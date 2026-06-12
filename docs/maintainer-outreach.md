# OSS Maintainer Outreach Ask

Use this when asking a maintainer to try the RC Action on one repository or one pull request. Keep the ask small. Do not lead with enterprise runtime governance.

## 30-Second Explanation

Neurcode Runtime Admission Advisory is a free GitHub Action that writes a source-free PR triage summary. It shows changed-file count, subsystem reach, CODEOWNERS zones crossed, deterministic sensitive path categories, optional runtime admission status, and review-routing questions. It does not read source contents, upload telemetry, or claim vulnerabilities.

Current rehearsal ref: `sujit-jaunjal/neurcode-actions@v0.3.0-rc.5`.

Existing stable ref remains: `sujit-jaunjal/neurcode-actions@v0.2.4`.

## What I Am Asking You To Try

Try the RC Action on one repo or one PR and tell me whether the Step Summary helped you route review attention faster.

Useful feedback:

- Which lines were actionable?
- Which lines merely repeated the diff?
- Which lines felt noisy or misleading?
- Did docs-only PRs stay quiet?
- Did CODEOWNERS routing match how the project actually reviews PRs?
- Did CI, dependency, auth, config, migration, generated-file, or lockfile paths get the right level of attention?

## What It Does Not Collect

- No source file contents.
- No diff hunks.
- No prompts.
- No patches.
- No secrets.
- No telemetry.
- No Neurcode account or API key.

It uses PR changed paths, git modes, blob object IDs, CODEOWNERS metadata, path categories, changed-file status, and deterministic hashes.

## How To Install

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

## How To Remove It

Delete `.github/workflows/neurcode-admission.yml`.

If you also tested optional runtime admission records, delete committed `.neurcode-admission/*.json` records from the branch where you tested them.

## Short Email Or DM Template

Subject: Could you try a source-free PR triage Action on one PR?

Hi <name>,

I am rehearsing `sujit-jaunjal/neurcode-actions@v0.3.0-rc.5`, a free GitHub Action that writes a source-free PR triage report for maintainers.

It does not need an account or API key, does not upload source, and does not claim to detect vulnerabilities. It only reports deterministic facts like changed-file count, CODEOWNERS zones crossed, subsystem reach, CI/dependency/auth/config/migration-style path categories, and review-routing questions.

Would you be open to trying it on one repo or one PR and telling me whether the summary was actionable, obvious, or noisy?

Install is one workflow file:

```yaml
- uses: sujit-jaunjal/neurcode-actions@v0.3.0-rc.5
```

The feedback I need most: whether it helped you decide who should review the PR, and whether any line felt misleading or too loud.

Thanks,
<name>

## GitHub Issue Or Comment Template

```md
I am testing Neurcode Runtime Admission Advisory on this repo.

What it does:
- Adds a source-free PR triage Step Summary.
- Reports changed-file count, subsystem reach, CODEOWNERS zones, deterministic sensitive path categories, optional runtime admission status, and review-routing questions.
- Runs with no account, no API key, no source upload, and no telemetry.

What it does not do:
- Does not read source contents or diff hunks.
- Does not detect vulnerabilities.
- Does not prove AI governance ran.
- Does not replace maintainer review.

Current rehearsal ref:
`sujit-jaunjal/neurcode-actions@v0.3.0-rc.5`

Ask:
Can we try it on one PR and score the summary lines as ACTIONABLE, OBVIOUS, or NOISE?

Removal:
Delete `.github/workflows/neurcode-admission.yml`.
```

## Feedback Form

```md
Repo:
PR:
Scenario:

ACTIONABLE lines:

OBVIOUS lines:

NOISE lines:

Did it route review attention correctly?

Did it stay source-free?

Was any wording too strong?

Would you keep it installed for more PRs?
```
