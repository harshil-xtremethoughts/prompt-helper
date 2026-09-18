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

// Mirrors rubric.md's score bands so the distribution chart uses the same
// language as the check replies developers already read.
const SCORE_BANDS = [
  { label: '0-2 — must rewrite', min: 0, max: 3, color: 'var(--bad)' },
  { label: '3-5 — vague', min: 3, max: 6, color: '#D6A319' },
  { label: '6-8 — usable', min: 6, max: 9, color: 'var(--accent)' },
  { label: '9-10 — ready to send', min: 9, max: 11, color: 'var(--good)' },
];

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

      const lastCheck = rows.length ? rows[rows.length - 1].timestamp : null;

      return {
        name,
        checks: rows.length,
        avg: average(scores),
        trend,
        scores,
        lastCheck,
        topIssue: topIssue ? issueLabel(topIssue) : null,
        projects: [...new Set(rows.map((r) => r.project).filter(Boolean))],
        history: rows
          .slice()
          .reverse()
          .map((r) => ({
            timestamp: r.timestamp,
            score: scoreOf(r),
            project: r.project,
            issues: (r.issues || []).map((i) => issueLabel(issueCode(i))),
          })),
      };
    })
    .sort((a, b) => (b.avg || 0) - (a.avg || 0));
}

function trendBadge(trend) {
  if (trend === null) return '<span class="badge flat"><span class="trend-icon">&middot;</span>not enough checks yet</span>';
  if (trend > 0.3) return '<span class="badge up"><span class="trend-icon">&uarr;</span>improving +' + trend.toFixed(1) + '</span>';
  if (trend < -0.3) return '<span class="badge down"><span class="trend-icon">&darr;</span>slipping ' + trend.toFixed(1) + '</span>';
  return '<span class="badge flat"><span class="trend-icon">&rarr;</span>holding steady</span>';
}

function relativeDate(iso) {
  if (!iso) return 'never';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  if (days < 30) return Math.floor(days / 7) + 'w ago';
  return Math.floor(days / 30) + 'mo ago';
}

// A tiny inline sparkline needs no chart library — just a polyline scaled into
// a fixed viewBox. Single-point histories are skipped since a line needs two.
function renderSparkline(scores) {
  if (scores.length < 2) return '';
  const w = 240;
  const h = 40;
  const max = 10;
  const min = 0;
  const step = w / (scores.length - 1);
  const points = scores
    .map((s, i) => {
      const x = (i * step).toFixed(1);
      const y = (h - ((s - min) / (max - min)) * h).toFixed(1);
      return x + ',' + y;
    })
    .join(' ');
  const last = scores[scores.length - 1];
  const first = scores[0];
  const color = last > first ? 'var(--good)' : last < first ? 'var(--bad)' : 'var(--muted)';
  return (
    '<svg class="sparkline" viewBox="0 0 ' +
    w +
    ' ' +
    h +
    '" preserveAspectRatio="none"><polyline points="' +
    points +
    '" fill="none" stroke="' +
    color +
    '" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>'
  );
}

function renderDeveloperCard(dev, index) {
  const avg = dev.avg === null ? '&mdash;' : dev.avg.toFixed(1);
  const issueTag = dev.topIssue
    ? '<span class="tag gap-tag">' + escapeHtml(shorten(dev.topIssue)) + '</span>'
    : '';
  const projectTags = dev.projects
    .slice(0, 3)
    .map((p) => '<span class="tag">' + escapeHtml(p) + '</span>')
    .join('');
  const extraProjects = dev.projects.length > 3 ? dev.projects.length - 3 : 0;
  const extraTag = extraProjects ? '<span class="tag">+' + extraProjects + ' more</span>' : '';

  return [
    '      <article class="card" data-dev-index="' + index + '" data-dev-name="' + escapeHtml(dev.name) + '" onclick="openHistory(' + index + ')">',
    '        <h3>' + escapeHtml(dev.name) + '</h3>',
    '        <p class="score">' + avg + '<span class="outof">/10</span></p>',
    '        ' + renderSparkline(dev.scores),
    '        <div class="meta-row"><span class="meta-label">' + dev.checks + (dev.checks === 1 ? ' check' : ' checks') + '</span>',
    '          <span class="meta-label">last: ' + relativeDate(dev.lastCheck) + '</span></div>',
    '        ' + trendBadge(dev.trend),
    '        <div class="tags">' + issueTag + projectTags + extraTag + '</div>',
    '      </article>',
  ].join('\n');
}

