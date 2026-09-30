# Google OAuth & Session Architecture: FlashCardWeb Reference Analysis Report

## Executive Summary

This report presents a comprehensive technical investigation of the Google OAuth 2.0 implementation and stateless session management pattern deployed in `FlashCardWeb` (`/Users/nhaterik/CloudflareProjects/FlashCardWeb`).

The implementation follows modern web security best practices for serverless edge environments:
- **Authorization Code Flow with PKCE (Proof Key for Code Exchange)** using `S256` code challenges.
- **CSRF Protection** via cryptographically random `state` tokens stored in short-lived, path-restricted, `HttpOnly` cookies.
- **Stateless Signed Sessions** utilizing HMAC-SHA256 signatures over base64url-encoded JSON payloads—completely eliminating database session table lookups and session state storage overhead.
- **Cloudflare D1 Persistence** for user accounts with automatic fallback user creation, Google profile syncing, and dynamic runtime column verification (`ensureAuthColumns`).
- **Seamless Browser Integration** with transparent cookie-based session restoration on load, error handling via URL parameter extraction, and clean cookie revocation on logout.

---

## 1. Cloudflare Pages Functions Auth Routing & Handlers

In FlashCardWeb, all backend API routes are handled inside a single catch-all Cloudflare Pages Function at `functions/api/[[path]].js`.

### 1.1 Route Dispatching Architecture

Inside `export async function onRequest({ request, env, waitUntil })`:
- The incoming URL pathname `/api/...` is stripped and split into path segments:
  ```javascript
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const segments = path.split('/').filter(Boolean);
  const method = request.method.toUpperCase();
  ```
- Auth routes are resolved:
  - `GET /api/auth/google` (segments: `['auth', 'google']`, length === 2) -> `startGoogleLogin(request, env)`
  - `GET /api/auth/google/callback` (segments: `['auth', 'google', 'callback']`) -> `finishGoogleLogin(request, env)`
  - `POST /api/auth/logout` (segments: `['auth', 'logout']`) -> clears session cookie and returns `{ ok: true }`
  - `GET /api/auth/me` (segments: `['auth', 'me']`) -> calls `requireUser(request, env)` and returns `{ user: publicUser(user) }`
  - `POST /api/auth/login` (segments: `['auth', 'login']`) -> legacy email/password login

---

### 1.2 Google OAuth Initialization: `GET /api/auth/google`

**Function:** `async function startGoogleLogin(request, env)` (Lines 203–226 in `functions/api/[[path]].js`)

#### Step-by-Step Execution:
1. **Configuration Validation:**
   Verifies that `env.GOOGLE_CLIENT_ID` and `env.GOOGLE_CLIENT_SECRET` are configured. If missing, immediately redirects back to `/` with query parameter `?auth_error=google_not_configured`.
2. **Cryptographic State Generation (CSRF Defense):**
   Generates a 32-byte cryptographically secure random string encoded as base64url:
   ```javascript
   const state = randomBase64Url(32);
   ```
3. **PKCE Verifier & Challenge (RFC 7636):**
   Generates a 64-byte random string for `code_verifier`, and computes the SHA-256 digest encoded as base64url for `code_challenge`:
   ```javascript
   const verifier = randomBase64Url(64);
   const challenge = await sha256Base64Url(verifier);
   ```
4. **Redirect URI Resolution:**
   Determines redirect URI via `googleRedirectUri(request, env)`:
   ```javascript
   function googleRedirectUri(request, env) {
     return String(env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString()).trim();
   }
   ```
   If `GOOGLE_REDIRECT_URI` is not explicitly defined in environment variables, it dynamically resolves the callback URL based on `request.url` origin.
5. **Google Authorization URL Construction:**
   Constructs the target URL pointing to Google's OAuth endpoint:
   - Endpoint: `https://accounts.google.com/o/oauth2/v2/auth`
   - Parameters:
     - `client_id`: `env.GOOGLE_CLIENT_ID`
     - `redirect_uri`: `redirectUri`
     - `response_type`: `code`
     - `scope`: `openid email profile`
     - `state`: `state`
     - `code_challenge`: `challenge`
     - `code_challenge_method`: `S256`
     - `prompt`: `select_account`
