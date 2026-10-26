# Backend Decision

The current product is offline-first and uses browser localStorage/IndexedDB plus local profile storage. No server-side feature is required by the existing runtime.

A real backend was not implemented because:
- No documented requirement mandates server-side persistence.
- Migrating passwords or private account data to a server would weaken the current local-only security model.
- Supabase SQL files are setup artifacts only and are not part of the active runtime.

If a backend is later required, it must be added with explicit authentication, authorization, validation, and secure storage, and must not reuse or expose the legacy shared storage key.
