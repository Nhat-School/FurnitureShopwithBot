# Milestone 3 Forensic Integrity Audit Report

## 1. Observation

### Forensic Audit Report
- **Work Product**: Milestone 3 Domain Logic & E2E Validation (`functions/api/[[path]].js`)
- **Profile**: General Project
- **Integrity Mode**: Development (per `ORIGINAL_REQUEST.md`)
- **Verdict**: CLEAN

### Phase Results
- **Hardcoded Output Detection**: PASS — No hardcoded test responses, fake bypasses, or static return strings found in `functions/api/[[path]].js`.
- **Facade Detection**: PASS — Genuine database queries and mutations implemented across all cart, address book, checkout, and tracking endpoints.
- **Pre-populated Artifact Detection**: PASS — Zero pre-populated test logs or verification files in repository.
- **Price Immutability Verification**: PASS — In `POST /api/orders` (lines 1614–1634), unit prices are strictly retrieved from D1 table `products` (`SELECT id, name, price, stock FROM products WHERE id = ?`). Client-provided prices (`price`, `unit_price`, or `total_amount`) are discarded. `order_items.unit_price` captures the exact price snapshot at checkout.
- **Transactional Atomicity (`env.DB.batch`)**: PASS — In `POST /api/orders` (lines 1648–1711), order records, order items, shipments, order payments, and cart clearing are batched into a single atomic transaction.
- **Execution Validation**:
  - `node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"`: PASS (15 passed, 0 failed, 39.0ms)
  - `node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"`: PASS (40 passed, 0 failed, 56.2ms)
  - `node tests/e2e/runner.mjs --tier=3`: PASS (15 passed, 0 failed, 41.5ms)
  - `node tests/e2e/runner.mjs --tier=4`: PASS (7 passed, 0 failed, 35.2ms)
  - `npm run build`: PASS (built in 573ms, zero compiler/bundler errors)
  - Custom forensic assertion script: PASS — Independent SQLite verification confirmed table insertions for `orders`, `order_items`, `shipments`, `order_payments`, and clearing of `cart_items`.

### Raw Evidence

#### A. Source Code Direct Quotation (`functions/api/[[path]].js`)
Price resolution in `POST /api/orders` (lines 1614–1634):
```javascript
for (const item of body.items) {
  const pid = item.product_id.trim();
  const product = await env.DB.prepare('SELECT id, name, price, stock FROM products WHERE id = ?').bind(pid).first();
  if (!product) {
    return jsonResponse({ error: `Product not found: ${pid}` }, 404);
  }

  const unitPrice = Number(product.price);
  const lineSubtotal = unitPrice * item.quantity;
  subtotal += lineSubtotal;

  preparedItems.push({
    id: `oi_${Date.now()}_${randomBase64Url(6)}`,
    product_id: pid,
    title: product.name,
    name: product.name,
    quantity: item.quantity,
    unit_price: unitPrice,
    subtotal: lineSubtotal,
  });
}
```

Batch persistence in `POST /api/orders` (lines 1648–1712):
```javascript
const batchStatements = [
  env.DB.prepare(`
    INSERT INTO orders (
      id, customer_id, customer_name, customer_email, customer_phone, delivery_address,
      has_freight_elevator, floor_number, subtotal, freight_surcharge, total_amount,
      status, tracking_code, payment_method, notes, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?, ?, ?, datetime('now'), datetime('now'))
  `).bind(orderId, customerId, customerName, customerEmail, customerPhone, deliveryAddress, hasFreightElevator, floorNumber, subtotal, freightSurcharge, totalAmount, trackingCode, paymentMethod, notes),
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
  `).bind(shipmentId, orderId, trackingCode, freightSurcharge, customerName, customerPhone, deliveryAddress),
  env.DB.prepare(`
    INSERT INTO order_payments (
      id, order_id, payment_method, transaction_id, payment_status, amount, created_at, updated_at
    ) VALUES (?, ?, ?, null, 'pending', ?, datetime('now'), datetime('now'))
  `).bind(paymentId, orderId, paymentMethod, totalAmount)
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

#### B. Independent Test Suite Execution Logs
1. Command: `node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"`
```
▶ [Tier 1] F9: Persistent Cart APIs
  ✓ T1.F9.1: GET /api/cart returns empty items array for new authenticated customer (15.4ms)
  ✓ T1.F9.2: POST /api/cart/items adds product and quantity to persistent cart (1.9ms)
  ✓ T1.F9.3: POST /api/cart/items with existing product increments quantity (1.8ms)
  ✓ T1.F9.4: PUT /api/cart/items/:id updates item quantity in persistent cart (2.2ms)
  ✓ T1.F9.5: DELETE /api/cart/items/:id removes item from persistent cart (1.5ms)

▶ [Tier 1] F10: Price Immutability Checkout API
  ✓ T1.F10.1: POST /api/orders retrieves live catalog price from products table at checkout time (1.0ms)
  ✓ T1.F10.2: POST /api/orders freezes unit_price in order_items decoupled from future catalog price changes (0.9ms)
  ✓ T1.F10.3: POST /api/orders creates corresponding shipments record with tracking code and address snapshot (0.8ms)
  ✓ T1.F10.4: POST /api/orders creates corresponding order_payments record with method and pending status (0.8ms)
  ✓ T1.F10.5: POST /api/orders automatically clears authenticated user persistent cart items (1.7ms)

▶ [Tier 1] F11: Order History & Address APIs
  ✓ T1.F11.1: GET /api/customer/orders returns orders belonging exclusively to authenticated customer (1.4ms)
  ✓ T1.F11.2: GET /api/customer/orders items contain frozen unit_price and shipment tracking (1.3ms)
  ✓ T1.F11.3: GET /api/customer/addresses returns saved addresses for authenticated customer (1.0ms)
  ✓ T1.F11.4: POST /api/customer/addresses saves a new delivery address for authenticated customer (5.0ms)
  ✓ T1.F11.5: Saving new default address resets is_default on existing addresses (1.6ms)

Grand Total: 15 passed, 0 failed, 100.0%, 39.0ms
PASS All 15 test cases passed successfully in 39.0ms!
```

