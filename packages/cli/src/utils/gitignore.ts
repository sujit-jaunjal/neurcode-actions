/**
 * Gitignore Updater Utility
 * 
 * Ensures .neurcode directory is added to .gitignore
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const GITIGNORE_FILE = '.gitignore';
const NEURCODE_IGNORE = '.neurcode';

/**
 * Ensure .neurcode is in .gitignore
 */
export function ensureNeurcodeInGitignore(cwd: string = process.cwd()): void {
  const gitignorePath = join(cwd, GITIGNORE_FILE);

  // If .gitignore doesn't exist, create it
  if (!existsSync(gitignorePath)) {
    writeFileSync(gitignorePath, `${NEURCODE_IGNORE}\n`, 'utf-8');
    return;
  }

  // Read existing .gitignore
  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split('\n').map(line => line.trim());

  // Check if .neurcode is already in .gitignore
  if (lines.includes(NEURCODE_IGNORE)) {
    return; // Already present
  }

  // Append .neurcode to .gitignore
  const newContent = content.trimEnd() + (content.endsWith('\n') ? '' : '\n') + `${NEURCODE_IGNORE}\n`;
  writeFileSync(gitignorePath, newContent, 'utf-8');
}

