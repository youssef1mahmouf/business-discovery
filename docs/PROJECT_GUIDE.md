# Business Discovery — Project Guide for AI Coding Clients

## 1. Project Overview

Business Discovery is a web platform for managing business discovery projects, project members and participants, friends and partners, tasks, notifications, and chat conversations. It includes a site administration area for user statistics and application settings.

Current scope verified from source code:

- Multi-page frontend served by the Node backend.
- Custom HTTP server (not Express).
- MongoDB-backed persistence.
- Email/password authentication with signed tokens.

## 2. Technology Stack

Frontend:

- Static HTML pages (12 pages, all using the Premium Futuristic 3D Creative SaaS design identity)
- Vanilla JavaScript (`frontend/assets/js/common.js`, `frontend/assets/js/layout.js`)
- CSS (`frontend/assets/css/main.css`) — centralized design system with CSS variables, glassmorphism, and reusable components
- Vendor libraries: GSAP, Lenis, Three.js, Lucide, SplitType

Backend:

- Node.js (built-in `http` module)
- Custom router (`backend/src/middleware/router.js`)
- MongoDB Node driver
- `helmet` and `cors` are listed in `backend/package.json` but are not required by the current application code

Database:

- MongoDB (Atlas in production; local MongoDB possible via configuration)

Authentication:

- Password hashing with `scrypt` (`backend/src/services/auth.js`)
- HMAC-SHA256 signed base64url tokens with `iat` and `exp`
- Bearer token in `Authorization` header
- Backend database role is the source of truth for authorization

Testing:

- Node built-in test runner (`node --test`)
- Tests in `backend/test/`

## 3. Repository Structure

```
business-discovery/
├── .env.example
├── README.md
├── package.json
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── scripts/
│   ├── src/
│   └── test/
├── database/
│   ├── collections.json
│   ├── indexes.json
│   ├── schemas/
│   └── seed/
└── frontend/
    ├── *.html
    └── assets/
```

Important files:

- `backend/src/server.js` — application entry point, DB connection, HTTP server startup.
- `backend/src/app.js` — request handling, CORS, static frontend serving.
- `backend/src/config.js` — environment validation and configuration.
- `backend/src/db/mongo.js` — MongoDB connection and collection map.
- `backend/src/middleware/auth.js` — authentication and role checks using DB role.
- `backend/src/services/auth.js` — password hashing, token signing/verification, role normalization.
- `frontend/assets/js/common.js` — frontend API helper and token storage.
- `frontend/assets/js/layout.js` — shared layout, navigation, role-based UI visibility.

## 4. Application Architecture

Frontend pages call the backend REST API using `fetch`. The backend validates the bearer token, looks up the current user in MongoDB, enforces authorization, performs data operations, and returns JSON. Static frontend files are served by the same Node process.

### Frontend Design System

All 12 frontend pages share a unified design system defined in `frontend/assets/css/main.css`:

