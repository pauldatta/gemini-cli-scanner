/** Tests for the two-stage skill suggestion pipeline and TUI report viewer */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { _testing } = require('../lib/suggest');
const { aggregatePromptPatterns, buildRepoContext, buildIdentifierPrompt, buildSingleSkillWriterPrompt, extractJSON } = _testing;

// ─── aggregatePromptPatterns ─────────────────────────────────────────

describe('aggregatePromptPatterns', () => {
  it('returns empty array for no prompts', () => {
    assert.deepEqual(aggregatePromptPatterns([]), []);
    assert.deepEqual(aggregatePromptPatterns(null), []);
    assert.deepEqual(aggregatePromptPatterns(undefined), []);
  });

  it('filters out patterns with count < 2', () => {
    const prompts = [
      { text: 'unique one-off task that nobody repeats' },
      { text: 'fix the test suite in auth module' },
      { text: 'fix the test suite in auth module again' },
    ];
    const result = aggregatePromptPatterns(prompts);
    // Only the "fix the test" cluster qualifies (count >= 2)
    assert.ok(result.length >= 1, 'Should have at least one cluster');
    assert.ok(result.every(c => c.count >= 2), 'All clusters must have count >= 2');
  });

  it('clusters prompts by leading words', () => {
    const prompts = [
      { text: 'deploy the service to cloud run now' },
      { text: 'deploy the service to cloud run now please' },
      { text: 'deploy the service to cloud run now again' },
      { text: 'scan my local environment for all issues' },
      { text: 'scan my local environment for all issues again' },
    ];
    const result = aggregatePromptPatterns(prompts);
    assert.ok(result.length >= 2, 'Should cluster into at least 2 groups');
    // Highest frequency first
    assert.ok(result[0].count >= result[1].count, 'Should be sorted by frequency descending');
  });

  it('limits examples to 3 per cluster', () => {
    // All 10 share the same 6-word fingerprint
    const prompts = Array.from({ length: 10 }, (_, i) => ({ text: `run the tests on the project attempt ${i}` }));
    const result = aggregatePromptPatterns(prompts);
    assert.ok(result.length >= 1);
    assert.ok(result[0].examples.length <= 3, 'Should cap examples at 3');
  });

  it('keeps top 15 clusters max', () => {
    // Create 20 distinct clusters with count >= 2 each
    const prompts = [];
    for (let i = 0; i < 20; i++) {
      const prefix = `action${i} verb${i} noun${i}`;
      prompts.push({ text: `${prefix} first` });
      prompts.push({ text: `${prefix} second` });
    }
    const result = aggregatePromptPatterns(prompts);
    assert.ok(result.length <= 15, 'Should cap at 15 clusters');
  });

  it('normalizes away special characters from fingerprint', () => {
    const prompts = [
      { text: 'fix the broken test in auth' },
      { text: 'fix the broken test in auth!' },
    ];
    const result = aggregatePromptPatterns(prompts);
    assert.ok(result.length >= 1, 'Special chars stripped, prompts should cluster');
    assert.equal(result[0].count, 2, 'Both prompts should cluster together');
  });

  it('truncates examples to 150 chars', () => {
    const longText = 'a'.repeat(200);
    const prompts = [
      { text: `repeat ${longText}` },
      { text: `repeat ${longText}` },
    ];
    const result = aggregatePromptPatterns(prompts);
    assert.ok(result.length >= 1);
    assert.ok(result[0].examples[0].length <= 150, 'Examples should be truncated to 150 chars');
  });
});

// ─── buildRepoContext ────────────────────────────────────────────────

describe('buildRepoContext', () => {
  it('returns placeholder for no repos', () => {
    assert.match(buildRepoContext(null), /No code repos/);
    assert.match(buildRepoContext([]), /No code repos/);
  });

  it('includes repo name in output', () => {
    const repos = [{ name: 'my-project', gemini_md: { word_count: 50, content_preview: 'Project rules' } }];
    const result = buildRepoContext(repos);
    assert.ok(result.includes('my-project'), 'Should include repo name');
    assert.ok(result.includes('Project rules'), 'Should include content preview');
  });

  it('includes MCP server info', () => {
    const repos = [{
      name: 'test-repo',
      gemini_config: {
        mcp_details: { 'cloud-run': { command: 'npx' } },
      },
    }];
    const result = buildRepoContext(repos);
    assert.ok(result.includes('cloud-run'), 'Should include MCP server name');
  });

  it('caps at 15 repos', () => {
    const repos = Array.from({ length: 20 }, (_, i) => ({
      name: `repo-${i}`,
      gemini_md: { word_count: 10, content_preview: `Content ${i}` },
    }));
    const result = buildRepoContext(repos);
    assert.ok(!result.includes('repo-15'), 'Should not include repos beyond index 14');
  });
});

