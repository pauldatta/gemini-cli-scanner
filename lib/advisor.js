/** Best Practices Advisory Engine for Gemini CLI configurations.
 * Pure functions — takes a scan manifest, returns actionable recommendations.
 * Each check is grounded in the official Gemini CLI documentation. */
'use strict';
const { parsePolicyToml } = require('./toml-lite');

const GCLI_DOCS = 'https://github.com/google-gemini/gemini-cli/blob/main/docs';

// ─── Maturity Rating ─────────────────────────────────────────────────

const MATURITY_TIERS = [
  { min: 90, label: 'Expert',          emoji: '🟢' },
  { min: 70, label: 'Advanced',        emoji: '🔵' },
  { min: 50, label: 'Intermediate',    emoji: '🟡' },
  { min: 0,  label: 'Getting Started', emoji: '🟠' },
];

function computeMaturity(recommendations, sophisticationScore) {
  const total = sophisticationScore?.total || 0;
  const max = sophisticationScore?.max || 67;
  // Normalize to 0-100 for tier comparison
  const score = Math.round((total / max) * 100);
  const tier = MATURITY_TIERS.find(t => score >= t.min);
  return { score: total, max, label: tier.label, emoji: tier.emoji };
}

// ─── Recommendation Builder ──────────────────────────────────────────

function rec(category, severity, title, detail, docPath) {
  return {
    category,
    severity,
    title,
    detail,
    reference: docPath ? `${GCLI_DOCS}/${docPath}` : null,
  };
}

// ─── Advisory Checks ─────────────────────────────────────────────────

