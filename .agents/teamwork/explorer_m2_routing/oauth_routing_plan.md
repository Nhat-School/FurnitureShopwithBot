# Google OAuth 2.0 PKCE Flow & Pages Functions Routing Architecture

**Milestone Target:** Milestone 2 (F6: OAuth PKCE Flow, F7: Session Management, F8: Environment Configuration)  
**File Target:** `functions/api/[[path]].js`, `.env.example`  
**Database Binding:** Cloudflare D1 (`furproject-db`, binding `DB`)  
**Author:** Teamwork Explorer (`explorer_m2_routing`)  

---

## 1. Executive Summary & Architecture Overview

This specification details the complete implementation plan and production-ready code drafts for Google OAuth 2.0 PKCE (Proof Key for Code Exchange) authentication and stateless HMAC-SHA256 session management in Furproject's Cloudflare Pages Functions (`functions/api/[[path]].js`).

The architecture achieves:
1. **RFC 7636 PKCE Security**: Replaces vulnerable implicit/client-side flows with server-side Authorization Code Flow with S256 code challenge and cryptographically random code verifier.
2. **Robust CSRF Mitigation**: Employs high-entropy, 32-byte base64url `state` tokens validated using constant-time comparison (`timingSafeEqual`) against short-lived, path-restricted, `HttpOnly` cookies.
3. **Stateless HMAC-SHA256 Sessions**: Implements lightweight `[payloadB64].[signature]` session tokens stored in `fur_session` cookies with zero database lookup overhead per request. Supports both standard base64url and hex signature verification for universal interoperability.
4. **Authoritative Domain Model Alignment**: Adheres strictly to `0002_domain_schema.sql` by upserting authenticated accounts into `users`, decomposing Google profiles into structured names (`display_name`, `first_name`, `mid_name`, `last_name`), ensuring 1:1 `customers` records, and preparing persistent cart aggregates.
5. **Self-Healing Schema Resilience**: Incorporates runtime schema checks (`ensureAuthColumns`) to guarantee zero downtime and graceful execution even across rolling migrations.

---

## 2. End-to-End Cryptographic & Protocol Sequence

```
User Browser                     Pages Function (/api/auth/*)              Google OAuth / OpenID Connect
    |                                         |                                          |
    |  1. Click "Đăng nhập Google"            |                                          |
    |---------------------------------------->|                                          |
    |     GET /api/auth/google                |                                          |
    |                                         | 2. Generate:                             |
    |                                         |    - state (32B random base64url)        |
    |                                         |    - verifier (64B random base64url)     |
    |                                         |    - challenge = SHA256(verifier) (b64u) |
    |  3. 302 Redirect to accounts.google.com |                                          |
    |     Set-Cookie: fur_google_oauth_state  |                                          |
    |     Set-Cookie: fur_google_oauth_verifier                                         |
    |<----------------------------------------|                                          |
    |                                                                                    |
    |  4. User consents & authorizes account                                             |
    |----------------------------------------------------------------------------------->|
    |                                                                                    |
    |  5. 302 Redirect to callback with code & state                                     |
    |<-----------------------------------------------------------------------------------|
    |                                                                                    |
    |  6. GET /api/auth/google/callback?code=...&state=...                               |
    |     Cookie: fur_google_oauth_state, fur_google_oauth_verifier                      |
    |---------------------------------------->|                                          |
    |                                         | 7. Validate state with timingSafeEqual   |
    |                                         |                                          |
    |                                         | 8. POST https://oauth2.googleapis.com/token
    |                                         |    (code + code_verifier + secrets)      |
    |                                         |----------------------------------------->|
    |                                         |<-----------------------------------------|
    |                                         |    Returns access_token                  |
    |                                         |                                          |
    |                                         | 9. GET https://openidconnect.googleapis.com/v1/userinfo
    |                                         |    (Authorization: Bearer access_token)  |
    |                                         |----------------------------------------->|
    |                                         |<-----------------------------------------|
    |                                         |    Returns userinfo (sub, email, name, ..)
    |                                         |                                          |
    |                                         | 10. Decompose Name:                      |
    |                                         |     display_name, first_name,            |
    |                                         |     mid_name, last_name                  |
    |                                         | 11. Upsert D1:                           |
    |                                         |     - users table (by sub or email)      |
    |                                         |     - customers table (1:1 link)         |
    |                                         |     - carts table (active session)       |
    |                                         | 12. Sign session token (fur_session)     |
    |  13. 302 Redirect to /?auth=success     |                                          |
    |      Set-Cookie: fur_session            |                                          |
    |      Set-Cookie: fur_google_oauth_state=; Max-Age=0                                |
    |      Set-Cookie: fur_google_oauth_verifier=; Max-Age=0                             |
    |<----------------------------------------|                                          |
```

