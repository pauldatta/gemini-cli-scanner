/** All scan functions — reads filesystem, returns plain objects */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { redactDict } = require('./redact');

function tryReadJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}
function tryRead(p) {
  try { return fs.readFileSync(p, 'utf8'); } catch { return null; }
}
function mdSections(text) {
  return [...text.matchAll(/^#+\s+(.+)$/gm)].map(m => m[1]);
}
function parseFrontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]+?)\n---/);
  if (!m) return {};
  const info = {};
  for (const line of m[1].split('\n')) {
    const idx = line.indexOf(':');
    if (idx > 0) info[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return info;
}
function dirEntries(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch { return []; }
}
function rglob(dir, pattern) {
  const results = [];
  function walk(d) {
    for (const ent of dirEntries(d)) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (typeof pattern === 'string' ? ent.name === pattern : pattern.test(ent.name)) results.push(full);
    }
  }
  walk(dir); return results;
}
function countFiles(dir) {
  let n = 0;
  function walk(d) { for (const e of dirEntries(d)) { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : n++; } }
  walk(dir); return n;
}

function scanSettings(gdir) {
  const raw = tryReadJSON(path.join(gdir, 'settings.json'));
  if (!raw) return { found: false };
  return {
    found: true,
    mcp_servers: redactDict(raw.mcpServers || {}),
    model: raw.model || {},
    experimental: raw.experimental || {},
    auth_type: (raw.security?.auth?.selectedType) || null,
    agents_config: raw.agents || {},
  };
}

function scanGeminiMd(gdir) {
  const content = tryRead(path.join(gdir, 'GEMINI.md'));
  if (!content) return { found: false };
  return { found: true, word_count: content.split(/\s+/).length, sections: mdSections(content), content };
}

/** Reusable skill directory parser — shared across Gemini, Continue, Windsurf, etc. */
function parseSkillsDir(sdir, source) {
  const skills = [];
  for (const ent of dirEntries(sdir)) {
    if (ent.name.startsWith('.')) continue;
    const d = path.join(sdir, ent.name);
    // Handle both real dirs and symlinks to dirs (Continue/Windsurf use symlinks)
    const isDir = ent.isDirectory() || (ent.isSymbolicLink() && fs.existsSync(d) && fs.statSync(d).isDirectory());
    if (!isDir) continue;
    const smPath = path.join(d, 'SKILL.md');
    const hasMd = fs.existsSync(smPath);
    const info = { name: ent.name, source, has_skill_md: hasMd };
    if (hasMd) { Object.assign(info, parseFrontmatter(tryRead(smPath) || '')); info.file_count = countFiles(d); }
    skills.push(info);
  }
  return skills;
}

function scanSkills(gdir) {
  return parseSkillsDir(path.join(gdir, 'skills'), 'gemini');
}

function scanAgents(gdir) {
  const agents = [];
  const dirs = [path.join(gdir, 'agents')];
  const extDir = path.join(gdir, 'extensions');
  for (const ent of dirEntries(extDir)) {
    if (ent.isDirectory()) dirs.push(path.join(extDir, ent.name, 'agents'));
  }
  for (const dir of dirs) {
    for (const ent of dirEntries(dir)) {
      if (!ent.name.endsWith('.md')) continue;
      const content = tryRead(path.join(dir, ent.name)) || '';
      const info = { name: ent.name.replace('.md', ''), source: path.relative(gdir, dir), path: path.join(dir, ent.name) };
      Object.assign(info, parseFrontmatter(content));
      agents.push(info);
    }
  }
  return agents;
}

function scanExtensions(gdir) {
  const edir = path.join(gdir, 'extensions');
  if (!fs.existsSync(edir)) return { found: false, extensions: [] };
  const exts = dirEntries(edir).filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
  const enablement = {};
  const raw = tryReadJSON(path.join(edir, 'extension-enablement.json'));
  if (raw) {
    for (const [n, c] of Object.entries(raw)) {
      const overrides = c.overrides || [];
      enablement[n] = { enabled: !overrides.some(o => o.startsWith('!')) };
    }
  }
  return { found: true, extensions: exts, enablement };
}

function scanPolicies(gdir) {
  const pdir = path.join(gdir, 'policies');
  if (!fs.existsSync(pdir)) return { found: false };
  const files = {};
  for (const f of dirEntries(pdir)) {
    if (f.name.endsWith('.toml')) files[f.name] = tryRead(path.join(pdir, f.name)) || '';
  }
  return { found: true, files };
}

function scanClaude(home) {
  const cdir = path.join(home, '.claude');
  if (!fs.existsSync(cdir)) return { found: false };
  const result = { found: true, skills: parseSkillsDir(path.join(cdir, 'skills'), 'claude'), claude_mds: [] };
  for (const f of rglob(cdir, 'CLAUDE.md')) {
    const c = tryRead(f) || '';
    result.claude_mds.push({ path: f, word_count: c.split(/\s+/).length, sections: mdSections(c) });
  }
  return result;
}

// ─── AI Tool Ecosystem Scanners ──────────────────────────────────────

