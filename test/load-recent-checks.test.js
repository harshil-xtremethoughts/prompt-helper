const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { loadRecentChecks } = require('../scripts/weekly-summary.js');

function makeTmpLogDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-helper-test-'));
}

test('loadRecentChecks reads only checks-*.jsonl files within the time window', () => {
  const dir = makeTmpLogDir();
  const now = new Date().toISOString();
  const old = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  fs.writeFileSync(
    path.join(dir, 'checks-a-machine.jsonl'),
    `${JSON.stringify({ timestamp: now, score: 7, issues: [] })}\n` +
      `${JSON.stringify({ timestamp: old, score: 2, issues: [] })}\n`
  );
  fs.writeFileSync(path.join(dir, 'not-a-check.txt'), 'ignore me');

  const entries = loadRecentChecks(dir);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 7);
});

test('loadRecentChecks with Infinity window returns everything, ignoring reformatted files', () => {
  const dir = makeTmpLogDir();
  fs.writeFileSync(
    path.join(dir, 'checks-b-machine.jsonl'),
    `${JSON.stringify({ timestamp: new Date().toISOString(), score: 5, issues: [] })}\n`
  );
  // A pretty-printed (multi-line) entry - simulates the "reformatted file" gotcha.
  fs.writeFileSync(path.join(dir, 'checks-broken-machine.jsonl'), '{\n  "score": 9\n}\n');

  const entries = loadRecentChecks(dir, Infinity);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].score, 5);
});

test('loadRecentChecks returns empty array for a missing directory', () => {
  const entries = loadRecentChecks(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
  assert.deepEqual(entries, []);
});