function checkPolicyHygiene(manifest) {
  const recs = [];
  const policies = manifest.policies || {};
  const settings = manifest.settings || {};

  // No policy files at all
  if (!policies.found) {
    recs.push(rec('policy_hygiene', 'warning',
      'No policy files configured',
      'Create ~/.gemini/policies/safety.toml with baseline rules. The policy engine lets you deny destructive commands (rm -rf), require approval for sensitive operations, and scope tool access by project.',
      'reference/policy-engine.md'));
  } else {
    // Parse policy files and check content
    const allRules = [];
    for (const [filename, content] of Object.entries(policies.files || {})) {
      const rules = parsePolicyToml(content);
      for (const r of rules) r._filename = filename;
      allRules.push(...rules);
    }

    // Check for rm -rf deny rule
    const hasDenyRm = allRules.some(r =>
      r.decision === 'deny' && (r.commandPrefix || '').includes('rm '));
    if (!hasDenyRm) {
      recs.push(rec('policy_hygiene', 'info',
        'No deny rule for destructive commands',
        'Consider adding a policy rule to deny rm -rf, git push --force, or other destructive commands. Example: decision = "deny", toolName = "ShellTool", commandPrefix = "rm -rf".',
        'reference/policy-engine.md'));
    }

    // Check for duplicate rules (same toolName + commandPrefix in multiple files)
    const ruleKeys = {};
    for (const r of allRules) {
      const key = `${r.toolName || ''}:${r.commandPrefix || ''}`;
      if (!ruleKeys[key]) ruleKeys[key] = [];
      ruleKeys[key].push(r._filename);
    }
    for (const [key, files] of Object.entries(ruleKeys)) {
      if (files.length > 1) {
        recs.push(rec('policy_hygiene', 'info',
          `Duplicate policy rule: ${key}`,
          `Rule "${key}" defined in multiple files: ${files.join(', ')}. Higher-priority files override lower ones, which may cause confusion.`,
          'reference/policy-engine.md'));
      }
    }
  }

  // Deprecated tools.exclude still in use
  if (settings.found) {
    const rawExclude = manifest._raw_settings?.tools?.exclude;
    if (rawExclude && rawExclude.length) {
      recs.push(rec('policy_hygiene', 'warning',
        'Deprecated tools.exclude in use',
        `tools.exclude is deprecated. Migrate to the Policy Engine for more robust control. You have ${rawExclude.length} excluded tool(s): ${rawExclude.join(', ')}.`,
        'reference/policy-engine.md'));
    }
  }

  // ── v0.40+ Policy Depth Checks ──
  const parsedRules = policies.parsed_rules || [];
  if (parsedRules.length > 0) {
    // No approval mode coverage
    const anyModes = parsedRules.some(r => r.modes && r.modes.length > 0);
    if (!anyModes) {
      recs.push(rec('policy_hygiene', 'warning',
        'No approval mode coverage',
        'None of your policy rules specify `modes`. This means all rules apply uniformly to default, plan, and yolo modes. Consider adding mode-specific rules (e.g., stricter denials in yolo mode).',
        'reference/policy-engine.md'));
    }

    // YOLO without safeguards
    const yoloDisabled = manifest._raw_settings?.security?.disableYoloMode;
    if (!yoloDisabled) {
      const hasYoloDeny = parsedRules.some(r => r.decision === 'deny' && r.modes && r.modes.includes('yolo'));
      if (!hasYoloDeny) {
        recs.push(rec('policy_hygiene', 'critical',
          'YOLO mode enabled without safeguards',
          'YOLO mode is not disabled and no deny rules are scoped to yolo mode. This means all tool executions in yolo mode bypass approval. Add deny rules with modes = ["yolo"] for destructive commands, or disable YOLO entirely.',
          'reference/policy-engine.md'));
      }
    }

    // Plan mode unprotected
    const hasPlanRule = parsedRules.some(r => r.modes && r.modes.includes('plan'));
    if (!hasPlanRule && anyModes) {
      recs.push(rec('policy_hygiene', 'warning',
        'Plan mode has no specific rules',
        'You have mode-specific policy rules but none targeting plan mode. Plan mode auto-approves tool calls within an approved plan — consider adding deny rules for destructive commands in plan mode.',
        'reference/policy-engine.md'));
    }

    // MCP servers without policy rules
    const mcpServers = Object.keys(manifest.settings?.mcp_servers || {});
    if (mcpServers.length > 0) {
      const rulesWithMcp = parsedRules.filter(r => r.mcpName);
      const governedServers = new Set(rulesWithMcp.map(r => r.mcpName));
      const ungoverned = mcpServers.filter(s => !governedServers.has(s));
      if (ungoverned.length > 0) {
        recs.push(rec('policy_hygiene', 'warning',
          `${ungoverned.length} MCP server(s) have no policy rules`,
          `Servers without mcpName-scoped rules: ${ungoverned.join(', ')}. These servers use default tool approval. Add rules with mcpName to enforce per-server governance.`,
          'reference/policy-engine.md'));
      }
    }

    // Missing denyMessage
    const denyWithoutMsg = parsedRules.filter(r => r.decision === 'deny' && !r.denyMessage);
    if (denyWithoutMsg.length > 0) {
      recs.push(rec('policy_hygiene', 'info',
        `${denyWithoutMsg.length} deny rule(s) missing denyMessage`,
        'When a deny rule blocks a tool call, denyMessage explains why to the model. Without it, the model gets a generic block notice. Add denyMessage to each deny rule for better agent behavior.',
        'reference/policy-engine.md'));
    }

    // No headless-mode rules
    const hasInteractiveRule = parsedRules.some(r => r.interactive !== null);
    if (!hasInteractiveRule && (manifest.conversations?.total_sessions || 0) > 0) {
      recs.push(rec('policy_hygiene', 'info',
        'No headless-mode policy rules',
        'You have conversation history but no rules with interactive = false. Headless (non-interactive) runs use the same permissions as interactive sessions. Consider adding stricter rules for headless mode.',
        'reference/policy-engine.md'));
    }

    // commandRegex usage warning
    const regexRules = parsedRules.filter(r => r.commandRegex);
    if (regexRules.length > 0) {
      recs.push(rec('policy_hygiene', 'info',
        `${regexRules.length} rule(s) use commandRegex`,
        'commandRegex patterns can be brittle. Verify they match only the intended commands. Consider adding unit tests for your regex patterns.',
        'reference/policy-engine.md'));
    }
  }

  // Admin policies check
  const adminPolicies = manifest.admin_policies || {};
  if (!adminPolicies.found) {
    if (adminPolicies.skipped_reason) {
      recs.push(rec('policy_hygiene', 'info',
        'Admin policies not accessible',
        adminPolicies.skipped_reason,
        'reference/policy-engine.md'));
    } else {
      recs.push(rec('policy_hygiene', 'info',
        'No admin (system-level) policies detected',
        'System-level policies in /Library/Application Support/GeminiCli/policies/ or /etc/gemini-cli/policies/ are not present. In enterprise environments, these provide organization-wide baseline rules that override user policies.',
        'reference/policy-engine.md'));
    }
  }

  return recs;
}

