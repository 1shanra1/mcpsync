# MCP Sync: Unified MCP Configuration Control Plane

## Architecture Design Document

---

## 1. Problem Statement

Developers using multiple AI coding agents (Claude Code, Gemini CLI, Codex, etc.) must maintain separate MCP server configurations for each tool. This leads to:

- **Configuration drift** - Servers added to one agent but forgotten in others
- **Tedious maintenance** - Same config copied/adapted to 5-7 different files
- **Format confusion** - JSON vs TOML, different key names, different paths
- **No single source of truth** - Hard to audit what MCP servers are actually configured

---

## 2. Solution Overview

**mcp-sync** - A CLI tool that:

1. Maintains a **canonical configuration** as the single source of truth
2. **Syncs** that configuration to all installed coding agents
3. Provides **CLI commands** to add/remove/list MCP servers once
4. Optionally **watches** for changes and auto-syncs

```
┌─────────────────────────────────────────────────────────────────┐
│                     Canonical Config                            │
│                   ~/.config/mcp-sync/config.yaml                │
└─────────────────────────────────────────────────────────────────┘
                                │
                                │ mcp-sync push
                                ▼
        ┌───────────────────────┼───────────────────────┐
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Claude Code │    │  Gemini CLI  │    │ OpenAI Codex │
│ ~/.claude.json│   │~/.gemini/    │    │~/.codex/     │
│              │    │settings.json │    │config.toml   │
└──────────────┘    └──────────────┘    └──────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   Amp Code   │    │   Roo Code   │    │   OpenCode   │
│~/.config/amp/│    │ VS Code ext  │    │~/.config/    │
│settings.json │    │ storage      │    │opencode/     │
└──────────────┘    └──────────────┘    └──────────────┘
        │
        ▼
┌──────────────┐
│  Kimi Code   │
│~/.kimi/      │
│mcp.json      │
└──────────────┘
```

---

## 3. Canonical Configuration Schema

### 3.1 File Location
```
~/.config/mcp-sync/
├── config.yaml          # Main configuration
├── servers/             # Optional: split server configs
│   ├── github.yaml
│   └── context7.yaml
└── .state.json          # Internal state tracking
```

### 3.2 Schema Design (YAML)

```yaml
# ~/.config/mcp-sync/config.yaml
version: "1"

# Global defaults
defaults:
  timeout: 60
  autoApprove: false

# MCP Server definitions
servers:
  # Stdio server example
  github:
    type: stdio
    command: npx
    args:
      - "-y"
      - "@modelcontextprotocol/server-github"
    env:
      GITHUB_PERSONAL_ACCESS_TOKEN: ${GITHUB_TOKEN}
    description: "GitHub API access"
    
    # Optional: per-server overrides
    timeout: 120
    autoApprove:
      - list_repos
      - get_file_contents
    
    # Optional: agent-specific settings
    agents:
      codex:
        enabledTools:
          - list_repos
          - create_issue
        disabledTools:
          - delete_repo

  # HTTP/Remote server example
  context7:
    type: http
    url: https://mcp.context7.com/mcp
    headers:
      CONTEXT7_API_KEY: ${CONTEXT7_API_KEY}
    description: "Documentation lookup"

  # OAuth server example  
  linear:
    type: http
    url: https://mcp.linear.app/mcp
    auth: oauth
    description: "Linear issue tracking"

# Which agents to sync to (auto-detected if omitted)
agents:
  claude-code:
    enabled: true
    scope: user  # user | project | local
  gemini-cli:
    enabled: true
    scope: user
  codex:
    enabled: true
  amp:
    enabled: true
  roo-code:
    enabled: true
  opencode:
    enabled: true
  kimi-code:
    enabled: true

# Servers to exclude from specific agents
exclusions:
  - server: github
    agent: roo-code
    reason: "Using different auth method"
```

### 3.3 Environment Variable Handling

```yaml
# Supported patterns:
env:
  # Reference env var (recommended)
  API_KEY: ${MY_API_KEY}
  
  # Reference with default
  API_KEY: ${MY_API_KEY:-default_value}
  
  # Literal value (not recommended for secrets)
  DEBUG: "true"
```

---

## 4. System Architecture

### 4.1 Component Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                            CLI Layer                                │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │
│  │  add    │ │ remove  │ │  list   │ │  push   │ │  pull   │ ...   │
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘       │
└───────┼──────────┼──────────┼──────────┼──────────┼─────────────────┘
        │          │          │          │          │
        ▼          ▼          ▼          ▼          ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Config Manager                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ Schema       │  │ Validator    │  │ Transformer  │              │
