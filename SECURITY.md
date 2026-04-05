# Security Policy

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

