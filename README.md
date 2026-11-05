# Business Discovery — Master Documentation

*Authoritative reference for all future development.*

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Technology Stack](#2-technology-stack)
3. [Repository Structure](#3-repository-structure)
4. [Application Architecture](#4-application-architecture)
5. [Design System](#5-design-system)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Database](#7-database)
8. [API Endpoints](#8-api-endpoints)
9. [Frontend Pages](#9-frontend-pages)
10. [Security](#10-security)
11. [Known Limitations](#11-known-limitations)
12. [AI Development Instructions](#12-ai-development-instructions)
13. [New Requirements — Master Consolidation Prompt](#13-new-requirements-master-consolidation-prompt)
14. [Conflicts & Unresolved Decisions](#14-conflicts--unresolved-decisions)
15. [Documentation Governance](#15-documentation-governance)
16. [Appendix: Source Documents](#16-appendix-source-documents)

---
## 1. Project Overview

Business Discovery is a web platform for managing business discovery projects, project members and participants, friends and partners, tasks, notifications, and chat conversations. It includes a site administration area for user statistics and application settings.

Current scope verified from source code:
- Multi-page frontend served by the Node backend.
- Custom HTTP server (not Express).
- MongoDB-backed persistence.
- Email/password authentication with signed tokens.
- Role-based authorization: regular_user, site_admin, main_super_admin.
- Backend database role is the source of truth for authorization.
- 12 frontend HTML pages (3 public + 9 internal app-shell pages).
- 15 MongoDB collections.

---

## 2. Technology Stack

### Frontend
- Static HTML pages (12 pages, Premium Futuristic 3D Creative SaaS design identity).
- Vanilla JavaScript (frontend/assets/js/common.js, frontend/assets/js/layout.js).
- CSS (frontend/assets/css/main.css) — centralized design system with CSS variables, glassmorphism, reusable components.
- Vendor libraries: GSAP, Lenis, Three.js, Lucide, SplitType.

### Backend
- Node.js (built-in http module).
- Custom router (backend/src/middleware/router.js).
- MongoDB Node driver.
- helmet and cors listed in backend/package.json but not required by current code.

### Database
- MongoDB (Atlas in production; local MongoDB possible via configuration).
- 15 collections: users, user_states, friend_requests, friendships, partner_invites, partnerships, app_settings, projects, project_members, participants, tasks, notifications, conversations, messages, ai_conversations.

### Authentication
- Password hashing with scrypt (backend/src/services/auth.js).
- HMAC-SHA256 signed base64url tokens with iat and exp.
- Bearer token in Authorization header.
- Backend database role is the source of truth for authorization.
- Token TTL defaults to 15 minutes (configurable via ACCESS_TOKEN_TTL_SECONDS).
- Logout is client-side only (server does not revoke tokens).
- Token stored in browser localStorage.

### Testing
- Node built-in test runner (node --test).
- Tests in backend/test/.
- 32/32 backend tests passing.

---

## 3. Repository Structure

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
├── docs/
│   ├── PROJECT_GUIDE.md
│   ├── PROJECT_MASTER_PLAN.md
│   ├── FRONTEND_COMPLETE_AUDIT.md
│   ├── FRONTEND_RECONSTRUCTION_PLAN.md
│   ├── FRONTEND_RECONSTRUCTION_REPORT.md
│   ├── FRONTEND_REDESIGN_REPORT.md
│   ├── FRONTEND_REDESIGN_PROGRESS.md
│   ├── FRONTEND_ANIMATION_ARCHITECTURE.md
│   ├── FINAL_FRONTEND_QA_REPORT.md
│   └── FINAL_RUNTIME_VERIFICATION.md
└── frontend/
    ├── *.html
    └── assets/

Important files:
- backend/src/server.js — application entry point, DB connection, HTTP server startup.
- backend/src/app.js — request handling, CORS, static frontend serving.
- backend/src/config.js — environment validation and configuration.
- backend/src/db/mongo.js — MongoDB connection and collection map.
- backend/src/middleware/auth.js — authentication and role checks using DB role.
- backend/src/services/auth.js — password hashing, token signing/verification, role normalization.
- frontend/assets/js/common.js — frontend API helper and token storage.
- frontend/assets/js/layout.js — shared layout, navigation, role-based UI visibility.

---

## 4. Application Architecture

Frontend pages call the backend REST API using fetch. The backend validates the bearer token, looks up the current user in MongoDB, enforces authorization, performs data operations, and returns JSON. Static frontend files are served by the same Node process.

### Frontend Design System
- Color tokens: Deep Navy (#080B18), Secondary (#0D1224), Surface (#141B31), Electric Blue (#397BFF), Purple (#8B5CF6), Cyan (#35D5F2).
- Glassmorphism: glass / glass-strong with backdrop-filter blur and subtle glowing borders.
- Components: .btn, .input, .card, .table-wrap, .modal, .toast, .badge, .avatar, .empty-state, .spinner, .skeleton.
- Layout: .app-shell, .sidebar, .topbar, .content.
- Responsive breakpoints: 900px (sidebar drawer), 600px (stacked topbar).
- Reduced-motion support.
- Light/dark theme support via data-theme attribute.

---

## 6. Authentication & Authorization

### Login
- Supported methods: username + password, email + password.
- Backend must securely identify the account using either username or email.
- Do not allow login using email alone or username alone.
- After successful login, retrieve the user profile and display name.

### Password Confirmation
- Required during registration and password reset.
- Compare both password fields immediately.
- Green visual indicator when passwords match.
- Error indicator when passwords do not match.
- Update indicator immediately as the user types.
- Validate again on the backend before accepting the password.
- Do not expose passwords in logs, browser storage, URLs, or API responses.

### Password Security
- Argon2id is the preferred password hashing algorithm, subject to compatibility and deployment constraints.
- Evaluate parameters according to current security recommendations and available server resources.
- Use a unique salt for each password.
- Never store plaintext passwords.
- Never encrypt passwords reversibly.
- Never return password hashes to the frontend.
- Use secure sessions or properly implemented short-lived access tokens and refresh-token rotation.
- Apply login rate limiting and protection against brute-force attacks.

### Password Recovery
The user has forgotten the existing account password.
The recovery process must:
1. Accept the registered email address.
2. Generate a cryptographically secure, random, expiring, single-use reset token.
3. Send a reset link to the registered email.
4. Validate the token on the backend.
5. Allow the user to choose a new password.
6. Include password confirmation with the green matching indicator.
7. Invalidate the token after successful use.
8. Invalidate existing sessions when appropriate.
9. Store only a secure hash of the reset token.
10. Provide safe, clear feedback.

Never attempt to retrieve or display the old plaintext password.
Never reset a password simply because someone knows the email address and account name.
Do not reveal whether an email exists through public recovery responses.
The email delivery provider must be configured and tested. An HTTP 200 response alone is not proof that an email was delivered.

### Account Recreation Fallback
If recovery cannot be repaired:
- Back up the existing account and its related records.
- Identify data that would be lost.
- Require explicit owner approval before deleting the account.
- Allow registration using the same email only after the old account has been safely handled.
- Preserve unrelated users and business records.
- After the new account is created, the authorized main administrator must promote the exact account to main_super_admin through a secure server-side operation.
- Never permit public registration to assign administrative privileges.

---

## B. Registration Flow

Preserve the existing registration choices and their conditional questions:
1. Regular individual customer.
2. Existing business owner.
3. Person planning to start a new business.
Each path must ask only the relevant questions.
Preserve the current registration page structure and existing business questions unless a specific change is approved.
The registration flow must collect the necessary account information and profile information without asking irrelevant questions.
Password and password confirmation must be included at the appropriate stage.
The confirmation field must show green feedback when both passwords match.
All fields must have correct validation, clear error messages, and secure backend handling.

---

## C. Homepage and Modern Visual Redesign

The homepage currently needs a substantial visual quality improvement.

### Header
Redesign the header to look modern, professional, and consistent with the rest of the website.
It must:
- Have a clear visual hierarchy.
- Use consistent spacing and typography.
- Work correctly on desktop and mobile.
- Support light and dark themes where applicable.
- Provide correct navigation according to authentication state.

### Authentication-aware Navigation
When logged out:
- Show an appropriate login action.
- Show a single appropriate registration/start action.
- Avoid duplicate calls to action.

When logged in:
- Replace the login action with the user display name.
- Provide access to user settings.
- Provide the correct account/business dashboard based on the user role.
- Provide a logout action.
The navigation must update automatically after login, logout, or account changes.

### Duplicate and Unnecessary Homepage Sections
Review the homepage and remove redundant calls to action.
Examples of items to review:
- Repeated start buttons.
- Duplicate registration invitations.
- Unnecessary sections that tell already-registered users to create an account.
- Sections that appear and disappear unpredictably after refreshing.
The homepage must have stable, predictable rendering after refresh.
Sections intended only for authenticated users must not appear to guests.
Do not remove useful content merely to make the page shorter.

---

## D. Homepage Hero and Visual Content

The section containing the main discovery headline needs a professional design.
The area beside the headline currently contains a placeholder or poorly implemented visual card.
Replace that concept with a high-quality visual element, such as:
- A polished dashboard preview.
- A modern business discovery visualization.
- A refined interactive visual card.
- A professional 3D-style composition.
Choose a design that fits the actual product purpose.
Do not add decorative fake metrics or invented business statistics.
The design must be responsive and visually consistent with the website.

---

## E. 3D Visual Design

The current 3D implementation is inadequate: it appears mostly as a black background with a few disconnected dots.
The target design should be a meaningful, high-quality 3D visual experience.
Requirements:
- Proper composition and depth.
- Smooth animation.
- Balanced lighting and shadows.
- Professional colors.
- Meaningful interactive elements.
- Responsive performance.
- Compatibility with the supported platforms.
If the 3D visual includes controls around the object, ensure that top, bottom, left, and right controls actually work.
Do not claim that an interactive 3D feature is complete if it is only a static background.

---

## F. Floating AI Assistant

The website needs an AI assistant accessible through a floating button.
The button should open a polished chat interface.
The assistant must support authorized actions appropriate to the user role.

For ordinary users:
- Answer questions about their authorized data.
- Provide useful summaries.
- Help them understand their business information.

For business owners:
- Provide business-related summaries and analytics.
- Help navigate their authorized business dashboard.
- Perform only explicitly authorized actions.

For the Main Super Admin:
- Provide authorized administrative analytics.
- Support user and business management.
- Show real website statistics.
- Support administrative operations with strict permission checks.

Security requirements:
- All authorization must be enforced server-side.
- The assistant must never bypass normal permissions.
- It must not access another user private information.
- Destructive operations require explicit confirmation.
- Log administrative actions.
- Apply rate limits and audit controls.
- Never expose secrets, credentials, or password hashes.

The assistant must not be granted unrestricted access to the server, database, or filesystem.

---

## G. User, Business, and Administrator Settings

Create role-aware settings and dashboards.

### Individual Customer
- Personal profile.
- Account settings.
- Security and password management.
- Relevant saved information and activity.

### Existing Business Owner
- Personal profile.
- Business profile.
- Business settings.
- Business analytics.
- Authorized team and business management.

### New Business Founder
- Personal profile.
- Business creation progress.
- Business profile setup.
- Relevant planning and management tools.

### Main Super Admin
- User management.
- Business management.
- Role and permission management.
- Website statistics.
- System activity and audit logs.
- Operational settings.
- Security monitoring.

Each role must only access authorized resources.

---

## H. Real Website Statistics — No Fake Data

All homepage and dashboard metrics must represent real server-side data.
The current hardcoded uptime, user counts, active users, and growth percentages must not be presented as real statistics.
Implement proper data sources for:

### Uptime
- Calculate uptime from actual server monitoring or health-check records.
- Define the measurement period.
- Do not invent an uptime percentage.

### Total Users
- Count actual registered users from the database.
- Avoid hardcoded values.

### Active Users
- Define a meaningful active-session or activity window.
- Count actual sessions or qualifying activity.
- Do not confuse total registered accounts with active users.

### Monthly Growth
- Calculate from actual database records and a clearly defined comparison period.
- Do not display arbitrary growth percentages.

### New Businesses
- Count actual business records created within the relevant period.

### Automatic Updates
- Refresh metrics using an appropriate server-side API.
- Use sensible caching and refresh intervals.
- Handle loading, unavailable, and error states.
- Avoid unnecessary database queries on every page render.
- The frontend may use JavaScript to display and refresh the returned data, but the backend must be the trusted source of truth.
JSON may be used as an API response format, not as a source of fabricated statistics.
If real data is unavailable, display an honest unavailable state or omit the metric.

---

## I. Main Super Admin Security

The Main Super Admin account must have the highest authorized administrative privileges.

Requirements:
- Server-side role enforcement.
- Secure administrative sessions.
- Strong password hashing.
- Rate limiting.
- Audit logging.
- Protection against privilege escalation.
- Protection against IDOR and unauthorized data access.
- CSRF protection where applicable.
- Input validation and output encoding.
- Secure secrets management.
- No default or hardcoded administrative passwords.

All administrative changes must be attributable and auditable.

---

## 14. Conflicts & Unresolved Decisions

The following conflicts were identified between previous documentation and new requirements from the Master Consolidation Prompt:

| Area | Previous | New Requirement | Resolution |
|------|----------|-----------------|------------|
| Password hashing | scrypt | Argon2id preferred | Document transition plan |
| Website statistics | Hardcoded values | Real server-side data | Implement real data sources |
| Registration paths | Single path | Three conditional paths | Update registration flow |
| 3D visual design | Static Three.js icosahedron | Meaningful high-quality 3D | Upgrade 3D implementation |
| AI assistant | Future roadmap item | Required feature | Document as required feature |
| Password confirmation | Not required | Required with green indicator | Add to registration and recovery |

---

## 15. Documentation Governance — Mandatory for All Future Work

The consolidated root README.md becomes the authoritative project reference.

Before every future implementation task, Cline must:
1. Read the latest root README.md completely.
2. Review the relevant existing source code.
3. Compare the requested task against documented requirements.
4. Identify dependencies and possible regressions.
5. State the exact implementation scope.
6. Implement only the approved step.
7. Run relevant tests.
8. Update the README with verified progress and decisions.
9. Report completed, partial, blocked, and unverified work separately.

Never mark a planned feature as implemented without evidence.
Never silently remove a requirement.
Never make unrelated changes.

---

## 16. Appendix: Source Documents

The following source documents were incorporated into this consolidated README:

### From docs/ folder:
- PROJECT_GUIDE.md
- PROJECT_MASTER_PLAN.md
- FRONTEND_COMPLETE_AUDIT.md
- FRONTEND_RECONSTRUCTION_PLAN.md
- FRONTEND_RECONSTRUCTION_REPORT.md
- FRONTEND_REDESIGN_REPORT.md
- FRONTEND_REDESIGN_PROGRESS.md
- FRONTEND_ANIMATION_ARCHITECTURE.md
- FINAL_FRONTEND_QA_REPORT.md
- FINAL_RUNTIME_VERIFICATION.md

### From root:
- README.md (existing project documentation)

### New requirements incorporated:
- Sections A through I from the Master Consolidation Prompt
- Authentication, registration, homepage, 3D, AI assistant, settings, statistics, Super Admin security

---

*End of consolidated README*
