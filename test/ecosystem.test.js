/** Tests for AI Tool Ecosystem scanners */
'use strict';
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { scanAntigravity, scanContinue, scanWindsurf, scanJetBrains, parseSkillsDir, scanOpenCode } = require('../lib/scanners');
const { computeScore } = require('../lib/report');

let tmpDir;

function mkdirp(p) { fs.mkdirSync(p, { recursive: true }); }
function writeFile(p, txt) { mkdirp(path.dirname(p)); fs.writeFileSync(p, txt); }
function writeJSON(p, obj) { writeFile(p, JSON.stringify(obj)); }

before(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecosystem-test-'));
});

after(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// ─── parseSkillsDir (shared helper) ──────────────────────────────────

describe('parseSkillsDir', () => {
  it('returns empty array for nonexistent dir', () => {
    assert.deepEqual(parseSkillsDir(path.join(tmpDir, 'no-exist'), 'test'), []);
  });

  it('parses SKILL.md frontmatter with correct source tag', () => {
    const sdir = path.join(tmpDir, 'shared-skills');
    writeFile(path.join(sdir, 'my-skill', 'SKILL.md'),
      '---\nname: my-skill\ndescription: Does cool things\n---\n# Steps\nDo stuff.');
    writeFile(path.join(sdir, 'my-skill', 'helper.sh'), '#!/bin/bash');
    const result = parseSkillsDir(sdir, 'custom-source');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'my-skill');
    assert.equal(result[0].source, 'custom-source');
    assert.equal(result[0].description, 'Does cool things');
    assert.equal(result[0].file_count, 2);
  });

  it('skips hidden directories', () => {
    const sdir = path.join(tmpDir, 'hidden-skills');
    mkdirp(path.join(sdir, '.hidden-skill'));
    mkdirp(path.join(sdir, 'visible-skill'));
    writeFile(path.join(sdir, 'visible-skill', 'SKILL.md'), '---\nname: visible-skill\n---');
    const result = parseSkillsDir(sdir, 'test');
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'visible-skill');
  });
});

// ─── scanAntigravity ─────────────────────────────────────────────────

describe('scanAntigravity', () => {
  it('returns found:false when antigravity dir missing', () => {
    const gdir = path.join(tmpDir, 'no-antigravity');
    mkdirp(gdir);
    assert.equal(scanAntigravity(gdir).found, false);
  });

  it('discovers brain conversations, skills, and MCP servers', () => {
    const gdir = path.join(tmpDir, 'with-antigravity');
    const agDir = path.join(gdir, 'antigravity');

    // Skills
    writeFile(path.join(agDir, 'skills', 'stop-slop', 'SKILL.md'),
      '---\nname: stop-slop\ndescription: Remove AI patterns\n---');

    // Brain conversations (just dirs)
    mkdirp(path.join(agDir, 'brain', 'conv-aaa-111'));
    mkdirp(path.join(agDir, 'brain', 'conv-bbb-222'));
    mkdirp(path.join(agDir, 'brain', 'conv-ccc-333'));

    // MCP config
    writeJSON(path.join(agDir, 'mcp_config.json'), {
      mcpServers: {
        'cloud-run': { command: 'npx' },
        'workspace': { command: 'npx' },
      }
    });

    // Knowledge
    writeFile(path.join(agDir, 'knowledge', 'knowledge.lock'), '');
    mkdirp(path.join(agDir, 'knowledge', 'item-1'));

    const result = scanAntigravity(gdir);
    assert.equal(result.found, true);
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].name, 'stop-slop');
    assert.equal(result.skills[0].source, 'antigravity');
    assert.equal(result.brain_conversations, 3);
    assert.deepEqual(result.mcp_servers, ['cloud-run', 'workspace']);
    assert.equal(result.knowledge_items, 2); // lock file + dir
  });
});

// ─── scanContinue ────────────────────────────────────────────────────

describe('scanContinue', () => {
  it('returns found:false when .continue missing', () => {
    assert.equal(scanContinue(path.join(tmpDir, 'no-home')).found, false);
  });

  it('discovers Continue skills', () => {
    const home = path.join(tmpDir, 'continue-home');
    const sdir = path.join(home, '.continue', 'skills');
    writeFile(path.join(sdir, 'gccli', 'SKILL.md'),
      '---\nname: gccli\ndescription: Google Calendar CLI\n---');
    writeFile(path.join(sdir, 'brave-search', 'SKILL.md'),
      '---\nname: brave-search\ndescription: Web search via Brave\n---');
    const result = scanContinue(home);
    assert.equal(result.found, true);
    assert.equal(result.skills.length, 2);
    assert.ok(result.skills.some(s => s.name === 'gccli'));
    assert.ok(result.skills.some(s => s.name === 'brave-search'));
    assert.ok(result.skills.every(s => s.source === 'continue'));
  });
});

