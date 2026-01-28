import { createHash } from 'crypto';
import { gzipSync } from 'zlib';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as fsExtra from 'fs-extra';

/**
 * BlobStore - Content-Addressable Storage for file content
 * 
 * Stores compressed file content in .neurcode/blobs/ directory.
 * Filename is the SHA-256 hash of the content.
 */
export class BlobStore {
  private readonly blobsDir: string;

  constructor(projectRoot: string) {
    this.blobsDir = path.join(projectRoot, '.neurcode', 'blobs');
  }

  /**
   * Initialize the blob store directory
   */
  async initialize(): Promise<void> {
    await fsExtra.ensureDir(this.blobsDir);
  }

  /**
   * Store content and return its hash
   * @param content - The file content to store
   * @returns The SHA-256 hash of the content
   */
  async store(content: string): Promise<string> {
    // Compute SHA-256 hash
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    const blobPath = path.join(this.blobsDir, hash);

    // Check if blob already exists
    try {
      await fs.access(blobPath);
      // Blob already exists, return hash
      return hash;
    } catch {
      // Blob doesn't exist, create it
    }

    // Compress content with GZIP
    const compressed = gzipSync(Buffer.from(content, 'utf8'));

    // Write compressed content to disk
    await fs.writeFile(blobPath, compressed);

    return hash;
  }

  /**
   * Check if a blob exists by hash
   * @param hash - The SHA-256 hash
   * @returns True if the blob exists
   */
  async exists(hash: string): Promise<boolean> {
    const blobPath = path.join(this.blobsDir, hash);
    try {
      await fs.access(blobPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the path to a blob by hash
   * @param hash - The SHA-256 hash
   * @returns The full path to the blob file
   */
  getBlobPath(hash: string): string {
    return path.join(this.blobsDir, hash);
  }
}

