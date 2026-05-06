# Contributing to gemini-cli-scanner

Guide for humans and coding agents. Follow these rules to make clean, mergeable contributions.

## Architecture

```
scanner.js          CLI entry point, flag parsing, collapseForPrivacy(), serialization
tui.js              Interactive terminal UI (spawns scanner.js)
lib/
  scanners.js       All scan* functions (scanSettings, scanSkills, scanConversations, etc.)
  suggest.js        Two-stage AI pipeline (identifier → writer), evidence gating
  report.js         Markdown report generator (computeScore, generateReport)
  advisor.js        Maturity advisory engine (11 categories, 0–67 scoring)
  redact.js         Credential redaction (API keys, tokens, PATs)
  toml-lite.js      Lightweight TOML parser for policy files
  dashboard/        Team dashboard (aggregator + HTML + HTTP server)
skills/             Gemini CLI extension skill definitions
test/               Node.js native test runner (node --test)
docs/               GitHub Pages (Docsify + landing page)
```

## Critical Rules

### Privacy-by-default (v3.5.6+)

The manifest output uses a **collapse-to-counts** privacy model:

- `collapseForPrivacy()` in `scanner.js` strips `user_prompts`, `thought_topics_top_15`, `projects`, `tool_chains`, and repo names/paths from the JSON manifest
- These are replaced with `user_prompt_count`, `topic_count`, `project_count`, and `repo_count`
- The AI synthesis pipeline (`suggest.js`) uses full in-memory data before serialization
- The markdown report is generated from the **unredacted** in-memory manifest (clone-on-serialize)
- `--include-prompts` bypasses collapse for local power-user analysis

**When adding new data to the manifest:** If it contains user-generated text, PII, or project identifiers, add a collapse rule to `collapseForPrivacy()` and a test in `test/privacy.test.js`.

### Zero dependencies

This project has **no npm dependencies**. Do not add any. Everything uses Node.js built-in modules (`fs`, `path`, `crypto`, `http`, `readline`, `child_process`, `node:test`, `node:assert`).

### Test requirements

- Test runner: `node --test` (Node.js native, no frameworks)
- All tests must pass before commit: `node --test`
- Current count: 233 tests across 11 test files
- Tests are co-located in `test/` with `*.test.js` naming
- New features must include tests. No exceptions.

### Version cadence

- Follows semver: `3.x.y`
- Bump in `package.json` only, scanner.js reads from `package.json` at build time via `VERSION` constant (keep both in sync)
- Update version in: `package.json`, `scanner.js` (`VERSION` const), `docs/index.html`, `docs/_coverpage.md`, `skills/env-scanner/SKILL.md`, `scanner-GEMINI.md`

### Credential redaction

`lib/redact.js` auto-strips: `AIza*`, `sk-*`, `ya29*`, `ghp_*`, and fields named `token`, `secret`, `password`, `api_key`. When adding new scanner output that may contain secrets, pipe it through `redactDict()`.

## Adding a New Scanner

1. Add `scanNewThing()` to `lib/scanners.js` — return `{ found: boolean, ...data }`
2. Wire it into `scanner.js` main flow (after the scan loop, before suggestions)
3. Add the data to `generateReport()` in `lib/report.js` if it should appear in the markdown
4. Add advisory rules in `lib/advisor.js` if the feature has maturity implications
5. If the data contains PII/user text, add a collapse rule in `collapseForPrivacy()`
6. Add tests in `test/scanners.test.js` (or a new test file)
7. Update `docs/scanning.md` reference table

## Adding a New CLI Flag

1. Add to `parseArgs` options in `scanner.js` (alphabetical order in the options object)
2. Wire into the main flow
3. Update the flags table in:
   - `README.md`
   - `skills/env-scanner/SKILL.md`
   - `docs/quick-start.md` (if user-facing)

## AI Suggestion Pipeline

The pipeline in `lib/suggest.js` has two stages:

1. **Identifier** (`buildIdentifierPrompt`): Uses flash-lite to extract skill candidates from tool usage, chain patterns, domain topics, and repo configs. Evidence-gated — skips API call if < 10 prompts or patterns in only 1 project.
2. **Writer** (`buildSingleSkillWriterPrompt`): Uses pro to write full SKILL.md files in parallel for each candidate.

Domain topics (`thought_topics_top_15`) are injected into the identifier prompt to improve skill relevance. When modifying the pipeline, ensure raw data stays in-memory and never leaks to the serialized manifest (unless `--include-prompts`).

## Commit Messages

Use conventional commits:
- `feat:` — new capability
- `fix:` — bug fix
- `docs:` — documentation only
- `test:` — test additions/changes
- `refactor:` — code change with no behavior change

## Running Locally

```bash
# Run tests
node --test

# Quick scan (no API)
node scanner.js --skip-suggestions --skip-update-check

# Full scan with AI
GOOGLE_API_KEY=AIza... node scanner.js

# TUI
node tui.js

# Dashboard
node scanner.js dashboard --source ./scan-results
```

## File Size Awareness

This is a single-file-per-concern codebase. Key files and approximate sizes:

| File | Lines | Role |
|:---|:---|:---|
| `scanner.js` | ~250 | Entry point + privacy |
| `tui.js` | ~830 | Interactive UI |
| `lib/scanners.js` | ~800 | All scan functions |
| `lib/suggest.js` | ~380 | AI pipeline |
| `lib/report.js` | ~400 | Report generation |
| `lib/advisor.js` | ~600 | Advisory engine |

Keep files focused. Don't merge concerns across files.
