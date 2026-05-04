'use strict';

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  extractSummary,
  parseReporterLabel,
  syncFromSource,
  createEmptyState,
  aggregateTeam,
  crossRefSkills,
  crossRefMcpServers,
  aggregatePolicyCompliance,
  aggregateToolChains,
  proposeStandardization,
  buildScorecards,
  assembleToolkit,
} = require('../lib/dashboard/aggregator');

// ─── Test Fixtures ───────────────────────────────────────────────────

function makeMockManifest(overrides = {}) {
  return {
    scanner_version: '3.5.0',
    scan_timestamp: '2026-05-04T03:17:56Z',
    sophistication_score: { total: 90, max: 115 },
    advisory: {
      maturity: { label: 'Advanced', emoji: '🔵', score: 90, max: 115 },
      summary: { critical: 0, warning: 2, info: 10, total: 12 },
    },
    settings: { mcp_servers: { github: {}, 'brave-search': {} } },
    _raw_settings: { security: { disableYoloMode: true } },
    skills: [
      { name: 'deploy-workflow', source: 'global', origin: 'auto-extracted' },
      { name: 'code-review', source: 'global', origin: 'user-created' },
    ],
    policies: {
      parsed_rules: [
        { decision: 'deny', commandPrefix: 'rm -rf', modes: ['yolo'] },
      ],
    },
    conversations: {
      tool_chains: [
        { chain: ['read_file', 'edit_file', 'run_shell'] },
        { chain: ['run_shell', 'read_file', 'run_shell'] },
      ],
    },
    repos: [{ path: '/a' }, { path: '/b' }],
    memory_tiers: { summary: { tiers_in_use: 2 } },
    ...overrides,
  };
}

// ─── parseReporterLabel ──────────────────────────────────────────────

describe('parseReporterLabel', () => {
  it('strips trailing date', () => {
    assert.equal(parseReporterLabel('paul-datta-2026-05-04.json'), 'paul-datta');
  });
  it('handles no date', () => {
    assert.equal(parseReporterLabel('alice.json'), 'alice');
  });
  it('handles date-only filename', () => {
    assert.equal(parseReporterLabel('2026-05-04.json'), '2026-05-04');
  });
  it('handles compact date', () => {
    assert.equal(parseReporterLabel('bob-20260504.json'), 'bob');
  });
});

// ─── extractSummary ──────────────────────────────────────────────────

describe('extractSummary', () => {
  it('produces correct shape', () => {
    const s = extractSummary(makeMockManifest(), 'paul-2026-05-04.json');
    assert.equal(s.reporter_label, 'paul');
    assert.equal(s.scanner_version, '3.5.0');
    assert.equal(s.score.total, 90);
    assert.equal(s.skills_count, 2);
    assert.equal(s.mcp_count, 2);
    assert.equal(s.yolo_disabled, true);
    assert.equal(s.tool_chains.length, 2);
    assert.ok(s.report_id);
  });

  it('handles empty manifest gracefully', () => {
    const s = extractSummary({}, 'empty.json');
    assert.equal(s.skills_count, 0);
    assert.equal(s.mcp_count, 0);
    assert.equal(s.policy_count, 0);
  });
});

// ─── syncFromSource ──────────────────────────────────────────────────

describe('syncFromSource', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-test-'));
  });

  it('reads manifests from folder', () => {
    fs.writeFileSync(path.join(tmpDir, 'paul-2026-05-04.json'), JSON.stringify(makeMockManifest()));
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    assert.equal(Object.keys(state.reporters).length, 1);
    assert.ok(state.reporters['paul']);
    assert.equal(state.reporters['paul'].scans.length, 1);
  });

  it('deduplicates by report_id', () => {
    const m = makeMockManifest();
    fs.writeFileSync(path.join(tmpDir, 'paul-a.json'), JSON.stringify(m));
    fs.writeFileSync(path.join(tmpDir, 'paul-b.json'), JSON.stringify(m)); // same content = same hash
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    assert.equal(state.known_report_ids.length, 1);
  });

  it('handles empty folder', () => {
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    assert.equal(Object.keys(state.reporters).length, 0);
  });

  it('skips team-state.json', () => {
    fs.writeFileSync(path.join(tmpDir, 'team-state.json'), '{}');
    fs.writeFileSync(path.join(tmpDir, 'paul.json'), JSON.stringify(makeMockManifest()));
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    assert.equal(Object.keys(state.reporters).length, 1);
  });

  it('skips non-manifest JSON', () => {
    fs.writeFileSync(path.join(tmpDir, 'random.json'), '{"foo": "bar"}');
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    assert.equal(Object.keys(state.reporters).length, 0);
  });
});

