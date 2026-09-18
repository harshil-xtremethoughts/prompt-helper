#!/usr/bin/env node
// Usage: node log-check.js <path-to-json-file>
// Reads {prompt, score, issues, suggested_rewrite} from the given JSON file,
// enriches it with who/where/when, and appends one line to this developer's
// own log file: data/checks-<developer>-<machine>.jsonl. Each developer/machine
// only ever writes to its own file, so concurrent git pushes from different
// people never touch the same lines and never conflict.
// Then best-effort commits + pushes that one file to the shared repo, if this
// folder is a git repo. Built-in modules only.

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execSync } = require('child_process');

const REPO_ROOT = path.join(__dirname, '..');
const LOG_DIR = path.join(REPO_ROOT, 'data');

function run(cmd, opts = {}) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], ...opts }).toString().trim();
  } catch {
    return '';
  }
}

function slug(value) {
  const cleaned = (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-+|-+$)/g, '');
  return cleaned || 'unknown';
}

function getDeveloper() {
  return run('git config user.name') || os.userInfo().username;
}

function getProject() {
  const remote = run('git remote get-url origin');
  if (remote) {
    const name = remote.split(/[\\/]/).pop().replace(/\.git$/, '');
    if (name) return name;
  }
  return path.basename(process.cwd());
}

function syncWithGit(relativeLogFile) {
  // Escape hatch for trying things out without publishing to the shared repo.
  if (process.env.PROMPT_HELPER_NO_SYNC === '1') return;
  if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) return;

  const opts = { cwd: REPO_ROOT };
  run(`git add "${relativeLogFile}"`, opts);
  run('git commit -m "log check"', opts);
  run('git pull --rebase --autostash', opts);
  run('git push', opts);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    process.exit(1);
  }

  const resolvedInput = path.resolve(inputPath);
  const raw = fs.readFileSync(resolvedInput, 'utf8');
  const check = JSON.parse(raw);

  const developer = getDeveloper();
  const machine = os.hostname();
  const prompt = check.prompt || '';

  const entry = {
    timestamp: new Date().toISOString(),
    developer,
    machine,
    project: getProject(),
    prompt_length: prompt.length,
    prompt_hash: crypto.createHash('sha256').update(prompt).digest('hex'),
    score: check.score,
    issues: check.issues || [],
    suggested_rewrite: check.suggested_rewrite || '',
  };

  const logFileName = `checks-${slug(developer)}-${slug(machine)}.jsonl`;
  const logFilePath = path.join(LOG_DIR, logFileName);

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(logFilePath, JSON.stringify(entry) + '\n');

  try {
    fs.unlinkSync(resolvedInput);
  } catch {
    // best-effort cleanup of the temp input file
  }

  syncWithGit(path.join('data', logFileName));
}

try {
  main();
} catch (err) {
  // Silent by default so a logging failure never interrupts the developer, but
  // a silent failure is impossible to diagnose — this is the way back in.
  if (process.env.PROMPT_HELPER_DEBUG === '1') {
    console.error('log-check failed:', (err && err.stack) || err);
  }
  process.exit(1);
}
