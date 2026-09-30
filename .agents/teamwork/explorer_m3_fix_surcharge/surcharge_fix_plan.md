# Remediation Plan: Negative Freight Surcharge Price Tampering Vulnerability

**Target File**: `functions/api/[[path]].js` (lines 1636-1637)  
**Vulnerability Type**: API Boundary Validation Bypass / Price Tampering  
**Severity**: High (permits arbitrary reduction of `total_amount` down to 0 VND)  
**Author**: Explorer M3 Fix Surcharge  
**Date**: 2026-09-29T17:25:00Z  

---

## 1. Vulnerability Root Cause Analysis

### 1.1 The Vulnerable Code
In `functions/api/[[path]].js`, lines 1636-1637:
```javascript
const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
const totalAmount = subtotal + freightSurcharge;
```

### 1.2 Flaw Mechanism
1. While item unit prices are strictly locked from the catalog (`SELECT price FROM products WHERE id = ?`), root `total_amount` is calculated by adding `subtotal` and `freightSurcharge`.
2. The check `typeof body.freight_surcharge === 'number'` only checks JavaScript's primitive type. In JavaScript, negative numbers (`-14500000`, `-0.01`), negative infinity (`-Infinity`), and `NaN` are all of type `'number'`.
3. If an attacker submits a negative value equal to the catalog subtotal (e.g., `freight_surcharge: -subtotal`), the resulting `totalAmount` becomes `0`.
4. Downstream database operations persist this corrupted total:
   - `INSERT INTO orders ... (subtotal, freight_surcharge, total_amount)` stores `freight_surcharge: -subtotal` and `total_amount: 0`.
   - `INSERT INTO shipments ... (shipping_cost)` stores `shipping_cost: -subtotal`.
   - `INSERT INTO order_payments ... (amount)` stores `amount: 0`.
5. An attacker can thus complete checkout and acquire physical goods without payment (0 VND COD / card charge).

---

## 2. Fix Strategy & Validation Rules

### 2.1 Validation Rules for `body.freight_surcharge`
When `body.freight_surcharge !== undefined`:
1. **Type Check**: `typeof body.freight_surcharge === 'number'` (rejects strings like `"free"`, objects `{}`, arrays `[]`, and `null`).
2. **Finiteness Check**: `Number.isFinite(body.freight_surcharge)` (rejects `NaN`, `Infinity`, `-Infinity`).
3. **Non-negativity Check**: `body.freight_surcharge >= 0` (rejects negative numbers `< 0`).
4. **Error Handling**: If any of the above checks fail, immediately abort the transaction and return HTTP 400 Bad Request:
   ```json
   { "error": "freight_surcharge must be a non-negative finite number" }
   ```

### 2.2 Optional / Default Handling
- If `body.freight_surcharge === undefined` (omitted in standard checkout payloads), default `freightSurcharge` to `0`.

### 2.3 Defense-in-Depth Floor Guard
- Enforce `const totalAmount = Math.max(subtotal, subtotal + freightSurcharge);`.
- This ensures mathematically that under no circumstance can `totalAmount` drop below `subtotal`.

---

## 3. Drop-in Replacement Code

### Target: `functions/api/[[path]].js`

#### Exact Location
Lines 1636-1637 in `functions/api/[[path]].js`:

#### Before:
```javascript
        const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
        const totalAmount = subtotal + freightSurcharge;
```

#### After:
```javascript
        if (body.freight_surcharge !== undefined) {
          if (
            typeof body.freight_surcharge !== 'number' ||
            !Number.isFinite(body.freight_surcharge) ||
            body.freight_surcharge < 0
          ) {
            return jsonResponse({ error: 'freight_surcharge must be a non-negative finite number' }, 400);
          }
        }

        const freightSurcharge = typeof body.freight_surcharge === 'number' ? body.freight_surcharge : 0;
        const totalAmount = Math.max(subtotal, subtotal + freightSurcharge);
```

---

## 4. Proposed Regression Test Suite Addition

Add the following boundary test cases to `tests/e2e/tier2_boundary.test.mjs` inside `describe('B7: Price Tampering Defense')`:

