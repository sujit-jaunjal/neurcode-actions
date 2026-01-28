/**
 * Tier Utility
 * 
 * Fetches and caches user tier to minimize API latency.
 * Caches tier in .neurcode/config.json for the session.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { loadConfig } from '../config';

export type UserTier = 'FREE' | 'PRO';

interface TierCache {
  tier: UserTier;
  cachedAt: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
let memoryCache: TierCache | null = null;

/**
 * Get user tier from API or cache
 * Defaults to 'FREE' if tier cannot be determined
 */
export async function getUserTier(): Promise<UserTier> {
  try {
    // Check memory cache first
    const now = Date.now();
    if (memoryCache && (now - memoryCache.cachedAt) < CACHE_TTL) {
      return memoryCache.tier;
    }

    // Check file cache
    const neurcodeDir = join(process.cwd(), '.neurcode');
    const configPath = join(neurcodeDir, 'config.json');
    
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        const config = JSON.parse(fileContent);
        
        if (config.tier && config.tierCachedAt) {
          const cacheAge = now - config.tierCachedAt;
          if (cacheAge < CACHE_TTL) {
            const tier = config.tier as UserTier;
            memoryCache = { tier, cachedAt: config.tierCachedAt };
            return tier;
          }
        }
      } catch (error) {
        // Ignore parse errors, continue to API fetch
      }
    }

    // Fetch from API
    const config = loadConfig();
    if (!config.apiKey) {
      // No API key, default to FREE
      return 'FREE';
    }

    const apiUrl = (config.apiUrl || 'https://api.neurcode.com').replace(/\/$/, '');
    const apiKey = config.apiKey;
    
    // Try to get tier from subscription endpoint
    try {
      const response = await fetch(`${apiUrl}/api/v1/subscriptions/status`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        // If not authorized or subscription not found, default to FREE
        return 'FREE';
      }

      const subscription = await response.json() as {
        plan: { slug: string };
        status: string;
        isTrial?: boolean;
      };

      // PRO tier if: professional plan AND (active status OR trial status)
      const tier: UserTier = subscription.plan.slug === 'professional' && 
                            (subscription.status === 'active' || subscription.status === 'trial' || subscription.isTrial) 
                            ? 'PRO' : 'FREE';
      
      // Cache the tier
      cacheTier(tier);
      
      return tier;
    } catch (error) {
      // If subscription endpoint fails, default to FREE
      // Don't log warning to avoid noise - this is expected for FREE users
      return 'FREE';
    }
  } catch (error) {
    // Fail-safe: default to FREE
    return 'FREE';
  }
}

/**
 * Cache tier in memory and file
 */
function cacheTier(tier: UserTier): void {
  const now = Date.now();
  memoryCache = { tier, cachedAt: now };

  try {
    const neurcodeDir = join(process.cwd(), '.neurcode');
    const configPath = join(neurcodeDir, 'config.json');
    
    // Ensure .neurcode directory exists
    if (!existsSync(neurcodeDir)) {
      mkdirSync(neurcodeDir, { recursive: true });
    }

    // Read existing config or create new
    let config: any = {};
    if (existsSync(configPath)) {
      try {
        const fileContent = readFileSync(configPath, 'utf-8');
        config = JSON.parse(fileContent);
      } catch (error) {
        // If parse fails, start with empty config
      }
    }

    // Update tier cache
    config.tier = tier;
    config.tierCachedAt = now;

    // Write back to file
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    // Ignore file write errors - memory cache is still valid
  }
}

/**
 * Clear tier cache (useful after tier changes)
 */
export function clearTierCache(): void {
  memoryCache = null;
  
  try {
    const neurcodeDir = join(process.cwd(), '.neurcode');
    const configPath = join(neurcodeDir, 'config.json');
    
    if (existsSync(configPath)) {
      const fileContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(fileContent);
      delete config.tier;
      delete config.tierCachedAt;
      writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }
  } catch (error) {
    // Ignore errors
  }
}

/**
 * Check if user has PRO tier
 */
export async function isProUser(): Promise<boolean> {
  const tier = await getUserTier();
  return tier === 'PRO';
}

