# Neurcode Verify GitHub Action

Enterprise PR governance action for `neurcode verify`, with optional auto-remediation and merge-confidence publishing.

## Recommended PR Gate (Deterministic)

```yaml
name: Neurcode Gatekeeper

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  governance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Run Neurcode Verification
        uses: ./packages/action
        env:
          NEURCODE_API_URL: https://api.neurcode.com
        with:
          api_key: ${{ secrets.NEURCODE_API_KEY }}
          project_id: ${{ vars.NEURCODE_PROJECT_ID }}
          org_id: ${{ vars.NEURCODE_ORG_ID }}
          base_ref: 'HEAD~1'
          threshold: 'C'
          record: 'true'
          enterprise_mode: 'true'
          verify_policy_only: 'false'
          changed_files_only: 'true'
          auto_remediate: 'true'
          remediation_commit: 'false'
          remediation_push: 'false'
```

## Inputs (Common)

| Input | Description | Default |
|---|---|---|
| `api_key` | Neurcode API key for verify/ship in CI | `''` |
| `project_id` | Neurcode project id for cloud-linked workflows | `''` |
| `org_id` | Optional org id for CI auth scoping | `''` |
| `base_ref` | Override verify base ref (`origin/main`, `HEAD~1`, etc.) | `''` |
| `record` | Record verification to Neurcode cloud | `true` |
| `threshold` | Minimum acceptable grade (`A`/`B`/`C`/`D`/`F`) | `C` |
| `enterprise_mode` | Auto-enable enterprise-safe verify defaults unless explicitly overridden | `true` |
| `verify_policy_only` | Run `neurcode verify --policy-only` | `false` |
| `changed_files_only` | Enforce only violations from changed files in this PR/base diff | `false` |
| `enforce_change_contract` | Treat contract drift as hard fail; set `true`/`false` to override enterprise auto mode | `''` (auto) |
| `enforce_strict_verification` | Treat tier-limited `INFO` as failure; set `true`/`false` to override enterprise auto mode | `''` (auto) |
| `require_signed_artifacts` | Require signed compiled-policy/change-contract artifacts; set `true`/`false` to override enterprise auto mode | `''` (auto) |
| `allow_manual_approval_pending` | Allow pass when governance requires human approval (`manual_approval`) | `false` |
| `enforce_policy_exception_workflow` | Fail when exceptions are matched but blocked by approval governance | `''` (auto) |
| `auto_remediate` | Run `neurcode ship` when verify fails | `false` |
| `remediation_commit` | Create remediation commit on success | `false` |
| `remediation_push` | Push remediation commit to PR branch | `false` |
| `verify_after_remediation` | Re-run verify after remediation | `true` |

See `action.yml` for full advanced inputs (timeouts, retries, CLI source/version, commit metadata).

## Outputs

| Output | Meaning |
|---|---|
| `verdict` | Verification verdict |
| `verify_mode` | Effective verify mode (`plan_aware`, `plan_enforced_explicit`, `policy_only`, `policy_only_fallback`) |
| `policy_only_fallback_used` | `true` if missing plan context triggered policy-only retry |
| `grade` | Verification grade |
| `score` | Verification score |
| `violations` | Violation count |
| `verification_tier` | Reported tier (if present) |
| `tier_limited` | `true` if verify result is tier-limited |
| `threshold` | Threshold used by action |
| `threshold_passed` | `true` / `false` / `unknown` |
| `compatibility_contract_version` | Runtime compatibility contract version enforced in handshake |
| `compatibility_manifest_version` | Versioned runtime manifest resolved during handshake |
| `compatibility_cli_version` | CLI version discovered from `neurcode compat --json` |
| `compatibility_api_version` | API version discovered from health compatibility payload |
| `enterprise_enforced_signed_artifacts` | Effective signed-artifact requirement after enterprise defaults |
| `enterprise_enforced_policy_exception_workflow` | Effective exception-workflow enforcement after enterprise defaults |
| `manual_approval_gate_blocked` | `true` when action failed because manual governance approval is still pending |
| `policy_exceptions_blocked` | Count of exception matches blocked by approval governance |
| `policy_exceptions_suppressed` | Count of violations suppressed by active exceptions |
| `policy_exceptions_matched` | Count of matched exception IDs |
| `policy_exceptions_source_mode` | Exceptions source mode (`local`, `org`, `org_fallback_local`) |
| `policy_exception_workflow_blocked` | `true` when action failed due to blocked policy exceptions |
| `remediation_status` | `READY_TO_MERGE` or `BLOCKED` (when remediation runs) |
| `merge_confidence` | Merge confidence from ship summary |
| `share_card_url` | Public merge confidence card URL (when available) |
| `remediation_commit_created` | Whether remediation commit was created |
| `remediation_commit_pushed` | Whether remediation commit was pushed |
| `remediation_commit_sha` | Commit SHA when a remediation commit is created |

## Safety Defaults

- Keep `enterprise_mode: true` for deterministic enforcement defaults in CI.
- In enterprise auto mode, change-contract hard-fail is enabled for plan-aware runs and relaxed for policy-only fallback runs.
- When strict enterprise verification is active, policy-only fallback is disabled and missing plan context hard-fails.
- Signed artifact enforcement auto-activates in strict mode when governance signing keys are present (`NEURCODE_GOVERNANCE_SIGNING_KEY` or key-ring env).
- Manual-approval governance decisions fail the action by default; set `allow_manual_approval_pending: true` only for non-blocking rollout phases.
- Blocked policy exceptions (pending/invalid approvals) fail by default in enterprise mode; set `enforce_policy_exception_workflow: false` only for temporary migration windows.
- Use `verify_policy_only: true` only for intentional policy-only governance runs.
- The action detects `neurcode verify --help` capabilities and gracefully drops unsupported verify flags for older pinned CLI versions.
- Without explicit `plan_id`, the action runs plan-aware mode first and automatically retries in policy-only mode only when the verify failure is strictly "missing plan context".
- Use `changed_files_only: true` to avoid blocking on historical repository debt.
- Use `base_ref: HEAD~1` for incremental adoption on long-lived branches with legacy violations.
- Keep `remediation_commit` and `remediation_push` disabled in shared CI.
- Enable commit/push only in a dedicated remediation workflow where branch mutation is expected.
