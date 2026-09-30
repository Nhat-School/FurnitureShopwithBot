import assert from 'node:assert/strict';
import {
  createTestClient,
  setupTestDatabase,
  signSessionToken,
  DEFAULT_SESSION_SECRET
} from './e2e/helpers.mjs';

/**
 * Empirical Challenger M3 (Remediation Iteration 4) Stress Test Suite
 * Parameter Boundary Defense & Real-World Workflow Verification
 */

async function runEmpiricalBoundariesSuite() {
  console.log('\n================================================================');
  console.log(' STARTING EMPIRICAL CHALLENGER STRESS TESTS (BOUNDARY & DEFENSE) ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function runTest(name, fn) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      passed++;
      console.log('✓ PASS');
    } catch (err) {
      failed++;
      console.log('✗ FAIL');
      console.error(`  Error: ${err.message}`);
      failures.push({ name, error: err });
    }
  }

  // Setup database
  const { db, mockD1 } = setupTestDatabase();
  const prod = db.prepare('SELECT id, name, price FROM products LIMIT 1').get();
  assert.ok(prod, 'At least one product must exist in database');

  const validBasePayload = {
    customer_name: 'Test Customer',
    customer_phone: '0901234567',
    customer_email: 'test@example.com',
    delivery_address: '123 Test St, Ward 1, District 1, HCM',
    items: [{ product_id: prod.id, quantity: 2 }]
  };

  // --------------------------------------------------------------------------
  // TEST SUITE 1: `notes` PARAMETER BOUNDARY DEFENSE
  // --------------------------------------------------------------------------
  await runTest('notes: { hack: 1 } (object) returns 400 Bad Request, not 500 crash', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: { hack: 1 }
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error && /notes/i.test(data.error), `Expected notes error message, got: ${JSON.stringify(data)}`);
  });

  await runTest('notes: ["a", "b"] (array) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: ['malicious', 'array']
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('notes: 12345 (number) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: 12345
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('notes: false (boolean) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: false
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('notes: null is accepted and sets notes to null', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: null
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.order.notes, null);
  });

  await runTest('notes: "  Please call before delivery  " trims and persists valid string', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      notes: '  Please call before delivery  '
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.order.notes, 'Please call before delivery');
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 2: `payment_method` PARAMETER BOUNDARY DEFENSE
  // --------------------------------------------------------------------------
  await runTest('payment_method: "hacked" returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      payment_method: 'hacked'
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error && /payment method/i.test(data.error), `Expected payment method error, got: ${JSON.stringify(data)}`);
  });

  await runTest('payment_method: { attack: true } (object) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      payment_method: { attack: true }
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('payment_method: 999 (number) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      payment_method: 999
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('payment_method: "crypto" / "paypal" (unsupported methods) returns 400', async () => {
    const client = createTestClient({ db, mockD1 });
    const res1 = await client.post('/api/orders', { ...validBasePayload, payment_method: 'crypto' });
    const res2 = await client.post('/api/orders', { ...validBasePayload, payment_method: 'paypal' });
    assert.equal(res1.status, 400);
    assert.equal(res2.status, 400);
  });

  await runTest('payment_method: "COD" / "  bank_transfer  " (case/whitespace tolerance) is accepted', async () => {
    const client = createTestClient({ db, mockD1 });
    const res1 = await client.post('/api/orders', { ...validBasePayload, payment_method: 'COD' });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.order.payment_method, 'cod');
    assert.equal(data1.order.payment.payment_method, 'cod');

    const res2 = await client.post('/api/orders', { ...validBasePayload, payment_method: '  bank_transfer  ' });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.order.payment_method, 'bank_transfer');
    assert.equal(data2.order.payment.payment_method, 'bank_transfer');
  });

  await runTest('payment_method: null or omitted defaults safely to "cod"', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', { ...validBasePayload, payment_method: null });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.order.payment_method, 'cod');
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 3: `floor_number` PARAMETER BOUNDARY DEFENSE
  // --------------------------------------------------------------------------
  await runTest('floor_number: -5 (negative integer) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: -5
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error && /floor_number/i.test(data.error), `Expected floor_number error, got: ${JSON.stringify(data)}`);
  });

  await runTest('floor_number: 2.5 (floating point) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: 2.5
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
    const data = await res.json();
    assert.ok(data.error && /floor_number/i.test(data.error), `Expected floor_number error, got: ${JSON.stringify(data)}`);
  });

  await runTest('floor_number: "3" (string formatted number) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: "3"
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('floor_number: { floor: 2 } (object) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: { floor: 2 }
    });
    assert.equal(res.status, 400, `Expected 400, got ${res.status}`);
  });

  await runTest('floor_number: 0 (ground floor) is valid non-negative integer and returns 200', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: 0
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.order.floor_number, 0);
  });

  await runTest('floor_number: 15 (upper floor) is accepted and stored correctly', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: 15
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.order.floor_number, 15);
  });

  await runTest('floor_number: null or omitted defaults safely to 1', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      floor_number: null
    });
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert.equal(data.order.floor_number, 1);
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 4: ADDITIONAL BOUNDARY DEFENSES (`freight_surcharge`, `has_freight_elevator`)
  // --------------------------------------------------------------------------
  await runTest('freight_surcharge: -20 returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      freight_surcharge: -20
    });
    assert.equal(res.status, 400);
  });

  await runTest('freight_surcharge: "20" (string) returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const res = await client.post('/api/orders', {
      ...validBasePayload,
      freight_surcharge: "20"
    });
    assert.equal(res.status, 400);
  });

  await runTest('has_freight_elevator: 0, false, "0" normalizes to 0 (no elevator)', async () => {
    const client = createTestClient({ db, mockD1 });
    const res1 = await client.post('/api/orders', { ...validBasePayload, has_freight_elevator: 0 });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.order.has_freight_elevator, 0);

    const res2 = await client.post('/api/orders', { ...validBasePayload, has_freight_elevator: false });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.order.has_freight_elevator, 0);
  });

  await runTest('has_freight_elevator: 1, true, "1" normalizes to 1 (has elevator)', async () => {
    const client = createTestClient({ db, mockD1 });
    const res1 = await client.post('/api/orders', { ...validBasePayload, has_freight_elevator: 1 });
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.order.has_freight_elevator, 1);

    const res2 = await client.post('/api/orders', { ...validBasePayload, has_freight_elevator: true });
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.order.has_freight_elevator, 1);
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 5: COMPREHENSIVE REAL-WORLD WORKFLOW WITH DEFENSIVE BOUNDARIES
  // --------------------------------------------------------------------------
  await runTest('End-to-End Workflow: Auth Customer places order with defensive parameters & audits persistence', async () => {
    const client = createTestClient({ db, mockD1 });
    client.withSession({ id: 'remed_user_1', email: 'remed1@example.com', display_name: 'Remed Customer' });

    // Step 1: Add item to cart
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 3 });
    assert.equal(addRes.status, 200);

    // Step 2: Verify cart contains item
    const cartRes = await client.get('/api/cart');
    const cart = await cartRes.json();
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 3);

    // Step 3: Checkout with defensive parameters: floor_number=7, has_freight_elevator=0, payment_method='credit_card', notes='Leave at door'
    const checkoutRes = await client.post('/api/orders', {
      customer_name: 'Remed Customer',
      customer_phone: '0987654321',
      delivery_address: 'Room 702, Highrise Tower, Ward 5, District 7, HCM',
      floor_number: 7,
      has_freight_elevator: 0,
      freight_surcharge: 70000,
      payment_method: 'credit_card',
      notes: 'Leave at door',
      items: [{ product_id: prod.id, quantity: 3 }]
    });
    assert.equal(checkoutRes.status, 200);
    const orderData = await checkoutRes.json();
    const order = orderData.order;
    assert.equal(order.floor_number, 7);
    assert.equal(order.has_freight_elevator, 0);
    assert.equal(order.payment_method, 'credit_card');
    assert.equal(order.notes, 'Leave at door');
    assert.equal(order.freight_surcharge, 70000);
    assert.equal(order.total_amount, (prod.price * 3) + 70000);
    const trackingCode = order.tracking_code;

    // Step 4: Verify cart is automatically cleared upon checkout
    const cartAfter = await (await client.get('/api/cart')).json();
    assert.equal(cartAfter.items.length, 0, 'Cart must be cleared after checkout');

    // Step 5: Verify customer order history reflects the exact parameters
    const ordersHistoryRes = await client.get('/api/customer/orders');
    assert.equal(ordersHistoryRes.status, 200);
    const historyData = await ordersHistoryRes.json();
    const matchedOrder = historyData.orders.find(o => o.id === order.id);
    assert.ok(matchedOrder, 'Placed order must appear in customer order history');
    assert.equal(matchedOrder.floor_number, 7);
    assert.equal(matchedOrder.has_freight_elevator, 0);
    assert.equal(matchedOrder.payment_method, 'credit_card');
    assert.equal(matchedOrder.notes, 'Leave at door');
    assert.equal(matchedOrder.freight_surcharge, 70000);

    // Step 6: Verify public order tracking endpoint
    const trackingRes = await client.get(`/api/orders/${trackingCode}`);
    assert.equal(trackingRes.status, 200);
    const trackingData = await trackingRes.json();
    assert.equal(trackingData.tracking_code, trackingCode);
    assert.equal(trackingData.order_id, order.id);
    assert.equal(trackingData.carrier, 'ABC Bulky Logistics');
    assert.equal(trackingData.shipping_status, 'pending');
  });

  console.log('\n================================================================');
  console.log(`  STRESS TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalBoundariesSuite().catch(err => {
  console.error('Test suite failed catastrophically:', err);
  process.exit(1);
});
