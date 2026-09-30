import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createTestClient,
  setupTestDatabase
} from './e2e/helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

/**
 * Empirical Challenger M4 Stress Test Suite
 * UI Component Exports, Prop Interface Resilience, Bulky Freight Oracle & End-to-End UI Contracts
 */

async function runEmpiricalM4Suite() {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(' STARTING EMPIRICAL CHALLENGER M4 STRESS TEST SUITE (UI & FLOW)  ');
  console.log('══════════════════════════════════════════════════════════════════\n');

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

  // ==========================================================================
  // SUITE 1: COMPONENT FILE INTEGRITY & EXPORT INTERFACES
  // ==========================================================================
  console.log('\n--- SUITE 1: Component File Integrity & Default Exports ---');

  const componentsToVerify = [
    { name: 'CartDrawer', file: 'src/components/CartDrawer.jsx' },
    { name: 'OrderHistoryModal', file: 'src/components/OrderHistoryModal.jsx' },
    { name: 'AddressBookModal', file: 'src/components/AddressBookModal.jsx' },
    { name: 'OrderTrackModal', file: 'src/components/OrderTrackModal.jsx' },
    { name: 'Header', file: 'src/components/Header.jsx' },
    { name: 'AuthModal', file: 'src/components/AuthModal.jsx' },
    { name: 'App', file: 'src/App.jsx' }
  ];

  for (const comp of componentsToVerify) {
    await runTest(`${comp.name} exists and contains standard default export`, async () => {
      const fullPath = path.join(rootDir, comp.file);
      assert.ok(fs.existsSync(fullPath), `File ${comp.file} must exist`);
      const content = fs.readFileSync(fullPath, 'utf8');
      assert.ok(
        content.includes('export default function') || content.includes(`export default ${comp.name}`),
        `${comp.name} must have a default export`
      );
    });
  }

  // ==========================================================================
  // SUITE 2: PROP INTERFACES & BACKWARD COMPATIBILITY
  // ==========================================================================
  console.log('\n--- SUITE 2: Prop Interfaces & Dual-Prop Aliasing ---');

  await runTest('CartDrawer accepts both `user` and `currentUser` props without collision', async () => {
    const content = fs.readFileSync(path.join(rootDir, 'src/components/CartDrawer.jsx'), 'utf8');
    assert.ok(content.includes('user = null'), 'CartDrawer should declare user prop');
    assert.ok(content.includes('currentUser = null'), 'CartDrawer should declare currentUser prop');
    assert.ok(content.includes('const activeUser = user || currentUser;'), 'CartDrawer must resolve activeUser from user or currentUser');
  });

  await runTest('Header supports dual aliases for modals (onOpenOrderHistory / onOpenOrders, onOpenAddressBook / onOpenAddresses)', async () => {
    const content = fs.readFileSync(path.join(rootDir, 'src/components/Header.jsx'), 'utf8');
    assert.ok(content.includes('onOpenOrderHistory'), 'Header should support onOpenOrderHistory');
    assert.ok(content.includes('onOpenOrders'), 'Header should support onOpenOrders');
    assert.ok(content.includes('onOpenAddressBook'), 'Header should support onOpenAddressBook');
    assert.ok(content.includes('onOpenAddresses'), 'Header should support onOpenAddresses');
    assert.ok(content.includes('handleOpenMyOrders = onOpenOrderHistory || onOpenOrders'), 'Header must alias order history handlers');
    assert.ok(content.includes('handleOpenMyAddresses = onOpenAddressBook || onOpenAddresses'), 'Header must alias address book handlers');
  });

  await runTest('OrderHistoryModal handles unauthenticated guest fallback smoothly', async () => {
    const content = fs.readFileSync(path.join(rootDir, 'src/components/OrderHistoryModal.jsx'), 'utf8');
    assert.ok(content.includes('!currentUser'), 'OrderHistoryModal must check for unauthenticated state');
    assert.ok(content.includes('onOpenAuth'), 'OrderHistoryModal must provide CTA to open auth');
  });

  await runTest('AddressBookModal handles unauthenticated guest fallback smoothly', async () => {
    const content = fs.readFileSync(path.join(rootDir, 'src/components/AddressBookModal.jsx'), 'utf8');
    assert.ok(content.includes('!currentUser'), 'AddressBookModal must check for unauthenticated state');
    assert.ok(content.includes('onOpenAuth'), 'AddressBookModal must provide CTA to open auth');
  });

  // ==========================================================================
  // SUITE 3: BULKY FREIGHT MATHEMATICAL ORACLE VALIDATION
  // ==========================================================================
  console.log('\n--- SUITE 3: Bulky Freight Calculation Oracle ---');

  function calculateExpectedFreight(cartItems, hasFreightElevator, floorNumber) {
    let totalCubicMeters = 0;
    let totalWeightKg = 0;

    cartItems.forEach(item => {
      const vol = ((item.width_cm || 100) / 100) * ((item.depth_cm || 60) / 100) * ((item.height_cm || 80) / 100);
      const qty = Number(item.quantity) || 1;
      totalCubicMeters += vol * qty;
      totalWeightKg += (Number(item.weight_kg) || 25) * qty;
    });

    if (cartItems.length === 0) {
      return {
        baseFreight: 0,
        volumeSurcharge: 0,
        stairsSurcharge: 0,
        totalFreight: 0,
        totalCubicMeters: 0,
        totalWeightKg: 0
      };
    }

    const baseFreight = 150000;
    const volumeSurcharge = Math.round(totalCubicMeters * 250000);
    const stairsSurcharge = (!hasFreightElevator && floorNumber > 1) ? (floorNumber - 1) * 80000 : 0;
    const totalFreight = baseFreight + volumeSurcharge + stairsSurcharge;

    return {
      baseFreight,
      volumeSurcharge,
      stairsSurcharge,
      totalFreight,
      totalCubicMeters: parseFloat(totalCubicMeters.toFixed(3)),
      totalWeightKg: Math.round(totalWeightKg)
    };
  }

  await runTest('Empty cart yields zero freight and zero cubic meters', async () => {
    const result = calculateExpectedFreight([], true, 1);
    assert.equal(result.totalFreight, 0);
    assert.equal(result.totalCubicMeters, 0);
    assert.equal(result.stairsSurcharge, 0);
  });

  await runTest('Ground floor with freight elevator incurs standard base + volume surcharge only', async () => {
    const item = { width_cm: 200, depth_cm: 100, height_cm: 100, weight_kg: 50, quantity: 1 };
    // Volume = 2 * 1 * 1 = 2.0 m3. Volume surcharge = 2.0 * 250000 = 500000. Base = 150000. Total = 650000.
    const result = calculateExpectedFreight([item], true, 1);
    assert.equal(result.totalCubicMeters, 2.0);
    assert.equal(result.volumeSurcharge, 500000);
    assert.equal(result.stairsSurcharge, 0);
    assert.equal(result.totalFreight, 650000);
  });

  await runTest('Floor 4 without elevator adds exact stairs surcharge (3 flights * 80k = 240k)', async () => {
    const item = { width_cm: 200, depth_cm: 100, height_cm: 100, weight_kg: 50, quantity: 1 };
    const result = calculateExpectedFreight([item], false, 4);
    assert.equal(result.stairsSurcharge, (4 - 1) * 80000); // 240,000 VND
    assert.equal(result.totalFreight, 150000 + 500000 + 240000); // 890,000 VND
  });

  await runTest('CartDrawer implementation code matches mathematical freight oracle', async () => {
    const content = fs.readFileSync(path.join(rootDir, 'src/components/CartDrawer.jsx'), 'utf8');
    assert.ok(content.includes('const baseFreight = 150000;'), 'Base freight must be 150,000');
    assert.ok(content.includes('Math.round(totalCubicMeters * 250000)'), 'Volume surcharge must be 250,000/m3');
    assert.ok(content.includes('(floorNumber - 1) * 80000'), 'Stairs surcharge must be 80,000 per floor above 1');
  });

  // ==========================================================================
  // SUITE 4: USER INITIALS ORACLE VALIDATION
  // ==========================================================================
  console.log('\n--- SUITE 4: User Initials Fallback Oracle ---');

  function getUserInitials(name, email) {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
  }

  await runTest('Generates 2-letter initials for Vietnamese multi-word names', async () => {
    assert.equal(getUserInitials('Nguyễn Văn A', 'a@example.com'), 'NA');
    assert.equal(getUserInitials('Nhật Erik', 'nhaterik@gmail.com'), 'NE');
    assert.equal(getUserInitials('Đức Nhân', 'ducnhan762013@gmail.com'), 'ĐN');
  });

  await runTest('Generates 2-letter initials for single word names', async () => {
    assert.equal(getUserInitials('Admin', 'admin@example.com'), 'AD');
  });

  await runTest('Falls back to email when name is empty', async () => {
    assert.equal(getUserInitials('', 'customer@furniture.vn'), 'CU');
  });

  await runTest('Falls back to U when both name and email are empty', async () => {
    assert.equal(getUserInitials('', ''), 'U');
  });

  // ==========================================================================
  // SUITE 5: STOREFRONT API CONTRACT VERIFICATION (END-TO-END)
  // ==========================================================================
  console.log('\n--- SUITE 5: Storefront API Contract Verification ---');

  await runTest('Guest Checkout: creates order with custom delivery info and bulky freight', async () => {
    const client = createTestClient();
    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();

    const orderRes = await client.post('/api/orders', {
      customer_name: 'Guest Customer',
      customer_email: 'guest@example.com',
      customer_phone: '0912345678',
      delivery_address: '456 Le Duan, Da Nang',
      has_freight_elevator: false,
      floor_number: 3,
      freight_surcharge: 310000,
      payment_method: 'cod',
      items: [{ product_id: prod.id, quantity: 1 }]
    });

    assert.equal(orderRes.status, 200, 'Guest order should succeed with 200');
    const data = await orderRes.json();
    assert.ok(data.success, 'Response must indicate success');
    assert.ok(data.order?.id, 'Order must have an ID');
    assert.equal(data.order.total_amount, prod.price + 310000, 'Total amount must equal product price + bulky freight');
  });

  await runTest('Address Book Integration: Add, default toggle, and fetch in checkout flow', async () => {
    const client = createTestClient();
    const user = { id: 'usr_addr_test', email: 'addr_test@example.com' };
    client.withSession(user);

    // Seed user in database
    client.db.prepare(`
      INSERT INTO users (id, email, auth_provider, display_name, role)
      VALUES (?, ?, 'google', 'Address Tester', 'customer')
    `).run(user.id, user.email);

    // Add first address (Office)
    const addr1Res = await client.post('/api/customer/addresses', {
      recipient_name: 'Address Tester',
      phone: '0901112222',
      street: '72 Le Thanh Ton',
      district: 'District 1',
      city_province: 'Ho Chi Minh City',
      is_default: 1
    });
    assert.equal(addr1Res.status, 200);
    const addr1Id = (await addr1Res.json()).address.id;

    // Add second address (Home)
    const addr2Res = await client.post('/api/customer/addresses', {
      recipient_name: 'Address Tester Home',
      phone: '0903334444',
      street: '15 Thao Dien',
      district: 'Thu Duc',
      city_province: 'Ho Chi Minh City',
      is_default: 0
    });
    assert.equal(addr2Res.status, 200);
    const addr2Id = (await addr2Res.json()).address.id;

    // Toggle default to Home
    const setDefRes = await client.put(`/api/customer/addresses/${addr2Id}/default`);
    assert.equal(setDefRes.status, 200);

    // Fetch addresses
    const listRes = await client.get('/api/customer/addresses');
    assert.equal(listRes.status, 200);
    const list = (await listRes.json()).addresses;
    assert.equal(list.length, 2);

    const homeAddr = list.find(a => a.id === addr2Id);
    const officeAddr = list.find(a => a.id === addr1Id);
    assert.equal(homeAddr.is_default, 1, 'Home address must now be default');
    assert.equal(officeAddr.is_default, 0, 'Prior default must be reset to 0');
  });

  await runTest('Order History Integration: Orders retain frozen prices even after catalog price spike', async () => {
    const client = createTestClient();
    const user = { id: 'usr_history_test', email: 'history_test@example.com' };
    client.withSession(user);

    client.db.prepare(`
      INSERT INTO users (id, email, auth_provider, display_name, role)
      VALUES (?, ?, 'google', 'History Tester', 'customer')
    `).run(user.id, user.email);

    const prod = client.db.prepare('SELECT id, price FROM products LIMIT 1').get();
    const originalPrice = prod.price;

    // Place order
    const orderRes = await client.post('/api/orders', {
      customer_name: 'History Tester',
      customer_email: user.email,
      customer_phone: '0987654321',
      delivery_address: '99 History Road',
      items: [{ product_id: prod.id, quantity: 2 }]
    });
    assert.equal(orderRes.status, 200);
    const orderId = (await orderRes.json()).order.id;

    // Spike catalog price by 5,000,000 VND
    client.db.prepare('UPDATE products SET price = ? WHERE id = ?').run(originalPrice + 5000000, prod.id);

    // Fetch customer order history
    const historyRes = await client.get('/api/customer/orders');
    assert.equal(historyRes.status, 200);
    const orders = (await historyRes.json()).orders;
    assert.ok(orders.length >= 1);

    const foundOrder = orders.find(o => o.id === orderId);
    assert.ok(foundOrder, 'Order must appear in customer order history');
    assert.equal(foundOrder.items[0].unit_price, originalPrice, 'Historical item price must remain frozen at original price');
    assert.notEqual(foundOrder.items[0].unit_price, originalPrice + 5000000, 'Price spike must not contaminate historical order');
  });

  // ==========================================================================
  // SUMMARY
  // ==========================================================================
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(` EMPIRICAL CHALLENGER M4 SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (failed > 0) {
    console.error('FAILURES:');
    failures.forEach(f => console.error(`  - ${f.name}: ${f.error.message}`));
    process.exit(1);
  }
}

runEmpiricalM4Suite().catch(err => {
  console.error('Fatal suite failure:', err);
  process.exit(1);
});
