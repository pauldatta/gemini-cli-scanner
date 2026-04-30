/** Gemini API skill suggestions — uses @google/genai for auth (ADC + API key) */
'use strict';
const { GoogleGenAI } = require('@google/genai');

function buildRepoContext(repos) {
  if (!repos || !repos.length) return 'No code repos scanned.';
  const lines = [];
  for (const r of repos.slice(0, 15)) {
    const parts = [`### ${r.name || 'unknown'}`];
    const gmd = r.gemini_md;
    if (gmd?.content_preview) parts.push(`GEMINI.md (${gmd.word_count} words): ${gmd.content_preview.slice(0, 300)}`);
    const gc = r.gemini_config || {};
    const mcp = gc.mcp_details;
    if (mcp && Object.keys(mcp).length) {
      const summary = {}; for (const [n, d] of Object.entries(mcp)) summary[n] = d.command;
      parts.push(`MCP servers: ${JSON.stringify(summary)}`);
    }
    const skills = gc.skills;
    if (skills?.length) parts.push(`Project skills: ${skills.map(s => `${s.name} - ${(s.description || '').slice(0, 80)}`).join(', ')}`);
    const agents = gc.agents;
    if (agents?.length && typeof agents[0] === 'object') parts.push(`Project agents: ${agents.map(a => `${a.name} (${a.model || ''})`).join(', ')}`);
    const ctx = gc.context_files;
    if (ctx) for (const cf of ctx.slice(0, 3)) { const pv = (cf.content_preview || '').slice(0, 200); if (pv) parts.push(`Context (${cf.path}): ${pv}`); }
    if (parts.length > 1) lines.push(parts.join('\n'));
  }
  return lines.length ? lines.join('\n\n') : 'No project-level configs found in scanned repos.';
}

/**
 * Pre-aggregate user prompts into workflow clusters before sending to the model.
 * Instead of sending 400 raw prompts (blowing context), we group by keyword
 * frequency and extract the top repeating patterns locally.
 */
function aggregatePromptPatterns(prompts) {
  if (!prompts || !prompts.length) return [];
  // Cluster by action keywords (lowercased first 5 words as rough fingerprint)
  const clusters = {};
  for (const p of prompts) {
    const text = (p.text || '').toLowerCase();
    // Extract action verbs and key nouns
    const fingerprint = text.split(/\s+/).slice(0, 6).join(' ').replace(/[^a-z0-9 ]/g, '');
    if (!clusters[fingerprint]) clusters[fingerprint] = { count: 0, examples: [], text: p.text };
    clusters[fingerprint].count++;
    if (clusters[fingerprint].examples.length < 3) clusters[fingerprint].examples.push(p.text.slice(0, 150));
  }
  // Return top patterns by frequency, minimum 2 occurrences to qualify as a "pattern"
  return Object.values(clusters)
    .filter(c => c.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 15)
    .map(c => ({ count: c.count, examples: c.examples }));
}




function extractJSON(text) {
  if (text.includes('```json')) text = text.split('```json')[1].split('```')[0];
  else if (text.includes('```')) text = text.split('```')[1].split('```')[0];
  return JSON.parse(text.trim());
}

// Stage 1: flash-lite identifies candidates (cheap, fast)
const IDENTIFIER_MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
];

// Stage 2: pro writes full skill content (heavy reasoning)
const WRITER_MODELS = [
  'gemini-3.1-pro-preview',
  'gemini-3-pro-preview',
  'gemini-3-flash-preview', // fallback if pro unavailable
];