function scanAntigravity(gdir) {
  const agDir = path.join(gdir, 'antigravity');
  if (!fs.existsSync(agDir)) return { found: false };
  const result = { found: true };

  // Skills
  result.skills = parseSkillsDir(path.join(agDir, 'skills'), 'antigravity');

  // Brain conversations
  const brainDir = path.join(agDir, 'brain');
  if (fs.existsSync(brainDir)) {
    const convDirs = dirEntries(brainDir).filter(e => e.isDirectory() && !e.name.startsWith('.'));
    result.brain_conversations = convDirs.length;
  } else {
    result.brain_conversations = 0;
  }

  // MCP config
  const mcpRaw = tryReadJSON(path.join(agDir, 'mcp_config.json'));
  if (mcpRaw && mcpRaw.mcpServers) {
    result.mcp_servers = Object.keys(mcpRaw.mcpServers);
  } else {
    result.mcp_servers = [];
  }

  // Knowledge items
  const kDir = path.join(agDir, 'knowledge');
  if (fs.existsSync(kDir)) {
    result.knowledge_items = dirEntries(kDir).filter(e => e.isDirectory() || (e.isFile() && !e.name.startsWith('.'))).length;
  } else {
    result.knowledge_items = 0;
  }

  return result;
}

function scanContinue(home) {
  const cdir = path.join(home, '.continue');
  if (!fs.existsSync(cdir)) return { found: false };
  return {
    found: true,
    skills: parseSkillsDir(path.join(cdir, 'skills'), 'continue'),
  };
}

function scanWindsurf(home) {
  const wdir = path.join(home, '.codeium', 'windsurf');
  if (!fs.existsSync(wdir)) return { found: false };
  return {
    found: true,
    skills: parseSkillsDir(path.join(wdir, 'skills'), 'windsurf'),
  };
}

function scanJetBrains(home) {
  const jbDir = path.join(home, 'Library', 'Application Support', 'JetBrains', 'Air');
  if (!fs.existsSync(jbDir)) return { found: false };
  const result = { found: true };
  // Rules
  const rulesDir = path.join(jbDir, 'rules');
  const ruleFiles = dirEntries(rulesDir).filter(e => e.isFile() && !e.name.startsWith('.'));
  result.rules = ruleFiles.map(e => e.name);
  return result;
}

function scanConversations(gdir, opts) {
  opts = opts || {};
  const tmp = path.join(gdir, 'tmp');
  if (!fs.existsSync(tmp)) return { found: false };
  const toolUsage = {}, models = {}, topics = [], userPrompts = [];
  let totalSessions = 0, earliest = null, latest = null;
  const totalTokens = { input: 0, output: 0, cached: 0, thoughts: 0 };
  const projectActivity = {};
  // Compute cutoff if --chat-days is set
  const cutoff = opts.chatDays ? new Date(Date.now() - opts.chatDays * 86400000).toISOString() : null;

  for (const pent of dirEntries(tmp)) {
    if (!pent.isDirectory() || pent.name.startsWith('.')) continue;
    const pname = pent.name;
    const pdir = path.join(tmp, pname);
    const ptool = {};
    let psess = 0;
    // logs.json
    const logs = tryReadJSON(path.join(pdir, 'logs.json'));
    if (Array.isArray(logs)) {
      for (const e of logs) {
        if (e.type === 'user' && e.message && !e.message.startsWith('/')) {
          userPrompts.push({ project: pname, timestamp: e.timestamp || '', text: e.message.slice(0, 300) });
        }
      }
    }
    // chats
    const chatsDir = path.join(pdir, 'chats');
    for (const ent of dirEntries(chatsDir)) {
      if (!ent.name.startsWith('session-') || !ent.name.endsWith('.jsonl')) continue;
      totalSessions++; psess++;
      const lines = (tryRead(path.join(chatsDir, ent.name)) || '').split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        const ts = d.timestamp;
        if (ts) {
          if (cutoff && ts < cutoff) continue; // skip entries older than --chat-days
          if (!earliest || ts < earliest) earliest = ts; if (!latest || ts > latest) latest = ts;
        }
        for (const tc of (d.toolCalls || [])) {
          const n = tc.name || 'unknown';
          toolUsage[n] = (toolUsage[n] || 0) + 1; ptool[n] = (ptool[n] || 0) + 1;
        }
        if (d.type === 'gemini' && d.model) models[d.model] = (models[d.model] || 0) + 1;
        for (const t of (d.thoughts || [])) { if (t.subject) topics.push(t.subject); }
        if (d.tokens) { for (const k of Object.keys(totalTokens)) totalTokens[k] += (d.tokens[k] || 0); }
      }
    }
    const topTools = Object.entries(ptool).sort((a, b) => b[1] - a[1]).slice(0, 10);
    projectActivity[pname] = { sessions: psess, top_tools: Object.fromEntries(topTools) };
  }
  const topicCounts = {};
  for (const t of topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
  const top20Tools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const top15Topics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    found: true, total_sessions: totalSessions,
    timespan: { earliest, latest }, projects: projectActivity,
    tool_usage_top_20: Object.fromEntries(top20Tools), models_used: models,
    thought_topics_top_15: Object.fromEntries(top15Topics), total_tokens: totalTokens,
    user_prompt_count: userPrompts.length, user_prompts: userPrompts,
    chat_days_filter: opts.chatDays || null,
  };
}

