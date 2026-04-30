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

// ─── Helpers ─────────────────────────────────────────────────────────
function clear() { process.stdout.write('\x1b[2J\x1b[H'); }

function printHeader() {
  console.log(`${C.bold}${C.cyan}`);
  console.log(`  ╔══════════════════════════════════════════╗`);
  console.log(`  ║   🔍  Gemini CLI Scanner  v3.0.1        ║`);
  console.log(`  ╚══════════════════════════════════════════╝${C.reset}`);
  const authStatus = getAuthStatus();
  console.log(`  ${C.dim}Discover patterns in your AI coding environment${C.reset}`);
  console.log(`  ${authStatus}\n`);
}

function printMenu(selected) {
  const items = [
    { key: '1', label: 'Quick Scan', desc: 'Scan environment — no AI suggestions' },
    { key: '2', label: 'Full Scan', desc: 'Scan + AI skill suggestions (needs API key or GCP project)' },
    { key: '3', label: 'View Report', desc: 'Open the latest scan report' },
    { key: '4', label: 'View Score', desc: 'Show sophistication score breakdown' },
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
    if (key.trim()) {
      process.env.GOOGLE_API_KEY = key.trim();
      console.log(`  ${C.green}✓ API Key set for this session.${C.reset}`);
      return true;
    }
  } else if (choice.trim() === '2') {
    const project = await new Promise((resolve) => {
      rl.question(`\n  ${C.cyan}GCP Project ID:${C.reset} `, resolve);
    });
    if (project.trim()) {
      process.env.GOOGLE_CLOUD_PROJECT = project.trim();
      console.log(`  ${C.green}✓ Project set for this session: ${project.trim()}${C.reset}`);
      return true;
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

function viewReport() {
  const reportPath = path.join(DEFAULT_OUT, 'gemini-env-report.md');
  if (!fs.existsSync(reportPath)) {
    console.log(`\n  ${C.yellow}⚠ No report found. Run a scan first.${C.reset}\n`);
    return false;
  }

  // Try glow first (best markdown rendering)
  if (whichCmd('glow')) {
    try {
      execSync(`glow -p "${reportPath}"`, { stdio: 'inherit' });
      return true;
    } catch { /* fall through */ }
  }

  // Try bat (good syntax highlighting)
  if (whichCmd('bat')) {
    try {
      execSync(`bat --language=md --style=plain --paging=always "${reportPath}"`, { stdio: 'inherit' });
      return true;
    } catch { /* fall through */ }
  }

  // Built-in fallback with install hint
  console.log(`\n  ${C.dim}💡 Install glow or bat for a better reading experience:${C.reset}`);
  console.log(`  ${C.dim}   brew install glow    ${C.reset}${C.cyan}# rich markdown rendering with tables & colors${C.reset}`);
  console.log(`  ${C.dim}   brew install bat     ${C.reset}${C.cyan}# syntax-highlighted pager${C.reset}\n`);

  const content = fs.readFileSync(reportPath, 'utf8');
  const lines = content.split('\n');

  console.log(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}📄 Scan Report${C.reset}  ${C.dim}(${lines.length} lines)${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}\n`);

  // Colorize markdown
  for (const line of lines) {
    if (line.startsWith('# ')) console.log(`  ${C.bold}${C.cyan}${line}${C.reset}`);
    else if (line.startsWith('## ')) console.log(`  ${C.bold}${C.magenta}${line}${C.reset}`);
    else if (line.startsWith('### ')) console.log(`  ${C.bold}${C.yellow}${line}${C.reset}`);
    else if (line.startsWith('- **')) console.log(`  ${C.green}${line}${C.reset}`);
    else if (line.startsWith('|')) console.log(`  ${C.dim}${line}${C.reset}`);
    else if (line.startsWith('```')) console.log(`  ${C.dim}${line}${C.reset}`);
    else if (line.includes('✅')) console.log(`  ${C.green}${line}${C.reset}`);
    else if (line.includes('❌')) console.log(`  ${C.red}${line}${C.reset}`);
    else console.log(`  ${line}`);
  }
  return true;
}

function viewScore() {
  const jsonPath = path.join(DEFAULT_OUT, 'gemini-env-manifest.json');
  if (!fs.existsSync(jsonPath)) {
    console.log(`\n  ${C.yellow}⚠ No manifest found. Run a scan first.${C.reset}\n`);
    return false;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const score = data.sophistication_score;
  if (!score) { console.log(`\n  ${C.yellow}⚠ No score data in manifest.${C.reset}\n`); return false; }

  const pct = Math.round((score.total / score.max) * 100);
  const barLen = 40;
  const filled = Math.round((pct / 100) * barLen);
  const barColor = pct >= 70 ? C.green : pct >= 40 ? C.yellow : C.red;
  const bar = `${barColor}${'█'.repeat(filled)}${C.dim}${'░'.repeat(barLen - filled)}${C.reset}`;

  console.log(`\n  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}📊 Sophistication Score${C.reset}`);
  console.log(`  ${C.bold}${C.cyan}${'─'.repeat(50)}${C.reset}`);
  console.log(`\n  ${bar}  ${C.bold}${score.total}/${score.max}${C.reset}  ${C.dim}(${pct}%)${C.reset}\n`);

  console.log(`  ${C.bold}Breakdown:${C.reset}`);
  console.log(`  ${'─'.repeat(45)}`);

  const labels = {
    mcp_servers: '🔌 MCP Servers', skills: '🎯 Skills', extensions: '📦 Extensions',
    global_context: '📝 Global Context', project_context: '📁 Project Context',
    policies: '🛡️  Policies', tool_diversity: '🔧 Tool Diversity',
    session_volume: '💬 Session Volume', claude_skills: '🤖 Claude Skills',
  };
  const maxes = {
    mcp_servers: 20, skills: 15, extensions: 15, global_context: 10,
    project_context: 10, policies: 5, tool_diversity: 15, session_volume: 10, claude_skills: 5,
  };

  for (const [key, val] of Object.entries(score.breakdown)) {
    const label = labels[key] || key;
    const max = maxes[key] || 10;
    const miniBar = `${barColor}${'▓'.repeat(Math.round((val / max) * 12))}${C.dim}${'░'.repeat(12 - Math.round((val / max) * 12))}${C.reset}`;
    const padded = String(val).padStart(2);
    console.log(`  ${label.padEnd(22)} ${miniBar}  ${padded}/${max}`);
  }

  // Quick stats
  const convos = data.conversations || {};
  if (convos.found) {
    console.log(`\n  ${C.bold}Quick Stats:${C.reset}`);
    console.log(`  ${'─'.repeat(45)}`);
    console.log(`  💬 Sessions:    ${C.bold}${convos.total_sessions || 0}${C.reset}`);
    const tok = convos.total_tokens || {};
    const totalTok = Object.values(tok).reduce((a, b) => a + b, 0);
    console.log(`  🔤 Tokens:      ${C.bold}${totalTok.toLocaleString()}${C.reset}`);
    const topTool = Object.entries(convos.tool_usage_top_20 || {}).sort((a, b) => b[1] - a[1])[0];
    if (topTool) console.log(`  🏆 Top tool:    ${C.bold}${topTool[0]}${C.reset} ${C.dim}(${topTool[1]} calls)${C.reset}`);
    const models = Object.entries(convos.models_used || {}).sort((a, b) => b[1] - a[1]);
    if (models.length) console.log(`  🧠 Top model:   ${C.bold}${models[0][0]}${C.reset} ${C.dim}(${models[0][1]} turns)${C.reset}`);
  }
  console.log('');
  return true;
}

async function promptRepos(rl) {
  return new Promise((resolve) => {
    rl.question(`\n  ${C.cyan}Include code repos?${C.reset} ${C.dim}(e.g. ~/Code — auto-discovers repos 3 levels deep, Enter to skip)${C.reset}\n  > `, (answer) => {
      resolve(answer.trim().split(/\s+/).filter(Boolean));
    });
  });
}

async function promptChatDays(rl) {
  return new Promise((resolve) => {
    rl.question(`\n  ${C.cyan}Filter chat history?${C.reset} ${C.dim}(Enter number of days, or press Enter for all history)${C.reset}\n  > `, (answer) => {
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
  const ITEM_COUNT = 5;

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
        viewReport();
        break;
      case 3: // View score
        viewScore();
        break;
      case 4: // Quit
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

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();

    process.stdin.on('keypress', async (str, key) => {
      if (key.ctrl && key.name === 'c') { clear(); process.exit(0); }

      if (key.name === 'up') { selected = (selected - 1 + ITEM_COUNT) % ITEM_COUNT; render(); }
      else if (key.name === 'down') { selected = (selected + 1) % ITEM_COUNT; render(); }
      else if (key.name === 'return') {
        process.stdin.setRawMode(false);
        await handleAction(selected);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
      }
      else if (str === 'q') { clear(); console.log(`  ${C.dim}Goodbye! 👋${C.reset}\n`); process.exit(0); }
      else if (str >= '1' && str <= '4') {
        selected = parseInt(str) - 1;
        render();
        process.stdin.setRawMode(false);
        await handleAction(selected);
        if (process.stdin.isTTY) process.stdin.setRawMode(true);
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
