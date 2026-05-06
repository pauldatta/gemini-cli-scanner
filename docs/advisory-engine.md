# Advisory Engine & Maturity Model

Evaluates your environment against **11 categories** producing a maturity score (0–67 points).

## Categories

| Category | What's Evaluated | Max Points |
|:---|:---|---:|
| **Policy Hygiene** | Policy files, deny rules, deprecated fields, v0.40+ mode coverage, YOLO safeguards, MCP governance, denyMessage, headless rules | 15 |
| **MCP Governance** | Server allowlists, per-server governance policies | 15 |
| **GEMINI.md Quality** | Global context file exists, length, structured sections | 15 |
| **Skills Optimization** | Skill count, diversity, extraction state health | 15 |
| **Settings Hardening** | Model pinning, experimental flags, sandbox config | 15 |
| **Hooks** | Pre/post hooks for tool calls | 10 |
| **Extensions** | Extension count, catalog diversity | 15 |
| **Context Architecture** | `.geminiignore`, repo-level configs, context layering | 15 |
| **Memory Architecture** | 4-tier memory hierarchy coverage, bloat, cross-duplication, autoMemory | — |
| **Skill Extraction** | Inbox backlog, extraction activity, stale locks, pending patches | — |
| **Admin Policies** | System-level policy accessibility | — |

Memory, Extraction, and Admin categories produce advisory recommendations but don't contribute to the numeric score.

## Maturity Tiers

| Tier | Score | Description |
|:---|:---|:---|
| 🌱 Getting Started | 0–33 | Basic installation |
| 🔧 Intermediate | 34–46 | Active usage, some governance |
| ⚡ Advanced | 47–60 | Strong policies, skills, MCP governance |
| 🏆 Expert | 61–67 | Full-stack with hooks, extensions, context architecture |

## v3.5 Advisory Checks

### Policy Hygiene (v0.40+)

| Check | Severity | Trigger |
|:---|:---|:---|
| No approval mode coverage | warning | Rules exist but none specify `modes` |
| YOLO without safeguards | **critical** | YOLO mode rules found with no deny rules |
| Plan mode unprotected | warning | No rules scoped to plan mode |
| Ungoverned MCP servers | warning | MCP servers in settings with no policy rules scoping `mcpName` |
| Missing denyMessage | info | Deny rules without custom explanation text |
| No headless-mode rules | info | No rules use `interactive = false` |
| commandRegex usage | info | Regex patterns in rules (brittleness warning) |
| Admin policies inaccessible | info | System policy dirs exist but can't be read |

### Memory Architecture

| Check | Severity | Trigger |
|:---|:---|:---|
| No global memory | warning | `~/.gemini/GEMINI.md` missing |
| Memory bloat | warning | Any MEMORY.md > 5,000 words |
| Unused tier | info | Only 1 of 4 tiers in use |
| Cross-tier duplication | info | Same bullet in global and project memory |
| autoMemory disabled | info | `settings.json` has `autoMemory: false` or absent |
| Single-tier usage | info | Only using Tier 1 (global) with no project memory |

### Skill Extraction

| Check | Severity | Trigger |
|:---|:---|:---|
| Inbox backlog | warning | ≥3 skills awaiting approval |
| Extraction inactive | info | Last run > 14 days ago |
| Never run | info | No extraction-state.json found |
| Stale lock | warning | `.extraction.lock` > 30 minutes old |
| Pending patches | info | Patch files awaiting application |

## Output Formats

- **TUI**: Maturity Dashboard (scores, breakdown, recommendations)
- **Report**: Advisory Recommendations section in markdown
- **JSON**: `maturity` object in `gemini-env-manifest.json` with `score`, `tier`, `breakdown`, `recommendations`
