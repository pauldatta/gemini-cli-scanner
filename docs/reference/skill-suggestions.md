# AI Skill Suggestions

The scanner identifies repeating patterns in your conversation history and generates production-grade SKILL.md files using a cost-efficient two-stage pipeline.

## Pipeline

![Skill Suggestion Pipeline](/images/skill-pipeline.png)

## Evidence Gating

Before calling any API, the scanner evaluates whether conversation history has enough signal for quality suggestions:

| Check | Threshold | If Fails |
|:---|:---|:---|
| Prompt count | ≥10 prompts | Skip API calls entirely |
| Pattern strength | ≥3 occurrences per cluster | Report as "emerging patterns" only |
| Cross-project | ≥2 distinct projects | Report as "emerging patterns" only |
| Tool chain patterns | ≥3 matching chains across ≥2 projects | Contributes to pass threshold |

When evidence is weak, the report includes an "Emerging Patterns" section instead of full skill suggestions — no API tokens wasted.

## Pre-Clustering Algorithm

1. Normalize prompts (lowercase, strip paths/URLs/hashes)
2. Extract 3-word leading phrase as cluster key
3. Group by key, record count + first 3 examples
4. Sort by count, keep top 20
5. Aggregate tool chain fingerprints (first 3 tools in each session)

Only clusters and chain patterns are sent to the API — not raw prompt history.

## Model Fallback Chain

| Stage | Primary | Fallback 1 | Fallback 2 |
|:---|:---|:---|:---|
| Identify | `gemini-3.1-flash-lite-preview` | `gemini-3-flash-preview` | — |
| Write | `gemini-3.1-pro-preview` | `gemini-3-pro-preview` | `gemini-3-flash-preview` |

If all models fail for a candidate, the scanner returns a stub template with key tools listed.

## Prerequisites

```bash
# Option A: Vertex AI (uses gcloud auth ADC)
export GOOGLE_CLOUD_PROJECT="your-project"

# Option B: API key
export GOOGLE_API_KEY="your-key"
```

Without either variable, the scanner runs but skips skill suggestions.

## Quality Standards

Generated skills follow [Agent Skills specification](https://agentskills.io/skill-creation/best-practices):

- Procedures over declarations
- Defaults over menus
- Exact tool calls with concrete parameters
- Gotchas sections from environment-specific traps
- Validation loops after every multi-step workflow
- Progressive disclosure (SKILL.md focused, deep detail in `references/`)
