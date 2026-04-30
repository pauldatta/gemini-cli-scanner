/** Tests for lib/redact.js */
'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { redactDict, redactValue } = require('../lib/redact');

describe('redactValue', () => {
  it('redacts Google API keys', () => {
    const val = 'AIzaSyDabc123xyz789_ABCDEFGHIJKLMNOPQRS';
    assert.match(redactValue('someKey', val), /\[REDACTED-/);
  });

  it('redacts OAuth tokens', () => {
    assert.match(redactValue('tok', 'ya29.some-long-oauth-token-value'), /\[REDACTED-/);
  });

  it('redacts OpenAI keys', () => {
    assert.match(redactValue('key', 'sk-abcdefghijklmnopqrstuvwxyz'), /\[REDACTED-/);
  });

  it('redacts GitHub PATs', () => {
    assert.match(redactValue('token', 'ghp_abcdefghijklmnopqrstuvwxyz1234567890'), /\[REDACTED-/);
  });

  it('redacts by sensitive key name', () => {
    assert.match(redactValue('api_key', 'totally-normal-value'), /\[REDACTED-/);
    assert.match(redactValue('Authorization', 'Bearer xyz'), /\[REDACTED-/);
    assert.match(redactValue('password', 'hunter2'), /\[REDACTED-/);
  });

  it('preserves non-sensitive values', () => {
    assert.equal(redactValue('name', 'my-server'), 'my-server');
    assert.equal(redactValue('command', 'npx'), 'npx');
  });

  it('handles non-string values', () => {
    assert.equal(redactValue('count', 42), 42);
    assert.equal(redactValue('flag', true), true);
  });
});

describe('redactDict', () => {
  it('redacts nested sensitive keys', () => {
    const input = { server: { api_key: 'secret123', command: 'npx' } };
    const result = redactDict(input);
    assert.match(result.server.api_key, /\[REDACTED-/);
    assert.equal(result.server.command, 'npx');
  });

  it('redacts values in arrays', () => {
    const input = { tokens: ['sk-abcdefghijklmnopqrstuvwxyz', 'normal'] };
    const result = redactDict(input);
    assert.match(result.tokens[0], /\[REDACTED-/);
    assert.equal(result.tokens[1], 'normal');
  });

  it('handles null and primitives', () => {
    assert.equal(redactDict(null), null);
    assert.equal(redactDict(42), 42);
  });

  it('preserves structure', () => {
    const input = { a: { b: { c: 'safe' } } };
    const result = redactDict(input);
    assert.equal(result.a.b.c, 'safe');
  });
});
