/**
 * Restore a file from a blob hash
 * 
 * Reads a GZIP-compressed blob from .neurcode/blobs/<hash> and
 * writes it to the target file path.
 * 
 * @param hash - SHA-256 hash of the file content
 * @param targetPath - Relative path to the file to restore (e.g., "src/components/Button.tsx")
 * @param projectRoot - Root directory of the project
 * @returns Promise that resolves when the file is restored
 * @throws Error if the blob doesn't exist, path is invalid, or write fails
 */

import { gunzipSync } from 'zlib';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as fsExtra from 'fs-extra';

export async function restoreFile(
  hash: string,
  targetPath: string,
  projectRoot: string
): Promise<void> {
  // Resolve the target file path relative to project root
  const resolvedTargetPath = path.resolve(projectRoot, targetPath);
  
  // Security: Ensure the target path is within the project root
  // This prevents path traversal attacks (e.g., ../../../etc/passwd)
  const resolvedProjectRoot = path.resolve(projectRoot);
  if (!resolvedTargetPath.startsWith(resolvedProjectRoot)) {
    throw new Error(`Invalid file path: ${targetPath} - Path traversal detected`);
  }
  
  // Resolve blob path
  const blobPath = path.join(projectRoot, '.neurcode', 'blobs', hash);
  
  // Check if blob exists
  try {
    await fs.access(blobPath);
  } catch {
    throw new Error(`Blob not found: ${hash}`);
  }
  
  // Read the compressed blob
  const compressedData = await fs.readFile(blobPath);
  
  // Decompress using GZIP
  let decompressedData: Buffer;
  try {
    decompressedData = gunzipSync(compressedData);
  } catch (error) {
    throw new Error(`Failed to decompress blob: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Convert to string (assuming UTF-8 encoding)
  const fileContent = decompressedData.toString('utf-8');
  
  // Ensure the target directory exists
  const targetDir = path.dirname(resolvedTargetPath);
  await fsExtra.ensureDir(targetDir);
  
  // Write the file
  await fs.writeFile(resolvedTargetPath, fileContent, 'utf-8');
}

