/**
 * Config Command
 * 
 * Allows users to configure their API key locally for easier CLI usage.
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import chalk from 'chalk';

/**
 * Validate API key format
 */
function validateApiKey(key: string): boolean {
  if (!key || typeof key !== 'string') {
    return false;
  }
  
  // API keys should start with nk_ (nk_live_ or nk_test_)
  return key.startsWith('nk_');
}

/**
 * Save API key to config file
 */
export function configCommand(key?: string, options?: { global?: boolean }): void {
  if (!key) {
    console.error(chalk.red('❌ Error: API key is required'));
    console.log(chalk.yellow('\nUsage:'));
    console.log(chalk.cyan('  neurcode config --key <your_api_key>'));
    console.log(chalk.cyan('  neurcode config --key <your_api_key> --global  # Save to home directory\n'));
    console.log(chalk.gray('Get your API key from: https://dashboard.neurcode.com/api-keys'));
    process.exit(1);
  }

  // Validate key format
  if (!validateApiKey(key)) {
    console.error(chalk.red('❌ Error: Invalid API key format'));
    console.log(chalk.yellow('\nAPI keys must start with "nk_" (e.g., nk_live_... or nk_test_...)'));
    console.log(chalk.gray('Get your API key from: https://dashboard.neurcode.com/api-keys\n'));
    process.exit(1);
  }

  // Determine config file path
  const configPath = options?.global
    ? join(process.env.HOME || process.env.USERPROFILE || '', 'neurcode.config.json')
    : join(process.cwd(), 'neurcode.config.json');

  try {
    // Load existing config if it exists
    let config: Record<string, any> = {};
    if (existsSync(configPath)) {
      try {
        const existingContent = readFileSync(configPath, 'utf-8');
        config = JSON.parse(existingContent);
      } catch (error) {
        console.warn(chalk.yellow(`⚠️  Warning: Could not parse existing config file, creating new one`));
      }
    }

    // Update API key
    config.apiKey = key;
    
    // Do NOT save apiUrl to config file - it defaults to production
    // Only save apiUrl if it was explicitly set (for enterprise/on-prem use cases)
    // For normal users, we use the default production URL
    
    // Create minimal config with only apiKey (and projectId if it exists)
    const configToSave: Record<string, any> = {
      apiKey: key,
    };
    
    // Preserve projectId if it exists
    if (config.projectId) {
      configToSave.projectId = config.projectId;
    }
    
    // Only save apiUrl if it was explicitly set in the existing config
    // (This is for enterprise/on-prem deployments)
    if (config.apiUrl && config.apiUrl !== 'https://api.neurcode.com') {
      configToSave.apiUrl = config.apiUrl;
    }

    // Write config file (minimal - only what's needed)
    writeFileSync(configPath, JSON.stringify(configToSave, null, 2) + '\n', 'utf-8');

    console.log(chalk.green('\n✅ API Key saved. Connected to Neurcode Web.\n'));
    
    if (options?.global) {
      console.log(chalk.cyan('💡 This key will be used for all projects unless overridden locally.\n'));
    } else {
      console.log(chalk.cyan('💡 This key will be used for this project.\n'));
      console.log(chalk.gray('   Tip: Use --global flag to save for all projects\n'));
    }

    console.log(chalk.green('🚀 You are ready to go! Try:'));
    console.log(chalk.cyan('   neurcode plan "Add a new feature"'));
    console.log(chalk.cyan('   neurcode check --staged\n'));
  } catch (error: any) {
    console.error(chalk.red(`❌ Error saving config: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Show current configuration
 */
export function showConfigCommand(): void {
  const { loadConfig } = require('../config');
  const config = loadConfig();

  console.log(chalk.bold('\n📋 Current Configuration\n'));

  if (config.apiKey) {
    const maskedKey = config.apiKey.substring(0, 12) + '...' + config.apiKey.substring(config.apiKey.length - 4);
    console.log(chalk.green(`✅ API Key: ${maskedKey}`));
    
    // Show source
    if (process.env.NEURCODE_API_KEY) {
      console.log(chalk.gray('   Source: Environment variable (NEURCODE_API_KEY)'));
    } else {
      console.log(chalk.gray('   Source: Config file'));
    }
  } else {
    console.log(chalk.red('❌ API Key: Not set'));
  }

  // Show API URL only if it's not the default (for enterprise/on-prem users)
  if (config.apiUrl && config.apiUrl !== 'https://api.neurcode.com') {
    console.log(chalk.cyan(`🌐 API URL: ${config.apiUrl} (custom)`));
  } else {
    console.log(chalk.gray('🌐 API URL: https://api.neurcode.com (production)'));
  }

  if (config.projectId) {
    console.log(chalk.blue(`📁 Project ID: ${config.projectId}`));
  } else {
    console.log(chalk.gray('📁 Project ID: Not set'));
  }

  console.log('');
}

