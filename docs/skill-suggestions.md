# AI Skill Suggestions

The scanner includes a two-stage AI pipeline that identifies patterns in your conversation history and generates production-grade reusable skills.

## Pipeline Architecture

| Stage | Model | Purpose | Tokens |
|:---|:---|:---|---:|
| **1. Identify** | `gemini-3.1-flash-lite-preview` | Pattern extraction, candidate selection | ~2K |
| **2. Write** | `gemini-3.1-pro-preview` | Full SKILL.md generation (parallel) | ~4K each |

Stage 2 fires all skill writes in parallel with a progress bar. Each stage has fallback models if the primary isn't available in your region.

## Prerequisites

Set one of these environment variables:

```bash
# Option A: Vertex AI (uses gcloud auth ADC)
export GOOGLE_CLOUD_PROJECT="your-project"

# Option B: API key
export GOOGLE_API_KEY="your-key"
```

Without either variable, the scanner still runs — it just skips the AI suggestion step.

## Skill Quality Standards

Generated skills follow the [Agent Skills specification](https://agentskills.io/skill-creation/best-practices):

- **Procedures over declarations** — reusable methods, not specific answers
- **Defaults over menus** — one clear approach with escape hatches
- **Exact tool calls** — concrete tool names, parameters, and commands from your environment
- **Gotchas sections** — environment-specific traps derived from your usage patterns
- **Validation loops** — verification steps after every multi-step workflow
- **Progressive disclosure** — focused SKILL.md with deep detail in `references/`

## How Patterns Are Identified

The scanner pre-clusters your prompts locally into workflow patterns before sending anything to the API:

1. **Local clustering** — prompts are grouped by topic similarity using keyword extraction
2. **Frequency analysis** — clusters are ranked by how often they appear in your history
3. **Tool correlation** — each cluster is annotated with which tools were invoked
4. **Gap detection** — clusters without existing skills are flagged as candidates
5. **AI generation** — top candidates are sent to the pipeline for SKILL.md generation

This keeps context windows efficient and grounds suggestions in real frequency data.

📖 **[Detailed methodology →](skill-identification.md)**
