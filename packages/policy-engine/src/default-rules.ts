import { Rule } from './types';

/**
 * Default rules that come with the policy engine
 */
export const defaultRules: Rule[] = [
  {
    id: 'sensitive-file-default',
    name: 'Sensitive File Detection',
    description: 'Blocks modification of sensitive files like .env, .key, secrets files',
    enabled: true,
    severity: 'block',
    type: 'sensitive-file',
    patterns: [
      '\\.env$',
      '\\.env\\.',
      'secrets?\\.(json|yaml|yml|toml)$',
      'config/secrets?',
      '\\.pem$',
      '\\.key$',
      '\\.p12$',
      '\\.pfx$',
      'id_rsa$',
      'id_dsa$',
      '\\.credentials$',
      '\\.aws$',
      '\\.gcp$',
      '\\.azure$',
    ],
  },
  {
    id: 'large-change-default',
    name: 'Large Change Warning',
    description: 'Warns on changes larger than 1000 lines of code',
    enabled: true,
    severity: 'warn',
    type: 'large-change',
    threshold: 1000,
  },
  {
    id: 'suspicious-keywords-default',
    name: 'Suspicious Keywords Detection',
    description: 'Warns on potentially dangerous code patterns',
    enabled: true,
    severity: 'warn',
    type: 'suspicious-keywords',
    keywords: [
      'eval(',
      'exec(',
      'dangerouslySetInnerHTML',
      'innerHTML',
      'document.write',
      'Function(',
      'setTimeout(',
      'setInterval(',
      'XMLHttpRequest',
      'fetch(',
      'localStorage',
      'sessionStorage',
      'cookie',
      'document.cookie',
    ],
  },
  {
    id: 'potential-secret-default',
    name: 'Potential Secret Detection',
    description: 'Blocks potential secrets like API keys, passwords, tokens',
    enabled: true,
    severity: 'block',
    type: 'potential-secret',
    patterns: [
      '(?:api[_-]?key|apikey)\\s*[=:]\\s*[\'"]?[a-zA-Z0-9_-]{20,}[\'"]?',
      '(?:secret|password|passwd|pwd)\\s*[=:]\\s*[\'"]?[a-zA-Z0-9_-]{12,}[\'"]?',
      '(?:token|bearer)\\s+[a-zA-Z0-9_-]{20,}',
      '(?:aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)\\s*[=:]\\s*[\'"]?[a-zA-Z0-9_+/=]{20,}[\'"]?',
      '(?:private[_-]?key|privatekey)\\s*[=:]\\s*[\'"]?-----BEGIN',
      '(?:mongodb|postgres|mysql|redis)://[^:]+:[^@]+@',
      '(?:ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36}',
      '(?:xox[baprs]-)[a-zA-Z0-9-]{10,}',
      'sk_[a-zA-Z0-9]{32,}', // Stripe/OpenAI style keys
      'pk_[a-zA-Z0-9]{32,}', // Stripe publishable keys
    ],
  },
  {
    id: 'large-migration-default',
    name: 'Large Migration Warning',
    description: 'Warns on database migrations larger than 100 lines',
    enabled: true,
    severity: 'warn',
    type: 'large-migration',
    threshold: 100,
    migrationPatterns: [
      'migrations?/.*\\.(sql|ts|js)$',
      '.*migration.*\\.(sql|ts|js)$',
      'schema\\.(sql|ts|js)$',
    ],
  },
];

