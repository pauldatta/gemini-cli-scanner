# gemini-cli-scanner

Discover patterns in your Gemini CLI and Claude Code environments. Extract tribal knowledge from how you *actually* use AI coding tools and surface it as reusable skills, agents, and best practices.

## What This Does

This scanner reads your `~/.gemini/` and `~/.claude/` directories to:

1. **Catalog** your MCP servers, skills, extensions, agents, and context files
2. **Analyze** your conversation history — what tools you use most, what topics you work on, what models you rely on
3. **Suggest new skills** by feeding your usage patterns to Gemini and identifying repeating workflows that should be automated
4. **Score** your environment sophistication (0-100) so you know what capabilities you're leaving on the table
5. **Produce** a shareable JSON manifest + markdown report (credentials auto-redacted)

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

## Output

After running, check `scan-results/`:

- **`gemini-env-manifest.json`** — Full structured data (for aggregation across team members)
- **`gemini-env-report.md`** — Human-readable summary with sophistication score, top tools, suggested skills

**Review the report before sharing.** While credentials are auto-redacted, your conversation prompts and topics are included to enable pattern detection.

## Privacy & Redaction

The scanner automatically redacts:
- Google API keys (`AIza...`)
- OAuth tokens (`ya29...`)
- OpenAI keys (`sk-...`)
- GitHub PATs (`ghp_...`)
- Any value in fields named `token`, `secret`, `password`, `api_key`, etc.

**What it does NOT redact:** user prompts, thought topics, project names. Review the output and remove anything sensitive before sharing.

**What it does NOT touch:** Shell history (`.zsh_history`, `.bash_history`), browser data, or any files outside `~/.gemini/` and `~/.claude/`.

## Suggested Skills

When run with API access, the scanner analyzes your conversation history and suggests 3-5 new skills based on repeating patterns. For example:

> **Detected pattern:** You ran `kubectl describe pod` → `kubectl logs` → `gcloud container clusters describe` 12 times across 4 sessions.
>
> **Suggested skill:** `gke-pod-debugger` — A skill that automates the pod→logs→cluster diagnosis loop for GKE workloads.

Each suggestion includes a ready-to-use `SKILL.md` template you can drop into `~/.gemini/skills/`.

## Makefile Targets

```
make help         Show all targets
make setup        Install dependencies into venv
make scan         Full scan with AI skill suggestions
make scan-no-ai   Scan without Gemini API (no key needed)
make clean        Remove scan results and venv
```

## For Teams

Run the scanner across 6-7 team members, collect the JSON manifests, and look for:
- **Shared patterns** — tools/models everyone uses → standardize
- **Unique gems** — skills only one person has → propagate
- **Gaps** — capabilities nobody uses → opportunity for enablement
- **Suggested skills overlap** — if multiple people get the same suggestion, it's a strong signal

## License

Apache 2.0
