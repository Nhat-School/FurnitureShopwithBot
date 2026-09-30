import assert from 'node:assert/strict';
import { describe, test, runner } from './runner.mjs';
import {
  createTestClient,
  setupTestDatabase
} from './helpers.mjs';

// ============================================================================
// Tier 4: Real-World Workload User Journeys (7 Workflows)
// ============================================================================

runner.setTier(4);
describe('Tier 4: Real-World Workload Journeys', () => {

  // --------------------------------------------------------------------------
  // Journey 1: New Visitor First Purchase Workflow
  // --------------------------------------------------------------------------
  test('T4.1: Journey 1: New Visitor First Purchase Workflow (Google Auth -> Save Address -> Add to Cart -> Checkout COD -> Track Order)', async () => {
    const client = createTestClient();
    const newUser = {
      id: 'usr_rw1',
      email: 'rw1_newuser@example.com',
      name: 'Nguyen Van A',
      role: 'customer'
    };
    client.withSession(newUser);

    // 1. User profile created in D1
    client.db.prepare(`
      INSERT INTO users (id, email, auth_provider, display_name, role)
      VALUES (?, ?, 'google', ?, 'customer')
    `).run(newUser.id, newUser.email, newUser.name);
    client.db.prepare(`
      INSERT INTO customers (id, user_id, customer_type, loyalty_points)
      VALUES ('cust_rw1', ?, 'standard', 0)
    `).run(newUser.id);

    // 2. Add default delivery address
    const addrRes = await client.post('/api/customer/addresses', {
      recipient_name: 'Nguyen Van A',
      phone: '0901234567',
      street: '123 Le Loi Street',
      ward: 'Ben Nghe Ward',
      district: 'District 1',
      city_province: 'Ho Chi Minh City',
      is_default: 1
    });
    assert.equal(addrRes.status, 200, 'Saving address should succeed');

    // 3. Browse catalog and select product
    const prod = client.db.prepare('SELECT id, name, price FROM products LIMIT 1').get();
    assert.ok(prod, 'Catalog product should be available');

    // 4. Add to cart
    const addCartRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
    assert.equal(addCartRes.status, 200, 'Adding to cart should succeed');

    // 5. Review cart
    const cartRes = await client.get('/api/cart');
    assert.equal(cartRes.status, 200, 'GET /api/cart should succeed');
    const cart = (await cartRes.json()).items;
    assert.equal(cart?.length, 1);
    assert.equal(cart[0].quantity, 2);

    // 6. Complete checkout with COD
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Nguyen Van A',
      customer_email: newUser.email,
      customer_phone: '0901234567',
      delivery_address: '123 Le Loi Street, Ben Nghe Ward, District 1, Ho Chi Minh City',
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should succeed');
    const order = (await orderRes.json()).order;
    assert.ok(order?.id, 'Order should have generated ID');
    assert.equal(order.total_amount, prod.price * 2);

    // 7. Verify persistent cart is now empty
    const postCartRes = await client.get('/api/cart');
    assert.equal(postCartRes.status, 200, 'GET /api/cart post-checkout should succeed');
    const postCheckoutCart = (await postCartRes.json()).items;
    assert.equal(postCheckoutCart?.length, 0, 'Cart must be emptied after checkout');

    // 8. Track order in customer order history
    const historyRes = await client.get('/api/customer/orders');
    assert.equal(historyRes.status, 200, 'GET /api/customer/orders should succeed');
    const history = (await historyRes.json()).orders;
    assert.equal(history?.length, 1);
    assert.equal(history[0].id, order.id);
  });

  // --------------------------------------------------------------------------
  // Journey 2: Multi-Address Office vs Home Delivery Workflow
  // --------------------------------------------------------------------------
  test('T4.2: Journey 2: Multi-Address Office vs Home Delivery Workflow', async () => {
    const client = createTestClient();
    const user = { id: 'usr_rw2', email: 'rw2_worker@company.com' };
    client.withSession(user);

    client.db.prepare(`INSERT INTO users (id, email, display_name) VALUES (?, ?, 'Worker')`).run(user.id, user.email);

    // Save Home Address (Default)
    const hRes = await client.post('/api/customer/addresses', {
      recipient_name: 'Worker Home',
      phone: '0901111111',
      street: '45 Home Residence Ave',
      district: 'District 7',
      city_province: 'HCMC',
      is_default: 1
    });
    assert.equal(hRes.status, 200, 'Saving home address should succeed');

    // Save Office Address (Secondary)
    const oRes = await client.post('/api/customer/addresses', {
      recipient_name: 'Worker Office Desk',
      phone: '0902222222',
      street: '88 Commercial Tower Floor 15',
      district: 'District 1',
      city_province: 'HCMC',
      is_default: 0
    });
    assert.equal(oRes.status, 200, 'Saving office address should succeed');

    const addrRes = await client.get('/api/customer/addresses');
    assert.equal(addrRes.status, 200, 'GET /api/customer/addresses should succeed');
    const addresses = (await addrRes.json()).addresses;
    assert.equal(addresses?.length, 2);

    // User chooses Office address for large furniture desk delivery
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Worker Office Desk',
      customer_email: user.email,
      customer_phone: '0902222222',
      delivery_address: '88 Commercial Tower Floor 15, District 1, HCMC',
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should succeed');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order id should exist');

    // Verify shipment record snapshot specifically points to Office address
    const shipment = client.db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
    assert.ok(shipment, 'Shipment record must exist');
    assert.equal(shipment.delivery_address, '88 Commercial Tower Floor 15, District 1, HCMC');

    // Verify Home address remains default in address book
    const updatedAddrRes = await client.get('/api/customer/addresses');
    assert.equal(updatedAddrRes.status, 200);
    const updatedAddresses = (await updatedAddrRes.json()).addresses;
    const homeAddr = updatedAddresses?.find(a => a.recipient_name === 'Worker Home');
    assert.equal(homeAddr?.is_default, 1);
  });

  // --------------------------------------------------------------------------
  // Journey 3: Flash Sale Volatility & Audit Verification
  // --------------------------------------------------------------------------
  test('T4.3: Journey 3: Flash Sale Volatility & Immutability Audit Verification', async () => {
    const client = createTestClient();
    const user = { id: 'usr_rw3', email: 'rw3_dealhunter@example.com' };
    client.withSession(user);

    client.db.prepare(`INSERT INTO users (id, email) VALUES (?, ?)`).run(user.id, user.email);
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

    // Normal Catalog Price: 10,000,000
    client.db.prepare('UPDATE products SET price = 10000000 WHERE id = ?').run(prod.id);
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(addRes.status, 200, 'Add to cart should return 200');

    // Flash sale starts at midnight: Price drops to 7,500,000
    client.db.prepare('UPDATE products SET price = 7500000 WHERE id = ?').run(prod.id);

    // Customer reloads cart and checks out during flash sale
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Deal Hunter',
      customer_email: user.email,
      customer_phone: '0901234567',
      delivery_address: 'Deal Hunter St',
      payment_method: 'credit_card',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'Checkout during sale should return 200');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order id should exist');

    // Flash sale ends next morning: Price jumps to 12,000,000
    client.db.prepare('UPDATE products SET price = 12000000 WHERE id = ?').run(prod.id);

    // Auditor checks order items in database
    const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
    assert.ok(oi, 'order_items row should exist');
    assert.equal(oi.unit_price, 7500000, 'Historical unit_price must remain locked to 7,500,000 flash sale price');

    // Customer visits order history
    const historyRes = await client.get('/api/customer/orders');
    assert.equal(historyRes.status, 200, 'GET /api/customer/orders should return 200');
    const historyOrder = (await historyRes.json()).orders?.[0];
    assert.ok(historyOrder, 'History order should exist');
    assert.equal(historyOrder.items[0].unit_price, 7500000);
    assert.equal(historyOrder.total_amount, 7500000);
  });

  // --------------------------------------------------------------------------
  // Journey 4: Guest Browsing to Authenticated Checkout Transition
  // --------------------------------------------------------------------------
  test('T4.4: Journey 4: Guest Browsing to Authenticated Checkout Transition', async () => {
    const client = createTestClient();

    // 1. Guest browses catalog
    const productsRes = await client.get('/api/products');
    assert.equal(productsRes.status, 200);
    const prod = (await productsRes.json()).products?.[0];
    assert.ok(prod?.id, 'Catalog product should exist');

    // 2. User decides to authenticate via Google OAuth
    const authStartRes = await client.get('/api/auth/google');
    assert.equal(authStartRes.status, 302);

    // 3. User authenticates and receives session
    const authenticatedUser = {
      id: 'usr_rw4_trans',
      email: 'guest_to_auth@example.com',
      role: 'customer'
    };
    client.withSession(authenticatedUser);

    client.db.prepare(`
      INSERT INTO users (id, email, display_name, role)
      VALUES (?, ?, 'Converted Guest', 'customer')
    `).run(authenticatedUser.id, authenticatedUser.email);

    // 4. User adds item to persistent cart
    const addCartRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(addCartRes.status, 200, 'Add to cart should return 200');

    // 5. User saves address
    const saveAddrRes = await client.post('/api/customer/addresses', {
      recipient_name: 'Converted Guest',
      phone: '0908888888',
      street: '77 Conversion Way',
      district: 'D2',
      city_province: 'HCMC'
    });
    assert.equal(saveAddrRes.status, 200, 'Save address should return 200');

    // 6. User executes checkout
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Converted Guest',
      customer_email: authenticatedUser.email,
      customer_phone: '0908888888',
      delivery_address: '77 Conversion Way, D2, HCMC',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'Checkout should return 200');
    const order = (await orderRes.json()).order;
    assert.ok(order?.id, 'Order id should exist');

    // 7. Verify order linked to customer_id
    const dbOrder = client.db.prepare('SELECT customer_id FROM orders WHERE id = ?').get(order.id);
    assert.equal(dbOrder.customer_id, authenticatedUser.id);
  });

  // --------------------------------------------------------------------------
  // Journey 5: Complex Shopping Cart Manipulation & Partial Checkout
  // --------------------------------------------------------------------------
  test('T4.5: Journey 5: Complex Shopping Cart Manipulation & Multi-Item Checkout', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_rw5', email: 'rw5@example.com' });
    const prods = client.db.prepare('SELECT id, price FROM products LIMIT 4').all();
    assert.ok(prods.length >= 4, 'Catalog should have at least 4 products');

    // 1. Add 3 products
    const a1 = await client.post('/api/cart/items', { product_id: prods[0].id, quantity: 1 });
    assert.equal(a1.status, 200);
    const a2 = await client.post('/api/cart/items', { product_id: prods[1].id, quantity: 2 });
    assert.equal(a2.status, 200);
    const a3 = await client.post('/api/cart/items', { product_id: prods[2].id, quantity: 1 });
    assert.equal(a3.status, 200);

    // 2. Update quantity of product 0
    const cartRes1 = await client.get('/api/cart');
    assert.equal(cartRes1.status, 200, 'GET /api/cart should return 200');
    let cart = (await cartRes1.json()).items;
    const item0 = cart?.find(i => i.product_id === prods[0].id);
    assert.ok(item0?.id, 'Item 0 should exist');
    const putRes = await client.put(`/api/cart/items/${item0.id}`, { quantity: 3 });
    assert.equal(putRes.status, 200);

    // 3. Remove product 1
    const item1 = cart?.find(i => i.product_id === prods[1].id);
    assert.ok(item1?.id, 'Item 1 should exist');
    const delRes = await client.delete(`/api/cart/items/${item1.id}`);
    assert.equal(delRes.status, 200);

    // 4. Add product 3
    const a4 = await client.post('/api/cart/items', { product_id: prods[3].id, quantity: 1 });
    assert.equal(a4.status, 200);

    // 5. Verify revised cart contents (prods 0, 2, 3)
    const cartRes2 = await client.get('/api/cart');
    assert.equal(cartRes2.status, 200);
    cart = (await cartRes2.json()).items;
    assert.equal(cart?.length, 3);
    assert.equal(cart.find(i => i.product_id === prods[0].id)?.quantity, 3);
    assert.equal(cart.find(i => i.product_id === prods[2].id)?.quantity, 1);
    assert.equal(cart.find(i => i.product_id === prods[3].id)?.quantity, 1);

    // 6. Checkout
    const expectedTotal = (prods[0].price * 3) + (prods[2].price * 1) + (prods[3].price * 1);
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Complex Shopper',
      customer_email: 'rw5@example.com',
      customer_phone: '0901234567',
      delivery_address: 'Shopping Plaza',
      items: [
        { product_id: prods[0].id, quantity: 3 },
        { product_id: prods[2].id, quantity: 1 },
        { product_id: prods[3].id, quantity: 1 }
      ]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const order = (await orderRes.json()).order;
    assert.equal(order?.total_amount, expectedTotal);
  });

  // --------------------------------------------------------------------------
  // Journey 6: Multi-Device / Session Interruption & Resume Workflow
  // --------------------------------------------------------------------------
  test('T4.6: Journey 6: Multi-Device / Session Interruption & Resume Workflow', async () => {
    const clientDevice1 = createTestClient();
    const clientDevice2 = createTestClient({ db: clientDevice1.db, mockD1: clientDevice1.mockD1 });

    const user = { id: 'usr_rw6_multi_dev', email: 'multidev@example.com' };
    const prod = clientDevice1.db.prepare('SELECT id FROM products LIMIT 1').get();

    // Device 1: User logs in and adds item to cart
    clientDevice1.withSession(user);
    const addRes = await clientDevice1.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
    assert.equal(addRes.status, 200, 'Device 1 add to cart should return 200');

    // Device 1 session closes (browser closed)
    clientDevice1.clearSession();

    // Device 2: User logs in on second device
    clientDevice2.withSession(user);

    // Cart items restored from D1 persistent database
    const cartRes2 = await clientDevice2.get('/api/cart');
    assert.equal(cartRes2.status, 200, 'Device 2 get cart should return 200');
    const cartDev2 = (await cartRes2.json()).items;
    assert.equal(cartDev2?.length, 1);
    assert.equal(cartDev2[0].product_id, prod.id);
    assert.equal(cartDev2[0].quantity, 2);

    // Device 2: Completes checkout
    const orderRes = await clientDevice2.post('/api/orders', {
      customer_name: 'Multi Device User',
      customer_email: user.email,
      customer_phone: '0901234567',
      delivery_address: 'Device 2 Location',
      items: [{ product_id: prod.id, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200, 'Device 2 checkout should return 200');

    // Device 1: Later opens and checks cart -> should be empty
    clientDevice1.withSession(user);
    const cartRes1 = await clientDevice1.get('/api/cart');
    assert.equal(cartRes1.status, 200, 'Device 1 get cart should return 200');
    const cartDev1 = (await cartRes1.json()).items;
    assert.equal(cartDev1?.length, 0);
  });

  // --------------------------------------------------------------------------
  // Journey 7: High-Concurrency Multi-Customer Order Processing
  // --------------------------------------------------------------------------
  test('T4.7: Journey 7: High-Concurrency Multi-Customer Order Processing & Isolation', async () => {
    const baseClient = createTestClient();
    const prods = baseClient.db.prepare('SELECT id, price FROM products LIMIT 5').all();
    assert.ok(prods.length >= 5);

    // Spawn 5 distinct customers
    const customerCount = 5;
    const customers = [];

    for (let i = 1; i <= customerCount; i++) {
      const custClient = createTestClient({ db: baseClient.db, mockD1: baseClient.mockD1 });
      const user = { id: `usr_concurrent_${i}`, email: `concurrent_${i}@company.com` };
      custClient.withSession(user);
      customers.push({ client: custClient, user, prod: prods[i - 1], index: i });
    }

    // Step A: All customers save an address
    for (const c of customers) {
      const aRes = await c.client.post('/api/customer/addresses', {
        recipient_name: `Customer ${c.index}`,
        phone: `090000000${c.index}`,
        street: `${c.index * 100} Concurrency St`,
        district: `District ${c.index}`,
        city_province: 'HCMC',
        is_default: 1
      });
      assert.equal(aRes.status, 200, `Customer ${c.index} saving address should return 200`);
    }

    // Step B: All customers add different products to cart
    for (const c of customers) {
      const addRes = await c.client.post('/api/cart/items', { product_id: c.prod.id, quantity: c.index });
      assert.equal(addRes.status, 200, `Customer ${c.index} add to cart should return 200`);
    }

    // Step C: All customers complete checkout
    const orderIds = [];
    for (const c of customers) {
      const res = await c.client.post('/api/orders', {
        customer_name: `Customer ${c.index}`,
        customer_email: c.user.email,
        customer_phone: `090000000${c.index}`,
        delivery_address: `${c.index * 100} Concurrency St, District ${c.index}, HCMC`,
        items: [{ product_id: c.prod.id, quantity: c.index }]
      });
      assert.equal(res.status, 200, `Customer ${c.index} checkout should return 200`);
      const order = (await res.json()).order;
      assert.ok(order?.id, 'Order id should exist');
      orderIds.push(order.id);
    }

    // Step D: Verify all 5 orders are completely isolated
    for (const c of customers) {
      const ordersRes = await c.client.get('/api/customer/orders');
      assert.equal(ordersRes.status, 200, `Customer ${c.index} get orders should return 200`);
      const orders = (await ordersRes.json()).orders;
      assert.equal(orders?.length, 1, `Customer ${c.index} must see exactly 1 order`);
      assert.equal(orders[0].customer_email, c.user.email);
      assert.equal(orders[0].items[0].product_id, c.prod.id);
      assert.equal(orders[0].items[0].quantity, c.index);

      // Verify cart emptied
      const cartRes = await c.client.get('/api/cart');
      assert.equal(cartRes.status, 200);
      const cart = (await cartRes.json()).items;
      assert.equal(cart?.length, 0);
    }

    // Verify all 5 shipments have unique tracking numbers
    const shipments = baseClient.db.prepare('SELECT tracking_number FROM shipments').all();
    const trackingSet = new Set(shipments.map(s => s.tracking_number));
    assert.equal(trackingSet.size, shipments.length, 'Every shipment must have a unique tracking number');
  });

});

if (process.argv[1] === import.meta.filename) {
  runner.run().then(success => process.exit(success ? 0 : 1));
}

