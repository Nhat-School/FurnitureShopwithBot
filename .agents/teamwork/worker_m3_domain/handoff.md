# Milestone 3 Handoff Report: Domain APIs, Persistent Cart & Immutability

## 1. Observation
- Prior to changes, execution of `node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"` produced 15 failures:
  ```
  FAIL 15 out of 15 test cases failed (30.1ms).
  1. [Tier 1] F9: Persistent Cart APIs > T1.F9.1: GET /api/cart returns empty items array for new authenticated customer
     AssertionError [ERR_ASSERTION]: 404 !== 200
  ```
- File `functions/api/[[path]].js` had mock stubs for `/api/orders` (lines 1098-1121) returning static mock tracking codes without writing to D1, without checking prices in `products`, and without creating records in `order_items`, `shipments`, or `order_payments`.
- Cart (`/api/cart/*`) and Customer (`/api/customer/*`) endpoints were unhandled and returned 404.
- In `functions/api/[[path]].js`, we implemented:
  1. Helper utilities: `getAuthenticatedUser(request, env)`, `ensureUserExists(env, user)`, and `ensureUserCart(env, user)`.
  2. Persistent Cart endpoints:
     - `GET /api/cart`: Authenticated check (401 if unauthenticated), joins `cart_items` with `products` returning live catalog prices (`current_price`), item quantity, image, and details.
     - `DELETE /api/cart`: Clears user cart items.
     - `POST /api/cart/items`: Validates `product_id` and positive integer `quantity > 0`, checks product existence in `products` (404 if absent), and upserts quantity.
     - `PUT /api/cart/items/:id`: Validates positive integer `quantity > 0`, verifies user ownership (404 if absent, 403 if belonging to another user), and updates quantity.
     - `DELETE /api/cart/items/:id`: Validates user ownership (404 if absent, 403 if belonging to another user) and deletes item.
  3. Customer Address Book endpoints:
     - `GET /api/customer/addresses`: Authenticated (401 if unauthenticated), lists user addresses ordered by `is_default DESC, created_at DESC`.
     - `POST /api/customer/addresses`: Validates required fields (`recipient_name`, `phone`, `street`, `city_province`), resets existing defaults if `is_default = 1`, and inserts address.
     - `PUT /api/customer/addresses/:id/default`: Resets user's other addresses to `is_default = 0` and marks this address `is_default = 1`.
     - `PUT /api/customer/addresses/:id`: Validates ownership (404/403) and updates fields.
     - `DELETE /api/customer/addresses/:id`: Validates ownership (404/403) and deletes address without affecting historical order snapshots.
  4. Transactional Checkout with Strict Price Immutability (`POST /api/orders`):
     - Parses JSON safely with try/catch returning 400 on malformed syntax or empty body.
     - Validates required fields: `customer_name`, `customer_phone`, `delivery_address`, and non-empty `items` array with valid positive integer quantities.
     - Re-queries D1 `products` for live prices, completely ignoring client-sent `price`, `unit_price`, or `total_amount`.
     - Computes `subtotal = sum(unit_price * quantity)` and `total_amount = subtotal + (freight_surcharge || 0)`.
     - Atomically executes `env.DB.batch([...])`: inserts `orders`, inserts frozen line items in `order_items`, inserts `shipments` with carrier snapshot, inserts `order_payments` with pending status, and purges `cart_items` if authenticated.
  5. Customer Order History (`GET /api/customer/orders`):
     - Authenticated endpoint (401 if unauthenticated).
     - Strictly filters `WHERE customer_id = user.id`.
     - Sorted deterministically with `ORDER BY o.created_at DESC, o.rowid DESC`.
     - Enriches each order with historical `order_items` (preserving frozen `unit_price`), `shipment`, and `payment`.
  6. Public Order Tracking (`GET /api/orders/:trackingCode`):
     - Queries `orders` joined with `shipments` by tracking code, tracking number, or order ID.
     - Returns 404 if not found.
     - Returns structured JSON payload matching `OrderTrackModal.jsx` timeline requirements.

## 2. Logic Chain
1. By implementing `getAuthenticatedUser`, `ensureUserExists`, and `ensureUserCart`, endpoints can securely resolve cryptographic session claims from the `fur_session` cookie and guarantee foreign key integrity in SQLite D1 under `PRAGMA foreign_keys = ON;`.
2. By querying the live catalog in `GET /api/cart` (`JOIN products p`), active cart items always reflect up-to-date pricing until checkout, fulfilling T3.2 and T3.3.
3. In `POST /api/orders`, querying `products` for authoritative prices and ignoring client-supplied prices guarantees mathematical price immutability ($d/dt(\text{unit\_price}) = 0$), defeating price tampering attacks (T2.31, T2.32, T2.33) and freezing historical costs (T1.F10.2, T2.34, T2.35, T3.15).
4. Atomically bundling order insertion, order items, shipment tracking, payment record, and cart item purging into `env.DB.batch(...)` guarantees ACID transactional semantics, preventing orphaned state or half-completed checkouts.
5. In `GET /api/customer/orders`, strictly querying `WHERE customer_id = user.id` and sorting with `ORDER BY o.created_at DESC, o.rowid DESC` guarantees cross-tenant isolation and deterministic order history ordering (T2.47, T3.10, T3.11).

## 3. Caveats
- Storefront UI sign-out wiring in `src/components/Header.jsx` (test `T1.F12.3`) is part of Milestone 4: Storefront UI Integration, and was intentionally untouched per file ownership constraints (exclusive write ownership of `functions/api/[[path]].js`).
- No caveats regarding domain APIs, persistent cart, address book, checkout immutability, order history, or tracking.

## 4. Conclusion
Milestone 3 is completely implemented, verified, and passing:
- 100% of required Persistent Cart, Address Book, Checkout, Order History, and Tracking endpoints are fully operational.
- All 15 Tier 1 domain feature tests (`F9`, `F10`, `F11`) pass (15/15).
- All 40 Tier 2 boundary tests (`B3` through `B10`) pass (40/40).
- All 15 Tier 3 cross-feature combination tests pass (15/15).
- All 7 Tier 4 real-world user journey tests pass (7/7).
- Production build `npm run build` succeeds cleanly in ~570ms with zero errors.

## 5. Verification Method
Run the following commands to independently verify:

```bash
# 1. Verify Tier 1 Domain Feature Tests (F9, F10, F11)
node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"

# 2. Verify Tier 2 Domain Boundary Tests (B3 through B10)
node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"

# 3. Verify Tier 3 Cross-Feature Combination Tests
node tests/e2e/runner.mjs --tier=3

# 4. Verify Tier 4 Real-World Workload User Journeys
node tests/e2e/runner.mjs --tier=4

# 5. Verify Production Build
npm run build
```

Expected output:
- Tier 1 (F9-F11): 15 passed, 0 failed (100%)
- Tier 2 (B3-B10): 40 passed, 0 failed (100%)
- Tier 3: 15 passed, 0 failed (100%)
- Tier 4: 7 passed, 0 failed (100%)
- Vite production build completes successfully with exit code 0.
