# For Teams

Run the scanner across team members, collect the JSON manifests, and use them to drive standardization and enablement.

## Collection

Have each team member run:

```bash
npx gemini-cli-scanner --repos ~/Code --skip-suggestions
```

Collect the `scan-results/gemini-env-manifest.json` from each person.

## What to Look For

| Signal | What It Means | Action |
|:---|:---|:---|
| **Shared patterns** | Tools/models everyone uses | Standardize and document |
| **Unique gems** | Skills only one person has | Propagate to the team |
| **Gaps** | Capabilities nobody uses | Opportunity for enablement |
| **Suggested skills overlap** | Multiple people get the same suggestion | Strong signal — build it |
| **Repo config divergence** | Different MCP servers or skills across repos | Align configurations |

## Maturity Benchmarking

Compare maturity scores across team members to identify:
- Who has the most hardened environment (learn from them)
- Common advisory warnings (fix once, propagate everywhere)
- Category-level gaps (e.g., nobody has hooks → team workshop)

## Enterprise Patterns

For organizations deploying Gemini CLI at scale:

- **Admin policies** — use the [Policy Engine](https://geminicli.com/docs/reference/policy-engine/) to enforce deny rules at the system level
- **Shared skills repos** — maintain a team skills repository that members install as extensions
- **Golden configs** — create a baseline `settings.json` + `GEMINI.md` template for new team members
- **Maturity targets** — set team-wide targets (e.g., "everyone at Intermediate by end of quarter")

## CLI Detection & Mixed Environments

The dashboard includes a **CLI Detection** section showing which AI coding tools each team member has installed (Gemini CLI, Claude Code, Antigravity Desktop, Antigravity CLI, Antigravity IDE, Continue, Windsurf, JetBrains AI, OpenCode). Click any tool's adoption count to see exactly which reporters have it.

Engineers **without Gemini CLI installed** can still run the scanner — it skips Gemini-specific sub-scans and reports on their other tools and repository configurations. This is useful for:

- **Pre-rollout inventory** — understand which tools your team already uses before standardizing on Gemini CLI
- **Migration tracking** — monitor adoption as engineers onboard
- **Multi-tool teams** — teams using Claude Code + Gemini CLI can compare environment maturity across both
