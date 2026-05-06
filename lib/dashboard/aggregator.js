'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── Summary Extraction ─────────────────────────────────────────────
// Extracts a lightweight summary (~2KB) from a full manifest (~280KB).
// This is what gets stored in team-state.json.

function extractSummary(manifest, filename) {
  const label = parseReporterLabel(filename);
  const contentHash = crypto.createHash('sha256')
    .update(JSON.stringify(manifest))
    .digest('hex')
    .slice(0, 16);

  return {
    report_id: manifest.report_id || contentHash,
    reporter_label: label,
    filename,
    timestamp: manifest.scan_timestamp || new Date().toISOString(),
    scanner_version: manifest.scanner_version || 'unknown',
    score: manifest.sophistication_score || { total: 0, max: 67 },
    maturity: manifest.advisory?.maturity || { label: 'Unknown', emoji: '❓' },
    skills: (manifest.skills || []).map(s => ({
      name: s.name,
      source: s.source || 'unknown',
      origin: s.origin || 'user-created',
    })),
    mcp_servers: Object.keys(manifest.settings?.mcp_servers || {}),
    policy_count: manifest.policies?.parsed_rules?.length || 0,
    policy_has_deny_rm: (manifest.policies?.parsed_rules || []).some(
      r => r.decision === 'deny' && (r.commandPrefix || '').includes('rm')
    ),
    policy_has_modes: (manifest.policies?.parsed_rules || []).some(
      r => r.modes && r.modes.length > 0
    ),
    yolo_disabled: manifest._raw_settings?.security?.disableYoloMode || false,
    advisory_counts: manifest.advisory?.summary || { critical: 0, warning: 0, info: 0 },
    tool_chains: (manifest.conversations?.tool_chains || [])
      .map(c => (c.chain || []).slice(0, 3).join('→'))
      .filter(Boolean),
    skills_count: (manifest.skills || []).length,
    mcp_count: Object.keys(manifest.settings?.mcp_servers || {}).length,
    repos_count: (manifest.repos || []).length,
    memory_tiers: manifest.memory_tiers?.summary?.tiers_in_use || 0,
  };
}

// Parse reporter label from filename: "paul-datta-2026-05-04.json" → "paul-datta"
function parseReporterLabel(filename) {
  const stem = path.basename(filename, '.json');
  // Strip trailing date pattern (YYYY-MM-DD or YYYYMMDD)
  return stem.replace(/-?\d{4}-?\d{2}-?\d{2}$/, '').replace(/-$/, '') || stem;
}

// ─── Source Sync ─────────────────────────────────────────────────────
// Reads all manifest JSON files from a source directory and merges
// new ones into the existing team state.

function syncFromSource(sourceDir, existingState) {
  const state = JSON.parse(JSON.stringify(existingState)); // deep clone
  const knownIds = new Set(state.known_report_ids || []);

  // List all JSON files except team-state.json
  let files;
  try {
    files = fs.readdirSync(sourceDir)
      .filter(f => f.endsWith('.json') && f !== 'team-state.json');
  } catch {
    return state;
  }

  let newCount = 0;
  for (const file of files) {
    const filePath = path.join(sourceDir, file);
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      continue; // skip unparseable files
    }

    // Must look like a scanner manifest
    if (!manifest.scanner_version && !manifest.sophistication_score) continue;

    const summary = extractSummary(manifest, file);

    // Deduplicate by report_id
    if (knownIds.has(summary.report_id)) continue;

    // Find or create reporter entry
    const label = summary.reporter_label;
    if (!state.reporters[label]) {
      state.reporters[label] = { scans: [] };
    }
    state.reporters[label].scans.push(summary);

    // Sort scans by timestamp (newest first)
    state.reporters[label].scans.sort((a, b) =>
      new Date(b.timestamp) - new Date(a.timestamp)
    );

    knownIds.add(summary.report_id);
    newCount++;
  }

  state.known_report_ids = [...knownIds];
  state.last_sync = new Date().toISOString();
  state.sync_stats = { new_reports: newCount, total_files: files.length };

  return state;
}

// Create a fresh empty state
function createEmptyState(sourceDir) {
  return {
    schema_version: 1,
    created: new Date().toISOString(),
    last_sync: null,
    source_dir: sourceDir,
    config: {
      skill_promote_threshold: 0.5,
      mcp_baseline_threshold: 0.75,
      stale_scan_days: 7,
    },
    reporters: {},
    known_report_ids: [],
  };
}

