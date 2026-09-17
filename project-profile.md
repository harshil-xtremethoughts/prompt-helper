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

- Language(s):
- Framework(s):
- Package manager:
- Key libraries/dependencies developers commonly forget to mention:

## Codebase structure

- Repo layout (top-level folders and what lives in each):
- Where business logic lives vs. UI vs. infra/config:
- Naming conventions worth knowing:

## Conventions & constraints

- Code style rules (formatting, linting, patterns to follow/avoid):
- Testing approach (framework, where tests live, what "done" looks like):
- Things that must NOT be done without explicit approval (e.g. schema changes, new dependencies, touching CI config):

## Common gotchas

- Recurring mistakes Claude/developers make on this codebase:
- Files or modules that are easy to break accidentally:
- Anything unusual about the build/deploy process:

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
