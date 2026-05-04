/** Minimal TOML parser for Gemini CLI policy files.
 * Handles: [[table]] arrays, quoted/unquoted strings, booleans, integers,
 * string arrays, inline tables (flat), and comments.
 * Supports all v0.40+ policy fields: toolName, decision, priority,
 * commandPrefix, commandRegex, modes, mcpName, argsPattern, denyMessage,
 * interactive, subagent, allowRedirection, toolAnnotations.
 * Does NOT handle nested tables, datetime, or multi-line strings. */
'use strict';

function parsePolicyToml(text) {
  const rules = [];
  let current = null;

  for (const raw of text.split('\n')) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;

    // Table array header: [[rule]]
    const tableMatch = line.match(/^\[\[(\w+)\]\]$/);
    if (tableMatch) {
      if (current) rules.push(current);
      current = { _table: tableMatch[1] };
      continue;
    }

    // Table header: [section] — skip (metadata sections)
    if (/^\[[\w.]+\]$/.test(line)) {
      if (current) rules.push(current);
      current = null;
      continue;
    }

    // Key-value pair
    if (!current) continue;
    const kvMatch = line.match(/^(\w[\w.-]*)?\s*=\s*(.+)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1];
    const val = kvMatch[2].trim();
    current[key] = parseValue(val);
  }

  if (current) rules.push(current);
  return rules;
}

function parseValue(val) {
  // Boolean
  if (val === 'true') return true;
  if (val === 'false') return false;

  // String array: ["a", "b"]
  if (val.startsWith('[')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return [];
    return inner.split(',').map(s => {
      s = s.trim();
      if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        return s.slice(1, -1);
      }
      return s;
    });
  }

  // Inline table: { key = value, key2 = value2 }
  if (val.startsWith('{') && val.endsWith('}')) {
    const inner = val.slice(1, -1).trim();
    if (!inner) return {};
    const obj = {};
    for (const pair of inner.split(',')) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx > 0) {
        const k = pair.slice(0, eqIdx).trim();
        const v = pair.slice(eqIdx + 1).trim();
        obj[k] = parseValue(v);
      }
    }
    return obj;
  }

  // Quoted string
  if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
    return val.slice(1, -1);
  }

  // Integer
  if (/^-?\d+$/.test(val)) return parseInt(val, 10);

  // Unquoted string (fallback)
  return val;
}

module.exports = { parsePolicyToml };
