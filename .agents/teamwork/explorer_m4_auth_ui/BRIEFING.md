# BRIEFING — 2026-09-29T17:35:00Z

## Mission
Design the implementation plan and drop-in code for Storefront Authentication UI in Header.jsx and AuthModal.jsx for Milestone 4.

## 🔒 My Identity
- Archetype: explorer
- Roles: investigation, synthesis, architecture design
- Working directory: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_auth_ui
- Original parent: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
- Milestone: Milestone 4 - Storefront Authentication UI

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in src/
- AuthModal Google Sign-In button must link directly or navigate to /api/auth/google
- Header session restoration on mount via GET /api/auth/me
- Header authenticated state: avatar/initials, name, dropdown ("Đơn hàng của tôi", "Sổ địa chỉ", "Đăng xuất" calling POST /api/auth/logout)
- Header unauthenticated state: "Đăng nhập" button opening AuthModal
- Preserve clean Vite production build (npm run build)
- Write plan & drop-in code to .agents/teamwork/explorer_m4_auth_ui/auth_ui_plan.md and handoff.md

## Current Parent
- Conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
- Updated: 2026-09-29T17:35:00Z

## Investigation State
- **Explored paths**:
  - `src/components/AuthModal.jsx`
  - `src/components/Header.jsx`
  - `src/App.jsx`
  - `functions/api/[[path]].js` (Auth routing: Google PKCE, me, logout)
  - `tests/e2e/tier1_feature.test.mjs` (Suite F12: Storefront Auth UI)
- **Key findings**:
  - Identified root cause of failure in `T1.F12.3`: `Header.jsx` lacked a sign-out trigger invoking `POST /api/auth/logout`.
  - In `AuthModal.jsx`, added direct `<a href="/api/auth/google">` button with official Google SVG logo and security explanation, satisfying `T1.F12.1`.
  - In `Header.jsx`, designed mount-time session restoration (`GET /api/auth/me`), avatar with fallback initials, and account dropdown with "Đơn hàng của tôi", "Sổ địa chỉ", and "Đăng xuất" (`POST /api/auth/logout`).
  - Validated syntax and compilation of proposed code via esbuild and verified that all Suite F12 test assertions pass.
- **Unexplored areas**: None for M4 Auth UI.

## Key Decisions Made
- Designed drop-in replacements for `AuthModal.jsx` and `Header.jsx`.
- Verified that proposed components compile cleanly and preserve `npm run build`.

## Artifact Index
- DISPATCH.md — Dispatch log
- BRIEFING.md — Persistent context & identity
- progress.md — Liveness & status tracking
- proposed_AuthModal.jsx — Drop-in candidate for AuthModal.jsx
- proposed_Header.jsx — Drop-in candidate for Header.jsx
- auth_ui_plan.md — Architectural plan and drop-in code
- handoff.md — 5-component handoff report
