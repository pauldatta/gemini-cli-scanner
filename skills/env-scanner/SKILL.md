---
name: env-scanner
description: Scan Gemini CLI, Claude Code, Antigravity, Continue, Windsurf, and JetBrains AI environments to discover patterns, catalog configurations, and suggest reusable skills. Use when the user wants to analyze their AI tool setup, audit their ecosystem, discover usage patterns, or generate a sophistication report.
---

# Environment Scanner Skill

Runs the `gemini-cli-scanner` to analyze the user's AI coding tool ecosystem across `~/.gemini/`, `~/.claude/`, Antigravity brain logs, Continue, Windsurf, and JetBrains AI configurations.

## When to Activate

- User asks to "scan my environment", "analyze my setup", or "audit my tools"
- User wants to know what skills, MCP servers, extensions, or agents they have installed
- User wants to discover usage patterns from their conversation history
- User wants a sophistication score or environment report
- User mentions "tribal knowledge", "pattern discovery", "skill suggestions", or "ecosystem audit"

## Running the Scanner

The scanner lives in the extension directory. Use `${extensionPath}` to reference it.

### Full scan with AI skill suggestions

Requires `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT` set. Uses a two-stage pipeline: flash-lite identifies patterns, pro writes SKILL.md files in parallel.

```bash
node ${extensionPath}/scanner.js --output-dir ./scan-results
```

### Quick scan without AI suggestions

```bash
node ${extensionPath}/scanner.js --output-dir ./scan-results --skip-suggestions
```

### Scan with code repos (recursive discovery)

Pass a parent directory — the scanner walks up to N levels deep looking for `.git/` repos automatically.

```bash
# Auto-discover repos under ~/Code (3 levels deep by default)
node ${extensionPath}/scanner.js --output-dir ./scan-results --repos ~/Code

# Deeper discovery (4 levels)
node ${extensionPath}/scanner.js --output-dir ./scan-results --repos ~/Code --repo-depth 4

# Specific repos
node ${extensionPath}/scanner.js --output-dir ./scan-results --repos ~/Code/project-a ~/Code/project-b
```

### Filter conversation history

```bash
# Only last 30 days of chat history
node ${extensionPath}/scanner.js --output-dir ./scan-results --chat-days 30

# JSON manifest only, no markdown report
node ${extensionPath}/scanner.js --output-dir ./scan-results --json-only
```

### All flags

| Flag | Type | Default | Purpose |
|:---|:---|:---|:---|
| `--version`, `-v` | boolean | — | Show version and exit |
| `--gemini-dir PATH` | string | `~/.gemini` | Path to .gemini dir |
| `--home-dir PATH` | string | `~` | Home directory for Claude/ecosystem scanning |
| `--output-dir PATH` | string | `./scan-results` | Output directory for results |
| `--repos PATH [PATH..]` | string[] | `[]` | Code repo paths or parent directories |
| `--repo-depth N` | string | `3` | Max depth for recursive repo discovery |
| `--chat-days N` | string | all | Only include conversation data from last N days |
| `--skip-suggestions` | boolean | `false` | Skip AI skill suggestion (no API key needed) |
| `--json-only` | boolean | `false` | Output JSON only, no markdown report |
| `--skip-update-check` | boolean | `false` | Don't check GitHub for newer versions |

## Output Files

- `scan-results/gemini-env-manifest.json` — Full structured data (for aggregation across team members)
- `scan-results/gemini-env-report.md` — Human-readable markdown report

## Reading the Report

After running, read `scan-results/gemini-env-report.md` and present the key findings to the user:

1. **Sophistication Score** — How fully they use the platform (0-115)
2. **MCP Servers** — What integrations are configured
3. **Skills & Extensions** — What's installed across all tools (Gemini, Claude, Continue, Windsurf)
4. **Conversation Intelligence** — Top tools, models, token usage, session volume, prompt patterns
5. **Antigravity Brain** — Knowledge items, brain conversation count, artifact distribution
6. **AI Ecosystem** — Cross-tool skill overlap analysis (Continue, Windsurf, JetBrains)
7. **Suggested Skills** — AI-generated SKILL.md files with Gotchas, Validation, and Best Practices sections
8. **Code Repos** — Project-level `.gemini/` and `.claude/` configs if `--repos` was used

## Gotchas

- The scanner auto-redacts credentials (API keys, tokens, PATs) but **user prompts and topics are included** for pattern detection — always remind the user to review before sharing
- `--repos ~/Code` discovers repos recursively — on large directories this can take a few seconds. Use `--repo-depth 2` to limit depth if needed
- Without `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT`, the scanner runs fine but skips skill suggestions entirely
- The two-stage skill pipeline requires API access: Stage 1 (flash-lite) identifies candidates, Stage 2 (pro) writes them in parallel. If pro models aren't available in your region, it falls back through `gemini-3-pro-preview` → `gemini-3-flash-preview`
- `--chat-days` filters by the `timestamp` field in JSONL records — if records lack timestamps they're included by default

## Validation

After running the scanner, verify the output:

```bash
# Check both files were created
ls -la scan-results/gemini-env-manifest.json scan-results/gemini-env-report.md

# Verify JSON is valid
node -e "JSON.parse(require('fs').readFileSync('scan-results/gemini-env-manifest.json', 'utf8')); console.log('✓ Valid JSON')"

# Check score was computed
node -e "const m = JSON.parse(require('fs').readFileSync('scan-results/gemini-env-manifest.json', 'utf8')); console.log('Score:', m.sophistication_score?.total + '/' + m.sophistication_score?.max)"

# If skills were suggested, check count
node -e "const m = JSON.parse(require('fs').readFileSync('scan-results/gemini-env-manifest.json', 'utf8')); console.log('Skills suggested:', (m.suggested_skills||[]).length)"
```
