/**
 * Doctor Command - Health Check & Connectivity Diagnostics
 * 
 * Verifies API connectivity and reports system configuration
 */

import { loadConfig, getApiKey, DEFAULT_API_URL } from '../config';
import { ApiClient } from '../api-client';
import chalk from 'chalk';
import { 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSection,
  printSuccessBanner,
  getUserInfo
} from '../utils/messages';

export async function doctorCommand() {
  const userInfo = await getUserInfo();
  const greeting = userInfo ? `, ${userInfo.displayName}` : '';
  
  await printSuccessBanner(
    'Neurcode CLI Health Check',
    `Running diagnostics${greeting}...`
  );

  let allChecksPassed = true;

  // Check 1: Configuration
  console.log(chalk.bold.white('📋 Configuration Check:'));
  const config = loadConfig();
  const apiUrl = config.apiUrl || DEFAULT_API_URL;
  const apiKey = getApiKey();

  console.log(chalk.dim(`   API URL: ${apiUrl}`));
  console.log(chalk.dim(`   API Key: ${apiKey ? '✅ Set' : '❌ Not set'}`));
  console.log(chalk.dim(`   Default URL: ${DEFAULT_API_URL}`));
  
  if (process.env.NEURCODE_API_URL) {
    console.log(chalk.dim(`   Env Var NEURCODE_API_URL: ${process.env.NEURCODE_API_URL}`));
  }
  console.log('');

  // Check 2: API Connectivity
  console.log(chalk.bold.white('🌐 Connectivity Check:'));
  try {
    const healthUrl = `${apiUrl}/health`;
    console.log(chalk.dim(`   Testing: ${healthUrl}`));

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch(healthUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'User-Agent': 'neurcode-cli-doctor',
        },
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json().catch(() => ({})) as { status?: string; version?: string };
        console.log(chalk.green('   ✅ API is reachable'));
        
        if (data.status) {
          console.log(chalk.dim(`   Status: ${data.status}`));
        }
        if (data.version) {
          console.log(chalk.dim(`   Version: ${data.version}`));
        }
      } else {
        console.log(chalk.yellow(`   ⚠️  API responded with status ${response.status}`));
        console.log(chalk.dim(`   This may indicate a server error`));
        allChecksPassed = false;
      }
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(chalk.red('   ❌ Connection timeout (5s)'));
        console.log(chalk.dim('   The API may be unreachable or very slow'));
      } else {
        console.log(chalk.red('   ❌ Connection failed'));
        console.error(chalk.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
      }
      
      console.error(chalk.dim(`\n   🔍 [DEBUG] Attempted URL: ${healthUrl}`));
      console.error(chalk.dim(`   🔍 [DEBUG] Base API URL: ${apiUrl}`));
      
      allChecksPassed = false;
    }
  } catch (error) {
    console.log(chalk.red('   ❌ Health check failed'));
    console.error(chalk.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
    allChecksPassed = false;
  }

  console.log('');

  // Check 3: Authenticated Endpoint (if API key is available)
  if (apiKey) {
    console.log(chalk.bold.white('🔐 Authentication Check:'));
    try {
      const client = new ApiClient(config);
      
      // Try a simple authenticated request
      console.log(chalk.dim('   Testing authenticated endpoint...'));
      
      // Try to get projects list (lightweight endpoint)
      const projects = await client.getProjects();
      console.log(chalk.green('   ✅ Authentication successful'));
      console.log(chalk.dim(`   Found ${projects.length} project(s)`));
    } catch (error) {
      console.log(chalk.red('   ❌ Authentication failed'));
      console.error(chalk.dim(`   Error: ${error instanceof Error ? error.message : String(error)}`));
      
      if (error instanceof Error && error.message.includes('401')) {
        console.log(chalk.yellow('\n   💡 Your API key may be invalid. Run: neurcode login'));
      } else if (error instanceof Error && error.message.includes('403')) {
        console.log(chalk.yellow('\n   💡 Your API key may not have proper permissions.'));
      }
      
      allChecksPassed = false;
    }
    console.log('');
  } else {
    console.log(chalk.bold.white('🔐 Authentication Check:'));
    console.log(chalk.yellow('   ⚠️  Skipped (no API key found)'));
    console.log(chalk.dim('   Run: neurcode login'));
    console.log('');
    allChecksPassed = false;
  }

  // Summary
  if (allChecksPassed) {
    await printSuccessBanner(
      'All Checks Passed!',
      'Your Neurcode CLI is configured correctly and ready to use'
    );
  } else {
    printSection('Summary');
    printWarning(
      'Some Checks Failed',
      'Please review the issues above and follow the suggestions'
    );
    
    printInfo(
      'Troubleshooting Tips',
      [
        'If API is unreachable, check your internet connection',
        'Verify the API URL is correct (should be https://api.neurcode.com)',
        'Run: neurcode login (to authenticate)',
        'Set NEURCODE_API_URL env var to override default URL',
        'Check firewall/proxy settings if connection issues persist'
      ].join('\n   • ')
    );
  }
}

