import { execSync } from 'child_process';
import { parseDiff, getDiffSummary, DiffFile } from '@neurcode-ai/diff-parser';
import { evaluateRules, RuleResult, Decision } from '../rules';
import { loadConfig, requireApiKey } from '../config';
import { ApiClient } from '../api-client';
import { detectProject } from '../utils/project-detector';
import { createInterface } from 'readline/promises';
import { stdin, stdout } from 'process';
import { 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSection,
  printProgress,
  printProgressComplete,
  printAuthError,
  printProjectError,
  printSuccessBanner
} from '../utils/messages';

interface CheckOptions {
  staged?: boolean;
  head?: boolean;
  base?: string;
  online?: boolean;
  ai?: boolean;
  intent?: string;
  sessionId?: string;
}

export async function checkCommand(options: CheckOptions) {
  try {
    // Determines which diff to capture
    let diffText: string;
    
    if (options.staged) {
      diffText = execSync('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else if (options.base) {
      diffText = execSync(`git diff ${options.base}`, { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else if (options.head) {
      diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
    } else {
      // Default: check staged, fallback to HEAD
      try {
        diffText = execSync('git diff --staged', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
      } catch {
        diffText = execSync('git diff HEAD', { maxBuffer: 1024 * 1024 * 1024, encoding: 'utf-8' });
      }
    }

    if (!diffText.trim()) {
      printSuccess('No changes detected', 'Your working directory is clean. Nothing to analyze.');
      process.exit(0);
    }

    // Try online mode if requested
    if (options.online || options.ai) {
      let projectId: string | undefined;
      
      try {
        const config = loadConfig();
        
        // Require API key
        if (!config.apiKey) {
          config.apiKey = requireApiKey();
        }
        
        // If --ai is used without --intent, prompt for intent in interactive terminal
        if (options.ai && !options.intent && process.stdout.isTTY && !process.env.CI) {
          try {
            const rl = createInterface({ input: stdin, output: stdout });
            const intent = await rl.question('What is the intent of this session? ');
            rl.close();
            if (intent && intent.trim()) {
              options.intent = intent.trim();
            }
          } catch (promptError) {
            // If prompt fails, continue without intent
            console.warn('⚠️  Could not prompt for intent, continuing without it');
          }
        }
        
        const client = new ApiClient(config);
        
        // Implicit Project Discovery: Auto-detect and connect project
        projectId = config.projectId;
        if (!projectId) {
          try {
            const projectInfo = detectProject();
            if (projectInfo.gitUrl) {
              const project = await client.ensureProject(projectInfo.gitUrl, projectInfo.name || undefined);
              projectId = project.id;
              
              // Save projectId to config file
              const { writeFileSync, existsSync, readFileSync } = await import('fs');
              const { join } = await import('path');
              const configPath = join(process.cwd(), 'neurcode.config.json');
              let configData: Record<string, any> = {};
              
              if (existsSync(configPath)) {
                try {
                  configData = JSON.parse(readFileSync(configPath, 'utf-8'));
                } catch {
                  // Ignore parse errors
                }
              }
              
              configData.apiKey = config.apiKey;
              configData.projectId = projectId;
              
              writeFileSync(configPath, JSON.stringify(configData, null, 2) + '\n', 'utf-8');
            }
          } catch (error: any) {
            // Graceful degradation - continue without project
          }
        }
        
        if (options.ai) {
          // AI-powered analysis with session tracking
          printProgress('Analyzing your code with Neurcode AI');
          
          // Read file contents for all changed files to enable proper revert
          const diffFiles = parseDiff(diffText);
          const fileContents: Record<string, string> = {};
          
          try {
            const fs = await import('fs');
            const path = await import('path');
            for (const file of diffFiles) {
              try {
                // Try multiple path variations to find the file
                const pathsToTry = [
                  file.path, // Original path from diff
                  file.path.replace(/^b\//, ''), // Without "b/" prefix
                  file.path.startsWith('b/') ? file.path : `b/${file.path}`, // With "b/" prefix
                  path.basename(file.path), // Just filename
                ];
                
                for (const filePath of pathsToTry) {
                  if (fs.existsSync(filePath)) {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    // Store with multiple keys to ensure matching
                    fileContents[file.path] = content; // Original path
                    fileContents[filePath] = content; // Actual file path
                    // Also store without b/ prefix for matching
                    const pathWithoutBPrefix = file.path.replace(/^b\//, '');
                    if (pathWithoutBPrefix !== file.path) {
                      fileContents[pathWithoutBPrefix] = content;
                    }
                    break; // Found the file, no need to try other paths
                  }
                }
              } catch (err) {
                // File might not exist (e.g., deleted), skip it
                // We'll use diff as fallback
              }
            }
          } catch (err) {
            // If we can't read files, continue without fileContents
            // The API will use diff as fallback
          }
          
          const aiResult = await client.analyzeBloat(
            diffText,
            options.intent,
            projectId,
            options.sessionId,
            Object.keys(fileContents).length > 0 ? fileContents : undefined
          );
          
          printProgressComplete(true);
          
          // Display AI analysis results
          await printSuccessBanner('AI Analysis Complete');
          printSection('Analysis Results');
          if (aiResult.sessionId) {
            console.log(`\n🎯 Session ID: ${aiResult.sessionId}`);
            console.log(`   View in dashboard: https://neurcode.com/dashboard/sessions/${aiResult.sessionId}`);
          } else {
            console.log(`\n⚠️  Session tracking unavailable (analysis completed successfully)`);
          }
          
          console.log(`\n📈 Redundancy Analysis:`);
          console.log(`   Original Lines: ${aiResult.analysis.redundancy.originalLines}`);
          console.log(`   Suggested Lines: ${aiResult.analysis.redundancy.suggestedLines}`);
          console.log(`   Redundancy: ${aiResult.analysis.redundancy.redundancyPercentage}%`);
          console.log(`   Token Savings: ${aiResult.analysis.redundancy.tokenSavings.toLocaleString()}`);
          // Show cost with appropriate precision (4 decimal places for small amounts)
          const costSavings = aiResult.analysis.redundancy.costSavings;
          const costDisplay = costSavings < 0.01 
            ? `$${costSavings.toFixed(6)}` 
            : `$${costSavings.toFixed(2)}`;
          console.log(`   Cost Savings: ${costDisplay}`);
          
          if (aiResult.analysis.redundancy.redundantBlocks.length > 0) {
            console.log(`\n⚠️  Redundant Blocks Found:`);
            aiResult.analysis.redundancy.redundantBlocks.forEach((block, i) => {
              console.log(`   ${i + 1}. Lines ${block.lines[0]}-${block.lines[1]}: ${block.reason}`);
              console.log(`      Suggestion: ${block.suggestion}`);
            });
          }
          
          console.log(`\n🎯 Intent Match:`);
          console.log(`   Matches: ${aiResult.analysis.intentMatch.matches ? '✅ Yes' : '❌ No'}`);
          console.log(`   Confidence: ${aiResult.analysis.intentMatch.confidence}%`);
          console.log(`   Explanation: ${aiResult.analysis.intentMatch.explanation}`);
          
          if (aiResult.analysis.intentMatch.mismatches.length > 0) {
            console.log(`\n⚠️  Intent Mismatches:`);
            aiResult.analysis.intentMatch.mismatches.forEach((mismatch) => {
              console.log(`   - ${mismatch.file}: ${mismatch.reason}`);
            });
          }
          
          console.log(`\n💡 Recommendation: ${aiResult.analysis.recommendation.toUpperCase()}`);
          console.log(`\n${aiResult.analysis.summary}`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
          
          // Exit with appropriate code based on recommendation
          if (aiResult.analysis.recommendation === 'block') {
            process.exit(2);
          } else if (aiResult.analysis.recommendation === 'warn') {
            process.exit(1);
          } else {
            process.exit(0);
          }
        } else {
          // Basic rule-based analysis
          printProgress('Analyzing code against governance policies');
          const apiResult = await client.analyzeDiff(diffText, projectId);
          printProgressComplete(true);
          
          // Display results from API
          displayResults(apiResult.summary, {
            decision: apiResult.decision,
            violations: apiResult.violations
          }, apiResult.logId);
          
          // Exit with appropriate code
          if (apiResult.decision === 'block') {
            process.exit(2);
          } else if (apiResult.decision === 'warn') {
            process.exit(1);
          } else {
            process.exit(0);
          }
        }
      } catch (error) {
        printProgressComplete(false);
        
        if (error instanceof Error) {
          if (error.message.includes('401') || error.message.includes('403')) {
            await printAuthError(error);
          } else if (error.message.includes('project') || error.message.includes('404')) {
            printProjectError(error, projectId);
          } else {
            printError('Online analysis failed', error);
          }
        } else {
          printError('Online analysis failed', String(error));
        }
        
        printWarning(
          'Falling back to local analysis',
          'Using local policy rules (may differ from your organization policies)'
        );
        // Fall through to local mode
      }
    }

    // Local mode (default or fallback)
    // Parse the diff
    const diffFiles = parseDiff(diffText);
    
    if (diffFiles.length === 0) {
      console.log('✓ No file changes detected');
      process.exit(0);
    }

    // Get summary
    const summary = getDiffSummary(diffFiles);
    
    // Evaluate rules
    const result = evaluateRules(diffFiles);
    
    // Display results
    displayResults(summary, result);

    // Exit with appropriate code
    if (result.decision === 'block') {
      process.exit(2);
    } else if (result.decision === 'warn') {
      process.exit(1);
    } else {
      process.exit(0);
    }

  } catch (error) {
    if (error instanceof Error) {
      // Check if it's a git error
      if (error.message.includes('not a git repository')) {
        printError(
          'Not a Git Repository',
          error,
          [
            'This command must be run in a git repository',
            'Initialize git: git init',
            'Or navigate to a git repository directory'
          ]
        );
      } else if (error.message.includes('git diff')) {
        printError(
          'Git Command Failed',
          error,
          [
            'Make sure git is installed and accessible',
            'Check if you have staged changes: git status',
            'Verify git is working: git --version'
          ]
        );
      } else {
        printError('Command Failed', error);
      }
    } else {
      printError('Unknown Error', String(error));
    }
    process.exit(1);
  }
}

/**
 * Display analysis results
 */
function displayResults(
  summary: { totalFiles: number; totalAdded: number; totalRemoved: number; files: Array<{ path: string; changeType: string; added: number; removed: number }> },
  result: { decision: Decision; violations: Array<{ rule: string; file: string; severity: string; message?: string }> },
  logId?: string
) {
  // Print results
  console.log('\n📊 Diff Analysis Summary');
  if (logId) {
    console.log(`Log ID: ${logId}`);
  }
  console.log('─'.repeat(50));
  console.log(`Files changed: ${summary.totalFiles}`);
  console.log(`Lines added: ${summary.totalAdded}`);
  console.log(`Lines removed: ${summary.totalRemoved}`);
  console.log(`Net change: ${summary.totalAdded - summary.totalRemoved > 0 ? '+' : ''}${summary.totalAdded - summary.totalRemoved}`);

  // Print file list
  console.log('\n📁 Changed Files:');
  summary.files.forEach(file => {
    const changeIcon = file.changeType === 'add' ? '➕' : 
                      file.changeType === 'delete' ? '➖' : 
                      file.changeType === 'rename' ? '🔄' : '✏️';
    console.log(`  ${changeIcon} ${file.path} (${file.changeType})`);
  });

  // Print rule violations
  if (result.violations.length > 0) {
    console.log('\n⚠️  Rule Violations:');
    result.violations.forEach(violation => {
      const severityIcon = violation.severity === 'block' ? '🚫' : '⚠️';
      console.log(`  ${severityIcon} [${violation.severity.toUpperCase()}] ${violation.rule}`);
      console.log(`     File: ${violation.file}`);
      if (violation.message) {
        console.log(`     ${violation.message}`);
      }
    });
  } else {
    console.log('\n✓ No rule violations detected');
  }

  // Print decision
  console.log('\n' + '─'.repeat(50));
  const decisionIcon = result.decision === 'allow' ? '✓' : 
                       result.decision === 'warn' ? '⚠️' : '🚫';
  console.log(`Decision: ${decisionIcon} ${result.decision.toUpperCase()}`);
}

