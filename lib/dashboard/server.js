'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  syncFromSource,
  createEmptyState,
  aggregateTeam,
  assembleToolkit,
} = require('./aggregator');

const DASHBOARD_HTML = fs.readFileSync(path.join(__dirname, 'dashboard.html'), 'utf8');

// Check if a directory contains at least one scanner manifest JSON
function hasManifests(dir) {
  if (!fs.existsSync(dir)) return false;
  try {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json') && f !== 'team-state.json');
    for (const f of files) {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        if (d.scanner_version || d.sophistication_score) return true;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return false;
}

// Auto-discover a folder with manifests nearby
function discoverSource() {
  const candidates = [
    process.cwd(),
    path.join(process.cwd(), 'scan-results'),
    path.join(process.cwd(), 'reports'),
    path.join(process.env.HOME || '', 'scan-results'),
  ];
  for (const dir of candidates) {
    if (hasManifests(dir)) return dir;
  }
  return null;
}

function startDashboard(sourceDir, port = 3847) {
  const absSource = sourceDir ? path.resolve(sourceDir) : discoverSource();

  if (!absSource) {
    console.log(`
  🏢 Team Scanner Dashboard

  No report folder found. Looked in:
    • ./                  (current directory)
    • ./scan-results/
    • ./reports/
    • ~/scan-results/

  Usage:
    npx gemini-cli-scanner dashboard --source ./path/to/reports/

  Drop gemini-env-manifest.json files into a folder and point --source at it.
`);
    process.exit(1);
  }

  console.log(`\n  📂 Using source: ${absSource}`);

  const statePath = path.join(absSource, 'team-state.json');

  // Load or create state
  let state;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch {
    state = createEmptyState(absSource);
  }

  // Initial sync
  state = syncFromSource(absSource, state);
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2));

  const newCount = state.sync_stats?.new_reports || 0;
  const totalReporters = Object.keys(state.reporters).length;
  console.log(`\n  📊 Synced: ${newCount} new report(s), ${totalReporters} reporter(s) total`);

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, `http://localhost:${port}`);

    // CORS headers for fetch
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url.pathname === '/' && req.method === 'GET') {
        serveDashboard(res, state);
      } else if (url.pathname === '/api/state' && req.method === 'GET') {
        serveJson(res, { state, dashboard: aggregateTeam(state) });
      } else if (url.pathname === '/api/sync' && req.method === 'POST') {
        state = syncFromSource(absSource, state);
        fs.writeFileSync(statePath, JSON.stringify(state, null, 2));
        serveJson(res, { state, dashboard: aggregateTeam(state), synced: true });
      } else if (url.pathname.startsWith('/api/manifest/') && req.method === 'GET') {
        const filename = decodeURIComponent(url.pathname.replace('/api/manifest/', ''));
        serveManifest(res, absSource, filename);
      } else if (url.pathname === '/api/assemble' && req.method === 'POST') {
        handleAssemble(req, res, state);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`  🏢 Team Dashboard: ${url}\n`);

    // Auto-open browser
    const opener = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start' : 'xdg-open';
    require('child_process').exec(`${opener} ${url}`);
  });

  return server;
}

// ─── Route Handlers ──────────────────────────────────────────────────

function serveDashboard(res, state) {
  const dashboard = aggregateTeam(state);
  const data = JSON.stringify({ state, dashboard });

  // Embed data into HTML template
  const html = DASHBOARD_HTML.replace(
    '/*__TEAM_DATA__*/',
    `window.__TEAM_DATA__ = ${data};`
  );

  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-cache',
  });
  res.end(html);
}

function serveJson(res, data) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function serveManifest(res, sourceDir, filename) {
  // Sanitize filename to prevent directory traversal
  const safe = path.basename(filename);
  const filePath = path.join(sourceDir, safe);

  if (!fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Manifest not found' }));
    return;
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    serveJson(res, manifest);
  } catch {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Failed to parse manifest' }));
  }
}

function handleAssemble(req, res, state) {
  let body = '';
  req.on('data', chunk => { body += chunk; });
  req.on('end', () => {
    try {
      const selections = JSON.parse(body);
      const dashboard = aggregateTeam(state);
      const toolkit = assembleToolkit(selections, dashboard.standardization);
      serveJson(res, { toolkit });
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
  });
}

module.exports = { startDashboard };
