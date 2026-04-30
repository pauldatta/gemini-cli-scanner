/** Tests for new features: chat-days filter, repo discovery, model fallback, suggest */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { scanConversations, scanRepos } = require('../lib/scanners');

let tmpDir;

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJSON(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj)); }
function writeFile(p, txt) { mkdirp(path.dirname(p)); fs.writeFileSync(p, txt); }

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-features-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── Chat Days Filter ────────────────────────────────────────────────

describe('scanConversations chat-days filter', () => {
  let gdir;

  before(() => {
    gdir = path.join(tmpDir, 'chatdays-test');
    const chatDir = path.join(gdir, 'tmp', 'proj-a', 'chats');
    const now = new Date();
    const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

    const lines = [
      // 2 days ago — should always be included
      JSON.stringify({ type: 'gemini', model: 'gemini-3-flash-preview', toolCalls: [{ name: 'recent_tool' }], tokens: { input: 10, output: 20, cached: 0, thoughts: 0 }, timestamp: daysAgo(2) }),
      // 10 days ago — excluded by 7-day filter, included by 30-day or no filter
      JSON.stringify({ type: 'gemini', model: 'gemini-3-flash-preview', toolCalls: [{ name: 'older_tool' }], tokens: { input: 30, output: 40, cached: 0, thoughts: 0 }, timestamp: daysAgo(10) }),
      // 60 days ago — excluded by 7 or 30-day filter, included by no filter
      JSON.stringify({ type: 'gemini', model: 'gemini-3-flash-preview', toolCalls: [{ name: 'ancient_tool' }], tokens: { input: 50, output: 60, cached: 0, thoughts: 0 }, timestamp: daysAgo(60) }),
    ];
    writeFile(path.join(chatDir, 'session-001.jsonl'), lines.join('\n'));
  });

  it('returns all entries when chatDays is null (default)', () => {
    const result = scanConversations(gdir, {});
    assert.equal(result.found, true);
    assert.equal(result.tool_usage_top_20.recent_tool, 1);
    assert.equal(result.tool_usage_top_20.older_tool, 1);
    assert.equal(result.tool_usage_top_20.ancient_tool, 1);
    assert.equal(result.total_tokens.input, 90);
    assert.equal(result.chat_days_filter, null);
  });

  it('filters to last 7 days when chatDays=7', () => {
    const result = scanConversations(gdir, { chatDays: 7 });
    assert.equal(result.found, true);
    assert.equal(result.tool_usage_top_20.recent_tool, 1);
    assert.equal(result.tool_usage_top_20.older_tool, undefined);
    assert.equal(result.tool_usage_top_20.ancient_tool, undefined);
    assert.equal(result.total_tokens.input, 10);
    assert.equal(result.chat_days_filter, 7);
  });

  it('filters to last 30 days when chatDays=30', () => {
    const result = scanConversations(gdir, { chatDays: 30 });
    assert.equal(result.found, true);
    assert.equal(result.tool_usage_top_20.recent_tool, 1);
    assert.equal(result.tool_usage_top_20.older_tool, 1);
    assert.equal(result.tool_usage_top_20.ancient_tool, undefined);
    assert.equal(result.total_tokens.input, 40); // 10 + 30
    assert.equal(result.chat_days_filter, 30);
  });

  it('adjusts timespan to filtered range', () => {
    const resultAll = scanConversations(gdir, {});
    const result7 = scanConversations(gdir, { chatDays: 7 });
    // All history has earlier earliest than 7-day filter
    assert.ok(resultAll.timespan.earliest < result7.timespan.earliest);
  });
});

// ─── Repo Discovery ──────────────────────────────────────────────────

describe('discoverRepos (via scanner.js)', () => {
  // We test the discovery logic by importing it from scanner.js
  // Since discoverRepos is not exported, we test scanRepos with directory structure
  let repoRoot;

  before(() => {
    repoRoot = path.join(tmpDir, 'code-root');

    // Level 1: direct repo
    mkdirp(path.join(repoRoot, 'project-a', '.git'));
    writeFile(path.join(repoRoot, 'project-a', 'GEMINI.md'), '# Project A Rules');

    // Level 2: org/repo
    mkdirp(path.join(repoRoot, 'org', 'project-b', '.git'));
    writeFile(path.join(repoRoot, 'org', 'project-b', 'GEMINI.md'), '# Project B Rules');

    // Level 3: org/team/repo
    mkdirp(path.join(repoRoot, 'org', 'team', 'project-c', '.git'));

    // Not a repo (no .git)
    mkdirp(path.join(repoRoot, 'random-folder'));
    writeFile(path.join(repoRoot, 'random-folder', 'readme.txt'), 'Not a repo');

    // Noise dirs that should be skipped
    mkdirp(path.join(repoRoot, 'project-a', 'node_modules', 'dep', '.git'));
    mkdirp(path.join(repoRoot, 'project-a', '.venv', 'lib', '.git'));
  });

  it('scanRepos reads a direct repo path correctly', () => {
    const result = scanRepos([path.join(repoRoot, 'project-a')]);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'project-a');
    assert.ok(result[0].gemini_md);
    assert.equal(result[0].gemini_md.word_count, 4);
  });

  it('scanRepos handles non-existent path gracefully', () => {
    const result = scanRepos([path.join(repoRoot, 'does-not-exist')]);
    assert.equal(result.length, 0);
  });

  it('scanRepos reads repo gemini config', () => {
    const repoPath = path.join(repoRoot, 'org', 'project-b');
    mkdirp(path.join(repoPath, '.gemini', 'skills', 'test-skill'));
    writeFile(path.join(repoPath, '.gemini', 'skills', 'test-skill', 'SKILL.md'),
      '---\nname: test-skill\ndescription: A test skill\n---\n# Steps\nDo things.');
    const result = scanRepos([repoPath]);
    assert.equal(result.length, 1);
    assert.ok(result[0].gemini_config);
    assert.equal(result[0].gemini_config.skills.length, 1);
    assert.equal(result[0].gemini_config.skills[0].name, 'test-skill');
  });
});

