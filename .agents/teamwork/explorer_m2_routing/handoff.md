# Milestone 2 Handoff Report: Google OAuth 2.0 PKCE Flow & Pages Functions Routing

**Agent:** `explorer_m2_routing`  
**Milestone:** Milestone 2 (F6: OAuth PKCE Flow, F7: Session Management, F8: Environment Configuration)  
**Target Output Artifact:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing/oauth_routing_plan.md`  

---

## 1. Observation

1. **Existing Pages Functions Auth Route**:
   In `/Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js` (lines 93–152), the current auth routing only handles:
   - `POST /api/auth/google`: Accepts mock JSON `{ email, name, avatar }` and writes to an inline-created `users` table with schema `(id, email, name, avatar_url, role, created_at)`.
   - `GET /api/auth/me`: Returns a hardcoded JSON mock for `'nhaterik@gmail.com'`.
   - There is no implementation of `GET /api/auth/google`, `GET /api/auth/google/callback`, or `POST /api/auth/logout`.

2. **D1 Domain Schema Contract**:
   In `/Users/nhaterik/CloudflareProjects/Furproject/migrations/0002_domain_schema.sql` (lines 5–32), the database defines:
   - `users`: `(id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, auth_provider TEXT NOT NULL DEFAULT 'google', provider_subject TEXT, display_name TEXT, first_name TEXT, mid_name TEXT, last_name TEXT, phone TEXT, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'customer', created_at, updated_at)`
   - `customers`: `(id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, customer_type TEXT NOT NULL DEFAULT 'standard', loyalty_points INTEGER NOT NULL DEFAULT 0, created_at)`
   - `carts`: `(id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at, updated_at)`
   - Partial unique index: `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;`

3. **FlashCardWeb Proven Patterns**:
   In `/Users/nhaterik/CloudflareProjects/FlashCardWeb/functions/api/[[path]].js`:
   - `startGoogleLogin` (lines 203–226): Generates 32-byte `state`, 64-byte `verifier`, computes SHA-256 `challenge`, sets cookies scoped to callback route with `Max-Age=600`, and redirects 302 to Google.
   - `finishGoogleLogin` (lines 228–301): Validates `state` via `timingSafeEqual`, exchanges code with `https://oauth2.googleapis.com/token`, queries `https://openidconnect.googleapis.com/v1/userinfo`, validates `email_verified === true`, upserts user into D1, signs session token, and sets session cookie.

4. **E2E Test Suite Expectations**:
   - `tests/e2e/tier1_feature.test.mjs`:
     - `T1.F6.1`–`T1.F6.4` (lines 360–393): `GET /api/auth/google` must return 302 to `https://accounts.google.com/o/oauth2/v2/auth` with `code_challenge_method=S256`, `code_challenge`, `state`, `client_id`, setting cookies `fur_google_oauth_state` (length $\ge 32$) and `fur_google_oauth_verifier` (`HttpOnly`, `Max-Age=600`).
     - `T1.F6.5` (lines 395–402): `GET /api/auth/google/callback` without state redirects with `auth_error=google_invalid_state`.
     - `T1.F7.1`–`T1.F7.5` (lines 408–462): Session tokens must use `payload.signature` format; `GET /api/auth/me` returns 200 with user profile on valid session or 401 `{ user: null }` without; `POST /api/auth/logout` sets cookie `Max-Age=0` and returns `{ success: true }`.
     - `T1.F8.1`–`T1.F8.4` (lines 468–492): `.env.example` must document `GOOGLE_CLIENT_ID=`, `GOOGLE_CLIENT_SECRET=`, `SESSION_SECRET=`, and `GOOGLE_REDIRECT_URI=`.
   - `tests/e2e/helpers.mjs` (lines 220–276): Session signatures are computed as `base64UrlEncode(crypto.subtle.sign('HMAC', ...))`.
   - `tests/e2e/tier2_boundary.test.mjs`:
     - `T2.1`–`T2.5`: Validates callback behavior on missing code, forged state, missing verifier, and `error=access_denied`.
     - `T2.6`–`T2.10`: Validates malformed, tampered, expired, and empty session cookies.
     - `T2.63` (line 899): `PUT /api/auth/google` must return 405 Method Not Allowed or 404.

5. **Environment Configuration Gap**:
   In `/Users/nhaterik/CloudflareProjects/Furproject/.env.example`, only Cloudflare credentials are documented; Google OAuth variables and `SESSION_SECRET` are missing.

---

## 2. Logic Chain

