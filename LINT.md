# REACT LINTING GUIDE

## Goal
Keep React code consistent, safe, and easy to maintain.

## Recommended Command
Run from `desktop/`:

```bash
npm run lint
```

## Baseline Rules to Enforce
- No unused variables/imports.
- No `any`-style loose patterns without justification.
- Hooks rules must pass (`react-hooks/rules-of-hooks`, `react-hooks/exhaustive-deps`).
- No direct mutation of props or state.
- Prefer strict equality (`===`, `!==`).
- Avoid large components; split when logic/UI becomes hard to read.

## PR Lint Checklist
- Lint passes with no errors.
- Warnings are either fixed or documented in PR notes.
- New components follow existing naming/style conventions.
- Side effects are isolated in hooks and dependencies are correct.
- Dead code/comments are removed.

## Common Fix Flow
1. Run `npm run lint`.
2. Apply auto-fixes where safe.
3. Fix remaining violations manually.
4. Re-run lint before commit.