// ─── extractJSON ─────────────────────────────────────────────────────

describe('extractJSON', () => {
  it('parses raw JSON', () => {
    const result = extractJSON('[{"name": "test"}]');
    assert.deepEqual(result, [{ name: 'test' }]);
  });

  it('extracts from ```json fences', () => {
    const text = 'Some preamble\n```json\n[{"name": "fenced"}]\n```\nSome postamble';
    const result = extractJSON(text);
    assert.deepEqual(result, [{ name: 'fenced' }]);
  });

  it('extracts from plain ``` fences', () => {
    const text = 'Here is the result:\n```\n{"key": "value"}\n```';
    const result = extractJSON(text);
    assert.deepEqual(result, { key: 'value' });
  });

  it('throws on invalid JSON', () => {
    assert.throws(() => extractJSON('not json at all {broken'), { name: 'SyntaxError' });
  });
});

// ─── buildIdentifierPrompt ───────────────────────────────────────────

describe('buildIdentifierPrompt', () => {
  const manifest = {
    conversations: {
      tool_usage_top_20: { run_command: 100, view_file: 80 },
      user_prompts: [
        { text: 'deploy the service' },
        { text: 'deploy the service again' },
      ],
    },
    skills: [{ name: 'existing-skill' }],
    claude: { skills: [{ name: 'claude-skill' }] },
    settings: { mcp_servers: { 'cloud-run': {}, 'workspace': {} } },
    repos: [{ name: 'test-repo' }],
  };

  it('includes existing skills to avoid duplication', () => {
    const prompt = buildIdentifierPrompt(manifest);
    assert.ok(prompt.includes('existing-skill'), 'Should include Gemini skills');
    assert.ok(prompt.includes('claude-skill'), 'Should include Claude skills');
  });

  it('includes MCP server names', () => {
    const prompt = buildIdentifierPrompt(manifest);
    assert.ok(prompt.includes('cloud-run'), 'Should include MCP server names');
    assert.ok(prompt.includes('workspace'), 'Should include all MCP servers');
  });

  it('includes tool usage data', () => {
    const prompt = buildIdentifierPrompt(manifest);
    assert.ok(prompt.includes('run_command'), 'Should include tool names');
  });

  it('merges Antigravity brain data', () => {
    const withBrain = {
      ...manifest,
      antigravity: {
        brain_intelligence: {
          user_prompts: [
            { text: 'brain prompt one' },
            { text: 'brain prompt two' },
          ],
          tool_usage_top_20: { browser_subagent: 15 },
        },
      },
    };
    const prompt = buildIdentifierPrompt(withBrain);
    assert.ok(prompt.includes('browser_subagent'), 'Should merge Antigravity tool usage');
  });

  it('requests JSON output format', () => {
    const prompt = buildIdentifierPrompt(manifest);
    assert.ok(prompt.includes('Return valid JSON'), 'Should request JSON output');
    assert.ok(prompt.includes('key_tools'), 'Should request key_tools field');
    assert.ok(prompt.includes('example_prompts'), 'Should request example_prompts field');
  });
});

// ─── buildSingleSkillWriterPrompt ────────────────────────────────────

