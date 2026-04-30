'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

// Save original env before importing (tui reads env at call time)
const origEnv = { ...process.env };

const { getAuthStatus, hasAICredentials, C, DEFAULT_OUT, promptRepos, promptChatDays } = require('../tui');

// Helper: create a mock readline that auto-answers with the given value
function mockRL(answer) {
  return {
    question: (_prompt, cb) => { cb(answer); },
  };
}

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

// ─── promptRepos tests ───────────────────────────────────────────────
describe('promptRepos', () => {
  it('returns BACK when user types "b"', async () => {
    const result = await promptRepos(mockRL('b'));
    assert.equal(result, 'BACK');
  });

  it('returns BACK when user types "back"', async () => {
    const result = await promptRepos(mockRL('back'));
    assert.equal(result, 'BACK');
  });

  it('returns BACK case-insensitively', async () => {
    const result = await promptRepos(mockRL('BACK'));
    assert.equal(result, 'BACK');
  });

  it('returns empty array when user types "n"', async () => {
    const result = await promptRepos(mockRL('n'));
    assert.deepEqual(result, []);
  });

  it('returns empty array when user types "no"', async () => {
    const result = await promptRepos(mockRL('no'));
    assert.deepEqual(result, []);
  });

  it('returns empty array on empty input', async () => {
    const result = await promptRepos(mockRL(''));
    assert.deepEqual(result, []);
  });

  it('returns single path', async () => {
    const result = await promptRepos(mockRL('~/Code'));
    assert.deepEqual(result, ['~/Code']);
  });

  it('splits space-separated paths', async () => {
    const result = await promptRepos(mockRL('~/proj-a ~/proj-b'));
    assert.deepEqual(result, ['~/proj-a', '~/proj-b']);
  });

  it('splits comma-separated paths', async () => {
    const result = await promptRepos(mockRL('~/proj-a,~/proj-b'));
    assert.deepEqual(result, ['~/proj-a', '~/proj-b']);
  });

  it('splits mixed comma+space paths', async () => {
    const result = await promptRepos(mockRL('~/a, ~/b ~/c'));
    assert.deepEqual(result, ['~/a', '~/b', '~/c']);
  });

  it('trims leading/trailing whitespace', async () => {
    const result = await promptRepos(mockRL('  ~/Code  '));
    assert.deepEqual(result, ['~/Code']);
  });

  it('filters out empty segments from multiple commas', async () => {
    const result = await promptRepos(mockRL('~/a,,~/b'));
    assert.deepEqual(result, ['~/a', '~/b']);
  });
});

// ─── promptChatDays tests ────────────────────────────────────────────
describe('promptChatDays', () => {
  it('returns BACK when user types "b"', async () => {
    const result = await promptChatDays(mockRL('b'));
    assert.equal(result, 'BACK');
  });

  it('returns BACK when user types "back"', async () => {
    const result = await promptChatDays(mockRL('back'));
    assert.equal(result, 'BACK');
  });

  it('returns null on empty input (all history)', async () => {
    const result = await promptChatDays(mockRL(''));
    assert.equal(result, null);
  });

  it('returns parsed integer for valid number', async () => {
    const result = await promptChatDays(mockRL('30'));
    assert.equal(result, 30);
  });

  it('returns parsed integer for single digit', async () => {
    const result = await promptChatDays(mockRL('7'));
    assert.equal(result, 7);
  });

  it('returns null for non-numeric input', async () => {
    const result = await promptChatDays(mockRL('abc'));
    assert.equal(result, null);
  });
});
