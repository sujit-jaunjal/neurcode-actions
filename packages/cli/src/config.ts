import { readFileSync, existsSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Default production API URL
 * Priority: NEURCODE_API_URL env var > Production URL
 * Users don't need to configure this - it's automatic
 */
export const DEFAULT_API_URL = process.env.NEURCODE_API_URL || 'https://api.neurcode.com';

export interface NeurcodeConfig {
  apiUrl?: string;
  apiKey?: string;
  projectId?: string;
}

/**
 * Load configuration with priority:
 * 1. Global config file (~/.neurcoderc) - Primary source for API keys (set via 'neurcode login')
 * 2. Local config file (./neurcode.config.json) - For project-specific settings
 * 3. Environment variables - Only for API URL override (not for API keys)
 * 
 * Note: API keys should be set via 'neurcode login' command, not environment variables.
 * This ensures secure, user-managed authentication.
 */
export function loadConfig(): NeurcodeConfig {
  const config: NeurcodeConfig = {};

  // Priority 1: Environment variables - Only for API URL (not API keys)
  // API keys are managed via 'neurcode login' and stored in ~/.neurcoderc
  if (process.env.NEURCODE_API_URL) {
    config.apiUrl = process.env.NEURCODE_API_URL;
  }
  // Note: NEURCODE_API_KEY is intentionally NOT checked here
  // Use 'neurcode login' to authenticate instead
  if (process.env.NEURCODE_PROJECT_ID) {
    config.projectId = process.env.NEURCODE_PROJECT_ID;
  }

  // Priority 2: Local state file (.neurcode/config.json) - NEW format
  const neurcodeDir = join(process.cwd(), '.neurcode');
  const neurcodeConfigPath = join(neurcodeDir, 'config.json');
  if (existsSync(neurcodeConfigPath)) {
    try {
      const fileContent = readFileSync(neurcodeConfigPath, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      // Load projectId from .neurcode/config.json (new format)
      if (!config.projectId && fileConfig.projectId) {
        config.projectId = fileConfig.projectId;
      }
    } catch (error) {
      // Ignore parse errors, continue to legacy config
    }
  }

  // Priority 2b: Legacy local config file (neurcode.config.json) - for backwards compatibility
  const localConfigPath = join(process.cwd(), 'neurcode.config.json');
  if (existsSync(localConfigPath)) {
    try {
      const fileContent = readFileSync(localConfigPath, 'utf-8');
      const fileConfig = JSON.parse(fileContent);
      // Only use file config if not already set by env vars or new format
      if (!config.apiUrl && fileConfig.apiUrl) {
        config.apiUrl = fileConfig.apiUrl;
      }
      if (!config.apiKey && fileConfig.apiKey) {
        config.apiKey = fileConfig.apiKey;
      }
      if (!config.projectId && fileConfig.projectId) {
        config.projectId = fileConfig.projectId;
      }
    } catch (error) {
      // Ignore parse errors, continue to global config
    }
  }

  // Priority 3: Global config file (user home directory) - for user auth only
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (homeDir) {
    // Try both .neurcoderc and neurcode.config.json for backwards compatibility
    const globalConfigPath = join(homeDir, '.neurcoderc');
    const legacyGlobalConfigPath = join(homeDir, 'neurcode.config.json');
    
    const configPath = existsSync(globalConfigPath) ? globalConfigPath : legacyGlobalConfigPath;
    
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        const fileConfig = JSON.parse(fileContent);
        // Only use file config if not already set by env vars or local config
        // Global config should only store user auth (apiKey, apiUrl), not projectId
        if (!config.apiUrl && fileConfig.apiUrl) {
          config.apiUrl = fileConfig.apiUrl;
        }
        if (!config.apiKey && fileConfig.apiKey) {
          config.apiKey = fileConfig.apiKey;
        }
        // Don't load projectId from global config - that's project-specific
      } catch (error) {
        // Ignore parse errors
      }
    }
  }

  // Set default API URL if not specified
  // Priority: Env Var (for devs) > Config JSON (for enterprise) > Default (for everyone)
  if (!config.apiUrl) {
    config.apiUrl = DEFAULT_API_URL;
  }

  return config;
}

/**
 * Get API key with helpful error message if not found
 */
export function getApiKey(): string | null {
  const config = loadConfig();
  
  if (!config.apiKey) {
    return null;
  }
  
  return config.apiKey;
}

/**
 * Require API key - throws helpful error if not found
 */
