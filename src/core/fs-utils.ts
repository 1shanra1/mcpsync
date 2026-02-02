import { writeFileSync, renameSync, copyFileSync, existsSync, unlinkSync, chmodSync } from 'fs';

/**
 * Write file atomically using temp file + rename pattern.
 * Creates backup of existing file before overwrite.
 * Backup files are always created with 0600 permissions for security.
 */
export function atomicWrite(
  path: string,
  content: string,
  options?: { mode?: number; backup?: boolean }
): string | null {
  const { mode = 0o600, backup = true } = options ?? {};
  let backupPath: string | null = null;

  // Create backup if file exists
  if (backup && existsSync(path)) {
    backupPath = `${path}.bak`;
    copyFileSync(path, backupPath);
    // Ensure backup has restrictive permissions (owner read/write only)
    // This may differ from original file permissions - documented behavior
    chmodSync(backupPath, 0o600);
  }

  // Write to temp file
  const tempPath = `${path}.tmp.${process.pid}`;
  try {
    writeFileSync(tempPath, content, { mode });
    // Atomic rename
    renameSync(tempPath, path);
  } catch (error) {
    // Clean up temp file on failure
    try {
      unlinkSync(tempPath);
    } catch {}
    throw error;
  }

  return backupPath;
}
