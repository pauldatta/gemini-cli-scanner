# gemini-cli-scanner

Discover patterns in your Gemini CLI and Claude Code environments. Extract tribal knowledge from how you *actually* use AI coding tools and surface it as reusable skills, agents, and best practices.

## Install as Gemini CLI Extension

Install the scanner as a Gemini CLI extension so you can use it directly from your AI coding sessions:

```bash
# Clone the repo into your Gemini extensions directory
git clone https://github.com/pauldatta/gemini-cli-scanner.git ~/.gemini/extensions/gemini-cli-scanner

# Enable it for all projects
gemini extensions enable gemini-cli-scanner

# Install Python dependencies
cd ~/.gemini/extensions/gemini-cli-scanner && pip install -r requirements.txt
```

Once installed, just ask Gemini:
- *"Scan my environment"*
- *"What skills do I have installed?"*
- *"Suggest new skills based on my usage patterns"*
- *"Scan my ~/Code repos for AI tool configs"*

The extension includes a `skills/env-scanner/SKILL.md` that teaches the agent how to run and interpret the scanner.

## What This Does

This scanner reads your `~/.gemini/`, `~/.claude/`, and any code repos you point it at to:

1. **Catalog** your MCP servers, skills, extensions, agents, and context files
2. **Analyze** your conversation history — what tools you use most, what topics you work on, what models you rely on
3. **Scan code repos** for project-level `.gemini/` and `.claude/` configs — settings.json, skills, agents, GEMINI.md, CLAUDE.md
4. **Suggest new skills** by feeding your usage patterns to Gemini and identifying repeating workflows that should be automated
5. **Score** your environment sophistication (0-105) so you know what capabilities you're leaving on the table
6. **Produce** a shareable JSON manifest + markdown report (credentials auto-redacted)

The goal: **uncover the patterns hiding in your environment and turn them into portable, reusable skills and tools.**

## Quick Start

### Option 1: With Gemini API key (includes AI skill suggestions)

```bash
export GOOGLE_API_KEY="your-api-key"
make scan
```

### Option 2: With Google Cloud / Vertex AI

```bash
export GOOGLE_CLOUD_PROJECT="your-project-id"
gcloud auth application-default login
make scan
```

### Option 3: Without API access (scan only, no AI suggestions)

```bash
make scan-no-ai
```

### Scanning Code Repos

Include your project directories to scan their `.gemini/` and `.claude/` configs:

```bash
# Single repo
make scan REPOS="~/Code/my-project"

# Multiple repos
make scan REPOS="~/Code/project-a ~/Code/project-b ~/Code/platform"

# All repos under a directory (shell expansion)
make scan REPOS="$(ls -d ~/Code/*/)"
```

This extracts project-level MCP servers, skills, agents, and context files — giving visibility into how each codebase is configured for AI tooling.

## What Gets Scanned

| Source | What's Extracted |
|:---|:---|
| `~/.gemini/settings.json` | MCP servers, model config, experimental flags, auth type |
| `~/.gemini/skills/` | All installed skills with descriptions |
| `~/.gemini/agents/` | Custom agent definitions |
| `~/.gemini/extensions/` | Extension catalog with enable/disable status |
| `~/.gemini/policies/` | Policy TOML configurations |
| `~/.gemini/GEMINI.md` | Global context file |
| `~/.gemini/tmp/*/chats/*.jsonl` | **Conversation intelligence**: tool frequency, models, thought topics, user prompts, token consumption |
| `~/.claude/skills/` | Claude Code skill catalog |
| `~/.claude/CLAUDE.md` | Claude context files |
| Project `GEMINI.md` files | Per-project context discovered via project roots |
| **`--repos` paths** | Project-level `.gemini/settings.json`, skills, agents, `GEMINI.md`, `.claude/` configs |

## Output

After running, check `scan-results/`:

- **`gemini-env-manifest.json`** — Full structured data (for aggregation across team members)
- **`gemini-env-report.md`** — Human-readable summary with sophistication score, top tools, suggested skills, and repo configs

**Review the report before sharing.** While credentials are auto-redacted, your conversation prompts and topics are included to enable pattern detection.

## CLI Options

```
python scanner.py [OPTIONS]

--version             Show version and exit
--gemini-dir PATH     Path to .gemini dir (default: ~/.gemini)
--home-dir PATH       Home directory for Claude scanning (default: ~)
--output-dir PATH     Output directory (default: ./scan-results)
--repos PATH [PATH...]  Code repo paths to scan for project-level configs
--skip-suggestions    Skip AI skill suggestion (no API key needed)
--json-only           Output JSON only, no markdown report
--skip-update-check   Don't check GitHub for newer versions
```

## Privacy & Redaction

The scanner automatically redacts:
- Google API keys (`AIza...`)
- OAuth tokens (`ya29...`)
- OpenAI keys (`sk-...`)
- GitHub PATs (`ghp_...`)
- Any value in fields named `token`, `secret`, `password`, `api_key`, etc.

**What it does NOT redact:** user prompts, thought topics, project names. Review the output and remove anything sensitive before sharing.

**What it does NOT touch:** Shell history (`.zsh_history`, `.bash_history`), browser data, or any files outside `~/.gemini/`, `~/.claude/`, and specified `--repos` paths.

## Suggested Skills

When run with API access, the scanner analyzes your conversation history and suggests 3-5 new skills based on repeating patterns. For example:

> **Detected pattern:** You ran `kubectl describe pod` → `kubectl logs` → `gcloud container clusters describe` 12 times across 4 sessions.
>
> **Suggested skill:** `gke-pod-debugger` — A skill that automates the pod→logs→cluster diagnosis loop for GKE workloads.

Each suggestion includes a ready-to-use `SKILL.md` template you can drop into `~/.gemini/skills/`.

## Versioning & Updates

The scanner checks GitHub for newer versions on each run. If an update is available:

```
📦 Update available: v2.2.0 → v2.3.0
   Added: multi-repo batch scanning mode
   Run: cd /path/to/gemini-cli-scanner && git pull
```

Use `--skip-update-check` for offline or CI environments.

## Makefile Targets

```
make help           Show all targets
make setup          Install dependencies into venv
make scan           Full scan with AI skill suggestions
make scan-no-ai     Scan without Gemini API (no key needed)
make scan-repos     Scan with repo paths (set REPOS="path1 path2")
make version        Show scanner version
make clean          Remove scan results and venv
```

## For Teams

Run the scanner across 6-7 team members, collect the JSON manifests, and look for:
- **Shared patterns** — tools/models everyone uses → standardize
- **Unique gems** — skills only one person has → propagate
- **Gaps** — capabilities nobody uses → opportunity for enablement
- **Suggested skills overlap** — if multiple people get the same suggestion, it's a strong signal
- **Repo config divergence** — different MCP servers or skills across repos → align

## License

Apache 2.0
