#!/usr/bin/env node
// Installs .claude/commands/promptcheck.md into the user-level Claude commands
// folder (~/.claude/commands/) so /promptcheck works from any project, not just
// from inside this repo. The repo copy keeps a {{PROMPT_HELPER_ROOT}} placeholder
// so it stays machine-independent in git; this script substitutes the real
// absolute path of this checkout at install time.
// Re-run it after pulling changes to the command, or after moving this folder.
// Built-in modules only.

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE = path.join(REPO_ROOT, '.claude', 'commands', 'promptcheck.md');
const TARGET_DIR = path.join(os.homedir(), '.claude', 'commands');
const TARGET = path.join(TARGET_DIR, 'promptcheck.md');

function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error(`Could not find the command template at ${SOURCE}`);
    process.exitCode = 1;
    return;
  }

  // Forward slashes work on every platform inside the command file, and avoid
  // backslashes being read as escapes on Windows.
  const rootForCommand = REPO_ROOT.split(path.sep).join('/');
  const template = fs.readFileSync(SOURCE, 'utf8');
  const rendered = template.split('{{PROMPT_HELPER_ROOT}}').join(rootForCommand);

  if (rendered.includes('{{PROMPT_HELPER_ROOT}}')) {
    console.error('Placeholder substitution failed.');
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(TARGET_DIR, { recursive: true });

  const existed = fs.existsSync(TARGET);
  fs.writeFileSync(TARGET, rendered);

  console.log(`${existed ? 'Updated' : 'Installed'} /promptcheck -> ${TARGET}`);
  console.log(`Reading rubric + profile from: ${rootForCommand}`);
  console.log('Restart Claude Code (or start a new session) to pick it up.');
}

main();
