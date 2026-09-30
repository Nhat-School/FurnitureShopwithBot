# Handoff Report: Price Immutability Checkout Transaction Architecture (Milestone 3)

## 1. Observation

1. **Current Checkout Implementation**:
   - Location: `functions/api/[[path]].js:1042-1065`.
   - Existing code for `POST /api/orders`:
     ```javascript
     if (segments[0] === 'orders') {
       if (method === 'POST') {
         const body = await request.json();
         const trackingCode = `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`;
         return jsonResponse({
           success: true,
           order: {
             id: `ord_${Date.now()}`,
             trackingCode,
             customer: body.customer,
             totalAmount: body.totalAmount,
             status: 'Processing',
           },
         });
       }
     ```
   - Current implementation is a non-persistent stub that blindly echoes `body.totalAmount`, does not validate input, does not query D1 `products`, does not insert into `orders`, `order_items`, `shipments`, or `order_payments`, and does not purge `cart_items`.

2. **Schema & Column Names**:
   - `migrations/0001_initial_schema.sql:14-35`: `products` table has column `name TEXT NOT NULL` (not `title`), `price REAL NOT NULL`, `stock INTEGER NOT NULL DEFAULT 0`.
   - `migrations/0001_initial_schema.sql:38-55` & `migrations/0002_domain_schema.sql:74`: `orders` table has columns `id, customer_id, customer_name, customer_email, customer_phone, delivery_address, has_freight_elevator, floor_number, subtotal, freight_surcharge, total_amount, status, tracking_code, payment_method, notes`.
   - `migrations/0001_initial_schema.sql:58-66`: `order_items` table has columns `id, order_id, product_id, quantity, unit_price`.
   - `migrations/0002_domain_schema.sql:78-91`: `shipments` table has columns `id, order_id, carrier, tracking_number, shipping_status, shipping_cost, recipient_name, phone, delivery_address, estimated_delivery`.
   - `migrations/0002_domain_schema.sql:96-105`: `order_payments` table has columns `id, order_id, payment_method, transaction_id, payment_status, amount`.
   - `migrations/0002_domain_schema.sql:52-67`: `carts` and `cart_items` tables for active mutable cart persistence.

3. **Test Failures**:
   - Running `node --test tests/e2e/tier1_feature.test.mjs` yields 16 failures, specifically:
     - `T1.F10.1`: `total_amount` expected `prod.price * 2`, received `undefined`.
     - `T1.F10.2`: `order_items.unit_price` expected frozen price, received `undefined`.
     - `T1.F10.3`: `shipments` row missing.
     - `T1.F10.4`: `order_payments` row missing.
     - `T1.F10.5`: `cart_items` not cleared after checkout.
   - Running `node --test tests/e2e/tier2_boundary.test.mjs` yields 42 failures, including `B5` (empty cart/invalid payload validation T2.21 - T2.25), `B6` (malformed quantity/syntax T2.26 - T2.30), `B7` (price tampering defense T2.31 - T2.35), `B10` (customer order history T2.46 - T2.50), and `B11` (`customer_name` SQL injection parameterization T2.53).
   - In `tests/e2e/tier3_cross_feature.test.mjs` and `tests/e2e/tier4_real_world.test.mjs`: tests `T3.1`, `T3.2`, `T3.3`, `T3.4`, `T3.6`, `T3.8`, `T3.15`, `T4.1`, `T4.2`, `T4.3`, `T4.4` all require persistent checkout with price immutability, shipment creation, and cart purging.

4. **D1 Batch Capabilities**:
   - `tests/e2e/helpers.mjs:163-178`: `mockD1.batch(statements)` implements `BEGIN TRANSACTION; ... COMMIT;` with automatic rollback on error. Cloudflare D1 runtime similarly provides atomic transactional execution for `env.DB.batch([...])`.

---

## 2. Logic Chain

1. **Price Tampering Vulnerability Elimination**:
   - Observation 1 & 3 show tests sending spoofed prices: `price: 1`, `unit_price: 0`, and `total_amount: 100` (`T2.31`, `T2.32`, `T2.33`).
   - If the server accepts client prices, an attacker can purchase luxury furniture for 1 VND.
   - Therefore, the server MUST ignore all client-supplied prices and fetch the true price directly from the D1 database: `SELECT id, name, price FROM products WHERE id = ?`.
   - The frozen price stored in `order_items.unit_price` must equal `product.price` at the instant of order placement, satisfying `d/dt(unit_price) = 0` for all subsequent time `t >= t_checkout`.

