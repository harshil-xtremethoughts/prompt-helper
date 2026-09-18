const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const REPO_ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'log-check.js');

test('log-check.js appends an entry with a rubric_version, hashes the prompt, and never syncs when disabled', () => {
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-helper-logcheck-'));
  const inputPath = path.join(logDir, 'input.json');
  fs.writeFileSync(
    inputPath,
    JSON.stringify({
      prompt: 'integration test prompt',
      score: 7,
      issues: [{ code: 'no-verification', detail: 'x' }],
      suggested_rewrite: '',
    })
  );

  execFileSync(process.execPath, [SCRIPT, inputPath], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      PROMPT_HELPER_NO_SYNC: '1',
      PROMPT_HELPER_LOG_DIR: logDir,
    },
  });

  const logFiles = fs.readdirSync(logDir).filter((f) => f.startsWith('checks-'));
  assert.equal(logFiles.length, 1);

  const lines = fs.readFileSync(path.join(logDir, logFiles[0]), 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  const entry = JSON.parse(lines[0]);

  assert.equal(entry.score, 7);
  assert.equal(entry.prompt_length, 'integration test prompt'.length);
  assert.match(entry.rubric_version, /^[0-9a-f]{8}$/);
  assert.ok(!('prompt' in entry), 'raw prompt text must never be logged');

  assert.ok(!fs.existsSync(inputPath), 'log-check.js should delete the temp input file');
});