function scanProjectGeminiMds(gdir) {
  const results = [];
  const paths = new Set();
  const pj = tryReadJSON(path.join(gdir, 'projects.json'));
  if (Array.isArray(pj)) for (const p of pj) paths.add(p.path || p.projectRoot || '');
  else if (pj && typeof pj === 'object') for (const v of Object.values(pj)) { if (v && typeof v === 'object') paths.add(v.path || v.projectRoot || ''); }
  for (const f of rglob(path.join(gdir, 'tmp'), '.project_root')) { const c = tryRead(f); if (c) paths.add(c.trim()); }
  for (const pp of paths) {
    if (!pp) continue;
    const candidates = [path.join(pp, 'GEMINI.md')];
    const gd = path.join(pp, '.gemini');
    if (fs.existsSync(gd)) candidates.push(...rglob(gd, 'GEMINI.md'));
    for (const gmd of candidates) {
      const c = tryRead(gmd);
      if (c) results.push({ project: path.basename(pp), path: gmd, word_count: c.split(/\s+/).length, sections: mdSections(c) });
    }
  }
  return results;
}

function scanRepos(repoPaths) {
  const results = [];
  for (const rp of repoPaths) {
    const p = path.resolve(rp.replace(/^~/, process.env.HOME || ''));
    if (!fs.existsSync(p)) { console.log(`  ⚠ Repo path not found: ${p}`); continue; }
    const repo = { path: p, name: path.basename(p) };
    // GEMINI.md
    const gmdPath = path.join(p, 'GEMINI.md'); const gmdC = tryRead(gmdPath);
    if (gmdC) { const w = gmdC.split(/\s+/); repo.gemini_md = { word_count: w.length, sections: mdSections(gmdC), content_preview: w.slice(0, 500).join(' ') }; }
    // CLAUDE.md
    const cmdPath = path.join(p, 'CLAUDE.md'); const cmdC = tryRead(cmdPath);
    if (cmdC) { const w = cmdC.split(/\s+/); repo.claude_md = { word_count: w.length, sections: mdSections(cmdC), content_preview: w.slice(0, 500).join(' ') }; }
    // .gemini/ project config
    const gdir = path.join(p, '.gemini');
    if (fs.existsSync(gdir)) {
      const gcfg = {};
      const sj = tryReadJSON(path.join(gdir, 'settings.json'));
      if (sj) {
        const red = redactDict(sj); gcfg.settings = red;
        const mcp = red.mcpServers || {};
        gcfg.mcp_details = {};
        for (const [name, cfg] of Object.entries(mcp)) gcfg.mcp_details[name] = { command: cfg.command || '', args: cfg.args || [] };
      }
      const skDir = path.join(gdir, 'skills');
      if (fs.existsSync(skDir)) {
        gcfg.skills = [];
        for (const ent of dirEntries(skDir)) {
          if (!ent.isDirectory()) continue;
          const smPath = path.join(skDir, ent.name, 'SKILL.md'); const c = tryRead(smPath);
          if (c) { const info = { name: ent.name, content_preview: c.slice(0, 1000) }; Object.assign(info, parseFrontmatter(c)); gcfg.skills.push(info); }
        }
      }
      const agDir = path.join(gdir, 'agents');
      if (fs.existsSync(agDir)) {
        gcfg.agents = [];
        for (const ent of dirEntries(agDir)) {
          if (!ent.name.endsWith('.md')) continue;
          const c = tryRead(path.join(agDir, ent.name)) || '';
          const info = { name: ent.name.replace('.md', '') }; Object.assign(info, parseFrontmatter(c)); gcfg.agents.push(info);
        }
      }
      for (const nested of rglob(gdir, 'GEMINI.md')) {
        const c = tryRead(nested); if (!c) continue;
        const w = c.split(/\s+/);
        gcfg.context_files = gcfg.context_files || [];
        gcfg.context_files.push({ path: path.relative(p, nested), word_count: w.length, sections: mdSections(c), content_preview: w.slice(0, 300).join(' ') });
      }
      repo.gemini_config = gcfg;
    }
    // .claude/
    const cdir = path.join(p, '.claude');
    if (fs.existsSync(cdir)) {
      const ccfg = { context_files: [] };
      for (const ent of dirEntries(cdir)) {
        if (!ent.name.endsWith('.md')) continue;
        const c = tryRead(path.join(cdir, ent.name)) || '';
        const w = c.split(/\s+/);
        ccfg.context_files.push({ name: ent.name, word_count: w.length, sections: mdSections(c), content_preview: w.slice(0, 300).join(' ') });
      }
      repo.claude_config = ccfg;
    }
    results.push(repo);
  }
  return results;
}

module.exports = { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanClaude, scanConversations, scanProjectGeminiMds, scanRepos, scanAntigravity, scanContinue, scanWindsurf, scanJetBrains, parseSkillsDir };
