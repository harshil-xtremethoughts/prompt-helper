const test = require('node:test');
const assert = require('node:assert/strict');
const { byLength, byIssue, byWeek, byDeveloper, isoWeekKey } = require('../scripts/insights.js');

test('byLength buckets entries by prompt_length and averages their scores', () => {
  const entries = [
    { prompt_length: 10, score: 4 },
    { prompt_length: 20, score: 6 },
    { prompt_length: 150, score: 9 },
  ];
  const rows = byLength(entries);
  const under30 = rows.find((r) => r.label === 'under 30 chars');
  const mid = rows.find((r) => r.label === '100-299 chars');
  assert.equal(under30.count, 2);
  assert.equal(under30.avg, 5);
  assert.equal(mid.count, 1);
  assert.equal(mid.avg, 9);
});

test('byIssue counts one entry per issue code even with duplicates, sorted worst-first', () => {
  const entries = [
    { score: 2, issues: [{ code: 'no-clear-goal' }, { code: 'no-clear-goal' }] },
    { score: 8, issues: [{ code: 'oversized' }] },
  ];
  const rows = byIssue(entries);
  const goal = rows.find((r) => r.label === 'No clear goal');
  assert.equal(goal.count, 1);
  assert.equal(goal.avg, 2);
  assert.equal(rows[0].label, 'No clear goal');
});

test('byIssue and byLength skip entries with a non-numeric score', () => {
  const entries = [{ score: 'n/a', issues: [{ code: 'oversized' }], prompt_length: 5 }];
  assert.equal(byIssue(entries).every((r) => r.count === 0), true);
  assert.equal(byLength(entries).find((r) => r.label === 'under 30 chars').count, 0);
});

test('isoWeekKey groups a Monday-Sunday span into the same ISO week', () => {
  const monday = isoWeekKey(new Date('2026-02-02T00:00:00Z'));
  const sunday = isoWeekKey(new Date('2026-02-08T23:59:59Z'));
  const nextMonday = isoWeekKey(new Date('2026-02-09T00:00:00Z'));
  assert.equal(monday, sunday);
  assert.notEqual(monday, nextMonday);
});

test('byWeek averages per ISO week, sorted oldest first, skips bad timestamps', () => {
  const entries = [
    { timestamp: '2026-02-02T10:00:00Z', score: 4 },
    { timestamp: '2026-02-03T10:00:00Z', score: 8 },
    { timestamp: '2026-02-09T10:00:00Z', score: 6 },
    { timestamp: 'not-a-date', score: 9 },
  ];
  const rows = byWeek(entries);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].count, 2);
  assert.equal(rows[0].avg, 6);
  assert.equal(rows[1].avg, 6);
  assert.ok(rows[0].label < rows[1].label);
});

test('byDeveloper averages per developer, worst first, defaults missing name to unknown', () => {
  const entries = [
    { developer: 'Alice', score: 9 },
    { developer: 'Bob', score: 3 },
    { score: 5 },
  ];
  const rows = byDeveloper(entries);
  assert.equal(rows[0].label, 'Bob');
  assert.equal(rows.find((r) => r.label === 'unknown').avg, 5);
});