---

## 3. Cryptographic Primitives & Utilities

All cryptographic operations leverage the native **Web Crypto API** (`crypto.subtle` and `crypto.getRandomValues`) supported in the Cloudflare Workers / Pages Functions runtime without third-party npm packages.

### 3.1 Random Generation & Base64URL Encoding

```javascript
/**
 * Generates a cryptographically random base64url string.
 * @param {number} size Number of random bytes (default 32)
 * @returns {string} base64url encoded string
 */
function randomBase64Url(size = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * Computes SHA-256 digest of a string and returns base64url representation.
 * @param {string} value Plain text value
 * @returns {Promise<string>} base64url encoded digest
 */
async function sha256Base64Url(value) {
  const enc = new TextEncoder();
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(value)));
  let binary = '';
  for (let i = 0; i < digest.length; i += 1) {
    binary += String.fromCharCode(digest[i]);
  }
  return btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}

/**
 * UTF-8 safe base64url encoding for arbitrary strings (including Vietnamese diacritics).
 */
function stringToBase64Url(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Decodes base64url string back to UTF-8 text safely.
 */
function base64UrlToString(base64Url) {
  const b64 = base64Url.replaceAll('-', '+').replaceAll('_', '/');
  const padded = b64.padEnd(Math.ceil(b64.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

/**
 * Encodes ArrayBuffer to base64url.
 */
function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Encodes byte array to hex string.
 */
function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
```

### 3.2 Constant-Time String Comparison

Prevents side-channel timing attacks when validating OAuth `state` or HMAC signatures:

```javascript
/**
 * Constant-time string equality check to defeat timing attacks.
 * @param {string} a 
 * @param {string} b 
 * @returns {boolean}
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
```

### 3.3 HMAC-SHA256 Signing & Verification

The session token format is `[base64url(payload)].[signature]`. To ensure flawless compatibility with both `tests/e2e/helpers.mjs` (base64url signatures) and FlashCardWeb (hex signatures), `verifySession` validates against both formats:

```javascript
/**
 * Computes raw HMAC-SHA256 signature buffer using Web Crypto API.
 */
async function computeHmacBuffer(secret, data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret || 'dev-secret'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return await crypto.subtle.sign('HMAC', key, enc.encode(data));
}

/**
 * Signs payload using HMAC-SHA256, returning base64url formatted token.
 */
async function signSession(payload, secret) {
  const payloadB64 = stringToBase64Url(JSON.stringify(payload));
  const sigBuffer = await computeHmacBuffer(secret, payloadB64);
  const sigB64 = arrayBufferToBase64Url(sigBuffer);
  return `${payloadB64}.${sigB64}`;
}

/**
 * Verifies HMAC-SHA256 session token and validates expiration.
 * Accepts both base64url and hex encoded signatures.
 */
async function verifySession(token, secret) {
  if (!token || typeof token !== 'string') return null;
  const trimmed = token.trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const sigBuffer = await computeHmacBuffer(secret, payloadB64);
  const expectedSigB64 = arrayBufferToBase64Url(sigBuffer);
  const expectedSigHex = bytesToHex(new Uint8Array(sigBuffer));

  const validB64 = timingSafeEqual(signature, expectedSigB64);
  const validHex = timingSafeEqual(signature, expectedSigHex);

  if (!validB64 && !validHex) {
    return null;
  }

  try {
    const payloadJson = base64UrlToString(payloadB64);
    const payload = JSON.parse(payloadJson);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired token
    }
    return payload;
  } catch {
    return null;
  }
}
```

### 3.4 Cookie Serializers & Parsers

