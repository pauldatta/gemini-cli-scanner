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

function buildPrompt(manifest) {
  const convos = manifest.conversations || {};
  const prompts = (convos.user_prompts || []).slice(0, 40);
  const tools = convos.tool_usage_top_20 || {};
  const topics = convos.thought_topics_top_15 || {};
  const existingSkills = (manifest.skills || []).map(s => s.name || '');
  const claudeSkills = ((manifest.claude || {}).skills || []).map(s => s.name || '');

  return `You are analyzing a developer's Gemini CLI usage patterns to suggest reusable agent skills they should create.

## Existing Skills (already installed)
Gemini: ${JSON.stringify(existingSkills)}
Claude Code: ${JSON.stringify(claudeSkills)}

## Top Tools Used
${JSON.stringify(tools, null, 2)}

## Top Thought Topics
${JSON.stringify(topics, null, 2)}

## Sample User Prompts (chronological)
${JSON.stringify(prompts.map(p => p.text), null, 2)}

## Code Repository Configs
${buildRepoContext(manifest.repos)}

## Task
Based on the patterns above (including repo configs, GEMINI.md content, and MCP server setups), suggest 3-5 NEW reusable skills this user should create.
For each skill, provide:
1. A short \`name\` (kebab-case, e.g. "gke-troubleshooter")
2. A \`description\` (one line)
3. \`rationale\` - why this pattern deserves a skill (what repeating pattern you detected)
4. \`skill_template\` - a brief SKILL.md template (YAML frontmatter + 5-10 lines of instructions)

Do NOT suggest skills that duplicate existing ones.
Focus on patterns the user does REPEATEDLY — those are the best candidates for automation.

Return valid JSON array of objects with keys: name, description, rationale, skill_template`;
}

function extractJSON(text) {
  if (text.includes('```json')) text = text.split('```json')[1].split('```')[0];
  else if (text.includes('```')) text = text.split('```')[1].split('```')[0];
  return JSON.parse(text.trim());
}

const MODEL_CHAIN = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3.1-pro-preview',
  'gemini-3-flash-preview',
];

async function suggestSkills(manifest, { apiKey, project } = {}) {
  const promptText = buildPrompt(manifest);

  // Determine auth: API key or Vertex AI (ADC)
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

  // Try models in order until one works
  for (const model of MODEL_CHAIN) {
    try {
      console.log(`    Trying model: ${model}...`);
      const response = await ai.models.generateContent({
        model,
        contents: promptText,
        config: { temperature: 0.7, maxOutputTokens: 4096 },
      });

      const text = (response.text || '').trim();
      if (!text) {
        console.log(`    ⚠ ${model} returned empty response, trying next...`);
        continue;
      }
      const result = extractJSON(text);
      console.log(`    ✓ ${model} — ${result.length} skills suggested`);
      return result;
    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('404') || msg.includes('NOT_FOUND') || msg.includes('not found')) {
        console.log(`    ⚠ ${model} not available, trying next...`);
        continue;
      }
      // Non-model error — don't retry
      console.log(`  ⚠ Skill suggestion failed (${model}): ${msg}`);
      return [];
    }
  }

  console.log('  ⚠ No available model found for skill suggestions');
  return [];
}

module.exports = { suggestSkills };
