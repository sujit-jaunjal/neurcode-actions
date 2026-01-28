import { DiffFile } from '@neurcode-ai/diff-parser';
import { Rule, RuleViolation, RuleResult, Decision, EvaluationContext } from './types';

/**
 * Evaluate a single rule against a diff file
 */
function evaluateRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (!rule.enabled) {
    return [];
  }

  const violations: RuleViolation[] = [];

  switch (rule.type) {
    case 'sensitive-file':
      violations.push(...evaluateSensitiveFileRule(rule, file));
      break;
    case 'large-change':
      violations.push(...evaluateLargeChangeRule(rule, file));
      break;
    case 'suspicious-keywords':
      violations.push(...evaluateSuspiciousKeywordsRule(rule, file));
      break;
    case 'potential-secret':
      violations.push(...evaluatePotentialSecretRule(rule, file));
      break;
    case 'large-migration':
      violations.push(...evaluateLargeMigrationRule(rule, file));
      break;
    case 'path-pattern':
      violations.push(...evaluatePathPatternRule(rule, file));
      break;
    case 'line-pattern':
      violations.push(...evaluateLinePatternRule(rule, file));
      break;
    case 'file-size':
      violations.push(...evaluateFileSizeRule(rule, file));
      break;
    case 'custom':
      // Custom rules would need a custom evaluator function
      // For now, skip them
      break;
  }

  return violations;
}

/**
 * Evaluate sensitive file rule
 */
function evaluateSensitiveFileRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'sensitive-file') return [];

  const patterns = rule.patterns.map(p => new RegExp(p, 'i'));
  const matches = patterns.some(pattern => pattern.test(file.path));

  if (matches) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || 'Modification of sensitive file detected',
    }];
  }

  return [];
}

/**
 * Evaluate large change rule
 */
function evaluateLargeChangeRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'large-change') return [];

  const totalChanges = file.addedLines + file.removedLines;
  if (totalChanges > rule.threshold) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `Large change detected: ${totalChanges} lines modified (threshold: ${rule.threshold})`,
    }];
  }

  return [];
}

/**
 * Evaluate suspicious keywords rule
 */
function evaluateSuspiciousKeywordsRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'suspicious-keywords') return [];

  const found: string[] = [];
  const addedContent = file.hunks
    .flatMap(hunk => hunk.lines)
    .filter(line => line.type === 'added')
    .map(line => line.content.toLowerCase());

  for (const keyword of rule.keywords) {
    if (addedContent.some(content => content.includes(keyword.toLowerCase()))) {
      found.push(keyword);
    }
  }

  if (found.length > 0) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `Suspicious keywords found: ${found.join(', ')}`,
    }];
  }

  return [];
}

/**
 * Evaluate potential secret rule
 */
function evaluatePotentialSecretRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'potential-secret') return [];

  const patterns = rule.patterns.map(p => new RegExp(p, 'i'));
  const found: string[] = [];
  const addedContent = file.hunks
    .flatMap(hunk => hunk.lines)
    .filter(line => line.type === 'added')
    .map(line => line.content);

  for (const line of addedContent) {
    for (const pattern of patterns) {
      if (pattern.test(line)) {
        found.push(line.substring(0, 50) + (line.length > 50 ? '...' : ''));
        break; // Only count once per line
      }
    }
  }

  if (found.length > 0) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `Potential secrets detected: ${found.length} occurrence(s)`,
    }];
  }

  return [];
}

/**
 * Evaluate large migration rule
 */
function evaluateLargeMigrationRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'large-migration') return [];

  const migrationPatterns = rule.migrationPatterns.map(p => new RegExp(p, 'i'));
  const isMigration = migrationPatterns.some(pattern => pattern.test(file.path));

  if (isMigration) {
    const totalChanges = file.addedLines + file.removedLines;
    if (totalChanges > rule.threshold) {
      return [{
        rule: rule.id,
        file: file.path,
        severity: rule.severity,
        message: rule.description || `Large database migration detected: ${totalChanges} lines (threshold: ${rule.threshold})`,
      }];
    }
  }

  return [];
}

/**
 * Evaluate path pattern rule
 */
function evaluatePathPatternRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'path-pattern') return [];

  const pattern = new RegExp(rule.pattern, 'i');
  const matches = pattern.test(file.path);

  if ((rule.matchType === 'include' && matches) || (rule.matchType === 'exclude' && !matches)) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `File path matches pattern: ${rule.pattern}`,
    }];
  }

  return [];
}

/**
 * Evaluate line pattern rule
 */
function evaluateLinePatternRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'line-pattern') return [];

  const pattern = new RegExp(rule.pattern, 'i');
  const found: string[] = [];

  const linesToCheck = file.hunks.flatMap(hunk => hunk.lines).filter(line => {
    if (rule.matchType === 'added') return line.type === 'added';
    if (rule.matchType === 'removed') return line.type === 'removed';
    return true; // 'both'
  });

  for (const line of linesToCheck) {
    if (pattern.test(line.content)) {
      found.push(line.content.substring(0, 50) + (line.content.length > 50 ? '...' : ''));
    }
  }

  if (found.length > 0) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `Line pattern matched: ${found.length} occurrence(s)`,
    }];
  }

  return [];
}

/**
 * Evaluate file size rule
 */
function evaluateFileSizeRule(rule: Rule, file: DiffFile): RuleViolation[] {
  if (rule.type !== 'file-size') return [];

  // Calculate file size from added lines
  const fileSize = file.hunks
    .flatMap(hunk => hunk.lines)
    .filter(line => line.type === 'added')
    .reduce((size, line) => size + line.content.length + 1, 0); // +1 for newline

  if (fileSize > rule.maxSize) {
    return [{
      rule: rule.id,
      file: file.path,
      severity: rule.severity,
      message: rule.description || `File size exceeds limit: ${fileSize} bytes (max: ${rule.maxSize} bytes)`,
    }];
  }

  return [];
}

/**
 * Evaluate all rules against diff files
 */
export function evaluateRules(
  diffFiles: DiffFile[],
  rules: Rule[] = []
): RuleResult {
  const violations: RuleViolation[] = [];

  // Evaluate each rule against each file
  for (const file of diffFiles) {
    for (const rule of rules) {
      const fileViolations = evaluateRule(rule, file);
      violations.push(...fileViolations);
    }
  }

  // Determine overall decision
  const hasBlock = violations.some(v => v.severity === 'block');
  const hasWarn = violations.some(v => v.severity === 'warn');

  const decision: Decision = hasBlock ? 'block' : hasWarn ? 'warn' : 'allow';

  return {
    decision,
    violations,
  };
}

/**
 * Evaluate rules with context
 */
export function evaluateRulesWithContext(
  context: EvaluationContext,
  rules: Rule[] = []
): RuleResult {
  return evaluateRules(context.diffFiles, rules);
}


