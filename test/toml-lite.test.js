'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parsePolicyToml } = require('../lib/toml-lite');

describe('toml-lite', () => {
  it('parses empty string', () => {
    assert.deepStrictEqual(parsePolicyToml(''), []);
  });

  it('parses a single [[rule]] block', () => {
    const toml = `
[[rule]]
toolName = "ShellTool"
decision = "deny"
commandPrefix = "rm -rf"
priority = 100
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules.length, 1);
    assert.equal(rules[0]._table, 'rule');
    assert.equal(rules[0].toolName, 'ShellTool');
    assert.equal(rules[0].decision, 'deny');
    assert.equal(rules[0].commandPrefix, 'rm -rf');
    assert.equal(rules[0].priority, 100);
  });

  it('parses multiple [[rule]] blocks', () => {
    const toml = `
[[rule]]
toolName = "ShellTool"
decision = "deny"

[[rule]]
toolName = "ReadFileTool"
decision = "allow"
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules.length, 2);
    assert.equal(rules[0].decision, 'deny');
    assert.equal(rules[1].decision, 'allow');
  });

  it('handles boolean values', () => {
    const toml = `
[[rule]]
enabled = true
disabled = false
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules[0].enabled, true);
    assert.equal(rules[0].disabled, false);
  });

  it('handles string arrays', () => {
    const toml = `
[[rule]]
tools = ["a", "b", "c"]
`;
    const rules = parsePolicyToml(toml);
    assert.deepStrictEqual(rules[0].tools, ['a', 'b', 'c']);
  });

  it('handles empty arrays', () => {
    const toml = `
[[rule]]
tools = []
`;
    const rules = parsePolicyToml(toml);
    assert.deepStrictEqual(rules[0].tools, []);
  });

  it('strips comments', () => {
    const toml = `
# This is a comment
[[rule]]
toolName = "ShellTool" # inline comment
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules[0].toolName, 'ShellTool');
  });

  it('skips [section] headers without data loss', () => {
    const toml = `
[metadata]
version = 1

[[rule]]
toolName = "ShellTool"
`;
    const rules = parsePolicyToml(toml);
    // metadata section is skipped; only [[rule]] blocks returned
    assert.equal(rules.length, 1);
    assert.equal(rules[0].toolName, 'ShellTool');
  });

  it('handles single-quoted strings', () => {
    const toml = `
[[rule]]
toolName = 'ShellTool'
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules[0].toolName, 'ShellTool');
  });

  it('handles unquoted string values', () => {
    const toml = `
[[rule]]
decision = deny
`;
    const rules = parsePolicyToml(toml);
    assert.equal(rules[0].decision, 'deny');
  });
});
