---
name: env-scanner
description: Scan Gemini CLI and Claude Code environments to discover patterns, catalog configurations, and suggest reusable skills. Use when the user wants to analyze their AI tool setup, discover usage patterns, audit their environment, or generate a report of their skills/extensions/MCP servers.
---

# Environment Scanner Skill

This skill runs the `gemini-cli-scanner` to analyze the user's `~/.gemini/` and `~/.claude/` directories and optionally their code repos.

## When to activate
- User asks to "scan my environment" or "analyze my setup"
- User wants to know what skills, MCP servers, or extensions they have installed
- User wants to discover usage patterns from their conversation history
- User wants a sophistication score or environment report
- User mentions "tribal knowledge", "pattern discovery", or "skill suggestions"

## Running the Scanner

The scanner lives in the extension directory. Run it with:

```bash
# Full scan with AI skill suggestions (requires GOOGLE_API_KEY or GOOGLE_CLOUD_PROJECT)
node ${extensionPath}/scanner.js --output-dir ./scan-results

# Scan without AI suggestions
node ${extensionPath}/scanner.js --output-dir ./scan-results --skip-suggestions

# Include code repos
node ${extensionPath}/scanner.js --output-dir ./scan-results --repos ~/Code/project-a ~/Code/project-b
```

## Output Files
- `scan-results/gemini-env-manifest.json` — Full structured data
- `scan-results/gemini-env-report.md` — Human-readable markdown report

## Reading the Report

After running, read `scan-results/gemini-env-report.md` and present the key findings to the user:

1. **Sophistication Score** — How fully they use the platform (0-105)
2. **MCP Servers** — What integrations are configured
3. **Skills & Extensions** — What's installed (Gemini + Claude)
4. **Conversation Intelligence** — Top tools, models, token usage, session volume
5. **Suggested Skills** — AI-generated suggestions based on repeating patterns
6. **Code Repos** — Project-level configs if `--repos` was used

## Important Notes
- The scanner auto-redacts credentials (API keys, tokens, PATs)
- User prompts and topics are included for pattern detection — remind the user to review before sharing
- The scanner checks GitHub for updates automatically
- Use `--skip-update-check` in offline environments