// ─── Team Aggregation ────────────────────────────────────────────────

function aggregateTeam(state) {
  const reporters = Object.entries(state.reporters);
  const latestScans = reporters.map(([label, r]) => ({
    label,
    scan: r.scans[0], // newest
    history: r.scans,
  }));

  return {
    coverage: {
      total_reporters: reporters.length,
      total_scans: reporters.reduce((n, [, r]) => n + r.scans.length, 0),
      stale: latestScans.filter(r => isStale(r.scan, state.config.stale_scan_days)).length,
      last_scan: latestScans.reduce((latest, r) => {
        if (!latest || new Date(r.scan.timestamp) > new Date(latest.timestamp)) return r.scan;
        return latest;
      }, null),
    },
    maturity: aggregateMaturity(latestScans),
    standardization: proposeStandardization(latestScans, state.config),
    tool_chains: aggregateToolChains(latestScans),
    policy_compliance: aggregatePolicyCompliance(latestScans),
    scorecards: buildScorecards(latestScans),
  };
}

function isStale(scan, staleDays) {
  if (!scan) return true;
  const age = Date.now() - new Date(scan.timestamp).getTime();
  return age > staleDays * 24 * 60 * 60 * 1000;
}

// ─── Maturity ────────────────────────────────────────────────────────

function aggregateMaturity(latestScans) {
  const distribution = { Expert: 0, Advanced: 0, Intermediate: 0, 'Getting Started': 0 };
  let totalScore = 0;
  let totalMax = 0;

  for (const { scan } of latestScans) {
    const label = scan.maturity?.label || 'Getting Started';
    if (distribution[label] !== undefined) distribution[label]++;
    totalScore += scan.score?.total || 0;
    totalMax += scan.score?.max || 67;
  }

  const n = latestScans.length || 1;
  return {
    distribution,
    avg_score: Math.round(totalScore / n),
    avg_max: Math.round(totalMax / n),
    avg_label: tierLabel(totalScore / n, totalMax / n),
  };
}

function tierLabel(score, max) {
  const pct = max > 0 ? (score / max) * 100 : 0;
  if (pct >= 90) return 'Expert';
  if (pct >= 70) return 'Advanced';
  if (pct >= 50) return 'Intermediate';
  return 'Getting Started';
}

// ─── Cross-Reference: Skills ─────────────────────────────────────────

