import { z } from 'zod';

// =============================================================================
// Canonical Schema Types
// =============================================================================

/**
 * Environment variable definition
 * Supports: literal values, ${VAR} references, ${VAR:-default} patterns
 */
export const EnvValueSchema = z.string();

export const EnvSchema = z.record(z.string(), EnvValueSchema);

/**
 * Auto-approve configuration
 * Can be boolean (all or none) or array of tool names
 */
export const AutoApproveSchema = z.union([
  z.boolean(),
  z.array(z.string()),
]);

/**
 * Agent-specific overrides for a server
 */
export const AgentOverrideSchema = z.object({
  enabled: z.boolean().optional(),
  enabledTools: z.array(z.string()).optional(),
  disabledTools: z.array(z.string()).optional(),
  timeout: z.number().optional(),
  autoApprove: AutoApproveSchema.optional(),
}).strict();

/**
 * Stdio MCP Server configuration
 */
export const StdioServerSchema = z.object({
  type: z.literal('stdio'),
  command: z.string(),
  args: z.array(z.string()).optional().default([]),
  env: EnvSchema.optional().default({}),
  description: z.string().optional(),
  timeout: z.number().optional(),
  autoApprove: AutoApproveSchema.optional(),
  agents: z.record(z.string(), AgentOverrideSchema).optional(),
});

/**
 * HTTP/Remote MCP Server configuration
 */
export const HttpServerSchema = z.object({
  type: z.literal('http'),
  url: z.string().url(),
  headers: EnvSchema.optional().default({}),
  auth: z.enum(['none', 'oauth', 'bearer']).optional().default('none'),
  description: z.string().optional(),
  timeout: z.number().optional(),
  autoApprove: AutoApproveSchema.optional(),
  agents: z.record(z.string(), AgentOverrideSchema).optional(),
});

/**
 * Union of all server types
 */
export const ServerSchema = z.discriminatedUnion('type', [
  StdioServerSchema,
  HttpServerSchema,
]);

/**
 * Agent configuration
 */
export const AgentConfigSchema = z.object({
  enabled: z.boolean().default(true),
  scope: z.enum(['user', 'project', 'local']).optional().default('user'),
});

/**
 * Exclusion rule
 */
export const ExclusionSchema = z.object({
  server: z.string(),
  agent: z.string(),
  reason: z.string().optional(),
});

/**
 * Global defaults
 */
export const DefaultsSchema = z.object({
  timeout: z.number().optional().default(60),
  autoApprove: AutoApproveSchema.optional().default(false),
});

/**
 * Root canonical configuration
 */
export const CanonicalConfigSchema = z.object({
  version: z.literal('1'),
  defaults: DefaultsSchema.optional().default({}),
  servers: z.record(z.string(), ServerSchema),
  agents: z.record(z.string(), AgentConfigSchema).optional().default({}),
  exclusions: z.array(ExclusionSchema).optional().default([]),
});

// =============================================================================
// Type Exports
// =============================================================================

export type EnvValue = z.infer<typeof EnvValueSchema>;
export type Env = z.infer<typeof EnvSchema>;
export type AutoApprove = z.infer<typeof AutoApproveSchema>;
export type AgentOverride = z.infer<typeof AgentOverrideSchema>;
export type StdioServer = z.infer<typeof StdioServerSchema>;
export type HttpServer = z.infer<typeof HttpServerSchema>;
export type Server = z.infer<typeof ServerSchema>;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
export type Exclusion = z.infer<typeof ExclusionSchema>;
export type Defaults = z.infer<typeof DefaultsSchema>;
export type CanonicalConfig = z.infer<typeof CanonicalConfigSchema>;

// =============================================================================
// Supported Agents
// =============================================================================

export const SUPPORTED_AGENTS = [
  'claude-code',
  'gemini-cli',
  'codex',
  'amp',
  'roo-code',
  'opencode',
  'kimi-code',
] as const;

export type SupportedAgent = typeof SUPPORTED_AGENTS[number];

// =============================================================================
// Agent Capabilities
// =============================================================================

export interface AgentCapabilities {
  supportsHttp: boolean;
  supportsOAuth: boolean;
  supportsToolFiltering: boolean;
  supportsAutoApprove: boolean;
  supportsTimeout: boolean;
  supportsProjectScope: boolean;
}

// =============================================================================
// Validation Helpers
// =============================================================================

export function validateConfig(config: unknown): CanonicalConfig {
  return CanonicalConfigSchema.parse(config);
}

export function validateConfigSafe(config: unknown): {
  success: true;
  data: CanonicalConfig
} | {
  success: false;
  error: z.ZodError
} {
  const result = CanonicalConfigSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}