- **Color tokens**: Deep Navy (#080B18), Secondary (#0D1224), Surface (#141B31), Electric Blue (#397BFF), Purple (#8B5CF6), Cyan (#35D5F2)
- **Glassmorphism**: `--glass` / `--glass-strong` with backdrop-filter blur and subtle glowing borders
- **Components**: `.btn`, `.input`, `.card`, `.table-wrap`, `.modal`, `.toast`, `.badge`, `.avatar`, `.empty-state`, `.spinner`, `.skeleton`
- **Layout**: `.app-shell`, `.sidebar`, `.topbar`, `.content` with fixed sidebar + mobile overlay
- **Responsive**: Mobile sidebar drawer (below 900px), stacked topbar (below 600px)
- **Reduced motion**: Respects `prefers-reduced-motion`

Design token classes:

- `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`
- `.badge-blue`, `.badge-purple`, `.badge-cyan`, `.badge-success`, `.badge-danger`
- `.input`, `.label`
- `.card`, `.card-header`
- `.empty-state`, `.spinner`, `.skeleton-text`, `.skeleton-title`

```mermaid
flowchart LR
  Browser[Browser / Frontend Pages] -->|HTTP JSON + Bearer token| Server[Node HTTP Server]
  Server -->|MongoDB driver| Mongo[(MongoDB)]
  Server -->|Static files| Browser
```

Request lifecycle:

1. Browser sends request to `/api/...`.
2. `app.js` routes API requests to the router.
3. Route handler authenticates via `requireAuth`/`requireAdmin`.
4. Middleware verifies token signature and expiration.
5. Middleware loads the current user and role from MongoDB.
6. Route performs validation and data access.
7. JSON response returned.

## 5. Authentication and Authorization

Registration:

- `POST /api/auth/register`
- Creates a user with role `regular_user`.
- Passwords are hashed with `scrypt`.
- Email must be unique.

Login:

- `POST /api/auth/login`
- Verifies password hash.
- Returns a signed token with `iat` and `exp`.

Token handling:

- Token lifetime defaults to 15 minutes.
- Configurable via `ACCESS_TOKEN_TTL_SECONDS`.
- Expired, malformed, or invalidly signed tokens are rejected.
- Backend role is loaded from MongoDB on each authenticated request.

Roles:

- `regular_user`
- `site_admin`
- `main_super_admin`

Authorization:

- Backend authorization is authoritative.
- Frontend role checks only control UI visibility.

Main Super Admin provisioning:

- Use `backend/scripts/promote-super-admin.js`.
- Requires `ADMIN_EMAIL` (or `MAIN_SUPER_ADMIN_EMAIL`) and `ADMIN_PROVISION_CONFIRM=yes`.
- Promotes an existing user only; never creates an account.
- Does not run automatically.

Logout:

- Client clears the stored token.
- Server returns success but does not revoke tokens.
- Tokens remain valid until expiration.

## 6. Database

Database name defaults to `business_discovery`.

Collections used by code:

- `users`
- `user_states`
- `friend_requests`
- `friendships`
- `partner_invites`
- `partnerships`
- `app_settings`
- `projects`
- `project_members`
- `participants`
- `tasks`
- `notifications`
- `conversations`
- `messages`
- `ai_conversations`

Important relationships:

- Projects store their owner email in `owner`; project access is granted through `project_members`.
- Project membership is stored in `project_members`.
- Participants belong to a project via `projectId`.
- Tasks reference owner and assignee by email.
- Notifications are scoped by `userEmail`.
- Conversations store `members` as emails.

Data preservation requirements:

- Do not reset, drop, or overwrite production data.
- Preserve existing IDs and relationships.
- Database changes must be additive and reviewed.

The schema and index definitions use the runtime collection names `partner_invites` and `app_settings`. Participant reads are restricted to projects the authenticated user belongs to; participant creation, updates, and deletion require an owner, project manager, or project assistant role. Archived projects are hidden from the project list. Public homepage metrics are aggregate database counts rather than fixed figures. Unread chat counters use hashed email keys to avoid MongoDB dotted-field conflicts.

## 7. API Reference

Base API prefix: `/api`

Health:

- `GET /api/health`

Auth:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/password-recovery`
- `POST /api/auth/reset-password-with-code`
- `POST /api/auth/reset-password`
- `GET /api/auth/me`
- `POST /api/auth/logout`

Public:

- `GET /api/public/stats`

Projects:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PUT /api/projects/:id`
- `DELETE /api/projects/:id`
- `POST /api/projects/:id/members`
- `DELETE /api/projects/:id/members/:email`
- `PUT /api/projects/:id/members/:email/role`

Participants:

- `GET /api/participants`
- `POST /api/participants`
- `PUT /api/participants/:id`
- `DELETE /api/participants/:id`

Tasks:

- `GET /api/tasks`
- `POST /api/tasks`
- `PUT /api/tasks/:id`
- `DELETE /api/tasks/:id`

Notifications:

- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

Friends:

- `GET /api/friends`
- `POST /api/friends/requests`
- `POST /api/friends/requests/:id/accept`
- `POST /api/friends/requests/:id/reject`
- `DELETE /api/friends/requests/:id`
- `DELETE /api/friends/:email`

Partners:

- `GET /api/partners`
- `POST /api/partners/invitations`
- `POST /api/partners/invitations/:id/accept`
- `POST /api/partners/invitations/:id/reject`

Chat:

- `GET /api/conversations`
- `POST /api/conversations`
- `GET /api/conversations/:id/messages`
- `POST /api/conversations/:id/messages`
- `POST /api/ai/chat`

Admin:

- `GET /api/admin/stats`
- `GET /api/admin/users`
- `GET /api/settings`
- `PUT /api/settings`

## 8. Frontend

Main pages:

- `index.html` — landing page
- `login.html`, `register.html` — authentication
- `projects.html`, `participants.html` — project creation, editing/archiving, and participant management
- `friends.html`, `partners.html` — invitations, incoming requests, and confirmed relationships
- `tasks.html` — task creation, status updates, and owner deletion
- `notifications.html` — notification filtering and read state
- `chat.html` — conversation and message workflows
- `settings.html` — user settings
- `admin.html` — administration

Authentication state:

- Token stored in `localStorage` under `bd_token`.
- `common.js` provides `BD.api()` for authenticated requests.

API requests:

- `BD.api(path, options)` adds JSON headers and bearer token.

## 9. Development Setup

Prerequisites:

- Node.js
- MongoDB (local or Atlas connection string)

Installation:
```
npm install --prefix backend
```

Environment:

- Copy `backend/.env.example` to `backend/.env`.
- Configure values without committing secrets.

Start backend:
```
cd backend
npm start
```

The backend serves the frontend statically at the configured port.

Run tests:
```
cd backend
npm test
```

Syntax checks:
```
node --check backend/src/server.js
```

## 10. Security and Data Safety Rules

- Never expose secrets or credentials.
- Never commit `.env` files.
- Never delete, reset, drop, or overwrite production database data.
- Database changes must be additive, reviewed, and backed up.
- Backend authorization is authoritative; frontend visibility is not security.
- Preserve existing password hashes and user accounts.

## 11. Known Limitations

- Token revocation is not implemented; logout is client-side only.
- Token stored in browser localStorage.
- No automated database integration tests.
- Chat is request/response based, not real-time.
- AI chat endpoint returns unavailable/not implemented.
- Admin user search uses regex input without escaping.
- Password recovery email delivery depends on configured SMTP; delivery has not been verified.

## 12. AI Development Instructions

Every future AI client must:

- Read this guide before modifying the project.
- Inspect the current code before making assumptions.
- Make small, scoped changes.
- Preserve existing API contracts unless a change is explicitly approved.
- Prioritize data correctness and data safety over UI changes.
- Run relevant tests and report actual results.
- Never claim a test or database check passed unless it was actually performed.

## 13. Future Roadmap — Planned, Not Implemented

These are future ideas only and are not currently implemented:

- Modern visual redesign with a clean, minimal interface.
- Minimal login and registration experience.
- Modern translucent/glass visual style and animated background.
- Final product branding/name is still undecided.
- A real AI assistant with model selection and model management.
- Controlled AI access to project data and permissions.

## 14. Frontend Redesign (3D Creative)

Redesigned pages:

- `frontend/index.html` — premium homepage with a connected Three.js network visualization, Lenis smooth scroll, feature cards, live statistics, and CTA.
- `frontend/login.html` — glassmorphism auth card, password toggle, validation, loading state, forgot-password modal, registration link.
- `frontend/register.html` — premium registration, password strength meter, confirm password, validation, loading/success/error states.

Design system additions in `frontend/assets/css/main.css`:

- New color tokens (cyan/violet/blue), glass surfaces, radius, shadows, spacing helpers.
- Reusable `.rd-*` component classes for nav, hero, cards, buttons, inputs, auth, modal, spinner.
- Reduced-motion support and responsive breakpoints.

Dependencies:

- Uses vendored `three.module.js` and its `three.core.js` dependency (MIT license at `frontend/assets/vendor/THREE-LICENSE.txt`), `lenis.mjs`, and copied `gsap.js` (minified UMD) from the root dependencies.
- No new npm dependencies installed.

Animation architecture:

- Three.js renders a connected network visualization; rendering pauses while hidden and respects reduced-motion preferences.
- Lenis provides smooth scrolling; disabled under reduced motion.
- CSS handles blobs, hover, transitions.

Authentication UI changes:

- Preserved existing `BD.api` integration and token storage.
- Added client-side validation matching backend rules (email format, password >= 8).
- Added code-based password recovery and temporary-password change flow. SMTP delivery remains an external prerequisite and has not been verified.

Files modified:

- `frontend/index.html`, `frontend/login.html`, `frontend/register.html`
- `frontend/assets/css/main.css`
- `frontend/assets/vendor/gsap.js` (replaced incomplete ESM shim with stable minified build)
- `docs/PROJECT_GUIDE.md`, `docs/FRONTEND_REDESIGN_REPORT.md`
- Voice interaction.
- Future integration with Nexus AI.
- Future integration with the user's other projects and website.
