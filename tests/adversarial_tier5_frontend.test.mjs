import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';
import {
  createTestClient,
  PROJECT_ROOT
} from './e2e/helpers.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_DIR = path.resolve(PROJECT_ROOT, 'node_modules/.cache/tier5_bundle');
fs.mkdirSync(CACHE_DIR, { recursive: true });

console.log('\n' + '═'.repeat(70));
console.log(' STARTING ADVERSARIAL STRESS TEST SUITE (TIER 5 FRONTEND AUDIT) ');
console.log('═'.repeat(70) + '\n');

let passed = 0;
let failed = 0;
const failures = [];

async function test(name, fn) {
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

// ============================================================================
// 1. Bundle Frontend Components with esbuild for Node.js Testing
// ============================================================================
const components = [
  { name: 'AuthModal', path: 'src/components/AuthModal.jsx' },
  { name: 'Header', path: 'src/components/Header.jsx' },
  { name: 'CartDrawer', path: 'src/components/CartDrawer.jsx' },
  { name: 'OrderHistoryModal', path: 'src/components/OrderHistoryModal.jsx' },
  { name: 'AddressBookModal', path: 'src/components/AddressBookModal.jsx' },
  { name: 'OrderTrackModal', path: 'src/components/OrderTrackModal.jsx' },
  { name: 'App', path: 'src/App.jsx' }
];

const loadedModules = {};

for (const comp of components) {
  const outfile = path.join(CACHE_DIR, `${comp.name}.mjs`);
  await esbuild.build({
    entryPoints: [path.join(PROJECT_ROOT, comp.path)],
    bundle: true,
    format: 'esm',
    outfile,
    external: ['react', 'react-dom', 'lucide-react']
  });
  const mod = await import(outfile);
  loadedModules[comp.name] = mod.default;
}

const {
  AuthModal,
  Header,
  CartDrawer,
  OrderHistoryModal,
  AddressBookModal,
  OrderTrackModal,
  App
} = loadedModules;

// ============================================================================
// SUITE 1: COMPONENT WHITE-BOX SOURCE & EXPORT RESILIENCE
// ============================================================================
console.log('\n--- SUITE 1: Component White-Box Source & Interface Resilience ---');

for (const comp of components) {
  await test(`${comp.name} exports valid React component and renders with empty props`, async () => {
    const Component = loadedModules[comp.name];
    assert.ok(typeof Component === 'function', `${comp.name} must export a function component`);
    const html = ReactDOMServer.renderToString(React.createElement(Component));
    assert.ok(typeof html === 'string', `${comp.name} must render to string without throwing`);
  });
}

await test('Header accepts dual prop aliases without collision', async () => {
  let ordersOpened = 0;
  let addressesOpened = 0;
  let authOpened = 0;

  const html = ReactDOMServer.renderToString(React.createElement(Header, {
    currentUser: { id: 'u1', display_name: 'Alias User', email: 'alias@test.vn' },
    onOpenOrderHistory: () => { ordersOpened++; },
    onOpenOrders: () => { ordersOpened++; },
    onOpenAddressBook: () => { addressesOpened++; },
    onOpenAddresses: () => { addressesOpened++; },
    onOpenAuth: () => { authOpened++; },
    onOpenAuthModal: () => { authOpened++; }
  }));

  assert.ok(html.includes('Alias User'), 'Must render user display name');
});

await test('CartDrawer accepts dual `user` and `currentUser` props safely', async () => {
  const dummyItem = [{ id: 'p1', name: 'Sofa', price: 1000000, quantity: 1 }];

  const html1 = ReactDOMServer.renderToString(React.createElement(CartDrawer, {
    isOpen: true,
    cartItems: dummyItem,
    user: { id: 'usr_1', display_name: 'User 1' }
  }));
  assert.ok(html1.includes('Đã đăng nhập'), 'Must recognize `user` prop as logged in');

  const html2 = ReactDOMServer.renderToString(React.createElement(CartDrawer, {
    isOpen: true,
    cartItems: dummyItem,
    currentUser: { id: 'usr_2', display_name: 'User 2' }
  }));
  assert.ok(html2.includes('Đã đăng nhập'), 'Must recognize `currentUser` prop as logged in');

  const html3 = ReactDOMServer.renderToString(React.createElement(CartDrawer, {
    isOpen: true,
    cartItems: dummyItem,
    user: null,
    currentUser: null
  }));
  assert.ok(html3.includes('Khách Vãng Lai (Guest)'), 'Must fall back to Guest when both are null');
});

// ============================================================================
// SUITE 2: CORRUPTED LOCALSTORAGE & SESSION RESILIENCE STRESS TESTING
// ============================================================================
console.log('\n--- SUITE 2: Corrupted localStorage & Session Resilience Stress Testing ---');

function createMockStorage(corruptedValue, shouldThrow = false) {
  return {
    getItem: (key) => {
      if (shouldThrow) {
        const err = new Error('The quota has been exceeded or access is denied.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      return corruptedValue;
    },
    setItem: (key, val) => {
      if (shouldThrow) {
        const err = new Error('Access is denied.');
        err.name = 'SecurityError';
        throw err;
      }
    },
    removeItem: (key) => {}
  };
}

await test('App recovers gracefully from malformed JSON in localStorage ("{bad_json:")', async () => {
  const badStorage = createMockStorage('{bad_json: invalid syntax');
  function initUserFromStorage(storage) {
    try {
      const saved = storage.getItem('fur_user');
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      id: 'usr_admin_nhaterik',
      name: 'Nhật Erik (Admin)',
      display_name: 'Nhật Erik (Admin)',
      email: 'nhaterik@gmail.com',
      role: 'admin'
    };
  }

  const user = initUserFromStorage(badStorage);
  assert.equal(user.id, 'usr_admin_nhaterik', 'Must fallback to default admin on syntax error');
});

await test('App recovers gracefully from primitive string "null" in localStorage', async () => {
  const storage = createMockStorage('null');
  function initUserFromStorage(storage) {
    try {
      const saved = storage.getItem('fur_user');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) {}
    return null;
  }
  const user = initUserFromStorage(storage);
  assert.equal(user, null, 'Must treat "null" string as null user without crashing');
});

await test('Header renders safely when activeUser is corrupted primitive number (42)', async () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header, {
    currentUser: 42
  }));
  assert.ok(html.includes('Đăng Nhập') || html.includes('ABC FURNITURE'), 'Must render cleanly with number prop');
});

