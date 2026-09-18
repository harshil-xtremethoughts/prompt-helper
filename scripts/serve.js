#!/usr/bin/env node
// Serves the team dashboard live: the logs are re-read on every request, so a
// browser reload shows the current numbers instead of whatever was true when
// dashboard.js last wrote its file.
//
// Usage: node serve.js [port]        (default 4000, or PORT)
//        node serve.js --pull        git pull before each render
// Built-in modules only.

const http = require('http');
const path = require('path');
const { execSync } = require('child_process');
const { loadRecentChecks } = require('./weekly-summary.js');
const { renderHtml } = require('./dashboard.js');

const REPO_ROOT = path.join(__dirname, '..');
const LOG_DIR = process.env.CHECKS_LOG_DIR || path.join(REPO_ROOT, 'data');
const AUTO_REFRESH_SECONDS = 30;

const args = process.argv.slice(2);
const shouldPull = args.includes('--pull');
const port = Number(args.find((a) => /^\d+$/.test(a)) || process.env.PORT || 4000);

function pull() {
  try {
    execSync('git pull --rebase --autostash', {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
    });
  } catch (err) {
    // A failed pull means stale data, not a broken page — serve what is on disk
    // and say so in the terminal rather than showing the viewer an error.
    console.error('  (git pull failed, serving local data)');
  }
}

const server = http.createServer((req, res) => {
  // Anything that is not the page — a favicon probe, a stray path — should not
  // trigger a render.
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  if (shouldPull) pull();

  try {
    const entries = loadRecentChecks(LOG_DIR, Infinity);
    const html = renderHtml(entries, { autoRefreshSeconds: AUTO_REFRESH_SECONDS });
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
    console.log(new Date().toLocaleTimeString() + '  rendered ' + entries.length + ' checks');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Could not build the dashboard: ' + err.message);
    console.error(err);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error('Port ' + port + ' is already in use. Try: node serve.js 4001');
    process.exitCode = 1;
    return;
  }
  throw err;
});

server.listen(port, () => {
  console.log('');
  console.log('Prompt Helper dashboard: http://localhost:' + port);
  console.log('Reading logs from: ' + LOG_DIR);
  console.log(
    'Reloads every ' + AUTO_REFRESH_SECONDS + 's' + (shouldPull ? ', pulling first' : '')
  );
  console.log('Stop with Ctrl+C.');
  console.log('');
});
