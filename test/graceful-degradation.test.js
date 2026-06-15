/** Tests for graceful degradation when ~/.gemini is missing, and dashboard CLI detection */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { computeScore, generateReport } = require('../lib/report');
const {
  extractSummary,
  crossRefToolEcosystem,
  aggregateTeam,
  createEmptyState,
  syncFromSource,
} = require('../lib/dashboard/aggregator');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Manifest Fixtures ──────────────────────────────────────────────

/** Manifest shape produced when ~/.gemini is missing */
const MISSING_GEMINI_MANIFEST = {
  scan_timestamp: '2026-05-08T03:00:00Z',
  gemini_dir: '/home/user/.gemini',
  scanner_version: '3.5.6',
  gemini_cli_installed: false,
  settings: { found: false },
  global_gemini_md: { found: false },
  skills: [],
  agents: [],
  extensions: { found: false, extensions: [] },
  policies: { found: false },
  claude: { found: true, skills: [{ name: 'review', source: 'claude' }] },
  conversations: { found: false },
  project_gemini_mds: [],
  antigravity: { found: false },
  continue_dev: { found: false },
  windsurf: { found: false },
  jetbrains: { found: false },
  opencode: { found: false },
  memory_tiers: null,
  skill_extraction: null,
  admin_policies: { found: false },
  repos: [],
  sophistication_score: { total: 0, max: 67, breakdown: {} },
  suggested_skills: [],
};

/** Manifest shape when Gemini CLI IS installed */
const INSTALLED_GEMINI_MANIFEST = {
  scan_timestamp: '2026-05-08T04:00:00Z',
  gemini_dir: '/home/user/.gemini',
  scanner_version: '3.5.6',
  gemini_cli_installed: true,
  settings: { found: true, mcp_servers: { github: {} } },
  global_gemini_md: { found: true, word_count: 200, sections: ['Rules'] },
  skills: [{ name: 'deploy', source: 'gemini' }],
  agents: [],
  extensions: { found: true, extensions: ['scanner'] },
  policies: { found: true, parsed_rules: [{ decision: 'deny', commandPrefix: 'rm -rf', modes: ['yolo'] }] },
  claude: { found: true, skills: [{ name: 'review', source: 'claude' }] },
  conversations: { found: true, total_sessions: 10, tool_usage_top_20: { read_file: 50 } },
  project_gemini_mds: [],
  antigravity: { found: true, skills: [{ name: 'stop-slop', source: 'antigravity' }] },
  continue_dev: { found: false },
  windsurf: { found: true, skills: [] },
  jetbrains: { found: false },
  opencode: { found: false },
  memory_tiers: { summary: { tiers_in_use: 2 } },
  skill_extraction: null,
  admin_policies: { found: false },
  repos: [],
  sophistication_score: { total: 25, max: 67, breakdown: { mcp_servers: 5 } },
  suggested_skills: [],
};

// ─── computeScore with missing Gemini CLI ────────────────────────────

describe('computeScore with missing Gemini CLI', () => {
  it('returns valid score for missing-gemini manifest', () => {
    const score = computeScore(MISSING_GEMINI_MANIFEST);
    assert.equal(typeof score.total, 'number');
    assert.equal(score.max, 67);
    assert.ok(score.total >= 0);
  });

  it('still awards claude_skills when Gemini CLI missing', () => {
    const score = computeScore(MISSING_GEMINI_MANIFEST);
    assert.equal(score.breakdown.claude_skills, 1);
  });
});

// ─── generateReport with missing Gemini CLI ──────────────────────────

describe('generateReport with missing Gemini CLI', () => {
  it('includes warning banner when gemini_cli_installed is false', () => {
    const m = { ...MISSING_GEMINI_MANIFEST, sophistication_score: computeScore(MISSING_GEMINI_MANIFEST) };
    const report = generateReport(m);
    assert.ok(report.includes('Gemini CLI is not installed'));
    assert.ok(report.includes('google-gemini/gemini-cli'));
    assert.ok(report.includes('partial results'));
  });

  it('does not include banner when gemini_cli_installed is true', () => {
    const m = { ...INSTALLED_GEMINI_MANIFEST, sophistication_score: computeScore(INSTALLED_GEMINI_MANIFEST) };
    const report = generateReport(m);
    assert.ok(!report.includes('Gemini CLI is not installed'));
  });

  it('shows ❌ in ecosystem table when Gemini CLI missing', () => {
    const m = {
      ...MISSING_GEMINI_MANIFEST,
      sophistication_score: computeScore(MISSING_GEMINI_MANIFEST),
    };
    const report = generateReport(m);
    assert.ok(report.includes('❌ Not installed'));
  });

  it('shows ✅ in ecosystem table when Gemini CLI present', () => {
    const m = {
      ...INSTALLED_GEMINI_MANIFEST,
      sophistication_score: computeScore(INSTALLED_GEMINI_MANIFEST),
    };
    const report = generateReport(m);
    assert.ok(report.includes('✅ Installed'));
    assert.ok(!report.includes('❌ Not installed'));
  });

  it('produces valid markdown header even when Gemini CLI missing', () => {
    const m = { ...MISSING_GEMINI_MANIFEST, sophistication_score: computeScore(MISSING_GEMINI_MANIFEST) };
    const report = generateReport(m);
    assert.ok(report.startsWith('# AI Coding Environment Scan Report'));
  });
});