// ─── crossRefSkills ──────────────────────────────────────────────────

describe('crossRefSkills', () => {
  it('identifies shared skills', () => {
    const scans = [
      { label: 'paul', scan: { skills: [{ name: 'deploy' }, { name: 'review' }] } },
      { label: 'alice', scan: { skills: [{ name: 'deploy' }, { name: 'test' }] } },
      { label: 'bob', scan: { skills: [{ name: 'deploy' }] } },
    ];
    const result = crossRefSkills(scans);
    const deploy = result.find(s => s.name === 'deploy');
    assert.equal(deploy.count, 3);
    assert.ok(deploy.adoption > 0.9);
  });
});

// ─── crossRefMcpServers ──────────────────────────────────────────────

describe('crossRefMcpServers', () => {
  it('marks universal servers', () => {
    const scans = [
      { label: 'a', scan: { mcp_servers: ['github', 'slack'] } },
      { label: 'b', scan: { mcp_servers: ['github'] } },
    ];
    const result = crossRefMcpServers(scans);
    const gh = result.find(s => s.name === 'github');
    assert.equal(gh.status, 'universal');
    const sl = result.find(s => s.name === 'slack');
    assert.equal(sl.status, 'emerging');
  });
});

// ─── aggregatePolicyCompliance ───────────────────────────────────────

describe('aggregatePolicyCompliance', () => {
  it('detects YOLO gaps', () => {
    const scans = [
      { label: 'a', scan: { yolo_disabled: false, policy_count: 0, policy_has_deny_rm: false, policy_has_modes: false } },
      { label: 'b', scan: { yolo_disabled: true, policy_count: 2, policy_has_deny_rm: true, policy_has_modes: true } },
    ];
    const gaps = aggregatePolicyCompliance(scans);
    assert.deepEqual(gaps.yolo_unprotected, ['a']);
    assert.deepEqual(gaps.no_policies, ['a']);
  });
});

// ─── buildScorecards ─────────────────────────────────────────────────

describe('buildScorecards', () => {
  it('computes trend from history', () => {
    const scans = [{
      label: 'paul',
      scan: { score: { total: 100, max: 115 }, maturity: { label: 'Expert' }, skills_count: 5, mcp_count: 3, policy_count: 2, repos_count: 10, timestamp: new Date().toISOString() },
      history: [
        { score: { total: 100 }, timestamp: new Date().toISOString() },
        { score: { total: 80 }, timestamp: new Date(Date.now() - 86400000).toISOString() },
      ],
    }];
    const cards = buildScorecards(scans);
    assert.equal(cards[0].trend, '↑');
    assert.equal(cards[0].score_delta, 20);
  });
});

// ─── proposeStandardization ──────────────────────────────────────────

describe('proposeStandardization', () => {
  it('respects thresholds', () => {
    const scans = [
      { label: 'a', scan: { skills: [{ name: 'deploy' }], mcp_servers: ['github'], tool_chains: ['read→edit→shell'], yolo_disabled: true, policy_count: 1, policy_has_deny_rm: true, policy_has_modes: true } },
      { label: 'b', scan: { skills: [{ name: 'deploy' }], mcp_servers: ['github'], tool_chains: ['read→edit→shell'], yolo_disabled: true, policy_count: 1, policy_has_deny_rm: true, policy_has_modes: true } },
      { label: 'c', scan: { skills: [], mcp_servers: ['github'], tool_chains: [], yolo_disabled: false, policy_count: 0, policy_has_deny_rm: false, policy_has_modes: false } },
      { label: 'd', scan: { skills: [], mcp_servers: [], tool_chains: [], yolo_disabled: true, policy_count: 0, policy_has_deny_rm: false, policy_has_modes: false } },
    ];
    const config = { skill_promote_threshold: 0.5, mcp_baseline_threshold: 0.75 };
    const result = proposeStandardization(scans, config);
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].name, 'deploy');
    assert.equal(result.mcp_servers.length, 1);
    assert.equal(result.mcp_servers[0].name, 'github');
  });
});

// ─── assembleToolkit ─────────────────────────────────────────────────

describe('assembleToolkit', () => {
  it('generates markdown from selections', () => {
    const std = {
      all_skills: [{ name: 'deploy', count: 3, adoption: 0.75, reporters: ['a', 'b', 'c'] }],
      all_mcp_servers: [{ name: 'github', adoption: 1, status: 'universal' }],
    };
    const md = assembleToolkit({ skills: ['deploy'], mcp_servers: ['github'] }, std);
    assert.ok(md.includes('deploy'));
    assert.ok(md.includes('github'));
    assert.ok(md.includes('Engineering Toolkit'));
  });
});
