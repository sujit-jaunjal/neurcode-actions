/**
 * Init Command - Magic Init
 * 
 * Zero-friction project initialization with auto-discovery and context menu.
 * 
 * Flow:
 * 1. Auto-detect directory name
 * 2. Check .neurcode/config.json
 * 3. If missing: Check API for existing project, create if not found
 * 4. If present: Show context menu (Start Session, View History)
 */

import { basename } from 'path';
import { loadConfig, requireApiKey, DEFAULT_API_URL } from '../config';
import { ApiClient } from '../api-client';
import { loadState, saveState, getProjectId, setProjectId } from '../utils/state';
import * as readline from 'readline';
import { 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSection,
  printSuccessBanner,
  printStep,
  printAuthError,
  printProjectError
} from '../utils/messages';
import { endSessionCommand } from './session';

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

interface Project {
  id: string;
  name: string;
  slug: string;
  git_url: string | null;
}

interface Session {
  id: string;
  sessionId: string;
  title: string | null;
  intentDescription: string | null;
  status: string;
  createdAt: string;
}

/**
 * Get user input from terminal
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
 * Display context menu and get user choice
 */
async function showContextMenu(project: Project, sessions: Session[]): Promise<'new-session' | 'history' | 'manage-sessions' | 'exit'> {
  console.log(chalk.bold.cyan(`\n📁 Project: ${project.name}`));
  console.log(chalk.dim(`   ID: ${project.id}\n`));

  console.log(chalk.bold.white('What would you like to do?\n'));

      const activeCount = sessions.filter(s => s.status === 'active').length;
      const options = [
    { key: '1', label: '🚀 Start New Session (Plan)', value: 'new-session' },
    { key: '2', label: '📜 View Session History', value: 'history' },
    { key: '3', label: activeCount > 0 ? `🔚 End Active Session${activeCount > 1 ? 's' : ''} (${activeCount})` : 'ℹ️  Session Management', value: 'manage-sessions' },
    { key: '4', label: '❌ Exit', value: 'exit' },
  ];

  options.forEach(opt => {
    console.log(chalk.cyan(`  ${opt.key}.`), chalk.white(opt.label));
  });
  console.log('');

  const maxOption = options.length;
  const answer = await promptUser(chalk.bold(`Select option (1-${maxOption}): `));

  switch (answer) {
    case '1':
      return 'new-session';
    case '2':
      return 'history';
    case '3':
      return 'manage-sessions';
    case '4':
    default:
      return 'exit';
  }
}

/**
 * Display session history menu
 */
async function showHistoryMenu(sessions: Session[]): Promise<string | null> {
  if (sessions.length === 0) {
    console.log(chalk.yellow('\n📜 No sessions found for this project.\n'));
    return null;
  }

  console.log(chalk.bold.white('\n📜 Session History (Last 5)\n'));

  const options = sessions.map((session, index) => {
    const emoji = session.status === 'active' ? '⚡' : session.status === 'completed' ? '✅' : '📝';
    const title = session.title || session.intentDescription || 'Untitled Session';
    const status = session.status === 'active' ? chalk.green('Active') : 
                   session.status === 'completed' ? chalk.dim('Completed') : 
                   chalk.yellow(session.status);
    return {
      key: (index + 1).toString(),
      session,
      label: `${emoji} ${title} (${status})`,
    };
  });

  options.forEach(opt => {
    console.log(chalk.cyan(`  ${opt.key}.`), chalk.white(opt.label));
  });

  console.log(chalk.cyan(`  ${options.length + 1}.`), chalk.white('➕ Create New Session'));
  console.log(chalk.cyan(`  ${options.length + 2}.`), chalk.white('🔙 Back'));
  console.log('');

  const answer = await promptUser(chalk.bold(`Select session (1-${options.length + 2}): `));
  const choice = parseInt(answer, 10);

  if (choice >= 1 && choice <= options.length) {
    return options[choice - 1].session.sessionId;
  } else if (choice === options.length + 1) {
    return 'new-session';
  } else {
    return null; // Back
  }
}