function buildIdentifierPrompt(manifest) {
  const convos = manifest.conversations || {};
  const tools = convos.tool_usage_top_20 || {};
  const existingSkills = (manifest.skills || []).map(s => s.name || '');
  const claudeSkills = ((manifest.claude || {}).skills || []).map(s => s.name || '');

  // Merge Antigravity brain data
  const agBrain = manifest.antigravity?.brain_intelligence;
  const allPrompts = [...(convos.user_prompts || [])];
  const allTools = { ...tools };
  if (agBrain) {
    allPrompts.push(...(agBrain.user_prompts || []));
    for (const [name, count] of Object.entries(agBrain.tool_usage_top_20 || {})) {
      allTools[name] = (allTools[name] || 0) + count;
    }
  }

  const patterns = aggregatePromptPatterns(allPrompts);
  const mcpServers = Object.keys(manifest.settings?.mcp_servers || {});

  return `You are a pattern analyzer. Identify the top 3-5 repeating workflow patterns from this developer's usage data that would benefit from being codified as reusable agent skills.

## Existing Skills (do NOT duplicate)
Gemini: ${JSON.stringify(existingSkills)}
Claude: ${JSON.stringify(claudeSkills)}

## Available MCP Servers: ${JSON.stringify(mcpServers)}

## Tool Usage (sorted by frequency)
${JSON.stringify(Object.entries(allTools).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `${k}: ${v}`), null, 2)}

## Repeating Workflow Patterns (pre-clustered from ${allPrompts.length} prompts)
${JSON.stringify(patterns, null, 2)}

## Code Repository Configs
${buildRepoContext(manifest.repos)}

## Task
Identify 3-5 skill candidates. For each, provide:
1. \`name\` — kebab-case
2. \`description\` — one-line trigger description
3. \`rationale\` — which pattern cluster, with frequency counts
4. \`key_tools\` — list of exact tool names from the data above
5. \`example_prompts\` — 2-3 real user prompts from the data that would trigger this skill

Return valid JSON array with keys: name, description, rationale, key_tools, example_prompts`;
}

function buildSingleSkillWriterPrompt(candidate, manifest) {
  const mcpServers = Object.keys(manifest.settings?.mcp_servers || {});

  return `You are a Gemini CLI skill engineer. Write ONE production-grade SKILL.md following the Agent Skills specification (agentskills.io/skill-creation/best-practices).

## Skill Design Principles

1. **Add what the agent lacks, omit what it knows.** Jump to project-specific procedures, gotchas, and conventions.
2. **Favor procedures over declarations.** Write reusable methods, not specific answers.
3. **Provide defaults, not menus.** One clear approach with escape hatches.
4. **Match specificity to fragility.** Exact on brittle operations, flexible on resilient ones.
5. **Include Gotchas sections.** Environment-specific traps.
6. **Include validation loops.** Verify steps after multi-step workflows.

## Available MCP Servers: ${JSON.stringify(mcpServers)}

## Exemplar SKILL.md

\`\`\`markdown
---
name: email-triage
description: Triages inbox to Inbox Zero. Use when user wants to clean up or process emails.
---
# Email Triage Skill

## Step 1: Bulk Archive Noisy Categories
Use \`gmail.search\` with these exact queries and \`gmail.modify\` to remove INBOX label:
1. **Read Labeled:** Query: \`in:inbox is:read has:userlabels\`
2. **Groups:** Query: \`in:inbox (label:Groups/AI-Breakfast OR label:Groups/Cloudtop)\`

## Gotchas
- Labels are case-sensitive. Use exact names from the user's Gmail.
- \`gmail.batchModify\` maxes at 1000 messages. Loop if larger.

## Validation
After archival, run \`gmail.search\` with \`in:inbox\` and confirm count dropped.

## Best Practices
- Never archive personal, unread, important threads without confirmation
- Batch tool calls to minimize context window usage
\`\`\`

## Skill to Write

${JSON.stringify(candidate, null, 2)}

## Task

Write a complete SKILL.md for this skill. Include:
- YAML frontmatter (name + description optimized for agent activation)
- Procedural steps referencing exact tool names and parameters
- A "Gotchas" section with environment-specific traps
- A "Validation" section with verification commands
- A "Best Practices" section

Return valid JSON object with keys: name, description, rationale, skill_template
The \`skill_template\` must be the FULL SKILL.md content (YAML frontmatter + markdown body).`;
}

// ─── Progress Bar ────────────────────────────────────────────────────

function progressBar(current, total, label, width = 30) {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round((current / total) * width);
  const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
  process.stderr.write(`\r  ${label} [${bar}] ${current}/${total} (${pct}%)`);
  if (current >= total) process.stderr.write('\n');
}

