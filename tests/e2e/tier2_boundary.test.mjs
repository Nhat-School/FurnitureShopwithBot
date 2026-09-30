import assert from 'node:assert/strict';
import { describe, test, runner } from './runner.mjs';
import {
  setupTestDatabase,
  createTestClient,
  signSessionToken,
  base64UrlEncode,
  DEFAULT_SESSION_SECRET
} from './helpers.mjs';

// ============================================================================
// Tier 2: Boundary & Error Condition Verification - 65 Test Cases
// ============================================================================

runner.setTier(2);
describe('Tier 2: Boundary & Error Conditions', () => {

  // --------------------------------------------------------------------------
  // B1: Google OAuth Boundary & Malformed Inputs (5 tests)
  // --------------------------------------------------------------------------
  describe('B1: Google OAuth Boundary & Malformed Inputs', () => {
    test('T2.1: Callback with missing state parameter redirects with google_invalid_state error', async () => {
      const client = createTestClient();
      client.setCookie('fur_google_oauth_state', 'expected_state_1234567890123456789012');
      client.setCookie('fur_google_oauth_verifier', 'verifier_1234567890123456789012345678901234567890');

      const res = await client.get('/api/auth/google/callback?code=some_auth_code');
      assert.equal(res.status, 302);
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_invalid_state'));
    });

    test('T2.2: Callback with missing code parameter redirects with error', async () => {
      const client = createTestClient();
      client.setCookie('fur_google_oauth_state', 'state_abc123');
      const res = await client.get('/api/auth/google/callback?state=state_abc123');
      assert.equal(res.status, 302);
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_invalid_state'));
    });

    test('T2.3: Callback with tampered state parameter redirects with state mismatch error', async () => {
      const client = createTestClient();
      client.setCookie('fur_google_oauth_state', 'legit_state_value_123456789012345678');

      // Attacker sends different state
      const res = await client.get('/api/auth/google/callback?code=auth_code&state=forged_state_value_999999999999999999');
      assert.equal(res.status, 302);
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_invalid_state'));
    });

    test('T2.4: Callback with missing verifier cookie fails PKCE exchange', async () => {
      const client = createTestClient();
      client.setCookie('fur_google_oauth_state', 'valid_state_1234567890123456789012');
      // No verifier cookie set
      const res = await client.get('/api/auth/google/callback?code=some_code&state=valid_state_1234567890123456789012');
      assert.equal(res.status, 302);
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_invalid_state'));
    });

    test('T2.5: Callback with error=access_denied clears cookies and redirects to destination', async () => {
      const client = createTestClient();
      client.setCookie('fur_google_oauth_state', 'state_value');
      client.setCookie('fur_google_oauth_verifier', 'verifier_value');

      const res = await client.get('/api/auth/google/callback?error=access_denied');
      assert.equal(res.status, 302);
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_access_denied'));
      assert.equal(client.cookieJar['fur_google_oauth_state'], undefined, 'OAuth state cookie must be cleared');
      assert.equal(client.cookieJar['fur_google_oauth_verifier'], undefined, 'OAuth verifier cookie must be cleared');
    });
  });

  // --------------------------------------------------------------------------
  // B2: Session Cookie Tampering & Expiry (5 tests)
  // --------------------------------------------------------------------------
  describe('B2: Session Cookie Tampering & Expiry', () => {
    test('T2.6: GET /api/auth/me with malformed cookie format (no dot delimiter) returns 401', async () => {
      const client = createTestClient();
      client.setCookie('fur_session', 'malformed_token_without_dot');
      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401);
      const data = await res.json();
      assert.equal(data.user, null);
    });

    test('T2.7: GET /api/auth/me with tampered payload and original signature returns 401', async () => {
      const client = createTestClient();
      const legitToken = await signSessionToken({ id: 'usr_legit', email: 'legit@example.com', role: 'customer' }, DEFAULT_SESSION_SECRET);
      const [_, sig] = legitToken.split('.');

      // Attacker swaps payload to admin email
      const forgedPayload = base64UrlEncode(JSON.stringify({ id: 'usr_hacked', email: 'admin@example.com', role: 'admin' }));
      const forgedToken = `${forgedPayload}.${sig}`;

      client.setCookie('fur_session', forgedToken);
      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401, 'Tampered payload with unmatching signature must return 401');
    });

    test('T2.8: GET /api/auth/me with token signed by invalid secret returns 401', async () => {
      const client = createTestClient();
      const rogueToken = await signSessionToken({ id: 'usr_rogue', email: 'rogue@example.com' }, 'wrong-secret-key-different-hash');
      client.setCookie('fur_session', rogueToken);

      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401, 'Token signed with wrong key must return 401');
    });

    test('T2.9: GET /api/auth/me with expired timestamp returns 401', async () => {
      const client = createTestClient();
      const expiredPayload = {
        id: 'usr_expired',
        email: 'expired@example.com',
        exp: Math.floor(Date.now() / 1000) - 3600 // 1 hour in the past
      };
      const expiredToken = await signSessionToken(expiredPayload, DEFAULT_SESSION_SECRET);
      client.setCookie('fur_session', expiredToken);

      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401, 'Expired session token must return 401');
    });

    test('T2.10: GET /api/auth/me with empty or whitespace session cookie returns 401', async () => {
      const client = createTestClient();
      client.setCookie('fur_session', '   ');
      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401);
    });
  });

  // --------------------------------------------------------------------------
  // B3: Cart Quantity & Item Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('B3: Cart Quantity & Item Boundaries', () => {
    test('T2.11: POST /api/cart/items with quantity = 0 rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_b_qty0', email: 'qty0@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: 0 });
      assert.equal(res.status, 400, 'Adding item with quantity 0 must be rejected with 400');
    });

    test('T2.12: POST /api/cart/items with negative quantity (-1) rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_b_neg', email: 'neg@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: -1 });
      assert.equal(res.status, 400, 'Adding item with negative quantity must be rejected with 400');
    });

    test('T2.13: POST /api/cart/items with non-numeric quantity rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_b_nan', email: 'nan@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: 'two' });
      assert.equal(res.status, 400, 'Non-numeric quantity must be rejected with 400');
    });

    test('T2.14: POST /api/cart/items with missing product_id rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_b_noprod', email: 'noprod@example.com' });

      const res = await client.post('/api/cart/items', { quantity: 1 });
      assert.equal(res.status, 400, 'Missing product_id must return 400');
    });

    test('T2.15: POST /api/cart/items referencing non-existent product ID returns 404 or 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_b_fake_prod', email: 'fakeprod@example.com' });

      const res = await client.post('/api/cart/items', { product_id: 'prod_does_not_exist_404', quantity: 1 });
      assert.ok([400, 404].includes(res.status), `Expected 400 or 404, got ${res.status}`);
    });
  });

  // --------------------------------------------------------------------------
  // B4: Cart Authorization & Scope Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('B4: Cart Authorization & Scope Boundaries', () => {
    test('T2.16: GET /api/cart unauthenticated access returns 401 or empty guest cart', async () => {
      const client = createTestClient();
      const res = await client.get('/api/cart');
      assert.ok([200, 401].includes(res.status));
      if (res.status === 200) {
        const data = await res.json();
        assert.equal(data.items.length, 0);
      }
    });

    test('T2.17: POST /api/cart/items unauthenticated returns 401', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
      assert.equal(res.status, 401, 'Unauthenticated add to persistent cart must return 401');
    });

    test('T2.18: PUT /api/cart/items/:id attempting to modify another user cart item returns 403 or 404', async () => {
      const client = createTestClient();
      // User A adds item to cart
      client.withSession({ id: 'usr_cart_owner', email: 'owner@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
      const cartData = await (await client.get('/api/cart')).json();
      const itemId = cartData.items[0].id;

      // User B attempts to modify User A's item
      client.withSession({ id: 'usr_cart_intruder', email: 'intruder@example.com' });
      const putRes = await client.put(`/api/cart/items/${itemId}`, { quantity: 99 });
      assert.ok([403, 404].includes(putRes.status), `Cross-tenant cart modification must be forbidden (got ${putRes.status})`);
    });

    test('T2.19: DELETE /api/cart/items/:id attempting to delete another user cart item returns 403 or 404', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_cart_victim', email: 'victim@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
      const itemId = (await (await client.get('/api/cart')).json()).items[0].id;

      // User B attempts delete
      client.withSession({ id: 'usr_cart_thief', email: 'thief@example.com' });
      const delRes = await client.delete(`/api/cart/items/${itemId}`);
      assert.ok([403, 404].includes(delRes.status), `Cross-tenant cart deletion must be forbidden (got ${delRes.status})`);
    });

    test('T2.20: DELETE /api/cart/items/:id with non-existent item ID returns 404 or handles gracefully', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_cart_del_none', email: 'delnone@example.com' });
      const res = await client.delete('/api/cart/items/non_existent_item_id_9999');
      assert.ok([200, 404].includes(res.status));
    });
  });

  // --------------------------------------------------------------------------
  // B5: Empty Cart & Invalid Checkout Boundaries (5 tests)
  // --------------------------------------------------------------------------
  describe('B5: Empty Cart & Invalid Checkout Boundaries', () => {
    test('T2.21: POST /api/orders with empty items array rejected with 400', async () => {
      const client = createTestClient();
      const res = await client.post('/api/orders', {
        customer_name: 'Empty Buyer',
        customer_email: 'empty@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 Empty Lane',
        items: []
      });
      assert.equal(res.status, 400, 'Orders with empty items array must return 400 Bad Request');
    });

    test('T2.22: POST /api/orders with missing items field rejected with 400', async () => {
      const client = createTestClient();
      const res = await client.post('/api/orders', {
        customer_name: 'No Items Buyer',
        customer_email: 'noitems@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 Lane'
      });
      assert.equal(res.status, 400, 'Orders without items field must return 400 Bad Request');
    });

    test('T2.23: POST /api/orders with missing customer_name rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/orders', {
        customer_email: 'noname@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 St',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, 'Missing customer_name must return 400');
    });

    test('T2.24: POST /api/orders with missing customer_phone rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/orders', {
        customer_name: 'No Phone',
        customer_email: 'nophone@example.com',
        delivery_address: '123 St',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, 'Missing customer_phone must return 400');
    });

    test('T2.25: POST /api/orders with missing delivery_address rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/orders', {
        customer_name: 'No Address',
        customer_email: 'noaddress@example.com',
        customer_phone: '0901234567',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 400, 'Missing delivery_address must return 400');
    });
  });

  // --------------------------------------------------------------------------
  // B6: Malformed Order Payloads & Data Types (5 tests)
  // --------------------------------------------------------------------------
  describe('B6: Malformed Order Payloads & Data Types', () => {
    test('T2.26: POST /api/orders with item quantity <= 0 rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/orders', {
        customer_name: 'Zero Qty',
        customer_email: 'zq@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Address',
        items: [{ product_id: prod.id, quantity: 0 }]
      });
      assert.equal(res.status, 400, 'Item quantity <= 0 must return 400');
    });

    test('T2.27: POST /api/orders with non-integer quantity (1.5) rejected with 400', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const res = await client.post('/api/orders', {
        customer_name: 'Float Qty',
        customer_email: 'float@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Address',
        items: [{ product_id: prod.id, quantity: 1.5 }]
      });
      assert.equal(res.status, 400, 'Non-integer quantity must return 400');
    });

    test('T2.28: POST /api/orders referencing non-existent product ID rejected with 400 or 404', async () => {
      const client = createTestClient();
      const res = await client.post('/api/orders', {
        customer_name: 'Fake Prod',
        customer_email: 'fakeprod@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Address',
        items: [{ product_id: 'prod_ghost_9999', quantity: 1 }]
      });
      assert.ok([400, 404].includes(res.status), `Non-existent product ID should return 400/404 (got ${res.status})`);
    });

    test('T2.29: POST /api/orders with empty JSON body rejected with 400', async () => {
      const client = createTestClient();
      const res = await client.post('/api/orders', {});
      assert.equal(res.status, 400, 'Empty body must return 400');
    });

    test('T2.30: POST /api/orders with invalid JSON string syntax returns 400', async () => {
      const client = createTestClient();
      const res = await client.request('POST', '/api/orders', {
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed_json: true, '
      });
      assert.equal(res.status, 400, 'Malformed JSON must return 400');
    });
  });

  // --------------------------------------------------------------------------
  // B7: Price Tampering Defense (6 tests)
  // --------------------------------------------------------------------------
  describe('B7: Price Tampering Defense', () => {
    test('T2.31: Client-sent item price is ignored; server locks D1 catalog price', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      // Client attempts to pay 1 VND instead of catalog price
      const res = await client.post('/api/orders', {
        customer_name: 'Attacker Price',
        customer_email: 'attacker@example.com',
        customer_phone: '0901234567',
        delivery_address: '1 Hacker Way',
        items: [{ product_id: prod.id, quantity: 1, price: 1, unit_price: 1 }]
      });

      assert.equal(res.status, 200);
      const order = (await res.json()).order;
      assert.equal(order.total_amount, prod.price, 'Total must equal database catalog price, ignoring client spoofed price');
    });

    test('T2.32: Client-sent unit_price = 0 is strictly overridden by catalog price', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Freebie Attempt',
        customer_email: 'free@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Free St',
        items: [{ product_id: prod.id, quantity: 2, unit_price: 0 }]
      });

      const orderId = (await res.json()).order.id;
      const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
      assert.equal(oi.unit_price, prod.price);
    });

    test('T2.33: Client-sent total_amount is recalculated and overridden by server', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Spoofed Total',
        customer_email: 'spoof@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Spoof Ave',
        total_amount: 100, // Client claimed total
        items: [{ product_id: prod.id, quantity: 3 }]
      });

      const order = (await res.json()).order;
      assert.equal(order.total_amount, prod.price * 3);
    });

    test('T2.34: Order unit_price remains locked when catalog price increases right after checkout', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
      const initialPrice = prod.price;

      const res = await client.post('/api/orders', {
        customer_name: 'Lock Buyer',
        customer_email: 'lock@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Locked St',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      const orderId = (await res.json()).order.id;

      // Price increases by 50%
      client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(initialPrice * 1.5, prod.id);

      const oi = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
      assert.equal(oi.unit_price, initialPrice);
    });

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
  });

  // --------------------------------------------------------------------------
  // B8: Address Book Validation & Missing Fields (5 tests)
  // --------------------------------------------------------------------------
  describe('B8: Address Book Validation & Missing Fields', () => {
    test('T2.36: POST /api/customer/addresses without authentication returns 401', async () => {
      const client = createTestClient();
      const res = await client.post('/api/customer/addresses', {
        recipient_name: 'Anon',
        phone: '0901',
        street: 'Street',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(res.status, 401);
    });

    test('T2.37: POST /api/customer/addresses with missing recipient_name rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_val', email: 'addrval@example.com' });

      const res = await client.post('/api/customer/addresses', {
        phone: '0901234567',
        street: '123 St',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(res.status, 400, 'Missing recipient_name must return 400');
    });

    test('T2.38: POST /api/customer/addresses with missing phone rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_val2', email: 'addrval2@example.com' });

      const res = await client.post('/api/customer/addresses', {
        recipient_name: 'Bob',
        street: '123 St',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(res.status, 400, 'Missing phone must return 400');
    });

    test('T2.39: POST /api/customer/addresses with missing street rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_val3', email: 'addrval3@example.com' });

      const res = await client.post('/api/customer/addresses', {
        recipient_name: 'Bob',
        phone: '0901234567',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(res.status, 400, 'Missing street must return 400');
    });

    test('T2.40: POST /api/customer/addresses with missing city_province rejected with 400', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_val4', email: 'addrval4@example.com' });

      const res = await client.post('/api/customer/addresses', {
        recipient_name: 'Bob',
        phone: '0901234567',
        street: '123 St',
        district: 'D1'
      });
      assert.equal(res.status, 400, 'Missing city_province must return 400');
    });
  });

  // --------------------------------------------------------------------------
  // B9: Address Isolation & Unauthorized Modifications (5 tests)
  // --------------------------------------------------------------------------
  describe('B9: Address Isolation & Unauthorized Modifications', () => {
    test('T2.41: GET /api/customer/addresses returns only caller addresses (no cross-tenant leakage)', async () => {
      const client = createTestClient();
      // User A creates address
      client.withSession({ id: 'usr_tenant_a', email: 'tenant_a@example.com' });
      await client.post('/api/customer/addresses', {
        recipient_name: 'Tenant A',
        phone: '0901',
        street: 'Street A',
        district: 'D1',
        city_province: 'City'
      });

      // User B queries addresses
      client.withSession({ id: 'usr_tenant_b', email: 'tenant_b@example.com' });
      const res = await client.get('/api/customer/addresses');
      assert.equal(res.status, 200, 'GET /api/customer/addresses should return 200');
      const data = await res.json();
      assert.equal(data.addresses?.length, 0, 'User B must not see User A addresses');
    });

    test('T2.42: PUT /api/customer/addresses/:id attempting to modify another user address returns 403 or 404', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_orig', email: 'orig@example.com' });
      const addRes = await client.post('/api/customer/addresses', {
        recipient_name: 'Original',
        phone: '0901',
        street: 'Orig St',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(addRes.status, 200, 'POST /api/customer/addresses should return 200');
      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET /api/customer/addresses should return 200');
      const addrId = (await listRes.json()).addresses?.[0]?.id;
      assert.ok(addrId, 'Address ID should exist');

      // Rogue user attempts update
      client.withSession({ id: 'usr_addr_rogue', email: 'rogue@example.com' });
      const putRes = await client.put(`/api/customer/addresses/${addrId}`, { recipient_name: 'Hacked Name' });
      assert.ok([403, 404].includes(putRes.status));
    });

    test('T2.43: DELETE /api/customer/addresses/:id attempting to delete another user address returns 403 or 404', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_orig_del', email: 'origdel@example.com' });
      const addRes = await client.post('/api/customer/addresses', {
        recipient_name: 'To Delete',
        phone: '0901',
        street: 'Del St',
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(addRes.status, 200, 'POST /api/customer/addresses should return 200');
      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET /api/customer/addresses should return 200');
      const addrId = (await listRes.json()).addresses?.[0]?.id;
      assert.ok(addrId, 'Address ID should exist');

      // Attacker attempts delete
      client.withSession({ id: 'usr_addr_attacker', email: 'attacker@example.com' });
      const delRes = await client.delete(`/api/customer/addresses/${addrId}`);
      assert.ok([403, 404].includes(delRes.status));
    });

    test('T2.44: Setting is_default=1 on one address resets is_default=0 on prior addresses of same user', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_default_reset', email: 'defreset@example.com' });

      const r1 = await client.post('/api/customer/addresses', {
        recipient_name: 'First Addr',
        phone: '0901',
        street: 'Street 1',
        district: 'D1',
        city_province: 'City',
        is_default: 1
      });
      assert.equal(r1.status, 200, 'POST address 1 should return 200');

      const r2 = await client.post('/api/customer/addresses', {
        recipient_name: 'Second Addr',
        phone: '0902',
        street: 'Street 2',
        district: 'D2',
        city_province: 'City',
        is_default: 1
      });
      assert.equal(r2.status, 200, 'POST address 2 should return 200');

      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET addresses should return 200');
      const list = (await listRes.json()).addresses;
      assert.ok(Array.isArray(list), 'addresses should be array');
      const first = list.find(a => a.recipient_name === 'First Addr');
      const second = list.find(a => a.recipient_name === 'Second Addr');
      assert.equal(first?.is_default, 0);
      assert.equal(second?.is_default, 1);
    });

    test('T2.45: Deleting an address does not corrupt or cascade delete historical order delivery address', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_hist_addr_del', email: 'histaddr@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const addrRes = await client.post('/api/customer/addresses', {
        recipient_name: 'Hist Buyer',
        phone: '0901234567',
        street: '999 Permanent Address Way',
        district: 'D1',
        city_province: 'HCMC'
      });
      assert.equal(addrRes.status, 200, 'POST /api/customer/addresses should return 200');
      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET /api/customer/addresses should return 200');
      const addrId = (await listRes.json()).addresses?.[0]?.id;
      assert.ok(addrId, 'Address ID should exist');

      // Place order with this address
      const orderRes = await client.post('/api/orders', {
        customer_name: 'Hist Buyer',
        customer_email: 'histaddr@example.com',
        customer_phone: '0901234567',
        delivery_address: '999 Permanent Address Way, D1, HCMC',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(orderRes.status, 200, 'POST /api/orders should return 200');
      const orderId = (await orderRes.json()).order?.id;
      assert.ok(orderId, 'Order ID should exist');

      // Delete the address from address book
      const delRes = await client.delete(`/api/customer/addresses/${addrId}`);
      assert.equal(delRes.status, 200, 'DELETE address should return 200');

      // Order delivery address must remain intact
      const orderInDb = client.db.prepare('SELECT delivery_address FROM orders WHERE id = ?').get(orderId);
      assert.equal(orderInDb.delivery_address, '999 Permanent Address Way, D1, HCMC');
    });
  });

  // --------------------------------------------------------------------------
  // B10: Customer Order History Isolation & Boundary (5 tests)
  // --------------------------------------------------------------------------
  describe('B10: Customer Order History Isolation & Boundary', () => {
    test('T2.46: GET /api/customer/orders unauthenticated returns 401 Unauthorized', async () => {
      const client = createTestClient();
      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 401, 'Unauthenticated order history must return 401');
    });

    test('T2.47: Customer A cannot view Customer B orders via /api/customer/orders', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      // Customer A places order
      client.withSession({ id: 'usr_order_a', email: 'ord_a@example.com' });
      const ordARes = await client.post('/api/orders', {
        customer_name: 'Customer A',
        customer_email: 'ord_a@example.com',
        customer_phone: '0901111111',
        delivery_address: 'A Address',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(ordARes.status, 200, 'Customer A order should return 200');

      // Customer B queries order history
      client.withSession({ id: 'usr_order_b', email: 'ord_b@example.com' });
      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'Customer B orders query should return 200');
      const data = await res.json();
      assert.equal(data.orders?.length, 0, 'Customer B must not see Customer A order');
    });

    test('T2.48: Customer with 0 past orders receives empty array [] without 500 error', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_zero_orders', email: 'zero@example.com' });
      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
      const data = await res.json();
      assert.deepEqual(data.orders, []);
    });

    test('T2.49: Order items in customer history retain frozen unit price regardless of catalog changes', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_check_history_price', email: 'histprice@example.com' });
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
      const initialPrice = prod.price;

      const ordRes = await client.post('/api/orders', {
        customer_name: 'History Price Check',
        customer_email: 'histprice@example.com',
        customer_phone: '0901',
        delivery_address: 'Address',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(ordRes.status, 200, 'POST /api/orders should return 200');

      // Alter catalog price
      client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(initialPrice + 5000000, prod.id);

      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
      const data = await res.json();
      assert.equal(data.orders?.[0]?.items?.[0]?.unit_price, initialPrice);
    });

    test('T2.50: Order history records include shipment and payment status details', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_status_check', email: 'status@example.com' });
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const ordRes = await client.post('/api/orders', {
        customer_name: 'Status Check',
        customer_email: 'status@example.com',
        customer_phone: '0901',
        delivery_address: 'Address',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(ordRes.status, 200, 'POST /api/orders should return 200');

      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
      const order = (await res.json()).orders?.[0];
      assert.ok(order?.status, 'Order must have status');
      assert.ok(order?.shipment || order?.tracking_code, 'Order must include shipment tracking');
    });
  });

  // --------------------------------------------------------------------------
  // B11: Extreme Sizes, Long Strings & SQL Injection Resistance (5 tests)
  // --------------------------------------------------------------------------
  describe('B11: Extreme Sizes, Long Strings & SQL Injection Resistance', () => {
    test('T2.51: Extreme quantity (999,999,999) in cart item handled without integer overflow crash', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_extreme_qty', email: 'extreme@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: 999999999 });
      assert.ok([200, 400].includes(res.status), 'Extreme quantity should be handled gracefully');
    });

    test('T2.52: Recipient name exceeding 1,000 characters in address handled safely', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_long_name', email: 'longname@example.com' });
      const longName = 'A'.repeat(1500);

      const res = await client.post('/api/customer/addresses', {
        recipient_name: longName,
        phone: '0901234567',
        street: '123 St',
        district: 'D1',
        city_province: 'City'
      });
      assert.ok([200, 400].includes(res.status));
    });

    test('T2.53: SQL injection string in customer_name safely parameterized without database corruption', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();
      const injectionPayload = "'; DROP TABLE orders; --";

      const res = await client.post('/api/orders', {
        customer_name: injectionPayload,
        customer_email: 'sqli@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 SQLi Rd',
        items: [{ product_id: prod.id, quantity: 1 }]
      });

      // Verify orders table still exists and query works
      const count = client.db.prepare('SELECT COUNT(*) as cnt FROM orders').get();
      assert.ok(count.cnt >= 1, 'Orders table must not be dropped by SQL injection');
    });

    test('T2.54: SQL injection string in address street safely parameterized', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_sqli', email: 'addrsqli@example.com' });
      const injectionStreet = "test', (SELECT email FROM users), 'x";

      const addRes = await client.post('/api/customer/addresses', {
        recipient_name: 'Safe Recipient',
        phone: '0901234567',
        street: injectionStreet,
        district: 'D1',
        city_province: 'City'
      });
      assert.equal(addRes.status, 200, 'POST /api/customer/addresses should return 200');

      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET /api/customer/addresses should return 200');
      const list = (await listRes.json()).addresses;
      assert.equal(list?.[0]?.street, injectionStreet, 'SQL injection characters must be stored as literal text');
    });

    test('T2.55: SQL injection string in products search query safely parameterized', async () => {
      const client = createTestClient();
      const res = await client.get("/api/products?search=' OR 1=1 --");
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.products), 'Products query should return array safely');
    });
  });

  // --------------------------------------------------------------------------
  // B12: Database Constraints & Referential Integrity (5 tests)
  // --------------------------------------------------------------------------
  describe('B12: Database Constraints & Referential Integrity', () => {
    test('T2.56: Inserting duplicate email into users table throws UNIQUE constraint error', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('u_dup1', 'dup@test.com')`).run();
      assert.throws(() => {
        db.prepare(`INSERT INTO users (id, email) VALUES ('u_dup2', 'dup@test.com')`).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T2.57: Inserting duplicate (cart_id, product_id) into cart_items throws UNIQUE constraint error', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('u_ci_dup', 'cidup@test.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_dup_ci', 'u_ci_dup')`).run();
      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

      db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_1', 'cart_dup_ci', ?, 1)`).run(prod.id);
      assert.throws(() => {
        db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_2', 'cart_dup_ci', ?, 2)`).run(prod.id);
      }, /UNIQUE constraint failed/i);
    });

    test('T2.58: Inserting cart_items referencing non-existent cart_id fails foreign key constraint', () => {
      const { db } = setupTestDatabase();
      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();
      assert.throws(() => {
        db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_bad', 'nonexistent_cart_id', ?, 1)`).run(prod.id);
      }, /FOREIGN KEY constraint failed/i);
    });

    test('T2.59: Inserting order_payments referencing non-existent order_id fails foreign key constraint', () => {
      const { db } = setupTestDatabase();
      assert.throws(() => {
        db.prepare(`INSERT INTO order_payments (id, order_id, payment_method, amount) VALUES ('pay_bad', 'nonexistent_order_id', 'cod', 100)`).run();
      }, /FOREIGN KEY constraint failed/i);
    });

    test('T2.60: Inserting shipments referencing non-existent order_id fails foreign key constraint', () => {
      const { db } = setupTestDatabase();
      assert.throws(() => {
        db.prepare(`INSERT INTO shipments (id, order_id, carrier, tracking_number, delivery_address) VALUES ('ship_bad', 'nonexistent_order_id', 'GHN', 'TRK', 'Addr')`).run();
      }, /FOREIGN KEY constraint failed/i);
    });
  });

  // --------------------------------------------------------------------------
  // B13: HTTP Method Not Allowed & Route Fallbacks (5 tests)
  // --------------------------------------------------------------------------
  describe('B13: HTTP Method Not Allowed & Route Fallbacks', () => {
    test('T2.61: POST /api/auth/me returns 405 Method Not Allowed or 404', async () => {
      const client = createTestClient();
      const res = await client.post('/api/auth/me', {});
      assert.ok([404, 405].includes(res.status));
    });

    test('T2.62: GET /api/auth/logout returns 405 Method Not Allowed or 404', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/logout');
      assert.ok([404, 405].includes(res.status));
    });

    test('T2.63: PUT /api/auth/google returns 405 Method Not Allowed or 404', async () => {
      const client = createTestClient();
      const res = await client.put('/api/auth/google', {});
      assert.ok([404, 405].includes(res.status));
    });

    test('T2.64: Calling unrouted endpoint /api/unknown_boundary_route returns 404 Not Found', async () => {
      const client = createTestClient();
      const res = await client.get('/api/unknown_boundary_route');
      assert.equal(res.status, 404);
    });

    test('T2.65: OPTIONS /api/orders returns 204 No Content with CORS headers', async () => {
      const client = createTestClient();
      let res;
      try {
        res = await client.options('/api/orders');
      } catch (err) {
        if (err.message?.includes('Invalid response status code 204')) {
          assert.fail('Implementation defect in functions/api/[[path]].js: status 204 must not return JSON body');
        }
        throw err;
      }
      assert.equal(res.status, 204);
      assert.ok(res.headers.get('access-control-allow-origin'));
    });
  });

});

if (process.argv[1] === import.meta.filename) {
  runner.run().then(success => process.exit(success ? 0 : 1));
}

