# What Gets Scanned

The scanner reads your local AI tool configuration directories — never modifying any files — to build a complete picture of your environment.

## Architecture

![Scanner Pipeline](images/scanner-pipeline.png)

## Source Reference

| Source | What's Extracted |
|:---|:---|
| `~/.gemini/settings.json` | MCP servers, model config, experimental flags, auth type, autoMemory |
| `~/.gemini/skills/` | All installed skills with descriptions |
| `~/.gemini/agents/` | Custom agent definitions |
| `~/.gemini/extensions/` | Extension catalog with enable/disable status |
| `~/.gemini/policies/` | Policy TOML configurations (v0.40+ fields: modes, mcpName, denyMessage, interactive, commandRegex, subagent, toolAnnotations) |
| `~/.gemini/GEMINI.md` | Global context file (Tier 1 memory) |
| `~/.gemini/tmp/*/chats/*.jsonl` | Conversation intelligence: tool frequency, models, topics, prompts, tokens, **tool call chains** |
| `~/.gemini/tmp/*/memory/` | **Private project memory (Tier 2)**: MEMORY.md, sibling files, word counts |
| `~/.gemini/tmp/*/memory/.extraction-state.json` | **Skill extraction state**: run history, skills created, sessions processed |
| `~/.gemini/tmp/*/memory/skills/` | **Inbox skills**: awaiting approval, pending patches |
| `/Library/Application Support/GeminiCli/policies/` | **Admin (system-level) policies** — silently skipped if inaccessible |
| `/etc/gemini-cli/policies/` | **Admin policies** (Linux) — silently skipped if inaccessible |
| `~/.claude/skills/` | Claude Code skill catalog |
| `~/.claude/CLAUDE.md` | Claude context files |
| `~/.gemini/antigravity/` | Antigravity: brain conversations, skills, MCP servers, knowledge items |
| `~/.continue/skills/` | Continue skills (symlink-aware) |
| `~/.codeium/windsurf/skills/` | Windsurf skills (symlink-aware) |
| `~/Library/.../JetBrains/Air/` | JetBrains AI rules and presence |
| `.opencode/` | OpenCode config (JSONC), agents, skills, commands, custom tools, plugins, themes, glossary |
| `AGENTS.md` | OpenCode project context file (analogous to `GEMINI.md`) |
| **`--repos` paths** | Project-level `.gemini/settings.json`, skills, agents, `GEMINI.md`, `.claude/` configs |

## Memory Architecture (4 Tiers)

The scanner maps and audits all four tiers of the Gemini CLI memory hierarchy:

| Tier | Scope | Location | What's Checked |
|:---|:---|:---|:---|
| **1. Global Personal** | All sessions | `~/.gemini/GEMINI.md` | Word count, sections, bullet facts |
| **2. Extension Context** | Extension-scoped | `~/.gemini/extensions/*/context/` | Presence detection |
| **3. Project Shared** | Project team | `<repo>/.gemini/GEMINI.md` | Via `--repos` scanning |
| **4. Private Project** | User per-project | `~/.gemini/tmp/<hash>/memory/` | MEMORY.md content, sibling files, bloat detection |

The advisory engine checks for:
- Missing tiers (e.g., no global memory configured)
- Memory bloat (>5,000 words in a single MEMORY.md)
- Cross-tier fact duplication (same bullet in global and private)
- autoMemory configuration status
- Under-utilized tier hierarchy

## Skill Extraction State

The scanner detects the CLI's background skill extraction agent activity:

- **Run history**: How many extraction runs, when was the last one, how many sessions processed
- **Skills created**: Which skills were auto-generated vs. user-created (origin tagging)
- **Inbox**: Skills awaiting user approval, pending patches for existing skills
- **Health**: Stale extraction locks (crashed runs >30 minutes old)

## Policy Engine Depth (v0.40+)

Policy scanning now covers all v0.40+ fields:

| Field | What It Does | Advisory Check |
|:---|:---|:---|
| `modes` | Scopes rules to default/plan/yolo | Warns if no mode-specific rules exist |
| `mcpName` | Scopes rules to specific MCP servers | Warns about ungoverned MCP servers |
| `denyMessage` | Custom message shown when rule blocks | Warns if deny rules lack explanations |
| `interactive` | Distinguishes headless vs. interactive | Info if no headless-mode rules exist |
| `commandRegex` | Regex-based command matching | Info about regex pattern brittleness |
| `subagent` | Scopes rules to specific sub-agents | Passed through for audit |
| `toolAnnotations` | Inline table metadata for tools | Parsed via upgraded TOML parser |

## Behavioral Pattern Detection

The scanner extracts **tool call chains** from each session (ordered sequences of tool calls) and aggregates them into behavioral fingerprints. These are used for:

- **Skill suggestion gating**: Repeating tool chain patterns (≥3 occurrences, ≥2 projects) provide evidence for reusable skill candidates
- **Workflow visualization**: The top 15 chain patterns are reported with their frequency counts
- **Cross-project analysis**: Chains spanning multiple projects indicate generalizable workflows

## Recursive Repo Discovery

When you pass a parent directory like `~/Code` to `--repos`, the scanner walks up to 3 levels deep (configurable via `--repo-depth`) looking for directories containing `.git/`. It automatically skips noise directories:

`node_modules`, `.git`, `vendor`, `__pycache__`, `dist`, `build`, `.next`, `.venv`, `venv`, `.cache`, `.npm`, `.yarn`, `coverage`, `.terraform`

Each discovered repo is logged during scanning so you can see exactly what's being processed.

## Partial Environments (v3.5.8+)

When `~/.gemini` is not found, the scanner automatically skips Gemini-specific sub-scans (settings, skills, agents, conversations, memory, policies) and continues with all other ecosystem and repository scans. The JSON manifest includes a `gemini_cli_installed: false` flag, and the markdown report displays a prominent installation banner.

Repository-level scans (`--repos`) still detect project-specific `.gemini/` configurations, `GEMINI.md`, and `CLAUDE.md` files regardless of whether the global CLI directory exists.

## AI Tool Ecosystem Detection

The scanner detects and reports on multiple AI coding tools:

- **Gemini CLI** — full config, skills, agents, extensions, policies, conversations, memory, extraction state *(skipped if `~/.gemini` missing)*
- **Claude Code** — skills, CLAUDE.md, project configs
- **Antigravity** — brain conversations, knowledge items, MCP servers
- **Continue** — skills (symlink-aware)
- **Windsurf** — skills (symlink-aware)
- **JetBrains AI** — rules and presence detection
- **OpenCode** — config (JSONC), agents, skills, commands, custom tools, plugins, themes, glossary, AGENTS.md

Cross-tool skill overlap analysis highlights where the same workflow is covered by multiple tools, helping you consolidate and standardize.
