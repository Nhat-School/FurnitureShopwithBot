# E2E Test Suite Specification & Runner Guide: Furproject

## 1. Overview & Verification Strategy
The comprehensive End-to-End (E2E) test suite for the **Furproject Google OAuth & Domain Model Architecture Upgrade** has been constructed under `tests/e2e/`.

The test suite is requirement-driven, opaque-box, and strictly derived from `ORIGINAL_REQUEST.md`, `PROJECT.md`, and system design specifications (`/Users/nhaterik/lastyear/thietkehethong`). It validates the system across 4 tiers with zero external npm dependencies, running directly in Node.js v26 using native `node:sqlite` in-memory database simulation of Cloudflare D1 and direct invocation of Cloudflare Pages Functions (`functions/api/[[path]].js`).

---

## 2. Test Execution Commands

### Run Full Test Suite (All 4 Tiers)
```bash
node tests/e2e/runner.mjs
```

### Run by Tier Filter
```bash
# Tier 1: Feature Coverage (65 tests)
node tests/e2e/runner.mjs --tier=1

# Tier 2: Boundary & Error Conditions (65 tests)
node tests/e2e/runner.mjs --tier=2

# Tier 3: Cross-Feature Combinations (15 tests)
node tests/e2e/runner.mjs --tier=3

# Tier 4: Real-World Workload User Journeys (7 workflows)
node tests/e2e/runner.mjs --tier=4
```

### Direct Module Execution
Any tier test file can be run directly:
```bash
node tests/e2e/tier1_feature.test.mjs
node tests/e2e/tier2_boundary.test.mjs
node tests/e2e/tier3_cross_feature.test.mjs
node tests/e2e/tier4_real_world.test.mjs
```

### Advanced Runner Flags
- `--bail`: Stop execution upon encountering the first failure.
- `--grep=<pattern>`: Run only test cases whose full name matches the regular expression pattern.
- `NO_COLOR=1`: Disable ANSI terminal coloring.

---

## 3. Tier Breakdown & Test Counts

| Tier | Category | Specification Source | Test Count | Target Threshold | Status |
|:---:|---|---|:---:|:---:|:---:|
| **Tier 1** | Feature Coverage (F1 - F13) | `ORIGINAL_REQUEST.md`, `PROJECT.md` | **65** | $\ge 65$ | **READY** |
| **Tier 2** | Boundary & Error Conditions | Category-Partition & Boundary Analysis | **65** | $\ge 65$ | **READY** |
| **Tier 3** | Cross-Feature Combinations | Pairwise Subsystem Interactions | **15** | $\ge 15$ | **READY** |
| **Tier 4** | Real-World Workload Journeys | Multi-Step End-to-End User Flows | **7** | $\ge 7$ | **READY** |
| **TOTAL** | **Comprehensive E2E Suite** | **Tiers 1 - 4 Complete** | **152** | $\ge 150$ | **READY** |

---

## 4. Feature Coverage Matrix (Tier 1 Breakdown)

Every feature in `PROJECT.md` is covered by at least 5 dedicated Tier 1 test cases:

