import { Command } from 'commander';
import { ApiClient } from '../api-client';
import { loadConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export function securityCommand(program: Command): void {
  program
    .command('security')
    .description('Analyze code for security vulnerabilities')
    .option('--diff <diff>', 'Git diff string to analyze')
    .option('--diff-file <file>', 'Path to file containing git diff')
    .option('--staged', 'Analyze staged changes (uses git diff --cached)')
    .option('--project-type <type>', 'Project type (e.g., "web", "api", "mobile")')
    .option('--json', 'Output results as JSON')
    .action(async (options: {
      diff?: string;
      diffFile?: string;
      staged?: boolean;
      projectType?: string;
      json?: boolean;
    }) => {
      try {
        let diffText = '';

        // Get diff from various sources
        if (options.diff) {
          diffText = options.diff;
        } else if (options.diffFile) {
          const diffPath = path.resolve(options.diffFile);
          if (!fs.existsSync(diffPath)) {
            console.error(`❌ Error: Diff file not found: ${diffPath}`);
            process.exit(1);
          }
          diffText = fs.readFileSync(diffPath, 'utf-8');
        } else if (options.staged) {
          const { execSync } = require('child_process');
          try {
            diffText = execSync('git diff --cached', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
          } catch (error) {
            console.error('❌ Error: Not a git repository or no staged changes');
            process.exit(1);
          }
        } else {
          // Try to get diff from git
          const { execSync } = require('child_process');
          try {
            diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
            if (!diffText.trim()) {
              console.error('❌ Error: No changes found. Use --staged for staged changes or provide --diff');
              process.exit(1);
            }
          } catch (error) {
            console.error('❌ Error: Not a git repository. Please provide --diff or --diff-file');
            process.exit(1);
          }
        }

        if (!diffText.trim()) {
          console.error('❌ Error: No diff content to analyze');
          process.exit(1);
        }

        // Initialize API client
        const config = loadConfig();
        const client = new ApiClient(config);

        if (!options.json) {
          console.log('\n🔒 Analyzing code for security vulnerabilities...');
        }

        // Call security analysis API
        const response = await client.analyzeSecurity(diffText, options.projectType);
        const { analysis } = response;

        if (options.json) {
          console.log(JSON.stringify(response, null, 2));
          process.exit(0);
        }

        // Display results
        console.log('\n🔒 Security Analysis Results:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Summary
        console.log(`\n📊 Summary:`);
        const severityColors: Record<string, string> = {
          CRITICAL: '🔴',
          HIGH: '🟠',
          MEDIUM: '🟡',
          LOW: '🟢',
        };
        console.log(`   ${severityColors.CRITICAL} Critical: ${analysis.summary.critical}`);
        console.log(`   ${severityColors.HIGH} High: ${analysis.summary.high}`);
        console.log(`   ${severityColors.MEDIUM} Medium: ${analysis.summary.medium}`);
        console.log(`   ${severityColors.LOW} Low: ${analysis.summary.low}`);
        console.log(`   Total Issues: ${analysis.summary.total}`);

        console.log(`\n⚠️  Overall Risk: ${severityColors[analysis.overallRisk] || '⚠️'} ${analysis.overallRisk}`);
        console.log(`   Recommendation: ${analysis.recommendation.toUpperCase()}`);

        // Issues
        if (analysis.issues.length > 0) {
          console.log(`\n🚨 Security Issues:`);
          analysis.issues.forEach((issue: any, i: number) => {
            console.log(`\n   ${i + 1}. ${severityColors[issue.severity] || '⚠️'} ${issue.severity} - ${issue.type}`);
            console.log(`      File: ${issue.file}`);
            console.log(`      Lines: ${issue.lines[0]}-${issue.lines[1]}`);
            console.log(`      Description: ${issue.description}`);
            if (issue.exploitation) {
              console.log(`      Exploitation: ${issue.exploitation}`);
            }
            if (issue.fix) {
              console.log(`      Fix: ${issue.fix}`);
            }
            if (issue.cwe) {
              console.log(`      CWE: ${issue.cwe}`);
            }
            console.log(`      Code:`);
            const codeLines = (issue.code || '').split('\n');
            console.log(`      ${codeLines.map((line: string) => `         ${line}`).join('\n')}`);
          });
        } else {
          console.log(`\n✅ No security issues found!`);
        }

        // Exit code based on recommendation
        if (analysis.recommendation === 'block') {
          process.exit(2);
        } else if (analysis.recommendation === 'warn') {
          process.exit(1);
        } else {
          process.exit(0);
        }
      } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}

