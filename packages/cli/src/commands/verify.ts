/**
 * Verify Command
 * 
 * Compares current work (git diff) against an Architect Plan to measure adherence and detect bloat.
 */

import { execSync } from 'child_process';
import { parseDiff, getDiffSummary } from '@neurcode-ai/diff-parser';
import { evaluateRules, createDefaultPolicy } from '@neurcode-ai/policy-engine';
import type { Rule } from '@neurcode-ai/policy-engine';
import { loadConfig, requireApiKey } from '../config';
import { ApiClient } from '../api-client';
import { detectProject } from '../utils/project-detector';
import { join } from 'path';
import { existsSync, readFileSync } from 'fs';
import { getSessionId, getActivePlanId, getLastPlanGeneratedAt } from '../utils/state';
import { logROIEvent } from '../utils/ROILogger';
import { createBox } from '../utils/box';
import { loadIgnore } from '../utils/ignore';

// Import chalk with fallback
let chalk: any;
try {
  chalk = require('chalk');
  
  // Disable colors in CI environments for cleaner logs
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    chalk.level = 0;
  }
} catch {
  chalk = {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    bold: (str: string) => str,
    dim: (str: string) => str,
    cyan: (str: string) => str,
    white: (str: string) => str,
  };
}

interface VerifyOptions {
  planId?: string;
  projectId?: string;
  staged?: boolean;
  head?: boolean;
  base?: string;
  json?: boolean;
  record?: boolean;
  apiKey?: string;
  apiUrl?: string;
  /** When true, skip scope/plan enforcement and run policy checks only (General Governance mode). */
  policyOnly?: boolean;
}

interface CIContext {
  commitSha?: string;
  branch?: string;
  repoUrl?: string;
  workflowRunId?: string;
}

/**
 * Check if a file path should be excluded from verification analysis
 * Excludes internal/system files that should not count towards plan adherence
 */
