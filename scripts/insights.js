#!/usr/bin/env node
// Reads the whole check history (not just the last 7 days) and prints two
// breakdowns:
//   1. average score by prompt length  — are longer prompts actually better?
//   2. average score by issue code     — which mistake costs the most?
// Both read fields that are already logged; nothing new is collected.
// Usage: node insights.js [log-dir]   (defaults to ../data, or CHECKS_LOG_DIR)
// Built-in modules only.

const path = require('path');
const { loadRecentChecks, issueCode, issueLabel } = require('./weekly-summary.js');

// Below this many checks the averages swing wildly on a single entry, so the
// output is labelled as provisional rather than quietly looking authoritative.
const MIN_MEANINGFUL = 20;
const MIN_PER_ROW = 3;

const LENGTH_BUCKETS = [
  { label: 'under 30 chars', min: 0, max: 30 },
  { label: '30-99 chars', min: 30, max: 100 },
  { label: '100-299 chars', min: 100, max: 300 },
  { label: '300+ chars', min: 300, max: Infinity },
];

function average(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function scoreOf(entry) {
  const score = Number(entry.score);
  return Number.isFinite(score) ? score : null;
}

function byLength(entries) {
  return LENGTH_BUCKETS.map((bucket) => {
    const scores = entries
      .filter((e) => {
        const len = Number(e.prompt_length);
        return Number.isFinite(len) && len >= bucket.min && len < bucket.max;
      })
      .map(scoreOf)
      .filter((s) => s !== null);
    return { label: bucket.label, count: scores.length, avg: average(scores) };
  });
}

// ISO 8601 week (Monday-start), e.g. "2026-W08" — stable, sortable, and groups
// entries the same way regardless of which day of the week a check happened.
function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNum = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function byWeek(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const score = scoreOf(entry);
    const timestamp = new Date(entry.timestamp);
    if (score === null || Number.isNaN(timestamp.getTime())) continue;
    const key = isoWeekKey(timestamp);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(score);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)) // chronological, oldest first
    .map(([week, scores]) => ({ label: week, count: scores.length, avg: average(scores) }));
}

function byDeveloper(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const score = scoreOf(entry);
    if (score === null) continue;
    const key = entry.developer || 'unknown';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(score);
  }
  return [...buckets.entries()]
    .map(([developer, scores]) => ({ label: developer, count: scores.length, avg: average(scores) }))
    .sort((a, b) => a.avg - b.avg); // lowest average first — who could use a hand
}

function byIssue(entries) {
  const buckets = new Map();
  for (const entry of entries) {
    const score = scoreOf(entry);
    if (score === null) continue;
    // One check with three issues counts towards all three codes.
    const seen = new Set((entry.issues || []).map(issueCode));
    for (const code of seen) {
      if (!buckets.has(code)) buckets.set(code, []);
      buckets.get(code).push(score);
    }
  }
  return [...buckets.entries()]
    .map(([code, scores]) => ({
      label: issueLabel(code),
      count: scores.length,
      avg: average(scores),
    }))
    .sort((a, b) => a.avg - b.avg); // worst average first — the costliest mistake
}

// Entries logged before issue codes existed stored a whole sentence as the key.
// Left alone, one of those stretches the table far past terminal width.
const MAX_LABEL = 34;

function shorten(label) {
  return label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1) + '…' : label;
}

function renderTable(title, rows, firstColumnHeader) {
  const lines = [title, ''];
  if (!rows.some((r) => r.count > 0)) {
    lines.push('  (no data yet)', '');
    return lines.join('\n');
  }

  const shown = rows.map((r) => ({ ...r, label: shorten(r.label) }));
  const width = Math.max(firstColumnHeader.length, ...shown.map((r) => r.label.length));
  lines.push(`  ${firstColumnHeader.padEnd(width)}   Checks   Avg score`);
  lines.push(`  ${'-'.repeat(width)}   ------   ---------`);

  for (const row of shown) {
    if (row.count === 0) continue;
    const avg = row.avg.toFixed(1);
    const thin = row.count < MIN_PER_ROW ? '  (too few to trust)' : '';
    lines.push(
      `  ${row.label.padEnd(width)}   ${String(row.count).padStart(6)}   ${avg.padStart(9)}${thin}`
    );
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const logDir =
    process.argv[2] || process.env.CHECKS_LOG_DIR || path.join(__dirname, '..', 'data');

  const entries = loadRecentChecks(logDir, Infinity);

  console.log('');
  console.log('Prompt Helper — insights');
  console.log(`${entries.length} checks in ${logDir}`);
  if (entries.length === 0) {
    console.log('\nNothing logged yet. Run /promptcheck a few times first.\n');
    return;
  }
  if (entries.length < MIN_MEANINGFUL) {
    console.log(`Fewer than ${MIN_MEANINGFUL} checks — treat these as provisional.`);
  }
  console.log('');

  console.log(renderTable('1. Does prompt length track with score?', byLength(entries), 'Prompt length'));
  console.log(renderTable('2. Which mistake costs the most?', byIssue(entries), 'Issue'));
  console.log(renderTable('3. Is the team improving week over week?', byWeek(entries), 'Week'));
  console.log(renderTable('4. Average score by developer', byDeveloper(entries), 'Developer'));

  console.log('Length is a symptom, not a cause: longer prompts tend to score');
  console.log('better because they carry context and constraints, not because');
  console.log('of their length. Padding a prompt will not raise its score.');
  console.log('');
  console.log('The weekly trend can be confounded by rubric.md changing over');
  console.log('time - a dip may mean the rubric got stricter, not that prompts');
  console.log('got worse. Each log entry records rubric_version if you need to');
  console.log('check whether a given week used a different rubric.');
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { byLength, byIssue, byWeek, byDeveloper, isoWeekKey };