describe('buildSingleSkillWriterPrompt', () => {
  const candidate = {
    name: 'cloud-deployer',
    description: 'Deploy services to Cloud Run',
    key_tools: ['run_command', 'mcp_cloud-run_deploy_service'],
    example_prompts: ['deploy to cloud run'],
  };
  const manifest = {
    settings: { mcp_servers: { 'cloud-run': {}, 'workspace': {} } },
  };

  it('includes agentskills.io design principles', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('Add what the agent lacks'), 'Should include principle 1');
    assert.ok(prompt.includes('Favor procedures over declarations'), 'Should include principle 2');
    assert.ok(prompt.includes('Provide defaults, not menus'), 'Should include principle 3');
  });

  it('includes the candidate data', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('cloud-deployer'), 'Should include candidate name');
    assert.ok(prompt.includes('mcp_cloud-run_deploy_service'), 'Should include key tools');
  });

  it('requires Gotchas and Validation sections', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('Gotchas'), 'Should require Gotchas section');
    assert.ok(prompt.includes('Validation'), 'Should require Validation section');
    assert.ok(prompt.includes('Best Practices'), 'Should require Best Practices section');
  });

  it('includes the exemplar skill template', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('email-triage'), 'Should include exemplar skill');
    assert.ok(prompt.includes('gmail.search'), 'Should include exemplar tool calls');
  });

  it('requests single JSON object (not array)', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('Return valid JSON object'), 'Should request single object');
    assert.ok(prompt.includes('skill_template'), 'Should request skill_template field');
  });

  it('includes available MCP servers', () => {
    const prompt = buildSingleSkillWriterPrompt(candidate, manifest);
    assert.ok(prompt.includes('cloud-run'), 'Should include MCP servers');
    assert.ok(prompt.includes('workspace'), 'Should include all available MCP servers');
  });
});

// ─── Two-Stage Pipeline Structure ────────────────────────────────────

describe('two-stage pipeline architecture', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'suggest.js'), 'utf8');

  it('defines separate IDENTIFIER and WRITER model arrays', () => {
    assert.ok(src.includes('IDENTIFIER_MODELS'), 'Should define IDENTIFIER_MODELS');
    assert.ok(src.includes('WRITER_MODELS'), 'Should define WRITER_MODELS');
    assert.ok(!src.includes('MODEL_CHAIN'), 'Should NOT have old MODEL_CHAIN');
  });

  it('IDENTIFIER_MODELS uses flash-lite as primary', () => {
    const match = src.match(/IDENTIFIER_MODELS\s*=\s*\[([\s\S]*?)\]/);
    const firstModel = match[1].trim().split('\n')[0];
    assert.ok(firstModel.includes('flash-lite'), 'First identifier model should be flash-lite');
  });

  it('WRITER_MODELS uses pro as primary', () => {
    const match = src.match(/WRITER_MODELS\s*=\s*\[([\s\S]*?)\]/);
    const firstModel = match[1].trim().split('\n')[0];
    assert.ok(firstModel.includes('pro'), 'First writer model should be pro');
  });

  it('uses Promise.all for parallel skill writing', () => {
    assert.ok(src.includes('Promise.all'), 'Should use Promise.all for parallel writes');
  });

  it('has a progress bar function', () => {
    assert.ok(src.includes('progressBar'), 'Should define progressBar function');
  });

  it('includes graceful degradation stubs', () => {
    assert.ok(src.includes('When to Use'), 'Should have fallback template with When to Use section');
    assert.ok(src.includes('Procedure'), 'Should have fallback template with Procedure section');
  });
});

// ─── TUI Report Viewer Cascade ───────────────────────────────────────

describe('TUI report viewer cascade', () => {
  const tuiSrc = fs.readFileSync(path.join(__dirname, '..', 'tui.js'), 'utf8');

  it('defines whichCmd helper for tool detection', () => {
    assert.ok(tuiSrc.includes('function whichCmd'), 'Should define whichCmd');
  });

  it('uses built-in scrollable viewer', () => {
    assert.ok(tuiSrc.includes('scrollableView'), 'Should use shared scrollable viewer');
  });

  it('builds section index for TOC navigation', () => {
    assert.ok(tuiSrc.includes('sections.push'), 'Should build sections from headings');
    assert.ok(tuiSrc.includes('scrollableView(L, sections)'), 'Should pass sections to viewer');
  });

  it('preserves built-in colorizer as final fallback', () => {
    assert.ok(tuiSrc.includes("line.startsWith('# ')"), 'Should have H1 colorization');
    assert.ok(tuiSrc.includes("line.startsWith('## ')"), 'Should have H2 colorization');
    assert.ok(tuiSrc.includes("line.startsWith('### ')"), 'Should have H3 colorization');
  });
});