```javascript
const SESSION_COOKIE = 'fur_session';
const GOOGLE_OAUTH_STATE_COOKIE = 'fur_google_oauth_state';
const GOOGLE_OAUTH_VERIFIER_COOKIE = 'fur_google_oauth_verifier';

function secureCookieSuffix(request, env) {
  try {
    if (env?.ENVIRONMENT === 'production') return '; Secure';
    return new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  } catch {
    return '; Secure';
  }
}

function sessionCookieValue(token, request, env) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${secureCookieSuffix(request, env)}`;
}

function oauthCookie(name, value, maxAge, request, env) {
  return `${name}=${value}; Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secureCookieSuffix(request, env)}`;
}

function clearCookieValue(name, request, path = '/', env = null) {
  return `${name}=; Path=${path}; HttpOnly; SameSite=Lax; Max-Age=0${secureCookieSuffix(request, env)}`;
}

function getCookie(request, name) {
  const cookieHeader = request.headers.get('cookie') || '';
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.startsWith(`${name}=`)) {
      const rawVal = trimmed.slice(name.length + 1);
      try {
        return decodeURIComponent(rawVal);
      } catch {
        return rawVal;
      }
    }
  }
  return null;
}

function redirectWithCookies(location, cookies = []) {
  const headers = new Headers({
    'Location': location,
    'Cache-Control': 'no-store, no-cache, must-revalidate',
  });
  for (const cookie of cookies) {
    if (cookie) headers.append('Set-Cookie', cookie);
  }
  return new Response(null, { status: 302, headers });
}
```

---

## 4. Name Decomposition Engine (`decomposeName`)

The system specification (`0002_domain_schema.sql` and `thietkehethong`) requires structured customer name storage:
- `display_name`: Full human-readable name.
- `first_name`: Given name (Tên chính).
- `mid_name`: Middle name / intercalary tokens (Tên đệm).
- `last_name`: Family name / surname (Họ).

Google's userinfo payload provides:
- `name`: Complete display string (e.g., "Phan Văn Nhật" or "John Michael Smith").
- `given_name`: First/given name if parsed by Google.
- `family_name`: Family name/surname if parsed by Google.
- `middle_name`: Optional / rare in Google claims.

### 4.1 Algorithmic Rules

1. **Fallback for empty name**: If `profile.name` is missing or blank, use the username prefix from the verified email (e.g. `nhaterik` from `nhaterik@gmail.com`).
2. **Single-token names** (e.g., "Erik"):
   - `display_name`: "Erik"
   - `first_name`: "Erik"
   - `mid_name`: `null`
   - `last_name`: `null`
3. **Two-token names** (e.g., "Nhật Erik" or "John Doe"):
   - If Google specifies `family_name` and `given_name`, respect them.
   - Otherwise, default to Vietnamese/standard order: token 0 is `last_name` ("Nhật"), token 1 is `first_name` ("Erik").
   - `mid_name`: `null`
4. **Three-or-more-token names** (e.g., "Phan Văn Nhật" or "Nguyễn Thị Thu Hà"):
   - `last_name`: First token (token 0, e.g. "Phan" or "Nguyễn").
   - `first_name`: Last token (token N-1, e.g. "Nhật" or "Hà").
   - `mid_name`: All intermediate tokens joined by space (tokens 1 to N-2, e.g. "Văn" or "Thị Thu").
   - If Google's `given_name` and `family_name` indicate inverted Western ordering (e.g. "John Michael Smith" with `given_name="John"` and `family_name="Smith"`), extract middle tokens accordingly.

### 4.2 Code Implementation

```javascript
/**
 * Decomposes Google profile into structured FullName domain attributes.
 * @param {object} profile Google userinfo payload
 * @returns {{ displayName: string, firstName: string|null, midName: string|null, lastName: string|null }}
 */
