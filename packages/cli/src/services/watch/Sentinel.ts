import * as chokidar from 'chokidar';
import * as path from 'path';
import { promises as fs } from 'fs';
import { BlobStore } from './BlobStore';
import { Journal } from './Journal';
import { Syncer } from './Syncer';

/**
 * Sentinel - File system watcher that records file changes
 * 
 * Watches the project root for file changes, stores content in BlobStore,
 * and records events in Journal. Uses debouncing to prevent high CPU usage.
 */
export class Sentinel {
  private watcher: chokidar.FSWatcher | null = null;
  private blobStore: BlobStore;
  private journal: Journal;
  private syncer: Syncer;
  private sessionId: string;
  private projectRoot: string;
  private projectId: string;
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingChanges: Map<string, 'change' | 'add' | 'unlink'> = new Map();
  private readonly debounceMs = 500;

  constructor(projectRoot: string, projectId: string) {
    this.projectRoot = projectRoot;
    this.projectId = projectId;
    this.blobStore = new BlobStore(projectRoot);
    this.journal = new Journal(projectRoot);
    this.syncer = new Syncer(projectRoot, projectId);
    this.sessionId = this.journal.createSession();
  }

  /**
   * Initialize the watch service
   */
  async initialize(): Promise<void> {
    await this.blobStore.initialize();
  }

  /**
   * Start watching the project root
   */
  async start(): Promise<void> {
    if (this.watcher) {
      throw new Error('Sentinel is already watching');
    }

    // Ignore patterns for common directories and files
    const ignored = [
      '**/.git/**',
      '**/node_modules/**',
      '**/.neurcode/**',
      '**/.next/**',
      '**/dist/**',
      '**/build/**',
      '**/.DS_Store',
      '**/Thumbs.db',
    ];

    this.watcher = chokidar.watch(this.projectRoot, {
      ignored,
      persistent: true,
      ignoreInitial: true, // Don't process existing files on startup
      awaitWriteFinish: {
        stabilityThreshold: 200,
        pollInterval: 100,
      },
    });

    // Handle file changes
    this.watcher.on('add', (filePath) => this.handleChange(filePath, 'add'));
    this.watcher.on('change', (filePath) => this.handleChange(filePath, 'change'));
    this.watcher.on('unlink', (filePath) => this.handleChange(filePath, 'unlink'));

    this.watcher.on('error', (error) => {
      console.error('❌ Watch error:', error);
    });

    console.log(`👁️  Watching: ${this.projectRoot}`);
    console.log(`📝 Session ID: ${this.sessionId}`);
  }

  /**
   * Handle a file change event (with debouncing)
   */
  private handleChange(filePath: string, eventType: 'change' | 'add' | 'unlink'): void {
    // Normalize path relative to project root
    const relativePath = path.relative(this.projectRoot, filePath);
    
    // Store the most recent event type for this file
    this.pendingChanges.set(relativePath, eventType);

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // Set new debounce timer
    this.debounceTimer = setTimeout(() => {
      this.processPendingChanges();
    }, this.debounceMs);
  }

  /**
   * Process all pending changes after debounce period
   */
  private async processPendingChanges(): Promise<void> {
    const changes = Array.from(this.pendingChanges.entries());
    this.pendingChanges.clear();

    if (changes.length === 0) {
      return;
    }

    for (const [filePath, eventType] of changes) {
      try {
        if (eventType === 'unlink') {
          // File was deleted - we can't read it, but we can record the deletion
          // For now, we'll skip recording deletions (or record with a special marker)
          continue;
        }

        // Read file content
        const fullPath = path.join(this.projectRoot, filePath);
        const content = await fs.readFile(fullPath, 'utf-8');

        // Store content in blob store
        const hash = await this.blobStore.store(content);

        // Record event in journal (local JSON database)
        this.journal.recordEvent(this.sessionId, filePath, hash);

        // Queue event for cloud sync (non-blocking, fire-and-forget)
        this.syncer.queueEvent({
          sessionId: this.sessionId,
          filePath,
          hash,
          timestamp: Date.now(),
        });

        console.log(`📝 Recorded: ${filePath} (${hash.substring(0, 8)}...)`);
      } catch (error) {
        // Skip files that can't be read (permissions, binary files, etc.)
        if (error instanceof Error) {
          // Silently skip - this is expected for some files
        }
      }
    }
  }

  /**
   * Stop watching
   */
  async stop(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.watcher) {
      await this.watcher.close();
      this.watcher = null;
    }

    // Flush any pending syncs before closing
    if (this.syncer.isConfigured()) {
      console.log('☁️  Flushing pending cloud syncs...');
      const result = await this.syncer.flush();
      if (result.success && result.synced > 0) {
        console.log(`✅ Synced ${result.synced} events to cloud`);
      }
    }

    this.journal.close();
    console.log('🛑 Watch stopped');
  }

  /**
   * Get the current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Get the syncer instance (for checking sync status)
   */
  getSyncer(): Syncer {
    return this.syncer;
  }
}

