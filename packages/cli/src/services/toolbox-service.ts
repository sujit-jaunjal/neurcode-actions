/**
 * Toolbox Service
 * 
 * Provides smart, context-aware toolbox summary generation with Top-K
 * relevance filtering. This service is used by both `plan` and `prompt`
 * commands to ensure consistent, intelligent tool selection.
 */

import { ProjectMap, ExportItem } from './mapper/ProjectScanner';
import { getTopKTools } from '../utils/RelevanceScorer';

/**
 * Generate a concise "Toolbox Summary" from the asset map
 * Uses Top-K relevance filtering to show only the most relevant tools
 * 
 * @param map - Project map containing all global exports
 * @param intent - User's intent/query for relevance scoring
 * @returns Formatted toolbox summary string, or empty string if no exports
 */
export function generateToolboxSummary(map: ProjectMap, intent: string): string {
  if (map.globalExports.length === 0) {
    return '';
  }

  const totalExports = map.globalExports.length;
  const topK = 20; // Show top 20 most relevant tools
  
  // Filter exports using relevance scoring
  const relevantExports = getTopKTools(intent, map.globalExports, topK);
  
  if (relevantExports.length === 0) {
    return '';
  }

  // Group filtered exports by file
  const exportsByFile = new Map<string, ExportItem[]>();
  for (const exp of relevantExports) {
    if (!exportsByFile.has(exp.filePath)) {
      exportsByFile.set(exp.filePath, []);
    }
    exportsByFile.get(exp.filePath)!.push(exp);
  }

  // Build summary string with header showing count
  const lines: string[] = [];
  lines.push(`\n=== Available Tools (Showing ${relevantExports.length} of ${totalExports} tools most relevant to your intent) ===`);
  
  for (const [filePath, exports] of exportsByFile.entries()) {
    const exportNames = exports
      .map(exp => {
        if (exp.name === 'default') return 'default';
        if (exp.signature) {
          // Extract just the function/class name and params for brevity
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
  
  return lines.join('\n');
}
