# Neurcode Verify GitHub Action

A GitHub Action that acts as a gatekeeper for code adherence. It runs `neurcode verify` on Pull Requests and fails the build if the code adherence grade is below the specified threshold.

## Usage

```yaml
name: Neurcode Verify

on:
  pull_request:
    branches: [main, develop]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Neurcode Verify
        uses: ./packages/action
        with:
          threshold: 'C'  # Minimum passing grade (A, B, C, D, F)
          api_key: ${{ secrets.NEURCODE_API_KEY }}  # Optional
          working_directory: '.'  # Optional, default: root
          plan_id: ''  # Optional, will use from config if not provided
```

## Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `threshold` | Minimum passing grade (A, B, C, D, F) | No | `C` |
| `api_key` | Neurcode API key for SaaS plan verification | No | `''` |
| `working_directory` | Directory where to run the neurcode verify command | No | `'.'` |
| `plan_id` | Plan ID to verify against (uses config if not provided) | No | `''` |

## Outputs

| Output | Description |
|--------|-------------|
| `grade` | Code adherence grade (A, B, C, D, F) |
| `adherence-score` | Adherence score percentage |
| `verdict` | Verification verdict (PASS, WARN, FAIL) |
| `bloat-count` | Number of bloated files detected |
| `planned-files-modified` | Number of planned files that were modified |
| `total-planned-files` | Total number of files in the plan |

## How It Works

1. **Installs CLI**: Automatically installs the latest `@neurcode/cli` package globally via npm
2. **Runs Verify**: Executes `neurcode verify --json` in the specified working directory
3. **Parses Results**: Extracts the grade, adherence score, and other metrics from JSON output
4. **Checks Threshold**: Compares the grade against the threshold (A > B > C > D > F)
5. **Fails Build**: Uses `core.setFailed()` if the grade is below the threshold, blocking the merge

## Grade Thresholds

- **A**: Excellent adherence (PASS verdict)
- **B**: Good adherence (WARN verdict, score ≥ 70%)
- **C**: Acceptable adherence (WARN verdict, score ≥ 50%)
- **D**: Poor adherence (WARN verdict, score < 50%)
- **F**: Failing adherence (FAIL verdict)

## Example Workflow

```yaml
name: Code Quality Gate

on:
  pull_request:
    branches: [main]

jobs:
  neurcode-verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Full history for git diff
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - name: Neurcode Verify
        uses: ./packages/action
        with:
          threshold: 'C'
          api_key: ${{ secrets.NEURCODE_API_KEY }}
          plan_id: ${{ github.event.pull_request.head.sha }}
```

## Requirements

- Node.js 20+ (GitHub Actions provides this)
- Git repository with changes to verify
- Valid `neurcode.config.json` with planId (or provide via `plan_id` input)

## Development

```bash
# Build the action
pnpm build

# Package with ncc
pnpm package
```

The action is bundled using `@vercel/ncc` into a single `dist/index.js` file for distribution.

