/**
 * Project Detector Utility
 * 
 * Detects project information from the current directory:
 * 1. Git remote URL (primary)
 * 2. package.json name (fallback)
 * 3. Directory name (last resort)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join, basename } from 'path';

export interface ProjectInfo {
  gitUrl: string | null;
  name: string | null;
  source: 'git' | 'package.json' | 'directory';
}

/**
 * Detect Git remote URL
 */
function detectGitUrl(): string | null {
  try {
    // Try to get the origin remote URL
    const gitUrl = execSync('git remote get-url origin', {
      maxBuffer: 1024 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'ignore'],
      cwd: process.cwd(),
    }).trim();

    if (!gitUrl) {
      return null;
    }

    // Normalize Git URL formats
    // Convert SSH to HTTPS if needed (optional - we can store SSH URLs too)
    // For now, we'll store whatever git returns
    
    // Remove .git suffix if present (we'll handle both)
    return gitUrl.replace(/\.git$/, '');
  } catch (error) {
    // Git command failed - not a git repo or no remote configured
    return null;
  }
}

/**
 * Detect project name from package.json
 */
function detectPackageName(): string | null {
  try {
    const packageJsonPath = join(process.cwd(), 'package.json');
    if (!existsSync(packageJsonPath)) {
      return null;
    }

    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (packageJson.name && typeof packageJson.name === 'string') {
      return packageJson.name;
    }

    return null;
  } catch (error) {
    // Failed to read or parse package.json
    return null;
  }
}

/**
 * Detect project name from directory name
 */
function detectDirectoryName(): string {
  return basename(process.cwd());
}

/**
 * Detect project information from current directory
 * 
 * Priority:
 * 1. Git remote URL (best - unique identifier)
 * 2. package.json name (good - semantic name)
 * 3. Directory name (fallback - always available)
 */
export function detectProject(): ProjectInfo {
  // Try Git URL first (most reliable)
  const gitUrl = detectGitUrl();
  if (gitUrl) {
    // Extract name from Git URL
    const urlMatch = gitUrl.match(/(?:github\.com|gitlab\.com|bitbucket\.org)[/:]([^/]+)\/([^/]+?)(?:\.git)?$/);
    const name = urlMatch ? urlMatch[2] : basename(gitUrl);
    
    return {
      gitUrl,
      name,
      source: 'git',
    };
  }

  // Fallback to package.json name
  const packageName = detectPackageName();
  if (packageName) {
    return {
      gitUrl: null,
      name: packageName,
      source: 'package.json',
    };
  }

  // Last resort: directory name
  const dirName = detectDirectoryName();
  return {
    gitUrl: null,
    name: dirName,
    source: 'directory',
  };
}

/**
 * Check if current directory is a Git repository
 */
export function isGitRepository(): boolean {
  try {
    execSync('git rev-parse --git-dir', {
      maxBuffer: 1024 * 1024 * 1024,
      encoding: 'utf-8',
      stdio: 'ignore',
      cwd: process.cwd(),
    });
    return true;
  } catch {
    return false;
  }
}

