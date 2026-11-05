# Database

MongoDB Atlas. Schemas are documentation only. Production data lives in Atlas.

The runtime currently uses the 18 collections listed in `collections.json`. The project-assessment, Ollama chat, product, order, and task-approval schema files document the workflows; they do not enable MongoDB server-side schema validation.

## Init (safe, no data deletion)

```bash
cd backend
node scripts/init-db.js
```

This applies the additive indexes in `indexes.json`; review the target database and back it up before running the script in production.
