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
const { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanClaude, scanConversations, scanProjectGeminiMds, scanRepos, scanAntigravity, scanContinue, scanWindsurf, scanJetBrains } = require('./lib/scanners');
const { suggestSkills } = require('./lib/suggest');
const { computeScore, generateReport } = require('./lib/report');

const VERSION = '3.2.1';
const GITHUB_REPO = 'pauldatta/gemini-cli-scanner';
const SKIP_DIRS = new Set(['node_modules', '.git', 'vendor', '__pycache__', 'dist', 'build', '.next', '.venv', 'venv', '.cache', '.npm', '.yarn', 'coverage', '.terraform']);

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
          if (latest && latest !== VERSION) {
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
  const jp = path.join(outdir, 'gemini-env-manifest.json');
  fs.writeFileSync(jp, JSON.stringify(m, null, 2));
  console.log(`\n✅ JSON manifest: ${jp}`);

  if (!values['json-only']) {
    const mp = path.join(outdir, 'gemini-env-report.md');
    fs.writeFileSync(mp, generateReport(m));
    console.log(`✅ Markdown report: ${mp}`);
  }

  console.log(`\n📊 Score: ${m.sophistication_score.total}/${m.sophistication_score.max}`);
}

main().catch(e => { console.error('Fatal error:', e.message); process.exit(1); });
