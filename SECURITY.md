# Security Policy

## This action's security properties

- **No secrets required** for `pull_request` events (fork-safe).
- **No source upload**: only paths, git modes, and content-addressed blob hashes leave the runner.
- **No outbound network calls**: purely local git metadata analysis.
- **No execution of PR-controlled code**: no `npm install`, no repository scripts, no package hooks.
- **Artifact hardening**: artifacts are read from the immutable PR head Git tree via `git ls-tree` + `git cat-file`. Symlink entries (mode `120000`) are explicitly rejected at the tree level. Only direct-child `.json` blobs are accepted. Bounded filename validation, per-file (8 MB) and aggregate byte ceilings, traversal protection.
- **CODEOWNERS** is always read from the base commit, never the PR head. Unsupported GitHub CODEOWNERS syntax (`!`, `[ ]`, escaped leading `#`) is skipped with bounded diagnostics rather than guessed.

## Reporting a vulnerability

Please report security vulnerabilities to **security@neurcode.ai** or open a private advisory via GitHub's security tab.

Do not open a public issue for security vulnerabilities.

## Self-attested vs. signed

Self-attested admission records are authored by the same principal as the diff and are **claims, not cryptographic proof**. Signed receipt infrastructure is Phase C and not present in this release.
