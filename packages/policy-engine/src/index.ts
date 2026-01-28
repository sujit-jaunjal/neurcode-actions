/**
 * @neurcode-ai/policy-engine
 * 
 * Policy engine for evaluating code changes against configurable rules
 */

// Types
export * from './types';

// Policy management
export * from './policy';

// Rule evaluation
export * from './evaluator';

// Default rules
export { defaultRules } from './default-rules';

// Re-export for convenience
import { evaluateRules, evaluateRulesWithContext } from './evaluator';
import { createDefaultPolicy, loadPolicy, createPolicy, mergePolicies, validatePolicy, exportPolicy } from './policy';
import { defaultRules } from './default-rules';

/**
 * Main API for the policy engine
 */
export const PolicyEngine = {
  // Rule evaluation
  evaluateRules,
  evaluateRulesWithContext,

  // Policy management
  createDefaultPolicy,
  loadPolicy,
  createPolicy,
  mergePolicies,
  validatePolicy,
  exportPolicy,

  // Default rules
  defaultRules,
};

// Default export
export default PolicyEngine;


