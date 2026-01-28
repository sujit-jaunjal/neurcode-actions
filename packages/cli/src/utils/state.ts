/**
 * State Management Utility
 * 
 * Manages CLI state in .neurcode/config.json (project-local state)
 * Separates session state from user auth config
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { ensureNeurcodeInGitignore } from './gitignore';

export interface CliState {
  projectId?: string;
  sessionId?: string;
  lastPlanId?: string; // Deprecated: kept for backward compatibility
  activePlanId?: string; // Active plan ID for current session
  activeSessionId?: string; // Active session ID (same as sessionId, kept for clarity)
  lastPlanGeneratedAt?: string; // ISO timestamp of when the last plan was generated
}

const STATE_DIR = '.neurcode';
const CONFIG_FILE = 'config.json'; // Changed from state.json to config.json

/**
 * Get path to config file in current working directory
 */
function getConfigPath(): string {
  const cwd = process.cwd();
  const stateDir = join(cwd, STATE_DIR);
  const configPath = join(stateDir, CONFIG_FILE);
  return configPath;
}

/**
 * Ensure state directory exists and .neurcode is in .gitignore
 */
function ensureStateDir(): void {
  const cwd = process.cwd();
  const stateDir = join(cwd, STATE_DIR);
  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
  // Auto-add .neurcode to .gitignore
  ensureNeurcodeInGitignore(cwd);
}

/**
 * Load state from .neurcode/config.json
 */
export function loadState(): CliState {
  const configPath = getConfigPath();

  if (!existsSync(configPath)) {
    return {};
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content) as CliState;
  } catch (error) {
    // If file is corrupted, return empty state
    return {};
  }
}

/**
 * Save state to .neurcode/config.json
 */
export function saveState(state: Partial<CliState>): void {
  ensureStateDir();
  const configPath = getConfigPath();
  const currentState = loadState();
  const newState = { ...currentState, ...state };

  writeFileSync(configPath, JSON.stringify(newState, null, 2) + '\n', 'utf-8');
}

/**
 * Get session ID from state
 */
export function getSessionId(): string | null {
  const state = loadState();
  return state.sessionId || null;
}

/**
 * Set session ID in state
 */
export function setSessionId(sessionId: string): void {
  saveState({ sessionId });
}

/**
 * Clear session ID from state
 */
export function clearSessionId(): void {
  const state = loadState();
  delete state.sessionId;
  saveState(state);
}

/**
 * Get project ID from state
 */
export function getProjectId(): string | null {
  const state = loadState();
  return state.projectId || null;
}

/**
 * Set project ID in state
 */
export function setProjectId(projectId: string): void {
  saveState({ projectId });
}

/**
 * Get last plan ID from state
 */
export function getLastPlanId(): string | null {
  const state = loadState();
  return state.lastPlanId || null;
}

/**
 * Set last plan ID in state
 * @deprecated Use setActivePlanId instead
 */
export function setLastPlanId(planId: string): void {
  saveState({ lastPlanId: planId });
}

/**
 * Get active plan ID from state
 * Falls back to lastPlanId for backward compatibility
 */
export function getActivePlanId(): string | null {
  const state = loadState();
  return state.activePlanId || state.lastPlanId || null;
}

/**
 * Set active plan ID in state
 */
export function setActivePlanId(planId: string): void {
  // Save to both activePlanId (new) and lastPlanId (for backward compatibility)
  saveState({ activePlanId: planId, lastPlanId: planId });
}

/**
 * Get last plan generated timestamp
 */
export function getLastPlanGeneratedAt(): string | null {
  const state = loadState();
  return state.lastPlanGeneratedAt || null;
}

/**
 * Set last plan generated timestamp
 */
export function setLastPlanGeneratedAt(timestamp: string): void {
  saveState({ lastPlanGeneratedAt: timestamp });
}

