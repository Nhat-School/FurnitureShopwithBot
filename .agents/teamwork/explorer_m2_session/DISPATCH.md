## 2026-09-29T16:38:16Z
You are an Explorer designing Session Management and Security in Pages Functions for Milestone 2.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_session
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read FlashCardWeb Auth Report at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_flashcard_auth/auth_pattern_report.md
Read current Pages Functions code at: /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js

Task:
Design the implementation plan for:
1. Web Crypto helpers using standard Web Crypto API:
   - `randomBase64Url(bytes)`
   - `sha256Base64Url(str)`
   - `hmacSha256(key, message)`
   - `timingSafeEqual(a, b)`
   - `signSession(payload, secret)`: format `${base64Url(payload)}.${hmac}`
   - `verifySession(token, secret)`: verify HMAC signature and check expiration timestamp (`exp`).
2. `GET /api/auth/me`:
   - Parse cookie header for `fur_session`.
   - Verify token signature with `SESSION_SECRET` (fallback to a default development secret if unset).
   - If valid, query D1 `users` joined with `customers` table to get fresh user profile, role, avatar_url, customer_type, loyalty_points.
   - Return `{ user: { id, email, display_name, avatar_url, role, customer_type, loyalty_points } }`.
   - If invalid, expired, or absent, return 401 `{ user: null }`.
3. `POST /api/auth/logout`:
   - Clear `fur_session` cookie: `fur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`.
   - Return `{ success: true }`.
4. Fix pre-existing bugs in `functions/api/[[path]].js`:
   - Line 23: `jsonResponse({}, 204)` throws `TypeError` in Fetch API because status 204 forbids a response body. Change to `new Response(null, { status: 204, headers })`.
   - Line 200: empty product search returning 404 instead of `{ products: [] }, 200`.
   - Remove obsolete inline `CREATE TABLE IF NOT EXISTS users` at line 120.

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_session/session_security_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
