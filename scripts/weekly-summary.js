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
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function loadRecentChecks(logDir) {
  let files;
  try {
    files = fs.readdirSync(logDir).filter((f) => /^checks.*\.jsonl$/.test(f));
  } catch {
    return [];
  }

  const cutoff = Date.now() - SEVEN_DAYS_MS;
  const entries = [];
  for (const file of files) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(logDir, file), 'utf8');
    } catch {
      continue;
    }
    for (const line of raw.split('\n')) {
      if (!line) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (entry && new Date(entry.timestamp).getTime() >= cutoff) {
        entries.push(entry);
      }
    }
  }
  return entries;
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
      issueCounts[issue] = (issueCounts[issue] || 0) + 1;
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

  const issueLine = topIssue ? `"${topIssue}" (seen ${topCount}x)` : 'no issue repeated more than once';

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

module.exports = { loadRecentChecks, buildSummary, postToTeams };
