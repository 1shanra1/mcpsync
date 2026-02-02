# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-02-02

### Added
- Initial release
- Canonical YAML configuration with Zod validation
- CLI commands: init, add, remove, list, show, push, agents, doctor
- Atomic file writes with backup support
- Secret redaction in CLI output
- Environment variable substitution (`${VAR}` and `${VAR:-default}`)
- Two-tier E2E test infrastructure with Docker support
- Nightly canary workflow for upstream drift detection

### Supported Agents
- Claude Code (full support)
- Codex (full support, TOML config, tool filtering)
- Gemini CLI (full support, tool filtering, trust settings)
- Roo Code (full support, alwaysAllow, env var transform)
- Amp (full support, includeTools, HTTP servers)
- OpenCode (full support, disabledTools, autoApprove)
- Kimi Code (stub - coming soon)
