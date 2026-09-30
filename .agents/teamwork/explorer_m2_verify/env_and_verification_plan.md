# Milestone 2: Environment Configuration & E2E Verification Plan

**Milestone**: M2 (Authentication & Sessions)  
**Author**: Explorer Subagent (`explorer_m2_verify`)  
**Parent Task**: `2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`  
**Status**: Completed Plan  
**Target Features**: F6 (Google OAuth 2.0 PKCE Flow), F7 (Session Management & Logout), F8 (Environment Configuration)

---

## 1. Executive Summary & Architectural Context

Milestone 2 establishes the identity, authentication, session security, and runtime configuration layer for Furproject. The solution is built for Cloudflare Pages Functions (`functions/api/[[path]].js`) with Cloudflare D1 persistence, adapting the proven architecture from FlashCardWeb (`/Users/nhaterik/CloudflareProjects/FlashCardWeb`).

This document provides:
1. **Environment Configuration Specification**: Exact design updates for `.env.example`, `.dev.vars`, and `wrangler.toml`, detailing how OAuth 2.0 client secrets, session signing keys, and redirect URIs are securely managed locally and in production.
2. **E2E Test Verification Plan**: Complete test mapping of 28 test cases across `tests/e2e/tier1_feature.test.mjs` and `tests/e2e/tier2_boundary.test.mjs` directly covering F6, F7, and F8, with exact baseline pass/fail diagnosis and implementation prerequisites.
3. **Execution Commands**: Actionable shell verification workflows for test tiers and production bundling.

---

## 2. Environment Configuration Design

### 2.1 Environment Variable Specification

Milestone 2 introduces four core environment variables required for Google OAuth 2.0 PKCE authorization, session token signing, and callback routing.

| Variable Name | Required | Sensitivity | Default / Example Value | Description & Technical Role |
|---|:---:|:---:|---|---|
| `GOOGLE_CLIENT_ID` | **Yes** | Public/App Config | `mock-furproject-client-id.apps.googleusercontent.com` | Google Cloud Console OAuth 2.0 Web Client ID. Embedded in the authorization redirect query to `https://accounts.google.com/o/oauth2/v2/auth`. |
| `GOOGLE_CLIENT_SECRET` | **Yes** | **Confidential Secret** | `mock-furproject-client-secret` | Google Cloud Console OAuth 2.0 Web Client Secret. Used in server-to-server token exchange POST requests to `https://oauth2.googleapis.com/token`. Never exposed to client browsers. |
| `GOOGLE_REDIRECT_URI` | **Yes** | App Config | `http://localhost:8788/api/auth/google/callback` | Authorized redirect callback URL registered in Google Cloud Console. Matches local Wrangler Pages port (`8788`) in dev or production domain (`https://furproject.pages.dev/api/auth/google/callback`). In Pages Functions, falls back gracefully to `new URL('/api/auth/google/callback', request.url).toString()`. |
| `SESSION_SECRET` | **Yes** | **Confidential Secret** | `furproject-dev-session-secret-key-32-chars-minimum!` | High-entropy secret key (min 32 characters, recommended $\ge 256$ bits) used to compute and verify HMAC-SHA256 signatures for the `fur_session` cookie. |
| `CLOUDFLARE_ACCOUNT_ID` | Optional | Confidential | `your_cloudflare_account_id_here` | Existing deployment credential for remote Cloudflare CLI operations. |
| `CLOUDFLARE_API_TOKEN` | Optional | Confidential | `your_cloudflare_api_token_here` | Existing deployment credential for Cloudflare API operations. |

---

### 2.2 Proposed `.env.example` Update

The existing `/Users/nhaterik/CloudflareProjects/Furproject/.env.example` only documents Cloudflare credentials:
```bash
# Existing .env.example
# Cloudflare Credentials (Do NOT commit .env to GitHub)
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
```

To satisfy test cases `T1.F8.1`, `T1.F8.2`, `T1.F8.3`, and `T1.F8.4`, `.env.example` must be updated to the following complete template:

