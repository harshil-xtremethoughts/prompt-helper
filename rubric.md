# Prompt Quality Rubric

Used by `/promptcheck` to score a prompt before it's sent to Claude. Score out of 10 — start at 10 and deduct for each issue found. This file is meant to be edited by the team; add/remove criteria as you learn what makes prompts work well on this project.

## Checklist

1. **Clear goal** — Does the prompt state a single, concrete outcome (not "help me with X" but "do Y so that Z")?
2. **Sufficient context** — Does it name the relevant files, functions, or modules instead of assuming Claude already knows the codebase?
3. **Constraints stated** — Are limits called out (don't touch file X, must not add dependencies, must match existing style, performance/security requirements)?
4. **Expected output format** — Does the prompt say what form the answer should take (a diff, a full file, a plan, just an explanation)?
5. **Scope boundaries** — Is it clear what's in scope vs. out of scope, so Claude doesn't over-refactor or under-deliver?
6. **Edge cases / error handling** — If relevant, does the prompt mention edge cases or failure modes that matter?
7. **Verification criteria** — Does the prompt say how to know the result is correct (tests to run, behavior to check)?
8. **No contradictions** — Are there no internally conflicting instructions?
9. **Appropriately sized** — Is this one coherent task, not several unrelated asks bundled together?

## Scoring guidance

- 9–10: Ready to send as-is.
- 6–8: Usable, but a couple of specific gaps should be tightened first.
- 3–5: Vague enough that Claude will likely guess wrong on at least one important dimension.
- 0–2: Missing a goal or so ambiguous it needs to be rewritten before sending.

Deduct roughly 1–2 points per missing/weak checklist item, weighted by how much it matters for the specific prompt (e.g. "expected output format" matters less for a quick question than for a multi-file refactor).
