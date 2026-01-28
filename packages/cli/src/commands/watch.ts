import { Sentinel } from '../services/watch/Sentinel';
import { CommandPoller } from '../services/watch/CommandPoller';
import { loadState, getProjectId } from '../utils/state';
import { 
  printSuccess, 
  printError, 
  printWarning, 
  printInfo,
  printSuccessBanner,
  printSection
} from '../utils/messages';

/**
 * Watch command - Start the Neurcode Watch service
 * 
 * Starts a background service that watches for file changes and records
 * them to support the "Time Machine" feature.
 */
export async function watchCommand() {
  try {
    // Get project root (current working directory)
    const projectRoot = process.cwd();

    // Load state and get projectId
    const state = loadState();
    const projectId = getProjectId() || state.projectId;

    // Enforce project context: Require projectId to be set
    if (!projectId) {
      printError(
        'No Project Configured',
        undefined,
        [
          'Neurcode Watch requires a project to be set up',
          'Run: neurcode init',
          'This will create or connect to a project for this directory'
        ]
      );
      process.exit(1);
    }

    // Create and initialize Sentinel with projectId
    const sentinel = new Sentinel(projectRoot, projectId);
    await sentinel.initialize();

    // Create and start CommandPoller for remote commands
    const commandPoller = new CommandPoller(projectRoot);
    commandPoller.start();

    // Start watching
    await sentinel.start();

    await printSuccessBanner(
      'Neurcode Watch Started',
      'Your code changes are being tracked in real-time'
    );
    
    // Check if cloud sync is configured
    const syncer = sentinel.getSyncer();
    if (syncer.isConfigured()) {
      printSuccess(
        'Cloud Sync Enabled',
        'All events will be synced to your dashboard at dashboard.neurcode.com'
      );
    } else {
      printWarning(
        'Cloud Sync Disabled',
        'Run "neurcode config --key <your_api_key>" to enable cloud sync and access your history on the dashboard'
      );
    }
    
    // Check if command polling is configured
    if (commandPoller.isConfigured()) {
      printInfo(
        'Remote Commands Enabled',
        'You can execute revert and other commands from your dashboard'
      );
    } else {
      printInfo(
        'Remote Commands Disabled',
        'Configure an API key to enable remote command execution from the dashboard'
      );
    }
    
    printInfo('Watch Service', 'Press Ctrl+C to stop watching\n');

    // Handle graceful shutdown
    const shutdown = async () => {
      printInfo('Shutting down', 'Stopping watch service and syncing final changes...');
      commandPoller.stop();
      await sentinel.stop();
      printSuccess('Watch service stopped', 'All changes have been synced. Goodbye!');
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);

    // Keep the process alive
    // The watcher will keep the event loop alive
  } catch (error) {
    printError(
      'Failed to Start Watch Service',
      error instanceof Error ? error : String(error),
      [
        'Check if another watch process is running',
        'Verify project configuration: neurcode doctor',
        'Ensure you have write permissions in this directory',
        'Try: neurcode init (if project not configured)'
      ]
    );
    process.exit(1);
  }
}

