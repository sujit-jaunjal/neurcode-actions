/**
 * Security Guard - Shadow AI Shield
 * 
 * Local privacy scanner that runs before any API call to detect and mask secrets.
 * Uses regex patterns and AST analysis (via ts-morph) to identify sensitive data.
 * Also includes hallucination detection for phantom packages.
 */

import { Project, SourceFile } from 'ts-morph';
import { readFileSync, existsSync } from 'fs';
import { resolve, join } from 'path';

export interface SecretDetection {
  type: 'aws_key' | 'bearer_token' | 'github_token' | 'generic_secret' | 'ast_literal';
  severity: 'high' | 'medium' | 'low';
  location: string; // File path or "intent" for user input
  pattern: string; // The detected pattern
  masked?: boolean;
}

export interface HallucinationDetection {
  packageName: string;
  location: string; // File path or "code"
  importStatement: string; // The full import/require statement
}

export interface ScanResult {
  secrets: SecretDetection[];
  hasSecrets: boolean;
  maskedText?: string; // If masking was applied
}

export interface HallucinationScanResult {
  hallucinations: HallucinationDetection[];
  hasHallucinations: boolean;
  blocked: boolean;
}

/**
 * Security Guard for local secret detection and hallucination detection
 */
export class SecurityGuard {
  private readonly REDACTION_PLACEHOLDER = '[REDACTED_BY_NEURCODE]';

