# Changelog

All notable changes to gemini-cli-scanner will be documented in this file.

## [3.2.0] - 2026-04-30

### Added
- Multi-tool AI ecosystem scanning: Antigravity, Continue, Windsurf, JetBrains AI, Claude Code
- Cross-tool skill overlap analysis
- Two-stage AI skill pipeline: `gemini-3.1-flash-lite-preview` for pattern identification, `gemini-3.1-pro-preview` for parallel skill generation
- In-place TUI progress bar for parallel skill writes
- Auto-detect report viewer cascade: glow → bat → built-in pager
- Skill quality standards: Gotchas sections, Validation loops, procedural documentation per [agentskills.io](https://agentskills.io)
- `docs/skill-identification.md` — full methodology documentation
- 118 tests across 7 test files (scanners, features, ecosystem, pipeline, report, redact, TUI)
- GitHub Actions CI: test suite on Node 18/20/22 for pushes and PRs
- GitHub Actions Release: auto-creates GitHub Release on `v*` tag push
- README badges: test status, latest release, npm version, Node.js, license
- Apache 2.0 `LICENSE` file

### Changed
- Sophistication score max raised to 115 (ecosystem bonus)

## [3.1.0] - 2026-04-30

### Added
- Recursive repo discovery under parent directories (up to 3 levels deep, configurable via `--repo-depth`)
- `--chat-days N` flag to filter conversation history to last N days
- Model fallback chain for skill suggestions (region-aware)
- TUI credential prompt and arrow-key navigation fix
- 47 tests

## [3.0.0] - 2026-04-30

### Changed
- **BREAKING:** Rewritten from Python to Node.js — zero external dependencies
- Install is now truly one command: `gemini extensions install <url>` (no pip, no venv)
- Gemini API skill suggestions use native `https` + `gcloud auth print-access-token` for Vertex AI ADC
- API key auth uses Gemini REST API directly via `fetch` (no google-generativeai SDK)
- Replaced `Makefile` with `package.json` scripts
- Removed `requirements.txt`, Python venv support

### Added
- `package.json` with npm scripts (`npm run scan`, `npm run scan:no-ai`, etc.)
- Modular source: `lib/scanners.js`, `lib/suggest.js`, `lib/report.js`, `lib/redact.js`

### Fixed
- README install instructions now match official `gemini extensions install` workflow
- Extension auto-enables on install (removed incorrect `gemini extensions enable` step)

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

### Changed
- Version tracking now embedded in JSON manifest as `scanner_version`
- Sophistication score max raised to 105 (repos bonus)

## [2.0.0] - 2026-04-30

### Added
- Claude Code (`~/.claude/`) scanning — skills catalog
- Custom agents scanning from `.gemini/agents/` and extension agents
- AI-powered skill suggestions via Gemini API (Vertex AI + API key auth)
- Sophistication score includes Claude skills bonus

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
