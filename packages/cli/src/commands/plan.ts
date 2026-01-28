import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, relative, resolve } from 'path';
import { loadConfig, requireApiKey } from '../config';
import { ApiClient, GeneratePlanResponse } from '../api-client';
import { detectProject } from '../utils/project-detector';
import { loadAssetMap } from './map';
import { ProjectMap } from '../services/mapper/ProjectScanner';
import { setSessionId, setActivePlanId, setLastPlanGeneratedAt } from '../utils/state';
import { logROIEvent } from '../utils/ROILogger';
import { generateToolboxSummary } from '../services/toolbox-service';

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

interface PlanOptions {
  projectId?: string;
  ticket?: string;
  mask?: boolean;
}

/**
 * Recursively scan directory for files, ignoring common build/dependency directories
 * Returns only file paths (no content) for use in file tree scanning
 */
function scanFiles(dir: string, baseDir: string, maxFiles: number = 200): string[] {
  const files: string[] = [];
  const ignoreDirs = new Set(['node_modules', '.git', '.next', 'dist', 'build', '.turbo', '.cache']);
  const ignorePatterns = [/^\./, /\.map$/, /\.log$/];

  function scan(currentDir: string): void {
    if (files.length >= maxFiles) return;

    try {
      const entries = readdirSync(currentDir);

      for (const entry of entries) {
        if (files.length >= maxFiles) break;

        const fullPath = join(currentDir, entry);
        const relativePath = relative(baseDir, fullPath);

        // Skip hidden files and directories
        if (entry.startsWith('.')) {
          // Allow .env, .gitignore, etc. but skip .git, .next, etc.
          if (ignoreDirs.has(entry)) continue;
          // Skip other hidden files that match ignore patterns
          if (ignorePatterns.some(pattern => pattern.test(entry))) continue;
        }

        // Skip ignored directories
        if (ignoreDirs.has(entry)) continue;

        try {
          const stat = statSync(fullPath);
          if (stat.isDirectory()) {
            scan(fullPath);
          } else if (stat.isFile()) {
            // Skip binary-like files and common build artifacts
            const ext = entry.split('.').pop()?.toLowerCase();
            const skipExts = ['map', 'log', 'lock', 'png', 'jpg', 'jpeg', 'gif', 'ico', 'svg', 'woff', 'woff2', 'ttf', 'eot'];
            if (ext && skipExts.includes(ext)) continue;

            files.push(relativePath);
          }
        } catch {
          // Skip files we can't access
          continue;
        }
      }
    } catch {
      // Skip directories we can't access
      return;
    }
  }

  scan(dir);
  return files.slice(0, maxFiles);
}

/**
 * Display the plan in a beautiful format
 */
function displayPlan(plan: GeneratePlanResponse['plan']) {
  console.log('\n' + chalk.bold.cyan('📋 Neurcode Architect Plan\n'));

  // Display summary and complexity
  console.log(chalk.bold.white('Summary:'));
  console.log(chalk.dim(plan.summary));
  console.log('');

  const complexityEmoji = {
    low: '🟢',
    medium: '🟡',
    high: '🔴',
  };
  const complexity = plan.estimatedComplexity || 'medium';
  console.log(chalk.bold.white('Estimated Complexity:'), complexityEmoji[complexity], chalk.bold(complexity.toUpperCase()));
  console.log('');

  // Group files by action
  const createFiles = plan.files.filter(f => f.action === 'CREATE');
  const modifyFiles = plan.files.filter(f => f.action === 'MODIFY');
  const blockFiles = plan.files.filter(f => f.action === 'BLOCK');

  // Display CREATE files (GREEN)
  if (createFiles.length > 0) {
    console.log(chalk.bold.green(`\n✨ CREATE (${createFiles.length} files):`));
    for (const file of createFiles) {
      console.log(chalk.green(`  + ${file.path}`));
      if (file.reason) {
        console.log(chalk.dim(`    └─ ${file.reason}`));
      }
      if (file.suggestion) {
        console.log(chalk.cyan(`    💡 ${file.suggestion}`));
      }
    }
  }

  // Display MODIFY files (YELLOW)
  if (modifyFiles.length > 0) {
    console.log(chalk.bold.yellow(`\n🔧 MODIFY (${modifyFiles.length} files):`));
    for (const file of modifyFiles) {
      console.log(chalk.yellow(`  ~ ${file.path}`));
      if (file.reason) {
        console.log(chalk.dim(`    └─ ${file.reason}`));
      }
      if (file.suggestion) {
        console.log(chalk.cyan(`    💡 ${file.suggestion}`));
      }
    }
  }

  // Display BLOCK files (RED)
  if (blockFiles.length > 0) {
    console.log(chalk.bold.red(`\n🚫 BLOCK (${blockFiles.length} files):`));
    for (const file of blockFiles) {
      console.log(chalk.red(`  ✗ ${file.path}`));
      if (file.reason) {
        console.log(chalk.dim(`    └─ ${file.reason}`));
      }
    }
  }

  // Display recommendations
  if (plan.recommendations && plan.recommendations.length > 0) {
    console.log(chalk.bold.white('\n💡 Recommendations:'));
    for (const rec of plan.recommendations) {
      console.log(chalk.cyan(`  • ${rec}`));
    }
  }

  console.log('');
}