function checkMcpGovernance(manifest) {
  const recs = [];
  const settings = manifest.settings || {};
  const mcpServers = settings.mcp_servers || {};
  const serverNames = Object.keys(mcpServers);

  if (!serverNames.length) return recs;

  // No mcp.allowed list
  const mcpAllowed = manifest._raw_settings?.mcp?.allowed;
  if (!mcpAllowed) {
    recs.push(rec('mcp_governance', 'warning',
      'No MCP allowlist configured',
      'Without mcp.allowed, any settings layer (user, workspace) can add MCP servers. Define an explicit allowlist in your system or user settings to prevent unauthorized server additions.',
      'cli/enterprise.md'));
  } else {
    // Servers defined but not in allowlist
    for (const name of serverNames) {
      if (!mcpAllowed.includes(name)) {
        recs.push(rec('mcp_governance', 'info',
          `MCP server "${name}" not in allowlist`,
          `Server "${name}" is defined in settings but not listed in mcp.allowed. It may be blocked at runtime if an allowlist is enforced at a higher config layer.`,
          'cli/enterprise.md'));
      }
    }
  }

  // Servers without includeTools/excludeTools (over-permissioned)
  for (const [name, cfg] of Object.entries(mcpServers)) {
    const rawCfg = manifest._raw_settings?.mcpServers?.[name] || {};
    if (!rawCfg.includeTools && !rawCfg.excludeTools) {
      recs.push(rec('mcp_governance', 'info',
        `MCP server "${name}" has no tool filtering`,
        `Server "${name}" exposes all its tools to the model. Use includeTools to restrict to only the tools you need (principle of least privilege).`,
        'cli/enterprise.md'));
    }
  }

  // Cross-reference with repo-level MCP for duplication
  for (const repo of (manifest.repos || [])) {
    const repoMcp = repo.gemini_config?.mcp_details || {};
    for (const repoServer of Object.keys(repoMcp)) {
      if (serverNames.includes(repoServer)) {
        recs.push(rec('mcp_governance', 'info',
          `Duplicate MCP server: "${repoServer}"`,
          `Server "${repoServer}" is defined in both global settings and project "${repo.name}". The global definition takes precedence — the project-level one is redundant.`,
          'reference/configuration.md'));
      }
    }
  }

  return recs;
}

function checkGeminiMdQuality(manifest) {
  const recs = [];
  const gmd = manifest.global_gemini_md || {};

  // Missing global GEMINI.md
  if (!gmd.found) {
    recs.push(rec('gemini_md_quality', 'warning',
      'No global GEMINI.md found',
      'Create ~/.gemini/GEMINI.md to provide default instructions for all projects. This is loaded automatically in every session and is the right place for coding preferences, conventions, and persona instructions.',
      'cli/gemini-md.md'));
  } else {
    // Too thin (global only — project-level can be thin)
    if ((gmd.word_count || 0) < 50) {
      recs.push(rec('gemini_md_quality', 'info',
        'Global GEMINI.md is thin',
        `Your global GEMINI.md has only ${gmd.word_count} words. Consider adding sections for coding style, testing preferences, and project conventions to improve response quality.`,
        'cli/gemini-md.md'));
    }

    // Missing recommended sections
    const sections = (gmd.sections || []).map(s => s.toLowerCase());
    const recommended = [
      { pattern: /style|convention|format/i, label: 'Coding Style / Conventions' },
      { pattern: /test/i, label: 'Testing Preferences' },
    ];
    for (const { pattern, label } of recommended) {
      if (!sections.some(s => pattern.test(s))) {
        recs.push(rec('gemini_md_quality', 'info',
          `Global GEMINI.md missing "${label}" section`,
          `Adding a "${label}" section to your GEMINI.md helps the model follow your team's standards consistently.`,
          'cli/gemini-md.md'));
      }
    }
  }

  return recs;
}

