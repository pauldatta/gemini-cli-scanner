# gemini-cli-scanner

Discover patterns in your Gemini CLI and Claude Code environments. Extract tribal knowledge from how you *actually* use AI coding tools and surface it as reusable skills, agents, and best practices.

## Quick Start

Run the interactive scanner — no install required:

```bash
npx gemini-cli-scanner
```

This launches an interactive TUI with:
- **Quick Scan** — environment scan, optional repo discovery, no API key needed
- **Full Scan** — everything + AI-powered skill suggestions from your conversation patterns
- **View Report** — colorized markdown in your terminal
- **View Score** — visual sophistication score breakdown with progress bars

Both scan types prompt for:
- **Code repo paths** — e.g. `~/Code` to auto-discover all git repos (3 levels deep)
- **Chat history filter** — e.g. `30` for last 30 days, or Enter for all history

### Headless mode (CI, scripts, piping)

```bash
npx gemini-cli-scanner --skip-suggestions
npx gemini-cli-scanner --repos ~/Code --chat-days 30
npx gemini-cli-scanner --repos ~/Code --repo-depth 4 --skip-suggestions
```

> Pass `--` before flags if npx intercepts them: `npx gemini-cli-scanner -- --skip-suggestions`

---

## Install as Gemini CLI Extension

For `/scan` slash commands inside the Gemini CLI:

```bash
gemini extensions install https://github.com/pauldatta/gemini-cli-scanner
```

Then use natural language or slash commands:
- *"Scan my environment"* — triggers the `env-scanner` skill
- `/scan` — runs a full scan and reads the report
- `/scan-repos ~/Code` — auto-discovers and scans all repos under ~/Code

## What This Does

This scanner reads your `~/.gemini/`, `~/.claude/`, and any code repos you point it at to:

1. **Catalog** your MCP servers, skills, extensions, agents, and context files
2. **Analyze** your conversation history — what tools you use most, what topics you work on, what models you rely on
3. **Discover your AI tool ecosystem** — Antigravity, Continue, Windsurf, JetBrains AI, and Claude Code, with cross-tool skill overlap analysis
4. **Discover repos** recursively under parent directories (up to 3 levels deep by default) — no need to list each repo individually
5. **Scan code repos** for project-level `.gemini/` and `.claude/` configs — settings.json, skills, agents, GEMINI.md, CLAUDE.md
6. **Suggest new skills** by feeding your usage patterns to Gemini and identifying repeating workflows that should be automated
7. **Score** your environment sophistication (0-115) so you know what capabilities you're leaving on the table
8. **Produce** a shareable JSON manifest + markdown report (credentials auto-redacted)

## Configure (optional — for AI skill suggestions)

Set one of these environment variables to enable AI-powered skill suggestions:

```bash
# Option A: Vertex AI (uses gcloud auth ADC)
export GOOGLE_CLOUD_PROJECT="your-project"

# Option B: API key
export GOOGLE_API_KEY="your-key"
```

Without either variable, the scanner still runs — it just skips the AI suggestion step.

The suggestion engine uses a model fallback chain (`gemini-3.1-flash-lite-preview` → `gemini-3.1-pro-preview` → `gemini-3-flash-preview`) so it works even if newer models aren't available in your region yet.

## CLI Options

```
npx gemini-cli-scanner [OPTIONS]

--version, -v         Show version and exit
--gemini-dir PATH     Path to .gemini dir (default: ~/.gemini)
--home-dir PATH       Home directory for Claude scanning (default: ~)
--output-dir PATH     Output directory (default: ./scan-results)
--repos PATH [PATH..] Code repo paths or parent directories to scan
                      Parent dirs are auto-discovered recursively for git repos
--repo-depth N        Max depth for recursive repo discovery (default: 3)
--chat-days N         Only include conversation data from the last N days
                      Omit for all history
--skip-suggestions    Skip AI skill suggestion (no API key needed)
--json-only           Output JSON only, no markdown report
--skip-update-check   Don't check GitHub for newer versions
```