  // High-performance regex patterns for common secrets
  private readonly patterns = {
    // AWS Access Keys (AKIA followed by 16 base32 characters)
    aws_key: /\bAKIA[0-9A-Z]{16}\b/g,
    
    // Bearer tokens / API keys (common patterns)
    bearer_token: /\b(bearer|token|apikey)\s*[:=]\s*['"]?([a-zA-Z0-9_\-]{32,})['"]?/gi,
    
    // GitHub tokens (ghp_, gho_, ghu_, ghs_, ghr_)
    github_token: /\b(ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{36,}\b/g,
    
    // Generic high-entropy strings labeled as secrets
    generic_secret: /\b(password|secret|key|token|api[_-]?key|private[_-]?key)\s*[:=]\s*['"]?([a-zA-Z0-9_\-+/=]{20,})['"]?/gi,
  };

  // Variable names that suggest secrets (case-insensitive)
  private readonly sensitiveVarNames = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /private[_-]?key/i,
    /access[_-]?token/i,
    /auth[_-]?token/i,
  ];

  // Safe list of common packages and standard library modules
  // Using Set for O(1) lookup performance
  private readonly safePackageList = new Set([
    // Standard Node.js modules
    'fs', 'path', 'os', 'crypto', 'http', 'https', 'url', 'util', 'events', 'stream',
    'buffer', 'process', 'child_process', 'cluster', 'dgram', 'dns', 'net', 'readline',
    'repl', 'tls', 'tty', 'vm', 'zlib', 'assert', 'querystring', 'string_decoder',
    'timers', 'punycode', 'v8', 'worker_threads', 'perf_hooks', 'async_hooks',
    'inspector', 'module', 'console', 'domain', 'constants',
    
    // Common npm packages (top 100 most popular)
    'react', 'react-dom', 'lodash', 'express', 'axios', 'moment', 'vue', 'angular',
    'typescript', 'webpack', 'babel', 'jest', 'mocha', 'chai', 'sinon', 'eslint',
    'prettier', 'next', 'gatsby', 'nuxt', 'svelte', 'rxjs', 'redux', 'mobx',
    'styled-components', 'emotion', 'tailwindcss', 'bootstrap', 'material-ui',
    '@mui/material', '@mui/icons-material', 'antd', 'semantic-ui', 'chakra-ui',
    'node-fetch', 'got', 'request', 'superagent', 'cheerio', 'puppeteer', 'playwright',
    'mongoose', 'sequelize', 'typeorm', 'prisma', 'knex', 'pg', 'mysql2', 'sqlite3',
    'redis', 'ioredis', 'ws', 'socket.io', 'graphql', 'apollo', 'relay',
    'dotenv', 'cross-env', 'nodemon', 'pm2', 'forever', 'concurrently',
    'uuid', 'nanoid', 'crypto-js', 'bcrypt', 'jsonwebtoken', 'passport',
    'winston', 'morgan', 'pino', 'debug', 'chalk', 'colors', 'commander',
    'yargs', 'inquirer', 'ora', 'listr', 'glob', 'minimist', 'dot-prop',
    'fast-glob', 'micromatch', 'rimraf', 'mkdirp', 'fs-extra', 'graceful-fs',
    'chokidar', 'watchman', 'nodemailer', 'handlebars', 'ejs', 'pug', 'mustache',
    'marked', 'highlight.js', 'prismjs', 'showdown', 'remark', 'rehype',
  ]);

  /**
   * Scan text content for secrets using regex patterns
   */
  scanText(text: string, location: string = 'text'): SecretDetection[] {
    const detections: SecretDetection[] = [];

    // Check AWS keys
    const awsMatches = text.match(this.patterns.aws_key);
    if (awsMatches) {
      awsMatches.forEach(match => {
        detections.push({
          type: 'aws_key',
          severity: 'high',
          location,
          pattern: match,
        });
      });
    }

    // Check GitHub tokens
    const githubMatches = text.match(this.patterns.github_token);
    if (githubMatches) {
      githubMatches.forEach(match => {
        detections.push({
          type: 'github_token',
          severity: 'high',
          location,
          pattern: match,
        });
      });
    }

    // Check bearer tokens and generic secrets
    const bearerMatches = Array.from(text.matchAll(this.patterns.bearer_token));
    bearerMatches.forEach(match => {
      if (match[2] && match[2].length >= 32) {
        detections.push({
          type: 'bearer_token',
          severity: 'high',
          location,
          pattern: match[0],
        });
      }
    });

    const genericMatches = Array.from(text.matchAll(this.patterns.generic_secret));
    genericMatches.forEach(match => {
      if (match[2] && match[2].length >= 20) {
        detections.push({
          type: 'generic_secret',
          severity: match[1]?.toLowerCase().includes('password') ? 'high' : 'medium',
          location,
          pattern: match[0],
        });
      }
    });

    return detections;
  }

  /**
   * Extract package names from import/require statements (GREEDY - catches all patterns)
   * Returns array of { packageName, importStatement }
   */
  private extractPackageImports(code: string): Array<{ packageName: string; importStatement: string }> {
    const imports: Array<{ packageName: string; importStatement: string }> = [];
    const seenStatements = new Set<string>(); // Track to avoid duplicates

    // Pattern 1: ES6 import statements (GREEDY - matches all variations)
    // import x from 'package'
    // import { x, y } from 'package'
    // import * as x from 'package'
    // import x, { y } from 'package'
    // import type { x } from 'package'
    // import 'package' (side-effect imports)
    const es6ImportPattern = /import\s+(?:(?:type\s+)?(?:\*\s+as\s+\w+)|(?:\{[^}]*\})|(?:\w+)|(?:\w+\s*,\s*\{[^}]*\})|(?:type\s+\{[^}]*\}))\s+from\s+['"]([^'"]+)['"]/g;
    
    // Pattern 2: Side-effect imports (standalone import 'package')
    const sideEffectImportPattern = /^import\s+['"]([^'"]+)['"];?$/gm;

    // Pattern 3: CommonJS require (GREEDY - matches all variations)
    // const x = require('package')
    // const { x } = require('package')
    // require('package')
    // module.exports = require('package')
    const requirePattern = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    // Pattern 4: Dynamic/lazy imports (GREEDY)
    // import('package')
    // await import('package')
    // const x = import('package')
    const dynamicImportPattern = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    // Extract ES6 imports with 'from' clause
    let match: RegExpExecArray | null;
    while ((match = es6ImportPattern.exec(code)) !== null) {
      const packageName = match[1];
      if (packageName && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        const importStatement = match[0].trim();
        if (!seenStatements.has(importStatement)) {
          imports.push({ packageName, importStatement });
          seenStatements.add(importStatement);
        }
      }
    }

