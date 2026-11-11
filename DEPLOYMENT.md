# Business Discovery — Deployment Guide

This guide deploys the full-stack Business Discovery platform (Node.js backend + vanilla JS frontend) so it is ready to go online.

## What is included

- **Backend**: Node.js HTTP server (Express-compatible dependencies, custom router) serving a REST API and all frontend static files.
- **Frontend**: 26+ multi-page HTML/JS application (Arabic/RTL), served statically by the backend.
- **Database**: MongoDB with automatic JSON-file fallback when MongoDB is unavailable. No data is lost during outages.
- **Authentication**: Email/password with signed tokens, role-based access (regular_user / site_admin / main_super_admin).
- **Features**: Projects, members, participants, tasks with manager approval, notifications, chat, friends/partners, profile with revocable share links, 100-question assessment, Ollama AI assistant, commerce (products, orders, manual InstaPay verification), admin dashboard, system status.

## Prerequisites

- Node.js 18 or newer
- MongoDB (optional — the app falls back to local JSON storage if MongoDB is not available)
- A terminal/shell
- For email (password recovery): a Brevo account or SMTP relay (optional)

## 1. Install dependencies

```bash
# From the repository root
npm install --prefix backend
```

This installs all backend dependencies (mongodb, express, helmet, cors, etc.).

## 2. Configure environment

Copy the example environment file and fill in your values:

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env`:

| Variable | Description | Required |
| --- | --- | --- |
| `PORT` | Port to listen on (default 3000) | No |
| `TOKEN_SECRET` | Random secret for signing tokens (min 32 chars in production) | Yes (production) |
| `FRONTEND_ORIGIN` | CORS origin (use your domain in production, `*` in dev) | Yes (production) |
| `MONGODB_URI` | MongoDB connection string | No (falls back to JSON) |
| `MONGODB_DB_NAME` | Database name | No |
| `EMAIL_PROVIDER` | `brevo` or `smtp` | No |
| `BREVO_API_KEY` / `BREVO_FROM_EMAIL` | Brevo email credentials | No (for password recovery) |
| `SMTP_HOST` / `SMTP_USER` / `SMTP_PASS` | SMTP credentials | No (for password recovery) |
| `OLLAMA_BASE_URL` | Ollama server URL (default `http://127.0.0.1:11434`) | No |
| `OLLAMA_MODEL` | Ollama model name (default `qwen3:4b`) | No |
| `ADMIN_EMAIL` | Email to provision as main super admin | No |
| `ADMIN_PROVISION_CONFIRM` | Set to `yes` to enable admin provisioning | No |

**Security**: Never commit real secrets. The `.env` file is gitignored. Only `.env.example` should be committed.

## 3. Initialize the database (optional)

If using MongoDB, create indexes:

```bash
npm run init-db --prefix backend
```

## 4. Provision the first administrator (optional)

To create the first super admin account, the user must already exist (registered via the web UI). Then run:

```bash
ADMIN_EMAIL=your-email@example.com ADMIN_PROVISION_CONFIRM=yes npm run provision:super-admin --prefix backend
```

This sets `role: main_super_admin` on the matching user account.

## 5. Start the server

### Development

```bash
npm run dev --prefix backend
```

### Production

```bash
npm start --prefix backend
```

The server listens on `PORT` (default 3000) and serves both the API and the frontend. Open `http://localhost:3000/` (or your configured host/port).

## 6. Deployment options

### Option A: VPS / dedicated server (recommended)

Use a process manager like **PM2**:

```bash
npm install -g pm2
cd backend
pm2 start src/server.js --name business-discovery
pm2 save
pm2 startup
```

Set up a reverse proxy (nginx) to forward port 80/443 to `http://localhost:3000` and terminate SSL.

### Option B: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY backend/package*.json ./
RUN npm install --production
COPY backend/src ./src
COPY backend/scripts ./scripts
COPY database ./database
COPY backend/.env ./
EXPOSE 3000
CMD ["node", "src/server.js"]
```

Build and run:

```bash
docker build -t business-discovery .
docker run -p 3000:3000 --env-file backend/.env business-discovery
```

### Option C: Platform-as-a-Service (Railway, Render, Fly.io, etc.)

Connect your GitHub repository, set the build command to `npm install --prefix backend`, and the start command to `npm start --prefix backend`. Add your environment variables in the platform dashboard.

## 7. Verifying the deployment

After starting the server:

```bash
# Health check
curl http://your-server:3000/api/health

# Public stats
curl http://your-server:3000/api/public/stats

# Open the frontend in a browser
open http://your-server:3000/
```

Expected responses:

- `/api/health` → `{"ok":true,"service":"business-discovery"}`
- `/api/public/stats` → `{"stats":{...}}`
- Frontend home page loads with the Business Discovery hero section

## 8. Going live checklist

- [ ] Set a strong `TOKEN_SECRET` (32+ random characters)
- [ ] Set `FRONTEND_ORIGIN` to your actual domain (not `*`) in production
- [ ] Set `NODE_ENV=production`
- [ ] Configure SSL/TLS via your reverse proxy or platform
- [ ] If using email, configure `BREVO_API_KEY` or SMTP credentials
- [ ] Provision at least one `main_super_admin`
- [ ] Test registration, login, project creation, and task workflow
- [ ] Verify MongoDB connectivity (or confirm JSON fallback is active)

## Architecture notes

- The backend is a single Node.js process that serves both the REST API (`/api/*`) and the static frontend (`/`).
- When MongoDB is unavailable, all data is persisted to `backend/data/fallback/fallback.json` with checksums and automatic resynchronization when MongoDB returns.
- The frontend uses relative API URLs on non-localhost hosts, so it works when served from the same origin as the backend.
- All 69 backend tests pass (`npm test --prefix backend`).

## Support

Repository:
<https://github.com/youssef1mahmouf/business-discovery>
