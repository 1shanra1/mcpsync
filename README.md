# mcp-sync

**Unified MCP server configuration for all your coding agents.**

Stop copying MCP server configs between Claude Code, Gemini CLI, OpenAI Codex, and other AI coding tools. Define your servers once, sync everywhere.

```bash
# Add a server once
mcp-sync add github --command npx --args "-y @modelcontextprotocol/server-github"

# Push to all your coding agents
mcp-sync push

# ✓ claude-code  (3 servers)
# ✓ gemini-cli   (3 servers)
# ✓ codex        (3 servers)
```

## Installation

```bash
npm install -g mcp-sync
```

Or use without installing:

```bash
npx mcp-sync init
```

## Quick Start

```bash
# 1. Initialize config
mcp-sync init

# 2. Add your MCP servers
mcp-sync add github
# Interactive prompts guide you through setup

# 3. Sync to all detected agents
mcp-sync push

# 4. Check everything is working
mcp-sync doctor
```

## Supported Agents

| Agent | Status | Config Format | Notes |
|-------|--------|---------------|-------|
| Claude Code | ✅ | JSON | Full support |
| OpenAI Codex | ✅ | TOML | Full support including tool filtering |
| Gemini CLI | 🚧 | JSON | Coming soon |
| Amp Code | 🚧 | JSON | Coming soon |
| Roo Code | 🚧 | JSON | Coming soon |
| OpenCode | 🚧 | JSON | Coming soon |
| Kimi Code | 🚧 | JSON | Coming soon |

## Commands

### `mcp-sync init`

Initialize a new configuration file.

```bash
mcp-sync init           # Create ~/.config/mcp-sync/config.yaml
mcp-sync init --force   # Overwrite existing config
```

### `mcp-sync add <n>`

Add a new MCP server.

```bash
# Interactive mode
mcp-sync add github

# Non-interactive
mcp-sync add github \
  --type stdio \
  --command npx \
  --args "-y" "@modelcontextprotocol/server-github" \
  --env "GITHUB_TOKEN=\${GITHUB_TOKEN}"

# HTTP server
mcp-sync add context7 \
  --type http \
  --url "https://mcp.context7.com/mcp" \
  --env "CONTEXT7_API_KEY=\${CONTEXT7_API_KEY}"
```

### `mcp-sync remove <n>`

Remove an MCP server.

```bash
mcp-sync remove github
```

### `mcp-sync list`

List all configured servers.

```bash
mcp-sync list         # Table format
mcp-sync list --json  # JSON format
```

### `mcp-sync push [agent]`

Sync configuration to agents.

```bash
mcp-sync push              # All installed agents
mcp-sync push claude-code  # Specific agent
mcp-sync push --dry-run    # Preview changes
```

### `mcp-sync agents`

List detected agents and their status.

```bash
mcp-sync agents         # Table format
mcp-sync agents --json  # JSON format
```

### `mcp-sync doctor`

Health check for your configuration.

```bash
mcp-sync doctor
```

## Configuration

Configuration lives at `~/.config/mcp-sync/config.yaml`:

```yaml
version: "1"

defaults:
  timeout: 60
  autoApprove: false

servers:
  # Stdio server (local command)
  github:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_TOKEN}
    description: "GitHub API access"
    
    # Agent-specific overrides
    agents:
      codex:
        enabledTools:
          - list_repos
          - get_file_contents
        disabledTools:
          - delete_repo

  # HTTP server (remote)
  context7:
    type: http
    url: https://mcp.context7.com/mcp
    headers:
      CONTEXT7_API_KEY: ${CONTEXT7_API_KEY}
    description: "Documentation lookup"

# Optional: control which agents to sync to
agents:
  claude-code:
    enabled: true
    scope: user
  codex:
    enabled: true

# Optional: exclude servers from specific agents
exclusions:
  - server: github
    agent: roo-code
    reason: "Using different auth method"
```

### Environment Variables

Use `${VAR_NAME}` syntax to reference environment variables:

```yaml
env:
  API_KEY: ${MY_API_KEY}           # Required
  API_KEY: ${MY_API_KEY:-default}  # With default value
```

### Agent-Specific Settings

Some features are only supported by certain agents. Use the `agents` key to customize:

```yaml
servers:
  myserver:
    type: stdio
    command: myserver
    agents:
      codex:
        # Codex supports tool filtering
        enabledTools: [tool1, tool2]
        disabledTools: [dangerous_tool]
      claude-code:
        # Different timeout for Claude
        timeout: 120
```

## Programmatic Usage

```typescript
import { ConfigManager, adapterRegistry } from 'mcp-sync';

// Load config
const manager = new ConfigManager();
const config = manager.get();

// Sync to specific adapter
const claudeAdapter = adapterRegistry.get('claude-code');
if (claudeAdapter) {
  await claudeAdapter.write(config);
}

// Detect installed agents
const installed = await adapterRegistry.getInstalled();
for (const adapter of installed) {
  console.log(`Found: ${adapter.displayName}`);
}
```

## Contributing

Contributions welcome! Areas we need help with:

- **New adapters**: Gemini CLI, Amp, Roo Code, OpenCode, Kimi Code
- **Testing**: Test coverage for adapters
- **Documentation**: Guides for specific workflows

### Adding a New Adapter

1. Create `src/adapters/your-agent.ts` implementing `BaseAdapter`
2. Register in `src/adapters/index.ts`
3. Add tests in `tests/adapters/your-agent.test.ts`

See `src/adapters/claude-code.ts` for reference.

## License

MIT
