/**
 * Enhanced Messaging Utility
 * 
 * Provides enterprise-grade, personalized CLI messaging with consistent formatting,
 * helpful error messages, and actionable next steps.
 */

import chalk from 'chalk';
import { getUserInfo, getUserFirstName } from './user-context';

// Re-export for use in other modules
export { getUserInfo, getUserFirstName };

// Import chalk with fallback
let chalkInstance: any;
try {
  chalkInstance = require('chalk');
  // Disable colors in CI environments
  if (process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true') {
    chalkInstance.level = 0;
  }
} catch {
  chalkInstance = {
    green: (str: string) => str,
    yellow: (str: string) => str,
    red: (str: string) => str,
    bold: (str: string) => str,
    dim: (str: string) => str,
    cyan: (str: string) => str,
    white: (str: string) => str,
    blue: (str: string) => str,
    magenta: (str: string) => str,
    gray: (str: string) => str,
  };
}

/**
 * Print a personalized greeting
 */
export async function printGreeting(message: string): Promise<void> {
  const firstName = await getUserFirstName();
  console.log(chalkInstance.cyan(`\n👋 Hello ${firstName}!\n`));
  console.log(chalkInstance.dim(message));
  console.log('');
}

/**
 * Print a success message with premium formatting
 */
export function printSuccess(message: string, details?: string): void {
  console.log(chalkInstance.green(`\n✨ ${message}\n`));
  if (details) {
    console.log(chalkInstance.dim(`   ${details}`));
    console.log('');
  }
}

/**
 * Print a warning message with helpful context
 */
export function printWarning(message: string, suggestion?: string): void {
  console.log(chalkInstance.yellow(`\n⚠️  ${message}\n`));
  if (suggestion) {
    console.log(chalkInstance.dim(`   💡 ${suggestion}\n`));
  }
}

/**
 * Print an error message with actionable next steps
 */
export function printError(message: string, error?: Error | string, nextSteps?: string[]): void {
  console.log(chalkInstance.red(`\n❌ ${message}\n`));
  
  if (error) {
    const errorMessage = error instanceof Error ? error.message : error;
    console.log(chalkInstance.dim(`   Error: ${errorMessage}`));
    console.log('');
  }

  if (nextSteps && nextSteps.length > 0) {
    console.log(chalkInstance.bold.white('   Next steps:'));
    nextSteps.forEach(step => {
      console.log(chalkInstance.dim(`   • ${step}`));
    });
    console.log('');
  }
}

/**
 * Print an info message
 */
export function printInfo(message: string, details?: string): void {
  console.log(chalkInstance.cyan(`\nℹ️  ${message}\n`));
  if (details) {
    console.log(chalkInstance.dim(`   ${details}`));
    console.log('');
  }
}

/**
 * Print a section header with premium styling
 */
export function printSection(title: string, emoji: string = '▸'): void {
  console.log(chalkInstance.bold.white(`\n${emoji} ${title}\n`));
  console.log(chalkInstance.dim('─────────────────────────────────────────────────────────'));
}

/**
 * Print a step indicator
 */
export function printStep(step: number, total: number, description: string): void {
  console.log(chalkInstance.dim(`[${step}/${total}]`), chalkInstance.white(description));
}

/**
 * Print a progress indicator
 */
export function printProgress(message: string): void {
  process.stdout.write(chalkInstance.dim(`   ${message}... `));
}

/**
 * Print completion of progress
 */
export function printProgressComplete(success: boolean = true): void {
  if (success) {
    console.log(chalkInstance.green('✓'));
  } else {
    console.log(chalkInstance.red('✗'));
  }
}

/**
 * Print authentication-related errors with helpful suggestions
 */
export async function printAuthError(error: Error | string): Promise<void> {
  const errorMessage = error instanceof Error ? error.message : error;
  
  if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
    printError(
      'Authentication Failed',
      error,
      [
        'Your API key may be invalid or expired',
        'Run: neurcode login',
        'Verify your credentials in ~/.neurcoderc'
      ]
    );
  } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
    printError(
      'Access Denied',
      error,
      [
        'Your API key may not have the required permissions',
        'Contact your administrator to verify access',
        'Try running: neurcode logout && neurcode login'
      ]
    );
  } else if (errorMessage.includes('Network') || errorMessage.includes('fetch')) {
    printError(
      'Network Connection Failed',
      error,
      [
        'Check your internet connection',
        'Verify the API URL: neurcode doctor',
        'Check firewall/proxy settings',
        'Try again in a few moments'
      ]
    );
  } else {
    printError('Authentication Error', error);
  }
}

/**
 * Print project-related errors with helpful suggestions
 */
