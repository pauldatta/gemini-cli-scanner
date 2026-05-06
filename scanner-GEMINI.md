# Gemini CLI Scanner Extension (v3.5.6)

Provides the `env-scanner` skill for auditing Gemini CLI, Claude Code, Antigravity, Continue, Windsurf, JetBrains AI, and OpenCode environments.

## Capabilities

- Catalog MCP servers, skills, extensions, agents, policies, and context files
- Audit 4-tier memory hierarchy (global, extension, project, private)
- Detect skill extraction agent activity (auto-created skills, inbox, stale locks)
- Analyze conversation history for tool usage patterns and behavioral tool chains
- Suggest reusable skills with evidence-based gating (cost-efficient API usage)
- Audit v0.40+ policy engine (modes, mcpName, denyMessage, interactive, commandRegex)
- Silently check system-level admin policies
- Score environment maturity (0–67) across 11 advisory categories
- Scan project-level configs from code repos via `--repos`

## Activation Triggers

- "Scan my environment" / "audit my tools" / "analyze my setup"
- "What skills do I have?" / "show my MCP servers"
- "Suggest skills based on my workflow"
- "Check my memory setup" / "audit my policies"
- "Scan my repos for AI configs"

## Requirements

- Node.js (ships with Gemini CLI)
- For AI skill suggestions: `GOOGLE_API_KEY` or `GOOGLE_CLOUD_PROJECT` with ADC

## Privacy

Privacy-by-default (v3.5.6+). Output manifest contains only aggregate counts — no raw prompts, topics, or project names. Use `--include-prompts` to include raw data for local analysis. Credentials auto-redacted. Markdown report retains full detail as a local artifact.
