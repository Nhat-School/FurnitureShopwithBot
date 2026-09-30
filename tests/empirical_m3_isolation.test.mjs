import assert from 'node:assert/strict';
import {
  createTestClient,
  setupTestDatabase,
  signSessionToken,
  DEFAULT_SESSION_SECRET
} from './e2e/helpers.mjs';

/**
 * Empirical Challenger M3-2 Stress Test Suite
 * Cross-Tenant Data Isolation & Real-World Workflow Verification
 */

async function runEmpiricalStressSuite() {
  console.log('\n=============================================================');
  console.log('  STARTING EMPIRICAL CHALLENGER STRESS TESTS (CROSS-TENANT)   ');
  console.log('=============================================================\n');

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

  // Common shared database setup for cross-tenant tests
  const { db, mockD1 } = setupTestDatabase();
  const prod1 = db.prepare('SELECT id, name, price FROM products LIMIT 1').get();
  const prod2 = db.prepare('SELECT id, name, price FROM products LIMIT 1 OFFSET 1').get();
  const prod3 = db.prepare('SELECT id, name, price FROM products LIMIT 1 OFFSET 2').get();

  // --------------------------------------------------------------------------
  // TEST SUITE 1: CART ISOLATION & IDOR DEFENSE
  // --------------------------------------------------------------------------
  await runTest('User A and User B maintain completely isolated carts with same products', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const clientB = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    // User A adds 2 units of Prod 1
    const addA = await clientA.post('/api/cart/items', { product_id: prod1.id, quantity: 2 });
    assert.equal(addA.status, 200);

    // User B adds 7 units of Prod 1
    const addB = await clientB.post('/api/cart/items', { product_id: prod1.id, quantity: 7 });
    assert.equal(addB.status, 200);

    // Check User A cart
    const cartA = await (await clientA.get('/api/cart')).json();
    assert.equal(cartA.items.length, 1);
    assert.equal(cartA.items[0].product_id, prod1.id);
    assert.equal(cartA.items[0].quantity, 2);

    // Check User B cart
    const cartB = await (await clientB.get('/api/cart')).json();
    assert.equal(cartB.items.length, 1);
    assert.equal(cartB.items[0].product_id, prod1.id);
    assert.equal(cartB.items[0].quantity, 7);

    // Assert cart item IDs are distinct
    assert.notEqual(cartA.items[0].id, cartB.items[0].id);
  });

  await runTest('User B cannot modify User A cart item (IDOR attempt via PUT /api/cart/items/:id)', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const clientB = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const cartA = await (await clientA.get('/api/cart')).json();
    const itemAId = cartA.items[0].id;

    // User B attempts to tamper with User A's item
    const putRes = await clientB.put(`/api/cart/items/${itemAId}`, { quantity: 999 });
    assert.equal(putRes.status, 403, 'Cross-tenant PUT must return 403 Forbidden');

    // Verify User A cart item remains 2
    const cartACheck = await (await clientA.get('/api/cart')).json();
    assert.equal(cartACheck.items[0].quantity, 2, 'User A cart item quantity must not be altered');
  });

  await runTest('User B cannot delete User A cart item (IDOR attempt via DELETE /api/cart/items/:id)', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const clientB = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const cartA = await (await clientA.get('/api/cart')).json();
    const itemAId = cartA.items[0].id;

    // User B attempts to delete User A's item
    const delRes = await clientB.delete(`/api/cart/items/${itemAId}`);
    assert.equal(delRes.status, 403, 'Cross-tenant DELETE must return 403 Forbidden');

    // Verify User A cart item still exists
    const cartACheck = await (await clientA.get('/api/cart')).json();
    assert.equal(cartACheck.items.length, 1);
    assert.equal(cartACheck.items[0].id, itemAId);
  });

  await runTest('User B clearing cart (DELETE /api/cart) only clears User B cart, leaving User A unaffected', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const clientB = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    // User B clears cart
    const clearB = await clientB.delete('/api/cart');
    assert.equal(clearB.status, 200);

    // Verify B is empty
    const cartB = await (await clientB.get('/api/cart')).json();
    assert.equal(cartB.items.length, 0);

    // Verify A still has items
    const cartA = await (await clientA.get('/api/cart')).json();
    assert.equal(cartA.items.length, 1);
    assert.equal(cartA.items[0].quantity, 2);
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 2: ADDRESS BOOK ISOLATION & TAMPER DEFENSE
  // --------------------------------------------------------------------------
  let addrAId = null;
  let addrBId = null;

  await runTest('User A and User B save addresses with complete tenant isolation', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const clientB = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const resA = await clientA.post('/api/customer/addresses', {
      recipient_name: 'Alice Smith',
      phone: '0901111111',
      street: '100 Alice Road',
      district: 'D1',
      city_province: 'HCMC',
      is_default: 1
    });
    assert.equal(resA.status, 200);
    addrAId = (await resA.json()).address.id;

    const resB = await clientB.post('/api/customer/addresses', {
      recipient_name: 'Bob Jones',
      phone: '0902222222',
      street: '200 Bob Lane',
      district: 'D2',
      city_province: 'HCMC',
      is_default: 1
    });
    assert.equal(resB.status, 200);
    addrBId = (await resB.json()).address.id;

    // Verify Alice addresses only list Alice's address
    const listA = (await (await clientA.get('/api/customer/addresses')).json()).addresses;
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, addrAId);
    assert.equal(listA[0].is_default, 1);

    // Verify Bob addresses only list Bob's address
    const listB = (await (await clientB.get('/api/customer/addresses')).json()).addresses;
    assert.equal(listB.length, 1);
    assert.equal(listB[0].id, addrBId);
    assert.equal(listB[0].is_default, 1);
  });

  await runTest('User B cannot modify User A address (IDOR via PUT /api/customer/addresses/:id)', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const putRes = await clientB.put(`/api/customer/addresses/${addrAId}`, {
      recipient_name: 'Hacked By Bob',
      street: 'Malicious Address'
    });
    assert.equal(putRes.status, 403, 'Cross-tenant address modification must return 403 Forbidden');

    // Verify User A address was not modified
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const listA = (await (await clientA.get('/api/customer/addresses')).json()).addresses;
    assert.equal(listA[0].recipient_name, 'Alice Smith');
    assert.equal(listA[0].street, '100 Alice Road');
  });

  await runTest('User B cannot set User A address as default (PUT /api/customer/addresses/:id/default)', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const putRes = await clientB.put(`/api/customer/addresses/${addrAId}/default`, {});
    assert.equal(putRes.status, 403, 'Cross-tenant set default must return 403 Forbidden');
  });

  await runTest('User B cannot delete User A address (DELETE /api/customer/addresses/:id)', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const delRes = await clientB.delete(`/api/customer/addresses/${addrAId}`);
    assert.equal(delRes.status, 403, 'Cross-tenant delete address must return 403 Forbidden');

    // Verify User A address still exists
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const listA = (await (await clientA.get('/api/customer/addresses')).json()).addresses;
    assert.equal(listA.length, 1);
    assert.equal(listA[0].id, addrAId);
  });

  await runTest('Injecting foreign user_id in POST /api/customer/addresses is strictly ignored', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    // Bob tries to create address for Alice
    const res = await clientB.post('/api/customer/addresses', {
      user_id: 'tenant_user_a', // Spoofed user_id
      recipient_name: 'Spoofed Address',
      phone: '0909999999',
      street: 'Spoofed Street',
      district: 'D1',
      city_province: 'HCMC'
    });
    assert.equal(res.status, 200);
    const createdAddr = (await res.json()).address;
    assert.equal(createdAddr.user_id, 'tenant_user_b', 'Address must be assigned to authenticated session user_id');

    // Verify Alice does NOT have this address
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const listA = (await (await clientA.get('/api/customer/addresses')).json()).addresses;
    assert.equal(listA.length, 1);
    assert.equal(listA[0].recipient_name, 'Alice Smith');
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 3: ORDER CREATION, SPOOFING DEFENSE & HISTORY ISOLATION
  // --------------------------------------------------------------------------
  let orderAId = null;
  let orderATracking = null;

  await runTest('User A checkout creates order with customer_id bound strictly to User A', async () => {
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });

    const orderRes = await clientA.post('/api/orders', {
      customer_name: 'Alice Smith',
      customer_email: 'alice@example.com',
      customer_phone: '0901111111',
      delivery_address: '100 Alice Road, D1, HCMC',
      items: [{ product_id: prod1.id, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200);
    const orderData = (await orderRes.json()).order;
    assert.ok(orderData?.id);
    assert.equal(orderData.customer_id, 'tenant_user_a');
    orderAId = orderData.id;
    orderATracking = orderData.tracking_code;

    // Check that User A cart was automatically cleared by checkout
    const cartA = await (await clientA.get('/api/cart')).json();
    assert.equal(cartA.items.length, 0, 'User A cart must be emptied after User A checkout');
  });

  await runTest('User B attempting to spoof customer_id = User A in POST /api/orders is bound to User B', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    // Bob sends customer_id of Alice in payload
    const orderRes = await clientB.post('/api/orders', {
      customer_id: 'tenant_user_a', // Spoofed
      customer_name: 'Bob Jones',
      customer_email: 'bob@example.com',
      customer_phone: '0902222222',
      delivery_address: '200 Bob Lane, D2, HCMC',
      items: [{ product_id: prod2.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200);
    const orderData = (await orderRes.json()).order;
    assert.equal(orderData.customer_id, 'tenant_user_b', 'Server must ignore body.customer_id and use session.id');

    // Verify Alice cannot see Bob order in her history
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const ordersA = (await (await clientA.get('/api/customer/orders')).json()).orders;
    assert.equal(ordersA.length, 1);
    assert.equal(ordersA[0].id, orderAId);
    assert.equal(ordersA[0].customer_id, 'tenant_user_a');
  });

  await runTest('Guest checkout has null customer_id and is not visible in any user history', async () => {
    const guestClient = createTestClient({ db, mockD1 });
    const guestOrderRes = await guestClient.post('/api/orders', {
      customer_name: 'Guest Shopper',
      customer_email: 'guest@example.com',
      customer_phone: '0903333333',
      delivery_address: 'Guest Hotel, D3, HCMC',
      items: [{ product_id: prod1.id, quantity: 1 }]
    });
    assert.equal(guestOrderRes.status, 200);
    const guestOrder = (await guestOrderRes.json()).order;
    assert.equal(guestOrder.customer_id, null);

    // Verify neither User A nor User B see this guest order
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const ordersA = (await (await clientA.get('/api/customer/orders')).json()).orders;
    assert.ok(ordersA.every(o => o.id !== guestOrder.id));

    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });
    const ordersB = (await (await clientB.get('/api/customer/orders')).json()).orders;
    assert.ok(ordersB.every(o => o.id !== guestOrder.id));
  });

  await runTest('Guest order placing order with Alice email does NOT appear in Alice registered orders', async () => {
    const guestClient = createTestClient({ db, mockD1 });
    // An anonymous person types alice's email address
    const guestOrderRes = await guestClient.post('/api/orders', {
      customer_name: 'Anonymous Impersonator',
      customer_email: 'alice@example.com',
      customer_phone: '0909999999',
      delivery_address: 'Somewhere else',
      items: [{ product_id: prod1.id, quantity: 1 }]
    });
    assert.equal(guestOrderRes.status, 200);
    const guestOrder = (await guestOrderRes.json()).order;

    // Alice checks her orders
    const clientA = createTestClient({ db, mockD1 });
    clientA.withSession({ id: 'tenant_user_a', email: 'alice@example.com' });
    const ordersA = (await (await clientA.get('/api/customer/orders')).json()).orders;

    // Guest order must NOT be listed
    assert.ok(ordersA.every(o => o.id !== guestOrder.id), 'Unauthenticated order must not pollute Alice account');
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 4: PUBLIC TRACKING ENDPOINT PRIVACY BOUNDARIES
  // --------------------------------------------------------------------------
  await runTest('Public tracking endpoint returns shipment tracking without leaking payment details', async () => {
    const guestClient = createTestClient({ db, mockD1 });
    const trackRes = await guestClient.get(`/api/orders/${orderATracking}`);
    assert.equal(trackRes.status, 200);
    const trackingData = await trackRes.json();
    assert.equal(trackingData.trackingCode, orderATracking);
    assert.equal(trackingData.orderId, orderAId);
    assert.ok(trackingData.carrier);
    assert.ok(trackingData.timeline);

    // Verify sensitive tenant info like internal customer_id or payment details are omitted
    assert.equal(trackingData.customer_id, undefined);
    assert.equal(trackingData.payment, undefined);
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 5: UNEXPECTED / MALFORMED IDS AND INJECTION ATTEMPTS
  // --------------------------------------------------------------------------
  await runTest('Cross-tenant IDOR with SQL injection payloads fails safely', async () => {
    const clientB = createTestClient({ db, mockD1 });
    clientB.withSession({ id: 'tenant_user_b', email: 'bob@example.com' });

    const sqlInjectionAttempts = [
      `' OR '1'='1`,
      `' UNION SELECT * FROM addresses --`,
      `" OR ""="`,
      `ci_random' OR user_id = 'tenant_user_a`
    ];

    for (const payload of sqlInjectionAttempts) {
      // Cart item PUT
      const putCart = await clientB.put(`/api/cart/items/${encodeURIComponent(payload)}`, { quantity: 1 });
      assert.ok([403, 404, 400].includes(putCart.status));

      // Address PUT
      const putAddr = await clientB.put(`/api/customer/addresses/${encodeURIComponent(payload)}`, { recipient_name: 'test' });
      assert.ok([403, 404, 400].includes(putAddr.status));

      // Address DELETE
      const delAddr = await clientB.delete(`/api/customer/addresses/${encodeURIComponent(payload)}`);
      assert.ok([403, 404, 400].includes(delAddr.status));
    }
  });

  // --------------------------------------------------------------------------
  // TEST SUITE 6: PRICE VOLATILITY AND CROSS-TENANT CONCURRENCY
  // --------------------------------------------------------------------------
  await runTest('Simultaneous 3-tenant cart actions preserve exact tenant partition', async () => {
    const c1 = createTestClient({ db, mockD1 });
    const c2 = createTestClient({ db, mockD1 });
    const c3 = createTestClient({ db, mockD1 });
    c1.withSession({ id: 't_user_1', email: 'u1@test.com' });
    c2.withSession({ id: 't_user_2', email: 'u2@test.com' });
    c3.withSession({ id: 't_user_3', email: 'u3@test.com' });

    // Interleaved operations
    await c1.post('/api/cart/items', { product_id: prod1.id, quantity: 3 });
    await c2.post('/api/cart/items', { product_id: prod2.id, quantity: 4 });
    await c3.post('/api/cart/items', { product_id: prod3.id, quantity: 5 });

    await c1.post('/api/cart/items', { product_id: prod2.id, quantity: 1 });
    await c2.post('/api/cart/items', { product_id: prod1.id, quantity: 2 });

    const cart1 = (await (await c1.get('/api/cart')).json()).items;
    const cart2 = (await (await c2.get('/api/cart')).json()).items;
    const cart3 = (await (await c3.get('/api/cart')).json()).items;

    assert.equal(cart1.length, 2);
    assert.equal(cart2.length, 2);
    assert.equal(cart3.length, 1);

    // c1 checks out
    await c1.post('/api/orders', {
      customer_name: 'User 1',
      customer_email: 'u1@test.com',
      customer_phone: '0901',
      delivery_address: 'Addr 1',
      items: [{ product_id: prod1.id, quantity: 3 }]
    });

    // c1 cart empty; c2 and c3 completely unaffected
    const cart1After = (await (await c1.get('/api/cart')).json()).items;
    const cart2After = (await (await c2.get('/api/cart')).json()).items;
    const cart3After = (await (await c3.get('/api/cart')).json()).items;

    assert.equal(cart1After.length, 0);
    assert.equal(cart2After.length, 2);
    assert.equal(cart3After.length, 1);
  });

  console.log('\n=============================================================');
  console.log(`  STRESS TEST SUMMARY: ${passed} passed, ${failed} failed`);
  console.log('=============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalStressSuite().catch(err => {
  console.error('Fatal stress test suite error:', err);
  process.exit(1);
});
