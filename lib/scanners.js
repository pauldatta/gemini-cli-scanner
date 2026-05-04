/** All scan functions — reads filesystem, returns plain objects */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { redactDict } = require('./redact');
const { parsePolicyToml } = require('./toml-lite');

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

// Strip // and /* */ comments from JSONC while preserving strings (e.g. URLs with //)
function stripJsoncComments(text) {
  let result = '', inString = false, escape = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { result += ch; escape = false; continue; }
    if (inString) {
      if (ch === '\\') escape = true;
      else if (ch === '"') inString = false;
      result += ch;
      continue;
    }
    if (ch === '"') { inString = true; result += ch; continue; }
    if (ch === '/' && text[i + 1] === '/') {
      // Skip to end of line
      while (i < text.length && text[i] !== '\n') i++;
      result += '\n';
      continue;
    }
    if (ch === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++; // skip closing /
      continue;
    }
    result += ch;
  }
  return result;
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
    _raw: raw, // Preserved for advisor engine — contains tools.exclude, security, hooks, mcp.allowed, etc.
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
    if (hasMd) {
      const content = tryRead(smPath) || '';
      Object.assign(info, parseFrontmatter(content));
      info.file_count = countFiles(d);
      // Advisory: check for best-practice sections
      info._has_gotchas = /^##\s+gotchas/im.test(content);
      info._has_validation = /^##\s+validation/im.test(content);
    }
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
  const parsed_rules = [];
  for (const f of dirEntries(pdir)) {
    if (f.name.endsWith('.toml')) {
      const content = tryRead(path.join(pdir, f.name)) || '';
      files[f.name] = content;
      // Parse TOML into structured rules for the advisor engine (all v0.40+ fields)
      const rules = parsePolicyToml(content);
      for (const r of rules) {
        if (r._table === 'rule') {
          parsed_rules.push({
            filename: f.name,
            toolName: r.toolName,
            decision: r.decision,
            commandPrefix: r.commandPrefix,
            priority: r.priority,
            // v0.40+ fields
            modes: r.modes || null,
            mcpName: r.mcpName || null,
            argsPattern: r.argsPattern || null,
            denyMessage: r.denyMessage || null,
            interactive: r.interactive !== undefined ? r.interactive : null,
            commandRegex: r.commandRegex || null,
            subagent: r.subagent || null,
            allowRedirection: r.allowRedirection || null,
            toolAnnotations: r.toolAnnotations || null,
          });
        }
      }
    }
  }
  return { found: true, files, parsed_rules };
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

  // Brain conversations — parse overview.txt for usage intelligence
  const brainDir = path.join(agDir, 'brain');
  if (fs.existsSync(brainDir)) {
    const convDirs = dirEntries(brainDir).filter(e => e.isDirectory() && !e.name.startsWith('.'));
    result.brain_conversations = convDirs.length;

    // Deep parse: extract tool usage, prompts, and timespans from overview.txt
    const toolUsage = {};
    const userPrompts = [];
    let totalSteps = 0;
    let earliest = null, latest = null;
    let conversationsParsed = 0;
    const artifactCount = { md: 0, json: 0, other: 0 };

    for (const cdir of convDirs) {
      const ovPath = path.join(brainDir, cdir.name, '.system_generated', 'logs', 'overview.txt');
      const ovContent = tryRead(ovPath);
      if (!ovContent) continue;
      conversationsParsed++;

      // Count artifacts (non-system files in conversation dir)
      for (const f of dirEntries(path.join(brainDir, cdir.name))) {
        if (f.isFile() && !f.name.startsWith('.')) {
          if (f.name.endsWith('.md')) artifactCount.md++;
          else if (f.name.endsWith('.json')) artifactCount.json++;
          else artifactCount.other++;
        }
      }

      for (const line of ovContent.split('\n')) {
        if (!line.trim()) continue;
        let d; try { d = JSON.parse(line); } catch { continue; }
        totalSteps++;

        // Timestamps (Antigravity uses created_at)
        const ts = d.created_at;
        if (ts) {
          if (!earliest || ts < earliest) earliest = ts;
          if (!latest || ts > latest) latest = ts;
        }

        // Tool calls (Antigravity uses tool_calls with snake_case)
        for (const tc of (d.tool_calls || [])) {
          const n = tc.name || 'unknown';
          toolUsage[n] = (toolUsage[n] || 0) + 1;
        }

        // Extract user prompts from USER_INPUT entries
        if (d.type === 'USER_INPUT' && d.content) {
          const start = d.content.indexOf('<USER_REQUEST>');
          const end = d.content.indexOf('</USER_REQUEST>');
          if (start >= 0 && end > start) {
            const req = d.content.slice(start + 14, end).trim().slice(0, 300);
            if (req.length > 5) userPrompts.push({ conv: cdir.name.slice(0, 8), text: req });
          }
        }
      }
    }

    const topTools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 20);
    result.brain_intelligence = {
      conversations_parsed: conversationsParsed,
      total_steps: totalSteps,
      timespan: { earliest, latest },
      tool_usage_top_20: Object.fromEntries(topTools),
      user_prompt_count: userPrompts.length,
      user_prompts: userPrompts.slice(0, 50), // Cap at 50 for report size
      artifacts: artifactCount,
    };
  } else {
    result.brain_conversations = 0;
    result.brain_intelligence = null;
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
  const toolUsage = {}, models = {}, topics = [], userPrompts = [], toolChains = [];
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
      const sessionChain = []; // tool chain for this session
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
          sessionChain.push(n);
        }
        if (d.type === 'gemini' && d.model) models[d.model] = (models[d.model] || 0) + 1;
        for (const t of (d.thoughts || [])) { if (t.subject) topics.push(t.subject); }
        if (d.tokens) { for (const k of Object.keys(totalTokens)) totalTokens[k] += (d.tokens[k] || 0); }
      }
      // Store tool chain per session for behavioral pattern detection
      if (sessionChain.length >= 3) {
        toolChains.push({ project: pname, session: ent.name, chain: sessionChain });
      }
    }
    const topTools = Object.entries(ptool).sort((a, b) => b[1] - a[1]).slice(0, 10);
    projectActivity[pname] = { sessions: psess, top_tools: Object.fromEntries(topTools) };
  }
  const topicCounts = {};
  for (const t of topics) topicCounts[t] = (topicCounts[t] || 0) + 1;
  const top20Tools = Object.entries(toolUsage).sort((a, b) => b[1] - a[1]).slice(0, 20);
  const top15Topics = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
  // Aggregate tool chain fingerprints (first 3 tools in sequence)
  const chainFingerprints = {};
  for (const tc of toolChains) {
    const fp = tc.chain.slice(0, 3).join('→');
    chainFingerprints[fp] = (chainFingerprints[fp] || 0) + 1;
  }
  const topChains = Object.entries(chainFingerprints).sort((a, b) => b[1] - a[1]).slice(0, 15);
  return {
    found: true, total_sessions: totalSessions,
    timespan: { earliest, latest }, projects: projectActivity,
    tool_usage_top_20: Object.fromEntries(top20Tools), models_used: models,
    thought_topics_top_15: Object.fromEntries(top15Topics), total_tokens: totalTokens,
    user_prompt_count: userPrompts.length, user_prompts: userPrompts,
    chat_days_filter: opts.chatDays || null,
    tool_chains: toolChains,
    chain_patterns: Object.fromEntries(topChains),
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
    // .geminiignore check (for advisory context architecture)
    repo._has_geminiignore = fs.existsSync(path.join(p, '.geminiignore'));
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

// ─── Memory Tier Scanner ─────────────────────────────────────────────

function scanMemoryTiers(gdir) {
  const result = {
    global: null,
    private_projects: [],
    extension_context: { detected: false },
    autoMemory: { enabled: null },
    summary: { tiers_in_use: 0, total_memory_words: 0, total_memory_files: 0 },
  };

  // Tier 1: Global personal (~/.gemini/GEMINI.md)
  const globalMd = tryRead(path.join(gdir, 'GEMINI.md'));
  if (globalMd) {
    const bullets = (globalMd.match(/^- .+$/gm) || []).length;
    result.global = { found: true, word_count: globalMd.split(/\s+/).length, sections: mdSections(globalMd), bullet_count: bullets, content: globalMd };
    result.summary.tiers_in_use++;
    result.summary.total_memory_words += result.global.word_count;
    result.summary.total_memory_files++;
  } else {
    result.global = { found: false };
  }

  // Tier 2: Private project memory (~/.gemini/tmp/<hash>/memory/)
  const tmpDir = path.join(gdir, 'tmp');
  for (const pent of dirEntries(tmpDir)) {
    if (!pent.isDirectory() || pent.name.startsWith('.')) continue;
    const memDir = path.join(tmpDir, pent.name, 'memory');
    if (!fs.existsSync(memDir)) continue;
    const memMdPath = path.join(memDir, 'MEMORY.md');
    const memMd = tryRead(memMdPath);
    const siblings = dirEntries(memDir).filter(e => e.isFile() && e.name.endsWith('.md') && e.name !== 'MEMORY.md').map(e => e.name);
    const proj = {
      project_hash: pent.name,
      memory_md: { found: false },
      sibling_files: siblings,
      total_files: siblings.length + (memMd ? 1 : 0),
    };
    if (memMd) {
      const wc = memMd.split(/\s+/).length;
      const bullets = (memMd.match(/^- .+$/gm) || []).length;
      proj.memory_md = { found: true, word_count: wc, bullet_count: bullets, content: memMd };
      result.summary.total_memory_words += wc;
    }
    // Count sibling file words
    for (const sf of siblings) {
      const c = tryRead(path.join(memDir, sf));
      if (c) result.summary.total_memory_words += c.split(/\s+/).length;
    }
    result.summary.total_memory_files += proj.total_files;
    result.private_projects.push(proj);
  }
  if (result.private_projects.some(p => p.memory_md.found || p.sibling_files.length)) {
    result.summary.tiers_in_use++;
  }

  // Tier 3: Extension context (detect from extension dirs)
  const extDir = path.join(gdir, 'extensions');
  for (const ent of dirEntries(extDir)) {
    if (ent.isDirectory() && fs.existsSync(path.join(extDir, ent.name, 'context'))) {
      result.extension_context.detected = true;
      result.summary.tiers_in_use++;
      break;
    }
  }

  // autoMemory flag from settings
  const settings = tryReadJSON(path.join(gdir, 'settings.json'));
  if (settings) {
    result.autoMemory.enabled = settings.autoMemory !== undefined ? !!settings.autoMemory : null;
  }

  return result;
}

// ─── Skill Extraction State Scanner ──────────────────────────────────

function scanSkillExtraction(gdir) {
  const result = {
    found: false,
    total_runs: 0,
    last_run: null,
    skills_created: [],
    sessions_processed: 0,
    inbox: { skills: [], patches: [] },
    stale_lock: false,
    auto_created_names: new Set(),
  };

  const tmpDir = path.join(gdir, 'tmp');
  for (const pent of dirEntries(tmpDir)) {
    if (!pent.isDirectory() || pent.name.startsWith('.')) continue;
    const memDir = path.join(tmpDir, pent.name, 'memory');
    if (!fs.existsSync(memDir)) continue;

    // Read extraction state
    const statePath = path.join(memDir, '.extraction-state.json');
    const state = tryReadJSON(statePath);
    if (state) {
      result.found = true;
      const history = state.runHistory || [];
      result.total_runs += history.length;
      for (const run of history) {
        if (run.timestamp && (!result.last_run || run.timestamp > result.last_run)) {
          result.last_run = run.timestamp;
        }
        result.sessions_processed += run.sessionsProcessed || 0;
        for (const sk of (run.skillsCreated || [])) {
          if (!result.skills_created.includes(sk)) result.skills_created.push(sk);
          result.auto_created_names.add(sk);
        }
      }
    }

    // Check for inbox skills (awaiting approval)
    const inboxDir = path.join(memDir, 'skills');
    for (const ent of dirEntries(inboxDir)) {
      if (ent.isDirectory()) {
        const smPath = path.join(inboxDir, ent.name, 'SKILL.md');
        if (fs.existsSync(smPath)) {
          result.inbox.skills.push({ name: ent.name, path: smPath });
        }
      }
      // Detect patch files
      if (ent.isFile() && (ent.name.endsWith('.patch') || ent.name.endsWith('.diff'))) {
        result.inbox.patches.push({ target: ent.name.replace(/\.(patch|diff)$/, ''), path: path.join(inboxDir, ent.name) });
      }
    }

    // Check for stale lock
    const lockPath = path.join(memDir, '.extraction.lock');
    if (fs.existsSync(lockPath)) {
      try {
        const lockStat = fs.statSync(lockPath);
        const ageMs = Date.now() - lockStat.mtimeMs;
        if (ageMs > 30 * 60 * 1000) result.stale_lock = true; // >30 minutes
      } catch { /* ignore */ }
    }
  }

  return result;
}

// ─── Admin Policy Scanner ────────────────────────────────────────────

function scanAdminPolicies() {
  const result = { found: false, files: [], rule_count: 0, skipped_reason: null };
  // macOS and Linux system-level policy directories
  const systemDirs = [
    '/Library/Application Support/GeminiCli/policies',
    '/etc/gemini-cli/policies',
  ];
  for (const dir of systemDirs) {
    try {
      if (!fs.existsSync(dir)) continue;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isFile() && ent.name.endsWith('.toml')) {
          result.found = true;
          result.files.push(ent.name);
          const content = tryRead(path.join(dir, ent.name)) || '';
          const rules = parsePolicyToml(content);
          result.rule_count += rules.filter(r => r._table === 'rule').length;
        }
      }
    } catch {
      // Permission denied — silently skip system folders
      result.skipped_reason = 'System policy directories require elevated permissions (try sudo).';
    }
  }
  return result;
}

