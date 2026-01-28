/**
 * Session Management Command
 * 
 * Manages AI coding sessions - list, end, and view session status.
 * 
 * Commands:
 * - neurcode session list    - List all sessions
 * - neurcode session end     - End the current or specified session
 * - neurcode session status  - Show status of current session
 */

import { loadConfig, requireApiKey } from '../config';
import { ApiClient } from '../api-client';
import { getSessionId } from '../utils/state';
import { 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSection,
  printSuccessBanner,
  printTable,
  printAuthError,
  printProjectError,
  getUserFirstName
} from '../utils/messages';
import * as readline from 'readline';

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
    blue: (str: string) => str,
  };
}

interface SessionCommandOptions {
  sessionId?: string;
  projectId?: string;
  all?: boolean;
}

/**
 * Prompt user for input
 */
function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * List all sessions
 */
export async function listSessionsCommand(options: SessionCommandOptions) {
  try {
    const config = loadConfig();
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    const client = new ApiClient(config);
    const projectId = options.projectId || config.projectId;

    printSection('Session History');
    printInfo('Fetching sessions', projectId ? `Project: ${projectId}` : 'All projects');

    const sessions = await client.getSessions(projectId, options.all ? 100 : 20);

    if (sessions.length === 0) {
      printInfo('No Sessions Found', 'You haven\'t created any sessions yet.\n   Start one with: neurcode plan "<your intent>"');
      return;
    }

    // Group sessions by status
    const activeSessions = sessions.filter(s => s.status === 'active');
    const completedSessions = sessions.filter(s => s.status === 'completed');
    const cancelledSessions = sessions.filter(s => s.status === 'cancelled');

    if (activeSessions.length > 0) {
      printSection('Active Sessions');
      const tableRows = [
        ['Session ID', 'Title/Intent', 'Created', 'Files Changed']
      ];

      for (const session of activeSessions) {
        const title = session.title || session.intentDescription || 'Untitled';
        const shortId = session.sessionId.substring(0, 16) + '...';
        const created = new Date(session.createdAt).toLocaleDateString();
        tableRows.push([
          shortId,
          title.length > 40 ? title.substring(0, 40) + '...' : title,
          created,
          '—' // Files changed would need additional API call
        ]);
      }

      printTable(tableRows);
    }

    if (completedSessions.length > 0) {
      printSection('Completed Sessions');
      console.log(chalk.dim(`   ${completedSessions.length} completed session(s)`));
      if (!options.all && completedSessions.length > 5) {
        console.log(chalk.dim('   (Showing most recent. Use --all to see all)'));
      }
      console.log('');
    }

    if (cancelledSessions.length > 0) {
      printSection('Cancelled Sessions');
      console.log(chalk.dim(`   ${cancelledSessions.length} cancelled session(s)`));
      console.log('');
    }

    printInfo(
      'Session Management',
      [
        `Active: ${activeSessions.length} | Completed: ${completedSessions.length} | Cancelled: ${cancelledSessions.length}`,
        'End a session: neurcode session end [session-id]',
        'View session details: neurcode session status [session-id]'
      ].join('\n   • ')
    );

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        await printAuthError(error);
      } else if (error.message.includes('project') || error.message.includes('404')) {
        printProjectError(error, options.projectId);
      } else {
        printError('Failed to List Sessions', error);
      }
    } else {
      printError('Failed to List Sessions', String(error));
    }
    process.exit(1);
  }
}

/**
 * End a session
 */
