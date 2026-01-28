#!/usr/bin/env node

import { Command } from 'commander';
import { readFileSync } from 'fs';
import { join } from 'path';

// Import chalk with fallback
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  chalk = {
    yellow: (str: string) => str,
  };
}

import { checkCommand } from './commands/check';
import { revertCommand, listVersionsCommand } from './commands/revert';
import { refactorCommand } from './commands/refactor';
import { securityCommand } from './commands/security';
import { planCommand } from './commands/plan';
import { applyCommand } from './commands/apply';
import { verifyCommand } from './commands/verify';
import { promptCommand } from './commands/prompt';
import { configCommand, showConfigCommand } from './commands/config';
import { mapCommand } from './commands/map';
import { allowCommand } from './commands/allow';
import { watchCommand } from './commands/watch';
import { loginCommand } from './commands/login';
import { logoutCommand } from './commands/logout';
import { initCommand } from './commands/init';
import { doctorCommand } from './commands/doctor';
import { listSessionsCommand, endSessionCommand, sessionStatusCommand } from './commands/session';
import { printWelcomeBanner } from './utils/messages';
import { getApiKey } from './config';

// Read version from package.json
let version = '0.1.2'; // fallback
try {
  const packageJsonPath = join(__dirname, '../package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = packageJson.version || version;
} catch (error) {
  // If we can't read package.json, use fallback
}

const program = new Command();

program
  .name('neurcode')
  .description('AI-powered code governance and diff analysis')
  .version(version);

// Show welcome banner before parsing (for help or unauthenticated users)
async function showWelcomeIfNeeded() {
  if (!process.env.CI && process.stdout.isTTY) {
    const args = process.argv.slice(2);
    const isHelp = args.length === 0 || args.includes('--help') || args.includes('-h');
    
    // Show welcome for help or if no API key is set (first-time users)
    if (isHelp || !getApiKey()) {
      await printWelcomeBanner();
    }
  }
}

// Call before parsing
showWelcomeIfNeeded().catch(() => {
  // Ignore errors in welcome banner (non-critical)
});

program
  .command('check')
  .description('Analyze git diff for risky changes')
  .option('--staged', 'Check staged changes (git diff --staged)')
  .option('--head', 'Check changes against HEAD (git diff HEAD)')
  .option('--base <ref>', 'Check changes against a specific base ref')
  .option('--online', 'Send diff to Neurcode API for analysis')
  .option('--ai', 'Use AI-powered analysis (redundancy, bloat, intent matching)')
  .option('--intent <description>', 'Describe what you intended to do (for AI analysis)')
  .option('--session-id <id>', 'Use existing session ID (for AI analysis)')
  .action(checkCommand);

refactorCommand(program);
securityCommand(program);

program
  .command('login')
  .description('Authenticate CLI with Neurcode (opens browser for approval)')
  .action(() => {
    loginCommand();
  });

program
  .command('logout')
  .description('Log out from Neurcode CLI (removes API key)')
  .action(() => {
    logoutCommand();
  });

program
  .command('init')
  .description('Initialize project configuration (select a project)')
  .action(() => {
    initCommand();
  });

program
  .command('doctor')
  .description('Health check & connectivity diagnostics - verify API connectivity')
  .action(() => {
    doctorCommand();
  });

program
  .command('config')
  .description('Configure Neurcode CLI settings')
  .option('--key <key>', 'Set API key')
  .option('--global', 'Save to home directory (applies to all projects)')
  .option('--show', 'Show current configuration')
  .action((options) => {
    if (options.show) {
      showConfigCommand();
    } else if (options.key) {
      configCommand(options.key, { global: options.global });
    } else {
      // Show current config if no options provided
      showConfigCommand();
    }
  });

program
  .command('map')
  .description('Scan codebase and generate asset map (exports and imports)')
  .action(() => {
    mapCommand();
  });

program
  .command('plan')
  .description('Generate an execution plan for a user intent')
  .argument('<intent...>', 'Description of what you want to accomplish')
  .option('--project-id <id>', 'Project ID')
  .option('--ticket <id>', 'Ticket ID from Linear or Jira (e.g., PROJ-123, ABC-123)')
  .option('--mask', 'Mask detected secrets automatically (default: true)', true)
  .option('--no-mask', 'Abort if secrets detected instead of masking')
  .action((intent, options) => {
    // Handle multiple arguments (when user doesn't quote)
    const intentString = Array.isArray(intent) ? intent.join(' ') : intent;
    if (Array.isArray(intent) && intent.length > 1) {
      console.log(chalk.yellow('Tip: Wrap your intent in quotes for better shell compatibility.'));
    }
    planCommand(intentString, {
      projectId: options['project-id'] || options.projectId,
      ticket: options.ticket,
      mask: options.mask !== false, // Default to true unless --no-mask is used
    });
  });

program
  .command('apply')
  .description('Apply a saved architect plan by generating and writing code files')
  .argument('<planId>', 'Plan ID (UUID) to apply')
  .option('--force', 'Overwrite existing files without confirmation')
  .action((planId, options) => {
    applyCommand(planId, {
      force: options.force || false,
    });
  });

program
  .command('allow')
  .description('Allow a file to be modified (bypass strict scope guard)')
  .argument('<filePath>', 'Path to the file to allow')
  .action((filePath) => {
    allowCommand(filePath);
  });

program
  .command('watch')
  .description('Start Neurcode Watch - A local background service that records file changes for Time Machine feature')
  .action(() => {
    watchCommand();
  });

// Session management commands
const sessionCmd = program
  .command('session')
  .description('Manage AI coding sessions');

sessionCmd
  .command('list')
  .description('List all sessions for the current project')
  .option('--project-id <id>', 'Project ID')
  .option('--all', 'Show all sessions (including completed)')
  .action((options) => {
    listSessionsCommand({
      projectId: options.projectId,
      all: options.all || false,
    });
  });

sessionCmd
  .command('end')
  .description('End the current session or a specific session')
  .option('--session-id <id>', 'Session ID to end (defaults to current session)')
  .option('--project-id <id>', 'Project ID')
  .action((options) => {
    endSessionCommand({
      sessionId: options.sessionId,
      projectId: options.projectId,
    });
  });

sessionCmd
  .command('status')
  .description('Show status of the current session or a specific session')
  .option('--session-id <id>', 'Session ID to check (defaults to current session)')
  .option('--project-id <id>', 'Project ID')
  .action((options) => {
    sessionStatusCommand({
      sessionId: options.sessionId,
      projectId: options.projectId,
    });
  });

program
  .command('verify')
  .description('Verify plan adherence - Compare current changes against an Architect Plan')
  .option('--plan-id <id>', 'Plan ID to verify against (required unless --policy-only)')
  .option('--project-id <id>', 'Project ID')
  .option('--policy-only', 'General Governance mode: policy checks only, no plan/scope enforcement')
  .option('--staged', 'Only verify staged changes')
  .option('--head', 'Verify changes against HEAD')
  .option('--base <ref>', 'Verify changes against a specific base ref')
  .option('--json', 'Output results as JSON')
  .option('--record', 'Report verification results to Neurcode Cloud')
  .option('--api-key <key>', 'Neurcode API Key (overrides config and env var)')
  .option('--api-url <url>', 'Override API URL (default: https://api.neurcode.com)')
  .action((options) => {
    verifyCommand({
      planId: options.planId,
      projectId: options.projectId,
      staged: options.staged,
      head: options.head,
      base: options.base,
      json: options.json,
      record: options.record,
      apiKey: options.apiKey,
      apiUrl: options.apiUrl,
      policyOnly: options.policyOnly === true,
    });
  });

program
  .command('prompt [plan-id]')
  .description('Generate a Cursor/Claude prompt from an Architect Plan (uses last plan if ID not provided)')
  .action((planId) => {
    promptCommand(planId);
  });

const revertCmd = program
  .command('revert')
  .description('Revert files to previous versions from Neurcode history');

revertCmd
  .command('versions <filePath>')
  .description('List available versions for a file')
  .option('--project-id <id>', 'Project ID')
  .option('--limit <number>', 'Maximum number of versions to show', '50')
  .action((filePath, options) => {
    listVersionsCommand(filePath, {
      projectId: options.projectId,
      limit: parseInt(options.limit, 10),
    });
  });

revertCmd
  .argument('<filePath>', 'Path to the file to revert')
  .option('--to-version <version>', 'Version number to revert to (required)', (val) => parseInt(val, 10))
  .option('--project-id <id>', 'Project ID')
  .option('--reason <reason>', 'Reason for revert')
  .option('--dry-run', 'Show what would be reverted without making changes')
  .option('--backup', 'Create a backup of the current file before reverting')
  .option('--force', 'Skip confirmation prompt')
  .action((filePath, options) => {
    if (!options.toVersion) {
      console.error('❌ Error: --to-version is required');
      console.log('Use "neurcode revert versions <filePath>" to see available versions');
      process.exit(1);
    }
    revertCommand(filePath, {
      toVersion: options.toVersion,
      projectId: options.projectId,
      reason: options.reason,
      dryRun: options.dryRun || false,
      backup: options.backup || false,
      force: options.force || false,
    });
  });

program.parse();

