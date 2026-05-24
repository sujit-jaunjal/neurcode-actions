# Security Policy

## Data handling (OSS operational path)

When run with `oss_mode: true` (or any `mode:` other than the enterprise verify gate), Neurcode:

- makes **no outbound network calls** — your code never leaves the GitHub Actions runner;
- sends **no telemetry or analytics**;
- requires **no account, API key, or secret**;
- uses `github_token` only to read the PR diff and post/update a single advisory comment.

The reasoning path is deterministic (no model, no randomness), so a given commit always produces the same verdict and the same content hash — re-run to verify. The operational memory is re-derivable from your merge history; there is no external datastore.

## Reporting a vulnerability

Please do not open public issues for security vulnerabilities.

- Preferred: GitHub private vulnerability report (Security tab).
- Fallback: email `security@neurcode.com` with:
  - impact summary
  - reproduction steps
  - affected version/commit
  - optional mitigation suggestions

## Response goals

- Initial acknowledgement: within 72 hours
- Triage and severity classification: as soon as reproducible
- Fix and coordinated disclosure: based on severity and exploitability

## Secrets handling policy

- Credentials must never be committed to source control.
- If a credential is exposed:
  1. rotate/revoke immediately,
  2. remove from tracked files,
  3. run `pnpm oss:check`,
  4. consider history rewrite for public repos.

## Supported hardening checks

- `pnpm oss:check` blocks known sensitive/local artifacts from being tracked.
- CI should run the same safety check before merge.