// ─── Model Call (with retries across model chain) ────────────────────

async function callModel(ai, models, prompt, { temperature, maxTokens, label, quiet }) {
  for (const model of models) {
    try {
      if (!quiet) console.log(`    [${label}] Trying ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: { temperature, maxOutputTokens: maxTokens },
      });
      const text = (response.text || '').trim();
      if (!text) {
        if (!quiet) console.log(`    [${label}] ⚠ ${model} returned empty, trying next...`);
        continue;
      }
      const result = extractJSON(text);
      if (!quiet) console.log(`    [${label}] ✓ ${model} — ${Array.isArray(result) ? result.length + ' items' : 'ok'}`);
      return result;
    } catch (e) {
      const msg = e.message || '';
      if (!quiet) console.log(`    [${label}] ⚠ ${model}: ${msg.slice(0, 80)}`);
      continue; // Always try next model in the chain
    }
  }
  return null;
}

// ─── Two-Stage Pipeline ──────────────────────────────────────────────

async function suggestSkills(manifest, { apiKey, project } = {}) {
  const key = apiKey || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
  const gcpProject = project || process.env.GOOGLE_CLOUD_PROJECT;

  if (!key && !gcpProject) {
    console.log('  ⚠ No API key or project set, skipping skill suggestions');
    return [];
  }

  let ai;
  if (gcpProject && !key) {
    ai = new GoogleGenAI({ vertexai: true, project: gcpProject, location: 'global' });
  } else {
    ai = new GoogleGenAI({ apiKey: key });
  }

  // Stage 1: Identify candidates (flash-lite — cheap, fast)
  console.log('  📋 Stage 1: Identifying skill candidates (flash-lite)...');
  const identifierPrompt = buildIdentifierPrompt(manifest);
  const candidates = await callModel(ai, IDENTIFIER_MODELS, identifierPrompt, {
    temperature: 0.3, maxTokens: 2048, label: 'identify',
  });

  if (!candidates || !candidates.length) {
    console.log('  ⚠ No skill candidates identified');
    return [];
  }

  // Stage 2: Write each skill in parallel (pro — focused context per skill)
  console.log(`  ✏️  Stage 2: Writing ${candidates.length} skills in parallel (pro)...`);
  let completed = 0;
  progressBar(0, candidates.length, '✏️  Writing');

  const skillPromises = candidates.map(async (candidate) => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    const result = await callModel(ai, WRITER_MODELS, prompt, {
      temperature: 0.4, maxTokens: 4096, label: candidate.name, quiet: true,
    });
    completed++;
    progressBar(completed, candidates.length, '✏️  Writing');
    if (result && !Array.isArray(result)) return result;
    if (Array.isArray(result) && result.length) return result[0];
    // Generate a useful template from candidate data
    const tools = (candidate.key_tools || []).join(', ');
    const prompts = (candidate.example_prompts || []).map(p => `- "${p}"`).join('\n');
    return {
      name: candidate.name,
      description: candidate.description,
      rationale: candidate.rationale,
      skill_template: `---\nname: ${candidate.name}\ndescription: ${candidate.description}\n---\n# ${candidate.name}\n\n## When to Use\n${candidate.rationale}\n\n## Procedure\n1. Understand the user's intent from their prompt.\n2. Use the available tools (${tools}) to implement the workflow.\n3. Verify the outcome before reporting completion.\n\n## Key Tools\n${(candidate.key_tools || []).map(t => '- `' + t + '`').join('\n')}\n\n## Example Triggers\n${prompts}\n\n## Gotchas\n- Validate inputs before running commands.\n- Confirm destructive operations with the user.\n\n## Validation\n- Verify the final state matches the user's expectation.`,
    };
  });

  const results = await Promise.all(skillPromises);
  const skills = results.filter(s => s && s.name);
  console.log(`  ✓ ${skills.length}/${candidates.length} skills written`);
  return skills;
}

module.exports = {
  suggestSkills,
  // Exported for unit testing only
  _testing: { aggregatePromptPatterns, buildRepoContext, buildIdentifierPrompt, buildSingleSkillWriterPrompt, extractJSON },
};
