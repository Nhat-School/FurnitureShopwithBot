# Reviewer 2 Handoff Report: Milestone 3 Domain APIs, Persistent Cart & Immutability

## 1. Observation

Direct observations and evidence collected during independent review:

### A. Integrity Violation Audit
- Codebase examined: `functions/api/[[path]].js` (lines 440–495, lines 1100–1837).
- No hardcoded test responses, fake test data, mock returns tailored to test suites, or shortcut implementations were found.
- All endpoints interact dynamically with the Cloudflare D1 SQLite database using parameterized SQL queries.

### B. Transactional Consistency & ACID Execution
- In `POST /api/orders` (`functions/api/[[path]].js`, lines 1648–1712):
  ```javascript
  const batchStatements = [
    env.DB.prepare(`
      INSERT INTO orders (
        id, customer_id, customer_name, customer_email, customer_phone, delivery_address,
        has_freight_elevator, floor_number, subtotal, freight_surcharge, total_amount,
        status, tracking_code, payment_method, notes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(...),
    ...preparedItems.map(item =>
      env.DB.prepare(`
        INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
        VALUES (?, ?, ?, ?, ?)
      `).bind(item.id, orderId, item.product_id, item.quantity, item.unit_price)
    ),
    env.DB.prepare(`
      INSERT INTO shipments (
        id, order_id, carrier, tracking_number, shipping_status, shipping_cost,
        recipient_name, phone, delivery_address, estimated_delivery, created_at, updated_at
      ) VALUES (?, ?, 'ABC Bulky Logistics', ?, 'pending', ?, ?, ?, ?, datetime('now', '+2 days'), datetime('now'), datetime('now'))
    `).bind(...),
    env.DB.prepare(`
      INSERT INTO order_payments (
        id, order_id, payment_method, transaction_id, payment_status, amount, created_at, updated_at
      ) VALUES (?, ?, ?, null, 'pending', ?, datetime('now'), datetime('now'))
    `).bind(...)
  ];

  if (customerId) {
    batchStatements.push(
      env.DB.prepare(`
        DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)
      `).bind(customerId)
    );
  }

  await env.DB.batch(batchStatements);
  ```
  All database write operations (`orders`, `order_items`, `shipments`, `order_payments`, and conditional `cart_items` purge) are executed in a single atomic batch (`env.DB.batch(batchStatements)`).

### C. Foreign Key Safety under `PRAGMA foreign_keys = ON`
- In `tests/e2e/helpers.mjs` (line 191), the test harness initializes SQLite with `PRAGMA foreign_keys = ON;`.
- Helper functions in `functions/api/[[path]].js`:
  - `ensureUserExists(env, user)` (lines 454–474) creates user and customer records with `INSERT OR IGNORE` before parent foreign key references are required.
  - `ensureUserCart(env, user)` (lines 476–495) creates the cart record if missing, guaranteeing foreign key constraints for `cart_items` (`FOREIGN KEY (cart_id) REFERENCES carts(id)`).
  - Referenced in `POST /api/cart/items` (line 1193), `POST /api/customer/addresses` (line 1338), and `POST /api/orders` (line 1608).

### D. JSON Parsing & Boundary Error Handling
- Safe `request.json()` try/catch parsing returning HTTP 400 Bad Request on malformed JSON or invalid syntax:
  - `POST /api/cart/items`: lines 1167–1174
  - `PUT /api/cart/items/:id`: lines 1251–1258
  - `POST /api/customer/addresses`: lines 1315–1322
  - `PUT /api/customer/addresses/:id`: lines 1402–1409
  - `POST /api/orders`: lines 1567–1575
- Empty payload and array rejection in `POST /api/orders` (line 1573):
  `if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) return jsonResponse({ error: 'Empty body or invalid payload' }, 400);`
- Positive integer quantity enforcement in cart and orders:
  `if (typeof qty !== 'number' || !Number.isInteger(qty) || qty <= 0) return jsonResponse({ error: 'Quantity must be a positive integer' }, 400);`

### E. Cross-Tenant Isolation
- In `GET /api/customer/orders` (line 1499):
  `WHERE o.customer_id = ?` bound strictly to `user.id` resolved from verified session cookie.
- In `GET /api/customer/addresses` (line 1306):
  `WHERE user_id = ?` bound to `user.id`.
- In `PUT /api/customer/addresses/:id` (line 1399) and `DELETE /api/customer/addresses/:id` (line 1460):
  Validates ownership with `if (address.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);`.
- In `PUT /api/cart/items/:id` (line 1246) and `DELETE /api/cart/items/:id` (line 1246):
  Validates ownership by joining `carts` with `cart_items` and checking `item.user_id !== user.id`, returning 403 Forbidden.

### F. Deterministic Order History Ordering
- In `GET /api/customer/orders` (line 1498):
  `ORDER BY o.created_at DESC, o.rowid DESC`.
  The secondary sorting key `o.rowid DESC` guarantees strict determinism even when multiple orders are created within the same second timestamp.

### G. Test Execution & Build Verification Results
1. `node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"`:
   - Output: `PASS All 40 test cases passed successfully in 56.6ms!`
   - Result: 40 passed, 0 failed.