1. **PKCE Security & State Validation**:
   - RFC 7636 requires a high-entropy `code_verifier` (between 43 and 128 characters) and an `S256` code challenge. Generating 64 random bytes encoded as base64url yields 86 characters, strictly complying with the RFC.
   - For CSRF protection, generating a 32-byte base64url `state` and verifying it with `timingSafeEqual` against the cookie prevents state forgery and timing side channels (Obs 3, 4).
   - Cookies `fur_google_oauth_state` and `fur_google_oauth_verifier` must be path-restricted to `Path=/api/auth/google/callback` with `HttpOnly; SameSite=Lax; Max-Age=600`. When clearing them, the path `/api/auth/google/callback` must be explicitly specified with `Max-Age=0`, or browsers will not clear the scoped cookies.

2. **Session Interoperability**:
   - The test runner helper (`tests/e2e/helpers.mjs`) signs session tokens using base64url-encoded HMAC signatures, while FlashCardWeb used hex signatures.
   - By structuring `verifySession` to validate against both base64url and hex representations and outputting base64url in `signSession`, the application achieves 100% interoperability with both the test suite and historical reference implementations.

3. **Name Decomposition & Schema Contract**:
   - Vietnamese and international names delivered by Google UserInfo (`sub`, `email`, `name`, `given_name`, `family_name`) must be parsed into `display_name`, `first_name`, `mid_name`, and `last_name` to populate `users` (Obs 2).
   - In Vietnamese conventions, the first word is the family name (`last_name` / Họ), the last word is the given name (`first_name` / Tên), and all middle words form the middle name (`mid_name` / Tên đệm). The designed `decomposeName` algorithm gracefully handles 1, 2, 3, and 4+ token names as well as Google-provided `given_name`/`family_name` tokens.

4. **Customer Profile & Persistent Cart Linkage**:
   - In `0002_domain_schema.sql`, `customers` has a 1:1 foreign key constraint referencing `users(id)`.
   - In `upsertGoogleUserAndCustomer`, immediately upon upserting or creating a user in `users`, a corresponding record in `customers` is ensured (`INSERT OR IGNORE INTO customers`).
   - Additionally, an active cart session is initialized in `carts` (`INSERT OR IGNORE INTO carts`), guaranteeing that downstream Milestone 3 persistent cart endpoints (`/api/cart`) have an immediate valid aggregate root.

5. **Runtime Schema Self-Healing**:
   - A cached PRAGMA check `ensureAuthColumns(env)` dynamically verifies columns in `users` and ensures `customers` and `carts` exist, safeguarding against cases where migrations were not executed.

---

## 3. Caveats

1. **Third-Party Google Network Calls During Testing**:
   Real network calls to `https://oauth2.googleapis.com/token` and `https://openidconnect.googleapis.com/v1/userinfo` will fail in offline or mock test runner environments if an invalid code is supplied. The E2E test runner tests boundary conditions (`google_invalid_state`, `google_access_denied`, missing verifier), which reject before making outbound HTTP calls. For offline happy-path testing, `handleMockGoogleLogin` (`POST /api/auth/google`) is retained.
2. **SameSite=Lax vs Cross-Site Top-Level POST**:
   OAuth 2.0 redirection to `/api/auth/google/callback` uses HTTP `GET`, so `SameSite=Lax` cookies are delivered properly by modern browsers.
3. **No Caveats Beyond Above**.

---

## 4. Conclusion

The implementation design for Milestone 2 is complete, fully specified, and documented in:
`/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing/oauth_routing_plan.md`

The plan provides drop-in ready code for:
- `GET /api/auth/google` (302 redirect with PKCE S256 challenge, 32-byte state, and scoped cookies).
- `GET /api/auth/google/callback` (timing-safe state validation, code exchange, email verification, name decomposition, user/customer D1 upsert, signed session cookie, and redirect to `/?auth=success`).
- `GET /api/auth/me` and `POST /api/auth/logout`.
- `.env.example` additions.

---

## 5. Verification Method

1. **Inspect Artifact**:
   Read `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m2_routing/oauth_routing_plan.md` to confirm all code drafts and architectural details.
2. **Execute E2E Test Suite (Tier 1 & Tier 2 Auth Subsets)**:
   Once the implementer applies the plan to `functions/api/[[path]].js` and `.env.example`, verify execution via:
   ```bash
   node tests/e2e/runner.mjs --tier=1 --grep="F6|F7|F8"
   node tests/e2e/runner.mjs --tier=2 --grep="B1|B2"
   ```
3. **Run Full Test Suite**:
   ```bash
   node tests/e2e/runner.mjs
   ```
4. **Invalidation Conditions**:
   - Any failure of `T1.F6.1` through `T1.F6.5`, `T1.F7.1` through `T1.F7.5`, or `T1.F8.1` through `T1.F8.4`.
   - Failure of `T2.1` through `T2.10` or `T2.63`.