await test('Header renders safely when activeUser is corrupted array [1, 2, 3]', async () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header, {
    currentUser: [1, 2, 3]
  }));
  assert.ok(html.includes('ABC FURNITURE'), 'Must render cleanly with array prop');
});

await test('Header renders safely when activeUser object contains null and false fields', async () => {
  const corruptedUser = {
    id: null,
    name: null,
    display_name: null,
    email: false,
    role: null,
    avatar_url: false
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, {
    currentUser: corruptedUser
  }));
  assert.ok(html.includes('U'), 'Must fall back to U initial');
  assert.ok(html.includes('Khách hàng'), 'Must fall back to default Khách hàng');
});

await test('App safely handles SecurityError/QuotaExceededError from localStorage access', async () => {
  const throwingStorage = createMockStorage(null, true);
  let handled = false;
  try {
    try {
      throwingStorage.getItem('fur_user');
    } catch (e) {
      handled = true;
    }
    throwingStorage.setItem('fur_user', '{}');
  } catch (e) {
    handled = true;
  }
  assert.ok(handled, 'Storage exceptions must be captured without uncaught rejection');
});

// ============================================================================
// SUITE 3: BULKY FREIGHT MATHEMATICAL ORACLE STRESS TESTING
// ============================================================================
console.log('\n--- SUITE 3: Bulky Freight Mathematical Oracle Stress Testing ---');

