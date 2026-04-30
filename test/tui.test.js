'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Save original env before importing (tui reads env at call time)
const origEnv = { ...process.env };

const { getAuthStatus, hasAICredentials, C, DEFAULT_OUT } = require('../tui');

describe('hasAICredentials', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
  });
  afterEach(() => {
    // Restore original env
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
    if (origEnv.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = origEnv.GOOGLE_CLOUD_PROJECT;
    if (origEnv.GOOGLE_API_KEY) process.env.GOOGLE_API_KEY = origEnv.GOOGLE_API_KEY;
  });

  it('returns false when no env vars set', () => {
    assert.equal(hasAICredentials(), false);
  });

  it('returns true when GOOGLE_API_KEY is set', () => {
    process.env.GOOGLE_API_KEY = 'AIzaSyTest1234567890123456789012345678';
    assert.equal(hasAICredentials(), true);
  });

  it('returns true when GOOGLE_CLOUD_PROJECT is set', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-test-project';
    assert.equal(hasAICredentials(), true);
  });

  it('returns true when both are set', () => {
    process.env.GOOGLE_API_KEY = 'AIzaSyTest1234567890123456789012345678';
    process.env.GOOGLE_CLOUD_PROJECT = 'my-test-project';
    assert.equal(hasAICredentials(), true);
  });
});

describe('getAuthStatus', () => {
  beforeEach(() => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
  });
  afterEach(() => {
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.GOOGLE_API_KEY;
    if (origEnv.GOOGLE_CLOUD_PROJECT) process.env.GOOGLE_CLOUD_PROJECT = origEnv.GOOGLE_CLOUD_PROJECT;
    if (origEnv.GOOGLE_API_KEY) process.env.GOOGLE_API_KEY = origEnv.GOOGLE_API_KEY;
  });

  it('shows warning when no credentials', () => {
    const status = getAuthStatus();
    assert.ok(status.includes('No AI credentials'), 'should mention no credentials');
  });

  it('shows Vertex AI status with project name', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'gpu-launchpad-playground';
    const status = getAuthStatus();
    assert.ok(status.includes('Vertex AI'), 'should mention Vertex AI');
    assert.ok(status.includes('gpu-launchpad-playground'), 'should include project name');
  });

  it('shows API Key status when key is set', () => {
    process.env.GOOGLE_API_KEY = 'AIzaSyTest1234567890123456789012345678';
    const status = getAuthStatus();
    assert.ok(status.includes('API Key'), 'should mention API Key');
    assert.ok(status.includes('configured'), 'should say configured');
  });

  it('prefers Vertex AI over API Key when both set', () => {
    process.env.GOOGLE_CLOUD_PROJECT = 'my-project';
    process.env.GOOGLE_API_KEY = 'AIzaSyTest1234567890123456789012345678';
    const status = getAuthStatus();
    assert.ok(status.includes('Vertex AI'), 'should show Vertex AI when both are set');
  });
});

describe('TUI constants', () => {
  it('DEFAULT_OUT is scan-results', () => {
    assert.equal(DEFAULT_OUT, './scan-results');
  });

  it('color codes are ANSI escape sequences', () => {
    assert.ok(C.reset.startsWith('\x1b['), 'reset should be ANSI');
    assert.ok(C.cyan.startsWith('\x1b['), 'cyan should be ANSI');
    assert.ok(C.green.startsWith('\x1b['), 'green should be ANSI');
    assert.ok(C.bold.startsWith('\x1b['), 'bold should be ANSI');
  });

  it('exports all required color codes', () => {
    const required = ['reset', 'bold', 'dim', 'cyan', 'green', 'yellow', 'magenta', 'red', 'white'];
    for (const key of required) {
      assert.ok(C[key], `color ${key} should be defined`);
    }
  });
});