```bash
# ==============================================================================
# Furproject Environment Configuration Template
# Copy this file to:
#   1. .dev.vars (for local Cloudflare Pages / Wrangler dev server)
#   2. .env (for local utility scripts)
# DO NOT commit real secrets or production keys to version control.
# ==============================================================================

# ------------------------------------------------------------------------------
# 1. Google OAuth 2.0 PKCE Configuration
# Obtain credentials from Google Cloud Console > APIs & Services > Credentials
# Authorized redirect URI must include: http://localhost:8788/api/auth/google/callback
# ------------------------------------------------------------------------------
GOOGLE_CLIENT_ID=your_google_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:8788/api/auth/google/callback

# ------------------------------------------------------------------------------
# 2. Session Management & Cryptographic Security
# High-entropy secret (minimum 32 characters) for HMAC-SHA256 session cookie signing
# Generate with: openssl rand -base64 32
# ------------------------------------------------------------------------------
SESSION_SECRET=your_session_secret_key_minimum_32_characters_long_here

# ------------------------------------------------------------------------------
# 3. Cloudflare Deployment Credentials (Optional for local CLI deployments)
# ------------------------------------------------------------------------------
CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
```

---

### 2.3 Cloudflare Pages Runtime Configuration: `.dev.vars`, `wrangler.toml`, & Secrets

Cloudflare Pages Functions execute inside a V8 isolate worker environment where standard Node.js `process.env` does not hold worker runtime bindings unless explicitly passed. Secrets and environment variables are injected into `context.env` during each request:

```javascript
export async function onRequest({ request, env }) {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_REDIRECT_URI || new URL('/api/auth/google/callback', request.url).toString();
  const sessionSecret = env.SESSION_SECRET;
  const db = env.DB; // D1Database binding
  // ...
}
```

#### A. Local Development: `.dev.vars`
- Cloudflare Pages dev server (`npx wrangler pages dev` or `wrangler dev`) automatically reads `.dev.vars` from the project root at launch.
- `.dev.vars` is formatted with standard `KEY=value` lines.
- Developers copy `.env.example` to `.dev.vars` and insert valid Google OAuth credentials.
- **Git Protection**: `.gitignore` must ensure `.dev.vars` is never committed.

#### B. Configuration File: `wrangler.toml`
- `wrangler.toml` configures resource bindings and non-sensitive public environment variables:
  ```toml
  name = "aifurniture"
  compatibility_date = "2026-05-20"
  pages_build_output_dir = "dist"

  [ai]
  binding = "AI"

  [[d1_databases]]
  binding = "DB"
  database_name = "furproject-db"
  database_id = "507651c1-c120-431c-8a6f-10a2a26ecbc2"

  [[r2_buckets]]
  binding = "R2_ASSETS"
  bucket_name = "aifurniture-assets"

  [vars]
  STORE_NAME = "ABC Luxury Furniture"
  CURRENCY = "VND"
  ENVIRONMENT = "development"
  # Non-sensitive variables can reside here; secrets MUST NOT be committed here.
  ```
- Test `T1.F8.5` asserts that `wrangler.toml` defines `binding = "DB"` and `database_name = "furproject-db"`, which is currently satisfied.

#### C. Cloudflare Production Secrets
For staging and production deployments on Cloudflare Pages, sensitive secrets are registered via Wrangler CLI or Cloudflare Dashboard:
```bash
# Register OAuth and Session secrets to Cloudflare Pages project
npx wrangler pages secret put GOOGLE_CLIENT_ID --project-name=aifurniture
npx wrangler pages secret put GOOGLE_CLIENT_SECRET --project-name=aifurniture
npx wrangler pages secret put GOOGLE_REDIRECT_URI --project-name=aifurniture
npx wrangler pages secret put SESSION_SECRET --project-name=aifurniture
```

---

### 2.4 Cryptographic & Security Specifications