6. **Setting Ephemeral Cookies & 302 Redirect:**
   Issues a `302 Found` response containing two temporary cookies scoped strictly to the callback route:
   - Cookie `fw_google_oauth_state`: stores `state`, `Path=/api/auth/google/callback`, `Max-Age=600` (10 minutes), `HttpOnly`, `SameSite=Lax`, `Secure` (when HTTPS).
   - Cookie `fw_google_oauth_verifier`: stores `verifier`, `Path=/api/auth/google/callback`, `Max-Age=600`, `HttpOnly`, `SameSite=Lax`, `Secure`.

```javascript
return redirectWithCookies(authorizationUrl.toString(), [
  oauthCookie(GOOGLE_OAUTH_STATE_COOKIE, state, 600, request),
  oauthCookie(GOOGLE_OAUTH_VERIFIER_COOKIE, verifier, 600, request),
]);
```

---

### 1.3 Google OAuth Callback: `GET /api/auth/google/callback`

**Function:** `async function finishGoogleLogin(request, env)` (Lines 228–301 in `functions/api/[[path]].js`)

#### Step-by-Step Execution:
1. **Google Error Check:**
   Inspects `url.searchParams.get('error')`. If Google returns an access denial or user cancellation, redirects to `/?auth_error=google_access_denied` with `clearOauthCookies = true`.
2. **State & Verifier Verification:**
   - Retrieves `code` and `state` from URL query parameters.
   - Retrieves `expectedState` from cookie `fw_google_oauth_state`.
   - Retrieves `verifier` from cookie `fw_google_oauth_verifier`.
   - Validates using timing-safe comparison to prevent timing attacks:
     ```javascript
     if (!code || !verifier || !returnedState || !timingSafeEqual(returnedState, expectedState)) {
       return googleAuthErrorRedirect(request, 'google_invalid_state', true);
     }
     ```
3. **Token Exchange with Google:**
   Performs a server-to-server POST request to `https://oauth2.googleapis.com/token`:
   ```javascript
   const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
     method: 'POST',
     headers: { 'content-type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams({
       code,
       client_id: env.GOOGLE_CLIENT_ID,
       client_secret: env.GOOGLE_CLIENT_SECRET,
       redirect_uri: redirectUri,
       grant_type: 'authorization_code',
       code_verifier: verifier,
     }),
   });
   const tokenData = await tokenResponse.json().catch(() => ({}));
   ```
   If HTTP status is not OK or `tokenData.access_token` is missing, redirects with `auth_error=google_token_failed`.
4. **Fetching User Profile:**
   Requests user information from Google OpenID Connect endpoint:
   ```javascript
   const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
     headers: { Authorization: `Bearer ${tokenData.access_token}` },
   });
   const profile = await profileResponse.json().catch(() => ({}));
   ```
   Verifies:
   - `profileResponse.ok === true`
   - `email` and `sub` (Google subject ID) exist
   - `profile.email_verified === true` (Crucial: prevents unverified email takeovers)
5. **Access Control Filtering:**
   Applies `isGoogleAccountAllowed(email, env)`:
   - Checks `GOOGLE_ALLOWED_EMAILS` (comma-separated list).
   - Checks `GOOGLE_ALLOWED_DOMAIN` (e.g., `@organization.com`).
   - If both are empty, all verified Google accounts are allowed.
6. **User Upsert into Cloudflare D1 (`findOrCreateGoogleUser`):**
   - First queries D1 by Google provider ID:
     ```sql
     SELECT * FROM users WHERE auth_provider = 'google' AND provider_subject = ?
     ```
   - If not found, falls back to matching by verified email:
     ```sql
     SELECT * FROM users WHERE lower(email) = lower(?)
     ```
   - **Update existing user:**
     If user exists, updates profile attributes:
     ```sql
     UPDATE users
     SET email = ?, auth_provider = 'google', provider_subject = ?, display_name = ?, profile_picture_url = ?
     WHERE id = ?
     ```
   - **Create new user:**
     If user does not exist, generates a random salt and password hash (PBKDF2-SHA256) to maintain schema compatibility with non-null password fields, evaluates whether email is the predefined `ADMIN_EMAIL` (`nhaterik@gmail.com`), and inserts into `users`:
     ```sql
     INSERT INTO users (
       email, password_salt, password_hash, auth_provider, provider_subject,
       display_name, profile_picture_url, role, can_view_analytics,
       can_upload_images, can_save_cards, can_save_calendar_notes
     ) VALUES (?, ?, ?, 'google', ?, ?, ?, ?, ?, ?, 1, 1)
     ```