2. **Schema Compatibility**:
   - Observation 2 reveals that `products` has `name`, not `title`. Attempting to query `title` would fail with SQLite column errors.
   - Therefore, SQL queries must use `name`, and map `title = name` in API outputs for client convenience.

3. **Input Validation & JSON Error Boundary**:
   - Observation 3 shows `T2.30` sending invalid JSON syntax `{ malformed_json: true, `.
   - A standard `await request.json()` without try/catch throws `SyntaxError` which is currently caught by the 500 handler.
   - Therefore, `await request.json()` must be wrapped in a localized try/catch returning HTTP 400.
   - Furthermore, checks for empty body (`T2.29`), empty items (`T2.21`, `T2.22`), missing customer fields (`T2.23`-`T2.25`), and non-positive/float quantities (`T2.26`, `T2.27`) must return 400.

4. **Session Linkage & Guest Checkout**:
   - If the request includes a signed `fur_session` cookie (`getCookie(request, 'fur_session')`), verifying it via `verifySession` extracts `session.id`.
   - To satisfy `PRAGMA foreign_keys = ON;`, the user row is ensured to exist via `INSERT OR IGNORE INTO users ...`.
   - If unauthenticated, `customer_id` is set to `null` to permit guest orders per `T1.F4.2`.

5. **Atomic Transactional Consistency**:
   - Observation 4 confirms that `env.DB.batch([...])` runs all statements within an atomic transaction.
   - Placing `INSERT INTO orders`, `INSERT INTO order_items`, `INSERT INTO shipments`, `INSERT INTO order_payments`, and `DELETE FROM cart_items` into a single batch ensures 100% ACID consistency: all 5 actions succeed or none are committed.

---

## 3. Caveats

1. **Persistent Cart Endpoints**:
   - This plan focuses specifically on `POST /api/orders` (Feature F10). Persistent cart CRUD endpoints (`/api/cart` GET/POST/PUT/DELETE) and Address CRUD endpoints (`/api/customer/addresses`) are defined in Milestone 3 scope and must be implemented alongside or prior to full end-to-end integration tests passing.
2. **Inventory Stock Tracking**:
   - While `products` has a `stock` column and `0001_initial_schema.sql` defines `inventory_logs`, test cases in Tiers 1-4 do not assert inventory decrements during checkout (in fact, `T2.35` tests catalog price/stock dropping to 0 while preserving historical order unit price). Inventory adjustments should not block order creation unless explicit business rules are introduced.

---

## 4. Conclusion

The implementation plan in `checkout_immutability_plan.md` provides an exact, hardened architecture and drop-in code for `POST /api/orders` in `functions/api/[[path]].js`. It enforces:
- Strict mathematical price immutability (`d/dt(unit_price) = 0`).
- Complete defense against price tampering and spoofed totals.
- Atomic D1 batch transactional execution across all 5 domain tables (`orders`, `order_items`, `shipments`, `order_payments`, `cart_items`).
- Full compliance with guest checkout and authenticated customer attribution.

---

## 5. Verification Method

1. **Independent Test Execution**:
   Run the following commands to verify checkout immutability and boundary defenses:
   ```bash
   node --test tests/e2e/tier1_feature.test.mjs
   node --test tests/e2e/tier2_boundary.test.mjs
   node --test tests/e2e/tier3_cross_feature.test.mjs
   node --test tests/e2e/tier4_real_world.test.mjs
   ```

2. **Files to Inspect**:
   - Plan document: `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_checkout/checkout_immutability_plan.md`
   - Target implementation: `/Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js`
   - Migrations: `migrations/0001_initial_schema.sql` and `migrations/0002_domain_schema.sql`
   - E2E Tests: `tests/e2e/tier1_feature.test.mjs` (F10 suite), `tests/e2e/tier2_boundary.test.mjs` (B5, B6, B7 suites)

3. **Invalidation Conditions**:
   - Any test assertion where `order_items.unit_price` changes following a `products` table update.
   - Any test where client-supplied spoofed prices override catalog prices.
   - Any partial write where an order row exists without corresponding shipment or payment rows.