1. **PKCE State & Verifier Cookies (`Path=/api/auth/google/callback`)**:
   - `fur_google_oauth_state`: $\ge 32$ bytes random base64url string.
   - `fur_google_oauth_verifier`: $\ge 64$ bytes random base64url string.
   - Flags: `HttpOnly; SameSite=Lax; Max-Age=600`.
   - `Secure` flag automatically appended if protocol is HTTPS.
   - Scoped strictly to callback path (`Path=/api/auth/google/callback`) to minimize exposure.

2. **Session Cookie (`fur_session`, `Path=/`)**:
   - Structure: `<payload_base64url>.<signature_base64url>`.
   - **Crucial Note**: The signature must be raw binary HMAC-SHA256 encoded in **Base64URL** (matching `tests/e2e/helpers.mjs` and `T1.F7.1`), not hexadecimal.
   - Flags: `Path=/; HttpOnly; SameSite=Lax; Max-Age=604800` (7 days).
   - Payload includes: `{ id, email, role, exp }`.
   - Expiration validation: Tokens with `exp < now` are immediately rejected with HTTP 401.

3. **Session Revocation (`POST /api/auth/logout`)**:
   - Issues `Set-Cookie: fur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`.
   - Returns `{ success: true }`.

---

## 3. Milestone 2 E2E Test Suite Alignment & Catalog

The E2E test suite constructed in `tests/e2e/` contains direct verification for Milestone 2 features across Tier 1 (Feature Coverage) and Tier 2 (Boundary & Error Conditions).

### 3.1 Tier 1: Feature Coverage (15 Tests)

