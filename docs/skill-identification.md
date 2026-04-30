# Skill Identification Methodology

How the scanner transforms raw conversation history into production-grade agent skills.

## Overview

The scanner uses a **three-layer pipeline** that progressively narrows thousands of raw interactions down to 3-5 actionable, production-ready SKILL.md files. Each layer is designed for a specific job:

| Layer | Where | Purpose |
|:---|:---|:---|
| **1. Pre-Clustering** | Local (Node.js) | Collapse raw prompts into frequency-ranked patterns |
| **2. Candidate Identification** | `gemini-3.1-flash-lite` | Select 3-5 skill candidates from patterns |
| **3. Skill Writing** | `gemini-3.1-pro` (parallel) | Write full SKILL.md per candidate |

```
Raw Prompts (423+)          Tool Usage (3,943+ calls)
       │                            │
       ▼                            ▼
┌──────────────────────────────────────────┐
│  Layer 1: Local Pre-Clustering           │
│  • Normalize (lowercase, strip paths)    │
│  • Group by 3-word leading phrases       │
│  • Sort by frequency, keep top 20        │
└──────────────┬───────────────────────────┘
               │ ~20 pattern clusters
               ▼
┌──────────────────────────────────────────┐
│  Layer 2: Candidate Identification       │
│  Model: flash-lite (temp 0.3, 2K tok)    │
│  Input: clusters + tools + existing      │
│  Output: 3-5 candidates with rationale   │
└──────────────┬───────────────────────────┘
               │ 3-5 structured candidates
               ▼
┌──────────────────────────────────────────┐
│  Layer 3: Parallel Skill Writing         │
│  Model: pro (temp 0.4, 4K tok each)     │
│  Input: 1 candidate + exemplar + rules   │
│  Output: complete SKILL.md              │
│  All candidates written concurrently     │
└──────────────────────────────────────────┘
```

## Layer 1: Local Pre-Clustering

Before any API call, the scanner processes all available prompts locally. This serves two purposes: it keeps the context window small, and it ensures no raw user prompts leave the machine unnecessarily.

### Data Sources

| Source | File Format | What's Extracted |
|:---|:---|:---|
| Gemini CLI conversations | `~/.gemini/tmp/*/chats/*.jsonl` | User prompts, tool calls, model names, token counts |
| Antigravity brain logs | `~/.gemini/antigravity/brain/*/overview.txt` | User prompts, tool calls, artifact types, timespans |

### Clustering Algorithm

```
aggregatePromptPatterns(prompts):
  1. Normalize each prompt:
     - Lowercase
     - Strip file paths (/foo/bar/baz.js → "")
     - Strip URLs
     - Strip hex hashes (commit SHAs, etc.)
     - Collapse whitespace
  2. Extract 3-word leading phrase as cluster key
     - "fix the failing test in auth" → "fix the failing"
     - "scan my environment" → "scan my environment"
  3. Group prompts by cluster key
  4. For each cluster, record:
     - count: number of prompts in this cluster
     - examples: first 3 raw prompts (for the model to see real language)
  5. Sort by count descending, keep top 20
```

This reduces ~423 prompts to ~20 clusters. Only the clusters (with 3 example prompts each) are sent to the API — not the full prompt history.

### Example Output

```json
[
  { "count": 12, "examples": ["run the tests", "run tests and fix failures", "run the test suite"] },
  { "count": 8,  "examples": ["scan my environment", "scan the repo", "scan my gemini setup"] },
  { "count": 5,  "examples": ["deploy to cloud run", "deploy the service", "deploy with new config"] }
]
```

## Layer 2: Candidate Identification

A cheap, fast flash-lite call identifies which clusters are worth turning into skills.

### What Flash-Lite Receives

The identifier prompt is assembled from:

1. **Pre-clustered patterns** — the 20 clusters from Layer 1
2. **Tool usage frequency** — merged across Gemini CLI and Antigravity (e.g., `run_command: 1107, view_file: 1030, grep_search: 335`)
3. **Existing skills** — both Gemini and Claude, so it doesn't suggest duplicates
4. **Available MCP servers** — so it references real, accessible tool names
5. **Repo configs** — project-level context (languages, frameworks, custom settings)

### What Flash-Lite Returns

For each candidate:

```json
{
  "name": "cloud-run-deployer",
  "description": "Deploys services to Cloud Run with health check validation",
  "rationale": "Addresses deploy pattern cluster (count: 5) and mcp_cloud-run tool usage (3 calls)",
  "key_tools": ["run_command", "mcp_cloud-run_deploy_service", "mcp_cloud-run_get_service_log"],
  "example_prompts": ["deploy to cloud run", "deploy the service with new config"]
}
```

### Why Flash-Lite

This is a **classification task**, not a writing task. Flash-lite excels here because:
- It only needs to pick 3-5 items from a structured list
- Low temperature (0.3) keeps selections consistent
- Small token budget (2K) keeps cost negligible
- Speed matters — this gates the parallel writer stage

### Selection Criteria

The prompt instructs flash-lite to:
- Only select patterns with `frequency >= 2` (no one-off tasks)
- Prioritize highest-frequency patterns
- Never duplicate existing skills
- Include exact tool names from the usage data

## Layer 3: Parallel Skill Writing

Each candidate gets its own dedicated pro model call, fired concurrently via `Promise.all`. This gives three advantages:

1. **Better quality** — each pro call has focused context (one skill, not five)
2. **Faster wall-clock time** — 4 skills in parallel complete in the time of 1
3. **Graceful degradation** — if one skill fails, the others still complete

### What Pro Receives

Each writer call gets:
- The single candidate (name, description, key_tools, example_prompts)
- The [agentskills.io](https://agentskills.io/skill-creation/best-practices) design principles
- A high-quality exemplar SKILL.md (email-triage)
- The list of available MCP servers

### Quality Requirements

Every generated SKILL.md must include:

| Section | Purpose |
|:---|:---|
| **YAML frontmatter** | `name` + `description` optimized for agent activation triggers |
| **Procedural steps** | Exact tool names, parameters, and commands — not vague instructions |
| **Gotchas** | Environment-specific traps derived from the user's actual patterns |
| **Validation** | Verification commands to confirm the skill executed correctly |
| **Best Practices** | Safety rails, batching tips, and edge case handling |

These requirements are enforced by the [Agent Skills specification](https://agentskills.io/skill-creation/best-practices), which the prompt embeds as design principles:

1. **Add what the agent lacks, omit what it knows.** Don't explain what Git is. Jump to project-specific procedures.
2. **Favor procedures over declarations.** Write reusable methods, not specific answers.
3. **Provide defaults, not menus.** One clear approach with an escape hatch.
4. **Match specificity to fragility.** Be exact on brittle operations, flexible on resilient ones.
5. **Include validation loops.** Every multi-step skill needs a verify step.
6. **Use progressive disclosure.** Keep SKILL.md focused. Deep detail goes in `references/`.

### Progress Tracking

Stage 2 displays a progress bar that updates as each parallel write completes:

```
  ✏️  Writing [████████████████░░░░░░░░░░░░░░] 2/4 (50%)
```

### Fallback Chain

Each stage has model fallbacks in case the primary model isn't available in your region:

| Stage | Primary | Fallback 1 | Fallback 2 |
|:---|:---|:---|:---|
| Identify | `gemini-3.1-flash-lite-preview` | `gemini-3-flash-preview` | — |
| Write | `gemini-3.1-pro-preview` | `gemini-3-pro-preview` | `gemini-3-flash-preview` |

If all writer models fail for a candidate, the scanner returns a stub template with the key tools listed, so you still get actionable guidance even in degraded mode.
