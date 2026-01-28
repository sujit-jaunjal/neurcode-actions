import * as path from 'path';
import * as fsExtra from 'fs-extra';
import { v4 as uuidv4 } from 'uuid';

// @ts-ignore - lowdb v1 doesn't have perfect TypeScript support
const lowdb = require('lowdb');
// @ts-ignore
const FileSync = require('lowdb/adapters/FileSync');

export interface Session {
  id: string;
  startTime: number;
}

export interface Event {
  id?: number;
  sessionId: string;
  filePath: string;
  hash: string;
  timestamp: number;
}

interface DatabaseSchema {
  sessions: Session[];
  events: Event[];
}

/**
 * Journal - JSON database for tracking file change history
 * 
 * Stores sessions and events in .neurcode/history.json
 */
export class Journal {
  private db: any; // lowdb.LowdbSync<DatabaseSchema> - using any due to v1.x typing issues
  private readonly dbPath: string;
  private nextEventId: number = 1;

  constructor(projectRoot: string) {
    this.dbPath = path.join(projectRoot, '.neurcode', 'history.json');
    
    // Ensure .neurcode directory exists
    fsExtra.ensureDirSync(path.dirname(this.dbPath));
    
    // Initialize lowdb with JSON file adapter (v1.x API - synchronous)
    const adapter = new FileSync(this.dbPath);
    this.db = lowdb(adapter);
    
    // Set default data if database is empty
    this.db.defaults({ sessions: [], events: [] }).write();
    
    // Find the highest event ID to continue auto-incrementing
    if (this.db.get('events').value().length > 0) {
      const maxId = Math.max(...this.db.get('events').value().map((e: Event) => e.id || 0));
      this.nextEventId = maxId + 1;
    }
  }

  /**
   * Create a new session
   * @returns The session ID
   */
  createSession(): string {
    const sessionId = uuidv4();
    const startTime = Date.now();

    this.db.get('sessions').push({
      id: sessionId,
      startTime,
    }).write();

    return sessionId;
  }

  /**
   * Record a file change event
   * @param sessionId - The session ID
   * @param filePath - The path to the changed file
   * @param hash - The SHA-256 hash of the file content
   */
  recordEvent(sessionId: string, filePath: string, hash: string): void {
    const timestamp = Date.now();

    this.db.get('events').push({
      id: this.nextEventId++,
      sessionId,
      filePath,
      hash,
      timestamp,
    }).write();
  }

  /**
   * Get all events for a session
   * @param sessionId - The session ID
   * @returns Array of events
   */
  getSessionEvents(sessionId: string): Event[] {
    return this.db.get('events')
      .filter((event: Event) => event.sessionId === sessionId)
      .sortBy('timestamp')
      .value();
  }

  /**
   * Get all events for a file
   * @param filePath - The file path
   * @returns Array of events
   */
  getFileEvents(filePath: string): Event[] {
    return this.db.get('events')
      .filter((event: Event) => event.filePath === filePath)
      .sortBy((event: Event) => -event.timestamp)
      .value();
  }

  /**
   * Get the latest event for a file
   * @param filePath - The file path
   * @returns The latest event or null
   */
  getLatestFileEvent(filePath: string): Event | null {
    const events = this.db.get('events')
      .filter((event: Event) => event.filePath === filePath)
      .sortBy((event: Event) => -event.timestamp)
      .value();

    if (events.length === 0) {
      return null;
    }

    return events[0];
  }

  /**
   * Close the database connection
   * Note: lowdb doesn't require explicit closing, but we keep this for API compatibility
   */
  close(): void {
    // lowdb writes synchronously on write(), so no cleanup needed
    // This method is kept for API compatibility with the previous implementation
  }
}

