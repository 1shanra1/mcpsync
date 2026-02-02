/**
 * E2E Test Helpers
 *
 * Utilities for running CLI commands and managing test fixtures
 * in the Docker test environment.
 */

import { execSync, ExecSyncOptions } from 'child_process';
import { existsSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import * as yaml from 'js-yaml';

// =============================================================================
// Types
// =============================================================================

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export interface TestContext {
  home: string;
  configDir: string;
  configPath: string;
  claudeConfigPath: string;
  codexConfigPath: string;
}

// =============================================================================
// CLI Execution
// =============================================================================

/**
 * Execute mcp-sync CLI command and return result
 */
export function runCli(args: string, options: ExecSyncOptions = {}): ExecResult {
  const cmd = `mcp-sync ${args}`;
  try {
    const stdout = execSync(cmd, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...options,
    });
    return { stdout, stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const execError = error as {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
      status?: number;
    };
    return {
      stdout: execError.stdout?.toString() ?? '',
      stderr: execError.stderr?.toString() ?? '',
      exitCode: execError.status ?? 1,
    };
  }
}

/**
 * Execute mcp-sync CLI command expecting success
 */
export function runCliSuccess(args: string): string {
  const result = runCli(args);
  if (result.exitCode !== 0) {
    throw new Error(
      `CLI command failed: mcp-sync ${args}\n` +
        `Exit code: ${result.exitCode}\n` +
        `stdout: ${result.stdout}\n` +
        `stderr: ${result.stderr}`
    );
  }
  return result.stdout;
}

/**
 * Execute mcp-sync CLI command expecting failure
 */
export function runCliFailure(args: string): ExecResult {
  const result = runCli(args);
  if (result.exitCode === 0) {
    throw new Error(
      `CLI command should have failed: mcp-sync ${args}\n` + `stdout: ${result.stdout}`
    );
  }
  return result;
}

// =============================================================================
// Test Context Management
// =============================================================================

/**
 * Get paths for test context
 */
export function getTestContext(): TestContext {
  const home = homedir();
  const configDir = join(home, '.config', 'mcp-sync');
  return {
    home,
    configDir,
    configPath: join(configDir, 'config.yaml'),
    claudeConfigPath: join(home, '.claude.json'),
    codexConfigPath: join(home, '.codex', 'config.toml'),
  };
}

/**
 * Clean up all test config files
 */
export function cleanupTestConfigs(): void {
  const ctx = getTestContext();

  // Remove mcp-sync config
  if (existsSync(ctx.configPath)) {
    rmSync(ctx.configPath);
  }
  if (existsSync(ctx.configDir)) {
    rmSync(ctx.configDir, { recursive: true });
  }

  // Remove Claude config
  if (existsSync(ctx.claudeConfigPath)) {
    rmSync(ctx.claudeConfigPath);
  }

  // Remove Codex config
  if (existsSync(ctx.codexConfigPath)) {
    rmSync(ctx.codexConfigPath);
  }
  const codexDir = join(ctx.home, '.codex');
  if (existsSync(codexDir)) {
    rmSync(codexDir, { recursive: true });
  }
}

/**
 * Initialize a fresh test environment
 */
export function setupTestEnvironment(): TestContext {
  cleanupTestConfigs();
  const ctx = getTestContext();

  // Ensure config directory exists
  mkdirSync(ctx.configDir, { recursive: true });

  return ctx;
}

// =============================================================================
// Config File Helpers
// =============================================================================

/**
 * Read the mcp-sync canonical config
 */
export function readCanonicalConfig(ctx: TestContext): Record<string, unknown> | null {
  if (!existsSync(ctx.configPath)) {
    return null;
  }
  const content = readFileSync(ctx.configPath, 'utf-8');
  return yaml.load(content) as Record<string, unknown>;
}

/**
 * Write a canonical config directly (for test setup)
 */
export function writeCanonicalConfig(ctx: TestContext, config: Record<string, unknown>): void {
  mkdirSync(ctx.configDir, { recursive: true });
  const content = yaml.dump(config, { indent: 2 });
  writeFileSync(ctx.configPath, content);
}

/**
 * Read Claude Code config file
 */
export function readClaudeConfig(ctx: TestContext): Record<string, unknown> | null {
  if (!existsSync(ctx.claudeConfigPath)) {
    return null;
  }
  const content = readFileSync(ctx.claudeConfigPath, 'utf-8');
  return JSON.parse(content);
}

/**
 * Read Codex config file (TOML)
 */
export function readCodexConfig(ctx: TestContext): Record<string, unknown> | null {
  if (!existsSync(ctx.codexConfigPath)) {
    return null;
  }
  // Import dynamically since smol-toml is ESM
  const content = readFileSync(ctx.codexConfigPath, 'utf-8');
  // Simple TOML parsing for test verification
  // For full parsing, tests should import smol-toml directly
  return { raw: content };
}

/**
 * Write Claude config directly (for testing merge behavior)
 */
export function writeClaudeConfig(ctx: TestContext, config: Record<string, unknown>): void {
  writeFileSync(ctx.claudeConfigPath, JSON.stringify(config, null, 2) + '\n');
}

// =============================================================================
// Assertion Helpers
// =============================================================================

/**
 * Check if a server exists in Claude config
 */
export function claudeHasServer(ctx: TestContext, serverName: string): boolean {
  const config = readClaudeConfig(ctx);
  if (!config) return false;
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  return servers ? serverName in servers : false;
}

/**
 * Get server from Claude config
 */
export function getClaudeServer(
  ctx: TestContext,
  serverName: string
): Record<string, unknown> | null {
  const config = readClaudeConfig(ctx);
  if (!config) return null;
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (!servers) return null;
  return (servers[serverName] as Record<string, unknown>) ?? null;
}
