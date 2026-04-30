/** Markdown report generator + sophistication scorer */
'use strict';

function computeScore(m) {
  const s = {};
  s.mcp_servers = Math.min(Object.keys(m.settings?.mcp_servers || {}).length * 5, 20);
  s.skills = Math.min((m.skills || []).length * 3, 15);
  s.extensions = Math.min((m.extensions?.extensions || []).length * 2, 15);
  const gmd = m.global_gemini_md || {};
  s.global_context = gmd.found ? Math.min(Math.floor((gmd.word_count || 0) / 50), 10) : 0;
  s.project_context = Math.min((m.project_gemini_mds || []).length * 3, 10);
  s.policies = m.policies?.found ? 5 : 0;
  s.tool_diversity = Math.min(Object.keys(m.conversations?.tool_usage_top_20 || {}).length * 2, 15);
  s.session_volume = Math.min(Math.floor((m.conversations?.total_sessions || 0) / 2), 10);
  if (m.claude?.found) s.claude_skills = Math.min((m.claude.skills || []).length, 5);
  // Ecosystem bonus: 1pt per additional AI tool found (max 5)
  let ecosystemTools = 0;
  if (m.antigravity?.found) ecosystemTools++;
  if (m.continue_dev?.found) ecosystemTools++;
  if (m.windsurf?.found) ecosystemTools++;
  if (m.jetbrains?.found) ecosystemTools++;
  s.ecosystem_tools = Math.min(ecosystemTools, 5);
  // Cross-tool skill overlap bonus: skills shared across 2+ tools (max 5)
  const overlap = computeSkillOverlap(m);
  s.cross_tool_skills = Math.min(overlap.shared.length, 5);
  return { total: Object.values(s).reduce((a, b) => a + b, 0), max: 115, breakdown: s };
}

/** Compute skill name overlap across all scanned tools */
function computeSkillOverlap(m) {
  const skillMap = {}; // skill name → set of sources
  const addSkills = (skills) => {
    for (const s of (skills || [])) {
      const name = s.name;
      if (!skillMap[name]) skillMap[name] = new Set();
      skillMap[name].add(s.source || 'unknown');
    }
  };
  addSkills(m.skills);
  addSkills(m.claude?.skills);
  addSkills(m.antigravity?.skills);
  addSkills(m.continue_dev?.skills);
  addSkills(m.windsurf?.skills);
  const shared = [];
  const unique = [];
  for (const [name, sources] of Object.entries(skillMap)) {
    if (sources.size > 1) shared.push({ name, sources: [...sources] });
    else unique.push({ name, source: [...sources][0] });
  }
  return { shared, unique, total: Object.keys(skillMap).length };
}

