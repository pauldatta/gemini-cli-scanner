#!/usr/bin/env node
/**
 * gemini-cli-scanner TUI — lightweight interactive terminal UI
 * Run: node tui.js  |  npx gemini-cli-scanner
 * Uses Node built-ins only (readline, child_process).
 */
'use strict';
const readline = require('node:readline');
const { execSync, spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

// ─── Colors ──────────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  magenta: '\x1b[35m', red: '\x1b[31m', white: '\x1b[97m',
  bgDark: '\x1b[48;5;235m', underline: '\x1b[4m',
};

const SCANNER = path.join(__dirname, 'scanner.js');
const DEFAULT_OUT = './scan-results';
const PKG_VERSION = require('./package.json').version;

// ─── Helpers ─────────────────────────────────────────────────────────

// Snapshot env credentials at startup so users can switch back without re-entering
const ENV_SNAPSHOT = {
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || null,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || null,
  GOOGLE_CLOUD_PROJECT: process.env.GOOGLE_CLOUD_PROJECT || null,
};
function clear() { process.stdout.write('\x1b[2J\x1b[H'); }

function printHeader() {
  console.log(`${C.cyan}`);
  console.log(`   ██████╗ ███████╗███╗   ███╗██╗███╗   ██╗██╗`);
  console.log(`  ██╔════╝ ██╔════╝████╗ ████║██║████╗  ██║██║`);
  console.log(`  ██║  ███╗█████╗  ██╔████╔██║██║██╔██╗ ██║██║`);
  console.log(`  ██║   ██║██╔══╝  ██║╚██╔╝██║██║██║╚██╗██║██║`);
  console.log(`  ╚██████╔╝███████╗██║ ╚═╝ ██║██║██║ ╚████║██║`);
  console.log(`   ╚═════╝ ╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═══╝╚═╝`);
  console.log(`  ${C.dim}${C.white}───── CLI Scanner ─────────── v${PKG_VERSION} ──${C.reset}`);
  console.log('');
  const authStatus = getAuthStatus();
  console.log(`  ${C.dim}Discover patterns in your AI coding environment${C.reset}`);
  console.log(`  ${authStatus}\n`);
}

function printMenu(selected) {
  const authTag = getAuthTag();
  const items = [
    { key: '1', label: 'Quick Scan', desc: 'Scan environment — no AI suggestions' },
    { key: '2', label: 'Full Scan', desc: 'Scan + AI skill suggestions (needs API key or GCP project)' },
    { key: '3', label: 'View Report', desc: 'Open the latest scan report' },
    { key: '4', label: 'Maturity Dashboard', desc: 'Score breakdown, stats, and all recommendations' },
    { key: '5', label: `Auth Settings ${authTag}`, desc: 'Switch between API Key / Vertex AI, or clear credentials' },
    { key: 'q', label: 'Quit', desc: '' },
  ];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const isSelected = i === selected;
    const pointer = isSelected ? `${C.cyan}▸ ` : '  ';
    const highlight = isSelected ? `${C.bold}${C.white}` : C.dim;
    const desc = item.desc ? `  ${C.dim}${item.desc}${C.reset}` : '';
    console.log(`${pointer}${highlight}[${item.key}] ${item.label}${C.reset}${desc}`);
  }
  console.log(`\n  ${C.dim}↑/↓ to navigate, Enter to select, or press number key${C.reset}`);
}

function getAuthTag() {
  const hasProject = !!process.env.GOOGLE_CLOUD_PROJECT;
  const hasKey = !!process.env.GOOGLE_API_KEY;
  if (hasProject && hasKey) return `${C.dim}[Vertex AI + API Key]${C.reset}`;
  if (hasProject) return `${C.dim}[Vertex AI]${C.reset}`;
  if (hasKey) return `${C.dim}[API Key]${C.reset}`;
  return `${C.dim}[none]${C.reset}`;
}