export function requireApiKey(): string {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    console.error('\n❌ No API Key found.');
    console.log('\n📝 To authenticate, run:');
    console.log('   neurcode login');
    console.log('\n💡 This will open your browser for authentication.\n');
    process.exit(1);
  }
  
  return apiKey;
}

/**
 * Save API key to global config file (~/.neurcoderc)
 * This is for user authentication, separate from project config
 */
export function saveGlobalAuth(apiKey: string, apiUrl?: string): void {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) {
    throw new Error('Cannot determine home directory');
  }

  const globalConfigPath = join(homeDir, '.neurcoderc');
  
  // Load existing config if it exists
  let config: Record<string, any> = {};
  if (existsSync(globalConfigPath)) {
    try {
      const fileContent = readFileSync(globalConfigPath, 'utf-8');
      config = JSON.parse(fileContent);
    } catch (error) {
      // If parse fails, start fresh
    }
  }

  // Update auth fields only (don't store projectId in global config)
  config.apiKey = apiKey;
  if (apiUrl) {
    config.apiUrl = apiUrl;
  }

  writeFileSync(globalConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get global auth config path
 */
export function getGlobalAuthPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  if (!homeDir) {
    throw new Error('Cannot determine home directory');
  }
  return join(homeDir, '.neurcoderc');
}

/**
 * Delete global auth config (logout)
 */
export function deleteGlobalAuth(): void {
  const globalConfigPath = getGlobalAuthPath();
  if (existsSync(globalConfigPath)) {
    // Read existing config
    let config: Record<string, any> = {};
    try {
      const fileContent = readFileSync(globalConfigPath, 'utf-8');
      config = JSON.parse(fileContent);
    } catch (error) {
      // If parse fails, just delete the file
      unlinkSync(globalConfigPath);
      return;
    }
    
    // Remove auth fields but keep other config if any
    delete config.apiKey;
    delete config.apiUrl; // Optionally keep this, but removing for clean logout
    
    // If config is empty or only has empty values, delete the file
    const remainingKeys = Object.keys(config).filter(key => config[key] !== undefined && config[key] !== null);
    if (remainingKeys.length === 0) {
      unlinkSync(globalConfigPath);
    } else {
      // Write back config without auth fields
      writeFileSync(globalConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    }
  }
}

/**
 * Delete API key from all file-based config sources (logout)
 * This ensures logout works even if API key exists in multiple locations
 */
export function deleteApiKeyFromAllSources(): {
  removedFromGlobal: boolean;
  removedFromLocal: boolean;
} {
  const result = {
    removedFromGlobal: false,
    removedFromLocal: false,
  };

  // Remove from global config
  try {
    const globalConfigPath = getGlobalAuthPath();
    if (existsSync(globalConfigPath)) {
      let config: Record<string, any> = {};
      try {
        const fileContent = readFileSync(globalConfigPath, 'utf-8');
        config = JSON.parse(fileContent);
      } catch (error) {
        // If parse fails, just delete the file
        unlinkSync(globalConfigPath);
        result.removedFromGlobal = true;
      }
      
      if (config.apiKey) {
        delete config.apiKey;
        result.removedFromGlobal = true;
        
        // If config is empty, delete the file
        const remainingKeys = Object.keys(config).filter(
          key => config[key] !== undefined && config[key] !== null && key !== 'apiUrl'
        );
        if (remainingKeys.length === 0) {
          // Keep apiUrl if it exists, otherwise delete file
          if (!config.apiUrl) {
            unlinkSync(globalConfigPath);
          } else {
            writeFileSync(globalConfigPath, JSON.stringify({ apiUrl: config.apiUrl }, null, 2) + '\n', 'utf-8');
          }
        } else {
          writeFileSync(globalConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
        }
      }
    }
  } catch (error) {
    // Ignore errors, continue to local config
  }

  // Remove from local config (neurcode.config.json)
  try {
    const localConfigPath = join(process.cwd(), 'neurcode.config.json');
    if (existsSync(localConfigPath)) {
      let config: Record<string, any> = {};
      try {
        const fileContent = readFileSync(localConfigPath, 'utf-8');
        config = JSON.parse(fileContent);
      } catch (error) {
        // If parse fails, skip
      }
      
      if (config.apiKey) {
        delete config.apiKey;
        result.removedFromLocal = true;
        
        // Write back config without API key (keep projectId and other fields)
        writeFileSync(localConfigPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
      }
    }
  } catch (error) {
    // Ignore errors
  }

  return result;
}