│  │ Parser       │  │              │  │              │              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        Adapter Registry                             │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Claude     │ │ Gemini     │ │ Codex      │ │ Amp        │ ...   │
│  │ Adapter    │ │ Adapter    │ │ Adapter    │ │ Adapter    │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        File System Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐              │
│  │ JSON         │  │ TOML         │  │ YAML         │              │
│  │ Reader/Writer│  │ Reader/Writer│  │ Reader/Writer│              │
│  └──────────────┘  └──────────────┘  └──────────────┘              │
└─────────────────────────────────────────────────────────────────────┘
```

### 4.2 Adapter Interface

Each agent adapter implements this interface:

```typescript
interface AgentAdapter {
  // Metadata
  name: string;                    // e.g., "claude-code"
  displayName: string;             // e.g., "Claude Code"
  
  // Detection
  detect(): Promise<boolean>;      // Is this agent installed?
  getConfigPaths(): ConfigPaths;   // Where are config files?
  
  // Read/Write
  read(): Promise<AgentConfig>;    // Read current config
  write(config: CanonicalConfig): Promise<void>;  // Write config
  
  // Validation
  validate(config: CanonicalConfig): ValidationResult;
  
  // Capabilities
  capabilities: {
    supportsHttp: boolean;
    supportsOAuth: boolean;
    supportsToolFiltering: boolean;
    supportsAutoApprove: boolean;
    supportsTimeout: boolean;
  };
}
```

### 4.3 Transformation Pipeline

```
Canonical Config (YAML)
        │
        ▼
