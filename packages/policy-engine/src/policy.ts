import { Policy, Rule } from './types';
import { defaultRules } from './default-rules';

/**
 * Load a policy from JSON
 */
export function loadPolicy(json: string | object): Policy {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  
  // Validate policy structure
  if (!data.id || !data.name || !data.version || !Array.isArray(data.rules)) {
    throw new Error('Invalid policy format: missing required fields');
  }

  return data as Policy;
}

/**
 * Create a policy from rules
 */
export function createPolicy(
  id: string,
  name: string,
  rules: Rule[],
  description?: string,
  version: string = '1.0.0'
): Policy {
  return {
    id,
    name,
    description,
    version,
    rules,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Create a default policy with built-in rules
 */
export function createDefaultPolicy(projectId?: string): Policy {
  return createPolicy(
    projectId ? `default-${projectId}` : 'default',
    'Default Neurcode Policy',
    defaultRules,
    'Default policy with built-in security and quality rules',
    '1.0.0'
  );
}

/**
 * Merge multiple policies (later rules override earlier ones)
 */
export function mergePolicies(...policies: Policy[]): Policy {
  if (policies.length === 0) {
    return createDefaultPolicy();
  }

  const ruleMap = new Map<string, Rule>();

  // Add rules from all policies, later ones override earlier ones
  for (const policy of policies) {
    for (const rule of policy.rules) {
      ruleMap.set(rule.id, rule);
    }
  }

  const mergedPolicy = policies[0];
  return {
    ...mergedPolicy,
    rules: Array.from(ruleMap.values()),
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Validate a policy
 */
export function validatePolicy(policy: Policy): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!policy.id) {
    errors.push('Policy must have an id');
  }

  if (!policy.name) {
    errors.push('Policy must have a name');
  }

  if (!policy.version) {
    errors.push('Policy must have a version');
  }

  if (!Array.isArray(policy.rules)) {
    errors.push('Policy must have a rules array');
  } else {
    for (let i = 0; i < policy.rules.length; i++) {
      const rule = policy.rules[i];
      if (!rule.id) {
        errors.push(`Rule at index ${i} must have an id`);
      }
      if (!rule.name) {
        errors.push(`Rule at index ${i} must have a name`);
      }
      if (!rule.type) {
        errors.push(`Rule at index ${i} must have a type`);
      }
      if (!rule.severity) {
        errors.push(`Rule at index ${i} must have a severity`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Export policy to JSON
 */
export function exportPolicy(policy: Policy): string {
  return JSON.stringify(policy, null, 2);
}






