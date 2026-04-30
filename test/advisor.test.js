'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { runAdvisory, computeMaturity, MATURITY_TIERS } = require('../lib/advisor');

// ─── Test Fixtures ───────────────────────────────────────────────────

function baseManifest(overrides = {}) {
  return {
    settings: { found: true, mcp_servers: {}, model: {}, _raw: {} },
    _raw_settings: {},
    global_gemini_md: { found: true, word_count: 200, sections: ['Coding Style', 'Testing'] },
    skills: [],
    agents: [],
    extensions: { found: false },
    policies: { found: true, files: { 'safety.toml': '[[rule]]\ntoolName = "ShellTool"\ndecision = "deny"\ncommandPrefix = "rm -rf"' }, parsed_rules: [{ toolName: 'ShellTool', decision: 'deny', commandPrefix: 'rm -rf', filename: 'safety.toml' }] },
    conversations: { found: true },
    repos: [],
    ...overrides,
  };
}

// ─── Maturity Rating ─────────────────────────────────────────────────

describe('computeMaturity', () => {
  it('returns Expert for 0 recommendations', () => {
    const m = computeMaturity([]);
    assert.equal(m.label, 'Expert');
    assert.equal(m.score, 100);
  });

  it('deducts correctly by severity', () => {
    const recs = [
      { severity: 'critical' }, // -10
      { severity: 'warning' },  // -5
      { severity: 'info' },     // -1
    ];
    const m = computeMaturity(recs);
    assert.equal(m.score, 84);
    assert.equal(m.label, 'Advanced');
  });

  it('clamps at 0', () => {
    const recs = Array.from({ length: 15 }, () => ({ severity: 'critical' }));
    const m = computeMaturity(recs);
    assert.equal(m.score, 0);
    assert.equal(m.label, 'Getting Started');
  });
});

// ─── Policy Hygiene ──────────────────────────────────────────────────

describe('advisor: policy hygiene', () => {
  it('warns when no policies found', () => {
    const m = baseManifest({ policies: { found: false } });
    const result = runAdvisory(m);
    const policyRecs = result.recommendations.filter(r => r.category === 'policy_hygiene');
    assert.ok(policyRecs.some(r => r.title.includes('No policy files')));
  });

  it('no warning when policies exist with rm deny', () => {
    const m = baseManifest(); // has rm -rf deny in fixture
    const result = runAdvisory(m);
    const policyRecs = result.recommendations.filter(r => r.category === 'policy_hygiene');
    assert.ok(!policyRecs.some(r => r.title.includes('No policy files')));
    assert.ok(!policyRecs.some(r => r.title.includes('destructive commands')));
  });

  it('flags deprecated tools.exclude', () => {
    const m = baseManifest({ _raw_settings: { tools: { exclude: ['ShellTool(rm)'] } } });
    const result = runAdvisory(m);
    const policyRecs = result.recommendations.filter(r => r.category === 'policy_hygiene');
    assert.ok(policyRecs.some(r => r.title.includes('Deprecated tools.exclude')));
  });
});

// ─── MCP Governance ──────────────────────────────────────────────────

describe('advisor: MCP governance', () => {
  it('warns when no mcp.allowed list', () => {
    const m = baseManifest({
      settings: { found: true, mcp_servers: { 'my-server': { command: 'node server.js' } }, _raw: {} },
      _raw_settings: {},
    });
    const result = runAdvisory(m);
    const mcpRecs = result.recommendations.filter(r => r.category === 'mcp_governance');
    assert.ok(mcpRecs.some(r => r.title.includes('No MCP allowlist')));
  });

  it('flags server not in allowlist', () => {
    const m = baseManifest({
      settings: { found: true, mcp_servers: { 'my-server': { command: 'node' } }, _raw: {} },
      _raw_settings: { mcp: { allowed: ['other-server'] } },
    });
    const result = runAdvisory(m);
    const mcpRecs = result.recommendations.filter(r => r.category === 'mcp_governance');
    assert.ok(mcpRecs.some(r => r.title.includes('not in allowlist')));
  });

  it('detects duplicate MCP servers between global and repo', () => {
    const m = baseManifest({
      settings: { found: true, mcp_servers: { 'corp-api': { command: 'node' } }, _raw: {} },
      repos: [{ name: 'my-repo', gemini_config: { mcp_details: { 'corp-api': { command: 'node' } } } }],
    });
    const result = runAdvisory(m);
    const mcpRecs = result.recommendations.filter(r => r.category === 'mcp_governance');
    assert.ok(mcpRecs.some(r => r.title.includes('Duplicate MCP server')));
  });
});

// ─── GEMINI.md Quality ───────────────────────────────────────────────