### Examples

```bash
# Quick scan, no AI, all history
npx gemini-cli-scanner --skip-suggestions

# Full scan with repos, last 30 days of chat history
npx gemini-cli-scanner --repos ~/Code --chat-days 30

# Deep repo discovery (4 levels), JSON only
npx gemini-cli-scanner --repos ~/Code --repo-depth 4 --json-only

# Scan specific repos
npx gemini-cli-scanner --repos ~/Code/project-a ~/Code/project-b
```

## Developer Install

```bash
git clone https://github.com/pauldatta/gemini-cli-scanner.git
cd gemini-cli-scanner

# Interactive TUI
make
# or
node tui.js

# Headless
node scanner.js --skip-suggestions

# Run tests (81 tests)
make test

# Install as Gemini CLI extension from local clone
gemini extensions install .
```

## What Gets Scanned

| Source | What's Extracted |
|:---|:---|
| `~/.gemini/settings.json` | MCP servers, model config, experimental flags, auth type |
| `~/.gemini/skills/` | All installed skills with descriptions |
| `~/.gemini/agents/` | Custom agent definitions |
| `~/.gemini/extensions/` | Extension catalog with enable/disable status |
| `~/.gemini/policies/` | Policy TOML configurations |
| `~/.gemini/GEMINI.md` | Global context file |
| `~/.gemini/tmp/*/chats/*.jsonl` | Conversation intelligence: tool frequency, models, topics, prompts, tokens |
| `~/.claude/skills/` | Claude Code skill catalog |
| `~/.claude/CLAUDE.md` | Claude context files |
| `~/.gemini/antigravity/` | Antigravity: brain conversations, skills, MCP servers, knowledge items |
| `~/.continue/skills/` | Continue skills (symlink-aware) |
| `~/.codeium/windsurf/skills/` | Windsurf skills (symlink-aware) |
| `~/Library/.../JetBrains/Air/` | JetBrains AI rules and presence |
| **`--repos` paths** | Project-level `.gemini/settings.json`, skills, agents, `GEMINI.md`, `.claude/` configs |

### Recursive Repo Discovery

When you pass a parent directory like `~/Code` to `--repos`, the scanner walks up to 3 levels deep (configurable via `--repo-depth`) looking for directories containing `.git/`. It automatically skips noise directories:

`node_modules`, `.git`, `vendor`, `__pycache__`, `dist`, `build`, `.next`, `.venv`, `venv`, `.cache`, `.npm`, `.yarn`, `coverage`, `.terraform`

Each discovered repo is logged during scanning so you can see exactly what's being processed.

## Output

After running, check `scan-results/` in your current directory:

- **`gemini-env-manifest.json`** — Full structured data (for aggregation across team members)
- **`gemini-env-report.md`** — Human-readable summary with sophistication score, top tools, suggested skills, and repo configs

**Review the report before sharing.** While credentials are auto-redacted, your conversation prompts and topics are included to enable pattern detection.

## Privacy & Redaction

The scanner automatically redacts:
- Google API keys (`AIza...`)
- OAuth tokens (`ya29...`)
- OpenAI keys (`sk-...`)
- GitHub PATs (`ghp_...`)
- Any value in fields named `token`, `secret`, `password`, `api_key`, etc.

**What it does NOT redact:** user prompts, thought topics, project names. Review the output and remove anything sensitive before sharing.

**What it does NOT touch:** Shell history, browser data, or any files outside `~/.gemini/`, `~/.claude/`, and specified `--repos` paths.

## For Teams

Run the scanner across 6-7 team members, collect the JSON manifests, and look for:
- **Shared patterns** — tools/models everyone uses → standardize
- **Unique gems** — skills only one person has → propagate
- **Gaps** — capabilities nobody uses → opportunity for enablement
- **Suggested skills overlap** — if multiple people get the same suggestion, it's a strong signal
- **Repo config divergence** — different MCP servers or skills across repos → align

## License

Apache 2.0
