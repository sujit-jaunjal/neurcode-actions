/**
 * .neurcodeignore support for filtering build artifacts and noise from verification.
 */

import ignore from 'ignore';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const DEFAULT_PATTERNS = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '*.map',
];

/**
 * Load .neurcodeignore from workingDir and return a filter function.
 * Paths for which the filter returns true should be excluded from verification.
 *
 * @param workingDir - Directory containing .neurcodeignore (e.g. process.cwd())
 * @returns (path: string) => true if path should be ignored
 */
export function loadIgnore(workingDir: string): (path: string) => boolean {
  const ig = ignore();
  ig.add(DEFAULT_PATTERNS);

  const neurcodeignorePath = join(workingDir, '.neurcodeignore');
  if (existsSync(neurcodeignorePath)) {
    try {
      const content = readFileSync(neurcodeignorePath, 'utf-8');
      const lines = content
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith('#'));
      if (lines.length > 0) {
        ig.add(lines);
      }
    } catch {
      // If read fails, use defaults only
    }
  }

  return (pathname: string): boolean => {
    // ignore expects path.relative()-style paths (no leading . or /)
    const normalized = pathname.replace(/^\.\//, '').replace(/\\/g, '/');
    return ig.ignores(normalized);
  };
}
