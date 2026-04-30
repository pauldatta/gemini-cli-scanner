# What Gets Scanned

The scanner reads your local AI tool configuration directories — never modifying any files — to build a complete picture of your environment.

## Source Reference

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

## Recursive Repo Discovery

When you pass a parent directory like `~/Code` to `--repos`, the scanner walks up to 3 levels deep (configurable via `--repo-depth`) looking for directories containing `.git/`. It automatically skips noise directories:

`node_modules`, `.git`, `vendor`, `__pycache__`, `dist`, `build`, `.next`, `.venv`, `venv`, `.cache`, `.npm`, `.yarn`, `coverage`, `.terraform`

Each discovered repo is logged during scanning so you can see exactly what's being processed.

## AI Tool Ecosystem Detection

The scanner detects and reports on multiple AI coding tools:

- **Gemini CLI** — full config, skills, agents, extensions, policies, conversations
- **Claude Code** — skills, CLAUDE.md, project configs
- **Antigravity** — brain conversations, knowledge items, MCP servers
- **Continue** — skills (symlink-aware)
- **Windsurf** — skills (symlink-aware)
- **JetBrains AI** — rules and presence detection

Cross-tool skill overlap analysis highlights where the same workflow is covered by multiple tools, helping you consolidate and standardize.