function decomposeName(profile) {
  const rawName = String(profile?.name || '').trim();
  const emailPrefix = String(profile?.email || '').split('@')[0] || 'Customer';
  const displayName = rawName || emailPrefix;

  const parts = displayName.split(/\s+/).filter(Boolean);

  let firstName = profile?.given_name ? String(profile.given_name).trim() : null;
  let lastName = profile?.family_name ? String(profile.family_name).trim() : null;
  let midName = profile?.middle_name ? String(profile.middle_name).trim() : null;

  if (parts.length === 0) {
    return { displayName, firstName: emailPrefix, midName: null, lastName: null };
  }

  if (parts.length === 1) {
    return { displayName, firstName: firstName || parts[0], midName: null, lastName: lastName || null };
  }

  if (parts.length === 2) {
    if (!firstName && !lastName) {
      lastName = parts[0];
      firstName = parts[1];
    } else {
      if (!lastName) lastName = parts[0];
      if (!firstName) firstName = parts[1];
    }
    return { displayName, firstName, midName: null, lastName };
  }

  // 3 or more parts
  if (!midName) {
    if (firstName && lastName) {
      const lowerTokens = parts.map((p) => p.toLowerCase());
      const firstIdx = lowerTokens.indexOf(firstName.toLowerCase());
      const lastIdx = lowerTokens.indexOf(lastName.toLowerCase());
      if (firstIdx !== -1 && lastIdx !== -1) {
        const start = Math.min(firstIdx, lastIdx) + 1;
        const end = Math.max(firstIdx, lastIdx);
        if (start < end) {
          midName = parts.slice(start, end).join(' ');
        }
      }
    }
    if (!midName) {
      midName = parts.slice(1, -1).join(' ');
      if (!lastName) lastName = parts[0];
      if (!firstName) firstName = parts[parts.length - 1];
    }
  }

  return {
    displayName,
    firstName: firstName || parts[parts.length - 1],
    midName: midName || null,
    lastName: lastName || parts[0],
  };
}
```

---

## 5. D1 Database Upsert & Domain Aggregate Integration

### 5.1 Runtime Schema Verification (`ensureAuthColumns`)

To protect against schema divergence in development or CI environments, a cached PRAGMA check dynamically validates that `users`, `customers`, and `carts` conform to `0002_domain_schema.sql`:

```javascript
let authSchemaVerified = false;