function getAuthStatus() {
  const hasProject = !!process.env.GOOGLE_CLOUD_PROJECT;
  const hasKey = !!process.env.GOOGLE_API_KEY;
  if (hasProject) return `${C.green}✓ Vertex AI${C.reset} ${C.dim}(${process.env.GOOGLE_CLOUD_PROJECT})${C.reset}`;
  if (hasKey) return `${C.green}✓ API Key${C.reset} ${C.dim}(configured)${C.reset}`;
  return `${C.yellow}⚠ No AI credentials${C.reset} ${C.dim}— Full Scan will prompt you${C.reset}`;
}

async function promptCredentials(rl) {
  console.log(`\n  ${C.bold}${C.cyan}🔑 AI Credentials Required${C.reset}`);
  console.log(`  ${C.dim}Needed for AI-powered skill suggestions.${C.reset}`);
  console.log(`  ${C.dim}Skip to run without AI suggestions.${C.reset}\n`);

  const choice = await new Promise((resolve) => {
    rl.question(`  ${C.cyan}[1]${C.reset} Enter Google API Key\n  ${C.cyan}[2]${C.reset} Enter GCP Project (Vertex AI)\n  ${C.cyan}[s]${C.reset} Skip (no AI suggestions)\n\n  > `, resolve);
  });

  if (choice.trim() === '1') {
    const key = await new Promise((resolve) => {
      rl.question(`\n  ${C.cyan}API Key:${C.reset} `, resolve);
    });
    const cleaned = key.trim().replace(/[^\x20-\x7E]/g, ''); // Strip non-printable chars from paste
    if (cleaned.length >= 10) {
      process.env.GOOGLE_API_KEY = cleaned;
      delete process.env.GOOGLE_CLOUD_PROJECT; // API key takes priority
      console.log(`  ${C.green}✓ API Key set for this session (${cleaned.length} chars).${C.reset}`);
      return true;
    } else if (cleaned.length > 0) {
      console.log(`  ${C.red}✗ API key too short${C.reset} ${C.dim}(got ${cleaned.length} chars — expected a key from aistudio.google.com or console.cloud.google.com)${C.reset}`);
      return false;
    }
  } else if (choice.trim() === '2') {
    const project = await new Promise((resolve) => {
      rl.question(`\n  ${C.cyan}GCP Project ID:${C.reset} `, resolve);
    });
    const cleaned = project.trim().replace(/[^\x20-\x7E]/g, '');
    if (/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(cleaned)) {
      process.env.GOOGLE_CLOUD_PROJECT = cleaned;
      console.log(`  ${C.green}✓ Valid project set for this session: ${cleaned}${C.reset}`);
      return true;
    } else if (cleaned.length > 0) {
      console.log(`  ${C.red}✗ Invalid project ID format${C.reset} ${C.dim}(expected: lowercase, 6-30 chars, e.g. my-project-123)${C.reset}`);
      console.log(`  ${C.dim}  Got: "${cleaned}"${C.reset}`);
      return false;
    }
  }
  return false; // skipped
}

function hasAICredentials() {
  return !!process.env.GOOGLE_CLOUD_PROJECT || !!process.env.GOOGLE_API_KEY;
}

function runScanner(args, label) {
  return new Promise((resolve) => {
    console.log(`\n  ${C.yellow}⏳ ${label}...${C.reset}\n`);
    const child = spawn('node', [SCANNER, ...args], {
      stdio: 'inherit',
      env: { ...process.env },
    });
    child.on('close', (code) => {
      if (code === 0) console.log(`\n  ${C.green}✅ Done!${C.reset}`);
      else console.log(`\n  ${C.red}✖ Scanner exited with code ${code}${C.reset}`);
      resolve(code);
    });
  });
}

