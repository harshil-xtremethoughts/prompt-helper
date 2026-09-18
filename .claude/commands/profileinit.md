---
description: Read the current repo and write a project-profile.md for /promptcheck
argument-hint: (no arguments — run it inside the repo you want profiled)
allowed-tools: Read, Write, Glob, Grep, Bash(git log:*), Bash(git remote:*), Bash(ls:*), Bash(cat:*)
---

`/promptcheck` grades a prompt against a rubric plus a **project profile** — a
short description of the codebase, so it can say "you did not name a package"
instead of generic advice. That profile is written by hand, which means in
practice it stays empty and the feedback stays generic.

Your job is to write it, by reading the repo the developer is standing in.

## Step 1 — Read the repo

Work in the **current working directory**. Gather only what you can verify:

- **Manifest** — `package.json`, `pyproject.toml`, `go.mod`, `pom.xml`,
  `Gemfile`, `*.csproj`. Take the package manager, the scripts, and the
  dependencies that shape how code is written (framework, ORM, test runner)
- **Existing docs** — `CLAUDE.md`, `README.md`, `CONTRIBUTING.md`, `docs/`.
  A repo with a `CLAUDE.md` has usually done most of this work already; lift
  from it rather than re-deriving
- **Layout** — top-level folders, and for a monorepo the workspace folders
- **Enforced rules** — `eslint.config.*`, `.eslintrc*`, `ruff.toml`, `.editorconfig`,
  CI files. **What the linter forbids is the real "do not do this" list**, and it
  is more reliable than anything written in prose
- **Tests** — the runner, where tests live, how they are named
- **History** — `git log --oneline -30`. Messages that keep repeating the same
  fix are pointing at a real gotcha

If a file is not there, skip it. Do not guess a stack from a folder name.

## Step 2 — Write the profile

Write `project-profile.md` in the **repo root of the current directory** — not
into the prompt-helper checkout, which holds the shared default. `/promptcheck`
prefers the profile of whatever repo you are working in.

Use this shape:

```markdown
# Project Profile — <repo name>

## Stack
## Codebase structure
## Conventions & constraints
## Do not do without explicit approval
## Common gotchas
## What a good prompt here mentions
```

The last section is the one that changes `/promptcheck`'s output the most.
Write 3-5 bullets naming what a prompt about *this* repo has to specify — which
package or app, which layer, which command proves it works.

Rules for the content:

- **Only write what you verified.** If you could not determine the test
  approach, write `- Testing: [unknown — fill this in]` rather than a plausible
  guess. A confidently wrong profile makes `/promptcheck` worse than an empty one
- Keep it under roughly a page. A short accurate profile beats a long stale one
- Prefer specifics over categories: "Prisma, and only inside `database/`" beats
  "uses an ORM"
- If a `project-profile.md` already exists, read it first and **update** it
  rather than overwriting — someone may have corrected it by hand

## Step 3 — Tell the developer what to check

End with a short list of what you inferred but could not confirm, so they know
which lines to correct. Be specific: "I guessed the test command from
package.json scripts — confirm it is the one you actually run."

Then remind them it takes effect immediately: the next `/promptcheck` in this
repo reads the new file, with no reinstall and no restart.