// ─── Suggest Module ──────────────────────────────────────────────────

describe('suggest module', () => {
  // We can't test the actual API without credentials, but we test the helpers
  const suggestPath = '../lib/suggest';

  it('exports suggestSkills function', () => {
    const mod = require(suggestPath);
    assert.equal(typeof mod.suggestSkills, 'function');
  });

  it('returns empty array when no credentials are set', async () => {
    // Save and clear env
    const savedKey = process.env.GOOGLE_API_KEY;
    const savedGemini = process.env.GEMINI_API_KEY;
    const savedProject = process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.GOOGLE_CLOUD_PROJECT;

    const { suggestSkills } = require(suggestPath);
    const result = await suggestSkills({ conversations: {}, skills: [] }, {});
    assert.deepEqual(result, []);

    // Restore env
    if (savedKey) process.env.GOOGLE_API_KEY = savedKey;
    if (savedGemini) process.env.GEMINI_API_KEY = savedGemini;
    if (savedProject) process.env.GOOGLE_CLOUD_PROJECT = savedProject;
  });
});

// ─── CLI Flag Parsing ────────────────────────────────────────────────

describe('CLI flag parsing', () => {
  const { parseArgs } = require('node:util');

  // Mirror the option spec from scanner.js
  const optionSpec = {
    'version':            { type: 'boolean', short: 'v' },
    'gemini-dir':         { type: 'string', default: '/default/.gemini' },
    'home-dir':           { type: 'string', default: '/default/home' },
    'output-dir':         { type: 'string', default: './scan-results' },
    'skip-suggestions':   { type: 'boolean', default: false },
    'json-only':          { type: 'boolean', default: false },
    'skip-update-check':  { type: 'boolean', default: false },
    'repos':              { type: 'string', multiple: true, default: [] },
    'chat-days':          { type: 'string', default: '' },
    'repo-depth':         { type: 'string', default: '3' },
  };

  function parse(args) {
    return parseArgs({ options: optionSpec, args, allowPositionals: true, strict: false });
  }

  it('parses --chat-days flag', () => {
    const { values } = parse(['--chat-days', '30']);
    assert.equal(values['chat-days'], '30');
  });

  it('chat-days defaults to empty string (all history)', () => {
    const { values } = parse([]);
    assert.equal(values['chat-days'], '');
  });

  it('parses --repo-depth flag', () => {
    const { values } = parse(['--repo-depth', '4']);
    assert.equal(values['repo-depth'], '4');
  });

  it('repo-depth defaults to 3', () => {
    const { values } = parse([]);
    assert.equal(values['repo-depth'], '3');
  });

  it('parses multiple --repos flags', () => {
    const { values } = parse(['--repos', '~/Code', '--repos', '~/Work']);
    assert.deepEqual(values.repos, ['~/Code', '~/Work']);
  });

  it('combines --repos with positional args', () => {
    const { values, positionals } = parse(['--repos', '~/Code', '~/extra-repo']);
    assert.deepEqual(values.repos, ['~/Code']);
    assert.deepEqual(positionals, ['~/extra-repo']);
  });

  it('parses --skip-suggestions correctly', () => {
    const { values } = parse(['--skip-suggestions']);
    assert.equal(values['skip-suggestions'], true);
  });

  it('parses combined flags', () => {
    const { values } = parse(['--chat-days', '7', '--repos', '~/Code', '--repo-depth', '2', '--skip-suggestions']);
    assert.equal(values['chat-days'], '7');
    assert.deepEqual(values.repos, ['~/Code']);
    assert.equal(values['repo-depth'], '2');
    assert.equal(values['skip-suggestions'], true);
  });
});

// ─── Model Chain Config ──────────────────────────────────────────────

describe('Model chain configuration', () => {
  it('suggest.js uses gemini-3 series models only (two-stage pipeline)', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'suggest.js'), 'utf8');

    // Stage 1: IDENTIFIER_MODELS (flash-lite, cheap)
    const idMatch = src.match(/IDENTIFIER_MODELS\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(idMatch, 'IDENTIFIER_MODELS should be defined');
    assert.ok(!idMatch[1].includes('gemini-2.'), 'Identifier models should not include gemini-2.x');
    assert.ok(!idMatch[1].includes('gemini-1.5'), 'Identifier models should not include gemini-1.5');
    assert.ok(idMatch[1].includes('gemini-3'), 'Identifier models should include gemini-3 series');

    // Stage 2: WRITER_MODELS (pro, heavy reasoning)
    const wrMatch = src.match(/WRITER_MODELS\s*=\s*\[([\s\S]*?)\]/);
    assert.ok(wrMatch, 'WRITER_MODELS should be defined');
    assert.ok(!wrMatch[1].includes('gemini-2.'), 'Writer models should not include gemini-2.x');
    assert.ok(!wrMatch[1].includes('gemini-1.5'), 'Writer models should not include gemini-1.5');
    assert.ok(wrMatch[1].includes('gemini-3'), 'Writer models should include gemini-3 series');
    assert.ok(wrMatch[1].includes('pro'), 'Writer models should prefer pro for quality');
  });

  it('suggest.js uses global location for Vertex AI', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'suggest.js'), 'utf8');
    assert.ok(src.includes("location: 'global'"), 'Should use global location');
    assert.ok(!src.includes("location: 'us-central1'"), 'Should NOT use us-central1');
  });
});