describe('advisor: GEMINI.md quality', () => {
  it('warns when global GEMINI.md is missing', () => {
    const m = baseManifest({ global_gemini_md: { found: false } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'gemini_md_quality');
    assert.ok(recs.some(r => r.title.includes('No global GEMINI.md')));
  });

  it('flags thin global GEMINI.md', () => {
    const m = baseManifest({ global_gemini_md: { found: true, word_count: 10, sections: [] } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'gemini_md_quality');
    assert.ok(recs.some(r => r.title.includes('thin')));
  });

  it('does NOT flag adequate global GEMINI.md', () => {
    const m = baseManifest(); // 200 words, has Style + Testing
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'gemini_md_quality');
    assert.ok(!recs.some(r => r.title.includes('thin')));
    assert.ok(!recs.some(r => r.title.includes('missing')));
  });
});

// ─── Skills Optimization ─────────────────────────────────────────────

describe('advisor: skills optimization', () => {
  it('flags skill without description', () => {
    const m = baseManifest({ skills: [{ name: 'test-skill', has_skill_md: true }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'skills_optimization');
    assert.ok(recs.some(r => r.title.includes('no description')));
  });

  it('flags missing Gotchas section', () => {
    const m = baseManifest({ skills: [{ name: 'test-skill', has_skill_md: true, description: 'test', _has_gotchas: false, _has_validation: true }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'skills_optimization');
    assert.ok(recs.some(r => r.title.includes('Gotchas')));
  });

  it('flags missing Validation section', () => {
    const m = baseManifest({ skills: [{ name: 'test-skill', has_skill_md: true, description: 'test', _has_gotchas: true, _has_validation: false }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'skills_optimization');
    assert.ok(recs.some(r => r.title.includes('Validation')));
  });

  it('passes clean skill', () => {
    const m = baseManifest({ skills: [{ name: 'good-skill', has_skill_md: true, description: 'A good skill', _has_gotchas: true, _has_validation: true }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'skills_optimization');
    assert.equal(recs.length, 0);
  });
});

// ─── Settings Optimization ───────────────────────────────────────────

describe('advisor: settings optimization', () => {
  it('recommends disableYoloMode when not set', () => {
    const m = baseManifest({ _raw_settings: {} });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'settings_optimization');
    assert.ok(recs.some(r => r.title.includes('YOLO')));
  });

  it('does not flag when disableYoloMode is true', () => {
    const m = baseManifest({ _raw_settings: { security: { disableYoloMode: true } } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'settings_optimization');
    assert.ok(!recs.some(r => r.title.includes('YOLO')));
  });

  it('flags enablePermanentToolApproval', () => {
    const m = baseManifest({ _raw_settings: { security: { enablePermanentToolApproval: true } } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'settings_optimization');
    assert.ok(recs.some(r => r.title.includes('Permanent tool approval')));
  });
});

// ─── Hooks Utilization ───────────────────────────────────────────────

describe('advisor: hooks utilization', () => {
  it('surfaces educational opportunity when no hooks', () => {
    const m = baseManifest({ _raw_settings: {} });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'hooks_utilization');
    assert.ok(recs.some(r => r.title.includes('unlock automation')));
    assert.ok(recs[0].reference.includes('hooks/index.md'));
  });

  it('flags globally disabled hooks', () => {
    const m = baseManifest({ _raw_settings: { hooks: { BeforeTool: [] }, hooksConfig: { enabled: false } } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'hooks_utilization');
    assert.ok(recs.some(r => r.title.includes('globally disabled')));
  });
});

// ─── Extension Health ────────────────────────────────────────────────

describe('advisor: extension health', () => {
  it('flags disabled extensions', () => {
    const m = baseManifest({ extensions: { found: true, extensions: ['my-ext'], enablement: { 'my-ext': { enabled: false } } } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'extension_health');
    assert.ok(recs.some(r => r.title.includes('installed but disabled')));
  });

  it('flags empty extension directory', () => {
    const m = baseManifest({ extensions: { found: true, extensions: [], enablement: {} } });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'extension_health');
    assert.ok(recs.some(r => r.title.includes('empty')));
  });
});

// ─── Context Architecture ────────────────────────────────────────────

describe('advisor: context architecture', () => {
  it('flags no .geminiignore in repos', () => {
    const m = baseManifest({ repos: [{ name: 'repo-1', _has_geminiignore: false }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'context_architecture');
    assert.ok(recs.some(r => r.title.includes('.geminiignore')));
  });

  it('passes when repos have .geminiignore', () => {
    const m = baseManifest({ repos: [{ name: 'repo-1', _has_geminiignore: true }] });
    const result = runAdvisory(m);
    const recs = result.recommendations.filter(r => r.category === 'context_architecture');
    assert.equal(recs.length, 0);
  });
});

// ─── Integration ─────────────────────────────────────────────────────

describe('advisor: full pipeline', () => {
  it('returns correct structure', () => {
    const result = runAdvisory(baseManifest());
    assert.ok(result.maturity);
    assert.ok(result.summary);
    assert.ok(result.recommendations);
    assert.ok(result.by_category);
    assert.equal(typeof result.maturity.score, 'number');
    assert.equal(typeof result.maturity.label, 'string');
  });

  it('well-configured manifest scores Expert', () => {
    const m = baseManifest({
      _raw_settings: {
        security: { disableYoloMode: true },
        hooks: { BeforeTool: [{ name: 'test', type: 'command', command: 'echo test' }] },
      },
      skills: [{ name: 'clean-skill', has_skill_md: true, description: 'Does stuff', _has_gotchas: true, _has_validation: true }],
    });
    const result = runAdvisory(m);
    assert.ok(result.maturity.score >= 90, `Expected Expert score ≥90, got ${result.maturity.score}`);
  });

  it('all recommendations have doc references', () => {
    const m = baseManifest({
      policies: { found: false },
      global_gemini_md: { found: false },
      _raw_settings: {},
    });
    const result = runAdvisory(m);
    for (const r of result.recommendations) {
      assert.ok(r.reference, `Recommendation "${r.title}" is missing a reference link`);
      assert.ok(r.reference.includes('github.com/google-gemini/gemini-cli'), `Reference should point to gemini-cli repo: ${r.reference}`);
    }
  });
});