// Serialized once per developer so the modal can render full history client
// side without another server round trip — this file is static, opened from
// disk, so there is no API to call back into.
function renderHistoryData(devs) {
  return JSON.stringify(
    devs.map((d) => ({
      name: d.name,
      history: d.history,
    }))
  );
}

// Horizontal stacked-bar-per-row chart of how many checks fall in each of
// rubric.md's four score bands — answers "are we mostly sending good prompts
// or mostly bad ones?" at a glance, which the per-developer averages can't.
function renderDistribution(entries) {
  const scores = entries.map(scoreOf).filter((s) => s !== null);
  if (!scores.length) return '  <p class="meta">Nothing logged yet.</p>';

  const counts = SCORE_BANDS.map(
    (band) => scores.filter((s) => s >= band.min && s < band.max).length
  );
  const maxCount = Math.max(...counts, 1);

  return SCORE_BANDS.map((band, i) => {
    const count = counts[i];
    const pct = Math.round((count / maxCount) * 100);
    const share = Math.round((count / scores.length) * 100);
    return [
      '    <div class="dist-row">',
      '      <div class="dist-label">' + escapeHtml(band.label) + '</div>',
      '      <div class="bar-track"><div class="bar-fill" style="width:' +
        pct +
        '%;background:' +
        band.color +
        '"></div></div>',
      '      <div class="dist-count">' + count + ' (' + share + '%)</div>',
      '    </div>',
    ].join('\n');
  }).join('\n');
}

function renderIssueRows(entries) {
  const rows = byIssue(entries);
  if (!rows.length) return '        <tr><td colspan="3">Nothing logged yet.</td></tr>';
  const maxCount = Math.max(...rows.map((r) => r.count));
  return rows
    .map((row) => {
      const pct = maxCount ? Math.round((row.count / maxCount) * 100) : 0;
      return [
        '        <tr>',
        '          <td><div class="bar-label">' + escapeHtml(shorten(row.label)) + '</div>' +
          '<div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div></td>',
        '          <td class="num">' + row.count + '</td>',
        '          <td class="num">' + row.avg.toFixed(1) + '</td>',
        '        </tr>',
      ].join('\n');
    })
    .join('\n');
}

