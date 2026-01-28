/**
 * CommandPoller - Polls for remote commands and executes them locally
 * 
 * Polls the cloud API every 3 seconds for pending commands (like file reverts).
 * When a command is received, executes it locally and updates the status.
 */

import { getApiKey, loadConfig, DEFAULT_API_URL } from '../../config';
import { restoreFile } from '../../utils/restore';
import { BlobStore } from './BlobStore';
import * as path from 'path';
import { promises as fs } from 'fs';
import { createHash } from 'crypto';
import { gunzipSync } from 'zlib';

export interface Command {
  id: string;
  userId: string;
  organizationId: string;
  type: string;
  payload: {
    filePath: string;
    blobHash: string;
  };
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PollResponse {
  command: Command | null;
}

/**
 * CommandPoller - Handles polling and execution of remote commands
 */
export class CommandPoller {
  private apiUrl: string;
  private apiKey: string | null;
  private projectRoot: string;
  private pollInterval: NodeJS.Timeout | null = null;
  private readonly pollIntervalMs = 3000; // Poll every 3 seconds
  private isRunning: boolean = false;
  private blobStore: BlobStore;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    const config = loadConfig();
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.apiKey = getApiKey();
    this.blobStore = new BlobStore(projectRoot);
  }

  /**
   * Start polling for commands
   */
  start(): void {
    if (this.isRunning) {
      console.warn('⚠️  CommandPoller is already running');
      return;
    }

    // If no API key, skip silently (local-only mode)
    if (!this.apiKey) {
      console.log('📦 Command polling: DISABLED (no API key configured)');
      return;
    }

    this.isRunning = true;
    console.log('🔄 Command polling: ENABLED (checking every 3s)');

    // Start polling immediately, then every 3 seconds
    this.poll();
    this.pollInterval = setInterval(() => {
      this.poll();
    }, this.pollIntervalMs);
  }

  /**
   * Stop polling for commands
   */
  stop(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    this.isRunning = false;
    console.log('🛑 Command polling stopped');
  }

  /**
   * Poll for pending commands and execute them
   */
  private async poll(): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    try {
      // Poll for pending commands
      const response = await fetch(`${this.apiUrl}/api/v1/commands/poll`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          // API key invalid, stop polling
          console.warn('⚠️  Command polling: API key invalid, stopping');
          this.stop();
          return;
        }
        // For other errors, log but continue polling
        console.warn(`⚠️  Command poll failed: ${response.status}`);
        return;
      }

      const data = await response.json() as PollResponse;

      if (!data.command) {
        // No pending commands - log occasionally for debugging (every 20 polls = ~1 minute)
        if (Math.random() < 0.05) {
          console.log('🔄 Polling for commands... (no pending commands)');
        }
        return;
      }

