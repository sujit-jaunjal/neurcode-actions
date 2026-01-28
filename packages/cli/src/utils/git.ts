/**
 * Git Utility Functions
 * 
 * Wraps git command execution with debug logging and large buffer support
 * to prevent ENOBUFS errors in large repositories.
 */

import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

/**
 * Execute a git command with debug logging and large buffer
 */
export function execGitCommand(command: string, options: { encoding?: BufferEncoding; stdio?: any; cwd?: string } = {}): string {
  const execOptions: ExecSyncOptionsWithStringEncoding = {
    encoding: options.encoding || 'utf-8',
    maxBuffer: 1024 * 1024 * 1024, // 1GB buffer
    ...options,
  };

  return execSync(command, execOptions);
}