7. **Session Token Generation & Redirect:**
   - Issues signed session token:
     ```javascript
     const token = await signSession(env, {
       id: user.id,
       email: user.email,
       role: user.role,
       exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 days expiration
     });
     ```
   - Returns a `302 Found` redirect to root `/` with headers:
     - Sets session cookie `fw_session=${token}` (`Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`).
     - Clears OAuth state cookie `fw_google_oauth_state` (`Max-Age=0`).
     - Clears OAuth verifier cookie `fw_google_oauth_verifier` (`Max-Age=0`).

---

### 1.4 Session Management & Cryptographic Signing

FlashCardWeb implements a **stateless signed token session model** without a database `sessions` table.

#### Session Token Structure:
```
[Base64Url(JSON Payload)] . [HMAC-SHA256 Hex Signature]
```

#### Cryptographic Implementation Details:
- **Signing (`signSession`):**
  ```javascript
  async function signSession(env, payload) {
    const body = base64UrlEncode(JSON.stringify(payload));
    return `${body}.${await hmac(env.SESSION_SECRET, body)}`;
  }
  ```
- **HMAC Computation (`hmac`):**
  Uses the standard Web Crypto API (`crypto.subtle`) available in Cloudflare Workers runtime:
  ```javascript
  async function hmac(secret, value) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret || 'dev-secret'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))));
  }
  ```
- **Verification (`verifySession`):**
  ```javascript
  async function verifySession(env, token) {
    const [body, signature] = token.split('.');
    if (!body || !signature) throw httpError(401, 'Authentication required');
    if (!timingSafeEqual(signature, await hmac(env.SESSION_SECRET, body))) {
      throw httpError(401, 'Authentication required');
    }
    const payload = JSON.parse(base64UrlDecode(body));
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) throw httpError(401, 'Session expired');
    return payload;
  }
  ```
- **Constant-Time Comparison (`timingSafeEqual`):**
  Protects HMAC signature verification against side-channel timing attacks:
  ```javascript
  function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let mismatch = 0;
    for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return mismatch === 0;
  }
  ```

#### Cookie Attributes Specification:
| Attribute | Session Cookie (`fw_session`) | OAuth Cookies (`fw_google_oauth_*`) |
|---|---|---|
| **Name** | `fw_session` | `fw_google_oauth_state`, `fw_google_oauth_verifier` |
| **Path** | `/` | `/api/auth/google/callback` |
| **HttpOnly** | `true` (Inaccessible to JS) | `true` |
| **SameSite** | `Lax` (Prevents CSRF, allows top-level redirects) | `Lax` |
| **Max-Age** | `604800` (7 days) | `600` (10 minutes) |
| **Secure** | Appended dynamically if `request.url` protocol is `https:` | Appended dynamically if `https:` |

Helper implementation:
```javascript
function sessionCookieValue(token, request) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureCookieSuffix(request)}`;
}

function oauthCookie(name, value, maxAge, request) {
  return `${name}=${value}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookieSuffix(request)}`;
}

function secureCookieSuffix(request) {
  try {
    return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  } catch {
    return '; Secure';
  }
}
```

---

### 1.5 Current User Profile Endpoint: `GET /api/auth/me`

**Handlers:** Lines 89–91, 1502–1531, 2345–2362 in `functions/api/[[path]].js`

1. **Extraction & Verification (`requireUser`):**
   - Retrieves the `fw_session` cookie value from `request.headers.get('cookie')`.
   - If missing, throws `401 Authentication required`.
   - Calls `verifySession(env, token)` to validate signature and expiration.
2. **D1 User Retrieval:**
   - Queries `users` table using the verified `payload.id`:
     ```sql
     SELECT id, email, role, avatar_key, auth_provider, display_name, profile_picture_url, ...
     FROM users WHERE id = ?
     ```
   - Throws `401 Authentication required` if user no longer exists in D1.
3. **Sanitization (`publicUser`):**
   - Sanitizes internal properties (omits `password_salt` and `password_hash`).
   - Normalizes display fields:
     ```javascript
     function publicUser(user) {
       return {
         id: user.id,
         email: user.email,
         role: user.role,
         displayName: user.display_name || null,
         authProvider: user.auth_provider || 'password',
         avatarUrl: user.avatar_key ? '/api/avatar' : (user.profile_picture_url || null),
         ...
       };
     }
     ```
   - Responds with `{ user: publicUser(user) }` (200 OK).

---

### 1.6 Logout Endpoint: `POST /api/auth/logout`

**Handler:** Line 71–73, 2440–2442 in `functions/api/[[path]].js`

- Returns a 200 JSON response `{ ok: true }` with a header instructing the browser to clear the session cookie:
  ```javascript
  function clearCookie(request) {
    return { 'set-cookie': clearCookieValue(SESSION_COOKIE, request, '/') };
  }
  function clearCookieValue(name, request, path = '/') {
    return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix(request)}`;
  }
  ```