| Feature ID | Feature Name | Test ID Range | Coverage Highlights |
|---|---|---|---|
| **F1** | Users & Customer Profiles Schema | `T1.F1.1` – `T1.F1.5` | `users` DDL, email UNIQUE constraint, partial unique index `idx_users_auth_provider_subject`, customer profile foreign keys, cascade deletion, default loyalty points. |
| **F2** | Address Book Schema | `T1.F2.1` – `T1.F2.5` | `addresses` DDL, foreign key to `users(id)`, multi-address per customer, `is_default` flag, cascade purge. |
| **F3** | Persistent Cart Schema | `T1.F3.1` – `T1.F3.5` | `carts` 1:1 user constraint, `cart_items` cascade linkage to products, `(cart_id, product_id)` unique composite index, default quantity, cascade deletion. |
| **F4** | Order Customer Linkage Schema | `T1.F4.1` – `T1.F4.5` | `orders.customer_id` linkage, nullable for guest checkout, address snapshot preservation, `order_items` frozen unit price schema, multi-item linking. |
| **F5** | Shipments & Payments Schema | `T1.F5.1` – `T1.F5.5` | `shipments` 1:1 unique order foreign key, carrier tracking details, `order_payments` 1:1 transaction tracking, cascade order deletion. |
| **F6** | Google OAuth 2.0 PKCE Flow | `T1.F6.1` – `T1.F6.5` | `GET /api/auth/google` 302 redirect, `fur_google_oauth_state` (32 bytes), `fur_google_oauth_verifier` HttpOnly cookie, PKCE `code_challenge` S256, state validation on callback. |
| **F7** | Session Management & Logout | `T1.F7.1` – `T1.F7.5` | HMAC-SHA256 session token generation and verification, `GET /api/auth/me` user profile resolution, 401 unauthenticated response, `POST /api/auth/logout` cookie invalidation (Max-Age=0). |
| **F8** | Environment Configuration | `T1.F8.1` – `T1.F8.5` | `.env.example` documentation of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GOOGLE_REDIRECT_URI`, and `wrangler.toml` D1 database binding `DB`. |
| **F9** | Persistent Cart APIs | `T1.F9.1` – `T1.F9.5` | `GET /api/cart` retrieval, `POST /api/cart/items` persistence, duplicate item quantity accumulation, `PUT /api/cart/items/:id` quantity update, `DELETE /api/cart/items/:id` removal. |
| **F10** | Price Immutability Checkout API | `T1.F10.1` – `T1.F10.5` | `POST /api/orders` authoritative live catalog price querying from D1, locking unit price in `order_items`, generating 1:1 shipment tracking and order payment, clearing user cart. |
| **F11** | Order History & Address APIs | `T1.F11.1` – `T1.F11.5` | `GET /api/customer/orders` isolation, frozen price display, `GET /api/customer/addresses`, `POST /api/customer/addresses`, default address toggle semantics. |
| **F12** | Storefront Auth UI | `T1.F12.1` – `T1.F12.5` | `AuthModal.jsx` Google login action, `Header.jsx` avatar and sign-out trigger, `App.jsx` session restoration on mount, graceful unauthenticated guest rendering. |
| **F13** | Storefront Checkout UI & Build | `T1.F13.1` – `T1.F13.5` | `CartDrawer.jsx` address selection, guest checkout input, `OrderTrackModal.jsx` status display, zero-error production build (`npm run build`), clean JSX exports. |

---

## 5. Test Infrastructure Artifacts

- **`tests/e2e/runner.mjs`**: Lightweight Node.js test runner with real-time test progress logging, per-test microsecond timing, tier-by-tier execution, failure diagnostics, and summary statistics table.
- **`tests/e2e/helpers.mjs`**:
  - `createMockD1Database(db)`: Full simulation of Cloudflare D1 API (`prepare`, `bind`, `all`, `first`, `run`, `batch`, `exec`) backed by SQLite `DatabaseSync`.
  - `setupTestDatabase()`: Sets up schema migrations with foreign keys enabled (`PRAGMA foreign_keys = ON;`).
  - `createTestClient()`: Dispatches requests directly to Pages Functions `onRequest({ request, env })` or HTTP dev server with cookie jar and session signing.
  - `signSessionToken()` / `verifySessionToken()`: Web Crypto HMAC-SHA256 implementation matching FlashCardWeb specification.
- **`tests/e2e/tier1_feature.test.mjs`**: 65 feature tests.
- **`tests/e2e/tier2_boundary.test.mjs`**: 65 boundary & negative tests.
- **`tests/e2e/tier3_cross_feature.test.mjs`**: 15 cross-feature interaction tests.
- **`tests/e2e/tier4_real_world.test.mjs`**: 7 end-to-end user journey tests.

---

## 6. Baseline Test Run Results (Pre-Implementation Baseline)

Execution of `node tests/e2e/runner.mjs` against the un-upgraded codebase produced the following baseline statistics:

```
                    E2E TEST SUMMARY STATISTICS                  
══════════════════════════════════════════════════════════════════
Tier                                         Total   Pass   Fail     Rate      Time
──────────────────────────────────────────────────────────────────
Tier 1: Feature Coverage (F1-F13)               65     36     29    55.4%     863ms
Tier 2: Boundary & Error Conditions             65     11     54    16.9%      45ms
Tier 3: Cross-Feature Combinations              15      1     14     6.7%      11ms
Tier 4: Real-World Workload Journeys             7      0      7     0.0%       6ms
──────────────────────────────────────────────────────────────────
Grand Total                                    152     48    104    31.6%   925.5ms
══════════════════════════════════════════════════════════════════
```

### Analysis of Baseline Failures (Pending Milestones)
1. **Milestone 2 (Google OAuth & Session Management)**: Endpoints `/api/auth/google`, `/api/auth/google/callback`, and signed `/api/auth/me` are currently unhandled or return placeholders.
2. **Milestone 3 (Domain APIs & Price Immutability)**: Endpoints `/api/cart/*`, `POST /api/orders` (with D1 price freezing and `shipments`/`order_payments` insertion), and `/api/customer/*` are pending implementation.
3. **Milestone 4 (Storefront UI Integration)**: Sign-out wiring in `Header.jsx` to be finalized.

### Discovered Implementation Defects Escalated
1. **WHATWG Fetch 204 No Content Violation in `functions/api/[[path]].js:23`**:
   Line 23 calls `return jsonResponse({}, 204);`. Under WHATWG Fetch standard (`undici` / Web Workers), status 204 responses must not have a response body. Calling `new Response(JSON.stringify({}), { status: 204 })` throws `TypeError: Response constructor: Invalid response status code 204`. Must be changed to `new Response(null, { status: 204, headers: ... })`.
2. **Empty Search Query Returns 404 in `functions/api/[[path]].js:200`**:
   In `GET /api/products`, if `results.length === 0`, execution falls through to line 405 returning `{ error: 'Endpoint not found' }, 404` instead of returning `{ products: [] }, 200`.
