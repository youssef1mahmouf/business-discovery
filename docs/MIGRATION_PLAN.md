# Migration Plan

## Moved
- `index.html` -> `frontend/index.html` (application entry point)
- Root `index.html` -> redirect page to `frontend/index.html` for GitHub Pages compatibility

## Retained
- `frontend/index.html`
- Root `index.html`
- `package.json`, `package-lock.json`
- `.gitignore`, `README.md`
- `.git/`, `.vscode/`, `node_modules/`

## Removed
- `.test-tmp/` and `.test-tmpest1.js` temporary test artifacts
- `index.backup-pre-offline.html`
- `index.html.backup_20261025_034755`
- `index.html.backup_20261025_173523`
- `supabase-migration-friendship-marker-immutable.sql`
- `supabase-migration-remove-friend.sql`
- `supabase-setup.sql`

## Backend
No real backend was implemented. See `docs/backend-decision.md`.

## Legacy storage
- Legacy key `bd_state_v1` remains protected and is not auto-loaded by authenticated accounts.