function checkSkillsOptimization(manifest) {
  const recs = [];
  const skills = manifest.skills || [];

  for (const skill of skills) {
    // Missing frontmatter description
    if (!skill.description) {
      recs.push(rec('skills_optimization', 'warning',
        `Skill "${skill.name}" has no description`,
        `Without a description in the YAML frontmatter, the agent cannot discover when to activate this skill. Add a description that explains the trigger scenario.`,
        'cli/skills.md'));
    }

    // Check SKILL.md body for Gotchas and Validation sections
    if (skill.has_skill_md) {
      if (!skill._has_gotchas) {
        recs.push(rec('skills_optimization', 'info',
          `Skill "${skill.name}" missing Gotchas section`,
          'Add a "## Gotchas" section to document environment-specific traps, edge cases, and known issues that the agent should watch for.',
          'cli/skills.md'));
      }
      if (!skill._has_validation) {
        recs.push(rec('skills_optimization', 'info',
          `Skill "${skill.name}" missing Validation section`,
          'Add a "## Validation" section with verification commands so the agent can confirm multi-step workflows completed successfully.',
          'cli/skills.md'));
      }
    }
  }

  // Cross-tier duplicates (workspace vs user)
  const repoSkillNames = new Set();
  for (const repo of (manifest.repos || [])) {
    for (const sk of (repo.gemini_config?.skills || [])) {
      if (skills.some(s => s.name === sk.name)) {
        repoSkillNames.add(sk.name);
      }
    }
  }
  for (const name of repoSkillNames) {
    recs.push(rec('skills_optimization', 'info',
      `Skill "${name}" exists in both user and workspace`,
      `Workspace skills override user skills with the same name. If this is intentional, consider removing the user-level copy to avoid confusion.`,
      'cli/skills.md'));
  }

  return recs;
}

function checkSettingsOptimization(manifest) {
  const recs = [];
  const raw = manifest._raw_settings || {};

  // disableYoloMode
  if (!raw.security?.disableYoloMode) {
    recs.push(rec('settings_optimization', 'info',
      'YOLO mode not disabled',
      'Set security.disableYoloMode: true to require explicit user confirmation for all tool executions. This is strongly recommended in enterprise environments.',
      'cli/enterprise.md'));
  }

  // enablePermanentToolApproval (risky if enabled)
  if (raw.security?.enablePermanentToolApproval) {
    recs.push(rec('settings_optimization', 'warning',
      'Permanent tool approval is enabled',
      'security.enablePermanentToolApproval allows tools to be approved once and never asked again. Consider disabling this for better security posture.',
      'cli/settings.md'));
  }

  // model.name not set
  if (!raw.model?.name) {
    recs.push(rec('settings_optimization', 'info',
      'No explicit model configured',
      'You\'re relying on the default model routing. Set model.name in settings.json if you need a specific model (e.g., for cost control or capability requirements).',
      'cli/settings.md'));
  }

  return recs;
}

function checkHooksUtilization(manifest) {
  const recs = [];
  const hooks = manifest._raw_settings?.hooks;

  if (!hooks || Object.keys(hooks).length === 0) {
    recs.push(rec('hooks_utilization', 'info',
      'No hooks configured — unlock automation potential',
      'Hooks let you inject context, validate tool arguments, enforce policies, and log interactions at 11 lifecycle events: SessionStart, BeforeAgent, BeforeTool, AfterTool, and more. They run synchronously in the agent loop for real-time control.',
      'hooks/index.md'));
  }

  // Hooks globally disabled
  if (manifest._raw_settings?.hooksConfig?.enabled === false) {
    recs.push(rec('hooks_utilization', 'warning',
      'Hooks are globally disabled',
      'hooksConfig.enabled is set to false, which disables all configured hooks. Re-enable to activate your hook pipeline.',
      'hooks/index.md'));
  }

  return recs;
}