┌──────────────────┐
│ Parse & Validate │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Resolve Env Vars │  (${VAR} → actual values or references)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Apply Exclusions │  (remove servers not meant for this agent)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Apply Overrides  │  (agent-specific settings)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Transform Schema │  (map to agent's format)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Serialize        │  (JSON, TOML, etc.)
└────────┬─────────┘
         │
         ▼
   Agent Config File
```

---

## 5. CLI Design

### 5.1 Command Structure

```bash
mcp-sync <command> [options]

Commands:
  init                    Initialize mcp-sync configuration
  add <name>              Add a new MCP server
  remove <name>           Remove an MCP server
  list                    List all configured servers
  show <name>             Show details of a server
  edit                    Open config in $EDITOR
  
  push                    Sync config to all agents
  push <agent>            Sync config to specific agent
  pull <agent>            Import config from an agent
  
  agents                  List detected agents and status
  doctor                  Check configuration health
  diff                    Show differences between canonical and agents
  
  watch                   Watch for changes and auto-sync (daemon mode)

Global Options:
  -c, --config <path>     Path to config file
  -v, --verbose           Verbose output
  -n, --dry-run           Show what would be done without doing it
  --no-color              Disable colored output
```

### 5.2 Example Workflows

```bash
# Initial setup
$ mcp-sync init
✓ Created ~/.config/mcp-sync/config.yaml
✓ Detected agents: claude-code, gemini-cli, codex, amp

# Add a server
$ mcp-sync add github
? Server type: stdio
? Command: npx
? Arguments: -y @modelcontextprotocol/server-github
? Environment variables: GITHUB_PERSONAL_ACCESS_TOKEN=${GITHUB_TOKEN}
✓ Added server 'github' to config

# Push to all agents
$ mcp-sync push
Syncing to 4 agents...
  ✓ claude-code  (3 servers)
  ✓ gemini-cli   (3 servers)
  ✓ codex        (3 servers)
  ✓ amp          (3 servers)
Done!

# Check status
$ mcp-sync doctor
Canonical config: ~/.config/mcp-sync/config.yaml
  ✓ Valid YAML
  ✓ Schema valid
  ✓ 3 servers configured

Agents:
  claude-code:
    ✓ Installed (claude v1.0.67)
    ✓ Config exists at ~/.claude.json
    ⚠ Out of sync (missing: context7)
  
  gemini-cli:
    ✓ Installed (gemini v0.4.0)
    ✓ Config exists at ~/.gemini/settings.json
    ✓ In sync
  
  codex:
    ✓ Installed (codex v1.2.0)
    ✓ Config exists at ~/.codex/config.toml
    ✓ In sync

# Import from existing agent
$ mcp-sync pull claude-code
Found 5 servers in claude-code config
? Import all? Yes
✓ Imported: github, context7, brave-search, playwright, sentry
? Push to other agents? Yes
Syncing to 3 agents...
Done!
```

---

## 6. Technology Choice

### 6.1 Language Comparison

| Criteria | Node.js/TS | Go | Rust | Python |
|----------|-----------|-----|------|--------|
| **Distribution ease** | npm install | Single binary | Single binary | pip/pipx |
| **Cross-platform** | ✓ (needs Node) | ✓ | ✓ | ✓ (needs Python) |
| **Dev familiarity** | High | Medium | Low | High |
| **Startup time** | ~200ms | ~10ms | ~5ms | ~300ms |
| **Binary size** | N/A | ~10MB | ~5MB | N/A |
| **TOML support** | ✓ | ✓ | ✓ | ✓ |
| **File watching** | ✓ (chokidar) | ✓ (fsnotify) | ✓ (notify) | ✓ (watchdog) |

### 6.2 Recommendation: **Node.js/TypeScript**

**Rationale:**
1. **Target audience already has Node.js** - These are developers using coding agents
2. **npm is frictionless** - `npm install -g mcp-sync` or `npx mcp-sync`
3. **TypeScript gives type safety** - Important for config schema validation
4. **Rich ecosystem** - YAML, TOML, JSON schema validation libraries
5. **Familiar to contributors** - Lower barrier for community contributions
6. **Fast enough** - CLI startup time is acceptable for this use case

### 6.3 Alternative: **Go**

If startup time or avoiding runtime dependencies is critical:
- Single binary distribution via GitHub releases
- Homebrew tap for macOS/Linux
- Scoop for Windows

---

## 7. Package & Distribution Strategy

### 7.1 npm (Primary)

```bash
# Global install
npm install -g mcp-sync

# Or use without installing
npx mcp-sync init
```

**package.json:**
```json
{
  "name": "mcp-sync",
  "version": "1.0.0",
  "description": "Unified MCP configuration for all your coding agents",
  "bin": {
    "mcp-sync": "./dist/cli.js"
  },
  "keywords": ["mcp", "claude", "gemini", "codex", "ai", "coding-agent"]
}
```

### 7.2 Homebrew (Secondary)

```bash
brew tap yourusername/mcp-sync
brew install mcp-sync
```

**Formula (if using Go/Rust for compiled binary):**
```ruby
class McpSync < Formula
  desc "Unified MCP configuration for coding agents"
  homepage "https://github.com/yourusername/mcp-sync"
  url "https://github.com/yourusername/mcp-sync/releases/download/v1.0.0/mcp-sync-darwin-arm64.tar.gz"
  sha256 "..."
  
  def install
    bin.install "mcp-sync"
  end
end
```

### 7.3 GitHub Releases

- Automated releases via GitHub Actions
- Pre-built binaries for: macOS (arm64, x64), Linux (x64), Windows (x64)
- Changelog generation

### 7.4 Project Structure

```
mcp-sync/
├── src/
│   ├── cli/
│   │   ├── index.ts           # CLI entry point
│   │   ├── commands/
│   │   │   ├── init.ts
│   │   │   ├── add.ts
│   │   │   ├── remove.ts
│   │   │   ├── push.ts
│   │   │   ├── pull.ts
│   │   │   ├── list.ts
│   │   │   ├── doctor.ts
│   │   │   └── watch.ts
│   │   └── utils/
│   │       ├── prompt.ts      # Interactive prompts
│   │       └── output.ts      # Colored output
│   │
│   ├── core/
│   │   ├── config.ts          # Config manager
│   │   ├── schema.ts          # Canonical schema types
│   │   ├── validator.ts       # Schema validation
│   │   └── transformer.ts     # Config transformation
│   │
│   ├── adapters/
│   │   ├── base.ts            # Base adapter interface
│   │   ├── claude-code.ts
│   │   ├── gemini-cli.ts
│   │   ├── codex.ts
│   │   ├── amp.ts
│   │   ├── roo-code.ts
│   │   ├── opencode.ts
│   │   ├── kimi-code.ts
│   │   └── index.ts           # Adapter registry
│   │
│   ├── formats/
│   │   ├── json.ts
│   │   ├── toml.ts
│   │   └── yaml.ts
│   │
│   └── index.ts               # Library exports
│
├── tests/
│   ├── adapters/
│   ├── core/
│   └── fixtures/
│
├── docs/
│   ├── getting-started.md
│   ├── configuration.md
│   └── adapters/
│
├── package.json
├── tsconfig.json
├── README.md
└── LICENSE
```

---

## 8. MVP Scope

### Phase 1: Core Functionality
- [x] Canonical config schema (YAML)
- [ ] CLI commands: init, add, remove, list, push
- [ ] Adapters: Claude Code, Gemini CLI, Codex (top 3)
- [ ] Basic documentation

### Phase 2: Full Agent Support
- [ ] Adapters: Amp, Roo Code, OpenCode, Kimi Code
- [ ] CLI commands: pull, doctor, diff
- [ ] Environment variable handling
- [ ] Agent-specific overrides

### Phase 3: Advanced Features
- [ ] Watch mode (daemon)
- [ ] Project-level configs
- [ ] Import/export for sharing
- [ ] OAuth flow handling
- [ ] Plugin system for custom adapters

---

## 9. Open Questions

1. **Conflict resolution**: When pulling from an agent, how to handle servers that exist in canonical but not agent (deleted?) vs servers in agent but not canonical (new?)?

2. **Credentials handling**: Should we support encrypted storage for API keys, or always reference env vars?

3. **Project vs global scope**: Should mcp-sync support project-level canonical configs that override global?

4. **Bidirectional sync**: Should changes in agent configs auto-sync back to canonical, or is one-way (push only) safer?

5. **Versioning**: How to handle schema changes in mcp-sync config format?

---

## 10. Success Metrics

- **Adoption**: npm weekly downloads
- **Coverage**: Number of agents supported
- **Reliability**: Issues reported for sync failures
- **Community**: GitHub stars, contributors, PRs for new adapters