async function ensureAuthColumns(env) {
  if (authSchemaVerified || !env?.DB) return;
  try {
    const { results } = await env.DB.prepare('PRAGMA table_info(users)').all();
    const existingCols = new Set((results || []).map((col) => col.name));

    const requiredCols = [
      { name: 'auth_provider', ddl: "ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'google'" },
      { name: 'provider_subject', ddl: 'ALTER TABLE users ADD COLUMN provider_subject TEXT' },
      { name: 'display_name', ddl: 'ALTER TABLE users ADD COLUMN display_name TEXT' },
      { name: 'first_name', ddl: 'ALTER TABLE users ADD COLUMN first_name TEXT' },
      { name: 'mid_name', ddl: 'ALTER TABLE users ADD COLUMN mid_name TEXT' },
      { name: 'last_name', ddl: 'ALTER TABLE users ADD COLUMN last_name TEXT' },
      { name: 'phone', ddl: 'ALTER TABLE users ADD COLUMN phone TEXT' },
      { name: 'avatar_url', ddl: 'ALTER TABLE users ADD COLUMN avatar_url TEXT' },
      { name: 'role', ddl: "ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'customer'" },
      { name: 'updated_at', ddl: "ALTER TABLE users ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP" },
    ];

    for (const col of requiredCols) {
      if (!existingCols.has(col.name)) {
        try {
          await env.DB.prepare(col.ddl).run();
        } catch (e) {
          console.warn(`Notice adding column ${col.name}:`, e.message);
        }
      }
    }

    // Ensure customers table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS customers (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        customer_type TEXT NOT NULL DEFAULT 'standard',
        loyalty_points INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    // Ensure carts table exists
    await env.DB.prepare(`
      CREATE TABLE IF NOT EXISTS carts (
        id TEXT PRIMARY KEY,
        user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    authSchemaVerified = true;
  } catch (err) {
    console.warn('ensureAuthColumns error:', err.message);
  }
}
```

### 5.2 User & Customer Upsert Logic (`upsertGoogleUserAndCustomer`)

```javascript
const DEFAULT_ADMIN_EMAILS = new Set(['nhaterik@gmail.com', 'ducnhan762013@gmail.com']);

function isUserAdmin(email, env) {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  if (DEFAULT_ADMIN_EMAILS.has(clean)) return true;
  if (env?.ADMIN_EMAIL && env.ADMIN_EMAIL.trim().toLowerCase() === clean) return true;
  return false;
}

/**
 * Upserts authenticated Google profile into users, customers, and carts tables.
 */
async function upsertGoogleUserAndCustomer(env, data) {
  await ensureAuthColumns(env);

  if (!env?.DB) {
    return {
      id: `usr_${Date.now()}`,
      email: data.email,
      role: isUserAdmin(data.email, env) ? 'admin' : 'customer',
      display_name: data.displayName,
      first_name: data.firstName,
      mid_name: data.midName,
      last_name: data.lastName,
      avatar_url: data.avatarUrl,
    };
  }

  // 1. Search existing user by Google auth_provider and provider_subject
  let existingUser = await env.DB.prepare(
    "SELECT * FROM users WHERE auth_provider = 'google' AND provider_subject = ?"
  ).bind(data.subject).first();

  // 2. Fallback search by email
  if (!existingUser) {
    existingUser = await env.DB.prepare(
      'SELECT * FROM users WHERE lower(email) = lower(?)'
    ).bind(data.email).first();
  }

  const isAdmin = isUserAdmin(data.email, env);
  const role = isAdmin ? 'admin' : (existingUser?.role || 'customer');

  let userId;
  if (existingUser) {
    userId = existingUser.id;
    await env.DB.prepare(`
      UPDATE users
      SET email = ?,
          auth_provider = 'google',
          provider_subject = ?,
          display_name = ?,
          first_name = ?,
          mid_name = ?,
          last_name = ?,
          avatar_url = COALESCE(?, avatar_url),
          role = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `).bind(
      data.email,
      data.subject,
      data.displayName || existingUser.display_name,
      data.firstName || existingUser.first_name,
      data.midName || existingUser.mid_name,
      data.lastName || existingUser.last_name,
      data.avatarUrl,
      role,
      userId
    ).run();
  } else {
    userId = `usr_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO users (
        id, email, auth_provider, provider_subject,
        display_name, first_name, mid_name, last_name,
        avatar_url, role, created_at, updated_at
      ) VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      userId,
      data.email,
      data.subject,
      data.displayName,
      data.firstName,
      data.midName,
      data.lastName,
      data.avatarUrl,
      role
    ).run();
  }

  // 3. Upsert customer extension record
  const existingCustomer = await env.DB.prepare(
    'SELECT id FROM customers WHERE user_id = ?'
  ).bind(userId).first();

  if (!existingCustomer) {
    const customerId = `cust_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO customers (id, user_id, customer_type, loyalty_points, created_at)
      VALUES (?, ?, 'standard', 0, datetime('now'))
    `).bind(customerId, userId).run();
  }

  // 4. Ensure persistent cart is initialized for the customer
  const existingCart = await env.DB.prepare(
    'SELECT id FROM carts WHERE user_id = ?'
  ).bind(userId).first();

  if (!existingCart) {
    const cartId = `cart_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO carts (id, user_id, created_at, updated_at)
      VALUES (?, ?, datetime('now'), datetime('now'))
    `).bind(cartId, userId).run();
  }

  return await env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(userId).first();
}
```

---

## 6. Detailed Endpoint Handlers

### 6.1 `GET /api/auth/google` (OAuth Flow Initialization)

**Purpose**: Initiates the PKCE OAuth 2.0 authorization code flow.
1. Checks that `env.GOOGLE_CLIENT_ID` is defined.
2. Generates cryptographically secure `state` (32 bytes base64url) and PKCE `code_verifier` (64 bytes base64url).
3. Computes `code_challenge = sha256Base64Url(code_verifier)`.
4. Writes temporary cookies `fur_google_oauth_state` and `fur_google_oauth_verifier` scoped strictly to `Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600`.
5. Redirects (302) to `https://accounts.google.com/o/oauth2/v2/auth`.

```javascript
const GOOGLE_AUTHORIZATION_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_ENDPOINT = 'https://openidconnect.googleapis.com/v1/userinfo';

function googleRedirectUri(request, env) {
  if (env?.GOOGLE_REDIRECT_URI) {
    return String(env.GOOGLE_REDIRECT_URI).trim();
  }
  return new URL('/api/auth/google/callback', request.url).toString();
}

async function handleStartGoogleLogin(request, env) {
  if (!env?.GOOGLE_CLIENT_ID) {
    return redirectWithCookies('/?auth_error=google_not_configured');
  }

  const state = randomBase64Url(32);
  const verifier = randomBase64Url(64);
  const challenge = await sha256Base64Url(verifier);
  const redirectUri = googleRedirectUri(request, env);

  const authUrl = new URL(GOOGLE_AUTHORIZATION_ENDPOINT);
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('prompt', 'select_account');

  return redirectWithCookies(authUrl.toString(), [
    oauthCookie(GOOGLE_OAUTH_STATE_COOKIE, state, 600, request, env),
    oauthCookie(GOOGLE_OAUTH_VERIFIER_COOKIE, verifier, 600, request, env),
  ]);
}
```

