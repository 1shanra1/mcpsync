/**
 * Unit Tests: atomicWrite
 *
 * Tests for the file system utility functions.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { atomicWrite } from '../../src/core/fs-utils.js';
import { statSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir, platform } from 'os';

describe('atomicWrite', () => {
  const testDir = tmpdir();
  const testFile = join(testDir, `mcp-sync-test-${process.pid}.txt`);
  const backupFile = `${testFile}.bak`;
  const isWindows = platform() === 'win32';

  afterEach(() => {
    [testFile, backupFile].forEach((f) => {
      if (existsSync(f)) unlinkSync(f);
    });
  });

  it('should create file with 0600 permissions', () => {
    atomicWrite(testFile, 'test content');

    expect(existsSync(testFile)).toBe(true);
    expect(readFileSync(testFile, 'utf8')).toBe('test content');

    const stats = statSync(testFile);
    const mode = stats.mode & 0o777;

    // On Windows, chmod is often ignored; skip permission check
    if (!isWindows) {
      expect(mode).toBe(0o600);
    }
  });

  it('should create backup with 0600 permissions', () => {
    // Create initial file
    atomicWrite(testFile, 'initial content');

    // Overwrite to trigger backup
    atomicWrite(testFile, 'new content', { backup: true });

    expect(existsSync(backupFile)).toBe(true);
    expect(readFileSync(backupFile, 'utf8')).toBe('initial content');
    expect(readFileSync(testFile, 'utf8')).toBe('new content');

    // On Windows, chmod is often ignored; skip permission check
    if (!isWindows) {
      const stats = statSync(backupFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    }
  });

  it('should not create backup when backup: false', () => {
    atomicWrite(testFile, 'initial content');
    atomicWrite(testFile, 'new content', { backup: false });

    expect(existsSync(backupFile)).toBe(false);
    expect(readFileSync(testFile, 'utf8')).toBe('new content');
  });

  it('should return backup path when backup is created', () => {
    atomicWrite(testFile, 'initial content');
    const result = atomicWrite(testFile, 'new content', { backup: true });

    expect(result).toBe(backupFile);
  });

  it('should return null when no backup is created', () => {
    const result = atomicWrite(testFile, 'content', { backup: true });

    // No backup created because file didn't exist
    expect(result).toBe(null);
  });

  it('should allow custom file mode', () => {
    atomicWrite(testFile, 'test content', { mode: 0o644 });

    // On Windows, chmod is often ignored; skip permission check
    if (!isWindows) {
      const stats = statSync(testFile);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o644);
    }
  });
});
