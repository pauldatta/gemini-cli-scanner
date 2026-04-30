# Changelog

All notable changes to gemini-cli-scanner will be documented in this file.

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
