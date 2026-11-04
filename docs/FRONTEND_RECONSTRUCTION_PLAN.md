# Frontend Reconstruction Plan

## Page inventory
- Public: index.html, login.html, register.html
- App shell: projects.html, participants.html, friends.html, partners.html, tasks.html, notifications.html, chat.html, settings.html, admin.html

## Architecture
- Static multi-page HTML served by backend.
- Shared CSS: frontend/assets/css/main.css
- Shared JS: common.js (API/token), layout.js (shell/nav)
- Vendor: three.module.js, lenis.mjs, gsap.js
- Frontend deps installed in frontend/package.json (three, gsap, lenis, lucide, split-type)

## Phases
1. Audit complete.
2. Dependencies installed.
3. Design system tokens + components in main.css.
4. Homepage redesigned.
5. Auth pages redesigned.
6. Internal pages restyled via app shell premium CSS refresh; functionality preserved.
7. Responsive/accessibility via existing breakpoints + reduced motion.
8. Backend untouched.
9. Tests run.

## Remaining
- Full modular src/ reorganization not performed to avoid breaking direct URLs; can be future.
- Lucide/SplitType installed but not yet wired; can be added incrementally.