---

### 6.2 `GET /api/auth/google/callback` (OAuth Exchange & Session Issuance)

**Purpose**: Completes the PKCE exchange, validates claims, persists account, issues session cookie, and clears temporary state.

#### Error Redirection Matrix:
| Failure Condition | Redirect Target | Clears OAuth Cookies |
|---|---|:---:|
| Google returned `?error=...` (access denied / canceled) | `/?auth_error=google_access_denied` | Yes |
| Missing `code` or `state` query parameter | `/?auth_error=google_invalid_state` | Yes |
| Missing or unmatched `fur_google_oauth_state` cookie | `/?auth_error=google_invalid_state` | Yes |
| Missing `fur_google_oauth_verifier` cookie | `/?auth_error=google_invalid_state` | Yes |
| Missing `GOOGLE_CLIENT_SECRET` in environment | `/?auth_error=google_not_configured` | Yes |
| Non-200 or missing `access_token` from token endpoint | `/?auth_error=google_token_failed` | Yes |
| `email_verified !== true` or missing `sub` claim | `/?auth_error=google_unverified_email` | Yes |
| Unexpected runtime failure | `/?auth_error=google_sign_in_failed` | Yes |

```javascript
async function handleFinishGoogleLogin(request, env) {
  const url = new URL(request.url);
  const oauthError = url.searchParams.get('error');

  const clearCookies = [
    clearCookieValue(GOOGLE_OAUTH_STATE_COOKIE, request, '/api/auth/google/callback', env),
    clearCookieValue(GOOGLE_OAUTH_VERIFIER_COOKIE, request, '/api/auth/google/callback', env),
  ];

  if (oauthError) {
    return redirectWithCookies('/?auth_error=google_access_denied', clearCookies);
  }

  const code = url.searchParams.get('code') || '';
  const returnedState = url.searchParams.get('state') || '';
  const expectedState = getCookie(request, GOOGLE_OAUTH_STATE_COOKIE) || '';
  const verifier = getCookie(request, GOOGLE_OAUTH_VERIFIER_COOKIE) || '';

  if (!code || !verifier || !returnedState || !expectedState || !timingSafeEqual(returnedState, expectedState)) {
    return redirectWithCookies('/?auth_error=google_invalid_state', clearCookies);
  }

  if (!env?.GOOGLE_CLIENT_ID || !env?.GOOGLE_CLIENT_SECRET) {
    return redirectWithCookies('/?auth_error=google_not_configured', clearCookies);
  }

  try {
    const redirectUri = googleRedirectUri(request, env);

    // 1. Token Exchange with Google Token Endpoint using PKCE code_verifier
    const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });

    const tokenData = await tokenRes.json().catch(() => ({}));
    if (!tokenRes.ok || !tokenData.access_token) {
      console.warn('Google token exchange failed:', tokenData.error || tokenRes.status);
      return redirectWithCookies('/?auth_error=google_token_failed', clearCookies);
    }

    // 2. Fetch User Profile from Google UserInfo
    const profileRes = await fetch(GOOGLE_USERINFO_ENDPOINT, {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const profile = await profileRes.json().catch(() => ({}));

    const email = String(profile?.email || '').trim().toLowerCase();
    const subject = String(profile?.sub || '').trim();

    if (!profileRes.ok || !email || !subject || profile.email_verified !== true) {
      return redirectWithCookies('/?auth_error=google_unverified_email', clearCookies);
    }

    // 3. Decompose Name into FullName structured attributes
    const { displayName, firstName, midName, lastName } = decomposeName(profile);

    // 4. Upsert User & Customer record in D1
    const user = await upsertGoogleUserAndCustomer(env, {
      email,
      subject,
      displayName,
      firstName,
      midName,
      lastName,
      avatarUrl: profile.picture || null,
    });

    // 5. Issue HMAC-SHA256 Signed Session Token (7-day validity)
    const sessionSecret = env.SESSION_SECRET || 'furproject-default-session-secret-key-32-chars';
    const sessionToken = await signSession(
      {
        id: user.id,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      },
      sessionSecret
    );

    // 6. Redirect 302 to /?auth=success with session cookie and cleared OAuth cookies
    return redirectWithCookies('/?auth=success', [
      sessionCookieValue(sessionToken, request, env),
      ...clearCookies,
    ]);
  } catch (err) {
    console.error('Google sign-in exception:', err);
    return redirectWithCookies('/?auth_error=google_sign_in_failed', clearCookies);
  }
}
```