function generateReport(m) {
  const L = [];
  L.push('# Gemini CLI Environment Scan Report');
  L.push(`\n**Scan Date:** ${m.scan_timestamp}`);
  const score = m.sophistication_score;
  L.push(`\n## Sophistication Score: ${score.total}/${score.max}\n`);
  L.push('| Category | Score |', '|:---|---:|');
  for (const [k, v] of Object.entries(score.breakdown)) L.push(`| ${k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} | ${v} |`);

  // MCP
  const mcp = m.settings?.mcp_servers || {};
  L.push(`\n## MCP Servers (${Object.keys(mcp).length})\n`);
  for (const [n, c] of Object.entries(mcp)) L.push(`- **${n}** — \`${c.command || 'N/A'}\``);

  // Skills
  const skills = m.skills || [];
  L.push(`\n## Gemini Skills (${skills.length})\n`);
  for (const s of skills) L.push(`- **${s.name}** — ${s.description || ''}`);

  // Claude
  if (m.claude?.found) {
    const cs = m.claude.skills || [];
    L.push(`\n## Claude Code Skills (${cs.length})\n`);
    for (const s of cs) L.push(`- **${s.name}** — ${s.description || ''}`);
  }

  // Agents
  if (m.agents?.length) {
    L.push(`\n## Custom Agents (${m.agents.length})\n`);
    for (const a of m.agents) L.push(`- **${a.name}** (${a.source}) — ${a.description || ''}`);
  }

  // Extensions
  const ext = m.extensions || {};
  L.push(`\n## Extensions (${(ext.extensions || []).length})\n`);
  for (const e of (ext.extensions || [])) {
    const en = ext.enablement?.[e] || {};
    L.push(`- ${en.enabled !== false ? '✅' : '❌'} **${e}**`);
  }

  // Conversations
  const convos = m.conversations || {};
  if (convos.found) {
    L.push('\n## Conversation Intelligence\n');
    L.push(`- **Sessions:** ${convos.total_sessions}`);
    const ts = convos.timespan || {};
    if (ts.earliest) L.push(`- **Timespan:** ${ts.earliest.slice(0, 10)} → ${ts.latest.slice(0, 10)}`);
    const tok = convos.total_tokens || {};
    L.push(`- **Total Tokens:** ${Object.values(tok).reduce((a, b) => a + b, 0).toLocaleString()}\n`);
    L.push('### Top Tools\n| Tool | Calls |\n|:---|---:|');
    for (const [t, c] of Object.entries(convos.tool_usage_top_20 || {}).sort((a, b) => b[1] - a[1])) L.push(`| \`${t}\` | ${c} |`);
    L.push('\n### Models Used\n');
    for (const [mo, c] of Object.entries(convos.models_used || {})) L.push(`- \`${mo}\`: ${c} turns`);
  }

  // Suggested skills
  const suggestions = m.suggested_skills || [];
  if (suggestions.length) {
    L.push(`\n## 💡 Suggested Skills (${suggestions.length})\n`);
    L.push('These skills were identified by analyzing your conversation patterns.\n');
    for (const s of suggestions) {
      L.push(`### \`${s.name || ''}\`\n`);
      L.push(`**Description:** ${s.description || ''}\n`);
      L.push(`**Rationale:** ${s.rationale || ''}\n`);
      if (s.skill_template) L.push(`\`\`\`markdown\n${s.skill_template}\n\`\`\`\n`);
    }
  }

  // Repos
  const repos = m.repos || [];
  if (repos.length) {
    L.push(`\n## Code Repositories (${repos.length})\n`);
    for (const r of repos) {
      L.push(`### 📁 ${r.name}\n`, `\`${r.path}\`\n`);
      if (r.gemini_md) L.push(`- **GEMINI.md** — ${r.gemini_md.word_count} words, sections: ${(r.gemini_md.sections || []).join(', ')}`);
      if (r.claude_md) L.push(`- **CLAUDE.md** — ${r.claude_md.word_count} words, sections: ${(r.claude_md.sections || []).join(', ')}`);
      const gc = r.gemini_config || {};
      if (gc.mcp_details) {
        for (const [mname, md] of Object.entries(gc.mcp_details)) {
          const argsStr = md.args?.length ? ` (${md.args.slice(0, 3).join(' ')})` : '';
          L.push(`  - 🔌 \`${mname}\` — \`${md.command}\`${argsStr}`);
        }
      }
      if (gc.skills) for (const sk of gc.skills) L.push(`  - 🎯 Skill: **${sk.name}**${sk.description ? ` — ${sk.description.slice(0, 100)}` : ''}`);
      if (gc.agents?.length && typeof gc.agents[0] === 'object') {
        for (const ag of gc.agents) {
          const detail = ag.model ? ` (${ag.model})` : '';
          L.push(`  - 🤖 Agent: **${ag.name}**${detail}${ag.description ? ` — ${ag.description.slice(0, 80)}` : ''}`);
        }
      }
      L.push('');
    }
  }

  // AI Tool Ecosystem
  const ecosystemTools = [
    { key: 'antigravity', label: 'Antigravity', data: m.antigravity },
    { key: 'continue_dev', label: 'Continue', data: m.continue_dev },
    { key: 'windsurf', label: 'Windsurf', data: m.windsurf },
    { key: 'jetbrains', label: 'JetBrains AI', data: m.jetbrains },
  ].filter(t => t.data?.found);

  if (ecosystemTools.length || (m.claude?.found)) {
    L.push('\n## 🧰 AI Tool Ecosystem\n');
    L.push('| Tool | Status | Skills | Details |', '|:---|:---|---:|:---|');
    L.push(`| Gemini CLI | ✅ Installed | ${(m.skills || []).length} | Primary environment |`);
    if (m.claude?.found) L.push(`| Claude Code | ✅ Found | ${(m.claude.skills || []).length} | ${m.claude.claude_mds?.length || 0} CLAUDE.md files |`);
    for (const t of ecosystemTools) {
      const skillCount = (t.data.skills || []).length;
      let details = '';
      if (t.key === 'antigravity') {
        const parts = [];
        if (t.data.brain_conversations) parts.push(`${t.data.brain_conversations} brain conversations`);
        if (t.data.mcp_servers?.length) parts.push(`${t.data.mcp_servers.length} MCP servers`);
        if (t.data.knowledge_items) parts.push(`${t.data.knowledge_items} knowledge items`);
        details = parts.join(', ');
      } else if (t.key === 'jetbrains') {
        details = t.data.rules?.length ? `${t.data.rules.length} rules` : 'No rules configured';
      }
      L.push(`| ${t.label} | ✅ Found | ${skillCount} | ${details} |`);
    }

    // Antigravity brain intelligence (deep data)
    const brainI = m.antigravity?.brain_intelligence;
    if (brainI && brainI.total_steps > 0) {
      L.push(`\n### 🧠 Antigravity Brain Intelligence\n`);
      L.push(`- **Conversations parsed:** ${brainI.conversations_parsed} / ${m.antigravity.brain_conversations}`);
      const bts = brainI.timespan || {};
      if (bts.earliest) L.push(`- **Timespan:** ${bts.earliest.slice(0, 10)} → ${bts.latest.slice(0, 10)}`);
      L.push(`- **Total steps:** ${brainI.total_steps.toLocaleString()}`);
      L.push(`- **User prompts:** ${brainI.user_prompt_count}`);
      const arts = brainI.artifacts || {};
      L.push(`- **Artifacts:** ${arts.md} markdown, ${arts.json} JSON, ${arts.other} other\n`);
      L.push('| Tool | Calls |', '|:---|---:|');
      for (const [t, c] of Object.entries(brainI.tool_usage_top_20 || {})) L.push(`| \`${t}\` | ${c} |`);
    }

    // Cross-tool skill overlap
    const overlap = computeSkillOverlap(m);
    if (overlap.shared.length) {
      L.push(`\n### 🔄 Cross-Tool Skill Overlap (${overlap.shared.length} shared)\n`);
      for (const s of overlap.shared) L.push(`- **${s.name}** — found in: ${s.sources.join(', ')}`);
    }
    if (overlap.unique.length) {
      L.push(`\n### 🎯 Unique Skills by Tool\n`);
      const bySource = {};
      for (const s of overlap.unique) {
        if (!bySource[s.source]) bySource[s.source] = [];
        bySource[s.source].push(s.name);
      }
      for (const [src, names] of Object.entries(bySource)) {
        L.push(`- **${src}** (${names.length}): ${names.join(', ')}`);
      }
    }
    L.push(`\n> **Total unique skills across all tools:** ${overlap.total}`);
  }

  L.push('\n---\n*Generated by gemini-cli-scanner. Review before sharing.*');
  return L.join('\n');
}

module.exports = { computeScore, generateReport };
