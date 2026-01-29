# Neurcode Gatekeeper Action

**Neurcode** is an AI-powered governance tool that enforces coding policies and security plans directly in your CI pipeline.

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

<div align="center">

**Made with ❤️ for developers who care about code quality**

[Website](https://neurcode.com) • [Documentation](https://docs.neurcode.com) • [GitHub](https://github.com/sujit-jaunjal/neurcode-actions)

</div>
