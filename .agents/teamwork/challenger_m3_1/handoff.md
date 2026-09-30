# Milestone 3 Empirical Challenger Report: Price Immutability & Checkout Boundary Defenses

## 1. Observation

### Boundary Test Suite Execution (Tier 2 B6 & B7)
Command executed:
```bash
node tests/e2e/runner.mjs --tier=2 --grep="B6|B7"
```
Output:
```
══════════════════════════════════════════════════════════════════
   Furproject E2E Test Suite Runner (Node.js Native Harness)      
══════════════════════════════════════════════════════════════════
▶ [Tier 2] B6: Malformed Order Payloads & Data Types
  ✓ T2.26: POST /api/orders with item quantity <= 0 rejected with 400 (12.6ms)
  ✓ T2.27: POST /api/orders with non-integer quantity (1.5) rejected with 400 (1.1ms)
  ✓ T2.28: POST /api/orders referencing non-existent product ID rejected with 400 or 404 (1.0ms)
  ✓ T2.29: POST /api/orders with empty JSON body rejected with 400 (0.9ms)
  ✓ T2.30: POST /api/orders with invalid JSON string syntax returns 400 (0.8ms)

▶ [Tier 2] B7: Price Tampering Defense
  ✓ T2.31: Client-sent item price is ignored; server locks D1 catalog price (1.5ms)
  ✓ T2.32: Client-sent unit_price = 0 is strictly overridden by catalog price (0.9ms)
  ✓ T2.33: Client-sent total_amount is recalculated and overridden by server (0.9ms)
  ✓ T2.34: Order unit_price remains locked when catalog price increases right after checkout (0.9ms)
  ✓ T2.35: Order unit_price remains locked when catalog product price drops to zero or is archived (0.9ms)

══════════════════════════════════════════════════════════════════
Grand Total                                     10     10      0   100.0%    21.9ms
══════════════════════════════════════════════════════════════════
 PASS  All 10 test cases passed successfully in 21.9ms!
```

### Cross-Feature Test Suite Execution (Tier 3)
Command executed:
```bash
node tests/e2e/runner.mjs --tier=3
```
Output:
```
══════════════════════════════════════════════════════════════════
   Furproject E2E Test Suite Runner (Node.js Native Harness)      
══════════════════════════════════════════════════════════════════
▶ [Tier 3] Tier 3: Cross-Feature Combinations
  ✓ T3.1: Full Auth -> Cart -> Checkout -> Historical Price Lock (14.3ms)
  ✓ T3.2: Price Increase While Item In Cart updates active cart price and locks higher price at checkout (2.1ms)
  ✓ T3.3: Price Decrease While Item In Cart locks sale price; subsequent price increase preserves sale price (6.5ms)
  ✓ T3.4: Address Switch and Order Snapshot locks address at checkout regardless of future address edits (3.0ms)
  ✓ T3.5: Multiple Address Default Precedence sets new default and unsets prior defaults in address book (1.6ms)
  ✓ T3.6: Multi-Item Cart Checkout Purge creates all order lines and completely empties cart (2.0ms)
  ✓ T3.7: Cart Continuity Across Re-Authentication preserves items in persistent D1 cart (1.5ms)
  ✓ T3.8: Order Creation Produces exactly 1:1 Shipment and 1:1 Payment matching totals (0.8ms)
  ✓ T3.9: Cart Isolation Between Concurrent Users ensures checkout by User A leaves User B cart intact (1.7ms)
  ✓ T3.10: Order History Isolation Between Users prevents cross-tenant visibility (1.8ms)
  ✓ T3.11: Chronological Order History Sorting returns newest orders first (1.5ms)
  ✓ T3.12: Immediate Session Revocation on Logout denies subsequent cart operations (1.0ms)
  ✓ T3.13: Google OAuth Account Profile Synchronization preserves existing carts and addresses (0.7ms)
  ✓ T3.14: Product Soft-Delete Does Not Break Historical Orders in database or customer order history (3.0ms)
  ✓ T3.15: Multi-Revision Price Immutability Cascade verifies 3 consecutive price shifts retain discrete frozen prices (1.4ms)

══════════════════════════════════════════════════════════════════
Grand Total                                     15     15      0   100.0%    43.4ms
══════════════════════════════════════════════════════════════════
 PASS  All 15 test cases passed successfully in 43.4ms!
```