function checkExtensionHealth(manifest) {
  const recs = [];
  const ext = manifest.extensions || {};

  if (!ext.found) return recs;

  const exts = ext.extensions || [];
  const enablement = ext.enablement || {};

  // Extensions disabled
  for (const name of exts) {
    if (enablement[name]?.enabled === false) {
      recs.push(rec('extension_health', 'info',
        `Extension "${name}" is installed but disabled`,
        'Disabled extensions still consume disk space and clutter the extension list. Consider uninstalling it if you no longer need it, or re-enable it.',
        'cli/settings.md'));
    }
  }

  // Empty extension directory
  if (exts.length === 0) {
    recs.push(rec('extension_health', 'info',
      'Extension directory exists but is empty',
      'The ~/.gemini/extensions/ directory exists but contains no extensions. You can install extensions with `gemini extensions install` or remove the empty directory.',
      'cli/settings.md'));
  }

  return recs;
}

function checkContextArchitecture(manifest) {
  const recs = [];

  // No .geminiignore in any repo
  const repos = manifest.repos || [];
  const anyIgnore = repos.some(r => r._has_geminiignore);
  if (repos.length > 0 && !anyIgnore) {
    recs.push(rec('context_architecture', 'info',
      'No .geminiignore files found in scanned projects',
      'A .geminiignore file works like .gitignore but for the Gemini CLI context system. Use it to exclude build outputs, generated files, and sensitive directories from being sent to the model.',
      'cli/gemini-md.md'));
  }

  return recs;
}

// ─── Memory Hygiene ──────────────────────────────────────────────────

function checkMemoryHygiene(manifest) {
  const recs = [];
  const mem = manifest.memory_tiers;
  if (!mem) return recs;

  // Global tier missing
  if (!mem.global?.found) {
    recs.push(rec('memory_architecture', 'info',
      'No global GEMINI.md memory',
      'Create ~/.gemini/GEMINI.md to store global personal instructions loaded into every session. This is the foundation of the four-tier memory hierarchy.',
      'cli/gemini-md.md'));
  }

  // Private memory bloat
  for (const proj of (mem.private_projects || [])) {
    if (proj.memory_md?.found && proj.memory_md.word_count > 5000) {
      recs.push(rec('memory_architecture', 'warning',
        `Private memory bloat: project ${proj.project_hash.slice(0, 8)}...`,
        `MEMORY.md for this project has ${proj.memory_md.word_count} words. Large memory files slow down context loading. Consider splitting into focused sibling files or pruning stale facts.`,
        'tools/memory.md'));
    }
  }

  // Unused private tier
  const hasAnyPrivateMemory = (mem.private_projects || []).some(p => p.memory_md?.found || p.sibling_files?.length);
  if (!hasAnyPrivateMemory && (manifest.conversations?.total_sessions || 0) > 10) {
    recs.push(rec('memory_architecture', 'info',
      'No private project memory files detected',
      'With over 10 sessions, the CLI\'s auto-memory feature can extract project-specific facts into per-project MEMORY.md files. Check if autoMemory is enabled in settings.',
      'tools/memory.md'));
  }

  // Cross-tier duplication (global vs private)
  if (mem.global?.found && mem.global.content) {
    const globalBullets = (mem.global.content.match(/^- .+$/gm) || []).map(b => b.slice(2).trim().slice(0, 50).toLowerCase());
    for (const proj of (mem.private_projects || [])) {
      if (!proj.memory_md?.found || !proj.memory_md.content) continue;
      const projBullets = (proj.memory_md.content.match(/^- .+$/gm) || []).map(b => b.slice(2).trim().slice(0, 50).toLowerCase());
      const dupes = globalBullets.filter(b => projBullets.includes(b));
      if (dupes.length > 0) {
        recs.push(rec('memory_architecture', 'warning',
          `${dupes.length} duplicate fact(s) between global and project memory`,
          `Project ${proj.project_hash.slice(0, 8)}... shares ${dupes.length} bullet(s) with your global GEMINI.md. This wastes context window. Move project-specific facts to private memory only.`,
          'tools/memory.md'));
      }
    }
  }

  // autoMemory not configured
  if (mem.autoMemory?.enabled === null) {
    recs.push(rec('memory_architecture', 'info',
      'autoMemory not configured',
      'The autoMemory setting controls whether the CLI automatically extracts and saves facts from your conversations. Set autoMemory in settings.json to enable automatic memory management.',
      'tools/memory.md'));
  }

  // Only 1 tier in use
  if (mem.summary?.tiers_in_use === 1 && (manifest.conversations?.total_sessions || 0) > 5) {
    recs.push(rec('memory_architecture', 'info',
      'Only 1 memory tier in use',
      'You\'re using only one of the four available memory tiers. The hierarchy (Global → Extension → Project → Private) helps scope facts appropriately. Consider adding project-level memory for frequently used repos.',
      'tools/memory.md'));
  }

  return recs;
}

