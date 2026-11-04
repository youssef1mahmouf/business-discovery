# Business Discovery — PROJECT MASTER PLAN
## 2. Architecture and Technology Stack

### Frontend
- 12 HTML pages — 3 redesigned (index, login, register) + 9 internal app-shell pages
- Vanilla JavaScript — frontend/assets/js/common.js, frontend/assets/js/layout.js
- CSS — frontend/assets/css/main.css — centralized design system with CSS variables, glassmorphism, and reusable components
- Vendor libraries (all installed and vendored):
  - Three.js — 3D hero scene on homepage, modular scene manager
  - GSAP — entrance animations, staggered cards, section reveals
  - Lenis — smooth scrolling
  - Lucide — consistent icon rendering (vendored ESM)
  - SplitType — hero heading text splitting
- Modular architecture — frontend/src/ core modules (auth, api, theme, animations, utils)
- No build step — static HTML/CSS/JS served by Node backend

### Backend
- Node.js — built-in http module
- Custom router — backend/src/middleware/router.js
- MongoDB Node driver
- helmet and cors listed in backend/package.json but not required by current code
- 22/22 tests passing in backend/test/

### Database
- MongoDB — Atlas in production; local possible via configuration
- Collections: users, user_states, friend_requests, friendships, partner_invites, partnerships, app_settings, projects, project_members, participants, tasks, notifications, conversations, messages, ai_conversations

### Authentication
- Password hashing with scrypt (backend/src/services/auth.js)
- HMAC-SHA256 signed base64url tokens with iat and exp
- Bearer token in Authorization header
- Backend database role is the source of truth for authorization
- Token TTL defaults to 15 minutes (configurable via ACCESS_TOKEN_TTL_SECONDS)
- Logout is client-side only (server does not revoke tokens)
- Token stored in browser localStorage
+- Main Super Admin: Account at `youssef1mahmouf24@gmail.com` promoted from `site_admin` to `main_super_admin` using provisioning script
+- Registration: Duplicate email protection with Arabic message "هذا البريد الإلكتروني مستخدم بالفعل"
+- Password Recovery: Secure token-based reset flow implemented (POST /api/auth/password-recovery, POST /api/auth/reset-password)
+- Email delivery: Backend architecture implemented but actual email delivery BLOCKED - no SMTP configured
+- `invalid_coordinator`: Not found in current codebase; see investigation below
+- Arabic error messages: Improved in common.js for login and registration API errors
+-
+## 1. Project Overview

Business Discovery is a web platform for managing business discovery projects, project members and participants, friends and partners, tasks, notifications, and chat conversations. It includes a site administration area for user statistics and application settings.