const STYLE = [
  '  :root {',
  '    --ink:#16212E; --paper:#FAFAF7; --card:#FFFFFF; --line:#DDE2DE;',
  '    --muted:#5A6572; --good:#14795C; --bad:#B4441E; --accent:#0066CC;',
  '  }',
  '  @media (prefers-color-scheme: dark) {',
  '    :root {',
  '      --ink:#F2F5F3; --paper:#12191F; --card:#1A242E; --line:#2C3A46;',
  '      --muted:#9AA9B4; --good:#5FCFA8; --bad:#E88A66; --accent:#5EB3FF;',
  '    }',
  '  }',
  '  * { box-sizing:border-box; }',
  '  body { margin:0; padding:24px; background:var(--paper); color:var(--ink);',
  '    font:16px/1.6 "IBM Plex Sans", -apple-system, "Segoe UI", Roboto, sans-serif; }',
  '  .wrap { max-width:1200px; margin:0 auto; }',
  '  h1 { font-size:36px; font-weight:700; margin:0 0 8px; }',
  '  h2 { font-size:22px; font-weight:600; margin:48px 0 20px; }',
  '  h3 { font-size:18px; font-weight:600; margin:0 0 12px; }',
  '  .sub { color:var(--muted); margin:0 0 24px; font-size:16px; }',
  '  .warn { color:var(--bad); font-size:14px; margin:12px 0 0; }',
  '  .totals { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px;',
  '    margin-bottom:32px; }',
  '  .stat-card { background:var(--card); border:1px solid var(--line); border-radius:12px;',
  '    padding:24px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }',
  '  .big { font-size:48px; font-weight:700; line-height:1; margin:0; }',
  '  .lbl { color:var(--muted); font-size:14px; margin:8px 0 0; font-weight:500; }',
  '  .chart-container { background:var(--card); border:1px solid var(--line); border-radius:12px;',
  '    padding:24px; margin-bottom:32px; box-shadow:0 1px 3px rgba(0,0,0,0.08); }',
  '  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:20px; }',
  '  .card { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:24px;',
  '    box-shadow:0 2px 8px rgba(0,0,0,0.06); transition:all 0.3s; cursor:pointer; }',
  '  .card:hover { box-shadow:0 4px 16px rgba(0,0,0,0.12); transform:translateY(-2px); border-color:var(--accent); }',
  '  .score { font-size:52px; font-weight:700; margin:0; line-height:1; color:var(--accent); }',
  '  .outof { font-size:18px; color:var(--muted); font-weight:400; }',
  '  .meta { color:var(--muted); font-size:14px; margin:8px 0 0; }',
  '  .meta-row { display:flex; justify-content:space-between; align-items:center; margin:12px 0; }',
  '  .meta-label { color:var(--muted); font-size:13px; }',
  '  .meta-value { font-weight:500; color:var(--ink); }',
  '  .badge { display:inline-flex; align-items:center; gap:6px; margin-top:12px; padding:6px 12px;',
  '    border-radius:20px; font-size:13px; font-weight:600; }',
  '  .badge.up { background:rgba(20,121,92,0.15); color:var(--good); }',
  '  .badge.down { background:rgba(180,68,30,0.15); color:var(--bad); }',
  '  .badge.flat { background:rgba(90,101,114,0.15); color:var(--muted); }',
  '  .trend-icon { font-size:14px; }',
  '  .tags { display:flex; gap:6px; flex-wrap:wrap; margin-top:12px; }',
  '  .tag { display:inline-block; padding:5px 10px; background:var(--accent); color:white;',
  '    border-radius:16px; font-size:12px; font-weight:500; white-space:nowrap; }',
  '  .gap-tag { background:rgba(180,68,30,0.1); color:var(--bad); }',
  '  .sparkline { width:100%; height:40px; margin-top:12px; }',
  '  table { width:100%; border-collapse:collapse; background:var(--card);',
  '    border:1px solid var(--line); border-radius:12px; overflow:hidden;',
  '    box-shadow:0 1px 3px rgba(0,0,0,0.08); }',
  '  th, td { padding:14px 16px; text-align:left; border-bottom:1px solid var(--line); font-size:15px; }',
  '  th { font-weight:600; background:rgba(0,0,0,0.02); }',
  '  tr:last-child td { border-bottom:none; }',
  '  tr:hover { background:rgba(0,0,0,0.02); }',
  '  .num { text-align:right; font-variant-numeric:tabular-nums; }',
  '  .bar-label { font-weight:500; margin-bottom:6px; }',
  '  .bar-track { width:100%; height:6px; background:var(--line); border-radius:3px; overflow:hidden; }',
  '  .bar-fill { height:100%; background:var(--accent); border-radius:3px; }',
  '  .dist-row { display:grid; grid-template-columns:180px 1fr 90px; align-items:center; gap:16px;',
  '    padding:8px 0; }',
  '  .dist-label { font-size:14px; font-weight:500; }',
  '  .dist-count { font-size:14px; color:var(--muted); text-align:right;',
  '    font-variant-numeric:tabular-nums; }',
  '  .dist-row .bar-track { height:14px; border-radius:7px; }',
  '  .dist-row .bar-fill { border-radius:7px; }',
  '  @media (max-width:600px) {',
  '    .dist-row { grid-template-columns:110px 1fr 70px; gap:8px; }',
  '    .dist-label { font-size:12px; }',
  '  }',
  '  .modal { display:none; position:fixed; top:0; left:0; right:0; bottom:0;',
  '    background:rgba(0,0,0,0.5); z-index:1000; align-items:center; justify-content:center; }',
  '  .modal.show { display:flex; }',
  '  .modal-content { background:var(--card); border-radius:12px; padding:32px; max-height:80vh;',
  '    overflow-y:auto; max-width:600px; width:90%; }',
  '  .modal-close { float:right; font-size:24px; cursor:pointer; color:var(--muted); }',
  '  .modal-close:hover { color:var(--ink); }',
  '  .history-item { padding:12px 0; border-bottom:1px solid var(--line); font-size:14px; }',
  '  .history-item:last-child { border:none; }',
  '  footer { margin-top:48px; padding-top:24px; border-top:1px solid var(--line);',
  '    color:var(--muted); font-size:13px; }',
  '  @media (max-width:768px) {',
  '    body { padding:16px; }',
  '    h1 { font-size:28px; }',
  '    .totals { grid-template-columns:1fr; }',
  '    .grid { grid-template-columns:1fr; }',
  '    .card { padding:16px; }',
  '    .score { font-size:40px; }',
  '  }',
].join('\n');

