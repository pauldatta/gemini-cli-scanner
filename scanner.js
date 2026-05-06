#!/usr/bin/env node
/**
 * Gemini CLI Environment Scanner v3.0.0
 * Scans ~/.gemini/ and ~/.claude/ to discover patterns, catalog configs,
 * and suggest reusable skills from conversation history.
 *
 * Zero external dependencies — Node.js built-ins only.
 * Auth: GOOGLE_API_KEY or GOOGLE_CLOUD_PROJECT (Vertex AI with gcloud ADC).
 */
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');
const { parseArgs } = require('node:util');
const { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanClaude, scanConversations, scanProjectGeminiMds, scanRepos, scanAntigravity, scanContinue, scanWindsurf, scanJetBrains, scanMemoryTiers, scanSkillExtraction, scanAdminPolicies, scanOpenCode } = require('./lib/scanners');
const { suggestSkills } = require('./lib/suggest');
const { computeScore, generateReport } = require('./lib/report');
const { runAdvisory } = require('./lib/advisor');

const VERSION = '3.5.6';
const GITHUB_REPO = 'pauldatta/gemini-cli-scanner';
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '__pycache__', 'dist', 'build', '.next', '.venv', 'venv', '.cache', '.npm', '.yarn', 'coverage', '.terraform']);

/**
 * Strip sensitive user data from manifest for serialization.
 * Collapses prompt arrays, topics, and project names to aggregate counts.
 * The in-memory manifest retains full data for AI synthesis and report generation.
 */
function collapseForPrivacy(m) {
  const o = JSON.parse(JSON.stringify(m));

  // Conversations — collapse to counts
  if (o.conversations) {
    const c = o.conversations;
    c.user_prompt_count = c.user_prompt_count || (c.user_prompts || []).length;
    delete c.user_prompts;
    c.topic_count = Object.keys(c.thought_topics_top_15 || {}).length;
    delete c.thought_topics_top_15;
    c.project_count = Object.keys(c.projects || {}).length;
    delete c.projects;
    delete c.tool_chains;
    // chain_patterns, tool_usage_top_20, models_used, total_tokens — safe, keep as-is
  }

  // Antigravity brain — collapse prompts
  if (o.antigravity?.brain_intelligence) {
    const b = o.antigravity.brain_intelligence;
    b.user_prompt_count = b.user_prompt_count || (b.user_prompts || []).length;
    delete b.user_prompts;
  }

  // Repos — anonymize names, keep capability flags
  if (o.repos?.length) {
    o.repo_count = o.repos.length;
    o.repos = o.repos.map((r, i) => ({
      name: `repo-${i + 1}`,
      has_gemini_md: !!r.gemini_md,
      has_claude_md: !!r.claude_md,
      has_gemini_config: !!r.gemini_config,
      has_geminiignore: !!r._has_geminiignore,
    }));
  }

  o._privacy = { mode: 'counts-only', version: '1.0' };
  return o;
}

/** Returns true if version a is strictly greater than version b (semver). */
function semverGt(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return true;
    if ((pa[i] || 0) < (pb[i] || 0)) return false;
  }
  return false;
}

/**
 * Discover git repos under given paths. If a path itself has .git, it's a repo.
 * Otherwise, walk up to maxDepth levels to find child repos.
 */
function discoverRepos(paths, maxDepth) {
  const repos = new Set();
  for (const rp of paths) {
    const p = path.resolve(rp.replace(/^~/, process.env.HOME || ''));
    if (!fs.existsSync(p)) { console.log(`  ⚠ Path not found: ${p}`); continue; }
    if (!fs.statSync(p).isDirectory()) { console.log(`  ⚠ Not a directory: ${p}`); continue; }
    if (fs.existsSync(path.join(p, '.git'))) { repos.add(p); continue; }
    // Walk children looking for .git dirs
    walkForRepos(p, 0, maxDepth, repos);
  }
  return [...repos];
}

function walkForRepos(dir, depth, maxDepth, repos) {
  if (depth >= maxDepth) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const ent of entries) {
    if (!ent.isDirectory() || ent.name.startsWith('.') || SKIP_DIRS.has(ent.name)) continue;
    const child = path.join(dir, ent.name);
    if (fs.existsSync(path.join(child, '.git'))) {
      repos.add(child);
      // Don't recurse into a repo's subdirs — it's already found
    } else {
      walkForRepos(child, depth + 1, maxDepth, repos);
    }
  }
}

function checkForUpdates() {
  return new Promise(resolve => {
    const req = https.get(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'gemini-cli-scanner' },
      timeout: 3000,
    }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const d = JSON.parse(data);
          const latest = (d.tag_name || '').replace(/^v/, '');
          if (latest && semverGt(latest, VERSION)) {
            const body = (d.body || '').split('\n')[0];
            console.log(`\n📦 Update available: v${VERSION} → v${latest}`);
            if (body) console.log(`   ${body}`);
            console.log(`   npx gemini-cli-scanner@latest`);
            console.log(`   # or: gemini extensions update gemini-cli-scanner\n`);
          }
        } catch {}
        resolve();
      });
    });
    req.on('error', () => resolve());
    req.on('timeout', () => { req.destroy(); resolve(); });
  });
}

