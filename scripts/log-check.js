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
const { execFileSync } = require('child_process');

// Overridable so the git sync can be exercised against a throwaway repo in
// tests. Production never sets it.
const REPO_ROOT = process.env.PROMPT_HELPER_REPO_ROOT || path.join(__dirname, '..');
// Override for tests/dry-runs so they never touch a real developer's log file
// or trigger a real git sync. Real usage always uses the default.
const LOG_DIR = process.env.PROMPT_HELPER_LOG_DIR || path.join(REPO_ROOT, 'data');

// execFileSync (not execSync) so a developer name, project name, or file path
// containing quotes/spaces/shell metacharacters can never be interpreted by a
// shell - it's passed straight to git as an argv entry.
function run(args, opts = {}) {
  try {
    return execFileSync('git', args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      // Never prompt for credentials interactively - a developer with no
      // cached credentials should get a silent, fast sync failure (they still
      // have their local commit and log entry), not a hung process.
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      ...opts,
    }).toString().trim();
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
  return run(['config', 'user.name']) || os.userInfo().username;
}

function getProject() {
  const remote = run(['remote', 'get-url', 'origin']);
  if (remote) {
    const name = remote.split(/[\\/]/).pop().replace(/\.git$/, '');
    if (name) return name;
  }
  return path.basename(process.cwd());
}

// Short, stable fingerprint of the rubric's current content, so a score can
// later be traced to the rubric version that produced it. Not a manual
// version number: the rubric is meant to be edited freely, and a fingerprint
// can't go stale the way a forgotten "bump the version" step would.
function getRubricVersion() {
  try {
    const rubric = fs.readFileSync(path.join(REPO_ROOT, 'rubric.md'), 'utf8');
    return crypto.createHash('sha256').update(rubric).digest('hex').slice(0, 8);
  } catch {
    return 'unknown';
  }
}

function isRebasing(repoRoot) {
  return (
    fs.existsSync(path.join(repoRoot, '.git', 'rebase-merge')) ||
    fs.existsSync(path.join(repoRoot, '.git', 'rebase-apply'))
  );
}

function syncWithGit(relativeLogFile, commitMessage) {
  // Escape hatch for trying things out without publishing to the shared repo.
  if (process.env.PROMPT_HELPER_NO_SYNC === '1') return;
  if (!fs.existsSync(path.join(REPO_ROOT, '.git'))) return;

  const opts = { cwd: REPO_ROOT };
  run(['add', relativeLogFile], opts);
  // Pathspec, not a bare commit: `git commit` without one commits everything
  // already in the index, so a developer who had staged their own work would
  // find it swept into a commit titled "log check". With the path it commits
  // only this file and leaves their staging area exactly as it was.
  run(['commit', '-m', commitMessage, '--', relativeLogFile], opts);
  run(['pull', '--rebase', '--autostash'], opts);

  // A rebase can fail on diverged history (autostash does not save us from a
  // real conflict). Left alone, the repo sits mid-rebase and every subsequent
  // check silently fails to sync until a human notices. Abort back to a clean
  // state instead - the commit above is still there locally, just not synced.
  if (isRebasing(REPO_ROOT)) {
    run(['rebase', '--abort'], opts);
    if (process.env.PROMPT_HELPER_DEBUG === '1') {
      console.error('log-check: git pull --rebase conflicted; aborted. Sync manually.');
    }
    return;
  }

  run(['push'], opts);
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
    rubric_version: getRubricVersion(),
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

  const commitMessage = `log check: ${developer} ${entry.score}/10 (${entry.project})`;
  syncWithGit(path.relative(REPO_ROOT, logFilePath), commitMessage);
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
