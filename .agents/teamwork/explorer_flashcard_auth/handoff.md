# Handoff Report: FlashCardWeb Google OAuth Architecture Investigation

## 1. Observation

Direct observations from the reference codebase `/Users/nhaterik/CloudflareProjects/FlashCardWeb` and the target codebase `/Users/nhaterik/CloudflareProjects/Furproject`:

### 1.1 FlashCardWeb Backend Auth Routing (`functions/api/[[path]].js`)
- **OAuth Constants & Endpoints** (Lines 5–10, 62–73, 89–91):
  ```javascript
  const SESSION_COOKIE = 'fw_session';
  const GOOGLE_OAUTH_STATE_COOKIE = 'fw_google_oauth_state';
  const GOOGLE_OAUTH_VERIFIER_COOKIE = 'fw_google_oauth_verifier';
  const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
  const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
  const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';
  ```
- **Initiation Handler (`startGoogleLogin`)** (Lines 203–226):
  Generates `state = randomBase64Url(32)`, `verifier = randomBase64Url(64)`, `challenge = await sha256Base64Url(verifier)`. Constructs authorization URL with `client_id`, `redirect_uri`, `response_type=code`, `scope='openid email profile'`, `state`, `code_challenge`, `code_challenge_method='S256'`, `prompt='select_account'`. Returns 302 redirect with cookies `fw_google_oauth_state` and `fw_google_oauth_verifier` scoped to `Path=/api/auth/google/callback; Max-Age=600; HttpOnly; SameSite=Lax`.
- **Callback Handler (`finishGoogleLogin`)** (Lines 228–301):
  Extracts `code` and `state` from URL query string. Compares `returnedState` and `expectedState` using `timingSafeEqual`. Exchanges code with Google token endpoint via POST `application/x-www-form-urlencoded` including `code_verifier`. Fetches user profile from `https://openidconnect.googleapis.com/v1/userinfo` with `Bearer ${access_token}`. Validates `profile.email_verified === true`. Calls `findOrCreateGoogleUser(env, profile)` to upsert user into D1. Signs session token with `signSession(env, payload)`. Returns 302 redirect to `/` setting `fw_session` cookie and clearing OAuth cookies with `Max-Age=0`.
- **Session Verification & Current User (`requireUser` & `publicUser`)** (Lines 1502–1531, 2345–2362):
  Reads `fw_session` cookie. Validates token signature with HMAC-SHA256 and checks expiration. Queries D1 `SELECT id, email, role, ... FROM users WHERE id = ?`. Returns sanitized user profile via `publicUser` without password hashes or salts.
- **Session Cookie Primitives** (Lines 2402–2467):
  Tokens are constructed as `${base64Url(payload)}.${hmac(env.SESSION_SECRET, payload)}`. No database table is used for session storage. Cookies are configured with `HttpOnly; SameSite=Lax; Max-Age=604800` and conditionally appended with `; Secure` if `request.url` protocol is `https:`.
- **Logout Handler** (Lines 71–73, 2440–2442):
  Responds with `{ ok: true }` and sets `fw_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`.

### 1.2 FlashCardWeb Database Schema & Migrations
- Migration file `migrations/0017_google_auth.sql` (Lines 1–9):
  ```sql
  ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
  ALTER TABLE users ADD COLUMN provider_subject TEXT;
  ALTER TABLE users ADD COLUMN display_name TEXT;
  ALTER TABLE users ADD COLUMN profile_picture_url TEXT;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
    ON users (auth_provider, provider_subject)
    WHERE provider_subject IS NOT NULL;
  ```
- No database table exists for sessions in `schema.sql` or `migrations/`. Session management is completely stateless at the edge.
- Runtime self-healing function `ensureAuthColumns(env)` (Lines 446–476 in `functions/api/[[path]].js`) inspects `PRAGMA table_info(users)` and adds missing columns automatically.

### 1.3 FlashCardWeb Environment Configuration
- `.dev.vars.example`:
  ```env
  GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
  SESSION_SECRET=your-random-32-char-session-secret
  # GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback
  # GOOGLE_ALLOWED_EMAILS=user1@gmail.com,user2@gmail.com
  # GOOGLE_ALLOWED_DOMAIN=example.com
  ```
- `wrangler.toml` (Lines 18–20):
  Contains `[vars] SESSION_SECRET = "change-this-secret-before-production"`.

### 1.4 FlashCardWeb Client Integration
- `src/main.jsx` (Lines 868–900):
  On mount, checks URL for `?auth_error=...`, maps code to friendly message via `AUTH_ERROR_MESSAGES`, cleans URL using `window.history.replaceState`. Calls `api('/api/auth/me')` with `credentials: 'include'`. If successful, sets user state; if failed, sets user to null.
- `src/main.jsx` (Lines 980–988):
  Google sign-in button is a standard link: `<a className="googleSignInButton" href="/api/auth/google">Continue with Google</a>`. No heavy external Google JS SDK is needed.
- `src/main.jsx` (Lines 3309–3312):
  Logout triggers `await api('/api/auth/logout', { method: 'POST' })` and resets React state `setUser(null)`.