    // Extract side-effect imports (reset regex lastIndex)
    sideEffectImportPattern.lastIndex = 0;
    while ((match = sideEffectImportPattern.exec(code)) !== null) {
      const packageName = match[1];
      if (packageName && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        const importStatement = match[0].trim();
        if (!seenStatements.has(importStatement)) {
          imports.push({ packageName, importStatement });
          seenStatements.add(importStatement);
        }
      }
    }

    // Extract require statements
    requirePattern.lastIndex = 0;
    while ((match = requirePattern.exec(code)) !== null) {
      const packageName = match[1];
      if (packageName && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        const importStatement = match[0].trim();
        if (!seenStatements.has(importStatement)) {
          imports.push({ packageName, importStatement });
          seenStatements.add(importStatement);
        }
      }
    }

    // Extract dynamic/lazy imports
    dynamicImportPattern.lastIndex = 0;
    while ((match = dynamicImportPattern.exec(code)) !== null) {
      const packageName = match[1];
      if (packageName && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        const importStatement = match[0].trim();
        if (!seenStatements.has(importStatement)) {
          imports.push({ packageName, importStatement });
          seenStatements.add(importStatement);
        }
      }
    }

    return imports;
  }

  /**
   * Load package.json dependencies from project root
   */
  private loadProjectDependencies(rootDir: string = process.cwd()): Set<string> {
    const packageJsonPath = join(rootDir, 'package.json');
    const dependencies = new Set<string>();

    if (!existsSync(packageJsonPath)) {
      return dependencies;
    }

    try {
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      
      // Add dependencies
      if (packageJson.dependencies && typeof packageJson.dependencies === 'object') {
        Object.keys(packageJson.dependencies).forEach(pkg => dependencies.add(pkg));
      }
      
      // Add devDependencies
      if (packageJson.devDependencies && typeof packageJson.devDependencies === 'object') {
        Object.keys(packageJson.devDependencies).forEach(pkg => dependencies.add(pkg));
      }
      
      // Add peerDependencies
      if (packageJson.peerDependencies && typeof packageJson.peerDependencies === 'object') {
        Object.keys(packageJson.peerDependencies).forEach(pkg => dependencies.add(pkg));
      }
    } catch (error) {
      // If package.json can't be read or parsed, return empty set
      // This is non-fatal - we'll just rely on safe list
    }

    return dependencies;
  }

  /**
   * Extract package names mentioned in text (heuristic for plan summaries/reasons)
   * Looks for patterns like: 'package-name', "package-name", library 'package-name', etc.
   */
  private extractPackageMentions(text: string): Array<{ packageName: string; context: string }> {
    const mentions: Array<{ packageName: string; context: string }> = [];
    const seen = new Set<string>();

    // Pattern 1: Package names in quotes with keyword BEFORE (e.g., "uses 'package'", "library 'package'")
    // Matches: uses 'react-ultimate-super-charts', library "package", package 'package'
    const quotedPackagePatternBefore = /(?:library|package|uses?|imports?|requires?|from|using|depends?|dependency)\s+['"]([a-zA-Z0-9@][a-zA-Z0-9._-]*[a-zA-Z0-9])['"]/gi;
    
    // Pattern 2: Package names in quotes with keyword AFTER (e.g., "'package' library", "'package' package")
    // Matches: 'react-ultimate-super-charts' library, "package-name" package
    const quotedPackagePatternAfter = /['"]([a-zA-Z0-9@][a-zA-Z0-9._-]*[a-zA-Z0-9])['"]\s+(?:library|package|npm|module)/gi;
    
    // Pattern 3: Standalone quoted package names (more aggressive - checks context)
    // Matches: 'package-name' or "package-name" when in package-related context
    const standaloneQuotedPattern = /['"]([a-zA-Z0-9@][a-zA-Z0-9._-]*[a-zA-Z0-9])['"]/g;

    // Extract from library/package mentions (keyword BEFORE)
    let match: RegExpExecArray | null;
    while ((match = quotedPackagePatternBefore.exec(text)) !== null) {
      const packageName = match[1];
      // Validate it looks like a package name (not a file path, not too short)
      if (packageName && packageName.length >= 2 && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        if (!seen.has(packageName)) {
          mentions.push({ packageName, context: match[0] });
          seen.add(packageName);
        }
      }
    }

    // Extract from library/package mentions (keyword AFTER)
    quotedPackagePatternAfter.lastIndex = 0;
    while ((match = quotedPackagePatternAfter.exec(text)) !== null) {
      const packageName = match[1];
      if (packageName && packageName.length >= 2 && !packageName.startsWith('.') && !packageName.startsWith('/')) {
        if (!seen.has(packageName)) {
          mentions.push({ packageName, context: match[0] });
          seen.add(packageName);
        }
      }
    }

        // Extract standalone quoted strings (but exclude if already found)
        // This is a fallback for cases like "uses the 'package-name' library" or other variations
        standaloneQuotedPattern.lastIndex = 0;
        while ((match = standaloneQuotedPattern.exec(text)) !== null) {
          const packageName = match[1];
          // Only consider if it looks like an npm package name
          // Valid package names: start with letter/number/@, contain letters/numbers/dots/dashes/underscores
          const isValidPackageName = /^[a-zA-Z0-9@][a-zA-Z0-9._-]*[a-zA-Z0-9]$/.test(packageName);
          
          // Exclude component names (PascalCase single words that are likely React components)
          // Component names are typically single capitalized words like "DataVisualizer", "Button", etc.
          const isLikelyComponentName = /^[A-Z][a-zA-Z0-9]*$/.test(packageName) && 
                                        !packageName.includes('-') && 
                                        !packageName.includes('_') && 
                                        !packageName.includes('.') &&
                                        packageName.length < 30; // Components are usually shorter
          
          if (isValidPackageName && 
              packageName.length >= 2 && 
              !packageName.startsWith('.') && 
              !packageName.startsWith('/') &&
              !seen.has(packageName) &&
              !isLikelyComponentName) { // Exclude component names
            // Check if it's mentioned in context that suggests it's a package
            const beforeMatch = text.substring(Math.max(0, match.index - 50), match.index).toLowerCase();
            const afterMatch = text.substring(match.index + match[0].length, Math.min(text.length, match.index + match[0].length + 50)).toLowerCase();
            const context = beforeMatch + match[0] + afterMatch;
            
            // Only flag if context suggests it's a package/library (not a file path or variable name)
            // Require stronger evidence for standalone matches (must have library/package/npm keywords)
            const isPackageContext = /(library|package|npm|install|import|require|from|using|uses?|depends?|dependency|module)/i.test(context);
            const isNotFilePath = !/\.(js|ts|jsx|tsx|json|md|txt|html|css|scss|less)$/i.test(context);
            const isNotVariable = !/(const|let|var|function|class|interface|type)\s+['"]/.test(beforeMatch);
            const isNotStringLiteral = !/(['"])\s*\+/.test(afterMatch) && !/\+\s*(['"])/.test(beforeMatch);
            const isNotComponentContext = /(component|class|function|interface|type)\s+['"]/.test(beforeMatch);
            
            if (isPackageContext && isNotFilePath && isNotVariable && isNotStringLiteral && !isNotComponentContext) {
              mentions.push({ packageName, context: match[0] });
              seen.add(packageName);
            }
          }
        }

    return mentions;
  }

  /**
   * Scan code for hallucinated packages (phantom packages)
   * Checks against safe list and project's package.json
   * Now includes heuristic detection for package names mentioned in text (not just import statements)
   * 
   * PRO feature only - FREE users get a message to upgrade
   */
  async scanForHallucinations(
    code: string,
    location: string = 'code',
    rootDir: string = process.cwd()
  ): Promise<HallucinationScanResult> {
    // Check user tier - Hallucination Shield is PRO only
    const { getUserTier } = await import('../../utils/tier');
    const tier = await getUserTier();
    
    if (tier === 'FREE') {
      // Return empty result for FREE users (feature disabled)
      // The calling code should check tier and show upgrade message
      return {
        hallucinations: [],
        hasHallucinations: false,
        blocked: false,
      };
    }
    
    const hallucinations: HallucinationDetection[] = [];
    
    // Extract all package imports (from actual import/require statements)
    const imports = this.extractPackageImports(code);
    
    // Also extract package names mentioned in text (heuristic for plan summaries)
    const mentions = this.extractPackageMentions(code);
    
    // If no imports or mentions found, return early
    if (imports.length === 0 && mentions.length === 0) {
      return {
        hallucinations: [],
        hasHallucinations: false,
        blocked: false,
      };
    }

    // Load project dependencies
    const projectDependencies = this.loadProjectDependencies(rootDir);

    // Check each import statement
    for (const { packageName, importStatement } of imports) {
      // Check if package is in safe list
      if (this.safePackageList.has(packageName)) {
        continue; // Safe package, skip
      }

      // Check if package is in project dependencies
      if (projectDependencies.has(packageName)) {
        continue; // Package exists in project, skip
      }

      // Not in safe list or dependencies - flag as hallucination
      hallucinations.push({
        packageName,
        location,
        importStatement,
      });
    }

    // Check each package mention (from text heuristics)
    for (const { packageName, context } of mentions) {
      // Skip if we already flagged this package from an import statement
      if (hallucinations.some(h => h.packageName === packageName)) {
        continue;
      }

      // Check if package is in safe list
      if (this.safePackageList.has(packageName)) {
        continue; // Safe package, skip
      }

      // Check if package is in project dependencies
      if (projectDependencies.has(packageName)) {
        continue; // Package exists in project, skip
      }

      // Not in safe list or dependencies - flag as hallucination
      // Use context as the "import statement" for mentions
      hallucinations.push({
        packageName,
        location,
        importStatement: context,
      });
    }

    return {
      hallucinations,
      hasHallucinations: hallucinations.length > 0,
      blocked: hallucinations.length > 0, // Block if any hallucinations detected
    };
  }

  /**
   * Scan TypeScript/JavaScript files using AST analysis
   */
  async scanFile(filePath: string, rootDir: string = process.cwd()): Promise<SecretDetection[]> {
    const detections: SecretDetection[] = [];
    const fullPath = resolve(rootDir, filePath);

    // Check if file exists and is a .ts or .js file
    if (!existsSync(fullPath)) {
      return detections;
    }

    const ext = filePath.split('.').pop()?.toLowerCase();
    if (ext !== 'ts' && ext !== 'js' && ext !== 'tsx' && ext !== 'jsx') {
      // For non-TS/JS files, use regex scanning
      try {
        const content = readFileSync(fullPath, 'utf-8');
        return this.scanText(content, filePath);
      } catch {
        return detections;
      }
    }

    try {
      // Use ts-morph for AST analysis
      const project = new Project({
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
      });

      const sourceFile = project.addSourceFileAtPath(fullPath);

      // Scan for variable declarations with sensitive names
      sourceFile.getVariableDeclarations().forEach(variable => {
        const name = variable.getName();
        const initializer = variable.getInitializer();

        // Check if variable name suggests a secret
        const isSensitive = this.sensitiveVarNames.some(pattern => pattern.test(name));
        
        if (isSensitive && initializer) {
          // Check if initializer is a string literal
          const kind = initializer.getKindName();
          if (kind === 'StringLiteral' || kind === 'NoSubstitutionTemplateLiteral') {
            const text = initializer.getText().replace(/['"`]/g, '');
            
            // Check if the value looks like a secret (high entropy)
            if (text.length >= 20 && /[a-zA-Z0-9_\-+/=]{20,}/.test(text)) {
              detections.push({
                type: 'ast_literal',
                severity: 'high',
                location: filePath,
                pattern: `${name} = ${initializer.getText()}`,
              });
            }
          }
        }
      });

      // Also run regex scanning as fallback
      const content = sourceFile.getFullText();
      const regexDetections = this.scanText(content, filePath);
      detections.push(...regexDetections);
    } catch (error) {
      // If AST parsing fails, fall back to regex scanning
      try {
        const content = readFileSync(fullPath, 'utf-8');
        return this.scanText(content, filePath);
      } catch {
        // File cannot be read, return empty
      }
    }

    return detections;
  }

  /**
   * Scan multiple files
   */
  async scanFiles(filePaths: string[], rootDir: string = process.cwd()): Promise<ScanResult> {
    const allDetections: SecretDetection[] = [];

    for (const filePath of filePaths) {
      const detections = await this.scanFile(filePath, rootDir);
      allDetections.push(...detections);
    }

    return {
      secrets: allDetections,
      hasSecrets: allDetections.length > 0,
    };
  }

  /**
   * Scan intent string for secrets
   */
  scanIntent(intent: string): ScanResult {
    const detections = this.scanText(intent, 'intent');
    return {
      secrets: detections,
      hasSecrets: detections.length > 0,
    };
  }

  /**
   * Mask secrets in text
   */
  maskSecrets(text: string, detections: SecretDetection[]): string {
    let maskedText = text;

    // Sort detections by pattern length (longest first) to avoid partial replacements
    const sortedDetections = [...detections].sort((a, b) => b.pattern.length - a.pattern.length);

    for (const detection of sortedDetections) {
      // Escape special regex characters in the pattern
      const escapedPattern = detection.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escapedPattern, 'g');
      maskedText = maskedText.replace(regex, this.REDACTION_PLACEHOLDER);
    }

    return maskedText;
  }

  /**
   * Complete scan with masking
   */
  async scanAndMask(intent: string, filePaths: string[], rootDir: string = process.cwd()): Promise<ScanResult & { maskedIntent?: string; maskedFiles?: Map<string, string> }> {
    const intentResult = this.scanIntent(intent);
    const filesResult = await this.scanFiles(filePaths, rootDir);

    const allDetections = [...intentResult.secrets, ...filesResult.secrets];
    const hasSecrets = allDetections.length > 0;

    let maskedIntent: string | undefined;
    let maskedFiles: Map<string, string> | undefined;

    if (hasSecrets) {
      // Mask intent
      if (intentResult.hasSecrets) {
        maskedIntent = this.maskSecrets(intent, intentResult.secrets);
      }

      // Mask files
      if (filesResult.hasSecrets) {
        maskedFiles = new Map();
        const fileDetections = new Map<string, SecretDetection[]>();

        // Group detections by file
        for (const detection of filesResult.secrets) {
          if (detection.location !== 'intent') {
            const fileDetectionsList = fileDetections.get(detection.location) || [];
            fileDetectionsList.push(detection);
            fileDetections.set(detection.location, fileDetectionsList);
          }
        }

        // Mask each file
        for (const [filePath, detections] of fileDetections.entries()) {
          try {
            const content = readFileSync(resolve(rootDir, filePath), 'utf-8');
            const masked = this.maskSecrets(content, detections);
            maskedFiles.set(filePath, masked);
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }

    return {
      secrets: allDetections,
      hasSecrets,
      maskedIntent,
      maskedFiles,
    };
  }
}
