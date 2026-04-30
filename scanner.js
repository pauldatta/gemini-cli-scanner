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
const { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanClaude, scanConversations, scanProjectGeminiMds, scanRepos } = require('./lib/scanners');
const { suggestSkills } = require('./lib/suggest');
const { computeScore, generateReport } = require('./lib/report');

const VERSION = '3.0.0';
const GITHUB_REPO = 'pauldatta/gemini-cli-scanner';

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
            console.log(`   Run: gemini extensions update gemini-cli-scanner\n`);
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
    },
    allowPositionals: true,
    strict: false,
  });

  if (values.version) { console.log(`gemini-cli-scanner v${VERSION}`); process.exit(0); }

  const gdir = values['gemini-dir'];
  const home = values['home-dir'];
  const outdir = values['output-dir'];
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
  console.log('  → Conversations...');             m.conversations = scanConversations(gdir);
  console.log('  → Project GEMINI.md files...');   m.project_gemini_mds = scanProjectGeminiMds(gdir);

  if (repoPaths.length) {
    console.log(`  → Scanning ${repoPaths.length} code repos...`);
    m.repos = scanRepos(repoPaths);
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