export async function endSessionCommand(options: SessionCommandOptions) {
  try {
    const config = loadConfig();
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    const client = new ApiClient(config);
    let sessionId = options.sessionId;

    // If no session ID provided, try to get from state
    if (!sessionId) {
      const stateSessionId = getSessionId();
      sessionId = stateSessionId || undefined;
      
      if (!sessionId) {
        // List active sessions and let user choose
        printInfo('No Active Session', 'Looking for active sessions...');
        const sessions = await client.getSessions(config.projectId, 10);
        const activeSessions = sessions.filter(s => s.status === 'active');

        if (activeSessions.length === 0) {
          printInfo('No Active Sessions', 'There are no active sessions to end.');
          return;
        }

        if (activeSessions.length === 1) {
          sessionId = activeSessions[0].sessionId;
          const title = activeSessions[0].title || activeSessions[0].intentDescription || 'Untitled';
          printInfo('Found Active Session', `Ending: ${title}`);
        } else {
          // Multiple active sessions - let user choose
          printSection('Multiple Active Sessions');
          activeSessions.forEach((session, index) => {
            const title = session.title || session.intentDescription || 'Untitled';
            console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(title));
            console.log(chalk.dim(`     ${session.sessionId.substring(0, 20)}...`));
          });
          console.log('');

          const answer = await promptUser(chalk.bold('Select session to end (1-' + activeSessions.length + '): '));
          const choice = parseInt(answer, 10);

          if (choice >= 1 && choice <= activeSessions.length) {
            sessionId = activeSessions[choice - 1].sessionId;
          } else {
            printError('Invalid Selection', undefined, ['Please run the command again and select a valid number']);
            process.exit(1);
          }
        }
      }
    }

    if (!sessionId) {
      printError(
        'No Session Specified',
        undefined,
        [
          'No session ID provided and no active session found',
          'Usage: neurcode session end [session-id]',
          'Or set a session: neurcode init'
        ]
      );
      process.exit(1);
    }

    // Get session details first
    try {
      const sessionData = await client.getSession(sessionId);
      const session = sessionData.session;
      
      if (session.status === 'completed') {
        printWarning('Session Already Completed', `Session "${(session as any).title || session.intentDescription || sessionId}" is already ended.`);
        return;
      }

      if (session.status === 'cancelled') {
        printWarning('Session Already Cancelled', `Session "${(session as any).title || session.intentDescription || sessionId}" was already cancelled.`);
        return;
      }

      // Show session summary
      const title = (session as any).title || session.intentDescription || 'Untitled Session';
      const filesCount = sessionData.files?.length || 0;
      
      printSection('Session Summary');
      console.log(chalk.white(`   Title: ${title}`));
      console.log(chalk.white(`   Files Changed: ${filesCount}`));
      console.log(chalk.dim(`   Session ID: ${sessionId}`));
      console.log('');

      // Confirm before ending
      const confirm = await promptUser(chalk.bold('End this session? (y/n): '));
      
      if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
        printInfo('Cancelled', 'Session was not ended.');
        return;
      }

      await client.endSession(sessionId);
      
      // Clear session ID from local state if it matches the ended session
      try {
        const currentSessionId = getSessionId();
        if (currentSessionId === sessionId) {
          const { clearSessionId } = await import('../utils/state');
          clearSessionId();
        }
      } catch {
        // Non-critical - continue if state clearing fails
      }
      
      const firstName = await getUserFirstName();
      await printSuccessBanner(
        'Session Completed',
        `Great work, ${firstName}! Your session has been marked as complete.`
      );

      printSuccess(
        'Session Ended Successfully',
        `"${title}" is now marked as completed.\n   View in dashboard: dashboard.neurcode.com`
      );

      // Display Session ROI Summary
      try {
        // Fetch ROI summary from API
        const apiUrl = config.apiUrl || process.env.NEURCODE_API_URL || 'https://api.neurcode.ai';
        const roiUrl = `${apiUrl}/api/v1/roi/summary?timeRange=7d`;
        
        const roiResponse = await fetch(roiUrl, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
        }).catch(() => null);

        if (roiResponse && roiResponse.ok) {
          const roiData = await roiResponse.json().catch(() => null) as { totalCapitalSaved?: number | string } | null;
          if (roiData && roiData.totalCapitalSaved) {
            const capitalSaved = typeof roiData.totalCapitalSaved === 'string' 
              ? parseFloat(roiData.totalCapitalSaved) 
              : roiData.totalCapitalSaved;
            const formattedAmount = capitalSaved.toFixed(2);
            const dashboardUrl = 'https://dashboard.neurcode.ai/roi';
            
            console.log('');
            console.log(chalk.cyan('📊'), chalk.bold.white('Current Session ROI:'), chalk.green.bold(`+$${formattedAmount}`));
            console.log(chalk.dim(`   View full report: ${dashboardUrl}`));
            console.log('');
          }
        }
      } catch {
        // Silently fail - ROI summary is a nice-to-have
      }

    } catch (error: any) {
      if (error.message?.includes('not found') || error.message?.includes('404')) {
        printError(
          'Session Not Found',
          error,
          [
            `Session "${sessionId}" could not be found`,
            'List your sessions: neurcode session list',
            'Verify the session ID is correct'
          ]
        );
      } else {
        throw error;
      }
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        await printAuthError(error);
      } else {
        printError('Failed to End Session', error);
      }
    } else {
      printError('Failed to End Session', String(error));
    }
    process.exit(1);
  }
}

/**
 * Show session status
 */
export async function sessionStatusCommand(options: SessionCommandOptions) {
  try {
    const config = loadConfig();
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    const client = new ApiClient(config);
    let sessionId = options.sessionId || getSessionId();

    if (!sessionId) {
      printError(
        'No Session Found',
        undefined,
        [
          'No active session in this directory',
          'Start a session: neurcode plan "<your intent>"',
          'Or specify a session: neurcode session status <session-id>'
        ]
      );
      process.exit(1);
    }

    const sessionData = await client.getSession(sessionId);
    const session = sessionData.session;

    await printSuccessBanner('Session Status');

    printSection('Session Details');
    console.log(chalk.white(`   Title: ${(session as any).title || session.intentDescription || 'Untitled'}`));
    console.log(chalk.white(`   Status: ${session.status === 'active' ? chalk.green('Active') : session.status === 'completed' ? chalk.dim('Completed') : chalk.yellow('Cancelled')}`));
    console.log(chalk.white(`   Created: ${new Date(session.createdAt).toLocaleString()}`));
    if (session.endedAt) {
      console.log(chalk.white(`   Ended: ${new Date(session.endedAt).toLocaleString()}`));
    }
    console.log(chalk.white(`   Files Changed: ${sessionData.files?.length || 0}`));
    console.log(chalk.dim(`   Session ID: ${sessionId}`));
    console.log('');

    if (session.status === 'active') {
      printInfo(
        'Active Session',
        [
          'This session is currently active',
          'End it with: neurcode session end',
          'Or continue working and end it when done'
        ].join('\n   • ')
      );
    }

  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('403')) {
        await printAuthError(error);
      } else if (error.message.includes('not found') || error.message.includes('404')) {
        printError(
          'Session Not Found',
          error,
          [
            `Session "${options.sessionId || 'unknown'}" could not be found`,
            'List your sessions: neurcode session list',
            'Start a new session: neurcode plan "<your intent>"'
          ]
        );
      } else {
        printError('Failed to Get Session Status', error);
      }
    } else {
      printError('Failed to Get Session Status', String(error));
    }
    process.exit(1);
  }
}

