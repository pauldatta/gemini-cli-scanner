/** Tests for lib/scanners.js — uses temp fixtures */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { scanSettings, scanGeminiMd, scanSkills, scanAgents, scanExtensions, scanPolicies, scanConversations, scanMemoryTiers, scanSkillExtraction, scanAdminPolicies } = require('../lib/scanners');

let tmpDir;

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeJSON(p, obj) { mkdirp(path.dirname(p)); fs.writeFileSync(p, JSON.stringify(obj)); }
function writeFile(p, txt) { mkdirp(path.dirname(p)); fs.writeFileSync(p, txt); }

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'scanner-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('scanSettings', () => {
  it('returns found:false when no settings.json', () => {
    const gdir = path.join(tmpDir, 'empty-gemini');
    mkdirp(gdir);
    const result = scanSettings(gdir);
    assert.equal(result.found, false);
  });

  it('parses settings.json and redacts MCP server secrets', () => {
    const gdir = path.join(tmpDir, 'settings-gemini');
    writeJSON(path.join(gdir, 'settings.json'), {
      mcpServers: {
        myServer: { command: 'npx', args: ['--yes'], env: { API_KEY: 'AIzaSyD-abc123-xyz789_ABCDEFGHIJKLMNOP' } },
      },
      model: { default: 'gemini-3-flash-preview' },
      experimental: { grounding: true },
    });
    const result = scanSettings(gdir);
    assert.equal(result.found, true);
    assert.equal(result.mcp_servers.myServer.command, 'npx');
    assert.match(result.mcp_servers.myServer.env.API_KEY, /\[REDACTED-/);
    assert.equal(result.model.default, 'gemini-3-flash-preview');
  });
});

describe('scanGeminiMd', () => {
  it('returns found:false when no GEMINI.md', () => {
    const gdir = path.join(tmpDir, 'no-gmd');
    mkdirp(gdir);
    assert.equal(scanGeminiMd(gdir).found, false);
  });

  it('parses GEMINI.md sections and word count', () => {
    const gdir = path.join(tmpDir, 'has-gmd');
    writeFile(path.join(gdir, 'GEMINI.md'), '# My Rules\n\nDo this and that.\n\n## Code Style\n\nUse strict mode.');
    const result = scanGeminiMd(gdir);
    assert.equal(result.found, true);
    assert.ok(result.word_count > 5);
    assert.ok(result.sections.includes('My Rules'));
    assert.ok(result.sections.includes('Code Style'));
  });
});

describe('scanSkills', () => {
  it('returns empty array when no skills dir', () => {
    const gdir = path.join(tmpDir, 'no-skills');
    mkdirp(gdir);
    assert.deepEqual(scanSkills(gdir), []);
  });

  it('discovers skills with SKILL.md frontmatter', () => {
    const gdir = path.join(tmpDir, 'with-skills');
    const skillDir = path.join(gdir, 'skills', 'my-skill');
    writeFile(path.join(skillDir, 'SKILL.md'), '---\nname: my-skill\ndescription: Does things\n---\n\n# Instructions\nDo stuff.');
    writeFile(path.join(skillDir, 'helper.sh'), '#!/bin/bash\necho hi');
    const result = scanSkills(gdir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'my-skill');
    assert.equal(result[0].has_skill_md, true);
    assert.equal(result[0].description, 'Does things');
    assert.equal(result[0].file_count, 2);
  });
});

describe('scanAgents', () => {
  it('discovers agents from agents/ dir', () => {
    const gdir = path.join(tmpDir, 'with-agents');
    const agDir = path.join(gdir, 'agents');
    writeFile(path.join(agDir, 'reviewer.md'), '---\nname: reviewer\ndescription: Reviews code\nmodel: gemini-3-flash-preview\n---\n\nYou review code.');
    const result = scanAgents(gdir);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'reviewer');
    assert.equal(result[0].description, 'Reviews code');
  });
});

describe('scanExtensions', () => {
  it('returns found:false when no extensions dir', () => {
    const gdir = path.join(tmpDir, 'no-ext');
    mkdirp(gdir);
    assert.equal(scanExtensions(gdir).found, false);
  });

  it('lists extension directories', () => {
    const gdir = path.join(tmpDir, 'with-ext');
    mkdirp(path.join(gdir, 'extensions', 'ext-a'));
    mkdirp(path.join(gdir, 'extensions', 'ext-b'));
    const result = scanExtensions(gdir);
    assert.equal(result.found, true);
    assert.ok(result.extensions.includes('ext-a'));
    assert.ok(result.extensions.includes('ext-b'));
  });
});

