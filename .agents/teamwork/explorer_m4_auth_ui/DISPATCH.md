## 2026-09-29T17:30:00Z
Sender: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Priority: MESSAGE_PRIORITY_HIGH

You are an Explorer designing the Storefront Authentication UI in Header.jsx and AuthModal.jsx for Milestone 4.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_auth_ui
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read existing components:
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/AuthModal.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/Header.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/App.jsx
Read E2E tests for Auth UI at: /Users/nhaterik/CloudflareProjects/Furproject/tests/e2e/tier1_feature.test.mjs (Suite F12: Storefront Authentication UI)

Task:
Design the implementation plan and drop-in code for:
1. `src/components/AuthModal.jsx`:
   - Google Sign-In button: must link directly or navigate to `/api/auth/google` (e.g. `<a href="/api/auth/google">` or button calling `window.location.href = '/api/auth/google'`).
   - Clean UI with Google logo/icon, clear explanation, and fallback/close action.
2. `src/components/Header.jsx`:
   - Session Restoration: On component mount (`useEffect`), fetch `GET /api/auth/me`. If user is returned, set user state in app or local component state.
   - If authenticated:
     - Show user avatar image (or initials fallback if `avatar_url` is absent) and display name / first name.
     - Show account dropdown menu on click: options for "Đơn hàng của tôi" (My Orders), "Sổ địa chỉ" (Address Book), and "Đăng xuất" (Sign Out).
     - Sign-Out action: Send `POST /api/auth/logout`, clear local user state, close dropdown, and reload or update session state.
     - MUST satisfy test `T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout`.
   - If unauthenticated:
     - Show "Đăng nhập" (Sign in) button that triggers `onOpenAuthModal()` or opens `AuthModal`.
3. Verify that changes preserve clean Vite production build (`npm run build`).

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_auth_ui/auth_ui_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