// ─── Dashboard Subcommand ────────────────────────────────────────────
// Intercept before main scanner runs.
if (process.argv[2] === 'dashboard') {
  const { startDashboard } = require('./lib/dashboard/server');
  const srcIdx = process.argv.indexOf('--source');
  const portIdx = process.argv.indexOf('--port');
  const sourceDir = srcIdx > -1 ? process.argv[srcIdx + 1] : null;
  const port = portIdx > -1 ? parseInt(process.argv[portIdx + 1]) : 3847;
  startDashboard(sourceDir, port);
  // Don't fall through to main()
} else {
  main().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      'version':            { type: 'boolean', short: 'v' },
      'gemini-dir':         { type: 'string', default: path.join(process.env.HOME || '', '.gemini') },
      'home-dir':           { type: 'string', default: process.env.HOME || '' },
      'output-dir':         { type: 'string', default: './scan-results' },
      'skip-suggestions':   { type: 'boolean', default: false },
      'json-only':          { type: 'boolean', default: false },
      'skip-update-check':  { type: 'boolean', default: false },
      'include-prompts':    { type: 'boolean', default: false },
      'repos':              { type: 'string', multiple: true, default: [] },
      'chat-days':          { type: 'string', default: '' },
      'repo-depth':         { type: 'string', default: '3' },
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) { console.log(`gemini-cli-scanner v${VERSION}`); process.exit(0); }

  const gdir = values['gemini-dir'];
  const home = values['home-dir'];
  const outdir = values['output-dir'];
  const chatDays = values['chat-days'] ? parseInt(values['chat-days'], 10) : null;
  const repoDepth = parseInt(values['repo-depth'] || '3', 10);
  // Support both --repos a b and positional args as repo paths
  const repoPaths = [...(values.repos || []), ...positionals];

  if (!fs.existsSync(gdir)) { console.error(`Error: ${gdir} not found`); process.exit(1); }

  console.log(`🔍 Scanning ${gdir}...`);
  if (!values['skip-update-check']) await checkForUpdates();

  const m = { scan_timestamp: new Date().toISOString(), gemini_dir: gdir, scanner_version: VERSION };

  console.log('  → Settings & MCP servers...');   m.settings = scanSettings(gdir);
  console.log('  → Global GEMINI.md...');          m.global_gemini_md = scanGeminiMd(gdir);
  console.log('  → Gemini skills...');             m.skills = scanSkills(gdir);
  console.log('  → Custom agents...');             m.agents = scanAgents(gdir);
  console.log('  → Extensions...');                m.extensions = scanExtensions(gdir);
  console.log('  → Policies...');                  m.policies = scanPolicies(gdir);
  console.log('  → Claude Code (~/.claude)...');   m.claude = scanClaude(home);
  if (chatDays) console.log(`  → Conversations (last ${chatDays} days)...`);
  else console.log('  → Conversations (all history)...');
  m.conversations = scanConversations(gdir, { chatDays });
  console.log('  → Project GEMINI.md files...');   m.project_gemini_mds = scanProjectGeminiMds(gdir);

  // AI Tool Ecosystem
  console.log('  → Antigravity (brain, skills, MCP)...');  m.antigravity = scanAntigravity(gdir);
  console.log('  → Continue (.continue)...');               m.continue_dev = scanContinue(home);
  console.log('  → Windsurf (.codeium)...');                m.windsurf = scanWindsurf(home);
  console.log('  → JetBrains AI...');                       m.jetbrains = scanJetBrains(home);
  console.log('  → OpenCode (.opencode)...');                m.opencode = scanOpenCode(home);

  // v3.5 scanners: memory tiers, skill extraction, admin policies
  console.log('  → Memory tiers (4-tier hierarchy)...');       m.memory_tiers = scanMemoryTiers(gdir);
  console.log('  → Skill extraction state...');                m.skill_extraction = scanSkillExtraction(gdir);
  console.log('  → Admin policies (system-level)...');         m.admin_policies = scanAdminPolicies();

  if (repoPaths.length) {
    // Discover repos recursively if a path is a directory without .git
    const discovered = discoverRepos(repoPaths, repoDepth);
    console.log(`  → Discovered ${discovered.length} repos:`);
    for (const rp of discovered) {
      console.log(`    📁 ${path.basename(rp)}  ${'\x1b[2m'}${rp}${'\x1b[0m'}`);
    }
    console.log('  → Scanning repo configs...');
    m.repos = scanRepos(discovered);
  } else {
    m.repos = [];
  }

  m.sophistication_score = computeScore(m);

  // Advisory engine — evaluate best practices
  m._raw_settings = m.settings?._raw || {};
  console.log('  → Running best practices advisory...');
  m.advisory = runAdvisory(m);

  if (!values['skip-suggestions']) {
    console.log('  → Suggesting skills (Gemini API)...');
    m.suggested_skills = await suggestSkills(m, {
      apiKey: process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY,
      project: process.env.GOOGLE_CLOUD_PROJECT,
    });
  } else {
    m.suggested_skills = [];
  }

  fs.mkdirSync(outdir, { recursive: true });

  // Privacy: serialize counts-only manifest by default, full data with --include-prompts
  const output = values['include-prompts'] ? m : collapseForPrivacy(m);
  const jp = path.join(outdir, 'gemini-env-manifest.json');
  fs.writeFileSync(jp, JSON.stringify(output, null, 2));
  if (!values['include-prompts']) console.log('  🔒 Privacy mode: manifest contains counts only (use --include-prompts for raw data)');
  console.log(`\n✅ JSON manifest: ${jp}`);

  if (!values['json-only']) {
    // Report uses original `m` — local artifact keeps full detail
    const mp = path.join(outdir, 'gemini-env-report.md');
    fs.writeFileSync(mp, generateReport(m));
    console.log(`✅ Markdown report: ${mp}`);
  }

  const mat = m.advisory?.maturity || {};
  console.log(`\n📊 Maturity Score: ${m.sophistication_score.total}/${m.sophistication_score.max}`);
  console.log(`🩺 Maturity: ${mat.emoji || ''} ${mat.label || 'N/A'} (${m.advisory?.summary?.total || 0} recommendations)`);
}
