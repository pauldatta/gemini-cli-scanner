---
layout: home

hero:
  name: gemini-cli-scanner
  text: AI Coding Environment Scanner
  tagline: Audit and discover patterns across your AI coding tool ecosystem. Now with Antigravity 2.0 support.
  actions:
    - theme: brand
      text: Quick Start
      link: /guide/quick-start
    - theme: alt
      text: What Gets Scanned
      link: /reference/scanning
    - theme: alt
      text: GitHub
      link: https://github.com/pauldatta/gemini-cli-scanner

features:
  - icon: 🔍
    title: Scan & Detect
    details: Scans a 9-tool ecosystem — Gemini CLI, Claude Code, Antigravity (Desktop, CLI, IDE), Continue, Windsurf, JetBrains AI, OpenCode. All processing is local. Output contains only aggregate statistics by default.
  - icon: 🔗
    title: Antigravity 2.0 Deep Scan
    details: Per-flavor brain intelligence across Desktop, CLI, and IDE. Parses transcript.jsonl for tool usage, user prompts, and artifacts. Extracts CLI plugins, settings, history, and Gemini CLI migration status.
  - icon: 🧠
    title: Memory & Policy Audit
    details: Maps your 4-tier memory hierarchy, audits v0.40+ policy rules (modes, mcpName, denyMessage), and detects skill extraction agent health.
  - icon: 🤖
    title: Evidence-Gated Suggestions
    details: A two-stage Gemini pipeline with cost-efficient evidence gating — only calls the API when behavioral patterns are strong enough.
  - icon: 📊
    title: Maturity Scoring
    details: Scores your environment 0–67 across 11 categories — policy hygiene, memory architecture, skill extraction, and more. Actionable, doc-linked recommendations.
  - icon: 🏢
    title: Team Dashboard
    details: Aggregate scan reports from your team into a leadership dashboard. Surface shared skills, MCP baselines, policy gaps, and assemble standardization toolkits.
---

## Install

```bash
npx gemini-cli-scanner
```

Or install as an agent skill:

```bash
npx skills add pauldatta/gemini-cli-scanner@scan -g -y
```

Or install as a Gemini CLI extension:

```bash
gemini extensions install https://github.com/pauldatta/gemini-cli-scanner
```

<video id="promo-video" controls autoplay loop muted playsinline style="width: 100%; border-radius: 12px; margin-top: 1.5rem; border: 1px solid var(--vp-c-border);"></video>

<script setup>
import { withBase } from 'vitepress'
import { onMounted } from 'vue'

onMounted(() => {
  const v = document.getElementById('promo-video')
  if (v) v.src = withBase('/promo.mp4')
})
</script>
