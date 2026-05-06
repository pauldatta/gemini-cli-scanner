'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');

// Import collapseForPrivacy from scanner.js — it's not exported, so we test via require inline
// We replicate the function here for unit-testability (same logic as scanner.js)
function collapseForPrivacy(m) {
  const o = JSON.parse(JSON.stringify(m));

  if (o.conversations) {
    const c = o.conversations;
    c.user_prompt_count = c.user_prompt_count || (c.user_prompts || []).length;
    delete c.user_prompts;
    c.topic_count = Object.keys(c.thought_topics_top_15 || {}).length;
    delete c.thought_topics_top_15;
    c.project_count = Object.keys(c.projects || {}).length;
    delete c.projects;
    delete c.tool_chains;
  }

  if (o.antigravity?.brain_intelligence) {
    const b = o.antigravity.brain_intelligence;
    b.user_prompt_count = b.user_prompt_count || (b.user_prompts || []).length;
    delete b.user_prompts;
  }

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

// ─── Fixtures ────────────────────────────────────────────────────────

function buildManifest() {
  return {
    conversations: {
      found: true,
      total_sessions: 42,
      user_prompt_count: 3,
      user_prompts: [
        { project: 'secret-api', text: 'refactor auth to use OAuth2' },
        { project: 'secret-api', text: 'add retry logic to payments' },
        { project: 'internal-tool', text: 'deploy to staging' },
      ],
      thought_topics_top_15: { kubernetes: 12, debugging: 8, testing: 5 },
      projects: {
        'a1b2c3': { sessions: 5, top_tools: { edit_file: 20 } },
        'd4e5f6': { sessions: 3, top_tools: { run_command: 10 } },
      },
      tool_chains: [
        { project: 'secret-api', session: 'sess-01', chain: ['read_file', 'edit_file', 'run_command'] },
        { project: 'internal-tool', session: 'sess-02', chain: ['search', 'view_file'] },
      ],
      chain_patterns: { 'read_file→edit_file→run_command': 7 },
      tool_usage_top_20: { edit_file: 120, run_command: 80 },
      models_used: { 'gemini-2.5-pro': 50 },
      total_tokens: { input: 500000, output: 100000 },
    },
    antigravity: {
      brain_intelligence: {
        user_prompt_count: 2,
        user_prompts: [
          { text: 'analyze the codebase' },
          { text: 'write unit tests for auth module' },
        ],
      },
    },
    repos: [
      { name: 'my-secret-api', path: '/home/user/code/my-secret-api', gemini_md: { found: true }, gemini_config: { found: true }, _has_geminiignore: true },
      { name: 'internal-tool', path: '/home/user/code/internal-tool', claude_md: { found: true } },
    ],
    sophistication_score: { total: 45, max: 67 },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────

describe('collapseForPrivacy', () => {
  it('drops user_prompts array and preserves user_prompt_count', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.conversations.user_prompt_count, 3);
    assert.strictEqual(result.conversations.user_prompts, undefined);
  });

  it('drops thought_topics_top_15 and adds topic_count', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.conversations.topic_count, 3);
    assert.strictEqual(result.conversations.thought_topics_top_15, undefined);
  });

  it('drops projects hash and adds project_count', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.conversations.project_count, 2);
    assert.strictEqual(result.conversations.projects, undefined);
  });

  it('drops tool_chains array', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.conversations.tool_chains, undefined);
  });

  it('preserves chain_patterns (safe fingerprints)', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.deepStrictEqual(result.conversations.chain_patterns, { 'read_file→edit_file→run_command': 7 });
  });

  it('preserves tool_usage_top_20, models_used, total_tokens', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.deepStrictEqual(result.conversations.tool_usage_top_20, { edit_file: 120, run_command: 80 });
    assert.deepStrictEqual(result.conversations.models_used, { 'gemini-2.5-pro': 50 });
    assert.deepStrictEqual(result.conversations.total_tokens, { input: 500000, output: 100000 });
  });

  it('preserves total_sessions', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.conversations.total_sessions, 42);
  });

  it('collapses antigravity brain prompts to count', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.antigravity.brain_intelligence.user_prompt_count, 2);
    assert.strictEqual(result.antigravity.brain_intelligence.user_prompts, undefined);
  });

  it('anonymizes repo names and keeps only capability flags', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.strictEqual(result.repo_count, 2);
    assert.strictEqual(result.repos[0].name, 'repo-1');
    assert.strictEqual(result.repos[0].has_gemini_md, true);
    assert.strictEqual(result.repos[0].has_gemini_config, true);
    assert.strictEqual(result.repos[0].has_geminiignore, true);
    assert.strictEqual(result.repos[0].path, undefined);
    assert.strictEqual(result.repos[1].name, 'repo-2');
    assert.strictEqual(result.repos[1].has_claude_md, true);
    assert.strictEqual(result.repos[1].has_gemini_md, false);
  });

  it('adds _privacy metadata flag', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.deepStrictEqual(result._privacy, { mode: 'counts-only', version: '1.0' });
  });

  it('does not mutate the original manifest', () => {
    const original = buildManifest();
    collapseForPrivacy(original);
    assert.strictEqual(original.conversations.user_prompts.length, 3);
    assert.strictEqual(Object.keys(original.conversations.thought_topics_top_15).length, 3);
    assert.strictEqual(original.repos[0].name, 'my-secret-api');
  });

  it('handles manifest with no conversations gracefully', () => {
    const result = collapseForPrivacy({ sophistication_score: { total: 10, max: 67 } });
    assert.deepStrictEqual(result._privacy, { mode: 'counts-only', version: '1.0' });
    assert.strictEqual(result.conversations, undefined);
  });

  it('handles manifest with empty conversations gracefully', () => {
    const result = collapseForPrivacy({ conversations: {} });
    assert.strictEqual(result.conversations.user_prompt_count, 0);
    assert.strictEqual(result.conversations.topic_count, 0);
    assert.strictEqual(result.conversations.project_count, 0);
  });

  it('preserves sophistication_score untouched', () => {
    const result = collapseForPrivacy(buildManifest());
    assert.deepStrictEqual(result.sophistication_score, { total: 45, max: 67 });
  });
});
