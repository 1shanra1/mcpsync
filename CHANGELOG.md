# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - Unreleased

### Added
- Initial release
- Canonical YAML configuration with Zod validation
- CLI commands: init, add, remove, list, show, edit, push, agents, doctor
- Adapters for Claude Code and Codex
- Atomic file writes with backup support
- Secret redaction in CLI output
- Environment variable substitution (`${VAR}` and `${VAR:-default}`)
- Docker-based E2E test infrastructure

### Supported Agents
- Claude Code (full support)
- Codex (full support)
- Gemini CLI, Amp, Roo Code, OpenCode, Kimi Code (stubs)
