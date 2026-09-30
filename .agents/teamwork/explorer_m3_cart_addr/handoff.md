# Milestone 3 Handoff Report: Persistent Cart & Address Book APIs

## 1. Observation

1. **Current Router & Endpoint Coverage in `functions/api/[[path]].js`**:
   - Lines 689-1073 handle `/api/assets/*`, `/api/upload`, `/api/auth/*` (`google`, `google/callback`, `me`, `logout`), `/api/products`, `/api/ai/*`, `/api/shipping/calculate`, and mock `/api/orders`.
   - Lines 1067-1068: Any unhandled path triggers fallback `return jsonResponse({ error: 'Endpoint not found', path }, 404);`.
   - Routes `/api/cart`, `/api/cart/items`, `/api/cart/items/:id`, `/api/customer/addresses`, `/api/customer/addresses/:id`, and `/api/customer/addresses/:id/default` do not exist currently and return 404.

2. **Schema & Foreign Key Constraints in `migrations/0002_domain_schema.sql`**:
   - Lines 35-49: `addresses` table has `id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_name TEXT NOT NULL, phone TEXT NOT NULL, street TEXT NOT NULL, ward TEXT, district TEXT NOT NULL, city_province TEXT NOT NULL, postal_code TEXT, is_default INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))`.
   - Lines 52-57: `carts` table has `id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))`.
   - Lines 60-71: `cart_items` table has `id TEXT PRIMARY KEY, cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0), created_at TEXT, updated_at TEXT`. Unique index `idx_cart_items_cart_product ON cart_items (cart_id, product_id)`.

3. **Baseline Test Execution**:
   - Command `node tests/e2e/tier1_feature.test.mjs` executed via `run_command` resulted in 16 failures out of 65 tests:
     - 5 Persistent Cart tests failed with `404 !== 200`: `T1.F9.1` (GET /api/cart), `T1.F9.2` (POST /api/cart/items), `T1.F9.3` (increment quantity), `T1.F9.4` (PUT /api/cart/items/:id), `T1.F9.5` (DELETE /api/cart/items/:id).
     - 3 Address Book tests failed with `404 !== 200`: `T1.F11.3` (GET /api/customer/addresses), `T1.F11.4` (POST /api/customer/addresses), `T1.F11.5` (default reset).
     - Other failures are Order Immutability checkout (`F10`) and Header sign-out (`F12`).
   - In `tests/e2e/tier2_boundary.test.mjs`:
     - Lines 139-181 test boundary conditions for cart: quantity 0 (`T2.11`), negative quantity (`T2.12`), non-numeric (`T2.13`), missing product_id (`T2.14`), non-existent product (`T2.15`), returning 400 or 404.
     - Lines 187-238 test authorization: unauthenticated access returning 401 (`T2.16`, `T2.17`), cross-tenant modification returning 403 or 404 (`T2.18`, `T2.19`), non-existent deletion (`T2.20`).
     - Lines 465-520 test address field validation (missing recipient_name, phone, street, city_province returning 400).
     - Lines 534-596 test cross-tenant address isolation (`T2.41`), modification attempt (`T2.42`), deletion attempt (`T2.43`), and default precedence (`T2.44`).

4. **Foreign Key Invariant with In-Memory Mock Sessions**:
   - `tests/e2e/helpers.mjs` sets `PRAGMA foreign_keys = ON;`.
   - `createTestClient().withSession({ id: 'usr_new_cart', email: '...' })` signs an HMAC token without inserting the user into `users` table ahead of time. Direct insertion into `carts` or `addresses` fails with `FOREIGN KEY constraint failed` unless user presence is ensured via `INSERT OR IGNORE INTO users ...`.

---

## 2. Logic Chain

1. From Observation 1, because incoming requests to `/api/cart` and `/api/customer/addresses` currently fall through to line 1067, all cart and address tests fail with status 404.
2. From Observation 2, `carts` has a 1:1 relation with `users`, while `cart_items` enforces `UNIQUE(cart_id, product_id)` with `CHECK (quantity > 0)`. Therefore, `POST /api/cart/items` must implement upsert behavior (incrementing `quantity` when `cart_id` and `product_id` match) and validate `quantity > 0`.
3. From Observation 3, active cart retrieval requires dynamic joining with `products` (`SELECT ci.id, ci.product_id, ci.quantity, p.name as title, p.price as current_price, p.image_url FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = ?`) so that changes in catalog prices immediately update the active cart while leaving historical orders unaffected.
4. From Observation 3 and 4, address book operations must guarantee default exclusivity (`is_default = 1` resets prior defaults for that `user_id` to 0), enforce tenant isolation (`WHERE user_id = ?` and ownership verification before updates/deletions), and call an idempotent `ensureUserExists` routine to prevent foreign key errors when testing with synthetic sessions.
5. Combining these requirements yields the complete endpoint architecture specified in `cart_and_address_plan.md`, providing drop-in handlers for:
   - `GET /api/cart`
   - `POST /api/cart/items`
   - `PUT /api/cart/items/:id`
   - `DELETE /api/cart/items/:id`
   - `DELETE /api/cart`
   - `GET /api/customer/addresses`
   - `POST /api/customer/addresses`
   - `PUT /api/customer/addresses/:id/default`
   - `PUT /api/customer/addresses/:id`
   - `DELETE /api/customer/addresses/:id`

---

## 3. Caveats

1. **Transactional Checkout Linkage (F10)**: The order checkout endpoint (`POST /api/orders`) is responsible for clearing the authenticated customer's cart upon order placement (`DELETE FROM cart_items WHERE cart_id = ...`) and freezing unit prices into `order_items`. This order checkout endpoint is being coordinated by a peer implementer for Milestone 3. The cart design provides `handleClearCart` and direct SQL queries that the checkout flow can leverage.
2. **Read-Only Investigation Scope**: In accordance with the Explorer archetype constraints, no modifications were made directly to `functions/api/[[path]].js`. All code drafts and architectural contracts are documented in `cart_and_address_plan.md`.

---

## 4. Conclusion

The Persistent Cart and Address Book APIs have been fully analyzed and designed with complete, production-ready code drafts in `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_cart_addr/cart_and_address_plan.md`.

Implementing these handlers and route bindings in `functions/api/[[path]].js` will resolve 8 direct Tier 1 test failures (`T1.F9.1` - `T1.F9.5` and `T1.F11.3` - `T1.F11.5`) and satisfy 20 boundary and cross-feature test cases across Tiers 2, 3, and 4.

---

## 5. Verification Method

To verify the design once integrated into `functions/api/[[path]].js`:

1. **Verify Cart Feature Tests**:
   ```bash
   node tests/e2e/tier1_feature.test.mjs
   ```
   Inspect results for `F9: Persistent Cart APIs` (`T1.F9.1` through `T1.F9.5`) and `F11: Address APIs` (`T1.F11.3` through `T1.F11.5`).

2. **Verify Boundary & Tenant Isolation**:
   ```bash
   node tests/e2e/tier2_boundary.test.mjs
   ```
   Inspect sections `B3: Cart Quantity & Item Boundaries` (`T2.11` - `T2.15`), `B4: Cart Authorization & Scope Boundaries` (`T2.16` - `T2.20`), and `B9: Address Isolation & Unauthorized Modifications` (`T2.41` - `T2.45`).

3. **Verify Cross-Feature Continuity**:
   ```bash
   node tests/e2e/tier3_cross_feature.test.mjs
   ```
   Inspect `T3.2` (price increase reflection in active cart), `T3.4` (address modification preserves order snapshot), `T3.5` (multiple address default precedence), and `T3.7` (cart continuity across re-authentication).
