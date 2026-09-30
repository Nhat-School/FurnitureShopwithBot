## 2026-09-29T16:46:06Z
You are a Worker implementing Milestone 2: Google OAuth & Session Pages Functions API for Furproject.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m2_auth
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219

Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read TEST_READY.md at: /Users/nhaterik/CloudflareProjects/Furproject/TEST_READY.md
Read Explorer Plans:
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing/oauth_routing_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_session/session_security_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_verify/env_and_verification_plan.md

File Ownership:
You have exclusive write ownership of:
- /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js
- /Users/nhaterik/CloudflareProjects/Furproject/.env.example
Do not modify other files in this milestone.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
1. In `functions/api/[[path]].js`:
   a. Implement Web Crypto API helpers:
      - `base64UrlEncode(bufferOrString)`
      - `base64UrlDecode(str)`
      - `randomBase64Url(bytes)`
      - `sha256Base64Url(str)`
      - `hmacSha256(key, message)`
      - `timingSafeEqual(a, b)`
      - `signSession(payload, secret)`: format `${base64Url(payload)}.${base64Url(signature)}`
      - `verifySession(token, secret)`: verify HMAC-SHA256 signature (supporting both Base64URL and hex signature formats) and verify `payload.exp >= now`.
   b. Implement Google OAuth PKCE endpoints:
      - `GET /api/auth/google`:
        - Generates 32-byte `state` and 64-byte PKCE `code_verifier`.
        - Computes SHA-256 `code_challenge` (S256).
        - Sets cookies `fur_google_oauth_state` and `fur_google_oauth_verifier` with `Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600`.
        - Returns 302 redirect to `https://accounts.google.com/o/oauth2/v2/auth` with `client_id`, `redirect_uri`, `response_type=code`, `scope=openid email profile`, `state`, `code_challenge`, `code_challenge_method=S256`, `prompt=select_account`.
      - `GET /api/auth/google/callback`:
        - Validates query params `code` and `state`.
        - Validates state with `timingSafeEqual`. Returns redirect to `/?auth_error=google_invalid_state` on mismatch.
        - Exchanges code with `https://oauth2.googleapis.com/token` using `code_verifier`.
        - Fetches userinfo from `https://openidconnect.googleapis.com/v1/userinfo`. Checks `email_verified === true`.
        - Decomposes name into `display_name`, `first_name`, `mid_name`, `last_name`.
        - Upserts user into D1 `users` (matching on `(auth_provider = 'google' AND provider_subject = ?)` or email).
        - Upserts customer record in `customers` table linked to user ID.
        - Ensures active cart in `carts` table linked to user ID.
        - Signs session token and sets `fur_session` cookie (`Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure` if https).
        - Clears OAuth state and verifier cookies (`Max-Age=0; Path=/api/auth/google/callback`).
        - Redirects 302 to `/?auth=success`.
      - `GET /api/auth/me`:
        - Enforces method GET (405 on other methods).
        - Reads `fur_session` cookie. If missing or invalid/expired, returns 401 `{ user: null }`.
        - Verifies signature with `env.SESSION_SECRET || DEFAULT_SESSION_SECRET`.
        - Queries D1 `users` joined with `customers` to get fresh profile data. If not found in D1, falls back to claims from verified payload.
        - Returns 200 `{ user: { id, email, display_name, name: display_name, avatar_url, role, customer_type, loyalty_points } }`.
      - `POST /api/auth/logout`:
        - Enforces method POST (405 on other methods).
        - Clears `fur_session` cookie with `Max-Age=0`.
        - Returns 200 `{ success: true, ok: true }`.
      - Retain/adapt `POST /api/auth/google` for offline mock login / testing compatibility.
   c. Fix pre-existing bugs in `functions/api/[[path]].js`:
      - Line 23: `OPTIONS` response currently does `jsonResponse({}, 204)`. Status 204 in Fetch API throws TypeError if body is not null! Change to: `new Response(null, { status: 204, headers: corsHeaders(request) });`.
      - Line 200: empty product search falls through to 404. Return 200 with `{ products: results || [], source: 'd1' }`.
      - Remove obsolete inline `CREATE TABLE IF NOT EXISTS users` at line 120.

2. In `.env.example`:
   Add documented environment variables:
   ```env
   GOOGLE_CLIENT_ID=your_google_client_id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your_google_client_secret
   GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback
   SESSION_SECRET=your_random_32_character_session_signing_secret
   ```

3. Verification:
   Run the following commands:
   - `node tests/e2e/runner.mjs --tier=1 --grep="F6|F7|F8"`
   - `node tests/e2e/runner.mjs --tier=2 --grep="B1|B2"`
   - `node tests/e2e/runner.mjs --tier=2 --grep="B6"`
   - `npm run build`

Deliverables:
Write handoff.md in your working directory documenting:
- Changes applied to `functions/api/[[path]].js` and `.env.example`
- Test commands executed and test pass counts
- Build status
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