export function printProjectError(error: Error | string, projectId?: string): void {
  const errorMessage = error instanceof Error ? error.message : error;
  
  const nextSteps: string[] = [];
  
  if (errorMessage.includes('not found') || errorMessage.includes('404')) {
    nextSteps.push('The project may have been deleted or you don\'t have access');
    nextSteps.push('List your projects: neurcode init');
    nextSteps.push('Create a new project: neurcode init');
  } else if (!projectId) {
    nextSteps.push('No project is configured for this directory');
    nextSteps.push('Run: neurcode init');
    nextSteps.push('Or set project ID: neurcode config --project-id <id>');
  } else {
    nextSteps.push('Verify project configuration: neurcode doctor');
    nextSteps.push('Check project access: neurcode init');
  }
  
  printError('Project Error', error, nextSteps);
}

/**
 * Print a beautiful success banner
 */
export async function printSuccessBanner(title: string, subtitle?: string): Promise<void> {
  const firstName = await getUserFirstName();
  
  console.log('');
  console.log(chalkInstance.green('═══════════════════════════════════════════════════════════'));
  console.log(chalkInstance.bold.green(`   ✨ ${title}`));
  if (subtitle) {
    console.log(chalkInstance.dim(`   ${subtitle}`));
  }
  console.log(chalkInstance.green('═══════════════════════════════════════════════════════════'));
  console.log('');
}

/**
 * Print command-specific help in errors
 */
export function printCommandHelp(command: string, options?: string[]): void {
  console.log(chalkInstance.bold.white('\n   Usage:'));
  console.log(chalkInstance.dim(`   $ neurcode ${command}${options ? ' ' + options.join(' ') : ''}`));
  if (options && options.length > 0) {
    console.log(chalkInstance.dim('\n   Common options:'));
    options.forEach(opt => {
      console.log(chalkInstance.dim(`   ${opt}`));
    });
  }
  console.log('');
}

/**
 * Print waiting/progress message with spinner (simple version)
 */
export function printWaiting(message: string, showDots: boolean = true): void {
  if (showDots) {
    process.stdout.write(chalkInstance.dim(`   ${message}`));
  } else {
    console.log(chalkInstance.dim(`   ${message}`));
  }
}

/**
 * Clear waiting message
 */
export function clearWaiting(): void {
  process.stdout.write('\r');
}

/**
 * Print verification result with detailed breakdown
 */
export function printVerificationResult(
  passed: boolean,
  score?: number,
  warnings?: number,
  violations?: number
): void {
  if (passed) {
    if (score !== undefined) {
      printSuccess(
        `Verification Passed`,
        `Your code scored ${score}% and meets all governance requirements`
      );
    } else {
      printSuccess('Verification Passed', 'Your code meets all governance requirements');
    }
  } else {
    const details: string[] = [];
    if (violations !== undefined && violations > 0) {
      details.push(`${violations} violation(s) found`);
    }
    if (warnings !== undefined && warnings > 0) {
      details.push(`${warnings} warning(s) found`);
    }
    if (score !== undefined) {
      details.push(`Score: ${score}%`);
    }
    
    printError(
      'Verification Failed',
      undefined,
      details.length > 0 ? details : undefined
    );
  }
}

/**
 * Print a table-like output for structured data
 */
export function printTable(rows: string[][]): void {
  // Find max width for each column
  const maxWidths = rows[0].map((_, colIndex) => {
    return Math.max(...rows.map(row => row[colIndex]?.length || 0));
  });

  rows.forEach((row, index) => {
    const formatted = row.map((cell, colIndex) => {
      const width = maxWidths[colIndex];
      return cell.padEnd(width);
    });
    
    if (index === 0) {
      console.log(chalkInstance.bold.white(formatted.join('  ')));
    } else {
      console.log(chalkInstance.dim(formatted.join('  ')));
    }
  });
  console.log('');
}

/**
 * Print a big welcome banner (like other enterprise CLIs)
 */
export async function printWelcomeBanner(): Promise<void> {
  const userInfo = await getUserInfo();
  const userName = userInfo?.displayName || userInfo?.email || 'there';
  
  console.log('');
  console.log(chalkInstance.bold.cyan('═══════════════════════════════════════════════════════════'));
  console.log(chalkInstance.bold.cyan('                                                           '));
  console.log(chalkInstance.bold.white('              🚀  Welcome to Neurcode  🚀                 '));
  console.log(chalkInstance.bold.cyan('                                                           '));
  if (userInfo) {
    console.log(chalkInstance.dim(`                Hello, ${userName}! 👋                          `));
  }
  console.log(chalkInstance.bold.cyan('                                                           '));
  console.log(chalkInstance.bold.cyan('═══════════════════════════════════════════════════════════'));
  console.log('');
  console.log(chalkInstance.dim('   AI-powered code governance and intelligent diff analysis     '));
  console.log('');
}