2. Command: `node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"`
```
▶ [Tier 2] B3: Cart Quantity & Item Boundaries (5 tests) -> ALL PASS
▶ [Tier 2] B4: Cart Authorization & Scope Boundaries (5 tests) -> ALL PASS
▶ [Tier 2] B5: Empty Cart & Invalid Checkout Boundaries (5 tests) -> ALL PASS
▶ [Tier 2] B6: Malformed Order Payloads & Data Types (5 tests) -> ALL PASS
▶ [Tier 2] B7: Price Tampering Defense (5 tests) -> ALL PASS
▶ [Tier 2] B8: Address Book Validation & Missing Fields (5 tests) -> ALL PASS
▶ [Tier 2] B9: Address Isolation & Unauthorized Modifications (5 tests) -> ALL PASS
▶ [Tier 2] B10: Customer Order History Isolation & Boundary (5 tests) -> ALL PASS

Grand Total: 40 passed, 0 failed, 100.0%, 56.2ms
PASS All 40 test cases passed successfully in 56.2ms!
```

3. Command: `node tests/e2e/runner.mjs --tier=3`
```
▶ [Tier 3] Tier 3: Cross-Feature Combinations (15 tests) -> ALL PASS
Grand Total: 15 passed, 0 failed, 100.0%, 41.5ms
PASS All 15 test cases passed successfully in 41.5ms!
```

4. Command: `node tests/e2e/runner.mjs --tier=4`
```
▶ [Tier 4] Tier 4: Real-World Workload Journeys (7 tests) -> ALL PASS
Grand Total: 7 passed, 0 failed, 100.0%, 35.2ms
PASS All 7 test cases passed successfully in 35.2ms!
```

5. Production build: `npm run build`
```
vite v6.4.3 building for production...
transforming (1) src/main.jsx...
✓ 1871 modules transformed.
dist/index.html                   1.34 kB │ gzip:  0.81 kB
dist/assets/index-BiY5aQvB.css   43.85 kB │ gzip:  8.45 kB
dist/assets/index-OSkjDEjQ.js   305.07 kB │ gzip: 87.09 kB
✓ built in 573ms
```

6. Independent Forensic Assertion Script Output:
```
Product 1: prod_sofa_nordic Price: 14500000
Product 2: prod_table_oak Price: 4200000
Actual subtotal: 51900000 Expected: 51900000
Actual total: 51950000 Expected: 51950000
AUDIT VERIFICATION CONFIRMED: ALL D1 TABLES GENUINELY PERSISTED!
```

## 2. Logic Chain
1. Inspection of `functions/api/[[path]].js` shows that `POST /api/orders` executes a parameterized query `SELECT id, name, price, stock FROM products WHERE id = ?` for every item in `body.items`. It multiplies the retrieved catalog price by the requested integer quantity to compute line subtotals.
2. The logic ignores any incoming `price`, `unit_price`, or client-asserted `total_amount` attributes in the request payload. Therefore, price tampering attacks (e.g. attempting to submit items at price 0 or 1 VND) are structurally impossible.
3. The atomic call `await env.DB.batch(batchStatements)` guarantees that `orders`, `order_items`, `shipments`, and `order_payments` records are written simultaneously. If any foreign key or constraint fails (such as an invalid product reference), the batch transaction rolls back, leaving no orphaned records.
4. Active cart items (`GET /api/cart`) join directly with `products` on `ci.product_id = p.id`, ensuring that while items remain in the cart, their display prices reflect the live catalog. Once checkout occurs, the historical price snapshot is permanently frozen in `order_items.unit_price`.
5. Address management (`/api/customer/addresses`) and order history (`/api/customer/orders`) strictly constrain queries and updates by `user_id = ?` and `customer_id = ?`, preventing cross-tenant leakage and privilege escalation.
6. Execution of the official test harness across Tiers 1 through 4 confirms 100% compliance across all 77 domain test cases (15 Tier 1, 40 Tier 2, 15 Tier 3, 7 Tier 4).
7. Independent direct inspection of the underlying SQLite tables confirmed that real rows were inserted and verified, proving that test results were neither fabricated nor mocked.

## 3. Caveats
- `T1.F12.3` (Header sign-out UI integration) currently fails because it belongs to Milestone 4 (Storefront UI & Client Flow Integration). Milestone 3 file ownership was strictly limited to backend Pages Functions (`functions/api/[[path]].js`), and this failure is expected at this milestone boundary.
- No caveats regarding Milestone 3 domain APIs, persistent cart, address book, checkout immutability, order history, or tracking.

## 4. Conclusion
Official Verdict: **CLEAN**

The work product genuinely and completely fulfills all Milestone 3 requirements specified in `ORIGINAL_REQUEST.md` and `PROJECT.md`. There are zero integrity violations, no mock stubs or test bypasses, no hardcoded responses, and genuine D1 atomic persistence.

## 5. Verification Method
Run the following commands in the project root:

```bash
# Verify Tier 1 Domain Feature Tests (F9, F10, F11)
node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"

# Verify Tier 2 Domain Boundary Tests (B3 through B10)
node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"

# Verify Tier 3 Cross-Feature Combination Tests
node tests/e2e/runner.mjs --tier=3

# Verify Tier 4 Real-World Workload Journeys
node tests/e2e/runner.mjs --tier=4

# Verify Production Build
npm run build
```