// ─── extractSummary: detected_tools and gemini_cli_installed ─────────

describe('extractSummary detected_tools', () => {
  it('detects Gemini CLI when installed', () => {
    const s = extractSummary(INSTALLED_GEMINI_MANIFEST, 'alice-2026-05-08.json');
    assert.equal(s.gemini_cli_installed, true);
    assert.ok(s.detected_tools.includes('Gemini CLI'));
  });

  it('excludes Gemini CLI when not installed', () => {
    const s = extractSummary(MISSING_GEMINI_MANIFEST, 'bob-2026-05-08.json');
    assert.equal(s.gemini_cli_installed, false);
    assert.ok(!s.detected_tools.includes('Gemini CLI'));
  });

  it('detects Claude Code when found', () => {
    const s = extractSummary(MISSING_GEMINI_MANIFEST, 'bob-2026-05-08.json');
    assert.ok(s.detected_tools.includes('Claude Code'));
  });

  it('detects Antigravity and Windsurf from installed manifest', () => {
    const s = extractSummary(INSTALLED_GEMINI_MANIFEST, 'alice-2026-05-08.json');
    assert.ok(s.detected_tools.includes('Antigravity'));
    assert.ok(s.detected_tools.includes('Windsurf'));
  });

  it('excludes tools that are not found', () => {
    const s = extractSummary(INSTALLED_GEMINI_MANIFEST, 'alice-2026-05-08.json');
    assert.ok(!s.detected_tools.includes('Continue'));
    assert.ok(!s.detected_tools.includes('JetBrains AI'));
    assert.ok(!s.detected_tools.includes('OpenCode'));
  });

  it('returns empty detected_tools for bare manifest', () => {
    const s = extractSummary({}, 'empty.json');
    assert.deepEqual(s.detected_tools, []);
  });
});

// ─── crossRefToolEcosystem ───────────────────────────────────────────

describe('crossRefToolEcosystem', () => {
  it('aggregates tools across reporters', () => {
    const scans = [
      { label: 'alice', scan: { detected_tools: ['Gemini CLI', 'Claude Code', 'Windsurf'] } },
      { label: 'bob', scan: { detected_tools: ['Gemini CLI', 'Claude Code'] } },
      { label: 'carol', scan: { detected_tools: ['Claude Code', 'OpenCode'] } },
    ];
    const result = crossRefToolEcosystem(scans);
    const claude = result.find(t => t.name === 'Claude Code');
    assert.equal(claude.count, 3);
    assert.equal(claude.adoption, 1);
    assert.deepEqual(claude.reporters.sort(), ['alice', 'bob', 'carol']);

    const gemini = result.find(t => t.name === 'Gemini CLI');
    assert.equal(gemini.count, 2);

    const opencode = result.find(t => t.name === 'OpenCode');
    assert.equal(opencode.count, 1);
    assert.deepEqual(opencode.reporters, ['carol']);
  });

  it('filters out tools with zero reporters', () => {
    const scans = [
      { label: 'alice', scan: { detected_tools: ['Gemini CLI'] } },
    ];
    const result = crossRefToolEcosystem(scans);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'Gemini CLI');
  });

  it('handles empty scans', () => {
    const result = crossRefToolEcosystem([]);
    assert.deepEqual(result, []);
  });

  it('handles scans with no detected_tools field', () => {
    const scans = [
      { label: 'alice', scan: {} },
      { label: 'bob', scan: { detected_tools: ['Gemini CLI'] } },
    ];
    const result = crossRefToolEcosystem(scans);
    assert.equal(result.length, 1);
    assert.equal(result[0].count, 1);
  });
});

// ─── aggregateTeam includes tool_ecosystem ───────────────────────────

describe('aggregateTeam tool_ecosystem', () => {
  it('includes tool_ecosystem in dashboard output', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'graceful-test-'));
    fs.writeFileSync(
      path.join(tmpDir, 'alice.json'),
      JSON.stringify(INSTALLED_GEMINI_MANIFEST),
    );
    fs.writeFileSync(
      path.join(tmpDir, 'bob.json'),
      JSON.stringify(MISSING_GEMINI_MANIFEST),
    );
    const state = syncFromSource(tmpDir, createEmptyState(tmpDir));
    const dashboard = aggregateTeam(state);
    assert.ok(dashboard.tool_ecosystem);
    assert.ok(Array.isArray(dashboard.tool_ecosystem));
    // Claude Code is in both manifests
    const claude = dashboard.tool_ecosystem.find(t => t.name === 'Claude Code');
    assert.ok(claude);
    assert.equal(claude.count, 2);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