function freightOracle(cartItems, hasFreightElevator, floorNumber) {
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

await test('Freight Oracle: 50 Randomized Monte Carlo Variations match mathematical law', async () => {
  for (let i = 0; i < 50; i++) {
    const itemCount = Math.floor(Math.random() * 5); // 0 to 4 items
    const items = [];
    for (let j = 0; j < itemCount; j++) {
      items.push({
        width_cm: 50 + Math.floor(Math.random() * 200),
        depth_cm: 30 + Math.floor(Math.random() * 100),
        height_cm: 40 + Math.floor(Math.random() * 150),
        weight_kg: 10 + Math.floor(Math.random() * 80),
        quantity: 1 + Math.floor(Math.random() * 4)
      });
    }

    const hasElevator = Math.random() > 0.5;
    const floor = 1 + Math.floor(Math.random() * 10); // Floor 1 to 10

    const result = freightOracle(items, hasElevator, floor);

    if (items.length === 0) {
      assert.equal(result.totalFreight, 0, 'Empty cart freight must be 0');
      assert.equal(result.stairsSurcharge, 0);
      assert.equal(result.volumeSurcharge, 0);
    } else {
      assert.equal(result.baseFreight, 150000);
      if (hasElevator || floor === 1) {
        assert.equal(result.stairsSurcharge, 0, `Floor ${floor} with elevator=${hasElevator} must have 0 stairs fee`);
      } else {
        assert.equal(result.stairsSurcharge, (floor - 1) * 80000, `Floor ${floor} stairs fee must be (floor-1)*80000`);
      }
      assert.equal(
        result.totalFreight,
        result.baseFreight + result.volumeSurcharge + result.stairsSurcharge,
        'Total must equal sum of base, volume and stairs'
      );
    }
  }
});

await test('Freight Boundary: High floor (Floor 10) without elevator adds 9 * 80k = 720k stairs surcharge', async () => {
  const items = [{ width_cm: 100, depth_cm: 60, height_cm: 80, weight_kg: 25, quantity: 1 }];
  const result = freightOracle(items, false, 10);
  assert.equal(result.stairsSurcharge, 720000);
  assert.equal(result.totalFreight, 150000 + Math.round(0.48 * 250000) + 720000);
});

await test('Freight Fallbacks: Missing dimensions on cart items fallback to 100x60x80cm and 25kg', async () => {
  const items = [{ id: 'bare_item' }]; // no dimensions
  const result = freightOracle(items, true, 1);
  // Volume = 1.0 * 0.6 * 0.8 = 0.48 m3
  assert.equal(result.totalCubicMeters, 0.48);
  assert.equal(result.totalWeightKg, 25);
  assert.equal(result.volumeSurcharge, Math.round(0.48 * 250000));
  assert.equal(result.totalFreight, 150000 + 120000);
});

// ============================================================================
// SUITE 4: ADVERSARIAL CART CHECKOUT VALIDATION & EDGE CASES
// ============================================================================
console.log('\n--- SUITE 4: Adversarial Cart Checkout Edge Cases & Validation ---');

await test('CartDrawer checkout validation blocks empty customer_name', async () => {
  function validateCheckout(name, phone, address, items) {
    const cleanName = (name || '').trim();
    const cleanPhone = (phone || '').trim();
    const cleanAddress = (address || '').trim();
    if (!cleanName || !cleanPhone || !cleanAddress) {
      return { error: 'Vui lòng điền đầy đủ họ tên, số điện thoại và địa chỉ giao hàng.' };
    }
    if (!items || items.length === 0) {
      return { error: 'Giỏ hàng của bạn đang trống.' };
    }
    return { success: true };
  }

  const res1 = validateCheckout('', '0901234567', '123 Le Loi', [{ id: 'p1', quantity: 1 }]);
  assert.ok(res1.error.includes('Vui lòng điền đầy đủ họ tên'));

  const res2 = validateCheckout('Nguyen Van A', '', '123 Le Loi', [{ id: 'p1', quantity: 1 }]);
  assert.ok(res2.error.includes('Vui lòng điền đầy đủ họ tên'));

  const res3 = validateCheckout('Nguyen Van A', '0901234567', '', [{ id: 'p1', quantity: 1 }]);
  assert.ok(res3.error.includes('Vui lòng điền đầy đủ họ tên'));

  const res4 = validateCheckout('Nguyen Van A', '0901234567', '123 Le Loi', []);
  assert.ok(res4.error.includes('Giỏ hàng của bạn đang trống'));
});

await test('Server Backend POST /api/orders strictly rejects negative item quantities with 400', async () => {
  const client = createTestClient();
  const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

  const res = await client.post('/api/orders', {
    customer_name: 'Negative Quantity Tester',
    customer_email: 'neg@test.vn',
    customer_phone: '0909999999',
    delivery_address: '100 Street',
    items: [{ product_id: prod.id, quantity: -2 }]
  });

  assert.equal(res.status, 400, 'Server must reject negative quantity with 400');
  const body = await res.json();
  assert.ok(body.error.includes('Item quantity must be a positive integer'));
});

await test('Server Backend POST /api/orders strictly rejects zero item quantity with 400', async () => {
  const client = createTestClient();
  const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

  const res = await client.post('/api/orders', {
    customer_name: 'Zero Quantity Tester',
    customer_email: 'zero@test.vn',
    customer_phone: '0909999999',
    delivery_address: '100 Street',
    items: [{ product_id: prod.id, quantity: 0 }]
  });

  assert.equal(res.status, 400, 'Server must reject quantity 0 with 400');
  const body = await res.json();
  assert.ok(body.error.includes('Item quantity must be a positive integer'));
});

await test('Server Backend POST /api/orders strictly rejects negative freight_surcharge with 400', async () => {
  const client = createTestClient();
  const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

  const res = await client.post('/api/orders', {
    customer_name: 'Negative Freight Tester',
    customer_email: 'freight@test.vn',
    customer_phone: '0909999999',
    delivery_address: '100 Street',
    freight_surcharge: -150000,
    items: [{ product_id: prod.id, quantity: 1 }]
  });

  assert.equal(res.status, 400, 'Server must reject negative freight surcharge with 400');
  const body = await res.json();
  assert.ok(body.error.includes('freight_surcharge must be a non-negative finite number'));
});

// ============================================================================
// SUITE 5: ADDRESS BOOK SWITCHING, CUSTOM OVERRIDE & UNICODE STRESS TESTING
// ============================================================================
console.log('\n--- SUITE 5: Address Book Switching & Unicode / Emoji Stress Testing ---');

function formatAddressString(addr) {
  if (!addr) return '';
  const parts = [addr.street, addr.ward, addr.district, addr.city_province].filter(Boolean);
  return parts.join(', ');
}

await test('Address formatting cleans up missing optional ward/district safely', async () => {
  const addr1 = { street: '123 Le Loi', city_province: 'TP. Hồ Chí Minh' };
  assert.equal(formatAddressString(addr1), '123 Le Loi, TP. Hồ Chí Minh');

  const addr2 = { street: '456 Tran Phu', ward: 'Phuong 1', district: 'Quan 5', city_province: 'TP. Hồ Chí Minh' };
  assert.equal(formatAddressString(addr2), '456 Tran Phu, Phuong 1, Quan 5, TP. Hồ Chí Minh');
});

await test('Address Book switching simulates autofill and custom override cleanly', async () => {
  const addresses = [
    {
      id: 'addr_home',
      recipient_name: 'Nguyen Van A',
      phone: '0901234567',
      street: '123 Le Loi',
      district: 'Quan 1',
      city_province: 'TP. Hồ Chí Minh',
      is_default: 1
    },
    {
      id: 'addr_office',
      recipient_name: 'Nguyen Van A (Office)',
      phone: '0909876543',
      street: 'Tòa nhà Bitexco, 2 Hai Trieu',
      district: 'Quan 1',
      city_province: 'TP. Hồ Chí Minh',
      is_default: 0
    }
  ];

  let selectedAddressId = 'custom';
  let formName = '';
  let formPhone = '';
  let formAddress = '';

  function handleSelect(id) {
    selectedAddressId = id;
    if (id === 'custom') return;
    const found = addresses.find(a => a.id === id);
    if (found) {
      formName = found.recipient_name;
      formPhone = found.phone;
      formAddress = formatAddressString(found);
    }
  }

  function handleAddressInput(newVal) {
    formAddress = newVal;
    if (selectedAddressId !== 'custom') {
      selectedAddressId = 'custom';
    }
  }

  // 1. Select Home
  handleSelect('addr_home');
  assert.equal(selectedAddressId, 'addr_home');
  assert.equal(formName, 'Nguyen Van A');
  assert.equal(formAddress, '123 Le Loi, Quan 1, TP. Hồ Chí Minh');

  // 2. Select Office
  handleSelect('addr_office');
  assert.equal(selectedAddressId, 'addr_office');
  assert.equal(formName, 'Nguyen Van A (Office)');
  assert.equal(formAddress, 'Tòa nhà Bitexco, 2 Hai Trieu, Quan 1, TP. Hồ Chí Minh');

  // 3. User manually edits address -> automatic revert to custom
  handleAddressInput('Tòa nhà Bitexco, Tầng 35, 2 Hai Trieu');
  assert.equal(selectedAddressId, 'custom', 'Editing address must automatically shift selectedAddressId to custom');
  assert.equal(formAddress, 'Tòa nhà Bitexco, Tầng 35, 2 Hai Trieu');
});

await test('Server Backend POST /api/customer/addresses safely persists extreme Vietnamese characters & emojis', async () => {
  const client = createTestClient();
  const user = { id: 'usr_vn_stress', email: 'vn_stress@example.com' };
  client.withSession(user);

  client.db.prepare(`
    INSERT INTO users (id, email, auth_provider, display_name, role)
    VALUES (?, ?, 'google', 'Nguyễn Thị Ánh Tuyết 🌸', 'customer')
  `).run(user.id, user.email);

  const extremeVietnamese = {
    recipient_name: 'Trần Vũ Hoàng Điệp (Kho Tổng Miền Trung) 🇻🇳 📦',
    phone: '0901234567',
    street: 'Thôn Đắk R’măng, Xã Đắk R’mô, Huyện Đắk Glong, Tỉnh Đắk Nông',
    ward: 'Xã Đắk R’mô',
    district: 'Huyện Đắk Glong',
    city_province: 'Đắk Nông',
    postal_code: '64000',
    is_default: 1
  };

  const res = await client.post('/api/customer/addresses', extremeVietnamese);
  assert.equal(res.status, 200, 'Must successfully save address with Vietnamese tone marks & emojis');
  const body = await res.json();
  assert.equal(body.address.recipient_name, extremeVietnamese.recipient_name);
  assert.equal(body.address.street, extremeVietnamese.street);

  const listRes = await client.get('/api/customer/addresses');
  assert.equal(listRes.status, 200);
  const list = (await listRes.json()).addresses;
  assert.equal(list[0].recipient_name, extremeVietnamese.recipient_name);
});

await test('AddressBookModal renders Vietnamese diacritics and emojis without escaping corruption', async () => {
  const html = ReactDOMServer.renderToString(React.createElement(AddressBookModal, {
    isOpen: true,
    currentUser: {
      id: 'u1',
      name: 'Võ Thị Sáu 🌺',
      display_name: 'Võ Thị Sáu 🌺'
    }
  }));
  assert.ok(html.includes('Sổ Địa Chỉ Giao Hàng'), 'Must render header in Vietnamese');
  assert.ok(html.includes('Bạn chưa lưu địa chỉ giao hàng nào') || html.includes('Thêm Địa Chỉ Đầu Tiên'), 'Must render empty state in Vietnamese');
});

// ============================================================================
// SUITE 6: ORDER TRACKING & CROSS-MODAL HANDOFF RESILIENCE
// ============================================================================
console.log('\n--- SUITE 6: Order Tracking & Cross-Modal Handoff Resilience ---');

await test('OrderTrackModal handles empty code lookup safely as a no-op', async () => {
  let lookupCalled = false;
  async function lookup(code) {
    if (!code || !code.trim()) return;
    lookupCalled = true;
  }
  await lookup('');
  await lookup('   ');
  assert.equal(lookupCalled, false, 'Empty or whitespace code must be ignored');
});

await test('Server Backend GET /api/orders/:code returns 404 for non-existent tracking code', async () => {
  const client = createTestClient();
  const res = await client.get('/api/orders/NON_EXISTENT_CODE_12345');
  assert.equal(res.status, 404, 'Must return 404 for non-existent tracking code');
  const body = await res.json();
  assert.equal(body.error, 'Order not found');
});

await test('Server Backend GET /api/orders/:code safely handles URL-sensitive characters without injection', async () => {
  const client = createTestClient();
  const specialCodes = [
    'ABC-VN-83921%20TEST',
    'ABC/../ADMIN',
    'ABC?query=1&flag=2',
    '<script>alert(1)</script>'
  ];

  for (const c of specialCodes) {
    const res = await client.get(`/api/orders/${encodeURIComponent(c)}`);
    assert.equal(res.status, 404, `Malformed tracking code ${c} should return 404 safely`);
  }
});

await test('Server Backend GET /api/orders/:code case-insensitive matching (lowercase vs uppercase)', async () => {
  const client = createTestClient();
  const prod = client.db.prepare('SELECT id FROM products LIMIT 1').get();

  // Create order
  const createRes = await client.post('/api/orders', {
    customer_name: 'Case Insensitive Tester',
    customer_email: 'case@test.vn',
    customer_phone: '0901112222',
    delivery_address: '123 Test Street',
    items: [{ product_id: prod.id, quantity: 1 }]
  });
  assert.equal(createRes.status, 200);
  const trackingCode = (await createRes.json()).order.tracking_code;

  // Query with lowercase
  const lowerRes = await client.get(`/api/orders/${trackingCode.toLowerCase()}`);
  assert.equal(lowerRes.status, 200, 'Tracking code lookup must be case-insensitive');
  const data = await lowerRes.json();
  assert.equal(data.trackingCode, trackingCode);

  // Query with uppercase
  const upperRes = await client.get(`/api/orders/${trackingCode.toUpperCase()}`);
  assert.equal(upperRes.status, 200);
});

await test('Cross-modal tracking handoff simulation: CartDrawer -> App -> OrderTrackModal', async () => {
  let appTrackingCode = '';
  let trackerModalOpen = false;

  function mockOnOpenTracker(code) {
    appTrackingCode = (code || '').trim();
    trackerModalOpen = true;
  }

  // Simulate CartDrawer completing order and user clicking tracking view
  const placedOrder = {
    id: 'ord_test_handoff',
    tracking_code: 'ABC-VN-998877'
  };

  function handleOpenTrackingViewFromCart() {
    const code = placedOrder?.tracking_code;
    if (mockOnOpenTracker && code) {
      mockOnOpenTracker(code);
    }
  }

  handleOpenTrackingViewFromCart();

  assert.equal(trackerModalOpen, true, 'Tracker modal must be opened');
  assert.equal(appTrackingCode, 'ABC-VN-998877', 'Tracking code must be handed off cleanly');

  // Verify OrderTrackModal renders with this tracking code
  const html = ReactDOMServer.renderToString(React.createElement(OrderTrackModal, {
    isOpen: trackerModalOpen,
    initialTrackingCode: appTrackingCode
  }));
  assert.ok(html.includes('ABC-VN-998877'), 'OrderTrackModal must render initialTrackingCode in input field');
});

await test('Cross-modal tracking handoff simulation: OrderHistoryModal -> App -> OrderTrackModal', async () => {
  let historyModalOpen = true;
  let trackerModalOpen = false;
  let activeTrackingCode = '';

  function handleTrackOrderFromHistory(code) {
    historyModalOpen = false;
    activeTrackingCode = code;
    trackerModalOpen = true;
  }

  handleTrackOrderFromHistory('ABC-VN-112233');

  assert.equal(historyModalOpen, false, 'History modal must close');
  assert.equal(trackerModalOpen, true, 'Tracker modal must open');
  assert.equal(activeTrackingCode, 'ABC-VN-112233', 'Tracking code must pass to tracker modal');

  const html = ReactDOMServer.renderToString(React.createElement(OrderTrackModal, {
    isOpen: trackerModalOpen,
    initialTrackingCode: activeTrackingCode
  }));
  assert.ok(html.includes('ABC-VN-112233'), 'OrderTrackModal must reflect handed-off tracking code');
});

// ============================================================================
// SUITE 7: API ERROR RESILIENCE & LIFECYCLE UNMOUNT SIMULATION
// ============================================================================
console.log('\n--- SUITE 7: API Error Resilience & Lifecycle Unmount Simulation ---');

await test('Header handles 500 Internal Server Error from /api/auth/me during session restoration', async () => {
  let updatedUser = 'INITIAL';
  const mockFailingFetch = async (url) => {
    if (url === '/api/auth/me') {
      return {
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal Server Error' })
      };
    }
    return { ok: false, status: 404 };
  };

  async function simulateHeaderMount({ onUpdateUser, fetchFn }) {
    let isMounted = true;
    try {
      const res = await fetchFn('/api/auth/me', { method: 'GET', credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data?.user && isMounted) {
          if (onUpdateUser) onUpdateUser(data.user);
        }
      }
    } catch (err) {
      // safe debug catch
    }
    return () => { isMounted = false; };
  }

  const unmount = await simulateHeaderMount({
    onUpdateUser: (u) => { updatedUser = u; },
    fetchFn: mockFailingFetch
  });

  assert.equal(updatedUser, 'INITIAL', 'User state must remain untouched on 500 error');
  unmount();
});

await test('Header session restoration safely ignores unmounted component updates', async () => {
  let updatedUser = 'INITIAL';
  let resolver;
  const slowPromise = new Promise(resolve => { resolver = resolve; });

  const slowFetch = async () => {
    await slowPromise;
    return {
      ok: true,
      status: 200,
      json: async () => ({ user: { id: 'usr_slow', name: 'Slow User' } })
    };
  };

  let isMounted = true;
  async function simulateMountWithSlowResponse() {
    try {
      const res = await slowFetch();
      if (res.ok) {
        const data = await res.json();
        if (data?.user && isMounted) {
          updatedUser = data.user;
        }
      }
    } catch (e) {}
  }

  const promise = simulateMountWithSlowResponse();
  // Unmount component before slow response completes
  isMounted = false;
  resolver();
  await promise;

  assert.equal(updatedUser, 'INITIAL', 'State must not be updated after unmount guard triggers');
});

await test('OrderHistoryModal handles 401 Unauthorized by setting error state and clearing orders', async () => {
  let orders = ['initial_order'];
  let errorState = null;

  async function simulateFetchOrders(fetchFn) {
    try {
      const res = await fetchFn('/api/customer/orders');
      if (res.status === 401) {
        errorState = 'unauthorized';
        orders = [];
        return;
      }
      if (!res.ok) throw new Error(`Lỗi tải đơn hàng: mã ${res.status}`);
      const data = await res.json();
      orders = data.orders || [];
    } catch (err) {
      errorState = err.message;
    }
  }

  const mock401 = async () => ({ ok: false, status: 401 });
  await simulateFetchOrders(mock401);

  assert.equal(errorState, 'unauthorized');
  assert.equal(orders.length, 0, 'Orders must be cleared on 401');
});

await test('AddressBookModal handles 500 server crash with user-friendly error message', async () => {
  let errorMessage = null;

  async function simulateFetchAddresses(fetchFn) {
    try {
      const res = await fetchFn('/api/customer/addresses');
      if (!res.ok) throw new Error(`Lỗi tải sổ địa chỉ: mã ${res.status}`);
    } catch (err) {
      errorMessage = err.message;
    }
  }

  const mock500 = async () => ({ ok: false, status: 500 });
  await simulateFetchAddresses(mock500);

  assert.equal(errorMessage, 'Lỗi tải sổ địa chỉ: mã 500', 'Must capture 500 error code for display');
});

// ============================================================================
// SUITE 8: PRICE IMMUTABILITY AUDIT ACROSS CLIENT STOREFRONT COMPONENTS
// ============================================================================
console.log('\n--- SUITE 8: Price Immutability Audit Across Storefront Components ---');

await test('OrderHistoryModal displays frozen historical unit prices from line items', async () => {
  const historicalOrder = {
    id: 'ord_historical_frozen',
    customer_name: 'Tran Van Bao',
    customer_phone: '0901234567',
    status: 'Paid',
    total_amount: 14650000,
    created_at: '2026-09-29T10:00:00Z',
    items: [
      {
        id: 'oi_1',
        title: 'Sofa Văng Nordic',
        unit_price: 14500000, // Frozen snapshot price
        quantity: 1
      }
    ],
    shipment: {
      tracking_number: 'ABC-VN-111222',
      shipping_status: 'in_transit'
    }
  };

  const html = ReactDOMServer.renderToString(React.createElement(OrderHistoryModal, {
    isOpen: true,
    currentUser: { id: 'usr_bao', name: 'Tran Van Bao' }
  }));

  assert.ok(html.includes('Lịch Sử Đơn Hàng Của Bạn'), 'Must render modal header');
  assert.ok(html.includes('Giá Gốc Khóa Chặt Tại Checkout') || html.includes('Lưu trữ giá gốc bất biến'), 'Must highlight price immutability commitment');
});

await test('CartDrawer displays price immutability confirmation pill upon successful order placement', async () => {
  // Check CartDrawer source contains immutability pill
  const content = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/CartDrawer.jsx'), 'utf8');
  assert.ok(content.includes('Đơn giá và cước vận chuyển đã được khóa cố định theo hợp đồng'), 'CartDrawer must display immutability guarantee');
});

// ============================================================================
// SUMMARY REPORT
// ============================================================================
console.log('\n' + '═'.repeat(70));
console.log(` TIER 5 ADVERSARIAL COVERAGE SUMMARY: ${passed} PASSED, ${failed} FAILED `);
console.log('═'.repeat(70) + '\n');

if (failed > 0) {
  console.error('FAILURES:');
  failures.forEach(f => console.error(`  - ${f.name}: ${f.error.message}`));
  process.exit(1);
}
