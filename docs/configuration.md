# Configuration

Neurcode is zero-config by default. Everything below is optional.

## Action inputs (common)

| Input | Default | Description |
|---|---|---|
| `oss_mode` | `false` | Set `'true'` for the OSS operational surface (no account, no API key). |
| `github_token` | — | `${{ github.token }}` — used only to read the diff and post/update the advisory comment. |
| `mode` | `gate` | `gate` (per-PR), `memory`, `release-report`, `cartography`, `dynamics`, `digest`, `pilot`. |
| `comment_on` | `flagged` | `flagged` (silent on coherent PRs), `always`, or `never` (Step-Summary-only). |
| `scope_coherence_fail` | `false` | When `true`, a scope mismatch fails the check. Leave `false` to stay advisory. |
| `memory_min_window` | `40` | `mode=memory` warm-up baseline; release boundaries below this many cumulative records are absorbed into the silent baseline. `0` = full day-zero replay. |

See [`action.yml`](../action.yml) for the complete list.

## Repo-native config — `.neurcode/oss.json`

Tune behavior without touching the workflow. This file lives in your repo, is replay-safe, and **overrides** the workflow inputs above:

```json
{
  "commentOn": "flagged",
  "failOnIncoherent": false,
  "ignorePaths": ["vendor/", "third_party/", "**/generated/**", "**/*.pb.go"]
}
```

| Key | Default | Description |
|---|---|---|
| `commentOn` | `flagged` | `flagged` / `always` / `never`. |
| `failOnIncoherent` | `false` | Block the check on a scope mismatch. **Keep `false` for pilots.** |
| `ignorePaths` | `[]` | Globs excluded from the blast radius — generated, vendored, or third-party code. |

## Outputs

| Output | Values |
|---|---|
| `scope_coherence_verdict` | `coherent` / `review` / `incoherent` |
| `commented` | `true` / `false` |
| `convergence` | `clean` / `converged` / `fix-loop` / `persistent` / `unresolved` |
| `declared_change_kind` | e.g. `fix`, `docs`, `chore`, `feature` |
| `blast_radius_subsystems` | comma-separated module list |
| `scope_hash` | deterministic content hash (re-run to reproduce) |
| `operational_events` | `mode=memory`: number of events in the accumulated memory |

## Permissions

Minimum:

```yaml
permissions:
  contents: read          # check out the diff + history
  pull-requests: write    # post/update the one advisory comment
```

Set `commentOn: never` (or `mode: memory`, which doesn't comment) and you can drop `pull-requests: write` entirely — the result still appears in the Step Summary and outputs.

## Rollback

Delete the workflow file. There is no service to deprovision, no account to close, no webhook to revoke. Any `.neurcode/` files are yours to keep or delete.
