#!/usr/bin/env node
// Reads the last 7 days across every developer's checks-*.jsonl file, computes
// simple stats, and posts a short summary to a Microsoft Teams Incoming Webhook.
// Built-in modules only. Requires env var TEAMS_WEBHOOK_URL. Optional env var
// CHECKS_LOG_DIR to point at a shared log folder instead of the local data/ dir
// (each developer/machine gets its own checks-<developer>-<machine>.jsonl file
// so concurrent git syncs never touch the same file).

const fs = require('fs');
const path = require('path');
const https = require('https');

const DEFAULT_LOG_DIR = path.join(__dirname, '..', 'data');

// Minimal .env reader so a local run does not need the webhook exported by hand.
// Real environment variables always win, which is what CI relies on. This reads
// simple KEY=value lines only; it is not a general dotenv replacement.
function loadDotEnv() {
  let raw;
  try {
    raw = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  } catch {
    return; // No .env file is normal — in CI the secret is injected directly.
  }
  for (const line of raw.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue; // skips blank lines and # comments
    const key = match[1];
    if (process.env[key] !== undefined) continue; // real env wins
    let value = match[2].trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    process.env[key] = quoted ? value.slice(1, -1) : value;
  }
}
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadRecentChecks(logDir, windowMs = SEVEN_DAYS_MS) {
  let files;
  try {
    files = fs.readdirSync(logDir).filter((f) => /^checks.*\.jsonl$/.test(f));
  } catch {
    return [];
  }

  const cutoff = windowMs === Infinity ? 0 : Date.now() - windowMs;
  const entries = [];
  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(logDir, file), 'utf8');
    } catch {
      continue;
    }
    let parsedInFile = 0;
    let nonBlankInFile = 0;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      nonBlankInFile += 1;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      parsedInFile += 1;
      if (entry && new Date(entry.timestamp).getTime() >= cutoff) {
        entries.push(entry);
      }
    }
    // One entry per line is the whole point of .jsonl. An editor that pretty-
    // prints the file turns every line into a fragment, and every read after
    // that quietly reports zero.
    if (nonBlankInFile > 0 && parsedInFile === 0) {
      console.error(
        `warning: ${file} has ${nonBlankInFile} lines but none parsed - it may ` +
          'have been reformatted. Each entry must sit on a single line.'
      );
    }
  }
  return entries;
}

// Issues are logged as { code, detail }. Counting them by their free-text detail
// would bucket every entry separately (no two developers phrase an issue the same
// way), so the tally is keyed on the stable code and only displayed via this map.
// Codes not listed here — e.g. from a newly added rubric item — fall back to the
// raw code, which still aggregates correctly.
const ISSUE_LABELS = {
  'no-clear-goal': 'No clear goal',
  'insufficient-context': 'Not enough project context',
  'no-constraints': 'Constraints not stated',
  'no-output-format': 'No expected output format',
  'no-scope-boundaries': 'No scope boundaries',
  'no-edge-cases': 'Edge cases not mentioned',
  'no-verification': 'No verification criteria',
  'contradictions': 'Contradictory instructions',
  'oversized': 'Several tasks bundled together',
};

// Entries logged before issue codes existed stored a plain sentence. Keep them
// countable rather than dropping them from the history.
function issueCode(issue) {
  if (issue && typeof issue === 'object') return issue.code || 'unknown';
  if (typeof issue === 'string' && issue.trim()) return issue.trim();
  return 'unknown';
}

function issueLabel(code) {
  return ISSUE_LABELS[code] || code;
}

function buildSummary(entries) {
  const total = entries.length;

  if (total === 0) {
    return '**Prompt Helper — Weekly Summary**\n\nNo prompt checks were logged in the past 7 days.';
  }

  const avgScore = (entries.reduce((sum, e) => sum + (Number(e.score) || 0), 0) / total).toFixed(1);

  const issueCounts = {};
  for (const entry of entries) {
    for (const issue of entry.issues || []) {
      const code = issueCode(issue);
      issueCounts[code] = (issueCounts[code] || 0) + 1;
    }
  }
  let topIssue = null;
  let topCount = 0;
  for (const [issue, count] of Object.entries(issueCounts)) {
    if (count > topCount) {
      topIssue = issue;
      topCount = count;
    }
  }

  const issueLine = topIssue ? `${issueLabel(topIssue)} (seen ${topCount}x)` : 'no issue repeated more than once';

  return (
    '**Prompt Helper — Weekly Summary**\n\n' +
    `- Checks run: ${total}\n` +
    `- Average score: ${avgScore}/10\n` +
    `- Most common issue: ${issueLine}`
  );
}

function postToTeams(webhookUrl, text) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(webhookUrl);
    } catch {
      reject(new Error('TEAMS_WEBHOOK_URL is not a valid URL'));
      return;
    }

    const body = JSON.stringify({
      '@type': 'MessageCard',
      '@context': 'http://schema.org/extensions',
      summary: 'Prompt Helper weekly summary',
      text,
    });

    const req = https.request(
      {
        hostname: target.hostname,
        path: target.pathname + target.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve();
          } else {
            reject(new Error(`Teams webhook returned ${res.statusCode}: ${data}`));
          }
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function main() {
  loadDotEnv();
  const webhookUrl = process.env.TEAMS_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error('TEAMS_WEBHOOK_URL environment variable is not set.');
    process.exitCode = 1;
    return;
  }

  const logDir = process.env.CHECKS_LOG_DIR || DEFAULT_LOG_DIR;
  const recent = loadRecentChecks(logDir);
  const summaryText = buildSummary(recent);

  await postToTeams(webhookUrl, summaryText);
  console.log('Posted weekly summary to Teams.');
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to post weekly summary:', err.message);
    process.exitCode = 1;
  });
}

module.exports = { loadRecentChecks, buildSummary, postToTeams, issueCode, issueLabel };
