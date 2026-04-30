# gemini-cli-scanner

Discover patterns in your Gemini CLI and Claude Code environments. Extract tribal knowledge from how you *actually* use AI coding tools and surface it as reusable skills, agents, and best practices.

## Install as Gemini CLI Extension

```bash
gemini extensions install https://github.com/pauldatta/gemini-cli-scanner
```

That's it. The only dependency (`@google/genai`) is bundled — no manual `npm install` required. Node.js is already present because Gemini CLI requires it.

### Developer Install (for contributing)

```bash
git clone https://github.com/pauldatta/gemini-cli-scanner.git
cd gemini-cli-scanner

# Install from local clone
gemini extensions install .

# Or symlink for live-editing (changes reflected without reinstall)
gemini extensions link .
```

### Configure (optional — for AI skill suggestions)

```bash
gemini extensions config gemini-cli-scanner
```

You'll be prompted for:
- **Google Cloud Project** — for Vertex AI skill suggestions (uses `gcloud auth` ADC)
- **Google API Key** — alternative to Vertex AI (stored in system keychain)

### What You Get

| Feature | Description |
|:---|:---|
| **Context file** | `scanner-GEMINI.md` — teaches Gemini how to use the scanner |
| **Skill** | `env-scanner` — activated when you ask about environment patterns |
| **`/scan`** | Custom command to run a full scan with one slash command |
| **`/scan-repos`** | Custom command to scan with repo paths |
| **Settings** | `Google Cloud Project` and `Google API Key` stored in system keychain |

### Usage

Use natural language or custom commands:
- *"Scan my environment"* — triggers the `env-scanner` skill
- `/scan` — runs the scanner and reads the report
- `/scan-repos ~/Code/project-a ~/Code/project-b` — scans repos too

## What This Does

This scanner reads your `~/.gemini/`, `~/.claude/`, and any code repos you point it at to:

1. **Catalog** your MCP servers, skills, extensions, agents, and context files
2. **Analyze** your conversation history — what tools you use most, what topics you work on, what models you rely on
3. **Scan code repos** for project-level `.gemini/` and `.claude/` configs — settings.json, skills, agents, GEMINI.md, CLAUDE.md
4. **Suggest new skills** by feeding your usage patterns to Gemini and identifying repeating workflows that should be automated
5. **Score** your environment sophistication (0-105) so you know what capabilities you're leaving on the table
6. **Produce** a shareable JSON manifest + markdown report (credentials auto-redacted)

## Interactive TUI

For a visual experience with arrow-key navigation, score dashboard, and report viewer:

```bash
# From cloned repo
make
# or
node tui.js
```

The TUI provides:
- **Quick Scan** — environment-only, no API key needed
- **Full Scan** — with AI-powered skill suggestions
- **Scan with Repos** — include code repositories
- **View Report** — colorized markdown in your terminal
- **View Score** — visual score breakdown with progress bars

> The Gemini CLI extension uses the scanner directly via `/scan` — no TUI needed.

## Standalone Usage (headless)

You can also run the scanner directly without installing as an extension:

```bash
# Full scan with AI skill suggestions
GOOGLE_API_KEY="your-key" node scanner.js

# With Vertex AI
GOOGLE_CLOUD_PROJECT="your-project" node scanner.js

# Without AI suggestions
node scanner.js --skip-suggestions

# Scan code repos
node scanner.js --repos ~/Code/project-a ~/Code/project-b

# Custom output directory
node scanner.js --output-dir ~/Desktop/my-scan
```

### CLI Options

```
node scanner.js [OPTIONS]

--version, -v         Show version and exit
--gemini-dir PATH     Path to .gemini dir (default: ~/.gemini)
--home-dir PATH       Home directory for Claude scanning (default: ~)
--output-dir PATH     Output directory (default: ./scan-results)
--repos PATH [PATH..] Code repo paths to scan for project-level configs
--skip-suggestions    Skip AI skill suggestion (no API key needed)
--json-only           Output JSON only, no markdown report
--skip-update-check   Don't check GitHub for newer versions
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
| **`--repos` paths** | Project-level `.gemini/settings.json`, skills, agents, `GEMINI.md`, `.claude/` configs |

## Output

After running, check `scan-results/`:

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
