import { loadConfig, requireApiKey } from '../config';
import { ApiClient } from '../api-client';
import { getLastPlanId } from '../utils/state';
import { loadAssetMap } from './map';
import { generateToolboxSummary } from '../services/toolbox-service';

// Import chalk with fallback for plain strings if not available
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

/**
 * Display prompt in a box
 */
function displayPromptBox(prompt: string): void {
  const lines = prompt.split('\n');
  const maxWidth = Math.min(80, Math.max(...lines.map(l => l.length)) + 4);

  // Top border
  console.log(chalk.cyan('┌' + '─'.repeat(maxWidth - 2) + '┐'));

  // Content
  for (const line of lines) {
    const padding = maxWidth - line.length - 3;
    console.log(chalk.cyan('│ ') + chalk.white(line) + ' '.repeat(Math.max(0, padding)) + chalk.cyan(' │'));
  }

  // Bottom border
  console.log(chalk.cyan('└' + '─'.repeat(maxWidth - 2) + '┘'));
}

/**
 * Copy to clipboard using native OS commands
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    const { execSync } = await import('child_process');
    const platform = process.platform;

    if (platform === 'darwin') {
      // macOS
      execSync('pbcopy', { input: text });
      return true;
    } else if (platform === 'linux') {
      // Linux - try xclip first, then xsel
      try {
        execSync('xclip -selection clipboard', { input: text });
        return true;
      } catch {
        try {
          execSync('xsel --clipboard --input', { input: text });
          return true;
        } catch {
          return false;
        }
      }
    } else if (platform === 'win32') {
      // Windows
      const { exec } = await import('child_process');
      return new Promise((resolve) => {
        const proc = exec('clip', (error) => {
          resolve(!error);
        });
        if (proc.stdin) {
          proc.stdin.write(text);
          proc.stdin.end();
        } else {
          resolve(false);
        }
      });
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Prompt command: Generate Cursor prompt from a plan
 * If planId is not provided, uses the last plan ID from state
 */
export async function promptCommand(planId?: string) {
  try {
    // Auto-detect planId from state if not provided
    let finalPlanId = planId?.trim();
    
    if (!finalPlanId) {
      const lastPlanId = getLastPlanId();
      if (lastPlanId) {
        finalPlanId = lastPlanId;
        console.log(chalk.dim(`📋 Using last plan ID: ${finalPlanId.substring(0, 8)}...`));
      } else {
        console.error(chalk.red('❌ Error: Plan ID is required'));
        console.log(chalk.dim('Usage: neurcode prompt [plan-id]'));
        console.log(chalk.dim('\nIf no plan-id is provided, it will use the last plan from "neurcode plan"'));
        console.log(chalk.dim('Or run "neurcode plan" first to create a plan.'));
        process.exit(1);
      }
    }
    
    if (!finalPlanId) {
      console.error(chalk.red('❌ Error: Plan ID is required'));
      console.log(chalk.dim('Usage: neurcode prompt [plan-id]'));
      process.exit(1);
    }

    // Load configuration
    const config = loadConfig();
    
    // Require API key
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    // Initialize API client
    const client = new ApiClient(config);

    console.log(chalk.dim(`📋 Fetching plan ${finalPlanId}...`));

    // Fetch the prompt and intent from API
    const { prompt: apiPrompt, intent } = await client.getPlanPrompt(finalPlanId);

    // Clean apiPrompt: Remove any existing "Available Tools" section to avoid duplication
    // The apiPrompt may contain an old toolbox summary from when the plan was originally generated
    // Use regex to strip ANY existing "Available Tools" block
    const toolsBlockRegex = /=== Available Tools[\s\S]*?=== END Available Tools ===/g;
    let cleanedPrompt = apiPrompt.replace(toolsBlockRegex, '');

    // Try to load asset map and append toolbox summary if available
    let finalPrompt = cleanedPrompt;
    try {
      const cwd = process.cwd();
      const map = loadAssetMap(cwd);
      if (map && map.globalExports.length > 0) {
        const toolboxSummary = generateToolboxSummary(map, intent);
        if (toolboxSummary) {
          finalPrompt += toolboxSummary;
        }
      }
    } catch (error) {
      // Silently fail - toolbox summary is optional
      if (process.env.DEBUG) {
        console.warn(chalk.yellow(`⚠️  Could not load asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }

    // Display the prompt in a box
    console.log('\n');
    displayPromptBox(finalPrompt);
    console.log('');

    // Try to copy to clipboard
    const copied = await copyToClipboard(finalPrompt);
    
    if (copied) {
      console.log(chalk.green('✅ Plan converted to Cursor Prompt! Paste it into your AI editor to execute.'));
      console.log(chalk.green('📋 Prompt copied to clipboard automatically.'));
    } else {
      console.log(chalk.green('✅ Plan converted to Cursor Prompt! Paste it into your AI editor to execute.'));
      console.log(chalk.yellow('⚠️  Could not copy to clipboard automatically. Please manually copy the prompt above.'));
    }

    console.log('');
  } catch (error) {
    console.error(chalk.red('\n❌ Error generating prompt:'));
    
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
      
      if (error.message.includes('404') || error.message.includes('not found')) {
        console.log(chalk.dim('\n💡 Make sure:'));
        console.log(chalk.dim('  • The plan ID is correct'));
        console.log(chalk.dim('  • You have access to this plan'));
      } else if (error.message.includes('API request failed')) {
        console.log(chalk.dim('\n💡 Make sure:'));
        console.log(chalk.dim('  • Your API key is valid'));
        console.log(chalk.dim('  • The API URL is correct'));
        console.log(chalk.dim('  • You have network connectivity'));
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

