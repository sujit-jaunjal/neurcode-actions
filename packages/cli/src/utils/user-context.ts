/**
 * User Context Utility
 * 
 * Provides user information (name, email) for personalized CLI messaging.
 * Caches user info to avoid repeated API calls.
 */

import { loadConfig } from '../config';
import { ApiClient } from '../api-client';

export interface UserInfo {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
  displayName: string;
}

let cachedUserInfo: UserInfo | null = null;
let cacheTimestamp: number = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get current user information
 * Uses cache to avoid repeated API calls
 */
export async function getUserInfo(): Promise<UserInfo | null> {
  try {
    // Return cached info if still valid
    const now = Date.now();
    if (cachedUserInfo && (now - cacheTimestamp) < CACHE_TTL) {
      return cachedUserInfo;
    }

    const config = loadConfig();
    if (!config.apiKey) {
      return null;
    }

    const client = new ApiClient(config);
    const user = await client.getCurrentUser();

    // Build display name
    const displayName = user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.firstName || user.lastName || user.email.split('@')[0] || 'User';

    cachedUserInfo = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      imageUrl: user.imageUrl,
      displayName,
    };

    cacheTimestamp = now;
    return cachedUserInfo;
  } catch (error) {
    // Silently fail - user info is optional for messaging
    return null;
  }
}

/**
 * Clear cached user info (useful after logout)
 */
export function clearUserCache(): void {
  cachedUserInfo = null;
  cacheTimestamp = 0;
}

/**
 * Get user's first name or fallback
 */
export async function getUserFirstName(): Promise<string> {
  const user = await getUserInfo();
  return user?.firstName || user?.displayName.split(' ')[0] || 'there';
}

