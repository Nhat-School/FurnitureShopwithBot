# Test Addition Plan: Suite B7 Price Tampering Defense (T2.35b)

## 1. Context & Motivation

### Background
During Milestone 3 empirical validation, Challenger 1 discovered an adversarial vulnerability in `POST /api/orders` (`functions/api/[[path]].js`, lines 1636-1637):
```javascript
const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
const totalAmount = subtotal + freightSurcharge;
```
Because the server performed no lower-bound validation on `freight_surcharge`, any negative numeric input (e.g. `freight_surcharge: -100000` or `freight_surcharge: -subtotal`) was accepted and added directly to `subtotal`. This allowed malicious clients to arbitrary discount orders or reduce the required payment amount down to 0 VND, bypassing the price integrity safeguards.

### Current Test Suite Gap
Suite `B7: Price Tampering Defense` in `tests/e2e/tier2_boundary.test.mjs` thoroughly tested unit price spoofing (`price: 1`, `unit_price: 0`), client `total_amount` recalculation, and catalog price shifts after checkout (`T2.31`-`T2.35`). However, `freight_surcharge` was never tested against negative boundary values.

Adding `T2.35b` to Suite B7 ensures permanent automated protection and prevents regression across future changes.

---

## 2. Test Case Specification

| Field | Value |
|---|---|
| **Test Identifier** | `T2.35b` |
| **Test Title** | `T2.35b: Client-sent negative freight_surcharge is rejected with 400 Bad Request` |
| **Target File** | `tests/e2e/tier2_boundary.test.mjs` |
| **Suite** | `[Tier 2] B7: Price Tampering Defense` |
| **Placement** | Directly after `T2.35` (around line 459), before Suite `B8` |
| **HTTP Target** | `POST /api/orders` |
| **Payload** | Valid customer name, email, phone, address, 1 valid product item, with `freight_surcharge: -100000` |
| **Expected HTTP Status** | `400 Bad Request` |
| **Expected Behavior** | Request is rejected; no order or payment record is written to D1 |

---

## 3. Exact Code Formulation

### Test Code Snippet
```javascript
    test('T2.35b: Client-sent negative freight_surcharge is rejected with 400 Bad Request', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Attacker Negative Surcharge',
        customer_email: 'attacker_surcharge@example.com',
        customer_phone: '0901234567',
        delivery_address: '1 Hacker St',
        items: [{ product_id: prod.id, quantity: 1 }],
        freight_surcharge: -100000
      });

      assert.equal(res.status, 400, 'Negative freight_surcharge must be rejected with 400 Bad Request');
      const data = await res.json();
      assert.ok(data.error, 'Response must return error message explaining rejection');

      // Verify no order was persisted in the database
      const orderCount = client.db.prepare("SELECT COUNT(*) as count FROM orders WHERE customer_email = 'attacker_surcharge@example.com'").get();
      assert.equal(orderCount.count, 0, 'No order should be created when freight_surcharge is negative');
    });
```

### Contextual Diff in `tests/e2e/tier2_boundary.test.mjs`

```diff
@@ -362,7 +362,7 @@ describe('Tier 2: Boundary & Error Conditions', () => {
   // --------------------------------------------------------------------------
-  // B7: Price Tampering Defense (5 tests)
+  // B7: Price Tampering Defense (6 tests)
   // --------------------------------------------------------------------------
   describe('B7: Price Tampering Defense', () => {
     test('T2.31: Client-sent item price is ignored; server locks D1 catalog price', async () => {
     ...
     test('T2.35: Order unit_price remains locked when catalog product price drops to zero or is archived', async () => {
       const client = createTestClient();
       const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
       const initialPrice = prod.price;

       const res = await client.post('/api/orders', {
         customer_name: 'Drop Buyer',
         customer_email: 'drop@example.com',
         customer_phone: '0901234567',
         delivery_address: 'Drop St',
         items: [{ product_id: prod.id, quantity: 1 }]
       });
       const orderId = (await res.json()).order.id;

       // Product price dropped to 0 or deactivated
       client.db.prepare('UPDATE products SET price = 0, stock = 0 WHERE id = ?').run(prod.id);

       const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
       assert.equal(oi.unit_price, initialPrice, 'Historical item price must remain immutable');
     });
+
+    test('T2.35b: Client-sent negative freight_surcharge is rejected with 400 Bad Request', async () => {
+      const client = createTestClient();
+      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
+
+      const res = await client.post('/api/orders', {
+        customer_name: 'Attacker Negative Surcharge',
+        customer_email: 'attacker_surcharge@example.com',
+        customer_phone: '0901234567',
+        delivery_address: '1 Hacker St',
+        items: [{ product_id: prod.id, quantity: 1 }],
+        freight_surcharge: -100000
+      });
+
+      assert.equal(res.status, 400, 'Negative freight_surcharge must be rejected with 400 Bad Request');
+      const data = await res.json();
+      assert.ok(data.error, 'Response must return error message explaining rejection');
+
+      // Verify no order was persisted in the database
+      const orderCount = client.db.prepare("SELECT COUNT(*) as count FROM orders WHERE customer_email = 'attacker_surcharge@example.com'").get();
+      assert.equal(orderCount.count, 0, 'No order should be created when freight_surcharge is negative');
+    });
   });
```

---

## 4. Complementary Backend Fix Reference

For `T2.35b` to pass, `functions/api/[[path]].js` at line 1636 must validate `freight_surcharge`:

```javascript
        if (typeof body.freight_surcharge === 'number' && (body.freight_surcharge < 0 || !Number.isFinite(body.freight_surcharge))) {
          return jsonResponse({ error: 'freight_surcharge must be a non-negative finite number' }, 400);
        }
        const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
```

---

## 5. Verification Instructions

The test runner can be executed under various filters to verify this test addition:

### 1. Run Only the New Test Case
```bash
node tests/e2e/runner.mjs --tier=2 --grep="T2.35b"
```
- **Unpatched Code Behavior**: Fails with assertion error (received 200, expected 400).
- **Patched Code Behavior**: Passes with `✓ T2.35b: Client-sent negative freight_surcharge is rejected with 400 Bad Request`.

### 2. Run Entire Suite B7 (Price Tampering Defense)
```bash
node tests/e2e/runner.mjs --tier=2 --grep="B7"
```
- Expected total tests in Suite B7: **6 tests** (`T2.31`, `T2.32`, `T2.33`, `T2.34`, `T2.35`, `T2.35b`).
- All 6 tests must pass (100% pass rate).

### 3. Run Full Tier 2 Boundary Suite
```bash
node tests/e2e/runner.mjs --tier=2
```
- Expected total tests in Tier 2: **66 tests** (previously 65).
- All 66 tests must pass (100% pass rate).

### 4. Run Full E2E Test Suite (Tiers 1 through 4)
```bash
node tests/e2e/runner.mjs
```
- All tiers execute and achieve 100% pass rate.
