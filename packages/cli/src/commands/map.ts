import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, resolve } from 'path';
import { ProjectScanner, ProjectMap } from '../services/mapper/ProjectScanner';

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
 * Simple spinner simulation (just show a message)
 */
function showSpinner(message: string) {
  process.stdout.write(chalk.dim(`\r${message}...`));
}

function hideSpinner() {
  process.stdout.write('\r' + ' '.repeat(50) + '\r');
}

/**
 * Load existing asset map if it exists
 */
export function loadAssetMap(rootDir: string = process.cwd()): ProjectMap | null {
  const mapPath = join(rootDir, '.neurcode', 'asset-map.json');
  
  if (!existsSync(mapPath)) {
    return null;
  }

  try {
    const { readFileSync } = require('fs');
    const content = readFileSync(mapPath, 'utf-8');
    return JSON.parse(content) as ProjectMap;
  } catch (error) {
    return null;
  }
}

/**
 * Save asset map to .neurcode/asset-map.json
 */
function saveAssetMap(map: ProjectMap, rootDir: string = process.cwd()): void {
  const neurcodeDir = join(rootDir, '.neurcode');
  
  // Ensure .neurcode directory exists
  if (!existsSync(neurcodeDir)) {
    mkdirSync(neurcodeDir, { recursive: true });
  }

  const mapPath = join(neurcodeDir, 'asset-map.json');
  writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
}

/**
 * Map command: Scan codebase and generate asset map
 */
export async function mapCommand(rootDir?: string) {
  try {
    const cwd = rootDir ? resolve(rootDir) : process.cwd();
    
    showSpinner('Scanning codebase');
    
    const scanner = new ProjectScanner(cwd);
    const map = await scanner.scan();
    
    hideSpinner();
    
    // Save the map
    saveAssetMap(map, cwd);
    
    // Display results
    const fileCount = Object.keys(map.files).length;
    const exportCount = map.globalExports.length;
    
    console.log(chalk.green(`\n✅ Mapped ${fileCount} files and ${exportCount} exported assets.`));
    console.log(chalk.dim(`   Asset map saved to: .neurcode/asset-map.json`));
    
    // Show summary
    const exportsByType = map.globalExports.reduce((acc, exp) => {
      acc[exp.type] = (acc[exp.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    if (Object.keys(exportsByType).length > 0) {
      console.log(chalk.dim('\n   Exports by type:'));
      for (const [type, count] of Object.entries(exportsByType)) {
        console.log(chalk.dim(`     ${type}: ${count}`));
      }
    }
    
    console.log('');
  } catch (error) {
    hideSpinner();
    console.error(chalk.red('\n❌ Error mapping codebase:'));
    
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
      
      if (error.message.includes('ENOENT') || error.message.includes('not found')) {
        console.log(chalk.dim('\n💡 Make sure you are in a valid project directory'));
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

