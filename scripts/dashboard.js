#!/usr/bin/env node
// Builds a self-contained dashboard.html from every developer's check history.
// No dependencies and no CDN, so the file works offline, opens straight from
// disk and can be attached to a message. Regenerate it any time; it always
// reflects whatever is in the log folder right now.
// Usage: node dashboard.js [log-dir] [output-file]
// Built-in modules only.

const fs = require('fs');
const path = require('path');
const { loadRecentChecks, issueCode, issueLabel } = require('./weekly-summary.js');
const { byIssue } = require('./insights.js');

// Below this, a per-developer trend is noise rather than a signal.
const MIN_FOR_TREND = 4;
const MIN_MEANINGFUL = 20;

// Entries logged before issue codes existed stored a whole sentence as the key,
// and one of those fills a card on its own.
const MAX_LABEL = 40;

function shorten(label) {
  return label.length > MAX_LABEL ? label.slice(0, MAX_LABEL - 1) + '…' : label;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function average(numbers) {
  if (!numbers.length) return null;
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

function scoreOf(entry) {
  const score = Number(entry.score);
  return Number.isFinite(score) ? score : null;
}

function perDeveloper(entries) {
  const byDev = new Map();
  for (const entry of entries) {
    const name = entry.developer || 'unknown';
    if (!byDev.has(name)) byDev.set(name, []);
    byDev.get(name).push(entry);
  }

  return [...byDev.entries()]
    .map(([name, rows]) => {
      rows.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const scores = rows.map(scoreOf).filter((s) => s !== null);

      // Trend compares the first half of this developer's checks with the
      // second half — the question is whether they are getting better, not how
      // they rank against anyone else.
      let trend = null;
      if (scores.length >= MIN_FOR_TREND) {
        const mid = Math.floor(scores.length / 2);
        trend = average(scores.slice(mid)) - average(scores.slice(0, mid));
      }

      const counts = new Map();
      for (const row of rows) {
        for (const code of new Set((row.issues || []).map(issueCode))) {
          counts.set(code, (counts.get(code) || 0) + 1);
        }
      }
      let topIssue = null;
      let topCount = 0;
      for (const [code, count] of counts) {
        if (count > topCount) {
          topIssue = code;
          topCount = count;
        }
      }

      return {
        name,
        checks: rows.length,
        avg: average(scores),
        trend,
        topIssue: topIssue ? issueLabel(topIssue) : null,
        projects: [...new Set(rows.map((r) => r.project).filter(Boolean))],
      };
    })
    .sort((a, b) => (b.avg || 0) - (a.avg || 0));
}

function trendBadge(trend) {
  if (trend === null) return '<span class="badge flat">not enough checks yet</span>';
  if (trend > 0.3) return '<span class="badge up">improving +' + trend.toFixed(1) + '</span>';
  if (trend < -0.3) return '<span class="badge down">slipping ' + trend.toFixed(1) + '</span>';
  return '<span class="badge flat">holding steady</span>';
}

function renderDeveloperCard(dev) {
  const avg = dev.avg === null ? '&mdash;' : dev.avg.toFixed(1);
  const issue = dev.topIssue
    ? '<p class="meta">Most common gap: <strong>' + escapeHtml(shorten(dev.topIssue)) + '</strong></p>'
    : '<p class="meta">No issues recorded</p>';
  const where = dev.projects.length
    ? '<p class="meta">' + escapeHtml(dev.projects.slice(0, 3).join(', ')) + '</p>'
    : '';

  return [
    '      <article class="card">',
    '        <h3>' + escapeHtml(dev.name) + '</h3>',
    '        <p class="score">' + avg + '<span class="outof">/10</span></p>',
    '        <p class="meta">' + dev.checks + (dev.checks === 1 ? ' check' : ' checks') + '</p>',
    '        ' + trendBadge(dev.trend),
    '        ' + issue,
    '        ' + where,
    '      </article>',
  ].join('\n');
}

function renderIssueRows(entries) {
  const rows = byIssue(entries);
  if (!rows.length) return '        <tr><td colspan="3">Nothing logged yet.</td></tr>';
  return rows
    .map((row) =>
      [
        '        <tr>',
        '          <td>' + escapeHtml(shorten(row.label)) + '</td>',
        '          <td class="num">' + row.count + '</td>',
        '          <td class="num">' + row.avg.toFixed(1) + '</td>',
        '        </tr>',
      ].join('\n')
    )
    .join('\n');
}

const STYLE = [
  '  :root {',
  '    --ink:#16212E; --paper:#FAFAF7; --card:#FFFFFF; --line:#DDE2DE;',
  '    --muted:#5A6572; --good:#14795C; --bad:#B4441E;',
  '  }',
  '  @media (prefers-color-scheme: dark) {',
  '    :root {',
  '      --ink:#F2F5F3; --paper:#12191F; --card:#1A242E; --line:#2C3A46;',
  '      --muted:#9AA9B4; --good:#5FCFA8; --bad:#E88A66;',
  '    }',
  '  }',
  '  * { box-sizing:border-box; }',
  '  body { margin:0; padding:48px 24px; background:var(--paper); color:var(--ink);',
  '    font:16px/1.6 "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif; }',
  '  .wrap { max-width:1000px; margin:0 auto; }',
  '  h1 { font-size:32px; font-weight:600; margin:0 0 4px; }',
  '  h2 { font-size:20px; font-weight:600; margin:48px 0 16px; }',
  '  h3 { font-size:18px; font-weight:600; margin:0 0 12px; }',
  '  .sub { color:var(--muted); margin:0; }',
  '  .warn { color:var(--bad); font-size:14px; margin:12px 0 0; }',
  '  .totals { display:flex; gap:40px; flex-wrap:wrap; margin-top:28px; padding:24px;',
  '    background:var(--card); border:1px solid var(--line); border-radius:12px; }',
  '  .totals div { min-width:120px; }',
  '  .big { font-size:40px; font-weight:600; line-height:1.1; margin:0; }',
  '  .lbl { color:var(--muted); font-size:14px; margin:4px 0 0; }',
  '  .grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:20px; }',
  '  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:24px; }',
  '  .score { font-size:44px; font-weight:600; margin:0; line-height:1.1; }',
  '  .outof { font-size:20px; color:var(--muted); font-weight:400; }',
  '  .meta { color:var(--muted); font-size:14px; margin:8px 0 0; }',
  '  .badge { display:inline-block; margin-top:12px; padding:4px 12px; border-radius:999px;',
  '    font-size:13px; font-weight:500; }',
  '  .badge.up { background:rgba(20,121,92,0.12); color:var(--good); }',
  '  .badge.down { background:rgba(180,68,30,0.12); color:var(--bad); }',
  '  .badge.flat { background:rgba(90,101,114,0.12); color:var(--muted); }',
  '  table { width:100%; border-collapse:collapse; background:var(--card);',
  '    border:1px solid var(--line); border-radius:12px; overflow:hidden; }',
  '  th, td { padding:12px 16px; text-align:left; border-bottom:1px solid var(--line); font-size:15px; }',
  '  th { font-weight:600; }',
  '  tr:last-child td { border-bottom:none; }',
  '  .num { text-align:right; font-variant-numeric:tabular-nums; }',
  '  footer { margin-top:48px; color:var(--muted); font-size:13px; }',
].join('\n');

function renderHtml(entries) {
  const devs = perDeveloper(entries);
  const scores = entries.map(scoreOf).filter((s) => s !== null);
  const teamAvg = average(scores);
  const thin =
    entries.length > 0 && entries.length < MIN_MEANINGFUL
      ? '  <p class="warn">Fewer than ' +
        MIN_MEANINGFUL +
        ' checks logged &mdash; treat these numbers as provisional.</p>'
      : '';

  return [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Prompt Helper — team dashboard</title>',
    '<style>',
    STYLE,
    '</style>',
    '</head>',
    '<body>',
    '<div class="wrap">',
    '  <h1>Prompt Helper &mdash; team dashboard</h1>',
    '  <p class="sub">Prompt quality across everyone who has run a check.</p>',
    thin,
    '',
    '  <div class="totals">',
    '    <div><p class="big">' + entries.length + '</p><p class="lbl">checks logged</p></div>',
    '    <div><p class="big">' +
      (teamAvg === null ? '&mdash;' : teamAvg.toFixed(1)) +
      '</p><p class="lbl">team average</p></div>',
    '    <div><p class="big">' +
      devs.length +
      '</p><p class="lbl">' +
      (devs.length === 1 ? 'developer' : 'developers') +
      '</p></div>',
    '  </div>',
    '',
    '  <h2>Per developer</h2>',
    '  <div class="grid">',
    devs.map(renderDeveloperCard).join('\n'),
    '  </div>',
    '',
    '  <h2>Which gap costs the most</h2>',
    '  <table>',
    '    <thead><tr><th>Issue</th><th class="num">Checks</th><th class="num">Avg score</th></tr></thead>',
    '    <tbody>',
    renderIssueRows(entries),
    '    </tbody>',
    '  </table>',
    '',
    '  <footer>',
    '    Generated ' +
      escapeHtml(new Date().toLocaleString()) +
      ' by scripts/dashboard.js. Prompt text is never logged &mdash; only its length and a SHA-256 hash.',
    '  </footer>',
    '</div>',
    '</body>',
    '</html>',
    '',
  ].join('\n');
}

function main() {
  const logDir =
    process.argv[2] || process.env.CHECKS_LOG_DIR || path.join(__dirname, '..', 'data');
  const outFile = process.argv[3] || path.join(__dirname, '..', 'dashboard.html');

  const entries = loadRecentChecks(logDir, Infinity);
  fs.writeFileSync(outFile, renderHtml(entries));

  const developers = new Set(entries.map((e) => e.developer)).size;
  console.log('Wrote ' + outFile);
  console.log(entries.length + ' checks from ' + developers + ' developer(s)');
}

if (require.main === module) {
  main();
}

module.exports = { perDeveloper, renderHtml };
