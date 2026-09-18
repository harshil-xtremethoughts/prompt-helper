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

  console.log('Length is a symptom, not a cause: longer prompts tend to score');
  console.log('better because they carry context and constraints, not because');
  console.log('of their length. Padding a prompt will not raise its score.');
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { byLength, byIssue };