2. `npm run build`:
   - Output: `✓ built in 585ms` (Vite production build output generated in `dist/`).
   - Result: Exit code 0.
3. Full Tier 2 boundary test run (`node tests/e2e/runner.mjs --tier=2`):
   - Result: 65 passed, 0 failed (100%).
4. Full Tier 3 cross-feature combinations (`node tests/e2e/runner.mjs --tier=3`):
   - Result: 15 passed, 0 failed (100%).
5. Full Tier 4 real-world user journeys (`node tests/e2e/runner.mjs --tier=4`):
   - Result: 7 passed, 0 failed (100%).
6. Tier 1 domain features (`node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"`):
   - Result: 15 passed, 0 failed (100%).

---

## 2. Logic Chain

1. **Integrity Verification**: Code inspection revealed zero mock facades, hardcoded test IDs, or bypassed tasks. The implementation queries actual SQLite tables via parameterized D1 statements, computes prices authoritatively from database records, and validates all input payloads.
2. **ACID Properties**: Because `orders`, `order_items`, `shipments`, `order_payments`, and `cart_items` deletion are bundled together in `batchStatements` passed to `env.DB.batch(...)`, any failure at any step triggers an immediate transaction rollback. This guarantees atomicity and prevents orphaned orders or unfulfilled cart clearing.
3. **Price Immutability**: In `POST /api/orders`, client-sent `price`, `unit_price`, and `total_amount` are ignored. Instead, each product is fetched from D1 (`SELECT price FROM products WHERE id = ?`), and the authoritative unit price is locked directly into `order_items.unit_price`. Subsequent changes to the `products` table do not alter frozen historical prices.
4. **Foreign Key Integrity**: With `PRAGMA foreign_keys = ON;`, any insert referencing a non-existent parent row fails. `ensureUserExists` and `ensureUserCart` guarantee that the prerequisite `users` and `carts` records exist prior to foreign-keyed insertions in `addresses`, `carts`, and `orders`.
5. **Cross-Tenant Security**: Address modifications, cart modifications, and order history lookups strictly filter by `user.id` authenticated via HMAC-SHA256 session tokens. Any attempt to modify or delete another tenant's cart item or address results in HTTP 403 Forbidden.
6. **Tie-Breaking Determinism**: Using `ORDER BY o.created_at DESC, o.rowid DESC` eliminates SQLite's non-deterministic row ordering when multiple orders share identical timestamp values.
7. **Build & Test Soundness**: All 40 domain boundary tests (`B3` through `B10`), all 15 cross-feature tests (`Tier 3`), all 7 user journeys (`Tier 4`), and production build succeed cleanly.

---

## 3. Caveats

- Storefront UI sign-out functionality in `src/components/Header.jsx` (`T1.F12.3`) is part of Milestone 4 (Storefront UI Integration) and is out of scope for Milestone 3 domain APIs. Milestone 3 code changes were strictly contained to `functions/api/[[path]].js`.
- No other caveats. All domain API, cart, address book, checkout immutability, order history, and tracking requirements are fully fulfilled.

---

## 4. Conclusion

### Verdict: APPROVE

**Justification**:
- Complete adherence to architectural and interface contracts specified in `PROJECT.md` and `ORIGINAL_REQUEST.md`.
- True ACID transactional batching using `env.DB.batch` encompassing orders, line items, shipments, payments, and cart clearance.
- Robust foreign key compliance under active `PRAGMA foreign_keys = ON;`.
- Strong price immutability protecting against price tampering and catalog fluctuations.
- Strict cross-tenant isolation and deterministic sorting.
- 100% test pass rate across all domain test suites (Tier 1 domain features, Tier 2 domain boundaries, Tier 3 combinations, Tier 4 user journeys).
- Clean production build with Vite (`npm run build`).
- Zero integrity violations detected.

---

## 5. Verification Method

To independently verify these conclusions, execute the following commands in the project root:

```bash
# 1. Verify Tier 2 Domain Boundary Tests (B3 through B10)
node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"

# 2. Verify Full Tier 2 Boundary & Error Suite (B1 through B13)
node tests/e2e/runner.mjs --tier=2

# 3. Verify Tier 1 Domain Feature Tests (F9, F10, F11)
node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"

# 4. Verify Tier 3 Cross-Feature Combination Suite
node tests/e2e/runner.mjs --tier=3

# 5. Verify Tier 4 Real-World Workload User Journeys
node tests/e2e/runner.mjs --tier=4

# 6. Verify Production Build
npm run build
```

Expected output:
- Tier 2 (B3-B10): 40 passed, 0 failed (100% pass rate)
- Tier 2 (All): 65 passed, 0 failed (100% pass rate)
- Tier 1 (F9-F11): 15 passed, 0 failed (100% pass rate)
- Tier 3: 15 passed, 0 failed (100% pass rate)
- Tier 4: 7 passed, 0 failed (100% pass rate)
- `npm run build`: Completes successfully with exit code 0