// ─── OpenCode (.opencode/) ───────────────────────────────────────────
// https://github.com/anomalyco/opencode
// Project config: .opencode/opencode.jsonc
// Agents: .opencode/agent/*.md (YAML frontmatter + instructions)
// Skills: .opencode/skills/*/SKILL.md
// Commands: .opencode/command/*.md (slash commands)
// Custom tools: .opencode/tool/*.ts
// Plugins: .opencode/plugins/
// Themes: .opencode/themes/
// Glossary: .opencode/glossary/*.md
// Context: AGENTS.md (project root, similar to GEMINI.md)

function scanOpenCode(home) {
  // Check both home-level and project-level .opencode
  const candidates = [
    path.join(home, '.opencode'),
  ];
  // Also look for .opencode in cwd if different from home
  const cwdOC = path.join(process.cwd(), '.opencode');
  if (!candidates.includes(cwdOC)) candidates.push(cwdOC);

  let ocDir = null;
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isDirectory()) { ocDir = c; break; }
  }
  if (!ocDir) return { found: false };

  const result = { found: true, config_dir: ocDir };

  // Config file (JSONC)
  const configPath = path.join(ocDir, 'opencode.jsonc');
  const configRaw = tryRead(configPath);
  if (configRaw) {
    try {
      // Strip JSONC comments while preserving strings (handles URLs like https://)
      const stripped = stripJsoncComments(configRaw);
      // Strip trailing commas (JSONC allows them)
      const cleaned = stripped.replace(/,(\s*[}\]])/g, '$1');
      const config = JSON.parse(cleaned);
      result.config = {
        has_provider: !!(config.provider && Object.keys(config.provider).length),
        has_mcp: !!(config.mcp && Object.keys(config.mcp).length),
        mcp_servers: config.mcp ? Object.keys(config.mcp) : [],
        tools_disabled: config.tools ? Object.entries(config.tools).filter(([, v]) => v === false).map(([k]) => k) : [],
        tools_enabled: config.tools ? Object.entries(config.tools).filter(([, v]) => v === true).map(([k]) => k) : [],
        permissions: config.permission || null,
      };
    } catch {
      result.config = { parse_error: true };
    }
  }

  // Agents (.opencode/agent/*.md)
  const agentDir = path.join(ocDir, 'agent');
  const agentFiles = dirEntries(agentDir).filter(e => e.isFile() && e.name.endsWith('.md'));
  result.agents = agentFiles.map(e => {
    const content = tryRead(path.join(agentDir, e.name)) || '';
    const fm = parseFrontmatter(content);
    return {
      name: e.name.replace('.md', ''),
      model: fm.model || null,
      mode: fm.mode || null,
      hidden: fm.hidden === 'true',
      has_tools: content.includes('tools:'),
    };
  });

  // Skills (.opencode/skills/*/SKILL.md)
  const skillsDir = path.join(ocDir, 'skills');
  result.skills = [];
  for (const ent of dirEntries(skillsDir)) {
    if (!ent.isDirectory()) continue;
    const skillMd = tryRead(path.join(skillsDir, ent.name, 'SKILL.md'));
    if (skillMd) {
      const fm = parseFrontmatter(skillMd);
      result.skills.push({
        name: fm.name || ent.name,
        description: fm.description || null,
        source: 'opencode',
      });
    }
  }

  // Commands (.opencode/command/*.md)
  const cmdDir = path.join(ocDir, 'command');
  const cmdFiles = dirEntries(cmdDir).filter(e => e.isFile() && e.name.endsWith('.md'));
  result.commands = cmdFiles.map(e => {
    const content = tryRead(path.join(cmdDir, e.name)) || '';
    const fm = parseFrontmatter(content);
    return {
      name: e.name.replace('.md', ''),
      description: fm.description || null,
      model: fm.model || null,
      subtask: fm.subtask === 'true',
    };
  });

  // Custom tools (.opencode/tool/*.ts)
  const toolDir = path.join(ocDir, 'tool');
  const toolFiles = dirEntries(toolDir).filter(e => e.isFile() && e.name.endsWith('.ts'));
  result.custom_tools = toolFiles.map(e => e.name.replace('.ts', ''));

  // Plugins
  const pluginDir = path.join(ocDir, 'plugins');
  result.plugins = dirEntries(pluginDir).filter(e => e.isFile()).map(e => e.name);

  // Themes
  const themeDir = path.join(ocDir, 'themes');
  result.themes = dirEntries(themeDir).filter(e => e.isFile() && e.name.endsWith('.json')).map(e => e.name.replace('.json', ''));

  // Glossary
  const glossDir = path.join(ocDir, 'glossary');
  const glossFiles = dirEntries(glossDir).filter(e => e.isFile() && e.name.endsWith('.md'));
  result.glossary = { count: glossFiles.length, languages: glossFiles.map(e => e.name.replace('.md', '')) };

  // TUI config
  const tuiConfig = tryReadJSON(path.join(ocDir, 'tui.json'));
  if (tuiConfig) {
    result.tui_config = {
      has_plugins: !!(tuiConfig.plugin && tuiConfig.plugin.length),
      plugin_count: tuiConfig.plugin ? tuiConfig.plugin.length : 0,
    };
  }

  // AGENTS.md (project root context file — analogous to GEMINI.md)
  const agentsMdPath = path.join(path.dirname(ocDir), 'AGENTS.md');
  const agentsMd = tryRead(agentsMdPath);
  if (agentsMd) {
    result.agents_md = {
      size: agentsMd.length,
      sections: mdSections(agentsMd),
    };
  }

  return result;
}

module.exports = { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanClaude, scanConversations, scanProjectGeminiMds, scanRepos, scanAntigravity, scanContinue, scanWindsurf, scanJetBrains, parseSkillsDir, scanMemoryTiers, scanSkillExtraction, scanAdminPolicies, scanOpenCode };