function crossRefSkills(latestScans) {
  const skillMap = {}; // skill name → Set of reporter labels

  for (const { label, scan } of latestScans) {
    for (const skill of scan.skills || []) {
      if (!skillMap[skill.name]) skillMap[skill.name] = new Set();
      skillMap[skill.name].add(label);
    }
  }

  const n = latestScans.length;
  return Object.entries(skillMap)
    .map(([name, reporters]) => ({
      name,
      reporters: [...reporters],
      count: reporters.size,
      adoption: n > 0 ? reporters.size / n : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Cross-Reference: MCP Servers ────────────────────────────────────

function crossRefMcpServers(latestScans) {
  const serverMap = {};

  for (const { label, scan } of latestScans) {
    for (const server of scan.mcp_servers || []) {
      if (!serverMap[server]) serverMap[server] = new Set();
      serverMap[server].add(label);
    }
  }

  const n = latestScans.length;
  return Object.entries(serverMap)
    .map(([name, reporters]) => ({
      name,
      reporters: [...reporters],
      count: reporters.size,
      adoption: n > 0 ? reporters.size / n : 0,
      status: reporters.size === n ? 'universal' : reporters.size / n >= 0.75 ? 'common' : 'emerging',
    }))
    .sort((a, b) => b.count - a.count);
}

// ─── Policy Compliance ───────────────────────────────────────────────

function aggregatePolicyCompliance(latestScans) {
  const gaps = {
    yolo_unprotected: [],
    no_deny_rm: [],
    no_modes: [],
    no_policies: [],
  };

  for (const { label, scan } of latestScans) {
    if (!scan.yolo_disabled) gaps.yolo_unprotected.push(label);
    if (!scan.policy_has_deny_rm) gaps.no_deny_rm.push(label);
    if (!scan.policy_has_modes && scan.policy_count > 0) gaps.no_modes.push(label);
    if (scan.policy_count === 0) gaps.no_policies.push(label);
  }

  return gaps;
}

// ─── Tool Chains ─────────────────────────────────────────────────────

function aggregateToolChains(latestScans) {
  const chainMap = {};

  for (const { label, scan } of latestScans) {
    for (const chain of scan.tool_chains || []) {
      if (!chainMap[chain]) chainMap[chain] = { count: 0, reporters: new Set() };
      chainMap[chain].count++;
      chainMap[chain].reporters.add(label);
    }
  }

  return Object.entries(chainMap)
    .map(([chain, data]) => ({
      chain,
      occurrences: data.count,
      reporters: [...data.reporters],
      reporter_count: data.reporters.size,
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, 10); // top 10
}

// ─── Standardization Proposals ───────────────────────────────────────

function proposeStandardization(latestScans, config) {
  const skills = crossRefSkills(latestScans);
  const mcpServers = crossRefMcpServers(latestScans);
  const policyGaps = aggregatePolicyCompliance(latestScans);
  const toolChains = aggregateToolChains(latestScans);

  return {
    skills: skills.filter(s => s.adoption >= (config.skill_promote_threshold || 0.5)),
    mcp_servers: mcpServers.filter(s => s.adoption >= (config.mcp_baseline_threshold || 0.75)),
    policy_gaps: policyGaps,
    automation_candidates: toolChains.filter(c => c.reporter_count >= 3),
    all_skills: skills,
    all_mcp_servers: mcpServers,
  };
}

// ─── Scorecards ──────────────────────────────────────────────────────

function buildScorecards(latestScans) {
  return latestScans.map(({ label, scan, history }) => {
    const prev = history.length > 1 ? history[1] : null;
    const scoreDelta = prev ? (scan.score?.total || 0) - (prev.score?.total || 0) : 0;

    let trend = '→';
    if (scoreDelta > 0) trend = '↑';
    if (scoreDelta < 0) trend = '↓';

    return {
      label,
      score: scan.score,
      maturity: scan.maturity,
      trend,
      score_delta: scoreDelta,
      skills_count: scan.skills_count,
      mcp_count: scan.mcp_count,
      policy_count: scan.policy_count,
      repos_count: scan.repos_count,
      timestamp: scan.timestamp,
      stale: isStale(scan, 7),
      scan_count: history.length,
    };
  }).sort((a, b) => (b.score?.total || 0) - (a.score?.total || 0));
}

// ─── Toolkit Assembly ────────────────────────────────────────────────
// Generates a markdown toolkit specification from selected candidates.

function assembleToolkit(selections, standardization) {
  const lines = ['# Engineering Toolkit Specification\n'];
  lines.push(`Generated: ${new Date().toISOString()}\n`);

  if (selections.skills?.length) {
    lines.push('## Skills to Standardize\n');
    for (const name of selections.skills) {
      const skill = standardization.all_skills.find(s => s.name === name);
      if (!skill) continue;
      lines.push(`### ${name}`);
      lines.push(`- **Adoption:** ${skill.count}/${skill.count + (standardization.all_skills.length - skill.reporters.length)} engineers (${Math.round(skill.adoption * 100)}%)`);
      lines.push(`- **Used by:** ${skill.reporters.join(', ')}`);
      lines.push(`- **Action:** Create shared skill in team repository\n`);
    }
  }

  if (selections.mcp_servers?.length) {
    lines.push('## MCP Server Baseline\n');
    for (const name of selections.mcp_servers) {
      const server = standardization.all_mcp_servers.find(s => s.name === name);
      if (!server) continue;
      lines.push(`### ${name}`);
      lines.push(`- **Adoption:** ${Math.round(server.adoption * 100)}%`);
      lines.push(`- **Status:** ${server.status}`);
      lines.push(`- **Action:** Add to team settings.json template\n`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  extractSummary,
  parseReporterLabel,
  syncFromSource,
  createEmptyState,
  aggregateTeam,
  crossRefSkills,
  crossRefMcpServers,
  aggregatePolicyCompliance,
  aggregateToolChains,
  proposeStandardization,
  buildScorecards,
  assembleToolkit,
};
