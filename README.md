# Prompt Helper

Grades your prompt **before** you send it to Claude, so you fix a vague ask
instead of burning a round-trip on it. Scores out of 10 against a rubric the team
owns, tells you what is missing, hands you a rewrite — and tracks how the team is
doing over time.

No dependencies. Node 18+ and built-in modules only.

## Setup (once per developer)

```bash
node scripts/install-command.js
```

That installs `/promptcheck` into `~/.claude/commands/` with this checkout's path
baked in, so the command works from **any** project — not just from inside this
repo. Restart Claude Code afterwards. Re-run it if you move this folder or pull a
change to the command.

Then fill in [`project-profile.md`](project-profile.md) with your real stack and
conventions. Skipping this still works, but context feedback stays generic.

## Use

In any project, paste the prompt you were about to send:

```
/promptcheck refactor the auth module to use the new token service
```

You get a score, the specific gaps, and a rewrite you can copy. The check is
logged automatically.

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
7 days — and prints two breakdowns:

1. **Average score by prompt length.** Do longer prompts actually score better?
2. **Average score by issue code.** Which mistake costs the most?

Both read fields that are already being logged, so there is nothing new to
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
