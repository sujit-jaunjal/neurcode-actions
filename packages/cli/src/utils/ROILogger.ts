/**
 * ROI Logger
 * 
 * Lightweight utility to send value events to the backend ROI service
 * Tracks: reverts, verify passes, secret interceptions, hallucination blocks
 */

import { loadConfig } from '../config';

export type ROIEventType = 'REVERT_SUCCESS' | 'VERIFY_PASS' | 'SECRET_INTERCEPTED' | 'HALLUCINATION_BLOCKED';

export interface ROIEventMetadata {
  [key: string]: any;
}

/**
 * Log a ROI event to the backend
 * This is fire-and-forget - errors are silently ignored to avoid blocking user workflows
 */
export async function logROIEvent(
  eventType: ROIEventType,
  metadata: ROIEventMetadata = {},
  projectId?: string | null
): Promise<void> {
  try {
    const config = loadConfig();
    if (!config.apiKey) {
      // Silently fail if no API key (user not authenticated)
      return;
    }

    // Use same API URL pattern as ApiClient
    const apiUrl = config.apiUrl || process.env.NEURCODE_API_URL || 'https://api.neurcode.ai';
    const url = `${apiUrl}/api/v1/roi/events`;

    // Fire-and-forget fetch (don't await)
    fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        eventType,
        metadata,
        projectId,
      }),
    }).catch(() => {
      // Silently ignore errors - ROI tracking should never block user workflows
    });
  } catch {
    // Silently ignore all errors
  }
}

