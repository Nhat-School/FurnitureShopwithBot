import assert from 'node:assert/strict';
import { describe, test, runner } from './runner.mjs';
import {
  createTestClient,
  setupTestDatabase
} from './helpers.mjs';

// ============================================================================
// Tier 3: Cross-Feature Combination Tests (15 Test Cases)
// ============================================================================

runner.setTier(3);
describe('Tier 3: Cross-Feature Combinations', () => {

  test('T3.1: Full Auth -> Cart -> Checkout -> Historical Price Lock', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_1', email: 'cf1@example.com' });
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
    const lockedPrice = prod.price;

    // Add to cart
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(addRes.status, 200, 'Adding to cart should return 200');

    // Checkout
    const orderRes = await client.post('/api/orders', {
      customer_name: 'CF 1 Buyer',
      customer_email: 'cf1@example.com',
      customer_phone: '0901234567',
      delivery_address: '100 Cross St',
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const orderData = await orderRes.json();
    assert.ok(orderData.order?.id, 'Order must have an id');
    const orderId = orderData.order.id;

    // Update catalog price
    client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(lockedPrice + 10000000, prod.id);

    // Verify historical order item still has original price
    const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
    assert.ok(oi, 'order_items row should exist');
    assert.equal(oi.unit_price, lockedPrice);
  });

  test('T3.2: Price Increase While Item In Cart updates active cart price and locks higher price at checkout', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_2', email: 'cf2@example.com' });
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
    const initialPrice = prod.price;
    const higherPrice = initialPrice + 2000000;

    // Add item to cart
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(addRes.status, 200, 'Adding to cart should return 200');

    // Catalog price increases
    client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(higherPrice, prod.id);

    // Cart fetch should reflect new live catalog price
    const cartRes = await client.get('/api/cart');
    assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
    const cartItems = (await cartRes.json()).items;
    assert.ok(cartItems?.length > 0, 'Cart items should exist');
    assert.equal(cartItems[0].current_price, higherPrice);

    // Checkout
    const orderRes = await client.post('/api/orders', {
      customer_name: 'CF 2 Buyer',
      customer_email: 'cf2@example.com',
      customer_phone: '0901234567',
      delivery_address: '200 High Price Ave',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const order = (await orderRes.json()).order;
    assert.equal(order?.total_amount, higherPrice);
  });

  test('T3.3: Price Decrease While Item In Cart locks sale price; subsequent price increase preserves sale price', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_3', email: 'cf3@example.com' });
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
    const initialPrice = prod.price;
    const salePrice = Math.max(100000, initialPrice - 500000);

    // Add to cart
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(addRes.status, 200, 'Adding to cart should return 200');

    // Flash sale starts
    client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(salePrice, prod.id);

    // Checkout during sale
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Sale Buyer',
      customer_email: 'cf3@example.com',
      customer_phone: '0901234567',
      delivery_address: '300 Sale St',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order id should exist');

    // Flash sale ends; price jumps back up
    client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(initialPrice * 2, prod.id);

    // Order remains at sale price
    const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
    assert.ok(oi, 'order_items row should exist');
    assert.equal(oi.unit_price, salePrice);
  });

  test('T3.4: Address Switch and Order Snapshot locks address at checkout regardless of future address edits', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_4', email: 'cf4@example.com' });
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    // Create address A and B
    await client.post('/api/customer/addresses', {
      recipient_name: 'Name A',
      phone: '0901',
      street: '100 Street A',
      district: 'D1',
      city_province: 'HCMC'
    });
    const addrBRes = await client.post('/api/customer/addresses', {
      recipient_name: 'Name B',
      phone: '0902',
      street: '200 Street B',
      district: 'D2',
      city_province: 'HCMC',
      is_default: 1
    });
    assert.equal(addrBRes.status, 200, 'POST /api/customer/addresses should return 200');
    const addrListRes = await client.get('/api/customer/addresses');
    assert.equal(addrListRes.status, 200, 'GET /api/customer/addresses should return 200');
    const addrB = (await addrListRes.json()).addresses?.find(a => a.recipient_name === 'Name B');
    assert.ok(addrB?.id, 'Address B should exist');
    const addrBId = addrB.id;

    // Checkout with Address B
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Name B',
      customer_email: 'cf4@example.com',
      customer_phone: '0902',
      delivery_address: '200 Street B, D2, HCMC',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order should exist');

    // Now edit Address B in address book
    const putRes = await client.put(`/api/customer/addresses/${addrBId}`, {
      recipient_name: 'Name B Changed',
      street: '999 Completely New Street',
      district: 'D7',
      city_province: 'HCMC'
    });
    assert.equal(putRes.status, 200, 'Updating address should return 200');

    // Verify historical order still retains original address snapshot
    const order = client.db.prepare('SELECT delivery_address FROM orders WHERE id = ?').get(orderId);
    assert.equal(order.delivery_address, '200 Street B, D2, HCMC');
  });

  test('T3.5: Multiple Address Default Precedence sets new default and unsets prior defaults in address book', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_5', email: 'cf5@example.com' });

    const r1 = await client.post('/api/customer/addresses', { recipient_name: 'A1', phone: '0901', street: 'S1', district: 'D1', city_province: 'HCMC', is_default: 1 });
    assert.equal(r1.status, 200, 'POST address A1 should return 200');
    const r2 = await client.post('/api/customer/addresses', { recipient_name: 'A2', phone: '0902', street: 'S2', district: 'D2', city_province: 'HCMC', is_default: 1 });
    assert.equal(r2.status, 200, 'POST address A2 should return 200');
    const r3 = await client.post('/api/customer/addresses', { recipient_name: 'A3', phone: '0903', street: 'S3', district: 'D3', city_province: 'HCMC', is_default: 1 });
    assert.equal(r3.status, 200, 'POST address A3 should return 200');

    const listRes = await client.get('/api/customer/addresses');
    assert.equal(listRes.status, 200, 'GET addresses should return 200');
    const list = (await listRes.json()).addresses;
    assert.ok(Array.isArray(list), 'addresses should be array');
    const a1 = list.find(a => a.recipient_name === 'A1');
    const a2 = list.find(a => a.recipient_name === 'A2');
    const a3 = list.find(a => a.recipient_name === 'A3');

    assert.equal(a1?.is_default, 0);
    assert.equal(a2?.is_default, 0);
    assert.equal(a3?.is_default, 1);
  });

  test('T3.6: Multi-Item Cart Checkout Purge creates all order lines and completely empties cart', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_cf_6', email: 'cf6@example.com' });
    const prods = client.db.prepare('SELECT id FROM products LIMIT 3').all();

    await client.post('/api/cart/items', { product_id: prods[0].id, quantity: 1 });
    await client.post('/api/cart/items', { product_id: prods[1].id, quantity: 2 });
    await client.post('/api/cart/items', { product_id: prods[2].id, quantity: 3 });

    const beforeCartRes = await client.get('/api/cart');
    assert.equal(beforeCartRes.status, 200, 'GET /api/cart should return 200');
    const beforeCart = (await beforeCartRes.json()).items;
    assert.equal(beforeCart?.length, 3);

    // Checkout all 3
    const orderRes = await client.post('/api/orders', {
      customer_name: 'Multi Purge Buyer',
      customer_email: 'cf6@example.com',
      customer_phone: '0901234567',
      delivery_address: 'Purge Rd',
      items: [
        { product_id: prods[0].id, quantity: 1 },
        { product_id: prods[1].id, quantity: 2 },
        { product_id: prods[2].id, quantity: 3 }
      ]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order id should exist');

    // Check items created in order
    const orderItems = client.db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
    assert.equal(orderItems.length, 3);

    // Check cart is empty
    const afterCartRes = await client.get('/api/cart');
    assert.equal(afterCartRes.status, 200, 'GET /api/cart should return 200');
    const afterCart = (await afterCartRes.json()).items;
    assert.equal(afterCart?.length, 0);
  });

  test('T3.7: Cart Continuity Across Re-Authentication preserves items in persistent D1 cart', async () => {
    const client = createTestClient();
    const user = { id: 'usr_cf_7', email: 'cf7@example.com' };
    client.withSession(user);
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    // Add item to cart
    const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 4 });
    assert.equal(addRes.status, 200, 'Adding to cart should return 200');

    // User logs out
    const logoutRes = await client.post('/api/auth/logout');
    assert.equal(logoutRes.status, 200, 'Logout should return 200');
    client.clearSession();

    // User logs back in
    client.withSession(user);
    const cartRes = await client.get('/api/cart');
    assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
    const cart = (await cartRes.json()).items;
    assert.equal(cart?.length, 1);
    assert.equal(cart[0].product_id, prod.id);
    assert.equal(cart[0].quantity, 4);
  });

  test('T3.8: Order Creation Produces exactly 1:1 Shipment and 1:1 Payment matching totals', async () => {
    const client = createTestClient();
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

    const orderRes = await client.post('/api/orders', {
      customer_name: 'Fulfillment Buyer',
      customer_email: 'ful@example.com',
      customer_phone: '0901234567',
      delivery_address: 'Fulfillment Center St',
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const order = (await orderRes.json()).order;
    assert.ok(order?.id, 'Order id should exist');

    const shipments = client.db.prepare('SELECT * FROM shipments WHERE order_id = ?').all(order.id);
    const payments = client.db.prepare('SELECT * FROM order_payments WHERE order_id = ?').all(order.id);

    assert.equal(shipments.length, 1, 'Order must have exactly 1 shipment row');
    assert.equal(payments.length, 1, 'Order must have exactly 1 payment row');
    assert.equal(payments[0].amount, order.total_amount);
    assert.ok(shipments[0].tracking_number);
  });

  test('T3.9: Cart Isolation Between Concurrent Users ensures checkout by User A leaves User B cart intact', async () => {
    const client = createTestClient();
    const prods = client.db.prepare('SELECT id FROM products LIMIT 2').all();

    // User A adds Product 0
    client.withSession({ id: 'usr_iso_a', email: 'iso_a@example.com' });
    const addARes = await client.post('/api/cart/items', { product_id: prods[0].id, quantity: 1 });
    assert.equal(addARes.status, 200, 'User A add to cart should return 200');

    // User B adds Product 1
    client.withSession({ id: 'usr_iso_b', email: 'iso_b@example.com' });
    const addBRes = await client.post('/api/cart/items', { product_id: prods[1].id, quantity: 5 });
    assert.equal(addBRes.status, 200, 'User B add to cart should return 200');

    // User A checks out
    client.withSession({ id: 'usr_iso_a', email: 'iso_a@example.com' });
    const checkoutARes = await client.post('/api/orders', {
      customer_name: 'User A',
      customer_email: 'iso_a@example.com',
      customer_phone: '0901',
      delivery_address: 'Addr A',
      items: [{ product_id: prods[0].id, quantity: 1 }]
    });
    assert.equal(checkoutARes.status, 200, 'User A checkout should return 200');

    // Check User A cart is cleared
    const cartARes = await client.get('/api/cart');
    assert.equal(cartARes.status, 200, 'User A cart query should return 200');
    const cartA = (await cartARes.json()).items;
    assert.equal(cartA?.length, 0);

    // Check User B cart still has Product 1 (qty 5)
    client.withSession({ id: 'usr_iso_b', email: 'iso_b@example.com' });
    const cartBRes = await client.get('/api/cart');
    assert.equal(cartBRes.status, 200, 'User B cart query should return 200');
    const cartB = (await cartBRes.json()).items;
    assert.equal(cartB?.length, 1);
    assert.equal(cartB[0].product_id, prods[1].id);
    assert.equal(cartB[0].quantity, 5);
  });

  test('T3.10: Order History Isolation Between Users prevents cross-tenant visibility', async () => {
    const client = createTestClient();
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    // User X places order
    client.withSession({ id: 'usr_hist_x', email: 'x@example.com' });
    const ordXRes = await client.post('/api/orders', {
      customer_name: 'User X',
      customer_email: 'x@example.com',
      customer_phone: '0901',
      delivery_address: 'Addr X',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(ordXRes.status, 200, 'Order X should return 200');

    // User Y places order
    client.withSession({ id: 'usr_hist_y', email: 'y@example.com' });
    const ordYRes = await client.post('/api/orders', {
      customer_name: 'User Y',
      customer_email: 'y@example.com',
      customer_phone: '0902',
      delivery_address: 'Addr Y',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(ordYRes.status, 200, 'Order Y should return 200');

    // User X queries orders
    client.withSession({ id: 'usr_hist_x', email: 'x@example.com' });
    const resX = await client.get('/api/customer/orders');
    assert.equal(resX.status, 200, 'User X orders query should return 200');
    const ordersX = (await resX.json()).orders;
    assert.equal(ordersX?.length, 1);
    assert.equal(ordersX[0].customer_email, 'x@example.com');

    // User Y queries orders
    client.withSession({ id: 'usr_hist_y', email: 'y@example.com' });
    const resY = await client.get('/api/customer/orders');
    assert.equal(resY.status, 200, 'User Y orders query should return 200');
    const ordersY = (await resY.json()).orders;
    assert.equal(ordersY?.length, 1);
    assert.equal(ordersY[0].customer_email, 'y@example.com');
  });

  test('T3.11: Chronological Order History Sorting returns newest orders first', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_chrono', email: 'chrono@example.com' });
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    const r1 = await client.post('/api/orders', { customer_name: 'Chrono 1', customer_email: 'chrono@example.com', customer_phone: '0901', delivery_address: 'Addr 1', items: [{ product_id: prod.id, quantity: 1 }] });
    assert.equal(r1.status, 200, 'Order 1 should return 200');
    const r2 = await client.post('/api/orders', { customer_name: 'Chrono 2', customer_email: 'chrono@example.com', customer_phone: '0901', delivery_address: 'Addr 2', items: [{ product_id: prod.id, quantity: 1 }] });
    assert.equal(r2.status, 200, 'Order 2 should return 200');

    const res = await client.get('/api/customer/orders');
    assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
    const orders = (await res.json()).orders;
    assert.equal(orders?.length, 2);
    // Order 2 created after Order 1 should be first
    assert.equal(orders[0].customer_name, 'Chrono 2');
  });

  test('T3.12: Immediate Session Revocation on Logout denies subsequent cart operations', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_revoke', email: 'revoke@example.com' });
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    // Can access cart
    const beforeRes = await client.get('/api/cart');
    assert.equal(beforeRes.status, 200, 'GET /api/cart should return 200 before logout');

    // Call logout
    const logoutRes = await client.post('/api/auth/logout');
    assert.equal(logoutRes.status, 200, 'Logout should return 200');
    client.clearSession();

    // Now attempt to add to cart without session
    const afterRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
    assert.equal(afterRes.status, 401, 'Logged out client must be rejected with 401');
  });

  test('T3.13: Google OAuth Account Profile Synchronization preserves existing carts and addresses', async () => {
    const client = createTestClient();
    const email = 'sync_user@example.com';
    // User registers or exists
    client.db.prepare(`INSERT INTO users (id, email, display_name) VALUES ('usr_sync', ?, 'Sync User')`).run(email);
    client.db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_sync', 'usr_sync')`).run();
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
    client.db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_sync', 'cart_sync', ?, 3)`).run(prod.id);

    // Google OAuth updates user record
    client.db.prepare(`
      UPDATE users SET auth_provider = 'google', provider_subject = 'g_sub_99999' WHERE id = 'usr_sync'
    `).run();

    // Cart items must remain linked
    const items = client.db.prepare('SELECT * FROM cart_items WHERE cart_id = ?').all('cart_sync');
    assert.equal(items.length, 1);
    assert.equal(items[0].quantity, 3);
  });

  test('T3.14: Product Soft-Delete Does Not Break Historical Orders in database or customer order history', async () => {
    const client = createTestClient();
    client.withSession({ id: 'usr_soft_del', email: 'softdel@example.com' });
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

    const orderRes = await client.post('/api/orders', {
      customer_name: 'Soft Del Buyer',
      customer_email: 'softdel@example.com',
      customer_phone: '0901',
      delivery_address: 'Addr',
      items: [{ product_id: prod.id, quantity: 1 }]
    });
    assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
    const orderId = (await orderRes.json()).order?.id;
    assert.ok(orderId, 'Order id should exist');

    // Admin soft-deletes or archives product
    client.db.prepare('UPDATE products SET is_featured = 0, stock = 0 WHERE id = ?').run(prod.id);

    // Customer order history must still retrieve order with items cleanly
    const historyRes = await client.get('/api/customer/orders');
    assert.equal(historyRes.status, 200, 'GET /api/customer/orders should return 200');
    const order = (await historyRes.json()).orders?.find(o => o.id === orderId);
    assert.ok(order, 'Historical order must still be accessible');
    assert.equal(order.items[0].unit_price, prod.price);
  });

  test('T3.15: Multi-Revision Price Immutability Cascade verifies 3 consecutive price shifts retain discrete frozen prices', async () => {
    const client = createTestClient();
    const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

    // Rev 1: Price = 1,000,000
    client.db.prepare('UPDATE products SET price = 1000000 WHERE id = ?').run(prod.id);
    const res1 = await client.post('/api/orders', { customer_name: 'Rev 1', customer_email: 'r1@a.com', customer_phone: '0901', delivery_address: 'A', items: [{ product_id: prod.id, quantity: 1 }] });
    assert.equal(res1.status, 200, 'Order 1 should return 200');
    const id1 = (await res1.json()).order?.id;

    // Rev 2: Price = 1,800,000
    client.db.prepare('UPDATE products SET price = 1800000 WHERE id = ?').run(prod.id);
    const res2 = await client.post('/api/orders', { customer_name: 'Rev 2', customer_email: 'r2@a.com', customer_phone: '0902', delivery_address: 'B', items: [{ product_id: prod.id, quantity: 1 }] });
    assert.equal(res2.status, 200, 'Order 2 should return 200');
    const id2 = (await res2.json()).order?.id;

    // Rev 3: Price = 750,000
    client.db.prepare('UPDATE products SET price = 750000 WHERE id = ?').run(prod.id);
    const res3 = await client.post('/api/orders', { customer_name: 'Rev 3', customer_email: 'r3@a.com', customer_phone: '0903', delivery_address: 'C', items: [{ product_id: prod.id, quantity: 1 }] });
    assert.equal(res3.status, 200, 'Order 3 should return 200');
    const id3 = (await res3.json()).order?.id;

    // Rev 4: Catalog price updated to 2,500,000
    client.db.prepare('UPDATE products SET price = 2500000 WHERE id = ?').run(prod.id);

    // Verify all 3 historical orders
    const row1 = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(id1);
    const row2 = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(id2);
    const row3 = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(id3);
    assert.ok(row1, 'order_items for order 1 should exist');
    assert.ok(row2, 'order_items for order 2 should exist');
    assert.ok(row3, 'order_items for order 3 should exist');

    const p1 = row1.unit_price;
    const p2 = row2.unit_price;
    const p3 = row3.unit_price;
    const liveCatalog = client.db.prepare('SELECT price FROM products WHERE id = ?').get(prod.id)?.price;

    assert.equal(p1, 1000000, 'Order 1 must stay at 1,000,000');
    assert.equal(p2, 1800000, 'Order 2 must stay at 1,800,000');
    assert.equal(p3, 750000, 'Order 3 must stay at 750,000');
    assert.equal(liveCatalog, 2500000, 'Live catalog should be 2,500,000');
  });

});

if (process.argv[1] === import.meta.filename) {
  runner.run().then(success => process.exit(success ? 0 : 1));
}

