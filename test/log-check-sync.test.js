const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const SCRIPT = path.join(__dirname, '..', 'scripts', 'log-check.js');

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString()
    .trim();
}

// A throwaway repo with no remote: syncWithGit's add/commit run, and the later
// pull and push fail harmlessly, which is exactly the part under test.
function makeRepo() {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-helper-sync-'));
  git(repo, ['init', '-q']);
  git(repo, ['config', 'user.name', 'Test Developer']);
  git(repo, ['config', 'user.email', 'test@example.com']);
  fs.mkdirSync(path.join(repo, 'data'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'committed state\n');
  git(repo, ['add', '.']);
  git(repo, ['commit', '-qm', 'initial']);
  return repo;
}

test('an auto-commit never sweeps in work the developer had staged', () => {
  const repo = makeRepo();

  // The developer is mid-task with their own change staged.
  fs.writeFileSync(path.join(repo, 'unrelated.txt'), 'my half-finished work\n');
  git(repo, ['add', 'unrelated.txt']);

  const inputPath = path.join(repo, 'check.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      prompt: 'a prompt',
      score: 5,
      issues: [{ code: 'no-verification', detail: 'x' }],
      suggested_rewrite: '',
    })
  );

  execFileSync(process.execPath, [SCRIPT, inputPath], {
    cwd: repo,
    env: { ...process.env, PROMPT_HELPER_REPO_ROOT: repo, GIT_TERMINAL_PROMPT: '0' },
  });

  const touched = git(repo, ['show', '--name-only', '--format=', 'HEAD'])
    .split('\n')
    .filter(Boolean);

  assert.equal(touched.length, 1, `expected one file in the commit, got: ${touched.join(', ')}`);
  assert.match(touched[0], /^data\/checks-/);

  // And their change is untouched: still staged, waiting for their own commit.
  const staged = git(repo, ['diff', '--cached', '--name-only']).split('\n').filter(Boolean);
  assert.deepEqual(staged, ['unrelated.txt']);

  fs.rmSync(repo, { recursive: true, force: true });
});
