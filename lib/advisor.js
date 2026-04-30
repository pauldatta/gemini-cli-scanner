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

function computeMaturity(recommendations) {
  let score = 100;
  for (const r of recommendations) {
    if (r.severity === 'critical') score -= 10;
    else if (r.severity === 'warning') score -= 5;
    else score -= 1; // info
  }
  score = Math.max(0, Math.min(100, score));
  const tier = MATURITY_TIERS.find(t => score >= t.min);
  return { score, label: tier.label, emoji: tier.emoji };
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
  ];

  const maturity = computeMaturity(recommendations);

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
