#!/usr/bin/env node
// Checks that this machine is actually wired up end to end: can it run a check,
// log it, and get that log to the rest of the team?
//
// This exists because log-check.js is deliberately silent — a developer with no
// push access keeps working happily while their data never leaves their laptop,
// and nobody finds out until the numbers look wrong weeks later.
//
// Usage: node doctor.js
// Built-in modules only.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const MIN_NODE_MAJOR = 18;

const results = [];

function record(ok, label, detail, fix) {
  results.push({ ok, label, detail, fix });
}

// Unlike log-check's run(), this one reports why a command failed.
function run(cmd) {
  try {
    const out = execSync(cmd, {
      cwd: REPO_ROOT,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, out: out.toString().trim() };
  } catch (err) {
    const stderr = (err.stderr && err.stderr.toString().trim()) || '';
    const stdout = (err.stdout && err.stdout.toString().trim()) || '';
    return { ok: false, out: stderr || stdout || err.message };
  }
}

function checkNode() {
  const major = Number(process.versions.node.split('.')[0]);
  record(
    major >= MIN_NODE_MAJOR,
    'Node version',
    'v' + process.versions.node,
    'Install Node ' + MIN_NODE_MAJOR + ' or newer from nodejs.org'
  );
}

function checkGitIdentity() {
  const name = run('git config user.name');
  const value = name.ok ? name.out : '';
  record(
    Boolean(value),
    'Git identity',
    value || 'not set — logs would fall back to the OS username',
    'git config --global user.name "Your Name"'
  );
}

function checkRemote() {
  const remote = run('git remote get-url origin');
  if (!remote.ok || !remote.out) {
    record(false, 'Git remote', 'no origin remote', 'git remote add origin <repo url>');
    return null;
  }
  record(true, 'Git remote', remote.out.replace(/^https:\/\/github\.com\//, ''), '');
  return remote.out;
}

function checkPushAccess(hasRemote) {
  if (!hasRemote) {
    record(false, 'Push access', 'skipped — no remote', '');
    return;
  }
  // --dry-run still contacts the server and authenticates, but sends nothing.
  const push = run('git push --dry-run');
  const denied = /denied|403|authentication|could not read|permission/i.test(push.out);
  record(
    push.ok && !denied,
    'Push access',
    push.ok && !denied
      ? 'your checks will reach the team'
      : 'checks will log locally but NEVER reach the team',
    'Ask the repo owner to add you under Settings > Collaborators, then run: git push'
  );
}

function checkCommandsInstalled() {
  const sourceDir = path.join(REPO_ROOT, '.claude', 'commands');
  const targetDir = path.join(os.homedir(), '.claude', 'commands');
  const fix = 'node scripts/install-command.js';

  let expected;
  try {
    expected = fs.readdirSync(sourceDir).filter((f) => f.endsWith('.md'));
  } catch {
    record(false, 'Commands installed', 'no .claude/commands in this checkout', '');
    return;
  }

  // An installed copy left behind by an older checkout points somewhere else,
  // so the rubric it reads is not the one in this folder.
  const thisCheckout = REPO_ROOT.split(path.sep).join('/');
  const missing = [];
  const stale = [];

  for (const file of expected) {
    const target = path.join(targetDir, file);
    if (!fs.existsSync(target)) {
      missing.push('/' + file.replace(/\.md$/, ''));
      continue;
    }
    const body = fs.readFileSync(target, 'utf8');
    // Only commands whose template references the checkout can be checked this
    // way — one that works purely in the developer's own directory never
    // mentions a path, and its absence is not staleness.
    const source = fs.readFileSync(path.join(sourceDir, file), 'utf8');
    const needsPath = source.includes('{{PROMPT_HELPER_ROOT}}');
    if (body.includes('{{PROMPT_HELPER_ROOT}}') || (needsPath && !body.includes(thisCheckout))) {
      stale.push('/' + file.replace(/\.md$/, ''));
    }
  }

  const problems = [];
  if (missing.length) problems.push('not installed: ' + missing.join(', '));
  if (stale.length) problems.push('pointing elsewhere: ' + stale.join(', '));

  record(
    problems.length === 0,
    'Commands installed',
    problems.length === 0
      ? expected.length + ' command(s), pointing at this checkout'
      : problems.join('; '),
    fix
  );
}

function checkLogs() {
  const dir = path.join(REPO_ROOT, 'data');
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl'));
  } catch {
    record(true, 'Log files', 'none yet — expected before your first check', '');
    return;
  }

  const broken = [];
  let entries = 0;
  for (const file of files) {
    const lines = fs
      .readFileSync(path.join(dir, file), 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim());
    let parsed = 0;
    for (const line of lines) {
      try {
        JSON.parse(line);
        parsed += 1;
      } catch {
        /* counted below */
      }
    }
    entries += parsed;
    if (lines.length > 0 && parsed === 0) broken.push(file);
  }

  record(
    broken.length === 0,
    'Log files',
    broken.length === 0
      ? files.length + ' file(s), ' + entries + ' entries'
      : 'reformatted and unreadable: ' + broken.join(', '),
    'Each entry must be on one line. Do not open .jsonl in a formatting editor.'
  );
}

function main() {
  console.log('');
  console.log('Prompt Helper — setup check');
  console.log('');

  checkNode();
  checkGitIdentity();
  const remote = checkRemote();
  checkPushAccess(Boolean(remote));
  checkCommandsInstalled();
  checkLogs();

  const width = Math.max(...results.map((r) => r.label.length));
  for (const r of results) {
    const mark = r.ok ? ' ok ' : 'FAIL';
    console.log('  [' + mark + ']  ' + r.label.padEnd(width) + '   ' + r.detail);
    if (!r.ok && r.fix) console.log('           ' + ' '.repeat(width) + '   fix: ' + r.fix);
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log('');
  if (failed === 0) {
    console.log('All good. Run /promptcheck in any project, then: node scripts/dashboard.js');
  } else {
    console.log(failed + ' problem(s) found — fix the lines above and run this again.');
    process.exitCode = 1;
  }
  console.log('');
}

if (require.main === module) {
  main();
}

module.exports = { main };
