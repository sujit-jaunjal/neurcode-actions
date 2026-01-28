/**
 * Revert Command
 * 
 * Reverts a file to a specific version from Neurcode's version history.
 */

import { promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { ApiClient } from '../api-client';
import { loadConfig } from '../config';
import { logROIEvent } from '../utils/ROILogger';

// Import chalk with fallback
let chalk: any;
try {
  chalk = require('chalk');
} catch {
  chalk = {
    yellow: (str: string) => str,
    dim: (str: string) => str,
  };
}

interface RevertOptions {
  toVersion: number;
  projectId?: string;
  reason?: string;
  dryRun?: boolean;
  backup?: boolean;
  force?: boolean;
}

export async function revertCommand(filePath: string, options: RevertOptions) {
  try {
    // Validate file path
    if (!filePath || filePath.trim() === '') {
      console.error('❌ Error: filePath is required');
      console.log('\nUsage: neurcode revert <filePath> --to-version <version>');
      process.exit(1);
    }

    // Validate version
    if (!options.toVersion || options.toVersion < 1) {
      console.error('❌ Error: --to-version must be >= 1');
      process.exit(1);
    }

    // Load config
    const config = loadConfig();
    // API URL is automatically set to production - no need to check

    if (!config.apiKey) {
      console.error('❌ Error: API Key not configured');
      console.log('Set NEURCODE_API_KEY environment variable or add to neurcode.config.json');
      process.exit(1);
    }

    // Resolve file path (support relative and absolute paths)
    const resolvedPath = resolve(process.cwd(), filePath);
    
    // Check if file exists (unless it's a new file being reverted)
    if (!existsSync(resolvedPath) && !options.force) {
      console.error(`❌ Error: File not found: ${resolvedPath}`);
      console.log('Use --force to revert even if file does not exist locally');
      process.exit(1);
    }

    // Initialize API client
    const client = new ApiClient(config);
    const projectId = options.projectId || config.projectId;

    // Check user tier - FREE users can only revert to last version
    const { getUserTier } = await import('../utils/tier');
    const tier = await getUserTier();
    
    if (tier === 'FREE') {
      // FREE users can only revert to version 1 (last version)
      // Get latest version first to determine what "last version" means
      try {
        const versions = await client.getFileVersions(filePath, projectId, 2); // Get latest 2 versions
        if (versions.length === 0) {
          console.error(`❌ Error: No versions found for file ${filePath}`);
          process.exit(1);
        }
        
        const latestVersion = versions[0].versionNumber;
        const lastVersion = versions.length > 1 ? versions[1].versionNumber : latestVersion;
        
        // FREE users can only revert to the last version (1 version prior)
        if (options.toVersion !== lastVersion && options.toVersion !== latestVersion) {
          console.error(`❌ Error: FREE tier can only revert to version ${lastVersion} (last version)`);
          console.log(`   You tried to revert to version ${options.toVersion}`);
          console.log(chalk.yellow('\n📊 Upgrade to PRO for Infinite History & Selective Revert'));
          console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
          process.exit(1);
        }
      } catch (error) {
        // If we can't get versions, allow the revert to proceed (will fail later if invalid)
        console.warn('⚠️  Warning: Could not verify version access. Proceeding...');
      }
    }

    console.log(`\n🔄 Reverting ${filePath} to version ${options.toVersion}...`);
    if (options.dryRun) {
      console.log('⚠️  DRY RUN MODE - No files will be modified\n');
    }

    // Fetch version from API
    let versionData;
    try {
      versionData = await client.getFileVersion(filePath, options.toVersion, projectId);
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('404') || error.message.includes('not found')) {
          console.error(`❌ Error: Version ${options.toVersion} not found for file ${filePath}`);
          console.log('Use "neurcode revert versions <filePath>" to see available versions');
        } else {
          console.error(`❌ Error fetching version: ${error.message}`);
        }
      } else {
        console.error('❌ Error fetching version:', error);
      }
      process.exit(1);
    }

    const { version, fileContent, lineInfo } = versionData;
    
    // For getFileVersion, we don't have revertInstructions, so we'll create a simple one
    const revertInstructions = {
      method: 'full_replace' as const,
      filePath: filePath,
      fromVersion: 0, // Will be determined when actually reverting
      toVersion: options.toVersion,
    };

    // Display version info
    console.log(`\n📋 Version Information:`);
    console.log(`   Version: ${version.versionNumber}`);
    console.log(`   Created: ${new Date(version.createdAt).toLocaleString()}`);
    console.log(`   Lines: ${lineInfo.totalLines}`);
    console.log(`   Change Type: ${version.changeType || 'N/A'}`);
    if (version.sessionId) {
      console.log(`   Session: ${version.sessionId}`);
    }

    // Show what will be reverted
    if (existsSync(resolvedPath)) {
      const currentContent = await fs.readFile(resolvedPath, 'utf-8');
      const currentLines = currentContent.split('\n').length;
      const diff = lineInfo.totalLines - currentLines;
      
      console.log(`\n📊 Current State:`);
      console.log(`   Current Lines: ${currentLines}`);
      console.log(`   Target Lines: ${lineInfo.totalLines}`);
      if (diff !== 0) {
        console.log(`   Difference: ${diff > 0 ? '+' : ''}${diff} lines`);
      } else {
        console.log(`   Difference: No line count change`);
      }
    } else {
      console.log(`\n📊 Current State:`);
      console.log(`   File does not exist locally (will be created)`);
    }

    // Dry run - just show what would happen
    if (options.dryRun) {
      console.log(`\n📝 File Content Preview (first 50 lines):`);
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      const previewLines = fileContent.split('\n').slice(0, 50);
      previewLines.forEach((line, idx) => {
        console.log(`${(idx + 1).toString().padStart(4, ' ')} | ${line}`);
      });
      if (fileContent.split('\n').length > 50) {
        console.log(`     ... (${fileContent.split('\n').length - 50} more lines)`);
      }
      console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      console.log('\n✅ Dry run complete - no files were modified');
      console.log('Remove --dry-run to actually revert the file');
      process.exit(0);
    }

    // Create backup if requested
    let backupPath: string | null = null;
    if (options.backup && existsSync(resolvedPath)) {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      backupPath = `${resolvedPath}.backup.${timestamp}`;
      const currentContent = await fs.readFile(resolvedPath, 'utf-8');
      await fs.writeFile(backupPath, currentContent, 'utf-8');
      console.log(`\n💾 Backup created: ${backupPath}`);
    }

    // Confirm before proceeding (unless --force)
    if (!options.force) {
      console.log(`\n⚠️  This will overwrite the current file: ${resolvedPath}`);
      console.log('Press Ctrl+C to cancel, or wait 3 seconds to continue...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // Ensure directory exists
    const fileDir = dirname(resolvedPath);
    if (!existsSync(fileDir)) {
      await fs.mkdir(fileDir, { recursive: true });
      console.log(`📁 Created directory: ${fileDir}`);
    }

    // Write reverted content to file
    try {
      await fs.writeFile(resolvedPath, fileContent, 'utf-8');
      
      // Update Git index to keep it consistent with filesystem
      // This ensures git status accurately reflects the revert
      try {
        execSync(`git add "${resolvedPath}"`, { 
          maxBuffer: 1024 * 1024 * 1024,
          encoding: 'utf-8',
          cwd: process.cwd(),
          stdio: 'ignore', // Suppress output - we'll handle errors explicitly
        });
        console.log(`\n✅ Successfully reverted ${filePath} to version ${options.toVersion}`);
        console.log(`📝 Git index updated`);
      } catch (gitError) {
        // Git add failed - might not be a git repo or git not available
        // This is not fatal - file is still reverted, just Git index won't be updated
        console.log(`\n✅ Successfully reverted ${filePath} to version ${options.toVersion}`);
        console.warn(`   ⚠️  Git index not updated (not a git repository or git not available)`);
        console.log(`   File is reverted, but git status may show it as modified`);
      }
      
      if (backupPath) {
        console.log(`💾 Original file backed up to: ${backupPath}`);
      }

      // Call revert API to record the revert in database
      try {
        await client.revertFile(filePath, options.toVersion, projectId, options.reason);
        console.log(`📝 Revert recorded in Neurcode database`);
      } catch (apiError) {
        console.warn(`⚠️  Warning: File reverted locally but failed to record in database:`);
        if (apiError instanceof Error) {
          console.warn(`   ${apiError.message}`);
        }
        // Don't fail the command if API call fails - file is already reverted
      }

      // Log ROI event for successful revert (non-blocking)
      try {
        logROIEvent('REVERT_SUCCESS', { filePath, toVersion: options.toVersion }, projectId || null).catch(() => {
          // Silently ignore - ROI logging should never block user workflows
        });
      } catch {
        // Silently ignore - ROI logging should never block user workflows
      }

      console.log(`\n📊 Summary:`);
      console.log(`   File: ${resolvedPath}`);
      console.log(`   Version: ${options.toVersion}`);
      console.log(`   Lines: ${lineInfo.totalLines}`);
      console.log(`   Method: ${revertInstructions.method}`);
      
    } catch (writeError) {
      console.error(`\n❌ Error writing file: ${writeError instanceof Error ? writeError.message : writeError}`);
      
      // Restore backup if write failed and backup exists
      if (backupPath && existsSync(backupPath)) {
        try {
          const backupContent = await fs.readFile(backupPath, 'utf-8');
          await fs.writeFile(resolvedPath, backupContent, 'utf-8');
          console.log(`✅ Restored from backup: ${backupPath}`);
        } catch (restoreError) {
          console.error(`❌ Failed to restore from backup: ${restoreError instanceof Error ? restoreError.message : restoreError}`);
        }
      }
      
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Unexpected error:', error instanceof Error ? error.message : error);
    if (error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
    process.exit(1);
  }
}

/**
 * List available versions for a file
 */
export async function listVersionsCommand(filePath: string, options: { projectId?: string; limit?: number }) {
  try {
    if (!filePath || filePath.trim() === '') {
      console.error('❌ Error: filePath is required');
      console.log('\nUsage: neurcode revert versions <filePath>');
      process.exit(1);
    }

    const config = loadConfig();
    // API URL is automatically set to production - no need to check
    if (!config.apiKey) {
      console.error('❌ Error: API Key must be configured');
      process.exit(1);
    }

    const client = new ApiClient(config);
    const projectId = options.projectId || config.projectId;
    const limit = options.limit || 50;

    console.log(`\n📋 Fetching versions for: ${filePath}\n`);

    const versions = await client.getFileVersions(filePath, projectId, limit);

    if (versions.length === 0) {
      console.log('No versions found for this file.');
      process.exit(0);
    }

    console.log(`Found ${versions.length} version(s):\n`);
    console.log('Version | Lines | Type      | Created');
    console.log('────────┼───────┼───────────┼─────────────────────');

    versions.forEach(version => {
      const lines = version.fileContent.split('\n').length;
      const type = (version.changeType || 'N/A').padEnd(9);
      const date = new Date(version.createdAt).toLocaleString();
      console.log(`${version.versionNumber.toString().padStart(7)} | ${lines.toString().padStart(5)} | ${type} | ${date}`);
    });

    console.log(`\n💡 Use "neurcode revert ${filePath} --to-version <version>" to revert to a specific version`);

  } catch (error) {
    console.error('\n❌ Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

