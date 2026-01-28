/**
 * Logout Command
 * 
 * Clears the saved API key from global config (~/.neurcoderc)
 */

import { deleteApiKeyFromAllSources, getApiKey } from '../config';

// Import chalk with fallback
let chalk: any;
try {
  chalk = require('chalk');
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

export async function logoutCommand() {
  try {
    // Check if there's an API key from config files
    const existingApiKey = getApiKey();
    
    if (!existingApiKey) {
      console.log(chalk.yellow('\n⚠️  You are not currently logged in.\n'));
      console.log(chalk.dim('   No API key found in configuration files.\n'));
      console.log(chalk.dim('   Run "neurcode login" to authenticate.\n'));
      return;
    }

    // Delete API key from all file-based sources
    const result = deleteApiKeyFromAllSources();
    
    if (!result.removedFromGlobal && !result.removedFromLocal) {
      console.log(chalk.yellow('\n⚠️  No API key found in config files.\n'));
      console.log(chalk.dim('   You may not be logged in.\n'));
      return;
    }
    
    console.log(chalk.green('\n✅ Successfully logged out!\n'));
    
    const removedFrom: string[] = [];
    if (result.removedFromGlobal) {
      removedFrom.push('~/.neurcoderc');
    }
    if (result.removedFromLocal) {
      removedFrom.push('neurcode.config.json');
    }
    
    if (removedFrom.length > 0) {
      console.log(chalk.dim(`   API key removed from: ${removedFrom.join(', ')}`));
    }
    
    console.log(chalk.dim('   You can log in again with: neurcode login\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Error during logout:'));
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
    } else {
      console.error(error);
    }
    console.log(chalk.dim('\n💡 If the issue persists, manually delete:'));
    console.log(chalk.dim('   - ~/.neurcoderc'));
    console.log(chalk.dim('   - neurcode.config.json (if present)\n'));
    process.exit(1);
  }
}