| Test ID | Suite Name | Description | Verified Assertions | Baseline Status | Implementation Fix Required |
|---|---|---|---|:---:|---|
| **T1.F6.1** | F6: Google OAuth PKCE | `GET /api/auth/google returns 302 redirect to accounts.google.com` | `status === 302`, `location.startsWith('https://accounts.google.com/o/oauth2/v2/auth')` | **FAIL** (404) | Implement GET `/api/auth/google` route handler generating authorization URL and 302 redirect. |
| **T1.F6.2** | F6: Google OAuth PKCE | `GET /api/auth/google sets fur_google_oauth_state cookie` | `res.cookies['fur_google_oauth_state']` present, value length $\ge 32$ | **FAIL** (404) | Generate 32-byte crypto random string, set cookie in response. |
| **T1.F6.3** | F6: Google OAuth PKCE | `GET /api/auth/google sets fur_google_oauth_verifier cookie with HttpOnly and Max-Age=600` | Cookie `fur_google_oauth_verifier` has `HttpOnly`, `Max-Age=600`, path scoped | **FAIL** (404) | Generate 64-byte PKCE verifier, set cookie with `HttpOnly; SameSite=Lax; Max-Age=600; Path=/api/auth/google/callback`. |
| **T1.F6.4** | F6: Google OAuth PKCE | `GET /api/auth/google includes PKCE code_challenge and code_challenge_method=S256 in auth URL` | URL contains `code_challenge`, `code_challenge_method=S256`, `client_id`, `state` | **FAIL** (404) | Compute SHA-256 hash of verifier, base64url encode, and set in searchParams of auth URL. |
| **T1.F6.5** | F6: Google OAuth PKCE | `GET /api/auth/google/callback validates state and rejects missing state parameter` | Missing `state` query param redirects (302) with `auth_error=google_invalid_state` | **FAIL** (404) | Implement GET `/api/auth/google/callback` state validation; redirect with error query parameter. |
| **T1.F7.1** | F7: Session & Logout | `HMAC-SHA256 session token creates valid two-part payload.signature format` | Dot delimiter present, both payload and signature non-empty base64url strings | **PASS** | Utilizes helper crypto functions; establishes token format baseline. |
| **T1.F7.2** | F7: Session & Logout | `GET /api/auth/me returns authenticated user profile with valid fur_session cookie` | Valid cookie returns 200 and `{ user: { email: 'member@example.com' } }` | **FAIL** (hardcoded admin) | Parse `fur_session` cookie in `GET /api/auth/me`, verify HMAC signature, query D1 user/customer, return profile. |
| **T1.F7.3** | F7: Session & Logout | `GET /api/auth/me without session cookie returns 401 Unauthorized with user null` | Unauthenticated request returns 401 and `{ user: null }` | **FAIL** (200) | Check for absence or invalidity of `fur_session` cookie; return 401 instead of fallback user. |
| **T1.F7.4** | F7: Session & Logout | `POST /api/auth/logout sets fur_session cookie with Max-Age=0` | Set-Cookie header contains `fur_session` with `Max-Age=0` or empty value | **FAIL** (404) | Implement POST `/api/auth/logout` clearing session cookie. |
| **T1.F7.5** | F7: Session & Logout | `POST /api/auth/logout returns JSON { success: true } or { ok: true }` | Returns 200 with `{ success: true }` | **FAIL** (404) | Return 200 JSON success response on logout. |
| **T1.F8.1** | F8: Config & Environment | `.env.example exists and documents GOOGLE_CLIENT_ID` | `.env.example` contains string `GOOGLE_CLIENT_ID=` | **FAIL** | Add `GOOGLE_CLIENT_ID=` to `.env.example`. |
| **T1.F8.2** | F8: Config & Environment | `.env.example documents GOOGLE_CLIENT_SECRET` | `.env.example` contains string `GOOGLE_CLIENT_SECRET=` | **FAIL** | Add `GOOGLE_CLIENT_SECRET=` to `.env.example`. |
| **T1.F8.3** | F8: Config & Environment | `.env.example documents SESSION_SECRET` | `.env.example` contains string `SESSION_SECRET=` | **FAIL** | Add `SESSION_SECRET=` to `.env.example`. |
| **T1.F8.4** | F8: Config & Environment | `.env.example documents GOOGLE_REDIRECT_URI` | `.env.example` contains string `GOOGLE_REDIRECT_URI=` | **FAIL** | Add `GOOGLE_REDIRECT_URI=` to `.env.example`. |
| **T1.F8.5** | F8: Config & Environment | `wrangler.toml configures D1 database binding DB` | `wrangler.toml` contains `binding = "DB"` and `furproject-db` | **PASS** | Already present in `wrangler.toml`. |

---

### 3.2 Tier 2: Boundary & Error Condition Tests (13 Tests)

