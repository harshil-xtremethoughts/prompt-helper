# Project Profile

`/promptcheck` reads this to judge whether a prompt gives Claude enough
project-specific context. **It is currently unfilled** — until you replace the
prompts below with real details, criterion 2 ("sufficient context") can only be
graded generically.

Two ways to use this file:

- **Shared default** — fill in this copy for the codebase your team works in most.
- **Per project** — drop a `project-profile.md` in any repo's root and
  `/promptcheck` uses that one instead when you are working in it. Better if you
  point this at several codebases.

Keep it short. Half a page that is accurate beats two pages that are stale.

## Stack

- Language(s): JavaScript (Node.js, CommonJS `require`, no TypeScript, no build step).
- Framework(s): None — this is a small CLI/tooling repo, not an app.
- Package manager: None. No `package.json`, no `node_modules`. Every script uses
  only Node built-ins (`fs`, `path`, `os`, `crypto`, `child_process`, `https`,
  `node:test`). Do not introduce an npm dependency without discussing it first —
  "no install step" is a deliberate property of this repo.
- Key libraries/dependencies developers commonly forget to mention: none — that's
  the point. If a prompt asks to "add" a package here, flag it.

## Codebase structure

- Repo layout:
  - `scripts/` — the actual tools: `log-check.js` (append + git-sync one check
    result), `weekly-summary.js` (aggregate last 7 days, post to Teams),
    `insights.js` (whole-history breakdowns by prompt length / issue code/
    week/developer), `dashboard.js` (writes a gitignored, self-contained
    `dashboard.html` with per-developer cards), `doctor.js` (end-to-end setup
    check: Node, git identity/remote/push access, command install, log
    integrity, Teams webhook), `install-command.js` (installs
    `.claude/commands/promptcheck.md` into `~/.claude/commands/` with the repo
    path baked in).
  - `test/` — `node:test` files for the pure functions in `scripts/`.
  - `.claude/commands/promptcheck.md` — the actual `/promptcheck` slash command
    definition (uses a `{{PROMPT_HELPER_ROOT}}` placeholder, filled in at
    install time by `install-command.js`).
  - `.github/workflows/` — CI (`ci.yml` syntax-checks scripts on push) and the
    scheduled Teams post (`weekly-summary.yml`).
  - `data/` — one `checks-<developer>-<machine>.jsonl` log file per person per
    machine. Never hand-edit these; each line must stay single-line JSON or
    `weekly-summary.js`/`insights.js` silently stop parsing that file.
  - `rubric.md` — the scoring checklist `/promptcheck` follows; team-owned.
  - `project-profile.md` — this file.
- Where business logic lives vs. UI vs. infra/config: no UI. "Business logic" is
  entirely in `scripts/*.js`. `.claude/commands/promptcheck.md` is effectively
  the entry point / orchestration layer (it's a prompt, not code, but it's what
  decides scoring and calls `log-check.js`).
- Naming conventions worth knowing: log files are always
  `checks-<slugified-developer>-<slugified-machine>.jsonl`; issue objects are
  always `{ code, detail }` with `code` matching the table in
  `.claude/commands/promptcheck.md` and labeled in `ISSUE_LABELS` in
  `scripts/weekly-summary.js`.

## Conventions & constraints

- Code style rules: plain CommonJS, 2-space indent, no semicolons omitted
  (semicolons used throughout), prefer small named functions over inline
  logic, comments explain *why* (a past bug, a non-obvious tradeoff), not
  *what*. No linter/formatter config currently — match surrounding style.
- Testing approach: `node:test` (built-in test runner, no dependency). Tests
  live in `test/*.test.js`, run with `node --test`. Focus on pure functions
  (`buildSummary`, `loadRecentChecks`, `byLength`, `byIssue`) — anything that
  touches git or the network is exercised manually, not unit tested.
- Things that must NOT be done without explicit approval: adding an npm
  dependency / `package.json`, changing the `.jsonl` log format (breaks
  `weekly-summary.js` and `insights.js` for existing history), changing issue
  codes without also updating `ISSUE_LABELS` and `.claude/commands/promptcheck.md`,
  touching `.github/workflows/weekly-summary.yml`'s schedule or secret name.

## Common gotchas

- Recurring mistakes: reformatting/pretty-printing a `.jsonl` file in an editor
  turns every entry into multiple lines, which `loadRecentChecks` then fails to
  parse (it warns to stderr but does not crash) — never touch `data/*.jsonl` by
  hand.
- Files/modules easy to break accidentally: `scripts/weekly-summary.js` exports
  `loadRecentChecks`/`issueCode`/`issueLabel` and `scripts/insights.js` imports
  them — changing those exports breaks insights silently until it's run.
- Anything unusual about the build/deploy process: there is no build. "Deploy"
  is `node scripts/install-command.js` per developer, and a GitHub Actions cron
  job (`weekly-summary.yml`) that runs `weekly-summary.js` directly against the
  checked-in `data/` folder — no server, no container.

---

## Example of a filled-in section

For calibration — this is the level of detail that makes feedback sharp:

> **Stack:** TypeScript, React 18 + Vite frontend, NestJS backend, pnpm workspaces.
> Devs routinely forget to mention we use TanStack Query for *all* server state —
> prompts asking for "add a fetch call" usually get plain `useEffect` back, which
> we then reject in review.
>
> **Must not do without approval:** any change under `prisma/migrations/`, adding a
> dependency, or editing `.github/workflows/`.
>
> **Easy to break:** `src/auth/session.ts` — three services read it and it has no
> direct test coverage.
