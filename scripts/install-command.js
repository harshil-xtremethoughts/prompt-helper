#!/usr/bin/env node
// Installs every command in .claude/commands/ into the user-level Claude
// commands folder (~/.claude/commands/) so they work from any project, not just
// from inside this repo. The repo copies keep a {{PROMPT_HELPER_ROOT}}
// placeholder so they stay machine-independent in git; this script substitutes
// the real absolute path of this checkout at install time.
// Re-run it after pulling changes to a command, or after moving this folder.
// Built-in modules only.

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO_ROOT = path.join(__dirname, '..');
const SOURCE_DIR = path.join(REPO_ROOT, '.claude', 'commands');
const TARGET_DIR = path.join(os.homedir(), '.claude', 'commands');

function main() {
  let sources;
  try {
    sources = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.md'));
  } catch {
    console.error(`Could not read commands from ${SOURCE_DIR}`);
    process.exitCode = 1;
    return;
  }

  if (sources.length === 0) {
    console.error(`No command files found in ${SOURCE_DIR}`);
    process.exitCode = 1;
    return;
  }

  // Forward slashes work on every platform inside the command file, and avoid
  // backslashes being read as escapes on Windows.
  const rootForCommand = REPO_ROOT.split(path.sep).join('/');
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  for (const file of sources) {
    const template = fs.readFileSync(path.join(SOURCE_DIR, file), 'utf8');
    const rendered = template.split('{{PROMPT_HELPER_ROOT}}').join(rootForCommand);

    if (rendered.includes('{{PROMPT_HELPER_ROOT}}')) {
      console.error(`Placeholder substitution failed for ${file} — skipped.`);
      process.exitCode = 1;
      continue;
    }

    const target = path.join(TARGET_DIR, file);
    const existed = fs.existsSync(target);
    fs.writeFileSync(target, rendered);
    console.log(`${existed ? 'Updated' : 'Installed'} /${file.replace(/\.md$/, '')}`);
  }

  console.log('');
  console.log(`Installed to: ${TARGET_DIR}`);
  console.log(`Reading rubric + profile from: ${rootForCommand}`);
  console.log('Restart Claude Code (or start a new session) to pick them up.');
}

main();