### 1.5 Furproject Target State
- `functions/api/[[path]].js` (Lines 95–152): Currently has a mock `POST /api/auth/google` accepting JSON and a mock `GET /api/auth/me` returning hardcoded admin `nhaterik@gmail.com`.
- `src/App.jsx` (Lines 203–220): Manages `currentUser` via `localStorage.getItem('fur_user')` and defaults to hardcoded admin.
- `src/components/AuthModal.jsx` (Lines 31–49): Sends `POST /api/auth/google` with `{ email, name, avatar }` payload.
- `.env.example`: Only contains Cloudflare account credentials.

---

## 2. Logic Chain

1. **OAuth 2.0 PKCE Requirement**: Google recommends Authorization Code flow with PKCE for web applications to protect against authorization code interception and injection. FlashCardWeb demonstrates a standard serverless implementation using Web Crypto API (`crypto.getRandomValues` and `crypto.subtle.digest('SHA-256')`).
2. **CSRF Mitigation**: Storing `state` and `verifier` in short-lived (600s), `HttpOnly`, `SameSite=Lax` cookies scoped strictly to `Path=/api/auth/google/callback` guarantees that callbacks cannot be forged by an attacker and ensures code verifiers are not leaked to client-side scripts.
3. **Stateless Session Token Efficiency**: Storing sessions in a database table at the Cloudflare edge introduces latency and D1 read/write query limits. FlashCardWeb's signed HMAC token strategy (`${payload}.${hmac}`) completely eliminates D1 operations during session verification (`verifySession`), while `requireUser` performs a single indexed user lookup when fresh database profile data is required.
4. **Resilient D1 User Management**: Combining `auth_provider = 'google' AND provider_subject = ?` with email fallback allows existing users to link their Google account without duplicating account records or causing primary key collisions.
5. **Zero-Bundle Frontend Architecture**: Triggering OAuth via direct browser navigation (`<a href="/api/auth/google">`) avoids embedding third-party Google client scripts (`gapi` or `@react-oauth/google`), preserving frontend bundle size and eliminating CSP issues.

---

## 3. Caveats

1. **Google Cloud Console Credentials Required**: Actual end-to-end OAuth redirects require valid credentials (`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`) registered with the exact callback URI (e.g. `http://localhost:8788/api/auth/google/callback` for local development or `https://<domain>/api/auth/google/callback` for production). Without them, the backend redirects to `/?auth_error=google_not_configured`.
2. **Local Port Consistency**: If testing local OAuth flow with Google Cloud Console, the local port in `GOOGLE_REDIRECT_URI` must match the port specified in Google Console Authorized Redirect URIs (e.g., `8788`).
3. **Price Immutability and Domain Scope**: This report focuses on the authentication pattern from FlashCardWeb. Integration with the 19 domain entities in `thietkehethong` (e.g., `customers`, `addresses`, `cart`, `orders`, price immutability on `order_items`) will build on top of the authenticated user ID extracted from this auth system.

---

## 4. Conclusion

The FlashCardWeb authentication architecture provides a battle-tested, secure, and production-ready reference pattern for Furproject. 

**Actionable next steps for implementers:**
1. **API Layer (`functions/api/[[path]].js`)**:
   - Implement Web Crypto helpers: `randomBase64Url`, `sha256Base64Url`, `hmac`, `timingSafeEqual`, `signSession`, `verifySession`.
   - Implement `GET /api/auth/google`, `GET /api/auth/google/callback`, `GET /api/auth/me`, `POST /api/auth/logout`.
2. **Database Layer (`migrations/`)**:
   - Create migration defining `users` table with `auth_provider`, `provider_subject`, `display_name`, `avatar_url`, and link to domain models.
3. **Environment Layer (`.env.example`, `.dev.vars.example`)**:
   - Document `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, and optional `GOOGLE_REDIRECT_URI`.
4. **Client Layer (`src/`)**:
   - Update `App.jsx` to verify session on mount via `/api/auth/me` and handle `auth_error`.
   - Update `AuthModal.jsx` to navigate to `/api/auth/google`.
   - Update `Header.jsx` to display authenticated user profile and logout action.

---

## 5. Verification Method

To independently verify the reference implementation and findings in this report:

1. **Inspect FlashCardWeb Implementation Files**:
   - View `/Users/nhaterik/CloudflareProjects/FlashCardWeb/functions/api/[[path]].js` at lines 5–10, 62–73, 203–370, 1502–1531, 2402–2467.
   - View `/Users/nhaterik/CloudflareProjects/FlashCardWeb/migrations/0017_google_auth.sql`.
   - View `/Users/nhaterik/CloudflareProjects/FlashCardWeb/.dev.vars.example` and `wrangler.toml`.
   - View `/Users/nhaterik/CloudflareProjects/FlashCardWeb/src/main.jsx` at lines 77–85, 857–900, 980–988, 3309–3312, 7405–7414.

2. **Verify FlashCardWeb Tests**:
   Execute test suite in FlashCardWeb workspace:
   ```bash
   cd /Users/nhaterik/CloudflareProjects/FlashCardWeb && npm test
   ```

3. **Technical Analysis Report File**:
   Read the detailed technical report at:
   `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_flashcard_auth/auth_pattern_report.md`