export async function initCommand() {
  try {
    const config = loadConfig();
    const apiKey = requireApiKey();
    const apiUrl = config.apiUrl || DEFAULT_API_URL;

    await printSuccessBanner(
      'Neurcode Project Initialization',
      'Setting up your project for code governance'
    );

    // Step 1: Auto-detect directory name
    const cwd = process.cwd();
    const dirName = basename(cwd);
    printInfo('Detected Directory', `Working in: ${dirName}`);

    // Step 2: Check local state
    const state = loadState();
    let existingProjectId = getProjectId() || state.projectId;

    // Initialize API client
    const client = new ApiClient({ ...config, apiKey });

    let project: Project | null = null;

    if (existingProjectId) {
      // Project already linked
      printSuccess('Project Already Initialized', 'Checking project status...');
      
      // Fetch project details
      try {
        const projects = await client.getProjects();
        project = projects.find(p => p.id === existingProjectId) || null;
        
        if (!project) {
          printWarning(
            'Project Not Found',
            `Project ID ${existingProjectId} no longer exists. We'll help you set up a new one.`
          );
          // Clear invalid project ID
          saveState({ projectId: undefined });
          // Clear the local variable to allow fallthrough to project creation
          existingProjectId = undefined;
        } else {
          printSuccess('Project Verified', `Connected to: ${project.name}`);
        }
      } catch (error) {
        printWarning(
          'Could Not Verify Project',
          'Continuing with initialization. If issues persist, run: neurcode doctor'
        );
      }
    }

    // Step 3: Auto-discovery if no project linked
    // After resetting invalid projectId, this condition will now pass and continue to project creation
    if (!project && !existingProjectId) {
      printSection('Project Discovery');
      printInfo('Searching for existing project', `Looking for project matching "${dirName}"...`);

      // Check if project exists by name
      try {
        const existingProject = await client.getProjectByName(dirName);

        if (existingProject) {
          // Project exists - ask to link
          printSuccess('Existing Project Found', `Found: ${existingProject.name}`);
          const answer = await promptUser(chalk.bold(`\n   Link this directory to "${existingProject.name}"? (y/n): `));
          
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            project = existingProject;
            setProjectId(project.id);
            await printSuccessBanner(
              'Project Linked Successfully',
              `This directory is now connected to "${project.name}"`
            );
          } else {
            printInfo('Initialization Cancelled', 'Run "neurcode init" again when you\'re ready to link a project.');
            process.exit(0);
          }
        } else {
          // Project doesn't exist - create it
          printInfo('No Existing Project Found', `No project named "${dirName}" was found.`);
          const answer = await promptUser(chalk.bold(`\n   Create new project "${dirName}"? (y/n): `));
          
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            // Create project (using connect endpoint with empty gitUrl)
            try {
              printInfo('Creating Project', 'Setting up your new project...');
              const newProject = await client.ensureProject('', dirName);
              
              project = {
                id: newProject.id,
                name: newProject.name,
                slug: dirName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
                git_url: null,
              };
              
              setProjectId(project.id);
              await printSuccessBanner(
                'Project Created Successfully',
                `Your new project "${project.name}" is ready to use!`
              );
            } catch (error) {
              printProjectError(error as Error, project?.id);
              process.exit(1);
            }
          } else {
            printInfo('Initialization Cancelled', 'Run "neurcode init" again when you\'re ready to create a project.');
            process.exit(0);
          }
        }
      } catch (error) {
        printProjectError(error as Error);
        process.exit(1);
      }
    }

    if (!project) {
      printError(
        'No Project Available',
        undefined,
        [
          'Unable to determine which project to use',
          'Try running: neurcode init',
          'Or manually set project ID: neurcode config --project-id <id>'
        ]
      );
      process.exit(1);
    }

    // Step 4: Check for active sessions and prompt to end them
    try {
      const allSessions = await client.getSessions(project.id, 20);
      const activeSessions = allSessions.filter(s => s.status === 'active');
      
      if (activeSessions.length > 0) {
        printSection('Active Sessions Detected');
        printWarning(
          `You have ${activeSessions.length} active session(s)`,
          'Consider ending completed sessions to keep your workspace organized'
        );
        
        // Show active sessions
        activeSessions.forEach((session, index) => {
          const title = session.title || session.intentDescription || 'Untitled';
          console.log(chalk.cyan(`  ${index + 1}.`), chalk.white(title));
          console.log(chalk.dim(`     ${session.sessionId.substring(0, 20)}...`));
        });
        console.log('');

        const answer = await promptUser(chalk.bold('Would you like to end any active sessions? (y/n): '));
        
        if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
          printInfo('Session Management', 'Run "neurcode session end" to end a session');
          console.log('');
        }
      }
    } catch (error) {
      // Non-critical - continue if we can't fetch sessions
      if (process.env.DEBUG) {
        printWarning('Could not check active sessions', 'Continuing...');
      }
    }

    // Step 5: Context Menu
    printSection('What would you like to do?');
    let done = false;
    while (!done) {
      // Fetch recent sessions
      let sessions: Session[] = [];
      try {
        sessions = await client.getSessions(project.id, 5);
      } catch (error) {
        // If fetching sessions fails, continue without history
        if (process.env.DEBUG) {
          printWarning('Could not fetch sessions', 'Continuing without session history');
        }
      }

      const choice = await showContextMenu(project, sessions);

      switch (choice) {
        case 'new-session': {
          printSuccess('Ready to Start', 'You can now create a new session!');
          printInfo('Next Steps', 'Run: neurcode plan "<your intent>"\n   Example: neurcode plan "Add user authentication"');
          done = true;
          break;
        }
        case 'history': {
          const sessionChoice = await showHistoryMenu(sessions);
          if (sessionChoice === 'new-session') {
            printSuccess('Ready to Start', 'You can now create a new session!');
            printInfo('Next Steps', 'Run: neurcode plan "<your intent>"');
            done = true;
          } else if (sessionChoice) {
            printSuccess('Session Selected', `Session ID: ${sessionChoice}`);
            printInfo('Usage', 'Use this session ID with neurcode commands that support --session-id');
            done = true;
          }
          // If sessionChoice is null (back), continue loop
          break;
        }
        case 'manage-sessions': {
          printInfo('Session Management', 'You can manage sessions using these commands:');
          console.log(chalk.dim('   • neurcode session list    - List all sessions'));
          console.log(chalk.dim('   • neurcode session end     - End the current or a specific session'));
          console.log(chalk.dim('   • neurcode session status  - Show status of current session'));
          console.log('');
          
          const answer = await promptUser(chalk.bold('Would you like to end a session now? (y/n): '));
          if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
            await endSessionCommand({ projectId: project.id });
            // After ending, refresh and show menu again
            continue;
          }
          break;
        }
        case 'exit':
          printInfo('Goodbye', 'Thanks for using Neurcode!');
          done = true;
          break;
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Authentication') || error.message.includes('401') || error.message.includes('403')) {
        await printAuthError(error);
      } else {
        printError(
          'Initialization Failed',
          error,
          [
            'Check your internet connection',
            'Verify authentication: neurcode doctor',
            'Try again: neurcode init'
          ]
        );
      }
    } else {
      printError('Initialization Failed', String(error));
    }
    process.exit(1);
  }
}
