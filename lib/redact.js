/** Credential redaction helpers — zero external deps */
'use strict';

const SECRET_PATTERNS = [
  /AIza[0-9A-Za-z\-_]{35}/,
  /ya29\.[0-9A-Za-z\-_]+/,
  /sk-[a-zA-Z0-9]{20,}/,
  /ghp_[a-zA-Z0-9]{36}/,
  /xox[baprs]-[a-zA-Z0-9\-]+/,
];

const SENSITIVE_KEYS = new Set([
  'api_key','apikey','token','secret','password','credential',
  'authorization','x-goog-api-key','x-api-key',
]);

function isSensitiveKey(key) {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function redactValue(key, val) {
  if (typeof val !== 'string') return val;
  if (isSensitiveKey(key)) return `[REDACTED-${val.length}chars]`;
  for (const rx of SECRET_PATTERNS) {
    if (rx.test(val)) return `[REDACTED-${val.length}chars]`;
  }
  return val;
}

function redactDict(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map((item, i) =>
      typeof item === 'object' && item !== null ? redactDict(item) : redactValue(String(i), item)
    );
  }
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== null && typeof v === 'object') out[k] = redactDict(v);
    else out[k] = redactValue(k, v);
  }
  return out;
}

module.exports = { redactDict, redactValue };
