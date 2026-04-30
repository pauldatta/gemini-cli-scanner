# Quick Start

## Run with npx

```bash
npx gemini-cli-scanner
```

No install required. Launches an interactive TUI:

| Menu Item | What It Does |
|:---|:---|
| **Quick Scan** | Environment scan, optional repo discovery — no API key needed |
| **Full Scan** | Everything + AI-powered skill suggestions from your conversation patterns |
| **View Report** | Scrollable markdown report with `t` for TOC section-jump navigation |
| **Maturity Dashboard** | Score breakdown (0–115), tier, advisory recommendations |
| **Auth Settings** | Credential switching with `export` hints for session persistence |

## Headless Mode

```bash
# Quick scan, no AI
npx gemini-cli-scanner --skip-suggestions

# Full scan with repos, last 30 days
npx gemini-cli-scanner --repos ~/Code --chat-days 30

# Deep repo discovery, JSON only
npx gemini-cli-scanner --repos ~/Code --repo-depth 4 --json-only
```

> Pass `--` before flags if npx intercepts them: `npx gemini-cli-scanner -- --skip-suggestions`

## Install as Extension

For `/scan` commands inside Gemini CLI:

```bash
gemini extensions install https://github.com/pauldatta/gemini-cli-scanner
```

Then use natural language or slash commands:
- *"Scan my environment"*
- `/scan` — full scan + read the report
- `/scan-repos ~/Code` — auto-discovers and scans repos

## Configure

Set one of these for AI-powered skill suggestions:

```bash
# Option A: Vertex AI (uses gcloud auth ADC)
export GOOGLE_CLOUD_PROJECT="your-project"

# Option B: API key
export GOOGLE_API_KEY="your-key"
```

Without either variable, the scanner still runs — it just skips skill suggestions.

📖 **[Skill suggestion pipeline details →](skill-suggestions.md)**

## CLI Options

```
npx gemini-cli-scanner [OPTIONS]

--version, -v         Show version and exit
--gemini-dir PATH     Path to .gemini dir (default: ~/.gemini)
--home-dir PATH       Home directory for Claude scanning (default: ~)
--output-dir PATH     Output directory (default: ./scan-results)
--repos PATH [PATH..] Code repo paths or parent directories to scan
--repo-depth N        Max depth for recursive repo discovery (default: 3)
--chat-days N         Only include conversation data from the last N days
--skip-suggestions    Skip AI skill suggestion (no API key needed)
--json-only           Output JSON only, no markdown report
--skip-update-check   Don't check GitHub for newer versions
```

## Output

After running, check `scan-results/`:

- **`gemini-env-manifest.json`** — Structured data for aggregation
- **`gemini-env-report.md`** — Human-readable report with scores, recommendations, and skills

## Privacy & Redaction

Auto-redacted: API keys (`AIza...`, `sk-...`), OAuth tokens (`ya29...`), GitHub PATs (`ghp_...`), and any field named `token`, `secret`, `password`, or `api_key`.

**Not redacted:** user prompts, topics, project names. Review output before sharing.

**Not touched:** Shell history, browser data, or files outside `~/.gemini/`, `~/.claude/`, and `--repos` paths.

## Developer Install

```bash
git clone https://github.com/pauldatta/gemini-cli-scanner.git
cd gemini-cli-scanner
make          # Interactive TUI
make test     # 155 tests across 9 test files
```