function isExcludedFile(filePath: string): boolean {
  // Normalize path separators (handle both / and \)
  const normalizedPath = filePath.replace(/\\/g, '/');
  
  // Check if path starts with any excluded prefix
  const excludedPrefixes = [
    '.neurcode/',
    '.git/',
    'node_modules/',
  ];
  
  // Check prefixes
  for (const prefix of excludedPrefixes) {
    if (normalizedPath.startsWith(prefix)) {
      return true;
    }
  }
  
  // Check for .DS_Store file (macOS system file) - can appear at any directory level
  if (normalizedPath === '.DS_Store' || normalizedPath.endsWith('/.DS_Store')) {
    return true;
  }
  
  // Exclude common meta-configuration files (gitignore, npmignore, dockerignore, etc.)
  // These are project configuration files and shouldn't be part of scope checking
  const configFilePatterns = [
    /^\.gitignore$/,
    /\.gitignore$/,
    /^\.npmignore$/,
    /\.npmignore$/,
    /^\.dockerignore$/,
    /\.dockerignore$/,
    /^\.prettierignore$/,
    /\.prettierignore$/,
    /^\.eslintignore$/,
    /\.eslintignore$/,
  ];
  
  for (const pattern of configFilePatterns) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Map a dashboard custom policy (natural language) to a policy-engine Rule.
 * Supports "No console.log", "No debugger", and generic line patterns.
 */
function customPolicyToRule(p: {
  id: string;
  rule_text: string;
  severity: 'low' | 'medium' | 'high';
}): Rule | null {
  const sev = p.severity === 'high' ? 'block' : 'warn';
  const text = (p.rule_text || '').trim().toLowerCase();
  if (!text) return null;

  // Known patterns -> suspicious-keywords (checks added lines for these strings)
  if (/console\.log|no\s+console\.log|do not use console\.log|ban console\.log/.test(text)) {
    return {
      id: `custom-${p.id}`,
      name: 'No console.log',
      description: p.rule_text,
      enabled: true,
      severity: sev,
      type: 'suspicious-keywords',
      keywords: ['console.log'],
    };
  }
  if (/debugger|no\s+debugger|do not use debugger/.test(text)) {
    return {
      id: `custom-${p.id}`,
      name: 'No debugger',
      description: p.rule_text,
      enabled: true,
      severity: sev,
      type: 'suspicious-keywords',
      keywords: ['debugger'],
    };
  }
  if (/eval\s*\(|no\s+eval|do not use eval/.test(text)) {
    return {
      id: `custom-${p.id}`,
      name: 'No eval',
      description: p.rule_text,
      enabled: true,
      severity: sev,
      type: 'suspicious-keywords',
      keywords: ['eval('],
    };
  }

  // Fallback: line-pattern on added lines using a safe regex from the rule text
  // Use first quoted phrase or first alphanumeric phrase as pattern
  const quoted = /['"`]([^'"`]+)['"`]/.exec(p.rule_text);
  const phrase = quoted?.[1] ?? p.rule_text.replace(/^(no|don't|do not use|ban|avoid)\s+/i, '').trim().slice(0, 80);
  if (!phrase) return null;
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    id: `custom-${p.id}`,
    name: `Custom: ${p.rule_text.slice(0, 50)}`,
    description: p.rule_text,
    enabled: true,
    severity: sev,
    type: 'line-pattern',
    pattern: escaped,
    matchType: 'added',
  };
}

/**
 * Execute policy-only verification (General Governance mode)
 * Returns the exit code to use
 */
async function executePolicyOnlyMode(
  options: VerifyOptions,
  diffFiles: any[],
  ignoreFilter: (path: string) => boolean,
  config: any,
  client: ApiClient
): Promise<number> {
  if (!options.json) {
    console.log(chalk.cyan('🛡️  General Governance mode (policy only, no plan linked)\n'));
  }
  type PolicyViolationItem = { rule: string; file: string; severity: string; message?: string; line?: number };
  let policyViolations: PolicyViolationItem[] = [];
  let policyDecision: 'allow' | 'warn' | 'block' = 'allow';
  const defaultPolicy = createDefaultPolicy();
  let allRules = [...defaultPolicy.rules];
  if (config.apiKey) {
    try {
      const customPolicies = await client.getActiveCustomPolicies();
      const customRules: Rule[] = [];
      for (const p of customPolicies) {
        const r = customPolicyToRule(p);
        if (r) {
          customRules.push(r);
        }
      }
      allRules = [...defaultPolicy.rules, ...customRules];
      if (!options.json && customRules.length > 0) {
        console.log(chalk.dim(`   Evaluating ${customRules.length} custom policy rule(s) from dashboard`));
      }
    } catch (error) {
      if (!options.json) {
        console.log(chalk.dim('   Could not load custom policies, using default policy only'));
      }
    }
  }
  const diffFilesForPolicy = diffFiles.filter((f) => {
    const ignored = ignoreFilter(f.path);
    return !ignored;
  });
  const policyResult = evaluateRules(diffFilesForPolicy, allRules);
  policyViolations = (policyResult.violations || []) as PolicyViolationItem[];
  policyViolations = policyViolations.filter((v) => !ignoreFilter(v.file));
  policyDecision = policyViolations.length > 0 ? policyResult.decision : 'allow';
  const effectiveVerdict = policyDecision === 'block' ? 'FAIL' : policyDecision === 'warn' ? 'WARN' : 'PASS';
  const grade = effectiveVerdict === 'PASS' ? 'A' : effectiveVerdict === 'WARN' ? 'C' : 'F';
  const score = effectiveVerdict === 'PASS' ? 100 : effectiveVerdict === 'WARN' ? 50 : 0;
  const violationsOutput = policyViolations.map((v) => ({
    file: v.file,
    rule: v.rule,
    severity: v.severity,
    message: v.message,
    ...(v.line != null ? { startLine: v.line } : {}),
  }));
  const message =
    effectiveVerdict === 'PASS'
      ? '✅ Policy check passed (General Governance mode)'
      : policyViolations.length > 0
        ? `Policy violations: ${policyViolations.map((v) => `${v.file}: ${v.message || v.rule}`).join('; ')}`
        : 'Policy check completed';
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          grade,
          score,
          verdict: effectiveVerdict,
          violations: violationsOutput,
          message,
          scopeGuardPassed: true, // N/A in policy-only mode
          bloatCount: 0,
          bloatFiles: [],
          plannedFilesModified: 0,
          totalPlannedFiles: 0,
          adherenceScore: score,
          policyOnly: true,
        },
        null,
        2
      )
    );
  } else {
    if (effectiveVerdict === 'PASS') {
      console.log(chalk.green('✅ Policy check passed'));
    } else {
      console.log(chalk.red(`❌ Policy violations detected: ${policyViolations.length}`));
      policyViolations.forEach((v) => {
        console.log(chalk.red(`   • ${v.file}: ${v.message || v.rule}`));
      });
    }
    console.log(chalk.dim(`\n${message}`));
  }
  return effectiveVerdict === 'FAIL' ? 2 : effectiveVerdict === 'WARN' ? 1 : 0;
}

export async function verifyCommand(options: VerifyOptions) {
  try {
    console.log("hello");
    // Load configuration
    const config = loadConfig();
    
    // Override API key if provided via flag or use from config/env
    if (options.apiKey) {
      config.apiKey = options.apiKey;
    } else if (!config.apiKey) {
      // Only require API key if --record is set, otherwise it's optional
      if (options.record) {
        config.apiKey = requireApiKey();
      }
    }

    // Override API URL if provided via flag
    if (options.apiUrl) {
      config.apiUrl = options.apiUrl.replace(/\/$/, ''); // Remove trailing slash
    } else if (!config.apiUrl) {
      // Default to production API URL
      config.apiUrl = 'https://api.neurcode.com';
    } else {
      // Ensure no trailing slash
      config.apiUrl = config.apiUrl.replace(/\/$/, '');
    }

    // Explicitly load config file to get sessionId and lastSessionId
    const configPath = join(process.cwd(), 'neurcode.config.json');
    let configData: any = {};
    
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        configData = JSON.parse(fileContent);
      } catch (error) {
        // If parse fails, continue with empty configData
        if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
          console.log(chalk.dim(`Warning: Failed to parse config file at: ${configPath}`));
        }
      }
    }

    // Initialize API client
    const client = new ApiClient(config);
    const projectId = options.projectId || config.projectId;

    // Determine which diff to capture (staged + unstaged for full current work)
    let diffText: string;
    
    if (options.staged) {
      diffText = execSync('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else if (options.base) {
      diffText = execSync(`git diff ${options.base}`, { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else if (options.head) {
      diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else {
      // Default: combine staged + unstaged to capture all current work
      try {
        const stagedDiff = execSync('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
        const unstagedDiff = execSync('git diff', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
        diffText = stagedDiff + (stagedDiff && unstagedDiff ? '\n' : '') + unstagedDiff;
      } catch {
        // Fallback to HEAD if git commands fail
        diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
      }
    }

    if (!diffText.trim()) {
      if (!options.json) {
        console.log(chalk.yellow('⚠️  No changes detected'));
        console.log(chalk.dim('   Make sure you have staged or unstaged changes to verify'));
      } else {
        console.log(JSON.stringify({
          grade: 'F',
          score: 0,
          verdict: 'FAIL',
          violations: [],
          adherenceScore: 0,
          bloatCount: 0,
          bloatFiles: [],
          plannedFilesModified: 0,
          totalPlannedFiles: 0,
          message: 'No changes detected',
          scopeGuardPassed: false,
        }, null, 2));
      }
      process.exit(0);
    }

    // Parse the diff
    const allDiffFiles = parseDiff(diffText);
    
    // Filter out internal/system files before analysis
    // This prevents self-interference where the tool flags its own files as bloat
    const diffFiles = allDiffFiles.filter(file => {
      // Check both path and oldPath (for renames) against exclusion list
      const excludePath = isExcludedFile(file.path);
      const excludeOldPath = file.oldPath ? isExcludedFile(file.oldPath) : false;
      return !excludePath && !excludeOldPath;
    });
    
    const summary = getDiffSummary(diffFiles);

    if (diffFiles.length === 0) {
      if (!options.json) {
        console.log(chalk.yellow('⚠️  No file changes detected in diff'));
      } else {
        console.log(JSON.stringify({
          grade: 'F',
          score: 0,
          verdict: 'FAIL',
          violations: [],
          adherenceScore: 0,
          bloatCount: 0,
          bloatFiles: [],
          plannedFilesModified: 0,
          totalPlannedFiles: 0,
          message: 'No file changes detected in diff',
          scopeGuardPassed: false,
        }, null, 2));
      }
      process.exit(0);
    }

    const ignoreFilter = loadIgnore(process.cwd());

    if (!options.json) {
      console.log(chalk.cyan('\n📊 Analyzing changes against plan...'));
      console.log(chalk.dim(`   Found ${summary.totalFiles} file(s) changed`));
      console.log(chalk.dim(`   ${summary.totalAdded} lines added, ${summary.totalRemoved} lines removed\n`));
    }

    // ============================================
    // --policy-only: General Governance (policy only, no plan enforcement)
    // ============================================
    if (options.policyOnly) {
      const exitCode = await executePolicyOnlyMode(options, diffFiles, ignoreFilter, config, client);
      process.exit(exitCode);
    }

    // Get planId: Priority 1: options flag, Priority 2: state file (.neurcode/config.json), Priority 3: legacy config
    let planId: string | undefined = options.planId;
    
    if (!planId) {
      // Try to get planId from state file (.neurcode/config.json) - this is the canonical source
      const activePlanId = getActivePlanId();
      if (activePlanId) {
        planId = activePlanId;
        if (!options.json) {
          console.log(chalk.dim(`   Using active plan from state: ${activePlanId.substring(0, 8)}...`));
          
          // Optional check: Warn if plan is older than 24 hours
          const lastPlanGeneratedAt = getLastPlanGeneratedAt();
          if (lastPlanGeneratedAt) {
            const planAge = Date.now() - new Date(lastPlanGeneratedAt).getTime();
            const hoursSinceGeneration = planAge / (1000 * 60 * 60);
            if (hoursSinceGeneration > 24) {
              console.log(chalk.yellow(`   ⚠️  Warning: This plan was generated ${Math.round(hoursSinceGeneration)} hours ago`));
              console.log(chalk.yellow(`   You may be verifying against an old plan. Consider running 'neurcode plan' to generate a new one.`));
            }
          }
        }
      } else {
        // Fallback: Try legacy config file (neurcode.config.json) for backward compatibility
        if (configData.lastPlanId && typeof configData.lastPlanId === 'string') {
          planId = configData.lastPlanId;
          if (!options.json) {
            console.log(chalk.dim(`   Using plan from legacy config: ${configData.lastPlanId.substring(0, 8)}...`));
            console.log(chalk.yellow(`   ⚠️  Consider running 'neurcode plan' to update state file`));
          }
        }
      }
    }

    // If no planId found, fall back to General Governance (Policy Only) mode
    if (!planId) {
      if (!options.json) {
        console.log(chalk.yellow('⚠️  No Plan ID found. Falling back to General Governance (Policy Only).'));
      }
      options.policyOnly = true;
      const exitCode = await executePolicyOnlyMode(options, diffFiles, ignoreFilter, config, client);
      process.exit(exitCode);
    }

    // At this point, planId is guaranteed to be defined
    const finalPlanId = planId;

    // ============================================
    // STRICT SCOPE GUARD - Deterministic Check
    // ============================================
    if (!options.json) {
      console.log(chalk.cyan('🔒 Checking scope guard...'));
    }
    
    // Track if scope guard passed - this takes priority over AI grading
    let scopeGuardPassed = false;
    
    try {
      // Step A: Get Modified Files (already have from diffFiles)
      const modifiedFiles = diffFiles.map(f => f.path);
      
      // Step B: Fetch Plan and Session Data
      const planData = await client.getPlan(finalPlanId);
      
      // Extract original intent from plan (for constraint checking)
      const originalIntent = planData.intent || '';
      
      // Get approved files from plan (only files with action CREATE or MODIFY)
      const planFiles = planData.content.files
        .filter(f => f.action === 'CREATE' || f.action === 'MODIFY')
        .map(f => f.path);
      
      // Get sessionId from state file (.neurcode/state.json) first, then fallback to config
      // Fallback to sessionId from plan if not in state/config
      // This is the session_id string needed to fetch the session
      let sessionIdString: string | null = getSessionId() || configData.sessionId || configData.lastSessionId || null;
      
      // Fallback: Use sessionId from plan if not in config
      if (!sessionIdString && planData.sessionId) {
        sessionIdString = planData.sessionId;
        if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
          console.log(chalk.dim(`   Using sessionId from plan: ${sessionIdString.substring(0, 8)}...`));
        }
      }
      
      // Debug logging
      if ((process.env.DEBUG || process.env.VERBOSE) && !options.json) {
        console.log(chalk.dim(`   Config path: ${configPath}`));
        console.log(chalk.dim(`   Config fields: ${Object.keys(configData).join(', ')}`));
        console.log(chalk.dim(`   SessionId from config: ${sessionIdString ? sessionIdString.substring(0, 8) + '...' : 'not found'}`));
      }
      
      // Get allowed files from session
      let allowedFiles: string[] = [];
      if (sessionIdString) {
        try {
          const sessionData = await client.getSession(sessionIdString);
          allowedFiles = (sessionData.session as any).allowedFiles || [];
        } catch (sessionError) {
          // If session fetch fails, log warning but continue
          // This is expected if sessionId is not set in config
          if (!options.json) {
            console.log(chalk.dim(`   Note: Session data not available (sessionId not in config)`));
            console.log(chalk.dim('   Scope guard will only check plan files'));
          }
        }
      } else {
        if (!options.json) {
          console.log(chalk.dim(`   Note: No sessionId found in config`));
          console.log(chalk.dim('   Scope guard will only check plan files'));
        }
      }
      
      // Step C: The Intersection Logic
      const approvedSet = new Set([...planFiles, ...allowedFiles]);
      const violations = modifiedFiles.filter(f => !approvedSet.has(f));
      const filteredViolations = violations.filter((p) => !ignoreFilter(p));

      // Step D: The Block (only report scope violations for non-ignored files)
      if (filteredViolations.length > 0) {
        if (options.json) {
          // Output JSON for scope violation BEFORE exit. Must include violations for GitHub Action annotations.
          const violationsOutput = filteredViolations.map((file) => ({
            file,
            rule: 'scope_guard',
            severity: 'block' as const,
            message: 'File modified outside the plan',
          }));
          const jsonOutput = {
            grade: 'F',
            score: 0,
            verdict: 'FAIL',
            violations: violationsOutput,
            adherenceScore: 0,
            bloatCount: filteredViolations.length,
            bloatFiles: filteredViolations,
            plannedFilesModified: 0,
            totalPlannedFiles: planFiles.length,
            message: `Scope violation: ${filteredViolations.length} file(s) modified outside the plan`,
            scopeGuardPassed: false,
          };
          // CRITICAL: Print JSON first, then exit
          console.log(JSON.stringify(jsonOutput, null, 2));
          process.exit(1);
        } else {
          // Human-readable output only when NOT in json mode
          console.log(chalk.red('\n⛔ SCOPE VIOLATION'));
          console.log(chalk.red('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
          console.log(chalk.red('The following files were modified but are not in the plan:'));
          console.log('');
          filteredViolations.forEach(file => {
            console.log(chalk.red(`   • ${file}`));
          });
          console.log('');
          console.log(chalk.yellow('To unblock these files, run:'));
          filteredViolations.forEach(file => {
            console.log(chalk.dim(`   neurcode allow ${file}`));
          });
          console.log('');
          process.exit(1);
        }
      }
      
      // Scope guard passed - all files are approved or allowed
      scopeGuardPassed = true;
      if (!options.json) {
        console.log(chalk.green('✅ All modified files are approved or allowed'));
        console.log('');
      }
      
    } catch (scopeError) {
      // If scope guard check fails, log error but continue to AI verification
      // This ensures the feature doesn't break existing workflows
      if (!options.json) {
        console.log(chalk.yellow(`   ⚠️  Scope guard check failed: ${scopeError instanceof Error ? scopeError.message : 'Unknown error'}`));
        console.log(chalk.dim('   Continuing with AI verification...'));
        console.log('');
      }
    }

    // Check user tier - Policy Compliance and A-F Grading are PRO features
    const { getUserTier } = await import('../utils/tier');
    const tier = await getUserTier();
    
    if (tier === 'FREE') {
      // FREE users get basic file-change summary only
      if (!options.json) {
        console.log(chalk.cyan('\n📊 File Change Summary\n'));
        console.log('━'.repeat(50));
        console.log(`   Files changed: ${summary.totalFiles}`);
        console.log(`   Lines added: ${summary.totalAdded}`);
        console.log(`   Lines removed: ${summary.totalRemoved}`);
        console.log('━'.repeat(50));
        console.log(chalk.yellow('\n📊 Upgrade to PRO for Automated Policy Verification and A-F Grading.'));
        console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
      } else {
        console.log(JSON.stringify({
          grade: 'N/A',
          score: 0,
          verdict: 'INFO',
          violations: [],
          adherenceScore: 0,
          bloatCount: 0,
          bloatFiles: [],
          plannedFilesModified: 0,
          totalPlannedFiles: 0,
          message: 'Basic file change summary (PRO required for policy verification)',
          scopeGuardPassed: false,
          tier: 'FREE',
        }, null, 2));
      }
      process.exit(0);
    }

    // Fetch active custom policies from the dashboard and evaluate against diff
    type PolicyViolation = { rule: string; file: string; severity: string; message?: string; line?: number };
    let policyViolations: PolicyViolation[] = [];
    let policyDecision: 'allow' | 'warn' | 'block' = 'allow';
    if (config.apiKey) {
      try {
        const customPolicies = await client.getActiveCustomPolicies();
        const defaultPolicy = createDefaultPolicy();
        const customRules: Rule[] = [];
        for (const p of customPolicies) {
          const r = customPolicyToRule(p);
          if (r) {
            customRules.push(r);
          }
        }
        const allRules = [...defaultPolicy.rules, ...customRules];
        const diffFilesForPolicy = diffFiles.filter((f) => {
          const ignored = ignoreFilter(f.path);
          return !ignored;
        });
        const policyResult = evaluateRules(diffFilesForPolicy, allRules);
        policyViolations = (policyResult.violations as PolicyViolation[]).filter((v) => !ignoreFilter(v.file));
        policyDecision = policyViolations.length > 0 ? policyResult.decision : 'allow';
        if (!options.json && customRules.length > 0) {
          console.log(chalk.dim(`   Evaluating ${customRules.length} custom policy rule(s) from dashboard`));
        }
      } catch (error) {
        if (!options.json) {
          console.log(chalk.dim('   Could not load custom policies, continuing without them'));
        }
      }
    }

    // Prepare diff stats and changed files for API
    const diffStats = {
      totalAdded: summary.totalAdded,
      totalRemoved: summary.totalRemoved,
      totalFiles: summary.totalFiles,
    };

    // Map diffFiles to include full hunks for visual diff rendering
    const changedFiles = diffFiles.map(file => ({
      path: file.path,
      oldPath: file.oldPath,
      changeType: file.changeType,
      added: file.addedLines,
      removed: file.removedLines,
      hunks: file.hunks.map(hunk => ({
        oldStart: hunk.oldStart,
        oldLines: hunk.oldLines,
        newStart: hunk.newStart,
        newLines: hunk.newLines,
        lines: hunk.lines.map(line => ({
          type: line.type,
          content: line.content,
          lineNumber: line.lineNumber,
        })),
      })),
    }));

    // Call verify API
    if (!options.json) {
      console.log(chalk.dim('   Sending to Neurcode API...\n'));
    }
    
    try {
      // Extract original intent from plan for constraint checking
      let intentConstraints: string | undefined;
      try {
        const planData = await client.getPlan(finalPlanId);
        intentConstraints = planData.intent || undefined;
      } catch {
        // If we can't get plan, continue without constraints
      }
      
      // Call verifyPlan with intentConstraints
      const verifyResult = await client.verifyPlan(finalPlanId, diffStats, changedFiles, projectId, intentConstraints);

      // Apply custom policy verdict: block from dashboard overrides API verdict
      const policyBlock = policyDecision === 'block' && policyViolations.length > 0;
      const effectiveVerdict = policyBlock ? 'FAIL' : verifyResult.verdict;
      const effectiveMessage = policyBlock
        ? `Custom policy violations: ${policyViolations.map(v => `${v.file}: ${v.message || v.rule}`).join('; ')}. ${verifyResult.message}`
        : verifyResult.message;

      // Calculate grade from effective verdict and score
      // CRITICAL: 0/0 planned files = 'F' (Incomplete), not 'B'
      // Bloat automatically drops grade by at least one letter
      let grade: string;
      
      // Special case: If no planned files were modified and total planned files is 0, it's incomplete (F)
      if (verifyResult.totalPlannedFiles === 0 && verifyResult.plannedFilesModified === 0) {
        grade = 'F';
      } else if (effectiveVerdict === 'PASS') {
        grade = 'A';
        
        // Log ROI event for PASS verification (Grade A) - non-blocking
        try {
          logROIEvent('VERIFY_PASS', {
            planId: finalPlanId,
            adherenceScore: verifyResult.adherenceScore,
            plannedFilesModified: verifyResult.plannedFilesModified,
            totalPlannedFiles: verifyResult.totalPlannedFiles,
          }, projectId || null).catch(() => {
            // Silently ignore - ROI logging should never block user workflows
          });
        } catch {
          // Silently ignore - ROI logging should never block user workflows
        }
      } else if (effectiveVerdict === 'WARN') {
        // Base grade calculation
        let baseGrade = verifyResult.adherenceScore >= 70 ? 'B' : verifyResult.adherenceScore >= 50 ? 'C' : 'D';
        
        // Bloat drops grade by one letter (B -> C, C -> D, D -> F)
        if (verifyResult.bloatCount > 0) {
          if (baseGrade === 'B') baseGrade = 'C';
          else if (baseGrade === 'C') baseGrade = 'D';
          else if (baseGrade === 'D') baseGrade = 'F';
        }
        
        grade = baseGrade;
      } else {
        grade = 'F';
      }

      // If JSON output requested, output JSON and exit
      if (options.json) {
        const filteredBloatFiles = (verifyResult.bloatFiles || []).filter((f: string) => !ignoreFilter(f));
        const scopeViolations = filteredBloatFiles.map((file: string) => ({
          file,
          rule: 'scope_guard',
          severity: 'block' as const,
          message: 'File modified outside the plan',
        }));
        const policyViolationItems = policyViolations.map((v) => ({
          file: v.file,
          rule: v.rule,
          severity: v.severity,
          message: v.message,
          ...(v.line != null ? { startLine: v.line } : {}),
        }));
        const violations = [...scopeViolations, ...policyViolationItems];
        const jsonOutput = {
          grade,
          score: verifyResult.adherenceScore,
          verdict: effectiveVerdict,
          violations,
          message: effectiveMessage,
          adherenceScore: verifyResult.adherenceScore,
          scopeGuardPassed,
          bloatCount: filteredBloatFiles.length,
          bloatFiles: filteredBloatFiles,
          plannedFilesModified: verifyResult.plannedFilesModified,
          totalPlannedFiles: verifyResult.totalPlannedFiles,
          ...(policyViolations.length > 0 && { policyDecision }),
        };
        console.log(JSON.stringify(jsonOutput, null, 2));
        
        // Report to Neurcode Cloud if --record flag is set (after JSON output)
        if (options.record && config.apiKey) {
          const violations = [
            ...filteredBloatFiles.map((file: string) => ({
              rule: 'scope_guard',
              file: file,
              severity: 'block' as const,
              message: 'File modified outside the plan',
            })),
            ...policyViolations.map(v => ({
              rule: v.rule,
              file: v.file,
              severity: v.severity as 'block' | 'warn' | 'allow',
              message: v.message,
            })),
          ];

          // Report in background (don't await to avoid blocking JSON output)
          reportVerification(
            grade,
            violations,
            verifyResult,
            config.apiKey,
            config.apiUrl,
            projectId || undefined,
            true // jsonMode = true
          ).catch(() => {
            // Error already logged in reportVerification
          });
        }
        
        // Exit based on effective verdict (same logic as below)
        if (scopeGuardPassed && !policyBlock) {
          process.exit(0);
        }
        if (effectiveVerdict === 'FAIL') {
          process.exit(2);
        } else if (effectiveVerdict === 'WARN') {
          process.exit(1);
        } else {
          process.exit(0);
        }
      }

      // Display results (only if not in json mode; exclude ignored paths from bloat)
      if (!options.json) {
        const displayBloatFiles = (verifyResult.bloatFiles || []).filter((f: string) => !ignoreFilter(f));
        displayVerifyResults(
          {
            ...verifyResult,
            verdict: effectiveVerdict,
            message: effectiveMessage,
            bloatFiles: displayBloatFiles,
            bloatCount: displayBloatFiles.length,
          },
          policyViolations,
        );
      }

      // Report to Neurcode Cloud if --record flag is set
      if (options.record) {
        if (!config.apiKey) {
          if (!options.json) {
            console.log(chalk.yellow('\n⚠️  --record flag requires API key'));
            console.log(chalk.dim('   Set NEURCODE_API_KEY environment variable or use --api-key flag'));
          }
        } else {
          // Include scope bloat and custom policy violations in the report (excluding .neurcodeignore'd paths)
          const filteredBloatForReport = (verifyResult.bloatFiles || []).filter((f: string) => !ignoreFilter(f));
          const violations = [
            ...filteredBloatForReport.map((file: string) => ({
              rule: 'scope_guard',
              file: file,
              severity: 'block' as const,
              message: 'File modified outside the plan',
            })),
            ...policyViolations.map(v => ({
              rule: v.rule,
              file: v.file,
              severity: v.severity as 'block' | 'warn' | 'allow',
              message: v.message,
            })),
          ];

          await reportVerification(
            grade,
            violations,
            verifyResult,
            config.apiKey,
            config.apiUrl,
            projectId || undefined,
            false // jsonMode = false
          );
        }
      }
      
      // Governance takes priority over Grading
      // If Scope Guard passed (all files approved or allowed) and no policy block, always PASS
      if (scopeGuardPassed && !policyBlock) {
        if ((verifyResult.verdict === 'FAIL' || verifyResult.verdict === 'WARN') && policyViolations.length === 0) {
          if (!options.json) {
            console.log(chalk.yellow('\n⚠️  Plan deviation allowed'));
            console.log(chalk.dim('   Some files were modified outside the plan, but they were explicitly allowed.'));
            console.log(chalk.dim('   Governance check passed - proceeding with exit code 0.\n'));
          }
        }
        process.exit(0);
      }
      
      // If scope guard didn't pass (or failed to check) or policy blocked, use effective verdict
      // Exit with appropriate code based on AI verification and custom policies
      if (effectiveVerdict === 'FAIL') {
        process.exit(2);
      } else if (effectiveVerdict === 'WARN') {
        process.exit(1);
      } else {
        process.exit(0);
      }
    } catch (error) {
      if (options.json) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.log(JSON.stringify({
          grade: 'F',
          score: 0,
          verdict: 'FAIL',
          violations: [],
          adherenceScore: 0,
          bloatCount: 0,
          bloatFiles: [],
          plannedFilesModified: 0,
          totalPlannedFiles: 0,
          message: `Error: ${errorMessage}`,
          scopeGuardPassed: false,
        }, null, 2));
      } else {
        if (error instanceof Error) {
          if (error.message.includes('404') || error.message.includes('not found')) {
            console.error(chalk.red(`❌ Error: Plan not found`));
            console.log(chalk.dim(`   Plan ID: ${planId}`));
            console.log(chalk.dim('   Make sure the planId is correct and belongs to your organization'));
          } else {
            console.error(chalk.red(`❌ Error: ${error.message}`));
          }
        } else {
          console.error(chalk.red('❌ Error:', error));
        }
      }
      process.exit(1);
    }

  } catch (error) {
    if (options.json) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(JSON.stringify({
        grade: 'F',
        score: 0,
        verdict: 'FAIL',
        violations: [],
        adherenceScore: 0,
        bloatCount: 0,
        bloatFiles: [],
        plannedFilesModified: 0,
        totalPlannedFiles: 0,
        message: `Unexpected error: ${errorMessage}`,
        scopeGuardPassed: false,
      }, null, 2));
    } else {
      console.error(chalk.red('\n❌ Unexpected error:'));
      if (error instanceof Error) {
        console.error(chalk.red(error.message));
        if (error.message.includes('not a git repository')) {
          console.error(chalk.dim('   This command must be run in a git repository'));
        }
      } else {
        console.error(error);
      }
    }
    process.exit(1);
  }
}

/**
 * Collect CI context from environment variables and git
 */
function collectCIContext(): CIContext {
  const context: CIContext = {};

  // Try GitHub Actions environment variables first
  if (process.env.GITHUB_SHA) {
    context.commitSha = process.env.GITHUB_SHA;
  } else {
    // Fallback to git rev-parse HEAD
    try {
      context.commitSha = execSync('git rev-parse HEAD', {
        maxBuffer: 1024 * 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // Not a git repo or HEAD not available
    }
  }

  // Try GitHub Actions branch
  if (process.env.GITHUB_REF_NAME) {
    context.branch = process.env.GITHUB_REF_NAME;
  } else if (process.env.GITHUB_REF) {
    // GITHUB_REF is like refs/heads/main or refs/tags/v1.0.0
    const refMatch = process.env.GITHUB_REF.match(/^refs\/(?:heads|tags)\/(.+)$/);
    if (refMatch) {
      context.branch = refMatch[1];
    }
  } else {
    // Fallback to git branch --show-current
    try {
      context.branch = execSync('git branch --show-current', {
        maxBuffer: 1024 * 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
    } catch {
      // Not a git repo or branch command failed
    }
  }

  // Try GitHub Actions repository
  if (process.env.GITHUB_REPOSITORY) {
    // GITHUB_REPOSITORY is like "owner/repo"
    context.repoUrl = `https://github.com/${process.env.GITHUB_REPOSITORY}`;
  } else {
    // Fallback to git config --get remote.origin.url
    try {
      const gitUrl = execSync('git config --get remote.origin.url', {
        maxBuffer: 1024 * 1024 * 1024,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      }).trim();
      
      // Normalize git URL
      if (gitUrl) {
        // Convert SSH to HTTPS if needed
        if (gitUrl.startsWith('git@')) {
          // git@github.com:owner/repo.git -> https://github.com/owner/repo
          const sshMatch = gitUrl.match(/git@([^:]+):(.+)/);
          if (sshMatch) {
            context.repoUrl = `https://${sshMatch[1]}/${sshMatch[2].replace(/\.git$/, '')}`;
          } else {
            context.repoUrl = gitUrl.replace(/\.git$/, '');
          }
        } else {
          context.repoUrl = gitUrl.replace(/\.git$/, '');
        }
      }
    } catch {
      // Not a git repo or no remote configured
    }
  }

  // Try GitHub Actions workflow run ID
  if (process.env.GITHUB_RUN_ID) {
    context.workflowRunId = process.env.GITHUB_RUN_ID;
  }

  return context;
}

/**
 * Report verification results to Neurcode Cloud
 */
async function reportVerification(
  grade: string,
  violations: any[],
  verifyResult: {
    adherenceScore: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    bloatCount: number;
    bloatFiles: string[];
    message: string;
  },
  apiKey: string,
  apiUrl: string,
  projectId?: string,
  jsonMode?: boolean
): Promise<void> {
  try {
    const ciContext = collectCIContext();

    const payload = {
      grade: grade.toUpperCase(),
      violations: violations || [],
      adherenceScore: verifyResult.adherenceScore,
      verdict: verifyResult.verdict,
      bloatCount: verifyResult.bloatCount,
      bloatFiles: verifyResult.bloatFiles,
      message: verifyResult.message,
      repoUrl: ciContext.repoUrl,
      commitSha: ciContext.commitSha,
      branch: ciContext.branch,
      workflowRunId: ciContext.workflowRunId,
      projectId,
    };

    const response = await fetch(`${apiUrl}/api/v1/action/verifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json() as { id?: string };
    // Only log if not in json mode to avoid polluting stdout
    if (!jsonMode) {
      console.log(chalk.dim(`\n✅ Verification result reported to Neurcode Cloud (ID: ${result.id})`));
    }
  } catch (error) {
    // Log warning but don't crash - verification should still work
    // Only log if not in json mode to avoid polluting stdout
    if (jsonMode === undefined || !jsonMode) {
      console.log(chalk.yellow(`\n⚠️  Failed to upload report to Neurcode Cloud: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.dim('   Verification completed successfully, but results were not recorded.'));
    }
  }
}

/**
 * Display verification results in a formatted report card
 */
function displayVerifyResults(
  result: {
    adherenceScore: number;
    bloatCount: number;
    bloatFiles: string[];
    plannedFilesModified: number;
    totalPlannedFiles: number;
    verdict: 'PASS' | 'FAIL' | 'WARN';
    message: string;
  },
  policyViolations?: Array<{ rule: string; file: string; severity: string; message?: string }>,
) {
  // Calculate grade/score
  // CRITICAL: 0/0 planned files = 'F' (Incomplete)
  // Bloat automatically drops grade by at least one letter
  let grade: string;
  let gradeColor: (str: string) => string;
  
  if (result.totalPlannedFiles === 0 && result.plannedFilesModified === 0) {
    // Special case: No planned files = Incomplete (F)
    grade = 'F';
    gradeColor = chalk.red;
  } else if (result.verdict === 'PASS') {
    grade = 'A';
    gradeColor = chalk.green;
  } else if (result.verdict === 'WARN') {
    // Base grade calculation
    let baseGrade = result.adherenceScore >= 70 ? 'B' : result.adherenceScore >= 50 ? 'C' : 'D';
    
    // Bloat drops grade by one letter (B -> C, C -> D, D -> F)
    if (result.bloatCount > 0) {
      if (baseGrade === 'B') baseGrade = 'C';
      else if (baseGrade === 'C') baseGrade = 'D';
      else if (baseGrade === 'D') baseGrade = 'F';
    }
    
    grade = baseGrade;
    gradeColor = chalk.yellow;
  } else {
    grade = 'F';
    gradeColor = chalk.red;
  }

  // Calculate estimated time saved (5 minutes per VERIFY_PASS)
  const estimatedMinutesSaved = result.verdict === 'PASS' ? 5 : 0;
  
  // Calculate policy compliance percentage
  const policyCompliance = result.bloatCount === 0 ? 100 : Math.max(0, 100 - (result.bloatCount * 10));

  // Display Governance Badge for PASS and FAIL verdicts (high visibility)
  if (result.verdict === 'PASS' || result.verdict === 'FAIL') {
    console.log('\n');
    const borderColor = result.verdict === 'PASS' ? 'green' : 'red';
    const gradeColorFunc = result.verdict === 'PASS' ? chalk.green.bold : chalk.red.bold;
    
    const badgeContent = [
      `${chalk.bold.white('Governance Badge')}`,
      '',
      `${chalk.cyan('Grade:')} ${gradeColorFunc(grade)} ${chalk.dim(`(${result.adherenceScore}%)`)}`,
      result.verdict === 'PASS' ? `${chalk.cyan('Estimated Time Saved:')} ${chalk.green.bold(`${estimatedMinutesSaved}m`)}` : '',
      `${chalk.cyan('Policy Compliance:')} ${result.verdict === 'PASS' ? chalk.green.bold(`${policyCompliance}%`) : chalk.red.bold(`${policyCompliance}%`)}`,
    ].filter(line => line !== '').join('\n');
    
    console.log(createBox(badgeContent, {
      borderColor,
      titleColor: 'white',
      padding: 2,
    }));
    console.log('');
  }

  console.log(chalk.bold.cyan('📋 Plan Adherence Report\n'));
  console.log('━'.repeat(50));

  const scoreDisplay = gradeColor(`Grade: ${grade} (${result.adherenceScore}%)`);
  
  if (result.verdict === 'PASS') {
    console.log(chalk.green('✅'), scoreDisplay);
  } else if (result.verdict === 'WARN') {
    console.log(chalk.yellow('⚠️ '), scoreDisplay);
  } else {
    console.log(chalk.red('❌'), scoreDisplay);
  }

  console.log('');
  console.log(chalk.bold.white('Adherence:'));
  console.log(`   ${result.plannedFilesModified}/${result.totalPlannedFiles} planned files modified`);
  console.log(`   ${result.adherenceScore}% adherence to plan`);

  // Display bloat
  if (result.bloatCount > 0) {
    console.log('');
    console.log(chalk.bold.red(`🚫 Bloat Detected: ${result.bloatCount} unexpected file(s)`));
    console.log(chalk.red('   Blocked Bloat:'));
    result.bloatFiles.forEach(file => {
      console.log(chalk.red(`     • ${file}`));
    });
  } else {
    console.log('');
    console.log(chalk.green('✅ No bloat detected - all changes match the plan'));
  }

  // Display custom policy violations from dashboard
  if (policyViolations && policyViolations.length > 0) {
    console.log('');
    const blockCount = policyViolations.filter(v => v.severity === 'block').length;
    const label = blockCount > 0
      ? chalk.bold.red(`🚫 Custom Policy Violations: ${policyViolations.length} (${blockCount} blocking)`)
      : chalk.bold.yellow(`⚠️  Custom Policy Warnings: ${policyViolations.length}`);
    console.log(label);
    policyViolations.forEach(v => {
      const lineColor = v.severity === 'block' ? chalk.red : chalk.yellow;
      console.log(lineColor(`     • ${v.file}: ${v.message || v.rule}`));
    });
  }

  console.log('');
  console.log('━'.repeat(50));
  console.log(chalk.dim(result.message));
  console.log('');
}