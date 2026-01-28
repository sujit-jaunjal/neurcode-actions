# Neurcode Gatekeeper Action

**Neurcode** is an AI-powered governance tool that enforces coding policies and security plans directly in your CI pipeline.

---

## 🚀 Quick Demo (Sandbox Mode)

Want to see Neurcode block a bad PR in real-time?

1. **Fork this Repository** (Click the "Fork" button top-right).
2. **Create a Pull Request** in your forked repo that adds a `console.log("hello")`.
3. **Watch the Action Fail:** Go to the "Actions" tab to see Neurcode block the build because it violates the "No Console Logs" policy.

---

## 🛡️ Add Neurcode Gatekeeper to Your Repo

Prevent unplanned code, "scope creep," and policy violations from ever merging. The Neurcode Gatekeeper runs on every PR and blocks changes that don't match your architectural plan.

### Prerequisites

**Get your API Key:**

1. Log in to your [Neurcode Dashboard](https://neurcode.com).
2. Go to **Settings → API Keys** and copy your Secret Key (`nk_live_...`).

### Step 1: Add Repository Secret

1. Go to your GitHub Repository.
2. Click **Settings → Secrets and variables → Actions**.
3. Click **New repository secret**.
4. **Name:** `NEURCODE_API_KEY`
5. **Value:** (Paste your key starting with `nk_live_...`)
6. Click **Add secret**.

### Step 2: Create the Workflow File

Create a new file in your repo at `.github/workflows/neurcode.yml` and paste this code:

```yaml
name: Neurcode Gatekeeper

on:
  pull_request:
    types: [opened, synchronize, reopened]
  push:
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write  # Required to post comments/status

jobs:
  verify:
    name: Verify Scope & Policy
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Critical: Neurcode needs full history to calculate diffs

      - name: Run Neurcode Guard
        uses: sujit-jaunjal/neurcode-actions/packages/action@main
        with:
          api_key: ${{ secrets.NEURCODE_API_KEY }}
          # Optional: Fail the build if violations are found (Default: true)
          fail_on_violation: true
```

### Step 3: Test It

1. Push a small code change (e.g., update a README).
2. Go to the **Actions** tab in GitHub.
3. You will see the Neurcode Gatekeeper running.
   - **✅ Pass:** If the code matches your Plan (or if you are in "General Governance" mode).
   - **❌ Fail:** If you added unplanned files or violated a policy (e.g., left a `console.log`).

---

## 🧠 Understanding Modes: Plan vs. Policy

Neurcode adapts its behavior based on the files in your repository.

### Option A: Plan Enforcement (Strict Mode)

**Best for:** Ensuring code matches a specific feature spec you created locally.

- **How it works:** Commit and push your `neurcode.config.json` file.
- **Behavior:** The Gatekeeper will read the `planId` from the config. It will block any file changes that were not explicitly listed in that plan (Scope Guard).

### Option B: Policy-Only Mode (Global Governance)

**Best for:** General PR checks (e.g., "No console.log", "No API keys committed") without tying the code to a specific local plan.

- **How it works:** Remove the config file from GitHub, but keep it on your machine.
- **Behavior:** The Gatekeeper will skip the "Scope Check" and only enforce the Global Policies defined in your Neurcode Dashboard.

**To switch to Policy-Only Mode:** Run this command to keep your local config (so you can still plan) but stop tracking it in Git:

```bash
# Remove from Git tracking, but keep file on disk
git rm --cached neurcode.config.json

# Add to .gitignore
echo "neurcode.config.json" >> .gitignore

# Commit the change
git commit -m "chore: switch to global policy mode"
git push
```

---

## 📦 Usage

You can use this action in **any** GitHub repository (public or private) to verify code adherence before merging.

### 1. Basic Configuration (Mode A: Policy Only)
*Best for enforcing general rules like "No Secrets", "No Console Logs", etc.*

Add this to `.github/workflows/neurcode.yml` in your repository:

```yaml
name: Neurcode Gatekeeper
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0  # Required for diff analysis

      - name: Run Neurcode Guard
        # This points to the public action
        uses: sujit-jaunjal/neurcode-actions/packages/action@main
        with:
          api-key: ${{ secrets.NEURCODE_API_KEY }}
          record: 'true'
```

### 2. Advanced Configuration (Mode B: Plan Enforcement)
*Best for AI Agents. Ensures the code changes match the architectural plan.*

If your repo contains a `.neurcode/config.json` with a Plan ID, the Action will automatically switch to Strict Enforcement Mode. It will block any file modification that is not explicitly authorized by that Plan.

```yaml
name: Neurcode Gatekeeper
on: [pull_request]

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout Code
        uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Run Neurcode Guard
        uses: sujit-jaunjal/neurcode-actions/packages/action@main
        with:
          api-key: ${{ secrets.NEURCODE_API_KEY }}
          plan-id: 'your-plan-id'  # Optional: specify plan ID
          threshold: 'C'
          record: 'true'
```

### 🔧 Action Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `api-key` | Your Neurcode API Key | Yes | - |
| `threshold` | Minimum passing grade (A, B, C, D, F) | No | `C` |
| `plan-id` | Plan ID for strict scope enforcement | No | Auto-detected |
| `project-id` | Project ID (if not in config) | No | Auto-detected |
| `record` | Record results to Neurcode Cloud | No | `false` |
| `working_directory` | Directory to run analysis | No | `.` |
| `annotate` | Post inline annotations on PR | No | `true` |
| `neurcode_cli_version` | CLI version to use | No | `latest` |

### 📊 Action Outputs

| Output | Description |
|--------|-------------|
| `grade` | Code adherence grade (A, B, C, D, F) |
| `adherence-score` | Adherence score percentage |
| `verdict` | Verification verdict (PASS, WARN, FAIL) |
| `bloat-count` | Number of bloated files detected |
| `planned-files-modified` | Number of planned files modified |
| `total-planned-files` | Total number of files in plan |

---

## 🎯 What is Neurcode?

Neurcode is an enterprise-grade code governance platform designed to validate AI-generated code changes.

### The Problems We Solve

- **🔴 Code Bloat:** AI generates 30-50% redundant code.
- **🔴 Scope Creep:** AI modifies files it wasn't asked to touch.
- **🔴 Security Risks:** Secrets and dangerous patterns slip through reviews.

### The Solution

- **✅ Intelligent Analysis:** Detects redundancy and bloat.
- **✅ Policy Enforcement:** Configurable rules to block risky changes.
- **✅ Plan Enforcement:** Ensures AI stays within its authorized scope.

---

## ✨ Features

### 🔍 Intelligent Diff Analysis

- **Pattern Detection** - Automatically identify sensitive files, secrets, and suspicious patterns
- **Large Change Warnings** - Flag oversized diffs that need review
- **Code Quality Checks** - Detect dangerous patterns like `eval()`, `innerHTML`, and more
- **Migration Analysis** - Special handling for database migrations

### 🛡️ Policy Engine

- **Flexible Rule System** - JSON-based policy configuration
- **Multiple Rule Types** - Sensitive files, large changes, suspicious keywords, secrets, migrations, and more
- **Severity Levels** - Allow, warn, or block based on policy
- **Custom Rules** - Extensible architecture for custom rule types

### 📊 Comprehensive Visibility

- **Session Tracking** - Track AI coding sessions with full audit trail
- **File Change History** - See exactly what changed in each session
- **Dashboard Analytics** - Visual insights into code changes and violations
- **Project Management** - Organize and track multiple projects

### 🔐 Security & Compliance

- **Secret Detection** - Automatically detect API keys, passwords, and tokens
- **Sensitive File Protection** - Block modifications to `.env`, keys, and secrets files
- **Audit Logging** - Complete audit trail for compliance
- **Multi-tenant Architecture** - Isolated workspaces for organizations

---

## 🚀 Quick Start (CLI)

### Installation

```bash
# Using npm
npm install -g @neurcode-ai/cli

# Using pnpm
pnpm add -g @neurcode-ai/cli

# Using yarn
yarn global add @neurcode-ai/cli
```

### Basic Usage

```bash
# Analyze staged changes
neurcode check --staged

# Analyze changes against a base branch
neurcode check --base main

# Analyze HEAD changes
neurcode check --head

# Use online mode (requires API configuration)
neurcode check --online
```

---

## 📦 Packages

### `@neurcode-ai/cli`

Command-line tool for analyzing code changes locally or with cloud integration.

**Installation:**
```bash
npm install -g @neurcode-ai/cli
```

### `@neurcode-ai/diff-parser`

Robust parser for unified diff format with TypeScript support.

**Installation:**
```bash
npm install @neurcode-ai/diff-parser
```

**Usage:**
```typescript
import { parseDiff, getDiffSummary } from '@neurcode-ai/diff-parser';

const diffFiles = parseDiff(diffText);
const summary = getDiffSummary(diffFiles);
```

### `@neurcode-ai/policy-engine`

Flexible policy engine for evaluating code changes against configurable rules.

**Installation:**
```bash
npm install @neurcode-ai/policy-engine
```

**Usage:**
```typescript
import { evaluateRules, createDefaultPolicy } from '@neurcode-ai/policy-engine';
import { parseDiff } from '@neurcode-ai/diff-parser';

const diffFiles = parseDiff(diffText);
const policy = createDefaultPolicy();
const result = evaluateRules(diffFiles, policy.rules);

console.log(`Decision: ${result.decision}`); // 'allow' | 'warn' | 'block'
```

---

## 🎨 Dashboard

The Neurcode Dashboard provides a modern web interface for managing code analysis, viewing logs, and configuring policies.

### Features

- **📊 Analytics Dashboard** - Overview of code changes, violations, and trends
- **📝 Analysis Logs** - Detailed view of all code analyses with search and filtering
- **🔍 Diff Viewer** - Side-by-side diff visualization with syntax highlighting
- **📁 Project Management** - Organize and track multiple projects
- **⚙️ Policy Configuration** - Visual policy editor (coming soon)
- **🔐 API Key Management** - Manage authentication keys
- **💳 Billing & Subscriptions** - Manage your Neurcode subscription

---

<div align="center">

**Made with ❤️ for developers who care about code quality**

[Website](https://neurcode.com) • [Documentation](https://docs.neurcode.com) • [GitHub](https://github.com/sujit-jaunjal/neurcode-actions)

</div>