| Test ID | Suite Name | Description | Verified Boundary Behavior | Baseline Status | Implementation Requirement |
|---|---|---|---|:---:|---|
| **T2.1** | B1: Google OAuth Boundary | `Callback with missing state parameter redirects with google_invalid_state error` | State omitted from query returns 302 to `/?auth_error=google_invalid_state` | **FAIL** (404) | In callback, if `!state`, return 302 redirect with `google_invalid_state`. |
| **T2.2** | B1: Google OAuth Boundary | `Callback with missing code parameter redirects with error` | Code omitted from query returns 302 to `/?auth_error=google_invalid_state` | **FAIL** (404) | In callback, if `!code`, return 302 redirect with `google_invalid_state`. |
| **T2.3** | B1: Google OAuth Boundary | `Callback with tampered state parameter redirects with state mismatch error` | Query `state` $\neq$ cookie `state` returns 302 error | **FAIL** (404) | Validate timing-safe equality between `url.searchParams.get('state')` and cookie `fur_google_oauth_state`. |
| **T2.4** | B1: Google OAuth Boundary | `Callback with missing verifier cookie fails PKCE exchange` | State matches but cookie `fur_google_oauth_verifier` missing returns 302 error | **FAIL** (404) | Check presence of `fur_google_oauth_verifier` cookie before initiating Google token exchange. |
| **T2.5** | B1: Google OAuth Boundary | `Callback with error=access_denied clears cookies and redirects to destination` | `?error=access_denied` clears OAuth state and verifier cookies, redirects with `google_access_denied` | **FAIL** (404) | Check `url.searchParams.get('error')`; if present, clear cookies (`Max-Age=0`) and redirect. |
| **T2.6** | B2: Session Cookie Tampering | `GET /api/auth/me with malformed cookie format (no dot delimiter) returns 401` | Malformed token string returns 401 `{ user: null }` | **FAIL** (200) | Split token by `.`; if parts length $\neq 2$, return 401 `{ user: null }`. |
| **T2.7** | B2: Session Cookie Tampering | `GET /api/auth/me with tampered payload and original signature returns 401` | Forged payload with unmatching HMAC returns 401 | **FAIL** (200) | Compute HMAC of payload base64url with `SESSION_SECRET` and verify against signature using Web Crypto `crypto.subtle.verify`. |
| **T2.8** | B2: Session Cookie Tampering | `GET /api/auth/me with token signed by invalid secret returns 401` | Token signed with different secret key rejected | **FAIL** (200) | Cryptographic signature verification with active `SESSION_SECRET`. |
| **T2.9** | B2: Session Cookie Tampering | `GET /api/auth/me with expired timestamp returns 401` | Payload `exp < Math.floor(Date.now() / 1000)` returns 401 | **FAIL** (200) | Decode payload and check expiration timestamp against current epoch time. |
| **T2.10** | B2: Session Cookie Tampering | `GET /api/auth/me with empty or whitespace session cookie returns 401` | Whitespace cookie value returns 401 | **FAIL** (200) | Check trimmed cookie length $> 0$ before processing. |
| **T2.61** | B13: HTTP Method Constraints | `POST /api/auth/me returns 405 Method Not Allowed or 404` | Non-GET method rejected | **PASS** (404 fallback) | Explicitly restrict `/api/auth/me` to `GET` (or return 405). |
| **T2.62** | B13: HTTP Method Constraints | `GET /api/auth/logout returns 405 Method Not Allowed or 404` | Non-POST method rejected | **PASS** (404 fallback) | Explicitly restrict `/api/auth/logout` to `POST` (or return 405). |
| **T2.63** | B13: HTTP Method Constraints | `PUT /api/auth/google returns 405 Method Not Allowed or 404` | Non-GET method rejected | **PASS** (404 fallback) | Explicitly restrict `/api/auth/google` to `GET` (or return 405). |

---

### 3.3 Critical Technical Findings & Nuances for Implementation

1. **HMAC Signature Base64URL Encoding**:
   - In FlashCardWeb (`FlashCardWeb/functions/api/[[path]].js:2426`), HMAC was serialized via `bytesToHex()`.
   - In Furproject E2E test harness (`tests/e2e/helpers.mjs:240`) and tests (`T1.F7.1`, `T2.7`), the signature is expected as **Base64URL** (`base64UrlEncode(signatureBuffer)`).
   - *Requirement*: The implementation in `functions/api/[[path]].js` must output and verify `payloadB64.signatureB64` using `base64url`, not hex.

2. **D1 User Upserting Contract in OAuth Callback**:
   - When Google OAuth callback validates successfully, the user must be upserted into D1 `users` table:
     ```sql
     INSERT INTO users (id, email, auth_provider, provider_subject, display_name, avatar_url, role)
     VALUES (?, ?, 'google', ?, ?, ?, 'customer')
     ON CONFLICT(email) DO UPDATE SET
       provider_subject = excluded.provider_subject,
       display_name = excluded.display_name,
       avatar_url = excluded.avatar_url,
       updated_at = CURRENT_TIMESTAMP;
     ```
   - Also ensure 1:1 `customers` profile row exists:
     ```sql
     INSERT OR IGNORE INTO customers (id, user_id, customer_type, loyalty_points)
     VALUES (?, ?, 'standard', 0);
     ```

