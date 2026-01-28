import { DiffFile } from '@neurcode-ai/diff-parser';

/**
 * Severity levels for rule violations
 */
export type Severity = 'allow' | 'warn' | 'block';

/**
 * Overall decision based on violations
 */
export type Decision = 'allow' | 'warn' | 'block';

/**
 * Rule violation result
 */
export interface RuleViolation {
  rule: string;
  file: string;
  severity: Severity;
  message?: string;
  line?: number;
  column?: number;
}

/**
 * Result of rule evaluation
 */
export interface RuleResult {
  decision: Decision;
  violations: RuleViolation[];
}

/**
 * Rule types supported by the engine
 */
export type RuleType = 
  | 'sensitive-file'
  | 'large-change'
  | 'suspicious-keywords'
  | 'potential-secret'
  | 'large-migration'
  | 'path-pattern'
  | 'line-pattern'
  | 'file-size'
  | 'custom';

/**
 * Base rule configuration
 */
export interface BaseRule {
  id: string;
  name: string;
  description?: string;
  enabled: boolean;
  severity: Severity;
  type: RuleType;
}

/**
 * Sensitive file rule - blocks modification of sensitive files
 */
export interface SensitiveFileRule extends BaseRule {
  type: 'sensitive-file';
  patterns: string[]; // Regex patterns for file paths
}

/**
 * Large change rule - warns on large LOC changes
 */
export interface LargeChangeRule extends BaseRule {
  type: 'large-change';
  threshold: number; // Lines of code threshold
}

/**
 * Suspicious keywords rule - warns on dangerous code patterns
 */
export interface SuspiciousKeywordsRule extends BaseRule {
  type: 'suspicious-keywords';
  keywords: string[]; // Keywords to detect (case-insensitive)
}

/**
 * Potential secret rule - blocks potential secrets in code
 */
export interface PotentialSecretRule extends BaseRule {
  type: 'potential-secret';
  patterns: string[]; // Regex patterns for secrets
}

/**
 * Large migration rule - warns on large database migrations
 */
export interface LargeMigrationRule extends BaseRule {
  type: 'large-migration';
  threshold: number; // Lines of code threshold
  migrationPatterns: string[]; // Regex patterns for migration files
}

/**
 * Path pattern rule - matches file paths
 */
export interface PathPatternRule extends BaseRule {
  type: 'path-pattern';
  pattern: string; // Regex pattern for file paths
  matchType: 'include' | 'exclude'; // Whether to match included or excluded paths
}

/**
 * Line pattern rule - matches content in lines
 */
export interface LinePatternRule extends BaseRule {
  type: 'line-pattern';
  pattern: string; // Regex pattern for line content
  matchType: 'added' | 'removed' | 'both'; // Which lines to check
}

/**
 * File size rule - checks file size limits
 */
export interface FileSizeRule extends BaseRule {
  type: 'file-size';
  maxSize: number; // Maximum file size in bytes
}

/**
 * Custom rule - extensible rule type
 */
export interface CustomRule extends BaseRule {
  type: 'custom';
  evaluator: string; // Function name or identifier for custom evaluator
  config: Record<string, any>; // Custom configuration
}

/**
 * Union type for all rule types
 */
export type Rule = 
  | SensitiveFileRule
  | LargeChangeRule
  | SuspiciousKeywordsRule
  | PotentialSecretRule
  | LargeMigrationRule
  | PathPatternRule
  | LinePatternRule
  | FileSizeRule
  | CustomRule;

/**
 * Policy configuration
 */
export interface Policy {
  id: string;
  name: string;
  description?: string;
  version: string;
  rules: Rule[];
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Policy evaluation context
 */
export interface EvaluationContext {
  diffFiles: DiffFile[];
  projectId?: string;
  customData?: Record<string, any>;
}