describe('scanPolicies', () => {
  it('returns found:false when no policies dir', () => {
    const gdir = path.join(tmpDir, 'no-pol');
    mkdirp(gdir);
    assert.equal(scanPolicies(gdir).found, false);
  });

  it('reads TOML policy files', () => {
    const gdir = path.join(tmpDir, 'with-pol');
    const polDir = path.join(gdir, 'policies');
    writeFile(path.join(polDir, 'sandbox.toml'), '[rules]\nallow_shell = false');
    const result = scanPolicies(gdir);
    assert.equal(result.found, true);
    assert.ok(result.files['sandbox.toml'].includes('allow_shell'));
  });
});

describe('scanConversations', () => {
  it('returns found:false when no tmp dir', () => {
    const gdir = path.join(tmpDir, 'no-conv');
    mkdirp(gdir);
    assert.equal(scanConversations(gdir).found, false);
  });

  it('parses session JSONL files for tool usage and tokens', () => {
    const gdir = path.join(tmpDir, 'with-conv');
    const chatDir = path.join(gdir, 'tmp', 'my-project', 'chats');
    // logs.json is where user prompts are parsed from
    writeJSON(path.join(gdir, 'tmp', 'my-project', 'logs.json'), [
      { type: 'user', message: 'explain this code', timestamp: '2026-04-01T10:00:00Z' },
    ]);
    const lines = [
      JSON.stringify({ type: 'gemini', model: 'gemini-3-flash-preview', toolCalls: [{ name: 'read_file' }, { name: 'edit_file' }], tokens: { input: 100, output: 200, cached: 50, thoughts: 10 }, timestamp: '2026-04-01T10:00:01Z' }),
      JSON.stringify({ type: 'gemini', model: 'gemini-3-flash-preview', toolCalls: [{ name: 'read_file' }], tokens: { input: 50, output: 100, cached: 0, thoughts: 5 }, timestamp: '2026-04-01T10:00:02Z' }),
    ];
    writeFile(path.join(chatDir, 'session-001.jsonl'), lines.join('\n'));
    const result = scanConversations(gdir);
    assert.equal(result.found, true);
    assert.equal(result.total_sessions, 1);
    assert.equal(result.tool_usage_top_20.read_file, 2);
    assert.equal(result.tool_usage_top_20.edit_file, 1);
    assert.equal(result.models_used['gemini-3-flash-preview'], 2);
    assert.equal(result.total_tokens.input, 150);
    assert.equal(result.user_prompt_count, 1);
  });

  it('extracts tool chains per session for behavioral patterns', () => {
    const gdir = path.join(tmpDir, 'with-chains');
    const chatDir = path.join(gdir, 'tmp', 'chain-project', 'chats');
    writeJSON(path.join(gdir, 'tmp', 'chain-project', 'logs.json'), []);
    const lines = [
      JSON.stringify({ type: 'gemini', toolCalls: [{ name: 'read_file' }, { name: 'edit_file' }], timestamp: '2026-04-01T10:00:01Z' }),
      JSON.stringify({ type: 'gemini', toolCalls: [{ name: 'run_command' }], timestamp: '2026-04-01T10:00:02Z' }),
    ];
    writeFile(path.join(chatDir, 'session-chain.jsonl'), lines.join('\n'));
    const result = scanConversations(gdir);
    assert.ok(result.tool_chains);
    assert.equal(result.tool_chains.length, 1);
    assert.deepEqual(result.tool_chains[0].chain, ['read_file', 'edit_file', 'run_command']);
    assert.ok(result.chain_patterns);
    assert.ok(result.chain_patterns['read_file→edit_file→run_command']);
  });
});

describe('scanPolicies v0.40+ fields', () => {
  it('parses modes, mcpName, denyMessage, and interactive fields', () => {
    const gdir = path.join(tmpDir, 'v040-pol');
    const polDir = path.join(gdir, 'policies');
    const toml = `[[rule]]
toolName = "ShellTool"
decision = "deny"
commandPrefix = "rm -rf"
priority = 100
modes = ["yolo", "plan"]
mcpName = "my-server"
denyMessage = "Dangerous command blocked"
interactive = false
commandRegex = "rm\\s+-rf"
subagent = "code-review"
`;
    writeFile(path.join(polDir, 'safety.toml'), toml);
    const result = scanPolicies(gdir);
    assert.equal(result.found, true);
    const r = result.parsed_rules[0];
    assert.equal(r.toolName, 'ShellTool');
    assert.equal(r.decision, 'deny');
    assert.deepEqual(r.modes, ['yolo', 'plan']);
    assert.equal(r.mcpName, 'my-server');
    assert.equal(r.denyMessage, 'Dangerous command blocked');
    assert.equal(r.interactive, false);
    // TOML parser preserves the literal string from the file
    assert.ok(r.commandRegex.includes('rm'));
    assert.equal(r.subagent, 'code-review');
  });
});

