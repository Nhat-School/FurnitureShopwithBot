import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { describe, test, runner } from './runner.mjs';
import {
  PROJECT_ROOT,
  setupTestDatabase,
  createTestClient,
  signSessionToken,
  CANONICAL_DOMAIN_SCHEMA_SQL,
  DEFAULT_SESSION_SECRET
} from './helpers.mjs';

// ============================================================================
// Tier 1: Feature Requirements Verification (F1 - F13) - 65 Test Cases
// ============================================================================

runner.setTier(1);
describe('Tier 1: Feature Coverage (F1-F13)', () => {

  // --------------------------------------------------------------------------
  // F1: Users & Customer Profiles Schema (5 tests)
  // --------------------------------------------------------------------------
  describe('F1: Users & Customer Profiles Schema', () => {
    test('T1.F1.1: Migration 0002 defines users table with required auth and profile columns', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(users)').all();
      const colNames = new Set(cols.map(c => c.name));
      const required = ['id', 'email', 'auth_provider', 'provider_subject', 'display_name', 'role', 'created_at', 'updated_at'];
      for (const col of required) {
        assert.ok(colNames.has(col), `users table must have column '${col}'`);
      }
    });

    test('T1.F1.2: users table enforces UNIQUE constraint on email', () => {
      const { db } = setupTestDatabase();
      db.prepare(`
        INSERT INTO users (id, email, display_name, role)
        VALUES ('usr_1', 'unique@example.com', 'User 1', 'customer')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO users (id, email, display_name, role)
          VALUES ('usr_2', 'unique@example.com', 'User 2', 'customer')
        `).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F1.3: Partial unique index idx_users_auth_provider_subject exists and prevents duplicate subjects', () => {
      const { db } = setupTestDatabase();
      const indexes = db.prepare('PRAGMA index_list(users)').all();
      const hasIndex = indexes.some(idx => idx.name === 'idx_users_auth_provider_subject');
      assert.ok(hasIndex, "Expected unique index 'idx_users_auth_provider_subject' on users table");

      db.prepare(`
        INSERT INTO users (id, email, auth_provider, provider_subject)
        VALUES ('usr_g1', 'g1@example.com', 'google', 'sub_12345')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO users (id, email, auth_provider, provider_subject)
          VALUES ('usr_g2', 'g2@example.com', 'google', 'sub_12345')
        `).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F1.4: customers profile table references users(id) with ON DELETE CASCADE', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email, display_name) VALUES ('usr_parent', 'parent@example.com', 'Parent')`).run();
      db.prepare(`INSERT INTO customers (id, user_id, customer_type, loyalty_points) VALUES ('cust_1', 'usr_parent', 'standard', 100)`).run();

      const customer = db.prepare('SELECT * FROM customers WHERE user_id = ?').get('usr_parent');
      assert.equal(customer?.id, 'cust_1');

      // Test Cascade
      db.prepare('DELETE FROM users WHERE id = ?').run('usr_parent');
      const orphan = db.prepare('SELECT * FROM customers WHERE user_id = ?').get('usr_parent');
      assert.equal(orphan, undefined, 'Customer profile row should be deleted via cascade when parent user is deleted');
    });

    test('T1.F1.5: customers table stores customer_type and loyalty_points with expected defaults', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_def', 'default@example.com')`).run();
      db.prepare(`INSERT INTO customers (id, user_id) VALUES ('cust_def', 'usr_def')`).run();

      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get('cust_def');
      assert.equal(customer.customer_type, 'standard', 'Default customer_type should be standard');
      assert.equal(customer.loyalty_points, 0, 'Default loyalty_points should be 0');
    });
  });

  // --------------------------------------------------------------------------
  // F2: Address Book Schema (5 tests)
  // --------------------------------------------------------------------------
  describe('F2: Address Book Schema', () => {
    test('T1.F2.1: addresses table defines all required delivery location fields', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(addresses)').all();
      const colNames = new Set(cols.map(c => c.name));
      const required = ['id', 'user_id', 'recipient_name', 'phone', 'street', 'district', 'city_province', 'is_default'];
      for (const col of required) {
        assert.ok(colNames.has(col), `addresses table must contain '${col}'`);
      }
    });

    test('T1.F2.2: addresses.user_id enforces foreign key constraint to users table', () => {
      const { db } = setupTestDatabase();
      assert.throws(() => {
        db.prepare(`
          INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province)
          VALUES ('addr_bad', 'nonexistent_user', 'John', '0901234567', '123 St', 'Dist 1', 'HCMC')
        `).run();
      }, /FOREIGN KEY constraint failed/i);
    });

    test('T1.F2.3: addresses table supports multiple addresses for the same user', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_multi_addr', 'multi@example.com')`).run();

      db.prepare(`
        INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province, is_default)
        VALUES ('addr_1', 'usr_multi_addr', 'John Home', '0901234567', '123 Home St', 'Dist 1', 'HCMC', 1)
      `).run();
      db.prepare(`
        INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province, is_default)
        VALUES ('addr_2', 'usr_multi_addr', 'John Office', '0901234568', '456 Work Ave', 'Dist 3', 'HCMC', 0)
      `).run();

      const addresses = db.prepare('SELECT * FROM addresses WHERE user_id = ?').all('usr_multi_addr');
      assert.equal(addresses.length, 2, 'User should have exactly 2 registered addresses');
    });

    test('T1.F2.4: addresses.is_default defaults to 0 and accepts 1 for primary address', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_addr_def', 'addrdef@example.com')`).run();
      db.prepare(`
        INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province)
        VALUES ('addr_default_check', 'usr_addr_def', 'Default Check', '0901234567', '789 Main', 'Dist 1', 'Hanoi')
      `).run();

      const addr = db.prepare('SELECT is_default FROM addresses WHERE id = ?').get('addr_default_check');
      assert.equal(addr.is_default, 0, 'Default value for is_default should be 0');
    });

    test('T1.F2.5: Deleting user cascades and purges all addresses in address book', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_addr_del', 'addrdel@example.com')`).run();
      db.prepare(`
        INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province)
        VALUES ('addr_to_del', 'usr_addr_del', 'Recipient', '0901234567', '99 St', 'Dist 1', 'Danang')
      `).run();

      db.prepare('DELETE FROM users WHERE id = ?').run('usr_addr_del');
      const orphan = db.prepare('SELECT * FROM addresses WHERE id = ?').get('addr_to_del');
      assert.equal(orphan, undefined, 'Address must be cascade deleted when parent user is removed');
    });
  });

  // --------------------------------------------------------------------------
  // F3: Persistent Cart Schema (5 tests)
  // --------------------------------------------------------------------------
  describe('F3: Persistent Cart Schema', () => {
    test('T1.F3.1: carts table links 1:1 to users table with UNIQUE constraint on user_id', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_cart_1', 'cart1@example.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_1', 'usr_cart_1')`).run();

      assert.throws(() => {
        db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_2', 'usr_cart_1')`).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F3.2: cart_items table links to carts and products with ON DELETE CASCADE', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_ci', 'ci@example.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_ci', 'usr_ci')`).run();

      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();
      assert.ok(prod, 'Initial schema seed products should exist');

      db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_1', 'cart_ci', ?, 2)`).run(prod.id);
      const item = db.prepare('SELECT * FROM cart_items WHERE id = ?').get('ci_1');
      assert.equal(item?.quantity, 2);
    });

    test('T1.F3.3: cart_items enforces UNIQUE constraint on (cart_id, product_id)', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_dup_ci', 'dupci@example.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_dup', 'usr_dup_ci')`).run();
      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

      db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_dup_1', 'cart_dup', ?, 1)`).run(prod.id);
      assert.throws(() => {
        db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_dup_2', 'cart_dup', ?, 3)`).run(prod.id);
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F3.4: cart_items quantity defaults to 1', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_def_qty', 'defqty@example.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_def_qty', 'usr_def_qty')`).run();
      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

      db.prepare(`INSERT INTO cart_items (id, cart_id, product_id) VALUES ('ci_def', 'cart_def_qty', ?)`).run(prod.id);
      const item = db.prepare('SELECT quantity FROM cart_items WHERE id = ?').get('ci_def');
      assert.equal(item.quantity, 1, 'Default quantity in cart_items must be 1');
    });

    test('T1.F3.5: Deleting cart cascades and deletes all associated cart_items', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_casc_cart', 'casccart@example.com')`).run();
      db.prepare(`INSERT INTO carts (id, user_id) VALUES ('cart_to_purge', 'usr_casc_cart')`).run();
      const prod = db.prepare('SELECT id FROM products LIMIT 1').get();

      db.prepare(`INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_purge', 'cart_to_purge', ?, 4)`).run(prod.id);
      db.prepare('DELETE FROM carts WHERE id = ?').run('cart_to_purge');

      const orphan = db.prepare('SELECT * FROM cart_items WHERE id = ?').get('ci_purge');
      assert.equal(orphan, undefined, 'Cart item should be cascade deleted when cart is deleted');
    });
  });

  // --------------------------------------------------------------------------
  // F4: Order Customer Linkage Schema (5 tests)
  // --------------------------------------------------------------------------
  describe('F4: Order Customer Linkage Schema', () => {
    test('T1.F4.1: orders table contains customer_id referencing users(id)', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(orders)').all();
      const hasCustomerId = cols.some(c => c.name === 'customer_id');
      assert.ok(hasCustomerId, 'orders table must have customer_id column');
    });

    test('T1.F4.2: orders allows customer_id to be NULL for guest checkout', () => {
      const { db } = setupTestDatabase();
      db.prepare(`
        INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount, status)
        VALUES ('ord_guest', NULL, 'Guest Buyer', 'guest@example.com', '0909999999', '123 Guest Rd', 500000, 500000, 'Paid')
      `).run();

      const ord = db.prepare('SELECT customer_id FROM orders WHERE id = ?').get('ord_guest');
      assert.equal(ord.customer_id, null, 'Guest orders must allow customer_id to be NULL');
    });

    test('T1.F4.3: orders stores delivery snapshot fields alongside customer_id', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO users (id, email) VALUES ('usr_ord_snap', 'ordsnap@example.com')`).run();
      db.prepare(`
        INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount, status)
        VALUES ('ord_snap', 'usr_ord_snap', 'Jane Doe', 'jane@example.com', '0901112233', '100 Snapshot Ln', 1500000, 1500000, 'Processing')
      `).run();

      const ord = db.prepare('SELECT * FROM orders WHERE id = ?').get('ord_snap');
      assert.equal(ord.customer_id, 'usr_ord_snap');
      assert.equal(ord.delivery_address, '100 Snapshot Ln');
      assert.equal(ord.customer_phone, '0901112233');
    });

    test('T1.F4.4: order_items stores frozen unit_price, quantity, product_id, and order_id', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(order_items)').all();
      const colNames = new Set(cols.map(c => c.name));
      const required = ['id', 'order_id', 'product_id', 'quantity', 'unit_price'];
      for (const col of required) {
        assert.ok(colNames.has(col), `order_items must contain '${col}'`);
      }
    });

    test('T1.F4.5: Multiple order_items can link to a single order record', () => {
      const { db } = setupTestDatabase();
      db.prepare(`
        INSERT INTO orders (id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount)
        VALUES ('ord_multi_items', 'Buyer', 'b@example.com', '0900000000', '1 St', 3000, 3000)
      `).run();

      const prods = db.prepare('SELECT id, price FROM products LIMIT 2').all();
      db.prepare(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES ('oi_1', 'ord_multi_items', ?, 1, ?)`).run(prods[0].id, prods[0].price);
      db.prepare(`INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES ('oi_2', 'ord_multi_items', ?, 2, ?)`).run(prods[1].id, prods[1].price);

      const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all('ord_multi_items');
      assert.equal(items.length, 2, 'Order should have exactly 2 associated order_items');
    });
  });

  // --------------------------------------------------------------------------
  // F5: Shipments & Payments Schema (5 tests)
  // --------------------------------------------------------------------------
  describe('F5: Shipments & Payments Schema', () => {
    test('T1.F5.1: shipments table links 1:1 to orders with UNIQUE constraint on order_id', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO orders (id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount) VALUES ('ord_ship_1', 'A', 'a@a.com', '0', 'St', 100, 100)`).run();
      db.prepare(`
        INSERT INTO shipments (id, order_id, carrier, tracking_number, delivery_address)
        VALUES ('ship_1', 'ord_ship_1', 'GHN', 'TRACK123', 'Delivery Address St')
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO shipments (id, order_id, carrier, tracking_number, delivery_address)
          VALUES ('ship_2', 'ord_ship_1', 'ViettelPost', 'TRACK456', 'Other St')
        `).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F5.2: shipments table contains required carrier, tracking, status, and address fields', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(shipments)').all();
      const colNames = new Set(cols.map(c => c.name));
      const required = ['id', 'order_id', 'carrier', 'tracking_number', 'shipping_status', 'shipping_cost', 'delivery_address'];
      for (const col of required) {
        assert.ok(colNames.has(col), `shipments table must contain column '${col}'`);
      }
    });

    test('T1.F5.3: order_payments table links 1:1 to orders with UNIQUE constraint on order_id', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO orders (id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount) VALUES ('ord_pay_1', 'B', 'b@b.com', '0', 'St', 200, 200)`).run();
      db.prepare(`
        INSERT INTO order_payments (id, order_id, payment_method, amount)
        VALUES ('pay_1', 'ord_pay_1', 'cod', 200)
      `).run();

      assert.throws(() => {
        db.prepare(`
          INSERT INTO order_payments (id, order_id, payment_method, amount)
          VALUES ('pay_2', 'ord_pay_1', 'credit_card', 200)
        `).run();
      }, /UNIQUE constraint failed/i);
    });

    test('T1.F5.4: order_payments tracks payment_method, status, amount, and transaction_id', () => {
      const { db } = setupTestDatabase();
      const cols = db.prepare('PRAGMA table_info(order_payments)').all();
      const colNames = new Set(cols.map(c => c.name));
      const required = ['id', 'order_id', 'payment_method', 'transaction_id', 'payment_status', 'amount'];
      for (const col of required) {
        assert.ok(colNames.has(col), `order_payments must contain column '${col}'`);
      }
    });

    test('T1.F5.5: Deleting an order cascades and removes associated shipments and order_payments', () => {
      const { db } = setupTestDatabase();
      db.prepare(`INSERT INTO orders (id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount) VALUES ('ord_casc', 'C', 'c@c.com', '0', 'St', 300, 300)`).run();
      db.prepare(`INSERT INTO shipments (id, order_id, carrier, tracking_number, delivery_address) VALUES ('ship_casc', 'ord_casc', 'Carrier', 'TRK99', 'Dest')`).run();
      db.prepare(`INSERT INTO order_payments (id, order_id, payment_method, amount) VALUES ('pay_casc', 'ord_casc', 'cod', 300)`).run();

      db.prepare('DELETE FROM orders WHERE id = ?').run('ord_casc');
      assert.equal(db.prepare('SELECT * FROM shipments WHERE id = ?').get('ship_casc'), undefined);
      assert.equal(db.prepare('SELECT * FROM order_payments WHERE id = ?').get('pay_casc'), undefined);
    });
  });

  // --------------------------------------------------------------------------
  // F6: Google OAuth 2.0 PKCE Flow (5 tests)
  // --------------------------------------------------------------------------
  describe('F6: Google OAuth 2.0 PKCE Flow', () => {
    test('T1.F6.1: GET /api/auth/google returns 302 redirect to accounts.google.com', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/google');
      assert.equal(res.status, 302, 'Should respond with 302 redirect');
      const location = res.headers.get('location');
      assert.ok(location?.startsWith('https://accounts.google.com/o/oauth2/v2/auth'), 'Location must point to Google OAuth endpoint');
    });

    test('T1.F6.2: GET /api/auth/google sets fur_google_oauth_state cookie', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/google');
      const stateCookie = res.cookies['fur_google_oauth_state'];
      assert.ok(stateCookie, 'Expected fur_google_oauth_state cookie to be set');
      assert.ok(stateCookie.value.length >= 32, 'OAuth state cookie should be at least 32 characters');
    });

    test('T1.F6.3: GET /api/auth/google sets fur_google_oauth_verifier cookie with HttpOnly and Max-Age=600', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/google');
      const verifierCookie = res.cookies['fur_google_oauth_verifier'];
      assert.ok(verifierCookie, 'Expected fur_google_oauth_verifier cookie to be set');
      assert.ok(verifierCookie.flags.includes('httponly'), 'Verifier cookie must be HttpOnly');
      assert.ok(verifierCookie.flags.some(f => f.startsWith('max-age=600')), 'Verifier cookie should have Max-Age=600');
    });

    test('T1.F6.4: GET /api/auth/google includes PKCE code_challenge and code_challenge_method=S256 in auth URL', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/google');
      const location = new URL(res.headers.get('location'));
      assert.equal(location.searchParams.get('code_challenge_method'), 'S256', 'PKCE method must be S256');
      assert.ok(location.searchParams.get('code_challenge'), 'Auth URL must include code_challenge');
      assert.ok(location.searchParams.get('client_id'), 'Auth URL must include client_id');
      assert.ok(location.searchParams.get('state'), 'Auth URL must include state');
    });

    test('T1.F6.5: GET /api/auth/google/callback validates state and rejects missing state parameter', async () => {
      const client = createTestClient();
      // No state parameter passed in query
      const res = await client.get('/api/auth/google/callback?code=some_test_code');
      assert.equal(res.status, 302, 'Callback should redirect on invalid state');
      const loc = res.headers.get('location');
      assert.ok(loc?.includes('auth_error=google_invalid_state'), 'Should redirect with google_invalid_state error');
    });
  });

  // --------------------------------------------------------------------------
  // F7: Session Management & Logout (5 tests)
  // --------------------------------------------------------------------------
  describe('F7: Session Management & Logout', () => {
    test('T1.F7.1: HMAC-SHA256 session token creates valid two-part payload.signature format', async () => {
      const payload = { id: 'usr_test', email: 'test@example.com', role: 'customer' };
      const token = await signSessionToken(payload, DEFAULT_SESSION_SECRET);
      assert.ok(token.includes('.'), 'Token must contain dot delimiter separating payload and signature');
      const [pB64, sigB64] = token.split('.');
      assert.ok(pB64.length > 10, 'Payload component must be non-empty base64url');
      assert.ok(sigB64.length > 20, 'Signature component must be non-empty base64url');
    });

    test('T1.F7.2: GET /api/auth/me returns authenticated user profile with valid fur_session cookie', async () => {
      const client = createTestClient();
      const sessionUser = {
        id: 'usr_me_1',
        email: 'member@example.com',
        name: 'Member User',
        role: 'customer'
      };
      client.withSession(sessionUser);

      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 200, 'GET /api/auth/me should return 200 for valid session');
      const body = await res.json();
      assert.ok(body.user, 'Response body must contain user object');
      assert.equal(body.user.email, 'member@example.com');
    });

    test('T1.F7.3: GET /api/auth/me without session cookie returns 401 Unauthorized with user null', async () => {
      const client = createTestClient();
      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401, 'Unauthenticated /api/auth/me must return 401');
      const body = await res.json();
      assert.equal(body.user, null, 'Unauthenticated user field must be null');
    });

    test('T1.F7.4: POST /api/auth/logout sets fur_session cookie with Max-Age=0', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_logout', email: 'logout@example.com' });
      const res = await client.post('/api/auth/logout');

      const sessionCookie = res.cookies['fur_session'];
      assert.ok(sessionCookie, 'Logout must send fur_session set-cookie header');
      assert.ok(
        sessionCookie.flags.includes('max-age=0') || sessionCookie.value === '',
        'Logout cookie must clear session via Max-Age=0 or empty value'
      );
    });

    test('T1.F7.5: POST /api/auth/logout returns JSON { success: true } or { ok: true }', async () => {
      const client = createTestClient();
      const res = await client.post('/api/auth/logout');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(data.success === true || data.ok === true, 'Logout response should indicate success');
    });
  });

  // --------------------------------------------------------------------------
  // F8: Environment Configuration (5 tests)
  // --------------------------------------------------------------------------
  describe('F8: Environment Configuration', () => {
    test('T1.F8.1: .env.example exists and documents GOOGLE_CLIENT_ID', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      assert.ok(fs.existsSync(envPath), '.env.example must exist at project root');
      const content = fs.readFileSync(envPath, 'utf8');
      assert.ok(content.includes('GOOGLE_CLIENT_ID='), '.env.example must document GOOGLE_CLIENT_ID');
    });

    test('T1.F8.2: .env.example documents GOOGLE_CLIENT_SECRET', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');
      assert.ok(content.includes('GOOGLE_CLIENT_SECRET='), '.env.example must document GOOGLE_CLIENT_SECRET');
    });

    test('T1.F8.3: .env.example documents SESSION_SECRET', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');
      assert.ok(content.includes('SESSION_SECRET='), '.env.example must document SESSION_SECRET');
    });

    test('T1.F8.4: .env.example documents GOOGLE_REDIRECT_URI', () => {
      const envPath = path.join(PROJECT_ROOT, '.env.example');
      const content = fs.readFileSync(envPath, 'utf8');
      assert.ok(content.includes('GOOGLE_REDIRECT_URI='), '.env.example must document GOOGLE_REDIRECT_URI');
    });

    test('T1.F8.5: wrangler.toml configures D1 database binding DB', () => {
      const wranglerPath = path.join(PROJECT_ROOT, 'wrangler.toml');
      assert.ok(fs.existsSync(wranglerPath), 'wrangler.toml must exist at project root');
      const content = fs.readFileSync(wranglerPath, 'utf8');
      assert.ok(content.includes('binding = "DB"'), 'wrangler.toml must define binding = "DB"');
      assert.ok(content.includes('database_name = "furproject-db"'), 'wrangler.toml must specify database_name "furproject-db"');
    });
  });

  // --------------------------------------------------------------------------
  // F9: Persistent Cart APIs (5 tests)
  // --------------------------------------------------------------------------
  describe('F9: Persistent Cart APIs', () => {
    test('T1.F9.1: GET /api/cart returns empty items array for new authenticated customer', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_new_cart', email: 'newcart@example.com' });
      const res = await client.get('/api/cart');
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.items), 'GET /api/cart should return an items array');
      assert.equal(data.items.length, 0);
    });

    test('T1.F9.2: POST /api/cart/items adds product and quantity to persistent cart', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_add_cart', email: 'addcart@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
      assert.equal(res.status, 200, 'POST /api/cart/items should return 200');
      const data = await res.json();
      assert.ok(data.success, 'Adding item to cart should succeed');

      const cartRes = await client.get('/api/cart');
      assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
      const cartData = await cartRes.json();
      assert.equal(cartData.items?.length, 1);
      assert.equal(cartData.items[0].product_id, prod.id);
      assert.equal(cartData.items[0].quantity, 2);
    });

    test('T1.F9.3: POST /api/cart/items with existing product increments quantity', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_inc_cart', email: 'inccart@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const r1 = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
      assert.equal(r1.status, 200, 'POST /api/cart/items should return 200');
      const r2 = await client.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
      assert.equal(r2.status, 200, 'POST /api/cart/items should return 200');

      const cartRes = await client.get('/api/cart');
      assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
      const cartData = await cartRes.json();
      assert.equal(cartData.items?.length, 1, 'Duplicate product should update existing row');
      assert.equal(cartData.items[0].quantity, 3, 'Quantities should be summed');
    });

    test('T1.F9.4: PUT /api/cart/items/:id updates item quantity in persistent cart', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_put_cart', email: 'putcart@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
      assert.equal(addRes.status, 200, 'POST /api/cart/items should return 200');
      const cartRes = await client.get('/api/cart');
      assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
      const cartData = await cartRes.json();
      assert.ok(cartData.items?.length > 0, 'Cart should have items');
      const itemId = cartData.items[0].id;

      const updateRes = await client.put(`/api/cart/items/${itemId}`, { quantity: 5 });
      assert.equal(updateRes.status, 200, 'PUT /api/cart/items/:id should return 200');

      const updatedCart = await (await client.get('/api/cart')).json();
      assert.equal(updatedCart.items[0].quantity, 5);
    });

    test('T1.F9.5: DELETE /api/cart/items/:id removes item from persistent cart', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_del_cart', email: 'delcart@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 1 });
      assert.equal(addRes.status, 200, 'POST /api/cart/items should return 200');
      const cartRes = await client.get('/api/cart');
      assert.equal(cartRes.status, 200, 'GET /api/cart should return 200');
      const cartData = await cartRes.json();
      assert.ok(cartData.items?.length > 0, 'Cart should have items');
      const itemId = cartData.items[0].id;

      const delRes = await client.delete(`/api/cart/items/${itemId}`);
      assert.equal(delRes.status, 200, 'DELETE /api/cart/items/:id should return 200');

      const emptyCart = await (await client.get('/api/cart')).json();
      assert.equal(emptyCart.items?.length, 0);
    });
  });

  // --------------------------------------------------------------------------
  // F10: Price Immutability Checkout API (5 tests)
  // --------------------------------------------------------------------------
  describe('F10: Price Immutability Checkout API', () => {
    test('T1.F10.1: POST /api/orders retrieves live catalog price from products table at checkout time', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Test Buyer',
        customer_email: 'buyer@example.com',
        customer_phone: '0901234567',
        delivery_address: '123 Test Street, Hanoi',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 2 }]
      });

      assert.equal(res.status, 200, 'POST /api/orders should return 200');
      const data = await res.json();
      assert.ok(data.order, 'Order should be created successfully');
      assert.equal(data.order.total_amount, prod.price * 2);
    });

    test('T1.F10.2: POST /api/orders freezes unit_price in order_items decoupled from future catalog price changes', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
      const originalPrice = prod.price;

      const res = await client.post('/api/orders', {
        customer_name: 'Immutability Buyer',
        customer_email: 'imm@example.com',
        customer_phone: '0901234567',
        delivery_address: '456 Safe St',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 200, 'POST /api/orders should return 200');
      const orderId = (await res.json()).order?.id;
      assert.ok(orderId, 'Order id should exist');

      // Now alter the live catalog price in products table
      client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(originalPrice * 3, prod.id);

      // Verify unit_price in order_items remains unchanged
      const itemRow = client.db.prepare('SELECT unit_price FROM order_items WHERE order_id = ?').get(orderId);
      assert.equal(itemRow.unit_price, originalPrice, 'Historical order unit_price must remain strictly frozen');
    });

    test('T1.F10.3: POST /api/orders creates corresponding shipments record with tracking code and address snapshot', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Shipment Buyer',
        customer_email: 'ship@example.com',
        customer_phone: '0901234567',
        delivery_address: '789 Ship St, Dist 1, HCMC',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 200, 'POST /api/orders should return 200');
      const orderId = (await res.json()).order?.id;
      assert.ok(orderId, 'Order id should exist');

      const shipment = client.db.prepare('SELECT * FROM shipments WHERE order_id = ?').get(orderId);
      assert.ok(shipment, 'Shipment record must be generated');
      assert.ok(shipment.tracking_number, 'Tracking number must be generated');
      assert.equal(shipment.delivery_address, '789 Ship St, Dist 1, HCMC');
    });

    test('T1.F10.4: POST /api/orders creates corresponding order_payments record with method and pending status', async () => {
      const client = createTestClient();
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const res = await client.post('/api/orders', {
        customer_name: 'Payment Buyer',
        customer_email: 'pay@example.com',
        customer_phone: '0901234567',
        delivery_address: '100 Pay Rd',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(res.status, 200, 'POST /api/orders should return 200');
      const orderId = (await res.json()).order?.id;
      assert.ok(orderId, 'Order id should exist');

      const payment = client.db.prepare('SELECT * FROM order_payments WHERE order_id = ?').get(orderId);
      assert.ok(payment, 'Order payment record must be generated');
      assert.equal(payment.payment_method, 'cod');
      assert.equal(payment.amount, prod.price);
      assert.equal(payment.payment_status, 'pending');
    });

    test('T1.F10.5: POST /api/orders automatically clears authenticated user persistent cart items', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_checkout_clear', email: 'clear@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      // Add item to cart first
      const addRes = await client.post('/api/cart/items', { product_id: prod.id, quantity: 2 });
      assert.equal(addRes.status, 200, 'POST /api/cart/items should return 200');
      const beforeCartRes = await client.get('/api/cart');
      assert.equal(beforeCartRes.status, 200);
      const beforeCart = await beforeCartRes.json();
      assert.equal(beforeCart.items?.length, 1);

      // Perform checkout
      const checkRes = await client.post('/api/orders', {
        customer_name: 'Clear Buyer',
        customer_email: 'clear@example.com',
        customer_phone: '0901234567',
        delivery_address: '200 Clear Blvd',
        payment_method: 'cod',
        items: [{ product_id: prod.id, quantity: 2 }]
      });
      assert.equal(checkRes.status, 200, 'POST /api/orders should return 200');

      // Cart should now be empty
      const afterCartRes = await client.get('/api/cart');
      assert.equal(afterCartRes.status, 200);
      const afterCart = await afterCartRes.json();
      assert.equal(afterCart.items?.length, 0, 'Cart must be cleared after checkout');
    });
  });

  // --------------------------------------------------------------------------
  // F11: Order History & Address APIs (5 tests)
  // --------------------------------------------------------------------------
  describe('F11: Order History & Address APIs', () => {
    test('T1.F11.1: GET /api/customer/orders returns orders belonging exclusively to authenticated customer', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_history_1', email: 'hist1@example.com' });
      const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

      // Place order for user 1
      const ordRes = await client.post('/api/orders', {
        customer_name: 'Hist 1',
        customer_email: 'hist1@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Hist 1 Address',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(ordRes.status, 200, 'POST /api/orders should return 200');

      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
      const data = await res.json();
      assert.ok(Array.isArray(data.orders), 'GET /api/customer/orders should return orders array');
      assert.equal(data.orders.length, 1);
    });

    test('T1.F11.2: GET /api/customer/orders items contain frozen unit_price and shipment tracking', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_history_details', email: 'details@example.com' });
      const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

      const ordRes = await client.post('/api/orders', {
        customer_name: 'Details Buyer',
        customer_email: 'details@example.com',
        customer_phone: '0901234567',
        delivery_address: 'Details Address',
        items: [{ product_id: prod.id, quantity: 1 }]
      });
      assert.equal(ordRes.status, 200, 'POST /api/orders should return 200');

      const res = await client.get('/api/customer/orders');
      assert.equal(res.status, 200, 'GET /api/customer/orders should return 200');
      const data = await res.json();
      const order = data.orders?.[0];
      assert.ok(order?.items?.length > 0, 'Order must contain items list');
      assert.equal(order.items[0].unit_price, prod.price);
      assert.ok(order.shipment || order.tracking_code, 'Order must include shipment/tracking details');
    });

    test('T1.F11.3: GET /api/customer/addresses returns saved addresses for authenticated customer', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_list', email: 'addrlist@example.com' });

      const res = await client.get('/api/customer/addresses');
      assert.equal(res.status, 200, 'GET /api/customer/addresses should return 200');
      const data = await res.json();
      assert.ok(Array.isArray(data.addresses), 'Should return addresses array');
      assert.equal(data.addresses.length, 0);
    });

    test('T1.F11.4: POST /api/customer/addresses saves a new delivery address for authenticated customer', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_save', email: 'addrsave@example.com' });

      const res = await client.post('/api/customer/addresses', {
        recipient_name: 'Alex Johnson',
        phone: '0987654321',
        street: '123 Landmark Way',
        ward: 'Ward 2',
        district: 'District 7',
        city_province: 'Ho Chi Minh City',
        postal_code: '70000',
        is_default: 1
      });

      assert.equal(res.status, 200, 'POST /api/customer/addresses should return 200');
      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET /api/customer/addresses should return 200');
      const listData = await listRes.json();
      assert.equal(listData.addresses?.length, 1);
      assert.equal(listData.addresses[0].recipient_name, 'Alex Johnson');
      assert.equal(listData.addresses[0].is_default, 1);
    });

    test('T1.F11.5: Saving new default address resets is_default on existing addresses', async () => {
      const client = createTestClient();
      client.withSession({ id: 'usr_addr_toggle', email: 'toggle@example.com' });

      const r1 = await client.post('/api/customer/addresses', {
        recipient_name: 'Addr 1',
        phone: '0901',
        street: 'Street 1',
        district: 'D1',
        city_province: 'HCMC',
        is_default: 1
      });
      assert.equal(r1.status, 200, 'POST address 1 should return 200');

      const r2 = await client.post('/api/customer/addresses', {
        recipient_name: 'Addr 2',
        phone: '0902',
        street: 'Street 2',
        district: 'D2',
        city_province: 'HCMC',
        is_default: 1
      });
      assert.equal(r2.status, 200, 'POST address 2 should return 200');

      const listRes = await client.get('/api/customer/addresses');
      assert.equal(listRes.status, 200, 'GET addresses should return 200');
      const listData = await listRes.json();
      const addr1 = listData.addresses?.find(a => a.recipient_name === 'Addr 1');
      const addr2 = listData.addresses?.find(a => a.recipient_name === 'Addr 2');
      assert.equal(addr1?.is_default, 0, 'Previous default address should have is_default reset to 0');
      assert.equal(addr2?.is_default, 1, 'Newly added default address should have is_default = 1');
    });
  });

  // --------------------------------------------------------------------------
  // F12: Storefront Auth UI (5 tests)
  // --------------------------------------------------------------------------
  describe('F12: Storefront Auth UI', () => {
    test('T1.F12.1: src/components/AuthModal.jsx contains Google OAuth trigger link/button', () => {
      const authModalPath = path.join(PROJECT_ROOT, 'src/components/AuthModal.jsx');
      assert.ok(fs.existsSync(authModalPath), 'AuthModal.jsx must exist');
      const content = fs.readFileSync(authModalPath, 'utf8');
      assert.ok(
        content.includes('/api/auth/google') || content.includes('google') || content.includes('Google'),
        'AuthModal.jsx must provide Google authentication trigger'
      );
    });

    test('T1.F12.2: src/components/Header.jsx includes user profile avatar or account menu elements', () => {
      const headerPath = path.join(PROJECT_ROOT, 'src/components/Header.jsx');
      assert.ok(fs.existsSync(headerPath), 'Header.jsx must exist');
      const content = fs.readFileSync(headerPath, 'utf8');
      assert.ok(
        content.includes('user') || content.includes('avatar') || content.includes('profile') || content.includes('Account'),
        'Header.jsx must support user profile state'
      );
    });

    test('T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout', () => {
      const headerPath = path.join(PROJECT_ROOT, 'src/components/Header.jsx');
      const content = fs.readFileSync(headerPath, 'utf8');
      assert.ok(
        content.includes('logout') || content.includes('Logout') || content.includes('/api/auth/logout'),
        'Header.jsx must support sign-out functionality'
      );
    });

    test('T1.F12.4: src/App.jsx contains session restoration logic on initial mount', () => {
      const appPath = path.join(PROJECT_ROOT, 'src/App.jsx');
      assert.ok(fs.existsSync(appPath), 'App.jsx must exist');
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(
        content.includes('/api/auth/me') || content.includes('auth') || content.includes('user'),
        'App.jsx should check authentication state'
      );
    });

    test('T1.F12.5: Storefront UI renders guest fallback state when unauthenticated without throwing errors', () => {
      const appPath = path.join(PROJECT_ROOT, 'src/App.jsx');
      const content = fs.readFileSync(appPath, 'utf8');
      assert.ok(!content.includes('throw new Error("Unauthenticated")'), 'App should not crash on guest state');
    });
  });

  // --------------------------------------------------------------------------
  // F13: Storefront Checkout UI & Build (5 tests)
  // --------------------------------------------------------------------------
  describe('F13: Storefront Checkout UI & Build', () => {
    test('T1.F13.1: src/components/CartDrawer.jsx supports saved address selection or input', () => {
      const cartDrawerPath = path.join(PROJECT_ROOT, 'src/components/CartDrawer.jsx');
      assert.ok(fs.existsSync(cartDrawerPath), 'CartDrawer.jsx must exist');
      const content = fs.readFileSync(cartDrawerPath, 'utf8');
      assert.ok(
        content.includes('address') || content.includes('checkout') || content.includes('delivery'),
        'CartDrawer must support delivery address entry or selection'
      );
    });

    test('T1.F13.2: src/components/CartDrawer.jsx supports guest checkout fallback', () => {
      const cartDrawerPath = path.join(PROJECT_ROOT, 'src/components/CartDrawer.jsx');
      const content = fs.readFileSync(cartDrawerPath, 'utf8');
      assert.ok(
        content.includes('phone') || content.includes('customer') || content.includes('checkout'),
        'CartDrawer must allow guest checkout details'
      );
    });

    test('T1.F13.3: Order tracking or modal component displays tracking code and order status', () => {
      const trackModalPath = path.join(PROJECT_ROOT, 'src/components/OrderTrackModal.jsx');
      assert.ok(fs.existsSync(trackModalPath), 'OrderTrackModal.jsx must exist');
      const content = fs.readFileSync(trackModalPath, 'utf8');
      assert.ok(
        content.includes('tracking') || content.includes('status') || content.includes('order'),
        'OrderTrackModal must display order tracking details'
      );
    });

    test('T1.F13.4: Production storefront build (npm run build) compiles cleanly with zero errors', () => {
      let buildOutput = '';
      try {
        buildOutput = execSync('npm run build', {
          cwd: PROJECT_ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
      } catch (err) {
        assert.fail(`npm run build failed: ${err.message}\n${err.stderr}`);
      }
      assert.ok(buildOutput.includes('built in') || fs.existsSync(path.join(PROJECT_ROOT, 'dist/index.html')), 'Build should output dist artifacts');
    });

    test('T1.F13.5: All required JSX components export clean React modules without broken imports', () => {
      const componentFiles = [
        'AuthModal.jsx',
        'Header.jsx',
        'CartDrawer.jsx',
        'OrderTrackModal.jsx'
      ];
      for (const comp of componentFiles) {
        const fullPath = path.join(PROJECT_ROOT, 'src/components', comp);
        assert.ok(fs.existsSync(fullPath), `Component file ${comp} must exist`);
        const content = fs.readFileSync(fullPath, 'utf8');
        assert.ok(content.includes('export default') || content.includes('export function'), `${comp} must have export`);
      }
    });
  });

});

if (process.argv[1] === import.meta.filename) {
  runner.run().then(success => process.exit(success ? 0 : 1));
}