function whichCmd(cmd) {
  try { return execSync(`which ${cmd} 2>/dev/null`, { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

// ─── Reusable Full-Screen Scrollable Viewer ──────────────────────────

function scrollableView(lines, sections) {
  let scrollOffset = 0;
  let tocMode = false;
  let tocSelected = 0;
  const hasToc = sections && sections.length > 0;

  function renderView() {
    clear();
    const termH = process.stdout.rows || 24;
    const viewH = termH - 2;
    const maxOffset = Math.max(0, lines.length - viewH);
    scrollOffset = Math.max(0, Math.min(scrollOffset, maxOffset));

    const visible = lines.slice(scrollOffset, scrollOffset + viewH);
    for (const line of visible) process.stdout.write(line + '\n');

    const canScroll = lines.length > viewH;
    const scrollPct = canScroll ? Math.round((scrollOffset / maxOffset) * 100) : 100;
    const scrollHint = canScroll
      ? `${C.dim}${scrollOffset > 0 ? '↑' : ' '} ${scrollPct}% ${scrollOffset < maxOffset ? '↓' : ' '}${C.reset}`
      : '';
    const tocHint = hasToc ? '  t=sections' : '';
    process.stdout.write(`\n  ${C.dim}Esc/q to go back  │  ↑/↓  f/b  PgUp/PgDn${tocHint}${C.reset}  ${scrollHint}`);
  }

  function renderToc() {
    clear();
    const termH = process.stdout.rows || 24;
    console.log(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
    console.log(`  ${C.bold}${C.cyan}📑 Sections${C.reset}  ${C.dim}(↑/↓ to select, Enter to jump, Esc to close)${C.reset}`);
    console.log(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
    console.log('');

    // Paginate TOC if it's taller than the terminal
    const tocViewH = termH - 6;
    const tocStart = Math.max(0, tocSelected - tocViewH + 3);
    const tocEnd = Math.min(sections.length, tocStart + tocViewH);

    for (let i = tocStart; i < tocEnd; i++) {
      const s = sections[i];
      const marker = i === tocSelected ? `${C.cyan}▸${C.reset}` : ' ';
      const label = i === tocSelected ? `${C.bold}${C.cyan}${s.label}${C.reset}` : `  ${s.label}`;
      console.log(`  ${marker} ${label}`);
    }

    if (tocEnd < sections.length) {
      console.log(`\n  ${C.dim}... ${sections.length - tocEnd} more below${C.reset}`);
    }
  }

  return new Promise((resolve) => {
    renderView();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const handler = (str, key) => {
      if (key.ctrl && key.name === 'c') { clear(); process.exit(0); }

      // ── TOC mode ───────────────────────────────────────────────
      if (tocMode) {
        if (key.name === 'escape' || str === 't') {
          tocMode = false;
          renderView();
          return;
        }
        if (key.name === 'up' || key.name === 'k') {
          tocSelected = Math.max(0, tocSelected - 1);
          renderToc();
        } else if (key.name === 'down' || key.name === 'j') {
          tocSelected = Math.min(sections.length - 1, tocSelected + 1);
          renderToc();
        } else if (key.name === 'return') {
          scrollOffset = sections[tocSelected].line;
          tocMode = false;
          renderView();
        }
        return;
      }

      // ── Normal scroll mode ─────────────────────────────────────
      if (key.name === 'escape' || key.name === 'q') {
        process.stdin.removeListener('keypress', handler);
        resolve(true);
        return;
      }

      if (hasToc && str === 't') {
        tocMode = true;
        renderToc();
        return;
      }

      const termH = process.stdout.rows || 24;
      const viewH = termH - 2;
      const pageSize = Math.max(1, viewH - 2);

      if (key.name === 'up' || key.name === 'k') { scrollOffset = Math.max(0, scrollOffset - 1); renderView(); }
      else if (key.name === 'down' || key.name === 'j') { scrollOffset += 1; renderView(); }
      else if (key.name === 'pageup' || str === 'b') { scrollOffset = Math.max(0, scrollOffset - pageSize); renderView(); }
      else if (key.name === 'pagedown' || str === 'f') { scrollOffset += pageSize; renderView(); }
      else if (key.name === 'home' || str === 'g') { scrollOffset = 0; renderView(); }
      else if (key.name === 'end' || str === 'G') { scrollOffset = lines.length; renderView(); }
    };

    process.stdin.on('keypress', handler);
  });
}

// ─── Report Viewer ───────────────────────────────────────────────────

async function viewReport() {
  const reportPath = path.join(DEFAULT_OUT, 'gemini-env-report.md');
  if (!fs.existsSync(reportPath)) {
    console.log(`\n  ${C.yellow}⚠ No report found. Run a scan first.${C.reset}\n`);
    return false;
  }
  // Always use built-in scrollable viewer for consistent UX

  // Built-in scrollable viewer with colorized markdown + section index
  const content = fs.readFileSync(reportPath, 'utf8');
  const rawLines = content.split('\n');

  const L = [];
  const sections = [];
  L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  L.push(`  ${C.bold}${C.cyan}📄 Scan Report${C.reset}  ${C.dim}(${rawLines.length} lines)${C.reset}`);
  L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  L.push('');

  for (const line of rawLines) {
    if (line.startsWith('# ')) {
      sections.push({ label: line.replace(/^#+ /, ''), line: L.length });
      L.push(`  ${C.bold}${C.cyan}${line}${C.reset}`);
    } else if (line.startsWith('## ')) {
      sections.push({ label: line.replace(/^#+ /, ''), line: L.length });
      L.push(`  ${C.bold}${C.magenta}${line}${C.reset}`);
    } else if (line.startsWith('### ')) {
      L.push(`  ${C.bold}${C.yellow}${line}${C.reset}`);
    } else if (line.startsWith('- **')) { L.push(`  ${C.green}${line}${C.reset}`); }
    else if (line.startsWith('|')) { L.push(`  ${C.dim}${line}${C.reset}`); }
    else if (line.startsWith('```')) { L.push(`  ${C.dim}${line}${C.reset}`); }
    else if (line.includes('✅')) { L.push(`  ${C.green}${line}${C.reset}`); }
    else if (line.includes('❌')) { L.push(`  ${C.red}${line}${C.reset}`); }
    else { L.push(`  ${line}`); }
  }

  await scrollableView(L, sections);
  return true;
}

async function viewScore() {
  const jsonPath = path.join(DEFAULT_OUT, 'gemini-env-manifest.json');
  if (!fs.existsSync(jsonPath)) {
    console.log(`\n  ${C.yellow}⚠ No manifest found. Run a scan first.${C.reset}\n`);
    return false;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const score = data.sophistication_score;
  if (!score) { console.log(`\n  ${C.yellow}⚠ No score data in manifest.${C.reset}\n`); return false; }

  const advisory = data.advisory || {};
  const mat = advisory.maturity || {};

  // ── Build all lines into a buffer ──────────────────────────────
  const L = [];
  const pct = Math.round((score.total / score.max) * 100);
  const barLen = 40;
  const filled = Math.round((pct / 100) * barLen);
  const barColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.red;
  const bar = `${barColor}${'█'.repeat(filled)}${C.dim}${'░'.repeat(barLen - filled)}${C.reset}`;

  L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  L.push(`  ${C.bold}${C.cyan}📊 Maturity Dashboard${C.reset}`);
  L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);

  if (mat.label) {
    L.push('');
    L.push(`  ${mat.emoji || ''} ${C.bold}${mat.label}${C.reset}  ${C.dim}(maturity: ${mat.score || 0}/100)${C.reset}`);
  }
  L.push(`  ${bar}  ${C.bold}${score.total}/${score.max}${C.reset}  ${C.dim}(${pct}% capability coverage)${C.reset}`);

  // Score Breakdown
  L.push('');
  L.push(`  ${C.bold}Score Breakdown:${C.reset}`);
  L.push(`  ${'─'.repeat(45)}`);

  const labels = {
    mcp_servers: '🔌 MCP Servers', skills: '🎯 Skills', extensions: '📦 Extensions',
    global_context: '📝 Global Context', project_context: '📁 Project Context',
    policies: '🛡️  Policies', tool_diversity: '🔧 Tool Diversity',
    session_volume: '💬 Session Volume', claude_skills: '🤖 Claude Skills',
    ecosystem_tools: '🌐 Ecosystem', cross_tool_skills: '🔗 Cross-tool',
  };
  const maxes = {
    mcp_servers: 20, skills: 15, extensions: 15, global_context: 10,
    project_context: 10, policies: 5, tool_diversity: 15, session_volume: 10,
    claude_skills: 5, ecosystem_tools: 5, cross_tool_skills: 5,
  };

  for (const [key, val] of Object.entries(score.breakdown)) {
    const label = labels[key] || key;
    const max = maxes[key] || 10;
    const ratio = Math.min(val / max, 1);
    const miniBar = `${barColor}${'▓'.repeat(Math.round(ratio * 12))}${C.dim}${'░'.repeat(12 - Math.round(ratio * 12))}${C.reset}`;
    const padded = String(val).padStart(2);
    L.push(`  ${label.padEnd(22)} ${miniBar}  ${padded}/${max}`);
  }

  // Quick Stats
  const convos = data.conversations || {};
  if (convos.found) {
    L.push('');
    L.push(`  ${C.bold}Quick Stats:${C.reset}`);
    L.push(`  ${'─'.repeat(45)}`);
    L.push(`  💬 Sessions:    ${C.bold}${convos.total_sessions || 0}${C.reset}`);
    const tok = convos.total_tokens || {};
    const totalTok = Object.values(tok).reduce((a, b) => a + b, 0);
    L.push(`  🔤 Tokens:      ${C.bold}${totalTok.toLocaleString()}${C.reset}`);
    const topTool = Object.entries(convos.tool_usage_top_20 || {}).sort((a, b) => b[1] - a[1])[0];
    if (topTool) L.push(`  🏆 Top tool:    ${C.bold}${topTool[0]}${C.reset} ${C.dim}(${topTool[1]} calls)${C.reset}`);
    const models = Object.entries(convos.models_used || {}).sort((a, b) => b[1] - a[1]);
    if (models.length) L.push(`  🧠 Top model:   ${C.bold}${models[0][0]}${C.reset} ${C.dim}(${models[0][1]} turns)${C.reset}`);
  }

  // Advisory Recommendations
  if (advisory.recommendations && advisory.recommendations.length) {
    const SICON = { critical: `${C.red}●${C.reset}`, warning: `${C.yellow}▲${C.reset}`, info: `${C.cyan}ℹ${C.reset}` };
    const CAT_LABEL = {
      policy_hygiene: '🛡️  Policy Hygiene', mcp_governance: '🔌 MCP Governance',
      gemini_md_quality: '📝 GEMINI.md Quality', skills_optimization: '🎯 Skills',
      settings_optimization: '⚙️  Settings', hooks_utilization: '🪝 Hooks',
      extension_health: '📦 Extensions', context_architecture: '📁 Context',
    };

    L.push('');
    L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
    L.push(`  ${C.bold}${C.cyan}🩺 Recommendations${C.reset}  ${C.dim}(${advisory.summary.critical} critical, ${advisory.summary.warnings} warnings, ${advisory.summary.info} info)${C.reset}`);
    L.push(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);

    for (const [category, recs] of Object.entries(advisory.by_category || {})) {
      L.push('');
      L.push(`  ${C.bold}${CAT_LABEL[category] || category}${C.reset}`);
      for (const r of recs) {
        L.push(`    ${SICON[r.severity] || '·'} ${r.title}`);
        if (r.reference) L.push(`      ${C.dim}→ ${r.reference}${C.reset}`);
      }
    }
  }

  return scrollableView(L);
}

async function manageAuth(rl) {
  return new Promise((resolve) => {
    let authSelected = 0;

    function buildAuthItems() {
      const items = [];
      const activeKey = process.env.GOOGLE_API_KEY;
      const activeProject = process.env.GOOGLE_CLOUD_PROJECT;

      // ── Detected credentials (instant switch) ──────────────────
      const detectedKeys = new Set();
      for (const envName of ['GOOGLE_API_KEY', 'GEMINI_API_KEY']) {
        const val = ENV_SNAPSHOT[envName];
        if (val && val.length >= 10 && !detectedKeys.has(val)) {
          detectedKeys.add(val);
          const masked = val.slice(0, 6) + '...' + val.slice(-4);
          const isActive = activeKey === val;
          items.push({
            label: isActive ? `✓ API Key (${masked})` : `  API Key (${masked})`,
            desc: isActive ? 'currently active' : `from $${envName}`,
            action: 'switch-key', value: val, active: isActive,
          });
        }
      }

      if (ENV_SNAPSHOT.GOOGLE_CLOUD_PROJECT) {
        const proj = ENV_SNAPSHOT.GOOGLE_CLOUD_PROJECT;
        const isActive = activeProject === proj;
        items.push({
          label: isActive ? `✓ Vertex AI (${proj})` : `  Vertex AI (${proj})`,
          desc: isActive ? 'currently active' : 'from $GOOGLE_CLOUD_PROJECT',
          action: 'switch-project', value: proj, active: isActive,
        });
      }

      if (items.length > 0) {
        items.push({ label: '─', desc: '', action: 'separator' });
      }

      // ── Manual entry ───────────────────────────────────────────
      items.push({ label: 'Enter new API Key', desc: 'Paste from aistudio.google.com', action: 'enter-key' });
      items.push({ label: 'Enter new GCP Project', desc: 'Use ADC with a project ID', action: 'enter-project' });
      items.push({ label: 'Clear all credentials', desc: 'Reset for this session', action: 'clear-all' });
      items.push({ label: '← Back to menu', desc: '', action: 'back' });

      return items;
    }

    let AUTH_ITEMS = buildAuthItems();

    function renderAuthScreen() {
      clear();
      printHeader();
      console.log(`  ${C.bold}${C.cyan}🔑 Auth Settings${C.reset}\n`);

      const activeKey = process.env.GOOGLE_API_KEY;
      const activeProject = process.env.GOOGLE_CLOUD_PROJECT;
      if (activeProject) {
        console.log(`  ${C.green}Active: Vertex AI${C.reset} ${C.dim}(${activeProject})${C.reset}`);
      } else if (activeKey) {
        const masked = activeKey.slice(0, 6) + '...' + activeKey.slice(-4);
        console.log(`  ${C.green}Active: API Key${C.reset} ${C.dim}(${masked})${C.reset}`);
      } else {
        console.log(`  ${C.yellow}No credentials active${C.reset}`);
      }
      console.log('');

      for (let i = 0; i < AUTH_ITEMS.length; i++) {
        const item = AUTH_ITEMS[i];
        if (item.action === 'separator') {
          console.log(`  ${C.dim}${'─'.repeat(44)}${C.reset}`);
          continue;
        }
        const isSelected = i === authSelected;
        const pointer = isSelected ? `${C.cyan}▸ ` : '  ';
        const highlight = isSelected ? `${C.bold}${C.white}` : (item.active ? C.green : C.dim);
        const desc = item.desc ? `  ${C.dim}${item.desc}${C.reset}` : '';
        console.log(`${pointer}${highlight}${item.label}${C.reset}${desc}`);
      }

      console.log(`\n  ${C.dim}↑/↓ navigate, Enter to switch/select, Esc to go back${C.reset}`);
    }

    async function handleAuthAction(idx) {
      const item = AUTH_ITEMS[idx];
      if (!item || item.action === 'separator') return false;
      if (item.action === 'back') return true;

      if (item.action === 'switch-key') {
        process.env.GOOGLE_API_KEY = item.value;
        delete process.env.GOOGLE_CLOUD_PROJECT;
        AUTH_ITEMS = buildAuthItems();
        return true;
      }
      if (item.action === 'switch-project') {
        process.env.GOOGLE_CLOUD_PROJECT = item.value;
        delete process.env.GOOGLE_API_KEY;
        AUTH_ITEMS = buildAuthItems();
        return true;
      }
      if (item.action === 'enter-key') {
        process.stdin.setRawMode(false);
        const key = await new Promise((r) => {
          rl.question(`\n  ${C.cyan}API Key:${C.reset} `, r);
        });
        const cleaned = key.trim().replace(/[^\x20-\x7E]/g, '');
        if (cleaned.length >= 10) {
          process.env.GOOGLE_API_KEY = cleaned;
          delete process.env.GOOGLE_CLOUD_PROJECT;
          if (!ENV_SNAPSHOT.GOOGLE_API_KEY) ENV_SNAPSHOT.GOOGLE_API_KEY = cleaned;
          AUTH_ITEMS = buildAuthItems();
          console.log(`\n  ${C.green}✓ API Key set for this session.${C.reset}`);
          console.log(`  ${C.dim}To persist across terminals: export GOOGLE_API_KEY=${cleaned}${C.reset}`);
          await new Promise(r => setTimeout(r, 1500));
        }
        process.stdin.setRawMode(true);
        return true;
      }
      if (item.action === 'enter-project') {
        process.stdin.setRawMode(false);
        const project = await new Promise((r) => {
          rl.question(`\n  ${C.cyan}GCP Project ID:${C.reset} `, r);
        });
        const cleaned = project.trim().replace(/[^\x20-\x7E]/g, '');
        if (/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(cleaned)) {
          process.env.GOOGLE_CLOUD_PROJECT = cleaned;
          delete process.env.GOOGLE_API_KEY;
          if (!ENV_SNAPSHOT.GOOGLE_CLOUD_PROJECT) ENV_SNAPSHOT.GOOGLE_CLOUD_PROJECT = cleaned;
          AUTH_ITEMS = buildAuthItems();
          console.log(`\n  ${C.green}✓ GCP Project set for this session.${C.reset}`);
          console.log(`  ${C.dim}To persist across terminals: export GOOGLE_CLOUD_PROJECT=${cleaned}${C.reset}`);
          await new Promise(r => setTimeout(r, 1500));
        }
        process.stdin.setRawMode(true);
        return true;
      }
      if (item.action === 'clear-all') {
        delete process.env.GOOGLE_API_KEY;
        delete process.env.GOOGLE_CLOUD_PROJECT;
        AUTH_ITEMS = buildAuthItems();
        return true;
      }
      return false;
    }

    renderAuthScreen();
    if (process.stdin.isTTY) process.stdin.setRawMode(true);

    const authKeyHandler = async (str, key) => {
      if (key.ctrl && key.name === 'c') { clear(); process.exit(0); }
      if (key.name === 'escape') {
        process.stdin.removeListener('keypress', authKeyHandler);
        resolve();
        return;
      }
      if (key.name === 'up') {
        do { authSelected = (authSelected - 1 + AUTH_ITEMS.length) % AUTH_ITEMS.length; }
        while (AUTH_ITEMS[authSelected].action === 'separator');
        renderAuthScreen();
      } else if (key.name === 'down') {
        do { authSelected = (authSelected + 1) % AUTH_ITEMS.length; }
        while (AUTH_ITEMS[authSelected].action === 'separator');
        renderAuthScreen();
      } else if (key.name === 'return') {
        const done = await handleAuthAction(authSelected);
        if (done) {
          process.stdin.removeListener('keypress', authKeyHandler);
          resolve();
        }
      }
    };

    process.stdin.on('keypress', authKeyHandler);
  });
}

async function promptRepos(rl) {
  return new Promise((resolve) => {
    rl.question(`\n  ${C.cyan}Include code repos?${C.reset} ${C.dim}(path e.g. ~/Code, or ${C.reset}n${C.dim} to skip)${C.reset}\n  > `, (answer) => {
      const val = answer.trim();
      if (!val || val.toLowerCase() === 'n' || val.toLowerCase() === 'no') {
        resolve([]);
      } else {
        resolve(val.split(/\s+/).filter(Boolean));
      }
    });
  });
}

async function promptChatDays(rl) {
  return new Promise((resolve) => {
    rl.question(`\n  ${C.cyan}Filter chat history?${C.reset} ${C.dim}(number of days, or ${C.reset}Enter${C.dim} for all history)${C.reset}\n  > `, (answer) => {
      const val = answer.trim();
      resolve(val && !isNaN(parseInt(val, 10)) ? parseInt(val, 10) : null);
    });
  });
}

// ─── Main Loop ───────────────────────────────────────────────────────
async function main() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  // Enable raw mode for arrow key navigation
  if (process.stdin.isTTY) {
    readline.emitKeypressEvents(process.stdin);
  }

  let selected = 0;
  const ITEM_COUNT = 6;

  function render() {
    clear();
    printHeader();
    printMenu(selected);
  }

  async function handleAction(idx) {
    switch (idx) {
      case 0: { // Quick scan
        const repos = await promptRepos(rl);
        const days = await promptChatDays(rl);
        const args = ['--skip-suggestions', '--output-dir', DEFAULT_OUT];
        if (repos.length) args.push('--repos', ...repos);
        if (days) args.push('--chat-days', String(days));
        const label = repos.length ? `Quick scan + ${repos.length > 1 ? repos.length + ' repo paths' : repos[0]}` : 'Quick scan';
        await runScanner(args, label);
        break;
      }
      case 1: { // Full scan
        if (!hasAICredentials()) {
          const set = await promptCredentials(rl);
          if (!set) {
            console.log(`  ${C.dim}Running without AI suggestions.${C.reset}`);
            const repos = await promptRepos(rl);
            const days = await promptChatDays(rl);
            const args = ['--skip-suggestions', '--output-dir', DEFAULT_OUT];
            if (repos.length) args.push('--repos', ...repos);
            if (days) args.push('--chat-days', String(days));
            await runScanner(args, 'Running scan (no AI)');
            break;
          }
        }
        const repos = await promptRepos(rl);
        const days = await promptChatDays(rl);
        const args = ['--output-dir', DEFAULT_OUT];
        if (repos.length) args.push('--repos', ...repos);
        if (days) args.push('--chat-days', String(days));
        const label = repos.length ? `Full scan + ${repos.length > 1 ? repos.length + ' repo paths' : repos[0]}` : 'Full scan';
        await runScanner(args, label);
        break;
      }
      case 2: // View report
        await viewReport();
        render();
        return; // Skip "press any key" below
      case 3: // Maturity Dashboard
        await viewScore();
        render();
        return; // Skip "press any key" below
      case 4: // Auth settings
        await manageAuth(rl);
        render(); // Go straight back to main menu
        return; // Skip "press any key" below
      case 5: // Quit
        clear();
        console.log(`  ${C.dim}Goodbye! 👋${C.reset}\n`);
        process.exit(0);
    }

    console.log(`  ${C.dim}${'─'.repeat(50)}${C.reset}`);
    console.log(`  ${C.dim}Press any key to return to menu...${C.reset}`);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    await new Promise((resolve) => {
      process.stdin.once('keypress', resolve);
    });
    render();
  }

  render();

  let inAction = false; // Guard: ignore keypress events while readline is active

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c') { clear(); process.exit(0); }
      if (inAction) return; // Ignore keypresses while prompts/scans are running

      // Ignore bare escape key (also sent as part of paste sequences)
      if (key.name === 'escape') return;

      if (key.name === 'up') { selected = (selected - 1 + ITEM_COUNT) % ITEM_COUNT; render(); }
      else if (key.name === 'down') { selected = (selected + 1) % ITEM_COUNT; render(); }
      else if (key.name === 'return') {
        inAction = true;
        process.stdin.setRawMode(false);
        await handleAction(selected);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        inAction = false;
      }
      else if (str === 'q') { clear(); console.log(`  ${C.dim}Goodbye! 👋${C.reset}\n`); process.exit(0); }
      else if (str >= '1' && str <= '5') {
        selected = parseInt(str) - 1;
        render();
        inAction = true;
        process.stdin.setRawMode(false);
        await handleAction(selected);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
        inAction = false;
      }
    });
  }
}

// Run only when executed directly, not when required as a module
if (require.main === module) {
  main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
}

// Export internals for testing
module.exports = { getAuthStatus, hasAICredentials, C, DEFAULT_OUT };