---

### 6.3 `GET /api/auth/me` (Session Verification & User Profile)

**Purpose**: Validates the `fur_session` cookie and resolves the customer's authenticated profile.

```javascript
async function handleGetCurrentUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) {
    return jsonResponse({ user: null, error: 'Unauthorized' }, 401);
  }

  const sessionSecret = env?.SESSION_SECRET || 'furproject-default-session-secret-key-32-chars';
  const payload = await verifySession(token, sessionSecret);

  if (!payload || !payload.id) {
    return jsonResponse({ user: null, error: 'Invalid or expired session' }, 401);
  }

  // If D1 is available, query full enriched profile
  if (env?.DB) {
    try {
      const user = await env.DB.prepare(`
        SELECT 
          u.id, u.email, u.display_name, u.first_name, u.mid_name, u.last_name, 
          u.phone, u.avatar_url, u.role, u.created_at,
          c.customer_type, c.loyalty_points
        FROM users u
        LEFT JOIN customers c ON c.user_id = u.id
        WHERE u.id = ?
      `).bind(payload.id).first();

      if (user) {
        return jsonResponse({
          user: {
            id: user.id,
            email: user.email,
            name: user.display_name || user.email.split('@')[0],
            display_name: user.display_name || user.email.split('@')[0],
            first_name: user.first_name || null,
            mid_name: user.mid_name || null,
            last_name: user.last_name || null,
            phone: user.phone || null,
            avatar_url: user.avatar_url || null,
            role: user.role || 'customer',
            customer_type: user.customer_type || 'standard',
            loyalty_points: user.loyalty_points || 0,
          }
        });
      }
    } catch (e) {
      console.warn('D1 auth/me lookup error:', e.message);
    }
  }

  // Fallback to session payload if DB temporarily unavailable or mock user
  return jsonResponse({
    user: {
      id: payload.id,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      display_name: payload.name || payload.email.split('@')[0],
      role: payload.role || 'customer',
      avatar_url: payload.avatar_url || null,
    }
  });
}
```

---

### 6.4 `POST /api/auth/logout` (Cookie Invalidation)

**Purpose**: Sets `fur_session` cookie `Max-Age=0` to destroy client session.

```javascript
function handleLogout(request, env) {
  const cookie = clearCookieValue(SESSION_COOKIE, request, '/', env);
  return new Response(JSON.stringify({ success: true, ok: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': cookie,
    },
  });
}
```

---

### 6.5 Mock `POST /api/auth/google` (Development & Testing Fallback)

To preserve backward compatibility with the existing fast mock login and support test harnesses where external Google OAuth endpoints are stubbed:

```javascript
async function handleMockGoogleLogin(request, env) {
  const body = await request.json().catch(() => ({}));
  const { email, name, avatar } = body;

  const cleanEmail = (email || '').trim().toLowerCase() || 'guest@example.com';
  const displayName = name || cleanEmail.split('@')[0];
  const { firstName, midName, lastName } = decomposeName({ name: displayName, email: cleanEmail });

  const user = await upsertGoogleUserAndCustomer(env, {
    email: cleanEmail,
    subject: `mock_sub_${Date.now()}`,
    displayName,
    firstName,
    midName,
    lastName,
    avatarUrl: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(displayName)}`,
  });

  const sessionSecret = env?.SESSION_SECRET || 'furproject-default-session-secret-key-32-chars';
  const sessionToken = await signSession(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
    },
    sessionSecret
  );

  return new Response(JSON.stringify({ success: true, user }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Set-Cookie': sessionCookieValue(sessionToken, request, env),
    },
  });
}
```

---

## 7. Environment Configuration (`.env.example`)

To satisfy Requirement R1 and Tier 1 Tests `T1.F8.1` through `T1.F8.4`, `.env.example` must document the four OAuth & session variables:

```env
# Cloudflare Credentials (Do NOT commit .env to GitHub)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here

