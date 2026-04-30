# Changelog

All notable changes to gemini-cli-scanner will be documented in this file.

## [2.3.0] - 2026-04-30

### Added
- Gemini CLI extension support: `gemini-extension.json`, `scanner-GEMINI.md` context file
- Custom commands: `/scan` and `/scan-repos` via `commands/` directory
- Extension settings: `Google Cloud Project` and `Google API Key` (stored in system keychain)
- Agent skill: `skills/env-scanner/SKILL.md` for natural language invocation
- Deep repo scanning: extracts GEMINI.md/CLAUDE.md content, MCP server commands+args, skill content, agent frontmatter
- Repo configs now fed into AI skill suggestion prompt for cross-project pattern detection
- Rich report: MCP commands, skill descriptions, agent models per repo
- Developer install path: `gemini extensions link .`

## [2.2.0] - 2026-04-30

### Added
- `--repos PATH [PATH...]` flag to scan code repo project-level configs
- Auto-update check against GitHub releases on every scan
- `--version` flag to print current version
- `--skip-update-check` flag for offline/CI usage
- CHANGELOG.md for tracking release notes

### Changed
- Version tracking now embedded in JSON manifest as `scanner_version`
- Sophistication score max raised to 105 (repos bonus)

## [2.1.0] - 2026-04-30

### Added
- Auto-update check against GitHub releases on every scan
- `--version` flag to print current version
- `--skip-update-check` flag for offline/CI usage
- CHANGELOG.md for tracking release notes

### Changed
- Version tracking now embedded in JSON manifest as `scanner_version`

## [2.0.0] - 2026-04-30

### Added
- Claude Code (`~/.claude/`) scanning — skills catalog
- Custom agents scanning from `.gemini/agents/` and extension agents
- AI-powered skill suggestions via Gemini API (Vertex AI + API key auth)
- Sophistication score includes Claude skills bonus
- Makefile for easy execution (`make scan`, `make scan-no-ai`)
- Sample report (`SAMPLE_REPORT.md`)

### Changed
- Restructured as standalone repo with its own git history
- Auth: Vertex AI with ADC as primary, API key as fallback

## [1.0.0] - 2026-04-30

### Added
- Initial scanner: settings.json, skills, extensions, policies, GEMINI.md
- Conversation JSONL parsing for tool usage, models, thought topics
- Credential auto-redaction
- Sophistication score (0-100)
- JSON manifest + Markdown report output