```javascript
    test('T2.35b: POST /api/orders with negative freight_surcharge rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Attacker Negative Surcharge',
        customer_email: 'attacker@evil.com',
        customer_phone: '0901234567',
        delivery_address: '1 Hacker St',
        items: [{ product_id: prod.id, quantity: 1 }],
        freight_surcharge: -prod.price
      });

      assert.equal(res.status, 400, 'Negative freight_surcharge must be rejected with 400');
      const data = await res.json();
      assert.equal(data.error, 'freight_surcharge must be a non-negative finite number');
    });

    test('T2.35c: POST /api/orders with non-numeric freight_surcharge rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Attacker String Surcharge',
        customer_email: 'attacker@evil.com',
        customer_phone: '0901234567',
        delivery_address: '1 Hacker St',
        items: [{ product_id: prod.id, quantity: 1 }],
        freight_surcharge: 'free_shipping'
      });

      assert.equal(res.status, 400, 'Non-numeric freight_surcharge must be rejected with 400');
    });

    test('T2.35d: POST /api/orders with valid freight_surcharge calculates correct total_amount', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Valid Surcharge Buyer',
        customer_email: 'buyer@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 Main St',
        items: [{ product_id: prod.id, quantity: 1 }],
        freight_surcharge: 50000
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.order.freight_surcharge, 50000);
      assert.equal(data.order.total_amount, prod.price + 50000);
    });
```

---

## 5. Verification Commands

### 5.1 Direct Node.js In-Memory Verification Command
Run this command from the project root to verify all boundary cases:

```bash
node -e "
import { createTestClient } from './tests/e2e/helpers.mjs';
const client = createTestClient();
const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

async function run() {
  console.log('Testing Negative Surcharge:');
  const res1 = await client.post('/api/orders', {
    customer_name: 'Attacker',
    customer_email: 'attacker@evil.com',
    customer_phone: '0901234567',
    delivery_address: '1 Hacker St',
    items: [{ product_id: prod.id, quantity: 1 }],
    freight_surcharge: -prod.price
  });
  console.log('  Status (expected 400):', res1.status);
  const data1 = await res1.json();
  console.log('  Error response:', data1.error);

  console.log('Testing Non-numeric Surcharge:');
  const res2 = await client.post('/api/orders', {
    customer_name: 'Attacker',
    customer_email: 'attacker@evil.com',
    customer_phone: '0901234567',
    delivery_address: '1 Hacker St',
    items: [{ product_id: prod.id, quantity: 1 }],
    freight_surcharge: 'invalid'
  });
  console.log('  Status (expected 400):', res2.status);

  console.log('Testing Valid Surcharge (50,000 VND):');
  const res3 = await client.post('/api/orders', {
    customer_name: 'Legit',
    customer_email: 'legit@example.com',
    customer_phone: '0901234567',
    delivery_address: '123 St',
    items: [{ product_id: prod.id, quantity: 1 }],
    freight_surcharge: 50000
  });
  const data3 = await res3.json();
  console.log('  Status (expected 200):', res3.status);
  console.log('  Subtotal:', data3.order.subtotal);
  console.log('  Freight Surcharge:', data3.order.freight_surcharge);
  console.log('  Total Amount:', data3.order.total_amount);
  console.log('  Total Match:', data3.order.total_amount === data3.order.subtotal + 50000);
}
run();"
```

### 5.2 Live Curl Verification Command (Dev Server)
```bash
# 1. Negative surcharge attack attempt (Must return HTTP 400 Bad Request)
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST http://localhost:8788/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Attacker Negative Surcharge",
    "customer_email": "attacker@evil.com",
    "customer_phone": "0901234567",
    "delivery_address": "1 Hacker St",
    "items": [{"product_id": "prod_1", "quantity": 1}],
    "freight_surcharge": -14500000
  }'

# 2. Valid bulky freight surcharge (Must return HTTP 200 OK with correct total)
curl -s -w "\nHTTP Status: %{http_code}\n" -X POST http://localhost:8788/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "Legit Buyer",
    "customer_email": "buyer@example.com",
    "customer_phone": "0901234567",
    "delivery_address": "123 Main St",
    "items": [{"product_id": "prod_1", "quantity": 1}],
    "freight_surcharge": 50000
  }'
```

### 5.3 Test Suite Regression Command
```bash
node tests/e2e/runner.mjs --tier=2 --grep="B6|B7"
node tests/e2e/runner.mjs --tier=3
```
Both test suites must pass 100%.