// ─── scanWindsurf ────────────────────────────────────────────────────

describe('scanWindsurf', () => {
  it('returns found:false when .codeium/windsurf missing', () => {
    assert.equal(scanWindsurf(path.join(tmpDir, 'no-home')).found, false);
  });

  it('discovers Windsurf skills', () => {
    const home = path.join(tmpDir, 'windsurf-home');
    const sdir = path.join(home, '.codeium', 'windsurf', 'skills');
    writeFile(path.join(sdir, 'gsap', 'SKILL.md'),
      '---\nname: gsap\ndescription: GSAP animations\n---');
    const result = scanWindsurf(home);
    assert.equal(result.found, true);
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].name, 'gsap');
    assert.equal(result.skills[0].source, 'windsurf');
  });
});

// ─── scanJetBrains ───────────────────────────────────────────────────

describe('scanJetBrains', () => {
  it('returns found:false when JetBrains Air dir missing', () => {
    assert.equal(scanJetBrains(path.join(tmpDir, 'no-home')).found, false);
  });

  it('discovers JetBrains AI with empty rules', () => {
    const home = path.join(tmpDir, 'jb-home');
    const jbDir = path.join(home, 'Library', 'Application Support', 'JetBrains', 'Air');
    mkdirp(path.join(jbDir, 'rules'));
    const result = scanJetBrains(home);
    assert.equal(result.found, true);
    assert.deepEqual(result.rules, []);
  });

  it('discovers JetBrains AI with rules files', () => {
    const home = path.join(tmpDir, 'jb-home-rules');
    const jbDir = path.join(home, 'Library', 'Application Support', 'JetBrains', 'Air');
    writeFile(path.join(jbDir, 'rules', 'coding-standards.md'), '# Standards');
    const result = scanJetBrains(home);
    assert.equal(result.found, true);
    assert.deepEqual(result.rules, ['coding-standards.md']);
  });
});

// ─── scanOpenCode ────────────────────────────────────────────────────