- Because sessions are stateless HMAC tokens, setting `Max-Age=0` immediately removes the cookie from the client browser.

---

## 2. Cloudflare D1 Database Schema & Migrations

### 2.1 Users Table Schema (`schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  auth_provider TEXT NOT NULL DEFAULT 'password',
  provider_subject TEXT,
  display_name TEXT,
  profile_picture_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  can_view_analytics INTEGER NOT NULL DEFAULT 0,
  can_upload_images INTEGER NOT NULL DEFAULT 0,
  can_save_cards INTEGER NOT NULL DEFAULT 1,
  can_save_calendar_notes INTEGER NOT NULL DEFAULT 1,
  avatar_key TEXT,
  banana_streak INTEGER NOT NULL DEFAULT 0,
  last_banana_clicked TEXT DEFAULT NULL,
  max_streak INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
  ON users (auth_provider, provider_subject)
  WHERE provider_subject IS NOT NULL;
```

### 2.2 Google Auth Migration (`migrations/0017_google_auth.sql`)

When upgrading an existing database without dropping tables, FlashCardWeb uses:
```sql
ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'password';
ALTER TABLE users ADD COLUMN provider_subject TEXT;
ALTER TABLE users ADD COLUMN display_name TEXT;
ALTER TABLE users ADD COLUMN profile_picture_url TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
  ON users (auth_provider, provider_subject)
  WHERE provider_subject IS NOT NULL;
```

### 2.3 Runtime Schema Self-Healing (`ensureAuthColumns`)

In addition to static migration scripts, FlashCardWeb embeds an automated runtime migration helper `ensureAuthColumns(env)` (Lines 446–476):
- Queries `PRAGMA table_info(users)`.
- If `auth_provider`, `provider_subject`, `display_name`, or `profile_picture_url` are missing from the live database, it executes `ALTER TABLE users ADD COLUMN ...` on the fly.
- Caches the check result in an in-memory boolean flag `authMigrationCompleted` to avoid repeated PRAGMA queries on subsequent requests.
- This design ensures zero-downtime rolling deployments where code runs before manual migrations are applied.

---

## 3. Environment Variables Configuration

FlashCardWeb separates public configuration, local development secrets, and production secrets.

### 3.1 Variables Overview

| Variable Name | Required | Default / Fallback | Description |
|---|---|---|---|
| `GOOGLE_CLIENT_ID` | **Yes** | None | OAuth 2.0 Web Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | **Yes** | None | OAuth 2.0 Client Secret from Google Cloud Console |
| `SESSION_SECRET` | **Yes** | `'dev-secret'` | HMAC secret key used to sign and verify session cookies |
| `GOOGLE_REDIRECT_URI` | No | `${origin}/api/auth/google/callback` | Explicit redirect URI (used if runtime origin differs from registered callback) |
| `GOOGLE_ALLOWED_EMAILS`| No | All emails allowed | Comma-separated list of allowed user emails |
| `GOOGLE_ALLOWED_DOMAIN`| No | All domains allowed | Restricts login to a specific domain (e.g. `company.com`) |

### 3.2 Configuration Files in FlashCardWeb

- **`.dev.vars.example` (Local Dev Secrets):**
  ```env
  GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
  GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
  SESSION_SECRET=your-random-32-char-session-secret

  # Optional variables:
  # GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback
  # GOOGLE_ALLOWED_EMAILS=user1@gmail.com,user2@gmail.com
  # GOOGLE_ALLOWED_DOMAIN=example.com
  ```
- **`wrangler.toml` (Cloudflare Pages Configuration):**
  ```toml
  name = "flashcardfree"
  compatibility_date = "2026-05-20"
  pages_build_output_dir = "dist"

  [[d1_databases]]
  binding = "DB"
  database_name = "flashcard-db"
  database_id = "346149bd-c25b-4611-8757-9fb37168d0fa"

  [vars]
  SESSION_SECRET = "change-this-secret-before-production"
  ```
- **Production Secret Deployment Commands:**
  ```bash
  npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name <project-name>
  npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name <project-name>
  npx wrangler pages secret put SESSION_SECRET --project-name <project-name>
  ```

---

## 4. Client-Side Integration in FlashCardWeb

The frontend integration in `FlashCardWeb` (`src/main.jsx`) implements session restoration, OAuth redirection, error banner handling, and logout.

### 4.1 Global API Client (`api`)

Lines 7405–7414 in `src/main.jsx`:
```javascript
async function api(path, options = {}) {
  const headers = options.body instanceof FormData
    ? options.headers
    : { 'content-type': 'application/json', ...(options.headers || {}) };
  const response = await fetch(path, { credentials: 'include', ...options, headers });
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json() : {};
  if (!response.ok) throw new Error(data.error || 'Request failed');
  return data;
}
```
**Key feature:** `credentials: 'include'` is explicitly passed, guaranteeing that the browser sends and receives the `fw_session` cookie for all API calls.

### 4.2 Application Initialization & Session Restoration

Lines 857–900 in `src/main.jsx`:
```javascript
function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');

  useEffect(() => {
    // 1. Check for OAuth callback error in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    const authErrorCode = urlParams.get('auth_error');
    if (authErrorCode) {
      setAuthError(AUTH_ERROR_MESSAGES[authErrorCode] || 'Sign-in failed. Please try again.');
      urlParams.delete('auth_error');
      const query = urlParams.toString();
      window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
    }

    // 2. Fetch authenticated user profile from /api/auth/me
    api('/api/auth/me')
      .then(({ user: nextUser }) => setUser(nextUser))
      .catch(() => setUser(null))
      .finally(() => setAuthChecked(true));
  }, []);
