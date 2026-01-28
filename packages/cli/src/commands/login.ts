/**
 * Login Command
 * 
 * Implements device flow authentication for CLI.
 * User runs `neurcode login` → Opens browser → Approves → CLI saves API key globally
 */

import { loadConfig, saveGlobalAuth, getApiKey, DEFAULT_API_URL } from '../config';
import { ApiClient } from '../api-client';
import { getUserInfo, clearUserCache } from '../utils/user-context';
import { 
  printSuccessBanner, 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSection,
  printStep,
  printWaiting,
  printAuthError
} from '../utils/messages';

const POLL_INTERVAL = 3000; // 3 seconds
const MAX_POLL_ATTEMPTS = 100; // 5 minutes total (100 * 3s)

export async function loginCommand() {
  try {
    const config = loadConfig();
    const apiUrl = config.apiUrl || DEFAULT_API_URL;

    // Check if user is already logged in
    const existingApiKey = getApiKey();
    if (existingApiKey) {
      try {
        // Validate the existing API key by fetching user info
        const client = new ApiClient(config);
        const user = await client.getCurrentUser();
        const userInfo = await getUserInfo();
        
        await printSuccessBanner(
          'Already Authenticated',
          `Welcome back, ${userInfo?.displayName || user.email}!`
        );
        
        printSuccess(
          `You're logged in as ${userInfo?.displayName || user.email}`,
          `Account: ${user.email}\n   API Key: ${existingApiKey.substring(0, 20)}...\n   To log out: neurcode logout`
        );
        return;
      } catch (error) {
        // API key is invalid or expired, proceed with login
        clearUserCache(); // Clear stale cache
        printWarning(
          'Existing session expired',
          'Your previous API key is no longer valid. Let\'s set up a fresh authentication.'
        );
      }
    }

    await printSuccessBanner('Neurcode CLI Authentication');
    printInfo('We\'ll open your browser to securely authenticate your account.');

    // Step 1: Initialize device flow
    const initUrl = `${apiUrl}/cli/auth/init`;
    let initResponse: Response;
    
    try {
      initResponse = await fetch(initUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Fastify requires a body when Content-Type is application/json
      });
    } catch (error) {
      await printAuthError(error as Error);
      process.exit(1);
    }

    if (!initResponse.ok) {
      const errorText = await initResponse.text();
      await printAuthError(new Error(`Failed to initialize authentication: ${errorText}`));
      process.exit(1);
    }

    const initData = await initResponse.json() as {
      deviceCode: string;
      userCode: string;
      verificationUrl: string;
      expiresIn: number;
    };
    const { deviceCode, userCode, verificationUrl, expiresIn } = initData;

    // Step 2: Open browser automatically (normal window, not incognito)
    printInfo('Opening your browser for authentication...');
    
    printWaiting('Waiting for your approval', false);

    const openInBrowser = async () => {
      const platform = process.platform;
      const preferred = process.env.NEURCODE_LOGIN_BROWSER?.toLowerCase();
      const termProgram = (process.env.TERM_PROGRAM ?? '').toLowerCase();

      // Use 'open' package when possible. On macOS, opening in a specific app
      // avoids Cursor/VS Code's built-in handler or a default that uses incognito.
      try {
        const open = (await import('open')).default;
        const opts: { app?: { name: string } } = {};
        if (platform === 'darwin') {
          if (preferred === 'safari') opts.app = { name: 'Safari' };
          else if (preferred === 'chrome') opts.app = { name: 'Google Chrome' };
          else if (preferred === 'firefox') opts.app = { name: 'Firefox' };
          else if (preferred === 'edge') opts.app = { name: 'Microsoft Edge' };
          else if (!preferred && (termProgram === 'cursor' || termProgram === 'vscode')) {
            opts.app = { name: 'Safari' };
          }
        }
        await open(verificationUrl, opts);
        return;
      } catch {
        // fallback to system open
      }

      const { exec } = await import('child_process');
      let command: string;
      if (platform === 'darwin') {
        command = `open "${verificationUrl}"`;
      } else if (platform === 'win32') {
        command = `start "" "${verificationUrl}"`;
      } else {
        command = `xdg-open "${verificationUrl}"`;
      }
      await new Promise<void>((resolve, reject) => {
        exec(command, (error) => {
          if (error) reject(error);
          else resolve();
        });
      });
    };

    const fallbackMessage = `Please open this URL in your browser:\n   ${verificationUrl}\n\n   Then enter this code: ${userCode}${process.platform === 'darwin' ? '\n\n   If it opened in a private/incognito window, run: NEURCODE_LOGIN_BROWSER=Safari neurcode login' : ''}`;

    try {
      await openInBrowser();
    } catch {
      printWarning('Could not open browser automatically', fallbackMessage);
    }

    // Step 3: Poll for approval
    let pollAttempts = 0;
    let approved = false;

    while (pollAttempts < MAX_POLL_ATTEMPTS && !approved) {
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL));

      const pollUrl = `${apiUrl}/cli/auth/poll`;
      let pollResponse: Response;
      
      try {
        pollResponse = await fetch(pollUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ deviceCode }),
        });
      } catch (error) {
        console.error(`\n🔍 [DEBUG] Fetch failed for URL: ${pollUrl}`);
        console.error(`🔍 [DEBUG] API Base URL: ${apiUrl}`);
        console.error(`🔍 [DEBUG] Error: ${error instanceof Error ? error.message : String(error)}`);
        throw error;
      }

      if (!pollResponse.ok) {
        throw new Error(`Polling failed: ${pollResponse.statusText}`);
      }

      const pollData = await pollResponse.json() as {
        status: 'pending' | 'approved' | 'denied' | 'expired';
        apiKey?: string;
      };

      if (pollData.status === 'approved') {
        if (pollData.apiKey) {
          // Save API key to global config
          saveGlobalAuth(pollData.apiKey, apiUrl);
          
          // Get user info for personalized message
          const userInfo = await getUserInfo();
          const userName = userInfo?.displayName || userInfo?.email || 'there';
          
          await printSuccessBanner(
            'Authentication Successful!',
            `Welcome to Neurcode, ${userName}!`
          );
          
          printSuccess(
            'Your CLI is now authenticated',
            `API key saved securely to ~/.neurcoderc\n   You're all set to use Neurcode commands!`
          );
          
          printInfo(
            'Getting started',
            'Try running: neurcode init  (to set up your first project)'
          );
          
          approved = true;
        } else {
          printWarning(
            'Authentication approved but API key unavailable',
            'Please check your API keys or try logging in again'
          );
          approved = true;
        }
      } else if (pollData.status === 'denied') {
        printError(
          'Authentication Denied',
          undefined,
          [
            'The authentication request was denied in your browser',
            'If this was unintentional, please try: neurcode login',
            'Contact support if you continue experiencing issues'
          ]
        );
        process.exit(1);
      } else if (pollData.status === 'expired') {
        printError(
          'Authentication Request Expired',
          undefined,
          [
            'The authentication request has timed out',
            'Please try again: neurcode login',
            'Make sure to complete authentication within 5 minutes'
          ]
        );
        process.exit(1);
      } else {
        // pending - continue polling
        process.stdout.write('.');
        pollAttempts++;
      }
    }

    if (!approved) {
      printError(
        'Authentication Timed Out',
        undefined,
        [
          'The authentication process took too long',
          'Please try again: neurcode login',
          'Make sure to complete the browser authentication promptly',
          'Check your internet connection if issues persist'
        ]
      );
      process.exit(1);
    }
  } catch (error) {
    await printAuthError(error as Error);
    process.exit(1);
  }
}