      // Execute the command
      console.log(`📥 Found pending command: ${data.command.type} (${data.command.id.substring(0, 8)}...)`);
      await this.executeCommand(data.command);
    } catch (error: any) {
      // Log error but continue polling (network issues, etc.)
      console.warn(`⚠️  Command poll error: ${error.message}`);
    }
  }

  /**
   * Execute a command locally
   */
  private async executeCommand(command: Command): Promise<void> {
    console.log(`📥 Received command: ${command.type} (${command.id.substring(0, 8)}...)`);

    try {
      if (command.type === 'FILE_REVERT') {
        await this.executeFileRevert(command);
      } else {
        throw new Error(`Unknown command type: ${command.type}`);
      }
    } catch (error: any) {
      console.error(`❌ Command execution failed: ${error.message}`);
      await this.updateCommandStatus(command.id, 'FAILED', error.message);
    }
  }

  /**
   * Compute the hash of the current file content
   */
  private async computeCurrentFileHash(filePath: string): Promise<string | null> {
    const resolvedPath = path.resolve(this.projectRoot, filePath);
    
    try {
      // Check if file exists
      await fs.access(resolvedPath);
      
      // Read file content
      const content = await fs.readFile(resolvedPath, 'utf-8');
      
      // Compute SHA-256 hash (same as BlobStore)
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      return hash;
    } catch {
      // File doesn't exist
      return null;
    }
  }

  /**
   * Execute a FILE_REVERT command
   */
  private async executeFileRevert(command: Command): Promise<void> {
    const { filePath, blobHash } = command.payload;

    if (!filePath || !blobHash) {
      throw new Error('Missing filePath or blobHash in command payload');
    }

    // Check if blob exists locally
    const blobExists = await this.blobStore.exists(blobHash);
    
    if (!blobExists) {
      // Blob doesn't exist locally, fetch it from cloud
      console.log(`📥 Blob not found locally, fetching from cloud: ${blobHash.substring(0, 12)}...`);
      await this.fetchBlobFromCloud(blobHash);
    }

    // CRITICAL: Compare target hash with current file hash before reverting
    const currentHash = await this.computeCurrentFileHash(filePath);
    
    if (currentHash === blobHash) {
      console.log(`⚠️  Skipped revert: Target hash (${blobHash.substring(0, 8)}...) is identical to current file`);
      console.log(`   File ${filePath} is already at the requested version`);
      
      // Mark as completed (no-op, but successful)
      await this.updateCommandStatus(command.id, 'COMPLETED');
      return;
    }

    // Restore the file using existing restoreFile utility
    // Note: restoreFile expects hash and targetPath, and handles decompression
    await restoreFile(blobHash, filePath, this.projectRoot);

    console.log(`✅ File reverted: ${filePath} (${blobHash.substring(0, 8)}...)`);
    if (currentHash) {
      console.log(`   Previous: ${currentHash.substring(0, 8)}... → New: ${blobHash.substring(0, 8)}...`);
    }

    // Update command status to COMPLETED
    await this.updateCommandStatus(command.id, 'COMPLETED');
  }

  /**
   * Fetch blob content from cloud API and store it locally
   */
  private async fetchBlobFromCloud(hash: string): Promise<void> {
    if (!this.apiKey) {
      throw new Error('API key not found. Please run "neurcode login" first.');
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/blobs/${hash}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Blob not found in cloud storage: ${hash.substring(0, 12)}...`);
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('API key invalid. Please run "neurcode login" again.');
        }
        throw new Error(`Failed to fetch blob: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { hash: string; content: string };
      
      // Decode base64 content to get GZIP compressed buffer
      const compressedContent = Buffer.from(data.content, 'base64');
      
      // Store the blob locally (BlobStore will handle the directory creation)
      await this.blobStore.initialize();
      const blobPath = this.blobStore.getBlobPath(hash);
      await fs.writeFile(blobPath, compressedContent);
      
      console.log(`✅ Blob fetched and stored locally: ${hash.substring(0, 12)}...`);
    } catch (error: any) {
      throw new Error(`Failed to fetch blob from cloud: ${error.message}`);
    }
  }

  /**
   * Update command status on the server
   */
  private async updateCommandStatus(
    commandId: string,
    status: 'COMPLETED' | 'FAILED',
    errorMessage?: string
  ): Promise<void> {
    if (!this.apiKey) {
      return;
    }

    try {
      const response = await fetch(`${this.apiUrl}/api/v1/commands/${commandId}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          status,
          errorMessage,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.warn(`⚠️  Failed to update command status: ${response.status} ${errorText}`);
      }
    } catch (error: any) {
      console.warn(`⚠️  Failed to update command status: ${error.message}`);
    }
  }

  /**
   * Check if poller is configured (has API key)
   */
  isConfigured(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Reload API key from config (useful if user logs in after watch starts)
   */
  reloadConfig(): void {
    const config = loadConfig();
    this.apiUrl = config.apiUrl || DEFAULT_API_URL;
    this.apiKey = getApiKey();
    
    // Restart polling if we now have an API key and weren't running before
    if (this.apiKey && !this.isRunning) {
      this.start();
    }
  }
}