```

### 4.3 Error Message Dictionary

Lines 77–85 in `src/main.jsx`:
```javascript
const AUTH_ERROR_MESSAGES = {
  google_not_configured: 'Google sign-in is not configured yet. Please contact the administrator.',
  google_access_denied: 'Google sign-in was cancelled.',
  google_invalid_state: 'The sign-in request expired. Please try again.',
  google_token_failed: 'Google could not complete sign-in. Please try again.',
  google_unverified_email: 'A verified Google email address is required.',
  google_account_not_allowed: 'This Google account is not allowed to use this app.',
  google_sign_in_failed: 'Google sign-in failed. Please try again.',
};
```

### 4.4 Google Sign-In Trigger Button

Lines 980–988 in `src/main.jsx`:
```jsx
<a className="googleSignInButton" href="/api/auth/google">
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    {/* Google 4-color 'G' logo paths */}
  </svg>
  Continue with Google
</a>
```
**Mechanism:** Instead of using heavy client-side Google SDKs (`gapi` or `@react-oauth/google`), the login button is a direct HTML hyperlink pointing to the backend initiation route `/api/auth/google`. This eliminates third-party script tracking, reduces frontend bundle size, and allows the backend to strictly govern state, PKCE verifiers, and cookies.

### 4.5 Logout Flow

Lines 3309–3312 in `src/main.jsx`:
```javascript
async function logout() {
  await api('/api/auth/logout', { method: 'POST' });
  onLogout(); // Clears user state: setUser(null)
}
```

---

## 5. Architectural Gap Analysis: FlashCardWeb vs. Furproject

A direct comparison reveals major differences between FlashCardWeb's production architecture and Furproject's initial state:

| Component | FlashCardWeb (Reference) | Furproject (Current State) | Required Action for Furproject |
|---|---|---|---|
| **OAuth Flow** | Full server-side OAuth 2.0 + PKCE (`/api/auth/google`, `/api/auth/google/callback`) | Mock `POST /api/auth/google` accepting JSON `{ email, name, avatar }` | Implement `startGoogleLogin` and `finishGoogleLogin` with PKCE & state verification |
| **Session Model** | Stateless signed HMAC-SHA256 session token in `fw_session` cookie | Client-side `localStorage.getItem('fur_user')` with fallback admin | Implement `signSession`, `verifySession`, and `SESSION_COOKIE` |
| **`/api/auth/me`** | Reads cookie, verifies HMAC, queries D1 for verified profile | Returns hardcoded JSON for `nhaterik@gmail.com` | Implement session cookie verification & D1 lookup |
| **`/api/auth/logout`** | `POST /api/auth/logout` returning `set-cookie: Max-Age=0` | Missing | Add logout endpoint clearing session cookie |
| **D1 Schema** | `users` table with `auth_provider`, `provider_subject`, `display_name`, `profile_picture_url`, `role` | Dynamic table creation inside POST handler with only `id, email, name, avatar_url, role` | Add standard migration for `users` with OAuth columns and link to domain entities |
| **Environment Configuration** | `.dev.vars.example` with `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET` | `.env.example` contains only Cloudflare credentials | Add Google OAuth and session secrets to `.dev.vars.example` and `.env.example` |
| **Frontend UI** | Direct `<a href="/api/auth/google">` button, `/api/auth/me` on mount, `?auth_error=` handling | Modal with fast 1-click mock login & custom email form | Integrate real `/api/auth/google` navigation in `AuthModal.jsx`, restore session via `/api/auth/me` on mount in `App.jsx`, add header avatar menu with logout |

---

## 6. Recommended Action Plan for Furproject Implementation

### Phase 1: Pages Functions Auth Endpoints (`functions/api/[[path]].js`)
1. Add utility constants and Web Crypto helpers:
   - `SESSION_COOKIE = 'fur_session'`, `GOOGLE_OAUTH_STATE_COOKIE = 'fur_google_oauth_state'`, `GOOGLE_OAUTH_VERIFIER_COOKIE = 'fur_google_oauth_verifier'`
   - `randomBase64Url`, `sha256Base64Url`, `hmac`, `timingSafeEqual`, `signSession`, `verifySession`
   - `sessionCookieValue`, `oauthCookie`, `clearCookieValue`
2. Add auth endpoints:
   - `GET /api/auth/google`: initiate PKCE flow with redirect.
   - `GET /api/auth/google/callback`: exchange authorization code, fetch Google userinfo, upsert user into D1 `users` table, set signed `fur_session` cookie, redirect to `/`.
   - `GET /api/auth/me`: verify `fur_session` cookie, retrieve user from D1, return sanitized user profile.
   - `POST /api/auth/logout`: expire `fur_session` cookie.

### Phase 2: D1 Database Schema Migration
1. Create a migration file in `migrations/` (e.g. `0002_user_domain_models.sql`):
   - Table `users` with columns:
     - `id TEXT PRIMARY KEY` (or `INTEGER PRIMARY KEY AUTOINCREMENT`)
     - `email TEXT UNIQUE NOT NULL`
     - `auth_provider TEXT NOT NULL DEFAULT 'google'`
     - `provider_subject TEXT`
     - `display_name TEXT`
     - `avatar_url TEXT`
     - `role TEXT NOT NULL DEFAULT 'customer' CHECK(role IN ('admin', 'customer', 'guest'))`
     - `phone TEXT`
     - `created_at TEXT DEFAULT (datetime('now'))`
     - `updated_at TEXT DEFAULT (datetime('now'))`
   - Unique index: `idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL`.
   - Link domain entities: `addresses`, `cart`, `cart_items`, `orders`, `order_items`.

### Phase 3: Environment Variables Setup
1. Update `.env.example` and create `.dev.vars.example`:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-your-secret
   SESSION_SECRET=your-random-32-char-session-secret
   # Optional:
   # GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback
   ```
2. Document secrets configuration for production deployment (`wrangler pages secret put`).

### Phase 4: Frontend Storefront Integration
1. In `src/App.jsx`:
   - Replace `localStorage` mock admin initialization with `api('/api/auth/me')` on mount.
   - Parse `?auth_error=` from query string, set toast error, clean URL with `window.history.replaceState`.
2. In `src/components/AuthModal.jsx`:
   - Add "Đăng nhập với Google" button linking directly to `/api/auth/google` (or `window.location.href = '/api/auth/google'`).
   - Retain optional fast mock login for guest / testing if desired.
3. In `src/components/Header.jsx`:
   - Display user profile from `/api/auth/me`.
   - Implement "Đăng Xuất" calling `POST /api/auth/logout`, resetting client state to guest.
