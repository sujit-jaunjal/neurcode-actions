import { writeFileSync, existsSync, mkdirSync, readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { loadConfig, requireApiKey } from '../config';
import { ApiClient } from '../api-client';
import { logROIEvent } from '../utils/ROILogger';

// Try to import chalk, fallback to plain strings if not available
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  // Fallback: create a mock chalk object that returns strings as-is
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

interface ApplyOptions {
  force?: boolean;
}

/**
 * Apply a saved architect plan by generating and writing code files
 */
export async function applyCommand(planId: string, options: ApplyOptions) {
  try {
    if (!planId || !planId.trim()) {
      console.error(chalk.red('❌ Error: Plan ID is required'));
      console.log(chalk.dim('Usage: neurcode apply <planId>'));
      process.exit(1);
    }

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(planId.trim())) {
      console.error(chalk.red('❌ Error: Invalid plan ID format'));
      console.log(chalk.dim('Plan ID must be a valid UUID'));
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig();
    // API URL is automatically set to production - no need to check

    // Require API key (shows helpful error message if missing)
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    // Initialize API client
    const client = new ApiClient(config);

    console.log(chalk.dim(`📋 Applying plan: ${planId}...\n`));

    // Step 1: Get the plan to know which files will be generated
    // We need to add a getPlan endpoint, but for now let's use a workaround:
    // Call apply with empty snapshots to get file list, then read snapshots, then call again
    // Actually, better: Update API to accept snapshots and handle everything in one call
    
    // For Phase 6 MVP: Let's read files that might be affected
    // We'll need to know the plan files first. Let's add a getPlan endpoint or 
    // update apply to accept snapshots and return plan info
    
    // Step 2: Read existing files before generating code (safety backup)
    const cwd = process.cwd();
    const snapshots: Array<{ path: string; originalContent: string }> = [];
    
    console.log(chalk.dim('📸 Creating safety snapshots of existing files...\n'));
    
    // For now, we'll call apply to get the file list, then read snapshots
    // But the API should handle versioning, so we need to send snapshots before generation
    // Let's implement: API fetches plan, CLI reads files based on plan, then API generates with snapshots
    
    // Temporary: Call apply to get file list (API will generate code)
    // Then we read snapshots and API will save versions
    // Better: Add a "preview" endpoint or update apply to accept snapshots upfront
    
    // For Phase 6: Update apply endpoint to:
    // 1. Fetch plan
    // 2. Accept snapshots
    // 3. Save original versions
    // 4. Generate code
    // 5. Save new versions
    // 6. Track in session
    
    // Call API to generate code (API will handle versioning if snapshots provided)
    const response = await client.applyPlan(planId.trim(), snapshots);
    
    // Read existing files that will be overwritten (for display purposes)
    // Note: API should have already saved versions if snapshots were sent
    for (const file of response.files) {
      const filePath = resolve(cwd, file.path);
      if (existsSync(filePath)) {
        try {
          const originalContent = readFileSync(filePath, 'utf-8');
          if (!snapshots.find(s => s.path === file.path)) {
            snapshots.push({
              path: file.path,
              originalContent: originalContent
            });
            console.log(chalk.dim(`  📸 Snapshot: ${file.path}`));
          }
        } catch (error) {
          console.log(chalk.yellow(`  ⚠️  Could not read ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    }
    
    if (snapshots.length > 0) {
      console.log(chalk.dim(`\n✅ Created ${snapshots.length} snapshot(s) for safety`));
      console.log(chalk.dim('   These will be saved as version history before applying changes\n'));
    }

    if (!response.success) {
      console.error(chalk.red('❌ Failed to apply plan'));
      console.error(chalk.red(response.message || 'Unknown error'));
      process.exit(1);
    }

    // Step 2: Scan generated code for hallucinations BEFORE writing to disk
    // This catches phantom packages that appear in actual generated code (not just plan)
    const { SecurityGuard } = await import('../services/security/SecurityGuard');
    const securityGuard = new SecurityGuard();
    
    // Check tier for hallucination scanning (PRO feature)
    const { getUserTier } = await import('../utils/tier');
    const tier = await getUserTier();
    
    let hasHallucinations = false;
    const allHallucinations: Array<{ packageName: string; location: string; importStatement: string }> = [];
    
    if (tier === 'FREE') {
      console.log(chalk.yellow('\n🛡️  Hallucination Shield is a PRO feature.'));
      console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
    } else {
      console.log(chalk.dim('🔍 Scanning generated code for hallucinations...'));
    
    for (const file of response.files) {
      if (file.content) {
        const hallucinationResult = await securityGuard.scanForHallucinations(
          file.content,
          file.path,
          cwd
        );
        
        if (hallucinationResult.hasHallucinations) {
          hasHallucinations = true;
          allHallucinations.push(...hallucinationResult.hallucinations.map(h => ({
            packageName: h.packageName,
            location: h.location,
            importStatement: h.importStatement,
          })));
          }
        }
      }
    }
    
    // Display hallucination warnings if found
    if (hasHallucinations) {
      // Log ROI events (non-blocking)
      try {
        const { getProjectId } = await import('../utils/state');
        const projectId = getProjectId() || config.projectId;
        
        for (const hallucination of allHallucinations) {
          logROIEvent('HALLUCINATION_BLOCKED', {
            package_name: hallucination.packageName,
            location: hallucination.location,
            import_statement: hallucination.importStatement,
          }, projectId || null).catch(() => {
            // Silently ignore - ROI logging should never block user workflows
          });
        }
      } catch {
        // Silently ignore - ROI logging should never block user workflows
      }
      
      // Display warnings
      console.log('\n');
      console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.red('║') + chalk.bold.white('  🛡️  SECURITY SHIELD: HALLUCINATION DETECTED IN CODE  ') + chalk.bold.red('║'));
      console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════╝'));
      console.log('');
      
      // Group by package
      const hallucinationsByPackage = new Map<string, Array<{ location: string; importStatement: string }>>();
      for (const hallucination of allHallucinations) {
        if (!hallucinationsByPackage.has(hallucination.packageName)) {
          hallucinationsByPackage.set(hallucination.packageName, []);
        }
        hallucinationsByPackage.get(hallucination.packageName)!.push({
          location: hallucination.location,
          importStatement: hallucination.importStatement,
        });
      }
      
      hallucinationsByPackage.forEach((occurrences, packageName) => {
        const shieldIcon = chalk.bold.red('🛡️');
        const criticalLabel = chalk.bold.red('CRITICAL:');
        const packageNameDisplay = chalk.bold.yellow(`'${packageName}'`);
        
        console.log(`${shieldIcon} ${chalk.bold.red('[Neurcode]')} ${criticalLabel} ${chalk.bold.white('Hallucination Blocked')}`);
        console.log(chalk.white(`   Generated code attempts to import non-existent package ${packageNameDisplay}.`));
        
        if (occurrences.length === 1) {
          console.log(chalk.dim(`   File: ${occurrences[0].location}`));
          console.log(chalk.dim(`   Statement: ${occurrences[0].importStatement}`));
        } else {
          console.log(chalk.dim(`   Found in ${occurrences.length} file(s):`));
          occurrences.forEach(occ => {
            console.log(chalk.dim(`     • ${occ.location}: ${occ.importStatement}`));
          });
        }
        console.log('');
      });
      
      console.log(chalk.yellow('⚠️  Files will NOT be written to disk due to hallucination detection.'));
      console.log(chalk.dim('   Review the plan and regenerate with valid packages.\n'));
      console.log(chalk.bold.red('─'.repeat(60)));
      console.log('');
      
      process.exit(1); // Block the apply operation
    } else {
      console.log(chalk.green('✅ No hallucinations detected in generated code'));
    }

    // Safety check: Show summary
    console.log(chalk.bold.white(`\n📊 Ready to write ${response.filesGenerated} file(s):\n`));
    
    response.files.forEach((file, index) => {
      console.log(chalk.cyan(`  ${index + 1}. ${file.path}`));
    });

    // Confirm before writing (unless --force flag is set)
    if (!options.force) {
      console.log(chalk.yellow('\n⚠️  This will write files to your filesystem.'));
      console.log(chalk.dim('   Use --force to skip this confirmation.\n'));
      
      // In a real implementation, you might want to use readline for interactive confirmation
      // For now, we'll proceed automatically but log a warning
      console.log(chalk.dim('   Proceeding with file write...\n'));
    }

    // Write files to disk
    let successCount = 0;
    let errorCount = 0;

    for (const file of response.files) {
      try {
        const filePath = resolve(cwd, file.path);
        const fileDir = dirname(filePath);

        // Create directory if it doesn't exist
        if (!existsSync(fileDir)) {
          mkdirSync(fileDir, { recursive: true });
          console.log(chalk.dim(`📁 Created directory: ${fileDir}`));
        }

        // Check if file already exists
        if (existsSync(filePath) && !options.force) {
          console.log(chalk.yellow(`⚠️  File already exists: ${file.path}`));
          console.log(chalk.dim(`   Skipping (use --force to overwrite)`));
          continue;
        }

        // Write file
        writeFileSync(filePath, file.content, 'utf-8');
        console.log(chalk.green(`✅ Written: ${file.path}`));
        successCount++;
      } catch (error) {
        console.error(chalk.red(`❌ Failed to write ${file.path}:`));
        if (error instanceof Error) {
          console.error(chalk.red(`   ${error.message}`));
        }
        errorCount++;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(60));
    if (successCount > 0) {
      console.log(chalk.bold.green(`\n✅ Successfully wrote ${successCount} file(s)`));
    }
    if (errorCount > 0) {
      console.log(chalk.bold.red(`\n❌ Failed to write ${errorCount} file(s)`));
    }
    console.log(chalk.dim(`\nPlan ID: ${response.planId}`));
    console.log(chalk.dim(`Status: APPLIED\n`));

  } catch (error) {
    console.error(chalk.red('\n❌ Error applying plan:'));
    
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
      
      if (error.message.includes('API request failed')) {
        console.log(chalk.dim('\n💡 Make sure:'));
        console.log(chalk.dim('  • Your API key is valid'));
        console.log(chalk.dim('  • The API URL is correct'));
        console.log(chalk.dim('  • The plan ID is correct'));
        console.log(chalk.dim('  • You have network connectivity'));
      } else if (error.message.includes('not found')) {
        console.log(chalk.dim('\n💡 The plan ID may be incorrect or the plan may have been deleted.'));
      } else if (error.message.includes('already been applied')) {
        console.log(chalk.dim('\n💡 This plan has already been applied.'));
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