describe('scanOpenCode', () => {
  it('returns found:false when .opencode missing', () => {
    assert.equal(scanOpenCode(path.join(tmpDir, 'no-opencode')).found, false);
  });

  it('discovers minimal .opencode dir', () => {
    const home = path.join(tmpDir, 'oc-minimal');
    mkdirp(path.join(home, '.opencode'));
    const result = scanOpenCode(home);
    assert.equal(result.found, true);
    assert.ok(result.config_dir);
  });

  it('parses opencode.jsonc with comments and trailing commas', () => {
    const home = path.join(tmpDir, 'oc-jsonc');
    const ocDir = path.join(home, '.opencode');
    writeFile(path.join(ocDir, 'opencode.jsonc'), `{
  // Main config
  "$schema": "https://opencode.ai/config.json",
  "provider": {},
  "permission": {
    "edit": {
      "packages/migration/*": "deny",
    },
  },
  "mcp": {
    "my-server": { "type": "local", "command": ["npx", "my-mcp"] },
  },
  "tools": {
    "github-triage": false,
    "custom-tool": true,
  },
}`);
    const result = scanOpenCode(home);
    assert.equal(result.found, true);
    assert.deepEqual(result.config.mcp_servers, ['my-server']);
    assert.deepEqual(result.config.tools_disabled, ['github-triage']);
    assert.deepEqual(result.config.tools_enabled, ['custom-tool']);
    assert.ok(result.config.permissions);
    assert.equal(result.config.has_mcp, true);
  });

  it('discovers agents with frontmatter', () => {
    const home = path.join(tmpDir, 'oc-agents');
    const ocDir = path.join(home, '.opencode');
    writeFile(path.join(ocDir, 'agent', 'triage.md'),
      '---\nmode: primary\nhidden: true\nmodel: opencode/gpt-5.4-nano\n---\nYou are a triage agent.');
    writeFile(path.join(ocDir, 'agent', 'reviewer.md'),
      '---\nmode: secondary\nmodel: opencode/claude-4\n---\nReview code.\ntools:\n  read: true');
    const result = scanOpenCode(home);
    assert.equal(result.agents.length, 2);
    const triage = result.agents.find(a => a.name === 'triage');
    assert.equal(triage.model, 'opencode/gpt-5.4-nano');
    assert.equal(triage.mode, 'primary');
    assert.equal(triage.hidden, true);
    const reviewer = result.agents.find(a => a.name === 'reviewer');
    assert.equal(reviewer.has_tools, true);
  });

  it('discovers skills with SKILL.md', () => {
    const home = path.join(tmpDir, 'oc-skills');
    const ocDir = path.join(home, '.opencode');
    writeFile(path.join(ocDir, 'skills', 'effect', 'SKILL.md'),
      '---\nname: effect\ndescription: Work with Effect v4\n---\n# Effect\nUse Effect patterns.');
    const result = scanOpenCode(home);
    assert.equal(result.skills.length, 1);
    assert.equal(result.skills[0].name, 'effect');
    assert.equal(result.skills[0].source, 'opencode');
    assert.equal(result.skills[0].description, 'Work with Effect v4');
  });

  it('discovers commands, custom tools, plugins, and themes', () => {
    const home = path.join(tmpDir, 'oc-full');
    const ocDir = path.join(home, '.opencode');
    // Commands
    writeFile(path.join(ocDir, 'command', 'commit.md'),
      '---\ndescription: git commit and push\nmodel: opencode/kimi-k2.5\nsubtask: true\n---\ncommit and push');
    writeFile(path.join(ocDir, 'command', 'learn.md'),
      '---\ndescription: learn from code\n---\nStudy the codebase');
    // Custom tools
    writeFile(path.join(ocDir, 'tool', 'github-triage.ts'), 'export default {}');
    // Plugins
    writeFile(path.join(ocDir, 'plugins', 'tui-smoke.tsx'), '// plugin');
    // Themes
    writeFile(path.join(ocDir, 'themes', 'smoke-theme.json'), '{}');
    const result = scanOpenCode(home);
    assert.equal(result.commands.length, 2);
    assert.ok(result.commands.find(c => c.name === 'commit' && c.subtask));
    assert.deepEqual(result.custom_tools, ['github-triage']);
    assert.equal(result.plugins.length, 1);
    assert.deepEqual(result.themes, ['smoke-theme']);
  });

  it('discovers glossary and TUI config', () => {
    const home = path.join(tmpDir, 'oc-glossary');
    const ocDir = path.join(home, '.opencode');
    writeFile(path.join(ocDir, 'glossary', 'en.md'), '# English');
    writeFile(path.join(ocDir, 'glossary', 'ja.md'), '# Japanese');
    writeJSON(path.join(ocDir, 'tui.json'), {
      plugin: [['./plugins/tui-smoke.tsx', { enabled: false }]]
    });
    const result = scanOpenCode(home);
    assert.equal(result.glossary.count, 2);
    assert.ok(result.glossary.languages.includes('en'));
    assert.equal(result.tui_config.has_plugins, true);
    assert.equal(result.tui_config.plugin_count, 1);
  });

  it('discovers AGENTS.md context file', () => {
    const home = path.join(tmpDir, 'oc-agentsmd');
    const ocDir = path.join(home, '.opencode');
    mkdirp(ocDir);
    writeFile(path.join(home, 'AGENTS.md'), '# Project Rules\n## Code Style\n## Testing\nFollow these patterns.');
    const result = scanOpenCode(home);
    assert.equal(result.found, true);
    assert.ok(result.agents_md);
    assert.ok(result.agents_md.size > 0);
    assert.deepEqual(result.agents_md.sections, ['Project Rules', 'Code Style', 'Testing']);
  });
});

// ─── Cross-tool skill overlap (via computeScore) ─────────────────────

describe('cross-tool skill overlap scoring', () => {
  it('awards ecosystem_tools points for multiple tools', () => {
    const m = {
      settings: { mcp_servers: {} },
      skills: [],
      extensions: {},
      global_gemini_md: {},
      conversations: {},
      antigravity: { found: true, skills: [] },
      continue_dev: { found: true, skills: [] },
      windsurf: { found: true, skills: [] },
      jetbrains: { found: true, rules: [] },
    };
    const score = computeScore(m);
    assert.equal(score.breakdown.ecosystem_tools, 4);
  });

  it('awards cross_tool_skills points for shared skills', () => {
    const m = {
      settings: { mcp_servers: {} },
      skills: [{ name: 'gccli', source: 'gemini' }],
      extensions: {},
      global_gemini_md: {},
      conversations: {},
      continue_dev: { found: true, skills: [{ name: 'gccli', source: 'continue' }, { name: 'brave-search', source: 'continue' }] },
      windsurf: { found: true, skills: [{ name: 'gccli', source: 'windsurf' }, { name: 'brave-search', source: 'windsurf' }] },
    };
    const score = computeScore(m);
    // gccli shared across 3 tools, brave-search across 2
    assert.equal(score.breakdown.cross_tool_skills, 2);
  });

  it('max score is now 115', () => {
    const m = { settings: {}, skills: [], extensions: {}, global_gemini_md: {}, conversations: {} };
    const score = computeScore(m);
    assert.equal(score.max, 115);
  });
});
