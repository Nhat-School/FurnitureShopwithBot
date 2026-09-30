import assert from 'node:assert/strict';
import {
  createTestClient,
  setupTestDatabase,
  signSessionToken,
  DEFAULT_SESSION_SECRET,
  base64UrlEncode
} from './e2e/helpers.mjs';
import {
  verifySession,
  signSession,
  timingSafeEqual,
  base64UrlDecode,
  hmacSha256
} from '../functions/api/[[path]].js';

/**
 * Challenger Tier 5 Adversarial Test Suite - Backend APIs & Security
 * White-box Source Coverage Audit, Session Forgery, SQL Injection, Price Immutability & Atomicity
 */

async function runAdversarialBackendSuite() {
  console.log('\n================================================================');
  console.log('   TIER 5 ADVERSARIAL COVERAGE AUDIT - BACKEND & SECURITY       ');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;
  const failures = [];

  async function test(name, fn) {
    process.stdout.write(`• ${name}... `);
    const start = performance.now();
    try {
      await fn();
      passed++;
      const duration = (performance.now() - start).toFixed(1);
      console.log(`✓ PASS (${duration}ms)`);
    } catch (err) {
      failed++;
      const duration = (performance.now() - start).toFixed(1);
      console.log(`✗ FAIL (${duration}ms)`);
      console.error(`    ${err.message}`);
      failures.push({ name, error: err });
    }
  }

  const { db, mockD1 } = setupTestDatabase();

  // Seed sample products if needed
  const existingProd = db.prepare('SELECT id, name, price, stock FROM products LIMIT 1').get();
  assert.ok(existingProd, 'Seed products must exist in database');

  // ============================================================================
  // SUITE 1: SESSION CRYPTOGRAPHY, FORGERY & TOKEN TAMPERING VECTORS
  // ============================================================================
  console.log('\n[Suite 1: Session Cryptography & Forgery Vectors]');

  await test('ADV1.1: Token signed with wrong HMAC secret is strictly rejected with 401 on /api/auth/me', async () => {
    const client = createTestClient({ db, mockD1 });
    const wrongSecret = 'attacker-wrong-secret-key-32-chars-long!';
    const forgedToken = await signSessionToken({ id: 'usr_hacker', email: 'hacker@evil.com', role: 'admin' }, wrongSecret);
    client.setCookie('fur_session', forgedToken);

    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401, 'Expected 401 Unauthorized for wrong secret');
    const body = await res.json();
    assert.equal(body.user, null);
  });

  await test('ADV1.2: Token signed with wrong HMAC secret is rejected with 401 on protected /api/cart', async () => {
    const client = createTestClient({ db, mockD1 });
    const forgedToken = await signSessionToken({ id: 'usr_hacker' }, 'invalid-secret-key-9999999999999999999');
    client.setCookie('fur_session', forgedToken);

    const res = await client.get('/api/cart');
    assert.equal(res.status, 401);
  });

  await test('ADV1.3: Bit-flipped / character-mutated payload fails signature check and returns 401', async () => {
    const client = createTestClient({ db, mockD1 });
    const validToken = await signSessionToken({ id: 'usr_legit', email: 'legit@example.com', role: 'customer' }, DEFAULT_SESSION_SECRET);
    const [payloadB64, sig] = validToken.split('.');

    // Tamper with one character in payload
    const tamperedPayloadB64 = payloadB64.substring(0, payloadB64.length - 2) + 'XY';
    client.setCookie('fur_session', `${tamperedPayloadB64}.${sig}`);

    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401, 'Tampered payload must return 401');
  });

  await test('ADV1.4: Privilege escalation attempt by tampering role from customer to admin fails 401', async () => {
    const client = createTestClient({ db, mockD1 });
    const legitToken = await signSessionToken({ id: 'usr_normal', role: 'customer' }, DEFAULT_SESSION_SECRET);
    const [, sig] = legitToken.split('.');

    // Forger encodes escalated payload with legit signature
    const escalatedPayloadB64 = base64UrlEncode(JSON.stringify({ id: 'usr_normal', role: 'admin' }));
    client.setCookie('fur_session', `${escalatedPayloadB64}.${sig}`);

    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await test('ADV1.5: Truncated or extended signature fails timingSafeEqual without crash', async () => {
    const client = createTestClient({ db, mockD1 });
    const legitToken = await signSessionToken({ id: 'usr_test' }, DEFAULT_SESSION_SECRET);
    const [payloadB64, sig] = legitToken.split('.');

    // Truncated signature
    client.setCookie('fur_session', `${payloadB64}.${sig.substring(0, sig.length - 4)}`);
    const res1 = await client.get('/api/auth/me');
    assert.equal(res1.status, 401);

    // Extended signature
    client.setCookie('fur_session', `${payloadB64}.${sig}extra`);
    const res2 = await client.get('/api/auth/me');
    assert.equal(res2.status, 401);
  });

  await test('ADV1.6: Expired session token (exp in past) returns 401', async () => {
    const client = createTestClient({ db, mockD1 });
    const expiredPayload = {
      id: 'usr_expired',
      email: 'expired@test.com',
      exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour ago
    };
    const expiredToken = await signSessionToken(expiredPayload, DEFAULT_SESSION_SECRET);
    client.setCookie('fur_session', expiredToken);

    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await test('ADV1.7: Validly signed token missing id property returns 401 on /api/auth/me and /api/cart', async () => {
    const client = createTestClient({ db, mockD1 });
    const noIdPayload = { email: 'noid@example.com', role: 'customer' };
    const noIdToken = await signSessionToken(noIdPayload, DEFAULT_SESSION_SECRET);
    client.setCookie('fur_session', noIdToken);

    const resMe = await client.get('/api/auth/me');
    assert.equal(resMe.status, 401);

    const resCart = await client.get('/api/cart');
    assert.equal(resCart.status, 401);
  });

  await test('ADV1.8: Valid HMAC signature with non-JSON or non-object payload returns 401 without unhandled 500', async () => {
    const client = createTestClient({ db, mockD1 });

    // Payload is a number: 123
    const numberPayloadB64 = base64UrlEncode('12345');
    const sigNumber = await hmacSha256(DEFAULT_SESSION_SECRET, numberPayloadB64);
    client.setCookie('fur_session', `${numberPayloadB64}.${sigNumber}`);
    const resNum = await client.get('/api/auth/me');
    assert.equal(resNum.status, 401);

    // Payload is an array: ["evil"]
    const arrayPayloadB64 = base64UrlEncode('["evil", "payload"]');
    const sigArray = await hmacSha256(DEFAULT_SESSION_SECRET, arrayPayloadB64);
    client.setCookie('fur_session', `${arrayPayloadB64}.${sigArray}`);
    const resArr = await client.get('/api/auth/me');
    assert.equal(resArr.status, 401);

    // Payload is string: "just a string"
    const strPayloadB64 = base64UrlEncode('"plain string"');
    const sigStr = await hmacSha256(DEFAULT_SESSION_SECRET, strPayloadB64);
    client.setCookie('fur_session', `${strPayloadB64}.${sigStr}`);
    const resStr = await client.get('/api/auth/me');
    assert.equal(resStr.status, 401);
  });

  // ============================================================================
  // SUITE 2: SQL INJECTION & WILDCARD BOUNDARIES
  // ============================================================================
  console.log('\n[Suite 2: SQL Injection & Wildcard Boundaries]');

  await test('ADV2.1: Products search with SQL wildcards (% and _) does not crash or corrupt query', async () => {
    const client = createTestClient({ db, mockD1 });

    const res1 = await client.get('/api/products?search=%');
    assert.equal(res1.status, 200);
    const body1 = await res1.json();
    assert.ok(Array.isArray(body1.products));

    const res2 = await client.get('/api/products?search=_');
    assert.equal(res2.status, 200);
    const body2 = await res2.json();
    assert.ok(Array.isArray(body2.products));
  });

  await test('ADV2.2: Products search with classic SQL injection strings is safely parameterized', async () => {
    const client = createTestClient({ db, mockD1 });
    const attackPayloads = [
      "'; DROP TABLE products; --",
      "' OR 1=1 --",
      "\" OR \"\"=\"",
      "' UNION SELECT null, email, auth_provider, provider_subject, null, null, null, null, null, null, null, null, null, null, null, null FROM users --",
      "1'; WAITFOR DELAY '0:0:5'--"
    ];

    for (const sqli of attackPayloads) {
      const res = await client.get(`/api/products?search=${encodeURIComponent(sqli)}`);
      assert.equal(res.status, 200, `Expected 200 for SQLi search: ${sqli}`);
      const body = await res.json();
      assert.ok(Array.isArray(body.products));
    }

    // Verify products table was not dropped
    const count = db.prepare('SELECT count(*) as c FROM products').get();
    assert.ok(count.c > 0, 'Products table must remain intact');
  });

  await test('ADV2.3: Order tracking /api/orders/:code with SQL injection strings returns 404 without error', async () => {
    const client = createTestClient({ db, mockD1 });
    const attackCodes = [
      "' OR 1=1 --",
      "'; DROP TABLE orders; --",
      "' UNION SELECT * FROM users --",
      "ABC-VN-%",
      "%%"
    ];

    for (const code of attackCodes) {
      const res = await client.get(`/api/orders/${encodeURIComponent(code)}`);
      assert.equal(res.status, 404, `Expected 404 for tracking SQLi: ${code}`);
      const body = await res.json();
      assert.equal(body.error, 'Order not found');
    }

    const orderCount = db.prepare('SELECT count(*) as c FROM orders').get();
    assert.ok(orderCount.c !== undefined, 'Orders table must remain intact');
  });

  await test('ADV2.4: Checkout POST /api/orders with SQL quotes and wildcards in customer_name, address, notes', async () => {
    const client = createTestClient({ db, mockD1 });
    const prod = db.prepare('SELECT id, name, price FROM products LIMIT 1').get();

    const sqliPayload = {
      customer_name: "O'Connor'); DROP TABLE orders; --",
      customer_phone: "0901234567'; SELECT * FROM users;",
      customer_email: "test+sqli@example.com",
      delivery_address: "123 Robert'); DROP TABLE order_items; -- St, District 1",
      notes: "Please leave package at ' OR '1'='1 -- /* comment */",
      items: [{ product_id: prod.id, quantity: 1 }]
    };

    const res = await client.post('/api/orders', sqliPayload);
    assert.equal(res.status, 200, 'Checkout should succeed with safe parameterization');
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.order.customer_name, sqliPayload.customer_name);
    assert.equal(body.order.notes, sqliPayload.notes);

    // Verify record in database preserved exact strings verbatim
    const dbOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(body.order.id);
    assert.equal(dbOrder.customer_name, sqliPayload.customer_name);
    assert.equal(dbOrder.notes, sqliPayload.notes);
    assert.equal(dbOrder.delivery_address, sqliPayload.delivery_address);

    // Check tables are not dropped
    const ordersExist = db.prepare("SELECT count(*) as c FROM sqlite_master WHERE type='table' AND name IN ('orders', 'order_items', 'products', 'users')").get();
    assert.equal(ordersExist.c, 4, 'All tables must remain intact');
  });

  await test('ADV2.5: Address book POST and PUT with quotes, script tags, and SQL comments', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_sqli_${Date.now()}`, email: 'sqli_user@example.com' };
    client.withSession(user);

    const addrPayload = {
      recipient_name: "Robert'); DROP TABLE addresses;-- <script>alert(1)</script>",
      phone: "+84 901' OR '1'='1",
      street: "777 Hackers Way /* comment */",
      ward: "Ward 1';--",
      district: "District 1' OR 1=1",
      city_province: "TP. Ho Chi Minh';--",
      postal_code: "700000' UNION SELECT 1,2--"
    };

    const resPost = await client.post('/api/customer/addresses', addrPayload);
    assert.equal(resPost.status, 200);
    const bodyPost = await resPost.json();
    assert.equal(bodyPost.success, true);
    const addrId = bodyPost.address.id;

    // Verify verbatim storage
    const stored = db.prepare('SELECT * FROM addresses WHERE id = ?').get(addrId);
    assert.equal(stored.recipient_name, addrPayload.recipient_name);
    assert.equal(stored.street, addrPayload.street);

    // Test PUT with updated quotes
    const resPut = await client.put(`/api/customer/addresses/${addrId}`, {
      street: "Updated St ' AND '1'='1"
    });
    assert.equal(resPut.status, 200);
    const updated = db.prepare('SELECT street FROM addresses WHERE id = ?').get(addrId);
    assert.equal(updated.street, "Updated St ' AND '1'='1");
  });

  // ============================================================================
  // SUITE 3: CHECKOUT PRICE IMMUTABILITY UNDER CONCURRENCY & VOLATILITY
  // ============================================================================
  console.log('\n[Suite 3: Checkout Price Immutability Under Volatility]');

  await test('ADV3.1: Catalog price increase between cart addition and checkout locks checkout-time price', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_immut_${Date.now()}`, email: 'immut@test.com' };
    client.withSession(user);

    // Create a dedicated product
    const prodId = `prod_immut_${Date.now()}`;
    db.prepare(`
      INSERT INTO products (id, sku, name, category_id, price, stock, width_cm, depth_cm, height_cm, weight_kg, material)
      VALUES (?, 'SKU-IMMUT', 'Immutability Desk', 'cat_living', 500000, 10, 120, 60, 75, 25, 'Gỗ Sồi')
    `).run(prodId);

    // 1. Add to cart at 500,000 VND
    const addRes = await client.post('/api/cart/items', { product_id: prodId, quantity: 2 });
    assert.equal(addRes.status, 200);

    // 2. Concurrently update product price in catalog to 850,000 VND before checkout
    db.prepare('UPDATE products SET price = 850000 WHERE id = ?').run(prodId);

    // 3. User checks out
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Price Immutability Tester',
      customer_phone: '0909999888',
      delivery_address: '456 Frozen Price Ave',
      items: [{ product_id: prodId, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json();
    assert.equal(orderData.order.items[0].unit_price, 850000, 'Order must capture catalog price at checkout moment');
    assert.equal(orderData.order.subtotal, 1700000);

    // 4. Concurrently slash catalog price to 100,000 VND right after checkout
    db.prepare('UPDATE products SET price = 100000 WHERE id = ?').run(prodId);

    // 5. Query order directly from DB
    const dbOrderItem = db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderData.order.id);
    assert.equal(dbOrderItem.unit_price, 850000, 'order_items.unit_price must remain strictly frozen at 850,000');

    // 6. Query /api/customer/orders and verify frozen price is returned
    const custOrdersRes = await client.get('/api/customer/orders');
    assert.equal(custOrdersRes.status, 200);
    const custOrders = await custOrdersRes.json();
    const matchedOrd = custOrders.orders.find(o => o.id === orderData.order.id);
    assert.equal(matchedOrd.items[0].unit_price, 850000);
  });

  await test('ADV3.2: Product stock drops to zero or archived does not prevent price lock or break order history', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_zero_stock_${Date.now()}`, email: 'zero@test.com' };
    client.withSession(user);

    const prodId = `prod_oos_${Date.now()}`;
    db.prepare(`
      INSERT INTO products (id, sku, name, category_id, price, stock, width_cm, depth_cm, height_cm, weight_kg, material)
      VALUES (?, 'SKU-OOS', 'Out of Stock Sofa', 'cat_living', 1200000, 0, 180, 85, 80, 45, 'Vải Nỉ Cao Cấp')
    `).run(prodId);

    // Checkout with out of stock product
    const orderRes = await client.post('/api/orders', {
      customer_name: 'OOS Customer',
      customer_phone: '0901112222',
      delivery_address: '789 Zero Stock St',
      items: [{ product_id: prodId, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200);
    const orderData = await orderRes.json();
    assert.equal(orderData.order.items[0].unit_price, 1200000);

    // Archive product (stock = 0, price changed)
    db.prepare('UPDATE products SET stock = 0, is_featured = 0, price = 99999999 WHERE id = ?').run(prodId);

    // Historical order must still be accessible via /api/orders/:code and /api/customer/orders with original price
    const trackingRes = await client.get(`/api/orders/${orderData.order.tracking_code}`);
    assert.equal(trackingRes.status, 200);

    const historyRes = await client.get('/api/customer/orders');
    assert.equal(historyRes.status, 200);
    const hist = await historyRes.json();
    const ord = hist.orders.find(o => o.id === orderData.order.id);
    assert.ok(ord);
    assert.equal(ord.items[0].unit_price, 1200000, 'Price must remain frozen at 1,200,000 even when product is archived or price inflated');

    // Foreign key constraint protection: hard deleting ordered product is blocked by SQLite
    assert.throws(
      () => db.prepare('DELETE FROM products WHERE id = ?').run(prodId),
      /FOREIGN KEY constraint failed/,
      'Referential integrity must protect ordered products from destructive hard deletion'
    );
  });

  await test('ADV3.3: Client-sent tampering of unit_price and total_amount is strictly neutralized', async () => {
    const client = createTestClient({ db, mockD1 });
    const prod = db.prepare('SELECT id, name, price FROM products WHERE price > 0 LIMIT 1').get();

    // Adversary attempts to buy product by sending unit_price: 1 and total_amount: 1
    const res = await client.post('/api/orders', {
      customer_name: 'Price Hacker',
      customer_phone: '0909999999',
      delivery_address: '1 Hacker Way',
      items: [
        {
          product_id: prod.id,
          quantity: 3,
          unit_price: 1, // Malicious override
          price: 1,      // Malicious override
          subtotal: 3    // Malicious override
        }
      ],
      total_amount: 3   // Malicious override
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    const expectedSubtotal = Number(prod.price) * 3;
    assert.equal(body.order.items[0].unit_price, Number(prod.price), 'Server must strictly enforce catalog price');
    assert.equal(body.order.subtotal, expectedSubtotal);
    assert.equal(body.order.total_amount, expectedSubtotal);
  });

  // ============================================================================
  // SUITE 4: TRANSACTION ATOMICITY IN D1 BATCH & ROLLBACK CONDITIONS
  // ============================================================================
  console.log('\n[Suite 4: Transaction Atomicity in D1 Batch & Rollback]');

  await test('ADV4.1: Orders, order_items, shipments, order_payments, and cart clearance form atomic 1:1:1 invariant', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_atom_${Date.now()}`, email: 'atom@test.com' };
    client.withSession(user);

    const prod = db.prepare('SELECT id, price FROM products LIMIT 1').get();

    // 1. Add item to cart
    await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    const cartBefore = await client.get('/api/cart');
    assert.equal((await cartBefore.json()).items.length, 1);

    // 2. Checkout order
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Atomic Buyer',
      customer_phone: '0912345678',
      delivery_address: '100 Atom St',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200);
    const orderId = (await orderRes.json()).order.id;

    // 3. Verify exactly 1 order, 1 shipment, 1 payment in DB
    const dbOrder = db.prepare('SELECT id FROM orders WHERE id = ?').get(orderId);
    const dbShipment = db.prepare('SELECT id FROM shipments WHERE order_id = ?').get(orderId);
    const dbPayment = db.prepare('SELECT id FROM order_payments WHERE order_id = ?').get(orderId);
    const dbItems = db.prepare('SELECT count(*) as c FROM order_items WHERE order_id = ?').get(orderId);

    assert.ok(dbOrder, 'Order record exists');
    assert.ok(dbShipment, 'Shipment record exists');
    assert.ok(dbPayment, 'Order payment record exists');
    assert.equal(dbItems.c, 1, 'Order item count matches items');

    // 4. Verify cart was atomically cleared
    const cartAfter = await client.get('/api/cart');
    assert.equal((await cartAfter.json()).items.length, 0, 'Cart must be cleared on successful checkout');
  });

  await test('ADV4.2: Non-existent product ID in items array fails before batch with 404 and leaves zero orphaned rows', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_rollback_${Date.now()}`, email: 'rollback@test.com' };
    client.withSession(user);

    const validProd = db.prepare('SELECT id FROM products LIMIT 1').get();
    const fakeProdId = 'prod_does_not_exist_99999';

    // Put item in user cart
    await client.post('/api/cart/items', { product_id: validProd.id, quantity: 2 });

    const ordersCountBefore = db.prepare('SELECT count(*) as c FROM orders').get().c;
    const shipmentsCountBefore = db.prepare('SELECT count(*) as c FROM shipments').get().c;
    const paymentsCountBefore = db.prepare('SELECT count(*) as c FROM order_payments').get().c;

    // Checkout with mixture of valid and invalid products
    const res = await client.post('/api/orders', {
      customer_name: 'Rollback Tester',
      customer_phone: '0901234567',
      delivery_address: 'Fail St',
      items: [
        { product_id: validProd.id, quantity: 1 },
        { product_id: fakeProdId, quantity: 1 }
      ]
    });

    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(body.error, /Product not found/i);

    // Verify zero orphaned records created
    const ordersCountAfter = db.prepare('SELECT count(*) as c FROM orders').get().c;
    const shipmentsCountAfter = db.prepare('SELECT count(*) as c FROM shipments').get().c;
    const paymentsCountAfter = db.prepare('SELECT count(*) as c FROM order_payments').get().c;

    assert.equal(ordersCountAfter, ordersCountBefore, 'No orders created');
    assert.equal(shipmentsCountAfter, shipmentsCountBefore, 'No shipments created');
    assert.equal(paymentsCountAfter, paymentsCountBefore, 'No payments created');

    // Verify user cart was NOT cleared
    const cartRes = await client.get('/api/cart');
    assert.equal((await cartRes.json()).items.length, 1, 'Cart items must be preserved when checkout fails');
  });

  await test('ADV4.3: User A checkout clears ONLY User A cart, preserving User B cart intact', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const userA = { id: `usr_a_${Date.now()}`, email: 'usera@test.com' };
    clientA.withSession(userA);

    const clientB = createTestClient({ db, mockD1 });
    const userB = { id: `usr_b_${Date.now()}`, email: 'userb@test.com' };
    clientB.withSession(userB);

    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    // Both add item to cart
    await clientA.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
    await clientB.post('/api/cart/items', { product_id: prod.id, quantity: 5 });

    // User A checks out
    const orderResA = await clientA.post('/api/orders', {
      customer_name: 'Customer A',
      customer_phone: '0901111111',
      delivery_address: 'Address A',
      items: [{ product_id: prod.id, quantity: 2 }]
    });
    assert.equal(orderResA.status, 200);

    // User A cart is empty
    const cartA = await clientA.get('/api/cart');
    assert.equal((await cartA.json()).items.length, 0);

    // User B cart remains untouched with quantity 5
    const cartB = await clientB.get('/api/cart');
    const itemsB = (await cartB.json()).items;
    assert.equal(itemsB.length, 1);
    assert.equal(itemsB[0].quantity, 5, 'User B cart quantity must remain 5');
  });

  // ============================================================================
  // SUITE 5: CONCURRENT MUTATIONS & CROSS-TENANT RACE CONDITIONS
  // ============================================================================
  console.log('\n[Suite 5: Concurrent Mutations & Cross-Tenant Isolation]');

  await test('ADV5.1: Parallel cart item additions (10 concurrent requests) increment quantity without crash', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_conc_cart_${Date.now()}`, email: 'conccart@test.com' };
    client.withSession(user);

    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    // Send 10 concurrent requests to add 1 of same product
    const requests = Array.from({ length: 10 }, () =>
      client.post('/api/cart/items', { product_id: prod.id, quantity: 1 })
    );

    const responses = await Promise.all(requests);
    for (const r of responses) {
      assert.equal(r.status, 200, 'Each concurrent cart addition must return 200');
    }

    const cartRes = await client.get('/api/cart');
    const cartData = await cartRes.json();
    assert.equal(cartData.items.length, 1);
    assert.ok(cartData.items[0].quantity >= 1, 'Cart item quantity must be recorded');
  });

  await test('ADV5.2: Parallel PUT /api/customer/addresses/:id/default maintains exactly one default address', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_conc_addr_${Date.now()}`, email: 'concaddr@test.com' };
    client.withSession(user);

    // Create 4 addresses
    const addrIds = [];
    for (let i = 1; i <= 4; i++) {
      const res = await client.post('/api/customer/addresses', {
        recipient_name: `Recipient ${i}`,
        phone: `090000000${i}`,
        street: `${i} Multi Street`,
        city_province: 'Ho Chi Minh'
      });
      assert.equal(res.status, 200);
      addrIds.push((await res.json()).address.id);
    }

    // Simultaneously trigger default switch on all 4 addresses
    const defaultPromises = addrIds.map(id => client.put(`/api/customer/addresses/${id}/default`));
    const responses = await Promise.all(defaultPromises);

    for (const r of responses) {
      assert.equal(r.status, 200);
    }

    // Verify database invariant: exactly ONE address has is_default = 1
    const defaultAddresses = db.prepare('SELECT id FROM addresses WHERE user_id = ? AND is_default = 1').all(user.id);
    assert.equal(defaultAddresses.length, 1, 'Exactly one address must have is_default = 1');
  });

  await test('ADV5.3: Cross-tenant cart and address mutations strictly denied with 403 Forbidden under concurrent access', async () => {
    const clientA = createTestClient({ db, mockD1 });
    const userA = { id: `usr_tenant_a_${Date.now()}`, email: 'ta@test.com' };
    clientA.withSession(userA);

    const clientB = createTestClient({ db, mockD1 });
    const userB = { id: `usr_tenant_b_${Date.now()}`, email: 'tb@test.com' };
    clientB.withSession(userB);

    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    // User A creates cart item and address
    const cartItemResA = await clientA.post('/api/cart/items', { product_id: prod.id, quantity: 3 });
    const cartItemIdA = (await cartItemResA.json()).item.id;

    const addrResA = await clientA.post('/api/customer/addresses', {
      recipient_name: 'Tenant A',
      phone: '0901234567',
      street: '123 Tenant A St',
      city_province: 'HCM'
    });
    const addrIdA = (await addrResA.json()).address.id;

    // Concurrent attack by User B trying to mutate / delete User A resources
    const [putCartRes, delCartRes, putAddrRes, delAddrRes] = await Promise.all([
      clientB.put(`/api/cart/items/${cartItemIdA}`, { quantity: 100 }),
      clientB.delete(`/api/cart/items/${cartItemIdA}`),
      clientB.put(`/api/customer/addresses/${addrIdA}`, { street: 'Hacked Street' }),
      clientB.delete(`/api/customer/addresses/${addrIdA}`)
    ]);

    assert.equal(putCartRes.status, 403, 'Cross-tenant cart PUT must be 403 Forbidden');
    assert.equal(delCartRes.status, 403, 'Cross-tenant cart DELETE must be 403 Forbidden');
    assert.equal(putAddrRes.status, 403, 'Cross-tenant address PUT must be 403 Forbidden');
    assert.equal(delAddrRes.status, 403, 'Cross-tenant address DELETE must be 403 Forbidden');

    // Verify User A resources were not modified or deleted
    const cartA = await clientA.get('/api/cart');
    assert.equal((await cartA.json()).items[0].quantity, 3);

    const addrA = db.prepare('SELECT * FROM addresses WHERE id = ?').get(addrIdA);
    assert.equal(addrA.street, '123 Tenant A St');
  });

  // ============================================================================
  // SUITE 6: BOUNDARY PAYLOADS, NUMERIC ANOMALIES & TYPE POLLUTION
  // ============================================================================
  console.log('\n[Suite 6: Boundary Payloads & Numeric Anomalies]');

  await test('ADV6.1: Numeric anomaly fuzzing on quantity (0, negative, float, string, NaN) returns 400', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_num_${Date.now()}`, email: 'num@test.com' };
    client.withSession(user);

    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    const badQuantities = [0, -1, -99, 1.5, 0.1, '5', 'one', NaN, Infinity, -Infinity, null, {}, []];

    for (const badQty of badQuantities) {
      const res = await client.post('/api/cart/items', {
        product_id: prod.id,
        quantity: badQty
      });
      assert.equal(res.status, 400, `Expected 400 for bad cart quantity: ${JSON.stringify(badQty)}`);
    }
  });

  await test('ADV6.2: Negative or non-finite freight_surcharge in /api/orders returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    const badSurcharges = [-1, -50000, NaN, Infinity, -Infinity, '50000', {}];

    for (const badSurcharge of badSurcharges) {
      const res = await client.post('/api/orders', {
        customer_name: 'Surcharge Test',
        customer_phone: '0901234567',
        delivery_address: '123 Surcharge Way',
        freight_surcharge: badSurcharge,
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, `Expected 400 for bad freight_surcharge: ${JSON.stringify(badSurcharge)}`);
    }
  });

  await test('ADV6.3: Invalid payment_method string in /api/orders returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    const badMethods = ['crypto', 'bitcoin', 'paypal', 'apple_pay', 123, true, {}];

    for (const badMethod of badMethods) {
      const res = await client.post('/api/orders', {
        customer_name: 'Payment Test',
        customer_phone: '0901234567',
        delivery_address: '123 Method Way',
        payment_method: badMethod,
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, `Expected 400 for bad payment_method: ${JSON.stringify(badMethod)}`);
    }
  });

  await test('ADV6.4: Non-integer or negative floor_number in /api/orders returns 400 Bad Request', async () => {
    const client = createTestClient({ db, mockD1 });
    const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

    const badFloors = [-1, -10, 2.5, '2', null, {}, []];

    for (const badFloor of badFloors) {
      // Note: null might be treated as omitted if null is passed, but let's test -1 and 2.5
      if (badFloor === null) continue;
      const res = await client.post('/api/orders', {
        customer_name: 'Floor Test',
        customer_phone: '0901234567',
        delivery_address: '123 Floor Way',
        floor_number: badFloor,
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, `Expected 400 for bad floor_number: ${JSON.stringify(badFloor)}`);
    }
  });

  await test('ADV6.5: HTTP method restrictions across all domain endpoints strictly enforced (405)', async () => {
    const client = createTestClient({ db, mockD1 });
    const user = { id: `usr_methods_${Date.now()}` };
    client.withSession(user);

    // /api/auth/me accepts only GET
    assert.equal((await client.post('/api/auth/me', {})).status, 405);
    assert.equal((await client.put('/api/auth/me', {})).status, 405);
    assert.equal((await client.delete('/api/auth/me')).status, 405);

    // /api/auth/logout accepts only POST
    assert.equal((await client.get('/api/auth/logout')).status, 405);
    assert.equal((await client.put('/api/auth/logout', {})).status, 405);

    // /api/customer/orders accepts only GET
    assert.equal((await client.post('/api/customer/orders', {})).status, 405);
    assert.equal((await client.delete('/api/customer/orders')).status, 405);

    // /api/orders tracking accepts only GET
    assert.equal((await client.post('/api/orders/ABC-VN-123456', {})).status, 405);
    assert.equal((await client.delete('/api/orders/ABC-VN-123456')).status, 405);
  });

  // ============================================================================
  // SUMMARY REPORT
  // ============================================================================
  console.log('\n================================================================');
  console.log('                 ADVERSARIAL SUITE SUMMARY                      ');
  console.log('================================================================');
  console.log(`Total Adversarial Tests: ${passed + failed}`);
  console.log(`Passed:                 ${passed}`);
  console.log(`Failed:                 ${failed}`);
  console.log(`Pass Rate:              ${((passed / (passed + failed)) * 100).toFixed(1)}%`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error(`FAIL: ${failed} tests failed!`);
    failures.forEach((f, idx) => {
      console.error(`${idx + 1}. ${f.name}: ${f.error.message}`);
    });
    process.exit(1);
  } else {
    console.log('PASS: All adversarial security and branch tests passed cleanly!\n');
    return true;
  }
}

// Execute suite
runAdversarialBackendSuite().catch(err => {
  console.error('Fatal Test Runner Exception:', err);
  process.exit(1);
});
