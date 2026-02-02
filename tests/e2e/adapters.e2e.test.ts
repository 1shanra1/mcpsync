/**
 * E2E Tests: Adapter Config Format Verification
 *
 * These tests verify that mcp-sync produces config files that match
 * the actual format expected by each AI coding agent CLI.
 *
 * When these tests fail, it likely means the agent's config format
 * has changed and the adapter needs to be updated.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as TOML from 'smol-toml';
import {
  runCliSuccess,
  setupTestEnvironment,
  cleanupTestConfigs,
  readClaudeConfig,
  readGeminiConfig,
  readRooConfig,
  readAmpConfig,
  readOpenCodeConfig,
  TestContext,
} from './helpers.js';

describe('Adapter E2E Tests', () => {
  let ctx: TestContext;

  beforeEach(() => {
    ctx = setupTestEnvironment();
    runCliSuccess('init');
  });

  afterEach(() => {
    cleanupTestConfigs();
  });

  // ===========================================================================
  // Claude Code Adapter
  // ===========================================================================

  describe('Claude Code Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push claude-code');

      expect(existsSync(ctx.claudeConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.claudeConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use correct mcpServers key', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      expect(config).toHaveProperty('mcpServers');
      expect(config?.mcpServers).toHaveProperty('github');
    });

    it('should format stdio server correctly', () => {
      runCliSuccess('add myserver --command node --args server.js --args --port --args 3000');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js', '--port', '3000']);
    });

    it('should include env vars in correct format', () => {
      runCliSuccess(
        'add api-server --command node --args server.js --env API_KEY=${API_KEY} --env DEBUG=true'
      );
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      expect(env.API_KEY).toBe('${API_KEY}');
      expect(env.DEBUG).toBe('true');
    });

    it('should format HTTP server correctly', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      expect(server.type).toBe('http');
      expect(server.url).toBe('https://mcp.example.com/v1');
    });

    it('should preserve existing non-MCP config fields', () => {
      // Write a Claude config with other fields
      const existingConfig = {
        someOtherSetting: true,
        preferences: { theme: 'dark' },
        mcpServers: {
          oldServer: { command: 'old' },
        },
      };
      const content = JSON.stringify(existingConfig, null, 2);
      writeFileSync(ctx.claudeConfigPath, content);

      // Push new servers
      runCliSuccess('add newserver --command new');
      runCliSuccess('push claude-code');

      const config = readClaudeConfig(ctx);

      // Other fields should be preserved
      expect(config?.someOtherSetting).toBe(true);
      expect(config?.preferences).toEqual({ theme: 'dark' });

      // MCP servers should be replaced (authoritative sync)
      const servers = config?.mcpServers as Record<string, unknown>;
      expect(servers).toHaveProperty('newserver');
      expect(servers).not.toHaveProperty('oldServer');
    });

    it('should merge servers with --merge flag', () => {
      // Write existing Claude config
      const existingConfig = {
        mcpServers: {
          existing: { command: 'existing-cmd' },
        },
      };
      writeFileSync(ctx.claudeConfigPath, JSON.stringify(existingConfig, null, 2));

      // Push with merge
      runCliSuccess('add newserver --command new-cmd');
      runCliSuccess('push claude-code --merge');

      const config = readClaudeConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;

      // Both should exist
      expect(servers).toHaveProperty('existing');
      expect(servers).toHaveProperty('newserver');
    });
  });

  // ===========================================================================
  // Codex Adapter
  // ===========================================================================

  describe('Codex Adapter', () => {
    it('should produce valid TOML config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push codex');

      expect(existsSync(ctx.codexConfigPath)).toBe(true);

      // Verify it's valid TOML
      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      expect(() => TOML.parse(content)).not.toThrow();
    });

    it('should use correct mcp_servers key (snake_case)', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content);

      expect(config).toHaveProperty('mcp_servers');
      expect(config.mcp_servers).toHaveProperty('github');
    });

    it('should format stdio server correctly for Codex', () => {
      runCliSuccess('add myserver --command node --args server.js');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js']);
    });

    it('should include env vars for Codex', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      expect(env.API_KEY).toBe('${API_KEY}');
    });

    it('should format HTTP server correctly for Codex', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push codex');

      const content = readFileSync(ctx.codexConfigPath, 'utf-8');
      const config = TOML.parse(content) as { mcp_servers: Record<string, unknown> };
      const server = config.mcp_servers.remote as Record<string, unknown>;

      expect(server.url).toBe('https://mcp.example.com/v1');
    });
  });

  // ===========================================================================
  // Gemini CLI Adapter
  // ===========================================================================

  describe('Gemini CLI Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push gemini-cli');

      expect(existsSync(ctx.geminiConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.geminiConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use correct mcpServers key', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push gemini-cli');

      const config = readGeminiConfig(ctx);
      expect(config).toHaveProperty('mcpServers');
      expect(config?.mcpServers).toHaveProperty('github');
    });

    it('should format stdio server correctly for Gemini', () => {
      runCliSuccess('add myserver --command node --args server.js --args --port --args 3000');
      runCliSuccess('push gemini-cli');

      const config = readGeminiConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js', '--port', '3000']);
    });

    it('should include env vars in correct format', () => {
      runCliSuccess(
        'add api-server --command node --args server.js --env API_KEY=${API_KEY} --env DEBUG=true'
      );
      runCliSuccess('push gemini-cli');

      const config = readGeminiConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      expect(env.API_KEY).toBe('${API_KEY}');
      expect(env.DEBUG).toBe('true');
    });

    it('should format HTTP server with httpUrl field', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push gemini-cli');

      const config = readGeminiConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      expect(server.httpUrl).toBe('https://mcp.example.com/v1');
    });
  });

  // ===========================================================================
  // Roo Code Adapter
  // ===========================================================================

  describe('Roo Code Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push roo-code --scope project');

      expect(existsSync(ctx.rooConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.rooConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use correct mcpServers key', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push roo-code --scope project');

      const config = readRooConfig(ctx);
      expect(config).toHaveProperty('mcpServers');
      expect(config?.mcpServers).toHaveProperty('github');
    });

    it('should format stdio server correctly for Roo', () => {
      runCliSuccess('add myserver --command node --args server.js');
      runCliSuccess('push roo-code --scope project');

      const config = readRooConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js']);
    });

    it('should transform env vars to Roo format', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push roo-code --scope project');

      const config = readRooConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      // Should be transformed to Roo format ${env:VAR}
      expect(env.API_KEY).toBe('${env:API_KEY}');
    });

    it('should format HTTP server with type and url', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push roo-code --scope project');

      const config = readRooConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      expect(server.type).toBe('streamable-http');
      expect(server.url).toBe('https://mcp.example.com/v1');
    });

    it('should handle mixed env var formats correctly', () => {
      // Test that strings with both ${env:VAR} and $VAR patterns are fully transformed
      runCliSuccess('add mixed-env --command node --args server.js --env MIXED=prefix_$SUFFIX');
      runCliSuccess('push roo-code --scope project');

      const config = readRooConfig(ctx);
      const servers = config?.mcpServers as Record<string, unknown>;
      const server = servers['mixed-env'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      // $SUFFIX should be transformed to ${env:SUFFIX}
      expect(env.MIXED).toBe('prefix_${env:SUFFIX}');
    });
  });

  // ===========================================================================
  // Amp Adapter
  // ===========================================================================

  describe('Amp Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push amp');

      expect(existsSync(ctx.ampConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.ampConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use literal amp.mcpServers key (not nested)', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push amp');

      const config = readAmpConfig(ctx);
      // The key should be literally 'amp.mcpServers' as a flat key
      expect(config).toHaveProperty('amp.mcpServers');
      expect(config?.['amp.mcpServers']).toHaveProperty('github');

      // Should NOT be nested as amp: { mcpServers: {...} }
      expect(config).not.toHaveProperty('amp');
    });

    it('should format stdio server correctly for Amp', () => {
      runCliSuccess('add myserver --command node --args server.js');
      runCliSuccess('push amp');

      const config = readAmpConfig(ctx);
      const servers = config?.['amp.mcpServers'] as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.command).toBe('node');
      expect(server.args).toEqual(['server.js']);
    });

    it('should include env vars in canonical ${VAR} format', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push amp');

      const config = readAmpConfig(ctx);
      const servers = config?.['amp.mcpServers'] as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const env = server.env as Record<string, string>;

      // Amp uses ${VAR} format (compatible with canonical)
      expect(env.API_KEY).toBe('${API_KEY}');
    });

    it('should format HTTP server with httpUrl field (Streamable HTTP)', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push amp');

      const config = readAmpConfig(ctx);
      const servers = config?.['amp.mcpServers'] as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      // Should use httpUrl (not url) for Streamable HTTP
      expect(server.httpUrl).toBe('https://mcp.example.com/v1');
      expect(server).not.toHaveProperty('url');
    });

    it('should map enabledTools to includeTools', () => {
      // First add a server
      runCliSuccess('add myserver --command node --args server.js');

      // Then manually update config to add agent-specific enabledTools
      // This would normally be done via config.yaml directly
      const configPath = ctx.configPath;
      const configContent = readFileSync(configPath, 'utf-8');
      const updatedContent = configContent.replace(
        'myserver:',
        `myserver:
    agents:
      amp:
        enabledTools:
          - read_file
          - write_file`
      );
      writeFileSync(configPath, updatedContent);

      runCliSuccess('push amp');

      const config = readAmpConfig(ctx);
      const servers = config?.['amp.mcpServers'] as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.includeTools).toEqual(['read_file', 'write_file']);
    });
  });

  // ===========================================================================
  // OpenCode Adapter
  // ===========================================================================

  describe('OpenCode Adapter', () => {
    it('should produce valid JSON config', () => {
      runCliSuccess('add test-server --command echo --args hello');
      runCliSuccess('push opencode --scope project');

      expect(existsSync(ctx.openCodeConfigPath)).toBe(true);

      // Verify it's valid JSON
      const content = readFileSync(ctx.openCodeConfigPath, 'utf-8');
      expect(() => JSON.parse(content)).not.toThrow();
    });

    it('should use mcp key (not mcpServers)', () => {
      runCliSuccess('add github --command npx --args -y @modelcontextprotocol/server-github');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      // OpenCode uses 'mcp' key, not 'mcpServers'
      expect(config).toHaveProperty('mcp');
      expect(config).not.toHaveProperty('mcpServers');
      expect(config?.mcp).toHaveProperty('github');
    });

    it('should format stdio server with type: local and command array', () => {
      runCliSuccess('add myserver --command node --args server.js --args --port --args 3000');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.type).toBe('local');
      // Command should be an array combining command and args
      expect(server.command).toEqual(['node', 'server.js', '--port', '3000']);
    });

    it('should produce command array with single element when no args', () => {
      runCliSuccess('add simple --command myserver');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.simple as Record<string, unknown>;

      // Should be ["myserver"], not ["myserver", undefined]
      expect(server.command).toEqual(['myserver']);
    });

    it('should transform env vars to OpenCode format (${VAR} -> {env:VAR})', () => {
      runCliSuccess('add api-server --command node --args server.js --env API_KEY=${API_KEY}');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;
      const environment = server.environment as Record<string, string>;

      // OpenCode uses {env:VAR} format (no dollar sign)
      expect(environment.API_KEY).toBe('{env:API_KEY}');
    });

    it('should use environment key (not env)', () => {
      runCliSuccess('add api-server --command node --env API_KEY=${API_KEY}');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers['api-server'] as Record<string, unknown>;

      // Should use 'environment', not 'env'
      expect(server).toHaveProperty('environment');
      expect(server).not.toHaveProperty('env');
    });

    it('should format HTTP server with type: remote', () => {
      runCliSuccess('add remote --type http --url https://mcp.example.com/v1');
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;

      expect(server.type).toBe('remote');
      expect(server.url).toBe('https://mcp.example.com/v1');
    });

    it('should transform headers env vars to OpenCode format', () => {
      runCliSuccess(
        'add remote --type http --url https://example.com --headers Authorization=Bearer\\ ${TOKEN}'
      );
      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.remote as Record<string, unknown>;
      const headers = server.headers as Record<string, string>;

      // Should transform ${TOKEN} to {env:TOKEN}
      expect(headers.Authorization).toBe('Bearer {env:TOKEN}');
    });

    it('should include disabledTools when specified', () => {
      // First add a server
      runCliSuccess('add myserver --command node --args server.js');

      // Manually update config to add agent-specific disabledTools
      const configPath = ctx.configPath;
      const configContent = readFileSync(configPath, 'utf-8');
      const updatedContent = configContent.replace(
        'myserver:',
        `myserver:
    agents:
      opencode:
        disabledTools:
          - dangerous_tool`
      );
      writeFileSync(configPath, updatedContent);

      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.disabledTools).toEqual(['dangerous_tool']);
    });

    it('should include autoApprove array when specified', () => {
      // First add a server
      runCliSuccess('add myserver --command node --args server.js');

      // Manually update config to add autoApprove
      const configPath = ctx.configPath;
      const configContent = readFileSync(configPath, 'utf-8');
      const updatedContent = configContent.replace(
        'myserver:',
        `myserver:
    autoApprove:
      - tool1
      - tool2`
      );
      writeFileSync(configPath, updatedContent);

      runCliSuccess('push opencode --scope project');

      const config = readOpenCodeConfig(ctx);
      const servers = config?.mcp as Record<string, unknown>;
      const server = servers.myserver as Record<string, unknown>;

      expect(server.autoApprove).toEqual(['tool1', 'tool2']);
    });
  });

  // ===========================================================================
  // Cross-Agent Sync Tests
  // ===========================================================================

  describe('Cross-Agent Sync', () => {
    it('should push same config to multiple agents', () => {
      runCliSuccess(
        'add github --command npx --args -y @modelcontextprotocol/server-github --env GITHUB_TOKEN=${GITHUB_TOKEN}'
      );
      runCliSuccess(
        'add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem /docs'
      );

      // Push to all agents
      runCliSuccess('push');

      // Verify Claude config
      expect(existsSync(ctx.claudeConfigPath)).toBe(true);
      const claudeConfig = readClaudeConfig(ctx);
      const claudeServers = claudeConfig?.mcpServers as Record<string, unknown>;
      expect(claudeServers).toHaveProperty('github');
      expect(claudeServers).toHaveProperty('filesystem');

      // Verify Codex config
      expect(existsSync(ctx.codexConfigPath)).toBe(true);
      const codexContent = readFileSync(ctx.codexConfigPath, 'utf-8');
      const codexConfig = TOML.parse(codexContent) as { mcp_servers: Record<string, unknown> };
      expect(codexConfig.mcp_servers).toHaveProperty('github');
      expect(codexConfig.mcp_servers).toHaveProperty('filesystem');

      // Verify Gemini config
      expect(existsSync(ctx.geminiConfigPath)).toBe(true);
      const geminiConfig = readGeminiConfig(ctx);
      const geminiServers = geminiConfig?.mcpServers as Record<string, unknown>;
      expect(geminiServers).toHaveProperty('github');
      expect(geminiServers).toHaveProperty('filesystem');
    });

    it('should produce equivalent server configs across agents', () => {
      runCliSuccess('add test-mcp --command node --args /path/to/server.js --env SECRET=${SECRET}');
      runCliSuccess('push');

      // Get Claude server config
      const claudeConfig = readClaudeConfig(ctx);
      const claudeServers = claudeConfig?.mcpServers as Record<string, unknown>;
      const claudeServer = claudeServers['test-mcp'] as Record<string, unknown>;

      // Get Codex server config
      const codexContent = readFileSync(ctx.codexConfigPath, 'utf-8');
      const codexConfig = TOML.parse(codexContent) as { mcp_servers: Record<string, unknown> };
      const codexServer = codexConfig.mcp_servers['test-mcp'] as Record<string, unknown>;

      // Get Gemini server config
      const geminiConfig = readGeminiConfig(ctx);
      const geminiServers = geminiConfig?.mcpServers as Record<string, unknown>;
      const geminiServer = geminiServers['test-mcp'] as Record<string, unknown>;

      // Core fields should match across Claude, Codex, and Gemini
      expect(claudeServer.command).toBe(codexServer.command);
      expect(claudeServer.command).toBe(geminiServer.command);
      expect(claudeServer.args).toEqual(codexServer.args);
      expect(claudeServer.args).toEqual(geminiServer.args);

      // Env should have same values (canonical format for Claude/Codex/Gemini)
      const claudeEnv = claudeServer.env as Record<string, string>;
      const codexEnv = codexServer.env as Record<string, string>;
      const geminiEnv = geminiServer.env as Record<string, string>;
      expect(claudeEnv.SECRET).toBe(codexEnv.SECRET);
      expect(claudeEnv.SECRET).toBe(geminiEnv.SECRET);
    });
  });

});