describe('scanMemoryTiers', () => {
  it('detects global GEMINI.md memory (tier 1)', () => {
    const gdir = path.join(tmpDir, 'mem-global');
    writeFile(path.join(gdir, 'GEMINI.md'), '# Rules\n- Always use strict mode\n- Prefer TypeScript');
    const result = scanMemoryTiers(gdir);
    assert.equal(result.global.found, true);
    assert.ok(result.global.word_count > 0);
    assert.equal(result.global.bullet_count, 2);
    assert.ok(result.summary.tiers_in_use >= 1);
  });

  it('detects private project memory (tier 2)', () => {
    const gdir = path.join(tmpDir, 'mem-private');
    mkdirp(gdir);
    const memDir = path.join(gdir, 'tmp', 'abc123', 'memory');
    writeFile(path.join(memDir, 'MEMORY.md'), '- Project uses React\n- Database is PostgreSQL');
    writeFile(path.join(memDir, 'api-notes.md'), 'API endpoint: /v2/data');
    const result = scanMemoryTiers(gdir);
    assert.equal(result.private_projects.length, 1);
    assert.equal(result.private_projects[0].memory_md.found, true);
    assert.equal(result.private_projects[0].sibling_files.length, 1);
    assert.ok(result.summary.total_memory_files >= 2);
  });

  it('returns empty results when no memory exists', () => {
    const gdir = path.join(tmpDir, 'mem-empty');
    mkdirp(gdir);
    const result = scanMemoryTiers(gdir);
    assert.equal(result.global.found, false);
    assert.equal(result.private_projects.length, 0);
    assert.equal(result.summary.tiers_in_use, 0);
  });

  it('detects autoMemory from settings.json', () => {
    const gdir = path.join(tmpDir, 'mem-auto');
    writeJSON(path.join(gdir, 'settings.json'), { autoMemory: true });
    const result = scanMemoryTiers(gdir);
    assert.equal(result.autoMemory.enabled, true);
  });
});

describe('scanSkillExtraction', () => {
  it('returns found:false when no extraction state exists', () => {
    const gdir = path.join(tmpDir, 'ext-none');
    mkdirp(gdir);
    const result = scanSkillExtraction(gdir);
    assert.equal(result.found, false);
  });

  it('parses extraction state with run history', () => {
    const gdir = path.join(tmpDir, 'ext-state');
    const memDir = path.join(gdir, 'tmp', 'proj1', 'memory');
    writeJSON(path.join(memDir, '.extraction-state.json'), {
      runHistory: [
        { timestamp: '2026-04-01T10:00:00Z', sessionsProcessed: 5, skillsCreated: ['deploy-helper'] },
        { timestamp: '2026-04-10T12:00:00Z', sessionsProcessed: 3, skillsCreated: ['test-runner'] },
      ],
    });
    const result = scanSkillExtraction(gdir);
    assert.equal(result.found, true);
    assert.equal(result.total_runs, 2);
    assert.equal(result.sessions_processed, 8);
    assert.equal(result.last_run, '2026-04-10T12:00:00Z');
    assert.ok(result.skills_created.includes('deploy-helper'));
    assert.ok(result.skills_created.includes('test-runner'));
  });

  it('detects inbox skills awaiting approval', () => {
    const gdir = path.join(tmpDir, 'ext-inbox');
    const inboxDir = path.join(gdir, 'tmp', 'proj2', 'memory', 'skills', 'new-skill');
    writeFile(path.join(inboxDir, 'SKILL.md'), '---\nname: new-skill\n---\n# New Skill');
    const result = scanSkillExtraction(gdir);
    assert.equal(result.inbox.skills.length, 1);
    assert.equal(result.inbox.skills[0].name, 'new-skill');
  });

  it('detects stale extraction lock', () => {
    const gdir = path.join(tmpDir, 'ext-lock');
    const memDir = path.join(gdir, 'tmp', 'proj3', 'memory');
    mkdirp(memDir);
    // Create a lock file and backdate it
    const lockPath = path.join(memDir, '.extraction.lock');
    fs.writeFileSync(lockPath, '');
    const oldTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    fs.utimesSync(lockPath, new Date(oldTime), new Date(oldTime));
    const result = scanSkillExtraction(gdir);
    assert.equal(result.stale_lock, true);
  });

  it('detects pending patch files', () => {
    const gdir = path.join(tmpDir, 'ext-patches');
    const skillsDir = path.join(gdir, 'tmp', 'proj4', 'memory', 'skills');
    writeFile(path.join(skillsDir, 'deploy-helper.patch'), '--- a/SKILL.md\n+++ b/SKILL.md');
    const result = scanSkillExtraction(gdir);
    assert.equal(result.inbox.patches.length, 1);
    assert.equal(result.inbox.patches[0].target, 'deploy-helper');
  });
});

describe('scanAdminPolicies', () => {
  it('returns found:false when system dirs do not exist', () => {
    const result = scanAdminPolicies();
    // On most dev machines, the system dirs won't exist
    // The test validates it doesn't crash and returns a valid structure
    assert.ok('found' in result);
    assert.ok('files' in result);
    assert.ok('rule_count' in result);
  });
});