/**
 * Ensure asset map exists, creating it silently if needed
 */
async function ensureAssetMap(cwd: string): Promise<ProjectMap | null> {
  let map = loadAssetMap(cwd);
  
  if (!map) {
    // Silently create the map if it doesn't exist
    try {
      const { ProjectScanner } = await import('../services/mapper/ProjectScanner');
      const scanner = new ProjectScanner(cwd);
      map = await scanner.scan();
      
      // Save it
      const { writeFileSync, mkdirSync } = await import('fs');
      const neurcodeDir = join(cwd, '.neurcode');
      if (!existsSync(neurcodeDir)) {
        mkdirSync(neurcodeDir, { recursive: true });
      }
      const mapPath = join(neurcodeDir, 'asset-map.json');
      writeFileSync(mapPath, JSON.stringify(map, null, 2) + '\n', 'utf-8');
    } catch (error) {
      // If mapping fails, continue without it (graceful degradation)
      if (process.env.DEBUG) {
        console.warn(chalk.yellow(`⚠️  Could not generate asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
      return null;
    }
  }
  
  return map;
}

export async function planCommand(intent: string, options: PlanOptions) {
  try {
    if (!intent || !intent.trim()) {
      console.error(chalk.red('❌ Error: Intent cannot be empty. What are you building?'));
      console.log(chalk.dim('Usage: neurcode plan "<your intent description>"'));
      console.log(chalk.dim('Example: neurcode plan "Add user authentication to login page"'));
      process.exit(1);
    }

    // Load configuration first (needed for TicketService)
    const config = loadConfig();
    // API URL is automatically set to production - no need to check

    // Require API key (shows helpful error message if missing)
    // This will exit with helpful message if key is not found
    if (!config.apiKey) {
      config.apiKey = requireApiKey();
    }

    // Initialize API client (needed for TicketService)
    const client = new ApiClient(config);

    // Initialize Security Guard, Ticket Service, and Project Knowledge Service
    const { SecurityGuard } = await import('../services/security/SecurityGuard');
    const { TicketService } = await import('../services/integrations/TicketService');
    const { ProjectKnowledgeService } = await import('../services/project-knowledge-service');
    const securityGuard = new SecurityGuard();
    const ticketService = new TicketService(client);
    const projectKnowledgeService = new ProjectKnowledgeService();

    let enrichedIntent = intent.trim();
    let ticketMetadata: { id: string; title: string; description: string; acceptanceCriteria?: string } | undefined;

    // Step 1: Fetch ticket context if --ticket is provided
    if (options.ticket) {
      try {
        console.log(chalk.dim(`🎫 Fetching ticket context: ${options.ticket}...`));
        const ticketContext = await ticketService.fetchTicketAndEnrich(options.ticket, intent.trim());
        enrichedIntent = ticketContext.enrichedIntent;
        ticketMetadata = {
          id: ticketContext.ticket.id,
          title: ticketContext.ticket.title,
          description: ticketContext.ticket.description,
          acceptanceCriteria: ticketContext.ticket.acceptanceCriteria,
        };
        console.log(chalk.green(`✅ Ticket context loaded: ${ticketContext.ticket.title}`));
      } catch (error) {
        console.error(chalk.red(`❌ Error fetching ticket ${options.ticket}:`));
        console.error(chalk.red(error instanceof Error ? error.message : String(error)));
        process.exit(1);
      }
    }

    // CRITICAL: Check state file FIRST for headless workflow support
    // Priority: state file (.neurcode/config.json) > config > auto-detection
    const { getProjectId } = await import('../utils/state');
    let projectId: string | null = getProjectId(); // Priority 1: State file (headless-friendly)

    // Fallback to config if state file doesn't have projectId
    if (!projectId) {
      projectId = config.projectId || null;
    }

    // Only auto-detect if we still don't have a projectId (interactive mode)
    if (!projectId) {
      try {
        const projectInfo = detectProject();
        if (projectInfo.gitUrl) {
          // We have a Git URL - connect the project
          console.log(chalk.dim(`🔗 Connecting project: ${projectInfo.name || 'detecting...'}`));
          const project = await client.ensureProject(projectInfo.gitUrl, projectInfo.name || undefined);
          projectId = project.id;
          
          // Save projectId to state file (.neurcode/config.json)
          const { setProjectId } = await import('../utils/state');
          setProjectId(projectId);
          console.log(chalk.green(`✅ Project connected: ${project.name}`));
          console.log(chalk.dim(`   Project ID saved to .neurcode/config.json\n`));
        } else {
          // No Git URL - use name-based project (will be created by API if needed)
          console.log(chalk.dim(`📁 Using project: ${projectInfo.name || 'default'}\n`));
        }
      } catch (error: any) {
        // If project connection fails, continue without it (graceful degradation)
        console.warn(chalk.yellow(`⚠️  Could not connect project: ${error.message}`));
        console.log(chalk.dim('   Continuing without project linking...\n'));
        // Log full error in debug mode
        if (process.env.DEBUG) {
          console.error(error);
        }
      }
    }

    // SAFETY: Guard clause to prevent orphan sessions - ensure projectId is set before proceeding
    // After all auto-detection attempts, verify we have a valid projectId
    // This matches the finalProjectId logic used later in the function
    const finalProjectIdForGuard = options.projectId || projectId || config.projectId;
    if (!finalProjectIdForGuard) {
      console.log(chalk.yellow('⚠️  No project initialized. Running init first...\n'));
      const { initCommand } = await import('./init');
      await initCommand();
      return;
    }

    // Step B: Scan file tree (paths only, no content)
    const cwd = process.cwd();
    console.log(chalk.dim(`📂 Scanning file tree in ${cwd}...`));
    
    const fileTree = scanFiles(cwd, cwd, 200);
    
    if (fileTree.length === 0) {
      console.warn(chalk.yellow('⚠️  No files found in current directory'));
      process.exit(1);
    }

    console.log(chalk.dim(`Found ${fileTree.length} files in project`));

    // Step 2: Pre-Flight Security Check - Scan for secrets (on file tree)
    console.log(chalk.dim('🛡️  Running security scan...'));
    const scanResult = await securityGuard.scanAndMask(enrichedIntent, fileTree, cwd);

    if (scanResult.hasSecrets) {
      const secretCount = scanResult.secrets.length;
      const secretFiles = new Set(scanResult.secrets.map(s => s.location));
      
      // Log ROI event for secret interception (non-blocking)
      try {
        const finalProjectId = options.projectId || projectId || config.projectId;
        logROIEvent('SECRET_INTERCEPTED', {
          secretCount,
          secretTypes: Array.from(new Set(scanResult.secrets.map(s => s.type))),
          locations: Array.from(secretFiles),
          masked: options.mask !== false,
        }, finalProjectId || null).catch(() => {
          // Silently ignore - ROI logging should never block user workflows
        });
      } catch {
        // Silently ignore - ROI logging should never block user workflows
      }
      
      if (options.mask !== false) {
        // Mask mode: Auto-replace secrets and log warnings
        console.log(chalk.yellow(`\n⚠️  Secret detected and masked (${secretCount} occurrence(s)):`));
        scanResult.secrets.forEach(secret => {
          console.log(chalk.yellow(`   ${secret.severity.toUpperCase()}: ${secret.type} in ${secret.location}`));
        });
        
        // Use masked intent and files
        if (scanResult.maskedIntent) {
          enrichedIntent = scanResult.maskedIntent;
        }
        console.log(chalk.green('\n✅ Secrets masked - proceeding with plan generation'));
      } else {
        // No-mask mode: Abort and require user intervention
        console.error(chalk.red(`\n❌ SECRET DETECTED - Command aborted`));
        console.error(chalk.red(`Found ${secretCount} secret(s) in ${secretFiles.size} file(s):`));
        scanResult.secrets.forEach(secret => {
          console.error(chalk.red(`   ${secret.severity.toUpperCase()}: ${secret.type} in ${secret.location}`));
        });
        console.log(chalk.yellow('\n💡 To auto-mask secrets, run with --mask flag (default)'));
        console.log(chalk.yellow('   Or remove secrets from your code before running neurcode plan'));
        process.exit(1);
      }
    } else {
      console.log(chalk.green('✅ Security scan passed - no secrets detected'));
    }
    
    // Step 3: Load or create asset map for context injection
    let enhancedIntent = enrichedIntent; // Start with ticket-enriched intent (or original if no ticket)
    try {
      const map = await ensureAssetMap(cwd);
      if (map && map.globalExports.length > 0) {
        // Pass intent to generateToolboxSummary for relevance filtering
        const toolboxSummary = generateToolboxSummary(map, enrichedIntent);
        if (toolboxSummary) {
          // Inject toolbox summary into intent (append to enriched intent)
          enhancedIntent = `${enrichedIntent}\n\n${toolboxSummary}\n\nIMPORTANT: The "Available Tools" list above shows existing code that CAN be reused. Only reference tools from this list if they are directly relevant to the user's intent. Do not create new files, functions, or features unless the user explicitly requested them. The list is for reference only - not a requirement to use everything.`;
          console.log(chalk.dim(`📦 Loaded ${map.globalExports.length} exported assets, showing top 20 most relevant`));
        }
      }
    } catch (error) {
      // If asset map loading fails, continue without it (graceful degradation)
      if (process.env.DEBUG) {
        console.warn(chalk.yellow(`⚠️  Could not load asset map: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }
    
    // Check for active sessions before creating a new one
    const finalProjectId = options.projectId || projectId || config.projectId;
    if (finalProjectId && process.stdout.isTTY && !process.env.CI) {
      try {
        const sessions = await client.getSessions(finalProjectId, 10);
        const activeSessions = sessions.filter(s => s.status === 'active');
        
        if (activeSessions.length > 0) {
          console.log(chalk.yellow(`\n⚠️  You have ${activeSessions.length} active session(s):\n`));
          activeSessions.slice(0, 3).forEach((session, index) => {
            const title = session.title || session.intentDescription || 'Untitled';
            console.log(chalk.dim(`   ${index + 1}. ${title}`));
          });
          if (activeSessions.length > 3) {
            console.log(chalk.dim(`   ... and ${activeSessions.length - 3} more`));
          }
          console.log('');
          
          const { createInterface } = await import('readline/promises');
          const { stdin, stdout } = await import('process');
          try {
            const rl = createInterface({ input: stdin, output: stdout });
            const answer = await rl.question(chalk.bold('End previous session(s) before starting new one? (y/n): '));
            rl.close();
            
            if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
              console.log(chalk.dim('\n💡 Tip: Run "neurcode session end" to manage sessions, or continue to create a new session.\n'));
            }
          } catch {
            // If prompt fails, continue silently
          }
        }
      } catch (error) {
        // Non-critical - continue if we can't check sessions
        if (process.env.DEBUG) {
          console.log(chalk.dim('Could not check active sessions'));
        }
      }
    }

    // Step A: Get project knowledge (tech stack + architecture)
    let projectSummary: string | undefined;
    try {
      const projectKnowledge = await projectKnowledgeService.getProjectSummary(cwd);
      projectSummary = projectKnowledge.summary;
      if (process.env.DEBUG) {
        console.log(chalk.dim(`📊 Project context: ${projectSummary}`));
      }
    } catch (error) {
      // Non-critical - continue without project summary
      if (process.env.DEBUG) {
        console.warn(chalk.yellow(`⚠️  Could not load project knowledge: ${error instanceof Error ? error.message : 'Unknown error'}`));
      }
    }

    // Step C: Pass 1 - The Semantic Scout (select relevant files)
    console.log(chalk.dim('🔍 Semantic Scout: Selecting relevant files...'));
    let selectedFiles: string[] = [];
    try {
      selectedFiles = await client.selectFiles(enhancedIntent, fileTree, projectSummary);
      
      // Handle empty selection (fallback to top 10 files)
      if (selectedFiles.length === 0) {
        console.log(chalk.yellow('⚠️  No files selected by Semantic Scout, using fallback (top 10 files)'));
        selectedFiles = fileTree.slice(0, 10);
      }
      
      console.log(chalk.green(`✅ Semantic Scout selected ${selectedFiles.length} file(s) from ${fileTree.length} total`));
      if (process.env.DEBUG) {
        console.log(chalk.dim(`Selected files: ${selectedFiles.join(', ')}`));
      }
    } catch (error) {
      // Fallback: use top 10 files if selection fails
      console.warn(chalk.yellow(`⚠️  File selection failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
      console.log(chalk.yellow('   Using fallback: top 10 files from tree'));
      selectedFiles = fileTree.slice(0, 10);
    }

    // Step D: Content Load - Verify selected files exist and are readable
    const validFiles: string[] = [];
    for (const filePath of selectedFiles) {
      const fullPath = join(cwd, filePath);
      try {
        if (existsSync(fullPath)) {
          // Verify file is readable
          readFileSync(fullPath, 'utf-8');
          validFiles.push(filePath);
        } else {
          if (process.env.DEBUG) {
            console.warn(chalk.yellow(`⚠️  Selected file does not exist: ${filePath}`));
          }
        }
      } catch (error) {
        if (process.env.DEBUG) {
          console.warn(chalk.yellow(`⚠️  Cannot read selected file ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`));
        }
      }
    }

    // Ensure we have at least some files
    const filesToUse = validFiles.length > 0 ? validFiles : fileTree.slice(0, 10);
    if (validFiles.length < selectedFiles.length) {
      console.log(chalk.yellow(`⚠️  ${selectedFiles.length - validFiles.length} selected file(s) could not be read, using ${filesToUse.length} valid file(s)`));
    }

    // Step E: Pass 2 - The Architect (generate plan with selected files)
    console.log(chalk.dim('🤖 Generating plan with selected files...\n'));
    const response = await client.generatePlan(enhancedIntent, filesToUse, finalProjectId, ticketMetadata, projectSummary);

    // Pre-Flight Snapshot: Capture current state of files that will be MODIFIED
    // This ensures we have a baseline to revert to if AI destroys files
    const modifyFiles = response.plan.files.filter(f => f.action === 'MODIFY');
    
    if (modifyFiles.length > 0) {
      console.log(chalk.dim(`\n📸 Capturing pre-flight snapshots for ${modifyFiles.length} file(s)...`));
      
      let snapshotsSaved = 0;
      let snapshotsFailed = 0;

      for (const file of modifyFiles) {
        try {
          // Resolve file path relative to current working directory
          const filePath = resolve(cwd, file.path);
          
          // Check if file exists locally
          if (!existsSync(filePath)) {
            console.log(chalk.yellow(`   ⚠️  Skipping ${file.path} (file not found locally)`));
            continue;
          }

          // Read current file content
          const fileContent = readFileSync(filePath, 'utf-8');

          // Save as backup version with descriptive reason
          const reason = `Pre-Plan Snapshot for "${intent.trim()}"`;
          
          await client.saveFileVersion(
            file.path,
            fileContent,
            finalProjectId,
            reason,
            'modify', // Pre-flight snapshot is a modification checkpoint
            0, // No lines added yet (this is the baseline)
            0  // No lines removed yet (this is the baseline)
          );

          snapshotsSaved++;
          console.log(chalk.green(`   ✓ Snapshot saved: ${file.path}`));
        } catch (error) {
          snapshotsFailed++;
          console.warn(chalk.yellow(`   ⚠️  Failed to save snapshot for ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`));
          // Continue with other files even if one fails
        }
      }

      if (snapshotsSaved > 0) {
        console.log(chalk.green(`\n✅ ${snapshotsSaved} pre-flight snapshot(s) saved successfully`));
        if (snapshotsFailed > 0) {
          console.log(chalk.yellow(`   ${snapshotsFailed} snapshot(s) failed (plan will continue)`));
        }
        console.log(chalk.dim('   You can revert these files using: neurcode revert <filePath> --to-version <version>\n'));
      } else if (snapshotsFailed > 0) {
        console.log(chalk.yellow(`\n⚠️  No snapshots were saved (${snapshotsFailed} failed)`));
        console.log(chalk.dim('   Plan will continue, but revert functionality may be limited\n'));
      } else {
        console.log(chalk.dim('\n   No files to snapshot\n'));
      }
    }

    // Step 3: Post-Generation Hallucination Check (DEEP SCAN)
    // Scan ALL plan content for phantom packages - not just summaries, but full proposed code
    let hasHallucinations = false;
    const allHallucinations: Array<{ packageName: string; location: string; importStatement: string }> = [];

    // Check tier for hallucination scanning (PRO feature)
    const { getUserTier } = await import('../utils/tier');
    const tier = await getUserTier();
    
    if (tier === 'FREE') {
      console.log(chalk.yellow('\n🛡️  Hallucination Shield is a PRO feature.'));
      console.log(chalk.dim('   Upgrade at: https://www.neurcode.com/dashboard/purchase-plan\n'));
    } else {
      console.log(chalk.dim('🔍 Checking for AI hallucinations...'));
      
      // Collect ALL code content from the plan (suggestions, reasons, summaries)
      // This ensures we catch hallucinations in the full proposed code, not just summaries
      const allPlanContent: Array<{ content: string; location: string }> = [];
      
      for (const file of response.plan.files) {
        // Add suggestion text (full proposed code blocks)
        if (file.suggestion) {
          allPlanContent.push({
            content: file.suggestion,
            location: file.path,
          });
        }
        
        // Also scan reason text (sometimes contains code examples)
        if (file.reason) {
          allPlanContent.push({
            content: file.reason,
            location: file.path,
          });
        }
      }
      
      // Also scan the plan summary for any code snippets
      if (response.plan.summary) {
        allPlanContent.push({
          content: response.plan.summary,
          location: 'plan_summary',
        });
      }

      // Scan all collected content for hallucinations
      for (const { content, location } of allPlanContent) {
        if (!content || content.trim().length === 0) {
          continue;
        }
        
        const hallucinationResult = await securityGuard.scanForHallucinations(
          content, // Full content, not just summary
          location,
          cwd
        );

        if (hallucinationResult.hasHallucinations) {
          hasHallucinations = true;
          allHallucinations.push(...hallucinationResult.hallucinations.map(h => ({
            packageName: h.packageName,
            location: h.location,
            importStatement: h.importStatement,
          })));
        }
      }
    }

    // Display hallucination warnings BEFORE the plan (Verification Badge)
    if (hasHallucinations) {
      // Log ROI event for each hallucination detected (non-blocking)
      try {
        const finalProjectId = options.projectId || projectId || config.projectId;
        for (const hallucination of allHallucinations) {
          logROIEvent('HALLUCINATION_BLOCKED', {
            package_name: hallucination.packageName,
            location: hallucination.location,
            import_statement: hallucination.importStatement,
          }, finalProjectId || null).catch(() => {
            // Silently ignore - ROI logging should never block user workflows
          });
        }
      } catch {
        // Silently ignore - ROI logging should never block user workflows
      }

      // Display high-contrast hallucination warnings with shield icon (BEFORE plan)
      console.log('\n');
      console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.red('║') + chalk.bold.white('  🛡️  SECURITY SHIELD: HALLUCINATION DETECTED  ') + chalk.bold.red('║'));
      console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════╝'));
      console.log('');
      
      // Group hallucinations by package name for cleaner output
      const hallucinationsByPackage = new Map<string, Array<{ location: string; importStatement: string }>>();
      for (const hallucination of allHallucinations) {
        if (!hallucinationsByPackage.has(hallucination.packageName)) {
          hallucinationsByPackage.set(hallucination.packageName, []);
        }
        hallucinationsByPackage.get(hallucination.packageName)!.push({
          location: hallucination.location,
          importStatement: hallucination.importStatement,
        });
      }
      
      // Display each unique hallucinated package
      hallucinationsByPackage.forEach((occurrences, packageName) => {
        const shieldIcon = chalk.bold.red('🛡️');
        const criticalLabel = chalk.bold.red('CRITICAL:');
        const packageNameDisplay = chalk.bold.yellow(`'${packageName}'`);
        
        console.log(`${shieldIcon} ${chalk.bold.red('[Neurcode]')} ${criticalLabel} ${chalk.bold.white('Hallucination Blocked')}`);
        console.log(chalk.white(`   Attempted import of non-existent package ${packageNameDisplay} prevented.`));
        
        // Show all locations where this package was found
        if (occurrences.length === 1) {
          console.log(chalk.dim(`   Location: ${occurrences[0].location}`));
          console.log(chalk.dim(`   Statement: ${occurrences[0].importStatement}`));
        } else {
          console.log(chalk.dim(`   Found in ${occurrences.length} location(s):`));
          occurrences.forEach(occ => {
            console.log(chalk.dim(`     • ${occ.location}: ${occ.importStatement}`));
          });
        }
        console.log('');
      });
      
      if (allHallucinations.length > 1) {
        console.log(chalk.dim(`   Total: ${allHallucinations.length} hallucination(s) blocked across ${hallucinationsByPackage.size} unique package(s)\n`));
      }
      
      console.log(chalk.dim('💡 The plan may include references to packages that don\'t exist.'));
      console.log(chalk.dim('   Review the plan carefully before applying.\n'));
      console.log(chalk.bold.red('─'.repeat(60)));
      console.log('');
    } else {
      console.log(chalk.green('✅ No hallucinations detected'));
    }

    // Display the plan (AFTER hallucination warnings)
    displayPlan(response.plan);

    console.log(chalk.dim(`\nGenerated at: ${new Date(response.timestamp).toLocaleString()}`));
    
    // Display plan ID if available
    if (response.planId && response.planId !== 'unknown') {
      console.log(chalk.bold.cyan(`\n📌 Plan ID: ${response.planId} (Saved)`));
      console.log(chalk.dim('   Run \'neurcode prompt \' to generate a Cursor/AI prompt. (Ready now)'));
    }

    // Save sessionId and planId to state file (.neurcode/config.json)
    try {
      if (response.planId && response.planId !== 'unknown') {
        // Save active plan ID (primary) and lastPlanId (backward compatibility)
        setActivePlanId(response.planId);
        setLastPlanGeneratedAt(new Date().toISOString());
      }
      if (response.sessionId) {
        setSessionId(response.sessionId);
        console.log(chalk.dim(`   Session ID saved to .neurcode/config.json`));
      }
    } catch (stateError) {
      // Log warning but don't fail the command
      if (process.env.DEBUG) {
        console.warn(chalk.yellow(`⚠️  Could not save sessionId/planId to state: ${stateError instanceof Error ? stateError.message : 'Unknown error'}`));
      }
    }
  } catch (error) {
    console.error(chalk.red('\n❌ Error generating plan:'));
    
    if (error instanceof Error) {
      console.error(chalk.red(error.message));
      
      if (error.message.includes('API request failed')) {
        console.log(chalk.dim('\n💡 Make sure:'));
        console.log(chalk.dim('  • Your API key is valid'));
        console.log(chalk.dim('  • The API URL is correct'));
        console.log(chalk.dim('  • You have network connectivity'));
      }
    } else {
      console.error(error);
    }
    
    process.exit(1);
  }
}