### Empirical Discovery: Negative Freight Surcharge Price Tampering Bypass
In `functions/api/[[path]].js`, lines 1636-1637:
```javascript
const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
const totalAmount = subtotal + freightSurcharge;
```
Empirical test executed:
```bash
node -e "
import { createTestClient } from './tests/e2e/helpers.mjs';
const client = createTestClient();
const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
client.post('/api/orders', {
  customer_name: 'Attacker Negative Surcharge',
  customer_email: 'attacker@evil.com',
  customer_phone: '0901234567',
  delivery_address: '1 Hacker St',
  items: [{ product_id: prod.id, quantity: 1 }],
  freight_surcharge: -prod.price
}).then(async res => {
  const data = await res.json();
  const paymentRow = client.db.prepare('SELECT * FROM order_payments WHERE order_id = ?').get(data.order.id);
  const orderRow = client.db.prepare('SELECT * FROM orders WHERE id = ?').get(data.order.id);
  console.log('Order total_amount:', orderRow.total_amount);
  console.log('Payment amount:', paymentRow.amount);
});"
```
Observed Output:
```
Order total_amount: 0
Payment amount: 0
```

---

## 2. Logic Chain

1. **Unit Price Immutability Invariant**:
   - `functions/api/[[path]].js` (lines 1616-1632) queries `products.price` directly from D1 during order placement and writes it to `order_items.unit_price`.
   - Client-provided `price` or `unit_price` inside `items: [{ ... }]` is never read by the insertion routine.
   - Subsequent queries in `GET /api/customer/orders` (lines 1503-1517) select `oi.unit_price` from `order_items` rather than joining `products.price`.
   - Stress testing verified across multiple price shifts and soft-deletion that:
   ```
   d/dt(order_items.unit_price) = 0
   ```
   Unit price immutability is strictly satisfied.

2. **Checkout Boundary Defenses & Total Amount Tampering**:
   - Although client-supplied root `total_amount` is overridden by server calculation (`subtotal + freightSurcharge`), the server accepts unvalidated `freight_surcharge` from the request body.
   - Because `typeof -14500000 === 'number'`, any negative numeric value is accepted.
   - `totalAmount = subtotal + freightSurcharge` results in `totalAmount = 0` when `freight_surcharge = -subtotal`.
   - The resulting `orders.total_amount` is 0, and `order_payments.amount` is 0, allowing an attacker to place an order for zero payment.
   - Therefore, checkout boundary defense against price tampering fails on the shipping surcharge vector.

---

## 3. Caveats

- Unit price immutability itself (`order_items.unit_price`) is not corrupted by this exploit; only `total_amount`, `freight_surcharge`, and `order_payments.amount` are compromised.
- Storefront UI currently does not send negative freight surcharges; the attack vector is an API-level boundary flaw that can be exploited by any direct HTTP client or browser console call.
- Stock reservation is not currently decremented at checkout, but this is consistent with Milestone 3 specification scope.

---

## 4. Conclusion

**Verdict: REQUEST_CHANGES**

While unit price immutability (`d/dt(unit_price) = 0`) and basic malformed payload validations pass cleanly, the checkout boundary defenses fail against negative `freight_surcharge` input, permitting full order total tampering down to 0 VND.

### Required Changes:
1. In `functions/api/[[path]].js` (around line 1636), reject negative or non-finite `freight_surcharge` with 400 Bad Request, or clamp it:
   ```javascript
   if (typeof body.freight_surcharge === 'number' && (body.freight_surcharge < 0 || !Number.isFinite(body.freight_surcharge))) {
     return jsonResponse({ error: 'freight_surcharge must be a non-negative finite number' }, 400);
   }
   const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
   ```
2. Add a boundary test case in `tests/e2e/tier2_boundary.test.mjs` verifying that `POST /api/orders` with negative `freight_surcharge` is rejected with 400 (or prevented from reducing total amount below subtotal).

---

## 5. Verification Method

### Command to reproduce the vulnerability:
```bash
node -e "
import { createTestClient } from './tests/e2e/helpers.mjs';
const client = createTestClient();
const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
client.post('/api/orders', {
  customer_name: 'Attacker Negative Surcharge',
  customer_email: 'attacker@evil.com',
  customer_phone: '0901234567',
  delivery_address: '1 Hacker St',
  items: [{ product_id: prod.id, quantity: 1 }],
  freight_surcharge: -prod.price
}).then(async res => {
  const data = await res.json();
  const paymentRow = client.db.prepare('SELECT * FROM order_payments WHERE order_id = ?').get(data.order.id);
  console.log('Status:', res.status, 'Total:', data.order.total_amount, 'Payment:', paymentRow.amount);
});"
```
**Invalidation Condition**: The vulnerability is resolved when the above command returns `Status: 400` (or `Total: 14500000` with non-negative freight), rejecting negative freight surcharge inputs.

### Standard Test Commands:
```bash
node tests/e2e/runner.mjs --tier=2 --grep="B6|B7"
node tests/e2e/runner.mjs --tier=3
```
Both test suites should continue to achieve 100% pass rate.
