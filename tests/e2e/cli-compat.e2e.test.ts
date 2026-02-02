/**
 * E2E Tests: CLI Compatibility Checks
 *
 * TIER 2 ONLY - These tests verify real CLI detection.
 * Run without MCP_SYNC_SKIP_DETECT to test actual detection logic.
 *
 * Tests use --json output and check the installed field directly,
 * not string matching on display names.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runCliSuccess, setupTestEnvironment, cleanupTestConfigs } from './helpers.js';

interface AgentStatus {
  displayName: string;
  installed: boolean;
  version?: string;
  configPath?: string;
  configExists: boolean;
  capabilities: Record<string, boolean>;
}

type AgentsOutput = Record<string, AgentStatus>;

describe('CLI Compatibility Checks', () => {
  beforeEach(() => {
    setupTestEnvironment();
    runCliSuccess('init');
  });

  afterEach(() => {
    cleanupTestConfigs();
  });

  /**
   * Helper to get agents JSON output
   */
  function getAgentsJson(): AgentsOutput {
    const result = runCliSuccess('agents --json');
    return JSON.parse(result) as AgentsOutput;
  }

  it('should return valid JSON from agents --json', () => {
    const agents = getAgentsJson();
    expect(agents).toBeDefined();
    expect(typeof agents).toBe('object');
  });

  it('should include all expected agents in output', () => {
    const agents = getAgentsJson();
    const expectedAgents = [
      'claude-code',
      'codex',
      'gemini-cli',
      'roo-code',
      'amp',
      'opencode',
      'kimi-code',
    ];

    for (const agentName of expectedAgents) {
      expect(agents).toHaveProperty(agentName);
    }
  });

  it('should detect Claude Code as installed (in Docker)', () => {
    const agents = getAgentsJson();
    // Claude Code is installed in Docker image
    expect(agents['claude-code'].installed).toBe(true);
  });

  it('should detect Codex as installed (in Docker)', () => {
    const agents = getAgentsJson();
    // Codex is installed in Docker image
    expect(agents['codex'].installed).toBe(true);
  });

  it('should detect Roo Code as installed (always true - VS Code extension)', () => {
    const agents = getAgentsJson();
    // Roo Code always reports installed: true
    expect(agents['roo-code'].installed).toBe(true);
  });

  it('should report Gemini CLI detection status', () => {
    const agents = getAgentsJson();
    // Gemini may or may not be installed - just verify the field exists
    expect(typeof agents['gemini-cli'].installed).toBe('boolean');
  });

  it('should report Amp detection status', () => {
    const agents = getAgentsJson();
    expect(typeof agents['amp'].installed).toBe('boolean');
  });

  it('should report OpenCode detection status', () => {
    const agents = getAgentsJson();
    expect(typeof agents['opencode'].installed).toBe('boolean');
  });

  it('should report Kimi Code as not installed (stub adapter)', () => {
    const agents = getAgentsJson();
    // Stub adapters always report installed: false
    expect(agents['kimi-code'].installed).toBe(false);
  });

  it('should include capabilities for each agent', () => {
    const agents = getAgentsJson();

    for (const [, status] of Object.entries(agents)) {
      expect(status.capabilities).toBeDefined();
      expect(typeof status.capabilities.supportsHttp).toBe('boolean');
    }
  });
});
