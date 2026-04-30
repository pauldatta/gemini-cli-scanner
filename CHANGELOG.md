# Changelog

All notable changes to gemini-cli-scanner will be documented in this file.

## [3.4.0] - 2026-04-30

### Added
- **Documentation Site:** Docsify-based GitHub Pages site at [pauldatta.github.io/gemini-cli-scanner](https://pauldatta.github.io/gemini-cli-scanner/) — custom landing page with promo video, "How It Works" cards, and full docs navigation
- **Back to Menu:** Type `b` or `back` at any scan prompt (repos, chat days) to return to the main menu without starting a scan
- **Comma-Separated Repos:** TUI now accepts both space-separated and comma-separated repo paths (e.g. `~/proj-a, ~/proj-b`)
- **TUI Tests:** 18 new tests for `promptRepos` and `promptChatDays` covering BACK navigation, input parsing, delimiter handling, and edge cases
- **Issue Triage:** Automated GitHub issue labeling via Gemini CLI action (`issue-triage.yml`)
- **Dependabot:** Enabled for GitHub Actions dependency updates

### Changed
- README restructured: slim quick-start overview with deep-links to docs site for technical details
- TUI screenshot added to README hero section
- Docs: advisory-engine, scanning reference, skill-suggestions, teams usage, quick-start guide
- 173 tests across 9 test files (up from 155)

## [3.3.1] - 2026-04-30

### Added
- **Maturity Dashboard:** Renamed "View Score" → "Maturity Dashboard" — unified view combining maturity tier, capability score breakdown, quick stats, and all advisory recommendations grouped by category
- **Scrollable Viewer:** Full-screen scrollable viewer for both Report and Dashboard with ↑/↓/j/k (line), f/b/PgUp/PgDn (page), g/G/Home/End (top/bottom), Esc/q (exit)
- **Report TOC Navigation:** Press `t` in View Report to open a section-jump overlay — dynamically built from report headings, arrow keys to select, Enter to jump
- **Auth Export Hints:** When entering a new API key or GCP project, the TUI shows the `export` command to persist it across terminal sessions
- **Resilient Skill Pipeline:** `callModel` retries on all errors across the full model chain; failed generation produces a procedural SKILL.md template instead of dead-end text

### Changed
- Report and Dashboard viewers exit cleanly to the main menu (no "press any key" interruption)
- Built-in report viewer replaces glow/bat external tools for consistent UX across all environments
- "Sophistication Score" renamed to "Maturity Score" in report, scanner output, and TUI
- Auth Settings: entered credentials are cached in session snapshot for instant re-switching
- 155 tests (consolidated report viewer cascade tests)

## [3.3.0] - 2026-04-30

### Added
- **Best Practices Advisor:** New advisory engine evaluates Gemini CLI configs against 8 categories of documented best practices (Policy Hygiene, MCP Governance, GEMINI.md Quality, Skills Optimization, Settings Optimization, Hooks Utilization, Extension Health, Context Architecture)
- **Maturity Rating:** Environment health displayed as Getting Started → Intermediate → Advanced → Expert (internal score for CI gating)
- **Doc Links:** Every recommendation links directly to the relevant Gemini CLI repo documentation
- `lib/advisor.js` — pure-function advisory engine
- `lib/toml-lite.js` — minimal TOML parser for policy file analysis (zero dependencies)
- `test/advisor.test.js` — 28 advisory engine tests
- `test/toml-lite.test.js` — 10 TOML parser tests
- 156 total tests (up from 118)

### Changed
- Scanners enriched: `scanSettings` preserves raw settings, `scanPolicies` parses TOML into structured rules, `parseSkillsDir` checks for Gotchas/Validation sections, `scanRepos` detects `.geminiignore`
- TUI score view now includes advisory section with top 5 recommendations
- Markdown report includes full advisory section grouped by category
- API key and GCP project input validation in TUI
- TUI keypress guard prevents input during active scans

## [3.2.1] - 2026-04-30

### Fixed
- TUI header now reads version from `package.json` — no more hardcoded version drift
- Update check suggests `npx gemini-cli-scanner@latest` for npx users

### Changed
- ASCII art GEMINI banner replaces box-style TUI header

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
