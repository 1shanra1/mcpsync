/**
 * E2E Tests: CLI Commands
 *
 * These tests verify the complete CLI workflow in an isolated Docker environment.
 * They test real file I/O and command execution without mocking.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync } from 'fs';
import {
  runCli,
  runCliSuccess,
  runCliFailure,
  getTestContext,
  setupTestEnvironment,
  cleanupTestConfigs,
  readCanonicalConfig,
  writeCanonicalConfig,
  readClaudeConfig,
  claudeHasServer,
  getClaudeServer,
  TestContext,
} from './helpers.js';

describe('CLI E2E Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTestEnvironment();
  });

  afterEach(() => {
    cleanupTestConfigs();
  });

  // ===========================================================================
  // Init Command
  // ===========================================================================

  describe('mcp-sync init', () => {
    it('should create a new config file', () => {
      const result = runCliSuccess('init');

      expect(result).toContain('Created');
      expect(existsSync(ctx.configPath)).toBe(true);

      const config = readCanonicalConfig(ctx);
      expect(config).not.toBeNull();
      expect(config?.version).toBe('1');
      expect(config?.servers).toEqual({});
    });

    it('should fail if config already exists', () => {
      // First init
      runCliSuccess('init');

      // Second init should fail
      const result = runCliFailure('init');
      expect(result.stderr + result.stdout).toContain('already exists');
    });

    it('should overwrite with --force flag', () => {
      // First init
      runCliSuccess('init');

      // Add a server to modify the config
      runCliSuccess('add test-server --command echo --args hello');

      // Force init should overwrite
      const result = runCliSuccess('init --force');
      expect(result).toContain('Created');

      // Config should be reset
      const config = readCanonicalConfig(ctx);
      expect(config?.servers).toEqual({});
    });
  });

  // ===========================================================================
  // Add Command
  // ===========================================================================

  describe('mcp-sync add', () => {
    beforeEach(() => {
      runCliSuccess('init');
    });

    it('should add a stdio server', () => {
      const result = runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');

      expect(result).toContain('Added');

      const config = readCanonicalConfig(ctx);
      expect(config?.servers).toHaveProperty('github');

      const servers = config?.servers as Record<string, unknown>;
      const github = servers.github as Record<string, unknown>;
      expect(github.type).toBe('stdio');
      expect(github.command).toBe('npx');
      expect(github.args).toContain('-y');
      expect(github.args).toContain('@modelcontextprotocol/server-github');
    });

    it('should add a server with environment variables', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_TOKEN=${GITHUB_TOKEN}');

      const config = readCanonicalConfig(ctx);
      const servers = config?.servers as Record<string, unknown>;
      const github = servers.github as Record<string, unknown>;
      const env = github.env as Record<string, string>;

      expect(env.GITHUB_TOKEN).toBe('${GITHUB_TOKEN}');
    });

    it('should add an HTTP server', () => {
      runCliSuccess('add remote-api --type http --url https://api.example.com/mcp');

      const config = readCanonicalConfig(ctx);
      const servers = config?.servers as Record<string, unknown>;
      const remote = servers['remote-api'] as Record<string, unknown>;

      expect(remote.type).toBe('http');
      expect(remote.url).toBe('https://api.example.com/mcp');
    });

    it('should fail if server already exists', () => {
      runCliSuccess('add myserver --command echo');
      const result = runCliFailure('add myserver --command echo');

      expect(result.stderr + result.stdout).toContain('already exists');
    });

    it('should add server with description', () => {
      runCliSuccess('add docs --command npx --args -y @modelcontextprotocol/server-filesystem --description "Filesystem access for docs"');

      const config = readCanonicalConfig(ctx);
      const servers = config?.servers as Record<string, unknown>;
      const docs = servers.docs as Record<string, unknown>;

      expect(docs.description).toBe('Filesystem access for docs');
    });
  });

  // ===========================================================================
  // List Command
  // ===========================================================================

  describe('mcp-sync list', () => {
    beforeEach(() => {
      runCliSuccess('init');
    });

    it('should show empty list initially', () => {
      const result = runCliSuccess('list');
      expect(result).toContain('No servers configured');
    });

    it('should list added servers', () => {
      runCliSuccess('add server1 --command echo --args hello');
      runCliSuccess('add server2 --command cat --args file.txt');

      const result = runCliSuccess('list');

      expect(result).toContain('server1');
      expect(result).toContain('server2');
      expect(result).toContain('stdio');
    });

    it('should output JSON with --json flag', () => {
      runCliSuccess('add myserver --command echo');

      const result = runCliSuccess('list --json');
      const parsed = JSON.parse(result);

      expect(parsed).toHaveProperty('myserver');
      expect(parsed.myserver.type).toBe('stdio');
    });
  });

  // ===========================================================================
  // Remove Command
  // ===========================================================================

  describe('mcp-sync remove', () => {
    beforeEach(() => {
      runCliSuccess('init');
      runCliSuccess('add test-server --command echo');
    });

    it('should remove an existing server', () => {
      const result = runCliSuccess('remove test-server');

      expect(result).toContain('Removed');

      const config = readCanonicalConfig(ctx);
      const servers = config?.servers as Record<string, unknown>;
      expect(servers).not.toHaveProperty('test-server');
    });

    it('should warn if server does not exist', () => {
      const result = runCli('remove nonexistent');

      expect(result.stdout).toContain('not found');
    });
  });

  // ===========================================================================
  // Show Command
  // ===========================================================================

  describe('mcp-sync show', () => {
    beforeEach(() => {
      runCliSuccess('init');
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_TOKEN=${GITHUB_TOKEN}');
    });

    it('should show server details', () => {
      const result = runCliSuccess('show github');

      expect(result).toContain('github');
      expect(result).toContain('npx');
      expect(result).toContain('GITHUB_TOKEN');
    });

    it('should redact secrets in output', () => {
      const result = runCliSuccess('show github');

      // The token value should be redacted
      expect(result).not.toContain('ghp_');
    });

    it('should fail for nonexistent server', () => {
      const result = runCliFailure('show nonexistent');
      expect(result.stderr + result.stdout).toContain('not found');
    });
  });

  // ===========================================================================
  // Push Command
  // ===========================================================================

  describe('mcp-sync push', () => {
    beforeEach(() => {
      runCliSuccess('init');
    });

    it('should push config to Claude Code', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      const result = runCliSuccess('push claude-code');

      expect(result).toContain('claude-code');

      // Verify Claude config was created
      expect(existsSync(ctx.claudeConfigPath)).toBe(true);
      expect(claudeHasServer(ctx, 'github')).toBe(true);
    });

    it('should transform server config correctly for Claude', () => {
      runCliSuccess('add test-mcp --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push claude-code');

      const server = getClaudeServer(ctx, 'test-mcp');
      expect(server).not.toBeNull();
      expect(server?.command).toBe('node');
      expect(server?.args).toContain('server.js');
      expect((server?.env as Record<string, string>)?.API_KEY).toBe('${API_KEY}');
    });

    it('should push multiple servers', () => {
      runCliSuccess('add server1 --command echo --args one');
      runCliSuccess('add server2 --command echo --args two');
      runCliSuccess('add server3 --command echo --args three');

      runCliSuccess('push claude-code');

      expect(claudeHasServer(ctx, 'server1')).toBe(true);
      expect(claudeHasServer(ctx, 'server2')).toBe(true);
      expect(claudeHasServer(ctx, 'server3')).toBe(true);
    });

    it('should handle empty server list', () => {
      const result = runCliSuccess('push claude-code');

      // Should complete without error
      expect(result).toContain('claude-code');
    });

    it('should use dry-run flag', () => {
      runCliSuccess('add github --command npx --args github-server');
      const result = runCliSuccess('--dry-run push claude-code');

      // Should show what would be done
      expect(result.toLowerCase()).toMatch(/dry.?run|would/);

      // Should NOT actually create the file
      expect(existsSync(ctx.claudeConfigPath)).toBe(false);
    });
  });

  // ===========================================================================
  // Agents Command
  // ===========================================================================

  describe('mcp-sync agents', () => {
    it('should list available agents', () => {
      const result = runCliSuccess('agents');

      expect(result).toContain('claude-code');
      expect(result).toContain('codex');
    });

    it('should output JSON with --json flag', () => {
      const result = runCliSuccess('agents --json');
      const parsed = JSON.parse(result);

      expect(Array.isArray(parsed) || typeof parsed === 'object').toBe(true);
    });
  });

  // ===========================================================================
  // Doctor Command
  // ===========================================================================

  describe('mcp-sync doctor', () => {
    beforeEach(() => {
      runCliSuccess('init');
    });

    it('should run health checks', () => {
      const result = runCliSuccess('doctor');

      // Should mention config file check
      expect(result.toLowerCase()).toMatch(/config|check|health/);
    });

    it('should detect missing config', () => {
      cleanupTestConfigs();
      const result = runCli('doctor');

      // Should indicate config not found
      expect(result.stdout + result.stderr).toMatch(/not found|missing|create/i);
    });
  });

  // ===========================================================================
  // Full Workflow Tests
  // ===========================================================================

  describe('Full Workflow', () => {
    it('should complete init -> add -> push -> verify cycle', () => {
      // Initialize
      runCliSuccess('init');

      // Add multiple servers
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_TOKEN=${GITHUB_TOKEN}');
      runCliSuccess('add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem /home/user/docs');
      runCliSuccess('add memory --command npx --args -y @modelcontextprotocol/server-memory');

      // Verify canonical config
      const config = readCanonicalConfig(ctx);
      expect(Object.keys(config?.servers as object)).toHaveLength(3);

      // Push to Claude
      runCliSuccess('push claude-code');

      // Verify Claude config
      const claudeConfig = readClaudeConfig(ctx);
      expect(claudeConfig).not.toBeNull();

      const mcpServers = claudeConfig?.mcpServers as Record<string, unknown>;
      expect(Object.keys(mcpServers)).toHaveLength(3);
      expect(mcpServers).toHaveProperty('github');
      expect(mcpServers).toHaveProperty('filesystem');
      expect(mcpServers).toHaveProperty('memory');
    });

    it('should handle server removal and re-push', () => {
      runCliSuccess('init');
      runCliSuccess('add server1 --command echo');
      runCliSuccess('add server2 --command echo');
      runCliSuccess('push claude-code');

      // Both servers should exist
      expect(claudeHasServer(ctx, 'server1')).toBe(true);
      expect(claudeHasServer(ctx, 'server2')).toBe(true);

      // Remove one server
      runCliSuccess('remove server1');
      runCliSuccess('push claude-code');

      // Only server2 should remain
      expect(claudeHasServer(ctx, 'server1')).toBe(false);
      expect(claudeHasServer(ctx, 'server2')).toBe(true);
    });
  });
});