// options.autoRefreshSeconds is only used when the page is served live, where a
// reload re-reads the logs. The written-to-disk file has its data baked in, so
// reloading it would just redraw the same numbers.
function renderHtml(entries, options = {}) {
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
    options.autoRefreshSeconds
      ? '<meta http-equiv="refresh" content="' + Number(options.autoRefreshSeconds) + '">'
      : '',
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
    '    <div class="stat-card"><p class="big">' + entries.length + '</p><p class="lbl">checks logged</p></div>',
    '    <div class="stat-card"><p class="big">' +
      (teamAvg === null ? '&mdash;' : teamAvg.toFixed(1)) +
      '</p><p class="lbl">team average</p></div>',
    '    <div class="stat-card"><p class="big">' +
      devs.length +
      '</p><p class="lbl">' +
      (devs.length === 1 ? 'developer' : 'developers') +
      '</p></div>',
    '  </div>',
    '',
    '  <h2>Score distribution</h2>',
    '  <div class="chart-container">',
    renderDistribution(entries),
    '  </div>',
    '',
    '  <h2>Per developer</h2>',
    '  <div class="grid" id="dev-grid">',
    devs.map((d, i) => renderDeveloperCard(d, i)).join('\n'),
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
    '',
    '<div class="modal" id="history-modal" onclick="if(event.target===this)closeHistory()">',
    '  <div class="modal-content">',
    '    <span class="modal-close" onclick="closeHistory()">&times;</span>',
    '    <h3 id="modal-title"></h3>',
    '    <div id="modal-body"></div>',
    '  </div>',
    '</div>',
    '',
    '<script>',
    'var HISTORY_DATA = ' + renderHistoryData(devs) + ';',
    'function openHistory(index) {',
    '  var dev = HISTORY_DATA[index];',
    '  if (!dev) return;',
    '  document.getElementById("modal-title").textContent = dev.name + " \\u2014 check history";',
    '  var body = dev.history.slice(0, 20).map(function(h) {',
    '    var date = new Date(h.timestamp).toLocaleString();',
    '    var score = h.score === null || h.score === undefined ? "\\u2014" : h.score;',
    '    var issues = h.issues.length ? h.issues.join(", ") : "no issues";',
    '    var proj = h.project ? " \\u00b7 " + h.project : "";',
    '    return "<div class=\\"history-item\\"><strong>" + score + "/10</strong> \\u2014 " + date + proj + "<br><span style=\\"color:var(--muted);font-size:13px\\">" + issues + "</span></div>";',
    '  }).join("");',
    '  document.getElementById("modal-body").innerHTML = body || "<p>No history recorded.</p>";',
    '  document.getElementById("history-modal").classList.add("show");',
    '}',
    'function closeHistory() {',
    '  document.getElementById("history-modal").classList.remove("show");',
    '}',
    'document.addEventListener("keydown", function(e) { if (e.key === "Escape") closeHistory(); });',
    '</script>',
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