3. **Status 204 No Content Defect (`functions/api/[[path]].js:23`)**:
   - Line 23 of `functions/api/[[path]].js` returns `jsonResponse({}, 204)`.
   - In WHATWG Fetch and Node 26 / Cloudflare runtime, passing a non-null body with status 204 throws `TypeError: Response constructor: Invalid response status code 204` (causing `T2.65` to fail).
   - *Recommendation*: While fixing auth routes, update OPTIONS handler to `new Response(null, { status: 204, headers: ... })`.

---

## 4. Verification Plan & Shell Execution Matrix

The following shell commands and execution workflows constitute the verification protocol for Milestone 2.

### 4.1 Shell Verification Commands

```bash
# ------------------------------------------------------------------------------
# 1. Targeted Milestone 2 Feature & Boundary Verification
# ------------------------------------------------------------------------------
# Run all Tier 1 tests matching F6, F7, F8:
node tests/e2e/runner.mjs --tier=1 --grep="F6|F7|F8"

# Run all Tier 2 tests matching B1 (OAuth), B2 (Session), B13 (Methods):
node tests/e2e/runner.mjs --tier=2 --grep="B1:|B2:|B13:"

# ------------------------------------------------------------------------------
# 2. Complete Tier Runs
# ------------------------------------------------------------------------------
# Full Tier 1 execution (65 tests)
node tests/e2e/runner.mjs --tier=1

# Full Tier 2 execution (65 tests)
node tests/e2e/runner.mjs --tier=2

# ------------------------------------------------------------------------------
# 3. Storefront Production Bundling Verification
# ------------------------------------------------------------------------------
# Verifies zero bundling errors, clean imports, and Vite build output
npm run build
```

---

### 4.2 Milestone 2 Verification Workflow

| Step | Action | Command | Target Outcome | Invalidation Condition |
|:---:|---|---|---|---|
| **Step 1** | Update `.env.example` | Inspect / apply updates | All 4 env variables present (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GOOGLE_REDIRECT_URI`) | `T1.F8.1` - `T1.F8.4` fail |
| **Step 2** | Verify Config Tests | `node tests/e2e/runner.mjs --tier=1 --grep="F8"` | 5 / 5 tests PASS (100%) | Any F8 test fails |
| **Step 3** | Implement Pages Functions Auth | Edit `functions/api/[[path]].js` | Implement `/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout` | N/A |
| **Step 4** | Verify F6 & F7 Features | `node tests/e2e/runner.mjs --tier=1 --grep="F6|F7"` | 10 / 10 tests PASS (100%) | Any F6 or F7 test fails |
| **Step 5** | Verify Boundaries (B1 & B2) | `node tests/e2e/runner.mjs --tier=2 --grep="B1:|B2:"` | 10 / 10 tests PASS (100%) | Tampered cookie or state bypasses check |
| **Step 6** | Verify Full Tier 1 & Tier 2 | `node tests/e2e/runner.mjs --tier=1`<br>`node tests/e2e/runner.mjs --tier=2` | Milestone 2 tests 100% pass; no regressions in existing catalog/schema tests | Failure in any M1 or M2 test case |
| **Step 7** | Frontend Build Gate | `npm run build` | Zero Vite bundler or syntax errors (exit code 0) | Build failure or missing export |

---

### 4.3 Target Metric Thresholds for Milestone 2 Completion

- **Tier 1 (F6 + F7 + F8)**: **15 / 15 tests PASS** (Baseline was 2 / 15).
- **Tier 2 (B1 + B2 + B13 auth tests)**: **13 / 13 tests PASS** (Baseline was 3 / 13).
- **Frontend Build**: `npm run build` exits with code 0 in $< 2$ seconds.
- **Overall Tier 1 Pass Rate**: Increases from **36/65 (55.4%)** to at least **49/65 (75.4%)**.
- **Overall Tier 2 Pass Rate**: Increases from **11/65 (16.9%)** to at least **21/65 (32.3%)**.

---
*End of Milestone 2 Environment Configuration & E2E Verification Plan.*
