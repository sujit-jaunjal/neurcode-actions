/**
 * End-to-End Integration Test: Semantic Retrieval Logic
 * 
 * Tests the Top-K relevance filtering in generateToolboxSummary
 */

import { ProjectMap, ExportItem } from '../services/mapper/ProjectScanner';

// Import the function we need to test (we'll need to export it or test it indirectly)
// For now, we'll create a testable version

/**
 * Generate a comprehensive mock asset map with 100+ diverse exports
 */
function generateMockAssetMap(): ProjectMap {
  const exports: ExportItem[] = [];

  // === SUBSCRIPTION & TRIAL RELATED (Target exports - should appear in top results) ===
  exports.push({
    name: 'createTrialSubscription',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'createTrialSubscription(userId: string, planId: string, countryCode?: string): Promise<Subscription>',
    type: 'function'
  });
  exports.push({
    name: 'checkAndHandleTrialExpiration',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'checkAndHandleTrialExpiration(userId: string): Promise<void>',
    type: 'function'
  });
  exports.push({
    name: 'isInTrial',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'isInTrial(subscription: Subscription): boolean',
    type: 'function'
  });
  exports.push({
    name: 'getActiveSubscription',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'getActiveSubscription(userId: string): Promise<Subscription | null>',
    type: 'function'
  });
  exports.push({
    name: 'getOrCreateFreeSubscription',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'getOrCreateFreeSubscription(userId: string): Promise<Subscription>',
    type: 'function'
  });
  exports.push({
    name: 'Subscription',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'interface Subscription { id: string; userId: string; planId: string; status: string; trialEnd?: Date; }',
    type: 'interface'
  });
  exports.push({
    name: 'TrialConfig',
    filePath: 'services/api/src/lib/subscriptions.ts',
    signature: 'type TrialConfig = { duration: number; days: number }',
    type: 'type'
  });

  // === AUTH RELATED ===
  exports.push({ name: 'authenticateUser', filePath: 'services/api/src/lib/auth.ts', signature: 'authenticateUser(email: string, password: string): Promise<User>', type: 'function' });
  exports.push({ name: 'validateAuthToken', filePath: 'services/api/src/lib/auth.ts', signature: 'validateAuthToken(token: string): Promise<User>', type: 'function' });
  exports.push({ name: 'refreshAuthToken', filePath: 'services/api/src/lib/auth.ts', signature: 'refreshAuthToken(refreshToken: string): Promise<TokenPair>', type: 'function' });
  exports.push({ name: 'logoutUser', filePath: 'services/api/src/lib/auth.ts', signature: 'logoutUser(userId: string): Promise<void>', type: 'function' });
  exports.push({ name: 'AuthService', filePath: 'services/api/src/lib/auth.ts', signature: 'class AuthService { authenticate(): Promise<User> }', type: 'class' });
  exports.push({ name: 'AuthConfig', filePath: 'services/api/src/lib/auth.ts', signature: 'interface AuthConfig { secret: string; expiresIn: number }', type: 'interface' });
  exports.push({ name: 'User', filePath: 'services/api/src/lib/auth.ts', signature: 'interface User { id: string; email: string; role: string }', type: 'interface' });

  // === DATABASE RELATED ===
  exports.push({ name: 'initPostgresDatabase', filePath: 'services/api/src/db/init.ts', signature: 'initPostgresDatabase(): Promise<void>', type: 'function' });
  exports.push({ name: 'runMigrations', filePath: 'services/api/src/db/migrations.ts', signature: 'runMigrations(): Promise<void>', type: 'function' });
  exports.push({ name: 'query', filePath: 'services/api/src/db/index.ts', signature: 'query(sql: string, params?: any[]): Promise<QueryResult>', type: 'function' });
  exports.push({ name: 'DatabaseClient', filePath: 'services/api/src/db/index.ts', signature: 'class DatabaseClient { connect(): Promise<void> }', type: 'class' });
  exports.push({ name: 'DbConfig', filePath: 'services/api/src/db/index.ts', signature: 'interface DbConfig { host: string; port: number; database: string }', type: 'interface' });

  // === ROI & ANALYTICS ===
  exports.push({ name: 'logROIEvent', filePath: 'packages/cli/src/utils/ROILogger.ts', signature: 'logROIEvent(event: string, data: object, projectId?: string): Promise<void>', type: 'function' });
  exports.push({ name: 'calculateROI', filePath: 'packages/cli/src/utils/ROILogger.ts', signature: 'calculateROI(projectId: string): Promise<number>', type: 'function' });
  exports.push({ name: 'getROIMetrics', filePath: 'packages/cli/src/utils/ROILogger.ts', signature: 'getROIMetrics(projectId: string): Promise<ROIMetrics>', type: 'function' });
  exports.push({ name: 'ROIMetrics', filePath: 'packages/cli/src/utils/ROILogger.ts', signature: 'interface ROIMetrics { totalSavings: number; timeSaved: number }', type: 'interface' });

  // === UI COMPONENTS ===
  exports.push({ name: 'Button', filePath: 'web/dashboard/src/components/Button.tsx', signature: 'function Button(props: ButtonProps): JSX.Element', type: 'function' });
  exports.push({ name: 'ButtonProps', filePath: 'web/dashboard/src/components/Button.tsx', signature: 'interface ButtonProps { label: string; onClick: () => void }', type: 'interface' });
  exports.push({ name: 'Modal', filePath: 'web/dashboard/src/components/Modal.tsx', signature: 'function Modal(props: ModalProps): JSX.Element', type: 'function' });
  exports.push({ name: 'Input', filePath: 'web/dashboard/src/components/Input.tsx', signature: 'function Input(props: InputProps): JSX.Element', type: 'function' });
  exports.push({ name: 'Card', filePath: 'web/dashboard/src/components/Card.tsx', signature: 'function Card(props: CardProps): JSX.Element', type: 'function' });

  // === CLI COMMANDS (Core Guard - should always appear) ===
  exports.push({ name: 'plan', filePath: 'packages/cli/src/commands/plan.ts', signature: 'planCommand(intent: string, options: PlanOptions): Promise<void>', type: 'function' });
  exports.push({ name: 'verify', filePath: 'packages/cli/src/commands/verify.ts', signature: 'verifyCommand(): Promise<void>', type: 'function' });
  exports.push({ name: 'apply', filePath: 'packages/cli/src/commands/apply.ts', signature: 'applyCommand(planId: string): Promise<void>', type: 'function' });
  exports.push({ name: 'check', filePath: 'packages/cli/src/commands/check.ts', signature: 'checkCommand(): Promise<void>', type: 'function' });
  exports.push({ name: 'generate', filePath: 'packages/cli/src/commands/generate.ts', signature: 'generateCommand(type: string): Promise<void>', type: 'function' });
  exports.push({ name: 'create', filePath: 'packages/cli/src/commands/create.ts', signature: 'createCommand(name: string): Promise<void>', type: 'function' });
  exports.push({ name: 'update', filePath: 'packages/cli/src/commands/update.ts', signature: 'updateCommand(id: string): Promise<void>', type: 'function' });
  exports.push({ name: 'save', filePath: 'packages/cli/src/utils/save.ts', signature: 'save(data: any): Promise<void>', type: 'function' });
  exports.push({ name: 'load', filePath: 'packages/cli/src/utils/load.ts', signature: 'load(path: string): Promise<any>', type: 'function' });
  exports.push({ name: 'init', filePath: 'packages/cli/src/commands/init.ts', signature: 'initCommand(): Promise<void>', type: 'function' });
  exports.push({ name: 'config', filePath: 'packages/cli/src/commands/config.ts', signature: 'configCommand(): Promise<void>', type: 'function' });
  exports.push({ name: 'help', filePath: 'packages/cli/src/commands/help.ts', signature: 'helpCommand(): Promise<void>', type: 'function' });

  // === UNRELATED TOOLS (Should NOT appear in top results) ===
  exports.push({ name: 'revertCommand', filePath: 'packages/cli/src/commands/revert.ts', signature: 'revertCommand(filePath: string): Promise<void>', type: 'function' });
  exports.push({ name: 'deleteFile', filePath: 'packages/cli/src/utils/file-ops.ts', signature: 'deleteFile(path: string): Promise<void>', type: 'function' });
  exports.push({ name: 'formatCode', filePath: 'packages/cli/src/utils/formatter.ts', signature: 'formatCode(code: string): string', type: 'function' });
  exports.push({ name: 'lintCode', filePath: 'packages/cli/src/utils/linter.ts', signature: 'lintCode(code: string): LintResult', type: 'function' });
  exports.push({ name: 'compileTypeScript', filePath: 'packages/cli/src/utils/compiler.ts', signature: 'compileTypeScript(files: string[]): Promise<void>', type: 'function' });

  // === ADD MORE DIVERSE EXPORTS TO REACH 100+ ===
  // API Routes
  for (let i = 1; i <= 10; i++) {
    exports.push({ name: `apiRoute${i}`, filePath: `services/api/src/routes/route${i}.ts`, signature: `apiRoute${i}(req: Request): Promise<Response>`, type: 'function' });
  }

  // Utility Functions
  const utils = ['formatDate', 'parseJSON', 'validateEmail', 'sanitizeInput', 'hashPassword', 'comparePasswords', 'generateToken', 'encryptData', 'decryptData', 'compressData'];
  utils.forEach(util => {
    exports.push({ name: util, filePath: `services/api/src/utils/${util}.ts`, signature: `${util}(input: any): any`, type: 'function' });
  });

  // Middleware
  const middleware = ['authMiddleware', 'rateLimitMiddleware', 'corsMiddleware', 'loggingMiddleware', 'errorMiddleware'];
  middleware.forEach(mw => {
    exports.push({ name: mw, filePath: `services/api/src/middleware/${mw}.ts`, signature: `${mw}(req: Request, res: Response, next: NextFunction): void`, type: 'function' });
  });

  // Services
  const services = ['EmailService', 'NotificationService', 'PaymentService', 'StorageService', 'CacheService'];
  services.forEach(service => {
    exports.push({ name: service, filePath: `services/api/src/services/${service}.ts`, signature: `class ${service} { process(): Promise<void> }`, type: 'class' });
  });

  // Types and Interfaces
  const types = ['ApiResponse', 'ErrorResponse', 'SuccessResponse', 'PaginationParams', 'SortParams', 'FilterParams'];
  types.forEach(type => {
    exports.push({ name: type, filePath: `services/api/src/types/${type}.ts`, signature: `interface ${type} { data: any }`, type: 'interface' });
  });

  // React Hooks
  const hooks = ['useAuth', 'useSubscription', 'useNotifications', 'useTheme', 'useLocalStorage'];
  hooks.forEach(hook => {
    exports.push({ name: hook, filePath: `web/dashboard/src/hooks/${hook}.ts`, signature: `function ${hook}(): any`, type: 'function' });
  });

  // More UI Components
  const components = ['Table', 'Form', 'Dropdown', 'Checkbox', 'Radio', 'Select', 'Textarea', 'Label'];
  components.forEach(comp => {
    exports.push({ name: comp, filePath: `web/dashboard/src/components/${comp}.tsx`, signature: `function ${comp}(props: any): JSX.Element`, type: 'function' });
  });

  // Test Utilities
  const testUtils = ['mockApi', 'renderWithProviders', 'createTestUser', 'waitForElement'];
  testUtils.forEach(testUtil => {
    exports.push({ name: testUtil, filePath: `packages/cli/src/__tests__/utils/${testUtil}.ts`, signature: `${testUtil}(...args: any[]): any`, type: 'function' });
  });

  // Add more to ensure we have 100+
  for (let i = 1; i <= 20; i++) {
    exports.push({ name: `utilityFunction${i}`, filePath: `services/api/src/utils/utility${i}.ts`, signature: `utilityFunction${i}(): void`, type: 'function' });
  }

  return {
    files: {},
    globalExports: exports,
    scannedAt: new Date().toISOString()
  };
}

