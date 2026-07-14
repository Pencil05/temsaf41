# TEMS Agent Rules

- For TEMS development, read `.codex/skills/tems-maintenance/SKILL.md` once per task.
- Search with `rg` and inspect only relevant ranges; do not reread whole files after patches.
- Preserve unrelated user changes in this dirty worktree.
- This is Next.js 16. Before changing framework behavior, read only the relevant guide under `node_modules/next/dist/docs/`.
- Keep Google credentials and Gmail App Passwords server-only. Never print secret values.
- Validate focused files first, then run `npx tsc --noEmit` and the production build for cross-cutting changes.