// ─── Skill Extraction Health ─────────────────────────────────────────

function checkSkillExtraction(manifest) {
  const recs = [];
  const ext = manifest.skill_extraction;
  if (!ext) return recs;

  // Large inbox backlog
  if (ext.inbox?.skills?.length >= 3) {
    recs.push(rec('skills_optimization', 'warning',
      `${ext.inbox.skills.length} skills awaiting approval in inbox`,
      `The CLI\'s auto-extraction agent has proposed ${ext.inbox.skills.length} skills that haven\'t been reviewed. Run \`gemini memory\` to review and approve or reject these candidates.`,
      'cli/skills.md'));
  }

  // Extraction inactive
  if (ext.found && ext.last_run) {
    const daysSinceRun = (Date.now() - new Date(ext.last_run).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceRun > 14) {
      recs.push(rec('skills_optimization', 'warning',
        'Skill extraction inactive for 14+ days',
        `Last extraction run was ${Math.round(daysSinceRun)} days ago. If autoMemory is enabled, the extraction agent should run automatically on session startup. Check for errors or disabled autoMemory.`,
        'cli/skills.md'));
    }
  }

  // Extraction never run
  if (!ext.found && (manifest.conversations?.total_sessions || 0) > 10) {
    recs.push(rec('skills_optimization', 'info',
      'Skill extraction has never run',
      'No .extraction-state.json found. The CLI\'s background extraction agent identifies repeating workflows and proposes reusable skills. Enable autoMemory to activate this feature.',
      'cli/skills.md'));
  }

  // Stale lock
  if (ext.stale_lock) {
    recs.push(rec('skills_optimization', 'warning',
      'Stale skill extraction lock detected',
      'An .extraction.lock file older than 30 minutes was found. This may indicate a crashed extraction run. Delete the lock file to allow extraction to resume.',
      'cli/skills.md'));
  }

  // Pending patches
  if (ext.inbox?.patches?.length > 0) {
    recs.push(rec('skills_optimization', 'info',
      `${ext.inbox.patches.length} skill patch(es) pending`,
      `The extraction agent has proposed updates to existing skills: ${ext.inbox.patches.map(p => p.target).join(', ')}. Review and apply these diffs to keep skills current.`,
      'cli/skills.md'));
  }

  return recs;
}

// ─── Main Advisory Function ──────────────────────────────────────────

function runAdvisory(manifest) {
  const recommendations = [
    ...checkPolicyHygiene(manifest),
    ...checkMcpGovernance(manifest),
    ...checkGeminiMdQuality(manifest),
    ...checkSkillsOptimization(manifest),
    ...checkSettingsOptimization(manifest),
    ...checkHooksUtilization(manifest),
    ...checkExtensionHealth(manifest),
    ...checkContextArchitecture(manifest),
    ...checkMemoryHygiene(manifest),
    ...checkSkillExtraction(manifest),
  ];

  const maturity = computeMaturity(recommendations, manifest.sophistication_score);

  // Group by category for summary
  const byCategory = {};
  for (const r of recommendations) {
    if (!byCategory[r.category]) byCategory[r.category] = [];
    byCategory[r.category].push(r);
  }

  return {
    maturity,
    recommendations,
    summary: {
      total: recommendations.length,
      critical: recommendations.filter(r => r.severity === 'critical').length,
      warnings: recommendations.filter(r => r.severity === 'warning').length,
      info: recommendations.filter(r => r.severity === 'info').length,
      categories: Object.keys(byCategory).length,
    },
    by_category: byCategory,
  };
}

module.exports = { runAdvisory, computeMaturity, MATURITY_TIERS };
