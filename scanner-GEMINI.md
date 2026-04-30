# Gemini CLI Scanner Extension

This extension provides the `env-scanner` skill for discovering patterns in your Gemini CLI and Claude Code environments.

## What it does

Scans `~/.gemini/`, `~/.claude/`, and optionally your code repos to:
- Catalog MCP servers, skills, extensions, agents, policies, and context files
- Analyze conversation history for tool usage patterns, model preferences, and recurring topics
- Suggest new reusable skills based on detected repeating workflows
- Score your environment sophistication (0-105)
- Scan project-level `.gemini/` and `.claude/` configs from code repos

## Usage

Ask Gemini to scan your environment:
- "Scan my Gemini CLI environment"
- "What skills do I have installed?"
- "Analyze my AI tool usage patterns"
- "Suggest new skills based on my workflow"
- "Scan my Code repos for AI tool configs"

The scanner runs locally, auto-redacts credentials, and produces a JSON manifest + markdown report.

## Requirements

- Node.js (already installed with Gemini CLI)
- For AI skill suggestions: `GOOGLE_API_KEY` env var or `GOOGLE_CLOUD_PROJECT` with `gcloud auth application-default login`

## Privacy

Credentials are auto-redacted. User prompts and topics are included for pattern detection — review the report before sharing externally.
