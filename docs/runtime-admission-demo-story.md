# Demo Story: Export Task With Runtime Admission Context

This is a concise source-free story for docs, website copy, and outreach.

## The Situation

An AI coding agent is asked to update an export task.

During the session, the agent tries to write outside the intended export path and into a billing-owned path. Neurcode runtime governance blocks that write before it lands. An operator reviews the context and approves exactly one file path needed for the task. The agent finishes the work. The PR opens. The GitHub Action routes review attention and shows runtime admission context.

This story does not claim a vulnerability. It shows review routing and runtime governance evidence.

## Timeline

1. The operator starts a governed runtime session for an export-task change.
2. Neurcode records the task intent and active plan in source-free form.
3. The agent attempts an edit in a billing-owned path.
4. The runtime blocks the write and asks for an exact-path decision.
5. The operator approves one specific path after review.
6. The session completes and exports a source-free admission record.
7. The PR opens with changed paths and `.neurcode-admission/*.json`.
8. The GitHub Action produces a maintainer report.

## Screenshot-Ready Report Excerpt

```md
### Neurcode Runtime Admission Advisory

Policy: **advisory - non-blocking**

#### Maintainer read this first
| Signal | Deterministic result |
|---|---|
| Changed files | 3 files changed: 3 modified |
| Subsystems touched | 2 subsystems - tasks (2), billing (1) |
| Sensitive surfaces touched | 1 category - billing/payment (1) |
| CODEOWNERS zones crossed | 2 zones crossed from .github/CODEOWNERS |
| Admission record status | self_attested_complete - complete self-attested coverage claim |
| Review routing | Needs attention - multiple CODEOWNERS zones crossed, sensitive surfaces touched |

#### Suggested maintainer questions
- This PR crosses 2 CODEOWNERS zones. Are all owners represented in review?
- This PR touches billing or payment paths. Should a billing owner review the changed behavior?

#### Runtime admission provenance
Usable self-attested records claim coverage for every changed path. This is a claim, not cryptographic proof or enterprise signed evidence.

#### Trust boundary
- Source-free: uses changed paths, git modes, blob object IDs, CODEOWNERS metadata, file categories, and deterministic hashes.
- No telemetry and no source upload.
- Advisory by default. `strict_self_attested` is experimental and self-attested.
- Self-attested records are claims, not cryptographic proof or enterprise signed receipts.
```

The excerpt uses path categories and counts only. It does not include source snippets, prompts, diff hunks, secret values, or model opinions.

## What The Maintainer Sees

The maintainer gets a compact PR summary:

- A billing/payment path category was touched.
- The PR crosses two ownership zones.
- A self-attested runtime admission record claims all changed paths were covered.
- The report asks whether the relevant owners are represented in review.
- The report repeats that the record is self-attested and not cryptographic proof.

The maintainer still reviews the PR normally. The Action helps route attention; it does not decide whether the change is safe.

## What The Enterprise Operator Sees

The operator sees the before-PR runtime context:

- The agent task intent.
- The active plan and revisions.
- The attempted billing-path write.
- The exact path that was blocked.
- The operator decision for that one path.
- The source-free session evidence exported for PR review.

In the full platform, this becomes part of the dashboard review workflow. Signed/backend-anchored receipts are future enterprise evidence and are not claimed by the current OSS Action.

## Copyable One-Liner

Free Action: routes PR review from deterministic git and CODEOWNERS facts.

Runtime platform: governs AI coding sessions before code lands and can export source-free admission context for the PR.
