const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSummary, issueCode, issueLabel } = require('../scripts/weekly-summary.js');

test('buildSummary reports zero checks', () => {
  const summary = buildSummary([]);
  assert.match(summary, /No prompt checks were logged/);
});

test('buildSummary computes average score and most common issue', () => {
  const entries = [
    { score: 8, issues: [{ code: 'no-verification', detail: 'x' }] },
    { score: 6, issues: [{ code: 'no-verification', detail: 'y' }] },
    { score: 4, issues: [{ code: 'no-clear-goal', detail: 'z' }] },
  ];
  const summary = buildSummary(entries);
  assert.match(summary, /Checks run: 3/);
  assert.match(summary, /Average score: 6\.0\/10/);
  assert.match(summary, /No verification criteria \(seen 2x\)/);
});

test('buildSummary tolerates missing/non-numeric scores', () => {
  const entries = [{ score: undefined, issues: [] }, { score: 'oops', issues: [] }];
  const summary = buildSummary(entries);
  assert.match(summary, /Average score: 0\.0\/10/);
});

test('issueCode handles object, plain string, and missing issue shapes', () => {
  assert.equal(issueCode({ code: 'no-clear-goal', detail: 'x' }), 'no-clear-goal');
  assert.equal(issueCode({ detail: 'x' }), 'unknown');
  assert.equal(issueCode('legacy free-text issue'), 'legacy free-text issue');
  assert.equal(issueCode(''), 'unknown');
  assert.equal(issueCode(null), 'unknown');
});

test('issueLabel falls back to the raw code for unknown codes', () => {
  assert.equal(issueLabel('no-clear-goal'), 'No clear goal');
  assert.equal(issueLabel('some-new-criterion'), 'some-new-criterion');
});