/**
 * Approximate token count (1 token ≈ 4 characters)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract the "Available Tools" section from enhanced intent
 */
function extractAvailableToolsSection(enhancedIntent: string): string {
  const startMarker = '=== Available Tools';
  const endMarker = '=== END Available Tools ===';
  
  const startIndex = enhancedIntent.indexOf(startMarker);
  const endIndex = enhancedIntent.indexOf(endMarker);
  
  if (startIndex === -1 || endIndex === -1) {
    return '';
  }
  
  return enhancedIntent.substring(startIndex, endIndex + endMarker.length);
}

/**
 * Main test execution
 */
async function runIntegrationTest() {
  console.log('🧪 Starting End-to-End Integration Test: Semantic Retrieval Logic\n');
  console.log('=' .repeat(80));
  
  // Step 1: Generate mock asset map
  console.log('\n📦 Step 1: Generating Mock Asset Map...');
  const mockMap = generateMockAssetMap();
  console.log(`✅ Generated ${mockMap.globalExports.length} exports`);
  
  // Step 2: Test intent
  const testIntent = 'Change the PRO trial duration to 30 days';
  console.log(`\n🎯 Step 2: Test Intent: "${testIntent}"`);
  
  // Step 3: Import and test generateToolboxSummary
  // Since it's not exported, we'll need to test it via the actual implementation
  // For this test, we'll import the RelevanceScorer directly and simulate the flow
  const { getTopKTools } = await import('../utils/RelevanceScorer');
  
  // Simulate generateToolboxSummary logic
  const totalExports = mockMap.globalExports.length;
  const topK = 20;
  const relevantExports = getTopKTools(testIntent, mockMap.globalExports, topK);
  
  // Group by file (same logic as generateToolboxSummary)
  const exportsByFile = new Map<string, ExportItem[]>();
  for (const exp of relevantExports) {
    if (!exportsByFile.has(exp.filePath)) {
      exportsByFile.set(exp.filePath, []);
    }
    exportsByFile.get(exp.filePath)!.push(exp);
  }
  
  // Build summary string
  const lines: string[] = [];
  lines.push(`\n=== Available Tools (Showing ${relevantExports.length} of ${totalExports} tools most relevant to your intent) ===`);
  
  for (const [filePath, exports] of exportsByFile.entries()) {
    const exportNames = exports
      .map(exp => {
        if (exp.name === 'default') return 'default';
        if (exp.signature) {
          const sig = exp.signature.replace(/\s+/g, ' ').trim();
          return sig.length > 60 ? `${exp.name}(...)` : sig;
        }
        return exp.name;
      })
      .join(', ');
    
    lines.push(`${filePath}: ${exportNames}`);
  }
  
  lines.push('=== END Available Tools ===');
  if (totalExports > topK) {
    lines.push(`\n💡 If you need a tool not listed here, specify the file path in your next request.`);
  }
  lines.push('');
  
  const toolboxSummary = lines.join('\n');
  
  // Step 4: Build enhanced intent (simulating plan.ts line 415)
  const enrichedIntent = testIntent;
  const enhancedIntent = `${enrichedIntent}\n\n${toolboxSummary}\n\nIMPORTANT: The "Available Tools" list above shows existing code that CAN be reused. Only reference tools from this list if they are directly relevant to the user's intent. Do not create new files, functions, or features unless the user explicitly requested them. The list is for reference only - not a requirement to use everything.`;
  
  // Step 5: Extract Available Tools section
  const availableToolsSection = extractAvailableToolsSection(enhancedIntent);
  
  // Step 6: Calculate token counts
  const beforeTokens = estimateTokens(
    mockMap.globalExports.map(e => `${e.filePath}: ${e.name}`).join('\n')
  );
  const afterTokens = estimateTokens(availableToolsSection);
  const tokenReduction = ((beforeTokens - afterTokens) / beforeTokens) * 100;
  
  // Step 7: Assertions
  console.log('\n🔍 Step 3: Running Assertions...\n');
  
  const assertions: Array<{ name: string; passed: boolean; details: string }> = [];
  
  // Assertion 1: Relevance - subscription/trial functions in top results
  const subscriptionExports = relevantExports.filter(e => 
    e.name.includes('Trial') || 
    e.name.includes('trial') || 
    e.name.includes('Subscription') ||
    e.name.includes('subscription') ||
    e.filePath.includes('subscriptions')
  );
  const hasRelevantExports = subscriptionExports.length > 0;
  assertions.push({
    name: 'Relevance: Subscription/Trial functions appear in top results',
    passed: hasRelevantExports,
    details: hasRelevantExports 
      ? `✅ Found ${subscriptionExports.length} relevant exports: ${subscriptionExports.map(e => e.name).join(', ')}`
      : `❌ No subscription/trial exports found in top ${topK} results`
  });
  
  // Assertion 2: Specific functions in top 5
  const top5Names = relevantExports.slice(0, 5).map(e => e.name);
  const hasCreateTrial = top5Names.some(name => name.includes('createTrial') || name.includes('CreateTrial'));
  const hasCheckTrial = top5Names.some(name => name.includes('checkAndHandleTrial') || name.includes('CheckAndHandleTrial'));
  assertions.push({
    name: 'Relevance: createTrialSubscription or checkAndHandleTrialExpiration in top 5',
    passed: hasCreateTrial || hasCheckTrial,
    details: (hasCreateTrial || hasCheckTrial)
      ? `✅ Found in top 5: ${top5Names.join(', ')}`
      : `❌ Not found in top 5. Top 5: ${top5Names.join(', ')}`
  });
  
  // Assertion 3: Exclusion - unrelated tools NOT in list
  const unrelatedTools = relevantExports.filter(e => 
    e.name === 'revertCommand' || 
    e.name === 'initPostgresDatabase' ||
    e.filePath.includes('revert') ||
    e.filePath.includes('postgres')
  );
  assertions.push({
    name: 'Exclusion: Unrelated tools (revertCommand, initPostgresDatabase) NOT in Top-K',
    passed: unrelatedTools.length === 0,
    details: unrelatedTools.length === 0
      ? `✅ No unrelated tools found in top ${topK} results`
      : `❌ Found unrelated tools: ${unrelatedTools.map(e => e.name).join(', ')}`
  });
  
  // Assertion 4: Core Guard - plan, verify, apply present
  const coreTools = ['plan', 'verify', 'apply'];
  const foundCoreTools = coreTools.filter(tool => 
    relevantExports.some(e => e.name.toLowerCase().includes(tool))
  );
  assertions.push({
    name: 'Core Guard: plan, verify, apply are present',
    passed: foundCoreTools.length >= 3,
    details: foundCoreTools.length >= 3
      ? `✅ All core tools present: ${foundCoreTools.join(', ')}`
      : `❌ Missing core tools. Found: ${foundCoreTools.join(', ')}, Expected: ${coreTools.join(', ')}`
  });
  
  // Assertion 5: Header check
  const hasHeader = availableToolsSection.includes('Showing') && availableToolsSection.includes('of') && availableToolsSection.includes('tools most relevant');
  assertions.push({
    name: 'Header: Contains "Showing X of Y tools most relevant to your intent"',
    passed: hasHeader,
    details: hasHeader
      ? `✅ Header format correct`
      : `❌ Header format incorrect or missing`
  });
  
  // Step 8: Display results
  console.log('📊 Test Results:\n');
  assertions.forEach((assertion, index) => {
    const icon = assertion.passed ? '✅' : '❌';
    console.log(`${icon} Assertion ${index + 1}: ${assertion.name}`);
    console.log(`   ${assertion.details}\n`);
  });
  
  // Step 9: Token Analysis
  console.log('📈 Token Analysis:\n');
  console.log(`   Before (all exports): ~${beforeTokens} tokens`);
  console.log(`   After (Top-K filtered): ~${afterTokens} tokens`);
  console.log(`   Reduction: ${tokenReduction.toFixed(1)}%\n`);
  
  // Step 10: Signal-to-Noise Ratio
  const signalToNoise = relevantExports.length / totalExports;
  console.log('📡 Signal-to-Noise Ratio:\n');
  console.log(`   Total exports: ${totalExports}`);
  console.log(`   Relevant exports shown: ${relevantExports.length}`);
  console.log(`   Ratio: 1:${(totalExports / relevantExports.length).toFixed(1)} (${(signalToNoise * 100).toFixed(1)}% signal)\n`);
  
  // Step 11: Display top results
  console.log('🎯 Top 20 Most Relevant Tools:\n');
  relevantExports.forEach((exp, index) => {
    const isSubscription = exp.filePath.includes('subscriptions') || exp.name.toLowerCase().includes('trial') || exp.name.toLowerCase().includes('subscription');
    const marker = isSubscription ? '⭐' : '  ';
    console.log(`${marker} ${index + 1}. ${exp.name} (${exp.type}) - ${exp.filePath}`);
  });
  
  // Step 12: Full enhanced intent (truncated for readability)
  console.log('\n📝 Enhanced Intent (Available Tools Section):\n');
  console.log(availableToolsSection.substring(0, 1000) + (availableToolsSection.length > 1000 ? '...\n[truncated]' : ''));
  
  // Final summary
  const allPassed = assertions.every(a => a.passed);
  console.log('\n' + '='.repeat(80));
  console.log(`\n${allPassed ? '✅' : '❌'} Test ${allPassed ? 'PASSED' : 'FAILED'}`);
  console.log(`   Assertions passed: ${assertions.filter(a => a.passed).length}/${assertions.length}`);
  console.log(`   Token reduction: ${tokenReduction.toFixed(1)}%`);
  console.log(`   Signal-to-noise improvement: ${((1 - signalToNoise) * 100).toFixed(1)}% noise eliminated\n`);
  
  return {
    passed: allPassed,
    assertions,
    tokenReduction,
    signalToNoise,
    relevantExports: relevantExports.map(e => e.name)
  };
}

// Run the test if this file is executed directly
if (require.main === module) {
  runIntegrationTest()
    .then(result => {
      process.exit(result.passed ? 0 : 1);
    })
    .catch(error => {
      console.error('❌ Test execution failed:', error);
      process.exit(1);
    });
}

export { runIntegrationTest, generateMockAssetMap };

