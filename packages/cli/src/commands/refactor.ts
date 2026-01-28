import { Command } from 'commander';
import { ApiClient } from '../api-client';
import { loadConfig } from '../config';
import * as fs from 'fs';
import * as path from 'path';

export function refactorCommand(program: Command): void {
  program
    .command('refactor')
    .description('Get AI-powered refactoring suggestions for redundant code')
    .argument('<file>', 'Path to the file to refactor')
    .option('--redundant-blocks <json>', 'JSON array of redundant blocks with lines, reason, and suggestion')
    .option('--redundant-blocks-file <file>', 'Path to JSON file containing redundant blocks')
    .option('--project-type <type>', 'Project type (e.g., "web", "api", "mobile")')
    .option('--framework <framework>', 'Framework used (e.g., "react", "express", "nextjs")')
    .option('--patterns <patterns>', 'Comma-separated list of patterns used in the project')
    .option('--output <file>', 'Save optimized code to file (default: prints to stdout)')
    .option('--apply', 'Apply the refactoring suggestions to the file (creates backup)')
    .action(async (file: string, options: {
      redundantBlocks?: string;
      redundantBlocksFile?: string;
      projectType?: string;
      framework?: string;
      patterns?: string;
      output?: string;
      apply?: boolean;
    }) => {
      try {
        // Read file content
        const filePath = path.resolve(file);
        if (!fs.existsSync(filePath)) {
          console.error(`❌ Error: File not found: ${filePath}`);
          process.exit(1);
        }

        const fileContent = fs.readFileSync(filePath, 'utf-8');

        // Parse redundant blocks
        let redundantBlocks: Array<{ lines: [number, number]; reason: string; suggestion: string }> = [];
        
        if (options.redundantBlocksFile) {
          const blocksFile = path.resolve(options.redundantBlocksFile);
          if (!fs.existsSync(blocksFile)) {
            console.error(`❌ Error: Redundant blocks file not found: ${blocksFile}`);
            process.exit(1);
          }
          const blocksContent = fs.readFileSync(blocksFile, 'utf-8');
          redundantBlocks = JSON.parse(blocksContent);
        } else if (options.redundantBlocks) {
          redundantBlocks = JSON.parse(options.redundantBlocks);
        } else {
          console.error('❌ Error: Must provide --redundant-blocks or --redundant-blocks-file');
          process.exit(1);
        }

        if (!Array.isArray(redundantBlocks) || redundantBlocks.length === 0) {
          console.error('❌ Error: Redundant blocks must be a non-empty array');
          process.exit(1);
        }

        // Initialize API client
        const config = loadConfig();
        const client = new ApiClient(config);

        console.log(`\n🔄 Requesting AI refactoring suggestions for ${file}...`);
        console.log(`   Redundant blocks: ${redundantBlocks.length}`);

        // Call refactor API
        const response = await client.refactor(
          fileContent,
          redundantBlocks,
          {
            projectType: options.projectType,
            framework: options.framework,
            patterns: options.patterns?.split(',').map(p => p.trim()),
          }
        );

        const { suggestion } = response;

        // Display results
        console.log('\n📊 Refactoring Suggestions:');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        console.log(`\n📈 Improvements:`);
        suggestion.improvements.forEach((imp: any, i: number) => {
          const impactEmoji: Record<string, string> = {
            high: '🔥',
            medium: '⚡',
            low: '✨',
          };
          console.log(`   ${i + 1}. ${impactEmoji[imp.impact] || '✨'} ${imp.category}: ${imp.description}`);
        });

        console.log(`\n💾 Changes:`);
        suggestion.changes.forEach((change: any, i: number) => {
          const typeEmoji: Record<string, string> = {
            removed: '➖',
            modified: '🔄',
            added: '➕',
          };
          console.log(`   ${i + 1}. ${typeEmoji[change.type] || '•'} Lines ${change.lines[0]}-${change.lines[1]}: ${change.reason}`);
        });

        console.log(`\n💰 Savings:`);
        console.log(`   Token Savings: ${suggestion.tokenSavings.toLocaleString()}`);
        const costDisplay = suggestion.costSavings < 0.01 
          ? `$${suggestion.costSavings.toFixed(6)}` 
          : `$${suggestion.costSavings.toFixed(2)}`;
        console.log(`   Cost Savings: ${costDisplay}`);

        console.log(`\n⚠️  Risk Assessment:`);
        const riskEmoji: Record<string, string> = {
          low: '✅',
          medium: '⚠️',
          high: '🚨',
        };
        console.log(`   Risk Level: ${riskEmoji[suggestion.riskAssessment.riskLevel] || '⚠️'} ${suggestion.riskAssessment.riskLevel.toUpperCase()}`);
        console.log(`   Breaking Changes: ${suggestion.riskAssessment.breakingChanges ? '⚠️ Yes' : '✅ No'}`);
        if (suggestion.riskAssessment.warnings.length > 0) {
          console.log(`   Warnings:`);
          suggestion.riskAssessment.warnings.forEach((w: string) => console.log(`     - ${w}`));
        }

        // Save or apply
        if (options.apply) {
          // Create backup
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const backupPath = `${filePath}.backup.${timestamp}`;
          fs.writeFileSync(backupPath, fileContent, 'utf-8');
          console.log(`\n💾 Backup created: ${backupPath}`);

          // Apply refactoring
          fs.writeFileSync(filePath, suggestion.optimizedCode, 'utf-8');
          console.log(`✅ Refactoring applied to ${filePath}`);
        } else if (options.output) {
          // Save to output file
          fs.writeFileSync(options.output, suggestion.optimizedCode, 'utf-8');
          console.log(`\n✅ Optimized code saved to ${options.output}`);
        } else {
          // Print to stdout
          console.log(`\n📝 Optimized Code:`);
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          console.log(suggestion.optimizedCode);
          console.log('\n💡 Tip: Use --output <file> to save or --apply to apply directly');
        }

        process.exit(0);
      } catch (error) {
        console.error('\n❌ Error:', error instanceof Error ? error.message : error);
        process.exit(1);
      }
    });
}

