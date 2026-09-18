# Prompt Helper

Grades your prompt **before** you send it to Claude, so you fix a vague ask
instead of burning a round-trip on it. Scores out of 10 against a rubric the team
owns, tells you what is missing, hands you a rewrite — and tracks how the team is
doing over time.

No dependencies. Node 18+ and built-in modules only.

## Setup (once per developer)

```bash
git clone https://github.com/harshil-xtremethoughts/prompt-helper.git
```

```bash
cd prompt-helper && node scripts/install-command.js
```

That installs `/promptcheck` into `~/.claude/commands/` with this checkout's path
baked in, so the command works from **any** project — not just from inside this
repo. **Restart Claude Code afterwards.** Re-run it if you move this folder or
pull a change to the command.

There is nothing to install: Node 18+ and no dependencies.

Then confirm the whole chain actually works:

```bash
node scripts/doctor.js
```

It checks your Node version, that `git config user.name` is set (the log
filename is built from it), that you have **push access** to this repo, that the
command is installed and pointing here, that the log files are readable, and
(optionally) that `.env` has `TEAMS_WEBHOOK_URL` set if you plan to run
`weekly-summary.js` locally. Every failing line comes with the command that
fixes it.

Push access is the one worth checking before you rely on this. The logger is
silent by design, so without it your checks log locally and never reach the
team — and nothing tells you.

Optionally fill in [`project-profile.md`](project-profile.md) with your stack and
conventions, or drop one in whichever repo you work in. Skipping it still works;
context feedback just stays generic.

## Use

In any project, paste the prompt you were about to send:

```
/promptcheck refactor the auth module to use the new token service
```

You get a score, the specific gaps, and a rewrite you can copy. The check is
logged automatically.

## Profiling a repo

```
/profileinit
```

Run it inside any repo and it writes a `project-profile.md` there, by reading
the manifest, `CLAUDE.md`, the folder layout, the lint config and recent commit
history. `/promptcheck` prefers the profile of whichever repo you are working
in, so each codebase can carry its own.

This matters more than it looks: without a profile, `/promptcheck` can only give
generic advice on the "sufficient context" criterion. Writing one by hand is the
step everyone skips, which is why this exists.

It marks anything it could not verify as `[unknown — fill this in]` rather than
guessing, and ends by listing what you should confirm. A confidently wrong
profile is worse than no profile.

Takes effect immediately — no reinstall, no restart.

## What gets logged

One line per check, appended to your own `data/checks-<you>-<machine>.jsonl`:
timestamp, developer, machine, project, score, issue codes, suggested rewrite,
and the prompt's **length and SHA-256 hash — never the prompt text**. Nothing
confidential leaves your machine.

Each developer/machine writes only to its own file, so simultaneous pushes from
different people never conflict. The logger commits and pushes that one file
automatically.

To check something without publishing it:

```bash
PROMPT_HELPER_NO_SYNC=1
```

## Weekly team summary

[`.github/workflows/weekly-summary.yml`](.github/workflows/weekly-summary.yml)
posts to Teams every Monday 09:00 IST: checks run, average score, most common
issue. Add a repo secret `TEAMS_WEBHOOK_URL` to enable it, then use the Actions
tab to trigger a test run.

To run it by hand instead, set `TEAMS_WEBHOOK_URL` in your environment (see
[`.env.example`](.env.example)) and:

```bash
node scripts/weekly-summary.js
```

## Editing the rubric

[`rubric.md`](rubric.md) is the source of truth for scoring — edit it as the team
learns what makes prompts work here. `/promptcheck` follows whatever it currently
says.

If you add a criterion, also add its issue code to `ISSUE_LABELS` in
[`scripts/weekly-summary.js`](scripts/weekly-summary.js) so the weekly report
shows a readable name. Unknown codes still aggregate correctly — they just
display as the raw code.

## Insights

```bash
node scripts/insights.js
```

Reads the whole history — every developer, all the way back, not just the last
7 days — and prints four breakdowns:

1. **Average score by prompt length.** Do longer prompts actually score better?
2. **Average score by issue code.** Which mistake costs the most?
3. **Average score by ISO week.** Is the team improving over time? Can be
   confounded by `rubric.md` changing — a dip may mean the rubric got
   stricter, not that prompts got worse. Each log entry records
   `rubric_version` (a short hash of `rubric.md`'s content at check time) so
   you can tell whether a week's dip lines up with a rubric edit.
4. **Average score by developer.** Worst-average-first — meant to spot who
   could use a hand, not as a scoreboard. (See also [Team dashboard](#team-dashboard)
   below for the same idea as an HTML page with per-developer trend lines.)

All four read fields that are already being logged, so there is nothing new to
collect and the numbers cover your existing history from day one.

Rows backed by fewer than 3 checks are marked `(too few to trust)`, and the
whole report is flagged as provisional under 20 checks — averages swing wildly
on small samples and an unlabelled table invites people to over-read it.

Point it at a different log folder to try it out without touching `data/`:

```bash
node scripts/insights.js /path/to/some/logs
```

**Read the length table carefully.** Length is a symptom, not a cause: longer
prompts score better because they carry context and constraints, not because of
their length. Telling the team to "write longer prompts" will move the length
column and nothing else.

## Team dashboard

```bash
node scripts/dashboard.js
```

Writes `dashboard.html` next to the README — a self-contained page with a card
per developer (their average, their trend, their most common gap), the team
totals, and the issue breakdown. No dependencies and no CDN, so it opens
straight from disk and survives being emailed to someone.

It is generated, so it is gitignored. Run `git pull` first to pick up everyone
else's checks, then regenerate:

```bash
git pull && node scripts/dashboard.js
```

A developer's trend needs at least 4 of their own checks before it means
anything; until then the card says so rather than showing a number.

## Tests

```bash
node --test "test/*.test.js"
```

Covers the pure functions in `weekly-summary.js` and `insights.js` (score
aggregation, issue bucketing, `.jsonl` parsing, ISO-week grouping) and an
end-to-end run of `log-check.js` against a scratch log directory. Git sync and
the Teams POST are not unit tested — exercise those manually, or with
`doctor.js`. CI runs this plus a syntax check on every push via
[`.github/workflows/ci.yml`](.github/workflows/ci.yml).
