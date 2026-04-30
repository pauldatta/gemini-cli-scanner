# Advisory Engine & Maturity Model

The scanner evaluates your environment against **8 categories** of Gemini CLI best practices and produces a maturity score (0–115 points). Each recommendation links directly to official documentation.

## Advisory Categories

| Category | What's Evaluated | Max Points |
|:---|:---|---:|
| **Policy Hygiene** | Policy files present, deny rules for destructive commands, no deprecated `tools.exclude` | 15 |
| **MCP Governance** | Server allowlists, governance policies per MCP server | 15 |
| **GEMINI.md Quality** | Global context file exists, length, structured sections | 15 |
| **Skills Optimization** | Skill count, diversity across workflows | 15 |
| **Settings Hardening** | Model pinning, experimental flags, sandbox config | 15 |
| **Hooks** | Pre/post hooks for tool calls, automation maturity | 10 |
| **Extensions** | Extension count, catalog diversity | 15 |
| **Context Architecture** | `.geminiignore`, repo-level configs, context layering | 15 |

## Maturity Tiers

| Tier | Score Range | Description |
|:---|:---|:---|
| 🌱 Getting Started | 0–29 | Basic installation, minimal configuration |
| 🔧 Intermediate | 30–59 | Active usage with some governance in place |
| ⚡ Advanced | 60–89 | Strong policy hygiene, skills, and MCP governance |
| 🏆 Expert | 90–115 | Full-stack configuration with hooks, extensions, and context architecture |

## Scoring Details

Points are awarded per-category based on the presence and quality of configuration artifacts. The advisory engine runs these checks:

### Policy Hygiene (15 pts)
- Policy files exist in `~/.gemini/policies/` (+5)
- At least one deny rule for destructive commands like `rm -rf` (+5)
- No deprecated `tools.exclude` in settings.json (+5)

### MCP Governance (15 pts)
- MCP servers are configured (+5)
- Governance policies exist for MCP servers (allowlists, `ask_user` rules) (+10)

### GEMINI.md Quality (15 pts)
- Global `~/.gemini/GEMINI.md` exists (+5)
- Content length ≥ 500 characters (+5)
- Structured sections (headings, lists) (+5)

### Skills Optimization (15 pts)
- At least 1 skill installed (+5)
- 3+ skills across different workflows (+5)
- Skills use procedures over declarations (+5)

### Settings Hardening (15 pts)
- Model explicitly pinned (+5)
- Experimental flags configured (+5)
- Sandbox or safety settings present (+5)

### Hooks (10 pts)
- Hook configuration present (+5)
- Pre/post hooks for tool calls (+5)

### Extensions (15 pts)
- At least 1 extension installed (+5)
- 3+ extensions for diverse capabilities (+5)
- Extensions enabled and active (+5)

### Context Architecture (15 pts)
- `.geminiignore` present in repos (+5)
- Repo-level `.gemini/` configs detected (+5)
- Context layering (global + project-level) (+5)

## Viewing Results

### In the TUI

Select **Maturity Dashboard** to see:
- Your tier and total score with a visual progress bar
- Per-category score breakdown
- Quick environment stats (skills, MCP servers, extensions, repos)
- All advisory recommendations with severity (`warning` / `info`) and doc links

Navigate with `↑`/`↓`/`j`/`k`, page with `PgUp`/`PgDn`/`f`/`b`, press `Esc` to return to the main menu.

### In the Report

Recommendations are included in the markdown report under the **Advisory Recommendations** section. Use the `t` key in the report viewer to jump directly to this section via the dynamic Table of Contents.

### In the JSON Manifest

The `gemini-env-manifest.json` includes a `maturity` object with:
```json
{
  "maturity": {
    "score": 72,
    "tier": "Advanced",
    "breakdown": {
      "policy_hygiene": { "score": 10, "max": 15 },
      "mcp_governance": { "score": 15, "max": 15 },
      ...
    },
    "recommendations": [
      {
        "category": "policy_hygiene",
        "severity": "warning",
        "title": "No deny rule for destructive commands",
        "detail": "Consider adding a policy rule to deny rm -rf...",
        "doc_ref": "reference/policy-engine.md"
      }
    ]
  }
}
```
