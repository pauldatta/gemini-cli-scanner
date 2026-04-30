# gemini-cli-scanner

Discover patterns in your Gemini CLI and Claude Code environments. Extract tribal knowledge from how you *actually* use AI coding tools and surface it as reusable skills, agents, and best practices.

<p align="center">
  <img src="images/tui-main-menu.png" alt="gemini-cli-scanner TUI" width="520">
</p>

## What This Does

1. **Catalogs** your MCP servers, skills, extensions, agents, policies, and context files
2. **Analyzes** conversation history — tools, models, topics, prompt patterns
3. **Scores maturity** (0–115) across [8 categories](advisory-engine.md) with actionable recommendations
4. **Discovers ecosystems** — Gemini CLI, Claude Code, Antigravity, Continue, Windsurf, JetBrains AI
5. **Suggests skills** using a [two-stage AI pipeline](skill-suggestions.md) grounded in your real usage data
6. **Produces** a shareable JSON manifest + markdown report (credentials auto-redacted)

## Get Started

```bash
npx gemini-cli-scanner
```

No install required. See [Quick Start](quick-start.md) for full setup details.

## Maturity Tiers

| Tier | Score | What It Means |
|:---|:---|:---|
| 🌱 Getting Started | 0–29 | Basic install, minimal config |
| 🔧 Intermediate | 30–59 | Active usage with some governance |
| ⚡ Advanced | 60–89 | Strong policies, skills, MCP governance |
| 🏆 Expert | 90–115 | Full-stack: hooks, extensions, context architecture |

📖 **[Full scoring breakdown →](advisory-engine.md)**
