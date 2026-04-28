---
name: design-md
description: >
  Integrates Google Labs design.md workflow into this repo. Use when a task needs a
  machine-readable DESIGN.md spec (tokens + rules), token governance, export/lint workflow,
  or consistent design system collaboration across humans and coding agents.
---

# design.md Workflow (Project Skill)

This skill standardizes how we use [`DESIGN.md`](https://github.com/google-labs-code/design.md)
in this repository.

It is intended for frontend redesigns, component libraries, page-system alignment, and
multi-agent collaboration where a shared, machine-readable design contract is needed.

## Load

```bash
npx openskills read design-md
```

When the task is React/Next UI implementation, combine with project workflow:

```bash
npx openskills read react-codex,design-md,shadcn,frontend-design
```

## Project Convention

- Canonical design contract file: `.agent/skills/design-md/DESIGN.md`
- This file is the first reference for style tokens, component intent, and design boundaries.
- If task-specific design constraints conflict with ad-hoc styling, prefer `DESIGN.md`.

## How To Use In Tasks

1. Read `.agent/skills/design-md/DESIGN.md` before coding UI.
2. Derive tokens to CSS variables / Tailwind tokens first.
3. Build components from tokens, not from one-off colors/sizes.
4. Keep token naming semantic (`primary`, `surface`, `danger`) instead of hard-coded visual names.
5. For design changes, edit `DESIGN.md` first, then update code.
