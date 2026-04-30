/** Tests for lib/report.js — scoring and markdown generation */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeScore, generateReport } = require('../lib/report');

const MINIMAL_MANIFEST = {
  scan_timestamp: '2026-04-30T12:00:00Z',
  scanner_version: '3.0.0',
  settings: { found: true, mcp_servers: {} },
  global_gemini_md: { found: false },
  skills: [],
  agents: [],
  extensions: { found: false, extensions: [] },
  policies: { found: false },
  claude: { found: false },
  conversations: { found: false },
  project_gemini_mds: [],
  repos: [],
  sophistication_score: { total: 0, max: 105, breakdown: {} },
  suggested_skills: [],
};

describe('computeScore', () => {
  it('returns zero for empty manifest', () => {
    const score = computeScore(MINIMAL_MANIFEST);
    assert.equal(score.total, 0);
    assert.equal(score.max, 105);
  });

  it('scores MCP servers (5 pts each, max 20)', () => {
    const m = { ...MINIMAL_MANIFEST, settings: { mcp_servers: { a: {}, b: {}, c: {} } } };
    const score = computeScore(m);
    assert.equal(score.breakdown.mcp_servers, 15);
  });

  it('caps MCP servers at 20', () => {
    const servers = {};
    for (let i = 0; i < 10; i++) servers[`s${i}`] = {};
    const m = { ...MINIMAL_MANIFEST, settings: { mcp_servers: servers } };
    const score = computeScore(m);
    assert.equal(score.breakdown.mcp_servers, 20);
  });

  it('scores skills (3 pts each, max 15)', () => {
    const m = { ...MINIMAL_MANIFEST, skills: [{ name: 'a' }, { name: 'b' }] };
    const score = computeScore(m);
    assert.equal(score.breakdown.skills, 6);
  });

  it('scores policies (flat 5 pts)', () => {
    const m = { ...MINIMAL_MANIFEST, policies: { found: true } };
    const score = computeScore(m);
    assert.equal(score.breakdown.policies, 5);
  });

  it('scores tool diversity (2 pts each, max 15)', () => {
    const tools = {};
    for (let i = 0; i < 8; i++) tools[`tool_${i}`] = i + 1;
    const m = { ...MINIMAL_MANIFEST, conversations: { tool_usage_top_20: tools } };
    const score = computeScore(m);
    assert.equal(score.breakdown.tool_diversity, 15);
  });

  it('scores claude skills (1 pt each, max 5)', () => {
    const m = { ...MINIMAL_MANIFEST, claude: { found: true, skills: [{ name: 'a' }, { name: 'b' }, { name: 'c' }] } };
    const score = computeScore(m);
    assert.equal(score.breakdown.claude_skills, 3);
  });
});

describe('generateReport', () => {
  it('produces valid markdown with header', () => {
    const m = { ...MINIMAL_MANIFEST, sophistication_score: computeScore(MINIMAL_MANIFEST) };
    const report = generateReport(m);
    assert.ok(report.startsWith('# Gemini CLI Environment Scan Report'));
    assert.ok(report.includes('Sophistication Score: 0/105'));
  });

  it('includes MCP servers section', () => {
    const m = {
      ...MINIMAL_MANIFEST,
      settings: { mcp_servers: { 'chrome-devtools': { command: 'npx' } } },
      sophistication_score: { total: 5, max: 105, breakdown: { mcp_servers: 5 } },
    };
    const report = generateReport(m);
    assert.ok(report.includes('## MCP Servers (1)'));
    assert.ok(report.includes('**chrome-devtools**'));
  });

  it('includes suggested skills when present', () => {
    const m = {
      ...MINIMAL_MANIFEST,
      sophistication_score: { total: 0, max: 105, breakdown: {} },
      suggested_skills: [{ name: 'test-skill', description: 'A test', rationale: 'Because', skill_template: '---\nname: test\n---' }],
    };
    const report = generateReport(m);
    assert.ok(report.includes('Suggested Skills (1)'));
    assert.ok(report.includes('`test-skill`'));
  });

  it('includes repo section when repos scanned', () => {
    const m = {
      ...MINIMAL_MANIFEST,
      sophistication_score: { total: 0, max: 105, breakdown: {} },
      repos: [{ name: 'my-app', path: '/code/my-app', gemini_md: { word_count: 50, sections: ['Rules'] } }],
    };
    const report = generateReport(m);
    assert.ok(report.includes('Code Repositories (1)'));
    assert.ok(report.includes('my-app'));
  });

  it('includes conversation intelligence when present', () => {
    const m = {
      ...MINIMAL_MANIFEST,
      sophistication_score: { total: 0, max: 105, breakdown: {} },
      conversations: {
        found: true, total_sessions: 42,
        timespan: { earliest: '2026-01-01T00:00:00Z', latest: '2026-04-30T00:00:00Z' },
        total_tokens: { input: 1000, output: 2000, cached: 500, thoughts: 100 },
        tool_usage_top_20: { read_file: 150, edit_file: 80 },
        models_used: { 'gemini-2.5-pro': 200 },
      },
    };
    const report = generateReport(m);
    assert.ok(report.includes('Conversation Intelligence'));
    assert.ok(report.includes('**Sessions:** 42'));
    assert.ok(report.includes('`read_file`'));
  });
});