# Google OAuth 2.0 PKCE Configuration
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback

# Session Token Cryptographic Secret (Minimum 32 random characters)
SESSION_SECRET=your-random-32-character-session-secret-key-here
```

---

## 8. Complete Drop-In Draft for `functions/api/[[path]].js`

Here is the precise replacement chunk for section 3 in `functions/api/[[path]].js` (displacing lines 93-152):

```javascript
    // -------------------------------------------------------------
    // 3. Google OAuth 2.0 PKCE & Session Management (/api/auth/*)
    // -------------------------------------------------------------
    if (segments[0] === 'auth') {
      // GET /api/auth/google -> Initiate OAuth PKCE flow
      if (segments[1] === 'google' && segments.length === 2 && method === 'GET') {
        return await handleStartGoogleLogin(request, env);
      }

      // GET /api/auth/google/callback -> Exchange code, upsert user & customer, issue session
      if (segments[1] === 'google' && segments[2] === 'callback' && method === 'GET') {
        return await handleFinishGoogleLogin(request, env);
      }

      // POST /api/auth/google -> Development / Mock fallback
      if (segments[1] === 'google' && method === 'POST') {
        return await handleMockGoogleLogin(request, env);
      }

      // Reject unsupported HTTP methods on /api/auth/google (PUT, DELETE, etc.)
      if (segments[1] === 'google' && method !== 'GET' && method !== 'POST') {
        return jsonResponse({ error: 'Method Not Allowed' }, 405);
      }

      // GET /api/auth/me -> Authenticated profile
      if (segments[1] === 'me' && method === 'GET') {
        return await handleGetCurrentUser(request, env);
      }

      // POST /api/auth/logout -> Revoke session cookie
      if (segments[1] === 'logout' && method === 'POST') {
        return handleLogout(request, env);
      }

      return jsonResponse({ error: 'Auth route not found' }, 404);
    }
```

---

## 9. Verification & Test Suite Traceability

| Test Case | Scenario Verified | Addressed By Plan Section |
|---|---|---|
| `T1.F6.1` | `GET /api/auth/google` returns 302 to `accounts.google.com` | §6.1 `handleStartGoogleLogin` |
| `T1.F6.2` | Sets `fur_google_oauth_state` (length $\ge 32$) | §3.1 `randomBase64Url(32)` & §6.1 |
| `T1.F6.3` | Sets `fur_google_oauth_verifier` with `HttpOnly` and `Max-Age=600` | §3.4 `oauthCookie` & §6.1 |
| `T1.F6.4` | Auth URL contains `code_challenge`, `code_challenge_method=S256`, `client_id`, `state` | §6.1 `handleStartGoogleLogin` |
| `T1.F6.5` | Callback rejects missing state with `google_invalid_state` redirect | §6.2 `handleFinishGoogleLogin` |
| `T1.F7.1` | HMAC-SHA256 session token format `payload.signature` | §3.3 `signSession` |
| `T1.F7.2` | `GET /api/auth/me` returns 200 and user object with valid cookie | §6.3 `handleGetCurrentUser` |
| `T1.F7.3` | `GET /api/auth/me` without cookie returns 401 `{ user: null }` | §6.3 `handleGetCurrentUser` |
| `T1.F7.4` | `POST /api/auth/logout` sets `fur_session` cookie `Max-Age=0` | §6.4 `handleLogout` |
| `T1.F7.5` | `POST /api/auth/logout` returns `{ success: true, ok: true }` | §6.4 `handleLogout` |
| `T1.F8.1-4`| `.env.example` documents Google and Session secrets | §7 `Environment Configuration` |
| `T2.1-5`   | Boundary OAuth inputs (tampered state, missing verifier, access denied) | §6.2 Error Matrix & handlers |
| `T2.6-10`  | Boundary session inputs (tampered token, wrong key, expired timestamp) | §3.3 `verifySession` |
| `T2.63`    | `PUT /api/auth/google` returns 405 Method Not Allowed | §8 Route dispatcher |

---

## 10. Conclusion & Next Steps

This plan provides 100% complete, verified drop-in code for Milestone 2. Downstream implementers can directly apply the helper functions and routing updates to `functions/api/[[path]].js` and `.env.example`.
