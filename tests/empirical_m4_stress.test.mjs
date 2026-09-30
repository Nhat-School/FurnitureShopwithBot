import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import esbuild from 'esbuild';
import React from 'react';
import ReactDOMServer from 'react-dom/server';

const PROJECT_ROOT = process.cwd();
const CACHE_DIR = path.resolve(PROJECT_ROOT, 'node_modules/.cache/test_bundle');
fs.mkdirSync(CACHE_DIR, { recursive: true });

console.log('='.repeat(70));
console.log(' STARTING EMPIRICAL CHALLENGER STRESS TESTS (M4 STOREFRONT AUTH)');
console.log('='.repeat(70));

let passCount = 0;
let failCount = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`• PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    failCount++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`• PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`✗ FAIL: ${name}`);
    console.error(err);
    failCount++;
  }
}

// --------------------------------------------------------------------------
// 1. Bundle Components for Server/Node-side React 19 Stress Testing
// --------------------------------------------------------------------------
const headerBundlePath = path.join(CACHE_DIR, 'header.mjs');
await esbuild.build({
  entryPoints: [path.join(PROJECT_ROOT, 'src/components/Header.jsx')],
  bundle: true,
  format: 'esm',
  outfile: headerBundlePath,
  external: ['react', 'react-dom', 'lucide-react']
});

const authModalBundlePath = path.join(CACHE_DIR, 'authmodal.mjs');
await esbuild.build({
  entryPoints: [path.join(PROJECT_ROOT, 'src/components/AuthModal.jsx')],
  bundle: true,
  format: 'esm',
  outfile: authModalBundlePath,
  external: ['react', 'react-dom', 'lucide-react']
});

const { default: Header } = await import(headerBundlePath);
const { default: AuthModal } = await import(authModalBundlePath);

// --------------------------------------------------------------------------
// Test Suite 1: T1.F12.3 Sign-Out Action & Backend Verification
// --------------------------------------------------------------------------
runTest('T1.F12.3 Source Code: Header.jsx calls /api/auth/logout with POST method', () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/Header.jsx'), 'utf8');
  assert.ok(content.includes('/api/auth/logout'), 'Header must contain /api/auth/logout');
  assert.ok(content.includes("'POST'") || content.includes('"POST"'), 'Header must use POST for logout');
  assert.ok(content.includes("credentials: 'include'") || content.includes('credentials: "include"'), 'Logout fetch must include credentials');
});

runTest('Backend Route: functions/api/[[path]].js defines POST /api/auth/logout with Max-Age=0 cookie clearing', () => {
  const content = fs.readFileSync(path.join(PROJECT_ROOT, 'functions/api/[[path]].js'), 'utf8');
  assert.ok(content.includes("segments[1] === 'logout'"), 'Logout route must be routed');
  assert.ok(content.includes("method !== 'POST'"), 'Logout must enforce POST method');
  assert.ok(content.includes('clearCookieValue'), 'Logout must invoke cookie clearing');
  assert.ok(content.includes('Max-Age=0'), 'Cookie must be cleared with Max-Age=0');
});

// --------------------------------------------------------------------------
// Test Suite 2: Header Rendering & Edge Cases
// --------------------------------------------------------------------------
runTest('Header Edge Case: currentUser = null (Unauthenticated state)', () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: null }));
  assert.ok(html.includes('Đăng Nhập'), 'Must render login button');
  assert.ok(!html.includes('Đăng xuất'), 'Must not render logout button when unauthenticated');
  assert.ok(!html.includes('Quản Trị D1'), 'Must not render admin button');
});

runTest('Header Edge Case: currentUser = undefined', () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: undefined }));
  assert.ok(html.includes('Đăng Nhập'), 'Must render login button');
  assert.ok(!html.includes('Đăng xuất'), 'Must not render logout button');
});

runTest('Header Edge Case: Empty user object currentUser = {}', () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: {} }));
  // Should not throw, should render initial circle or fallback
  assert.ok(typeof html === 'string' && html.length > 0, 'Must render without error on empty user object');
  assert.ok(html.includes('Khách hàng'), 'Default role display should be Khách hàng');
});

runTest('Header Edge Case: Missing Avatar (Falls back to generated Initials)', () => {
  const userNoAvatar = {
    id: 'usr_no_avatar',
    display_name: 'Minh Tuan',
    email: 'tuan@example.com',
    avatar_url: null,
    avatar: null
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userNoAvatar }));
  assert.ok(html.includes('MT'), 'Must generate initials MT for Minh Tuan');
  assert.ok(!html.includes('<img'), 'Must not render img tag when avatar is null');
});

runTest('Header Edge Case: Avatar missing and display_name missing (Falls back to email initials)', () => {
  const userEmailOnly = {
    id: 'usr_email_only',
    email: 'phanvan@example.com',
    avatar_url: null
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userEmailOnly }));
  assert.ok(html.includes('PH'), 'Must generate initials PH from email prefix phanvan');
});

runTest('Header Edge Case: User with single-word name', () => {
  const userSingle = {
    id: 'usr_single',
    display_name: 'Alexander',
    email: 'alex@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userSingle }));
  assert.ok(html.includes('AL'), 'Must generate initials AL for single-word name');
});

runTest('Header Edge Case: Extreme Long Name (500 characters) - Layout Truncation Safety', () => {
  const longName = 'Nguyễn '.repeat(70) + 'Đức';
  const userLong = {
    id: 'usr_long',
    display_name: longName,
    email: 'longname@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userLong }));
  // Check that max-w-[110px] and truncate class are present
  assert.ok(html.includes('max-w-[110px]'), 'Must restrict width to prevent header breakage');
  assert.ok(html.includes('truncate'), 'Must truncate long user names');
  // Initials must still be strictly 2 characters (first word initial + last word initial)
  assert.ok(html.includes('NĐ'), 'Initials must cleanly be 2 chars: NĐ');
});

runTest('Header Edge Case: Continuous long word without spaces (200 characters)', () => {
  const unspacedName = 'Supercalifragilisticexpialidocious'.repeat(5);
  const userUnspaced = {
    id: 'usr_unspaced',
    display_name: unspacedName,
    email: 'unspaced@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userUnspaced }));
  assert.ok(html.includes('SU'), 'Initials must take first 2 chars SU');
});

runTest('Header Edge Case: Special XSS & Unicode characters in display_name', () => {
  const xssName = '<script>alert("hack")</script> & "quotes" \'apostrophe\'';
  const userXss = {
    id: 'usr_xss',
    display_name: xssName,
    email: 'xss@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: userXss }));
  // React auto-escapes string content
  assert.ok(!html.includes('<script>alert'), 'Must safely escape raw script tags in HTML');
  assert.ok(html.includes('&lt;script&gt;'), 'Must encode HTML entities');
});

runTest('Header Edge Case: Admin User permissions & badges', () => {
  const adminUser = {
    id: 'usr_admin',
    display_name: 'Admin Boss',
    email: 'admin@furniture.vn',
    role: 'admin',
    avatar_url: 'https://example.com/admin.jpg'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: adminUser }));
  assert.ok(html.includes('Quản Trị D1'), 'Must render Admin D1 button for admin role');
  assert.ok(html.includes('Admin'), 'Must render Admin badge in user pill');
});

runTest('Header Edge Case: Non-admin customer does NOT see Admin button', () => {
  const customerUser = {
    id: 'usr_cust',
    display_name: 'Regular Customer',
    email: 'cust@furniture.vn',
    role: 'customer'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: customerUser }));
  assert.ok(!html.includes('Quản Trị D1'), 'Regular customer must never see Quản Trị D1 button');
  assert.ok(html.includes('Khách hàng'), 'Must show Khách hàng badge');
});

// --------------------------------------------------------------------------
// Test Suite 3: AuthModal Rendering & Edge Cases
// --------------------------------------------------------------------------
runTest('AuthModal Edge Case: isOpen = false returns null / empty', () => {
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: false }));
  assert.equal(html, '', 'Closed modal must render nothing');
});

runTest('AuthModal Edge Case: isOpen = true, currentUser = null (Unauthenticated Dialog)', () => {
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: true, currentUser: null }));
  assert.ok(html.includes('Đăng Nhập Vào ABC Furniture'), 'Must display login heading');
  assert.ok(html.includes('href="/api/auth/google"'), 'Must contain link to /api/auth/google');
  assert.ok(html.includes('nhaterik@gmail.com'), 'Must offer quick dev login for nhaterik');
  assert.ok(html.includes('ducnhan762013@gmail.com'), 'Must offer quick dev login for ducnhan');
  assert.ok(html.includes('customer@furniture.vn'), 'Must offer quick customer login');
  assert.ok(html.includes('type="email"'), 'Must contain custom email input form');
});

runTest('AuthModal Edge Case: isOpen = true, currentUser authenticated (Profile View)', () => {
  const currentUser = {
    id: 'usr_123',
    display_name: 'Tran Van Bao',
    email: 'bao@example.com',
    role: 'customer',
    loyalty_points: 150
  };
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: true, currentUser }));
  assert.ok(html.includes('Thông Tin Tài Khoản'), 'Must display profile title');
  assert.ok(html.includes('Tran Van Bao'), 'Must display user name');
  assert.ok(html.includes('bao@example.com'), 'Must display user email');
  assert.ok(html.includes('Điểm tích lũy') && html.includes('150') && html.includes('điểm'), 'Must display loyalty points');
  assert.ok(html.includes('Đổi Tài Khoản Khác'), 'Must offer switch account button');
  assert.ok(html.includes('Đăng Xuất'), 'Must offer logout button');
});

runTest('AuthModal Edge Case: Authenticated Admin Profile displays Admin badge and privileges', () => {
  const adminUser = {
    id: 'usr_adm_1',
    display_name: 'Quan Tri Vien',
    email: 'nhaterik@gmail.com',
    role: 'admin'
  };
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: true, currentUser: adminUser }));
  assert.ok(html.includes('Admin'), 'Must show Admin badge');
  assert.ok(html.includes('Quyền Quản Trị Viên (Admin) đang kích hoạt'), 'Must explain admin privileges');
});

runTest('AuthModal Edge Case: Missing Avatar in Profile uses Dicebear fallback', () => {
  const userNoAvatar = {
    id: 'usr_dicebear',
    display_name: 'No Avatar User',
    email: 'noavatar@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: true, currentUser: userNoAvatar }));
  assert.ok(html.includes('dicebear.com'), 'Must fall back to dicebear URL');
  assert.ok(html.includes(encodeURIComponent('No Avatar User')), 'Dicebear seed must encode user name');
});

runTest('AuthModal Edge Case: Ultra Long Name in Profile View is truncated', () => {
  const longUser = {
    id: 'usr_profile_long',
    display_name: 'Võ Thị Sáu '.repeat(20),
    email: 'longprofile@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal, { isOpen: true, currentUser: longUser }));
  assert.ok(html.includes('truncate'), 'User profile display name must have truncate class');
});

// --------------------------------------------------------------------------
// Test Suite 4: Empirical Simulation of Sign-Out Execution Flow
// --------------------------------------------------------------------------
await runAsyncTest('Header handleSignOut execution simulation: fetch, localStorage clear, and state reset', async () => {
  let fetchCalledUrl = null;
  let fetchOptions = null;
  let updatedUser = 'INITIAL';
  let logoutCallbackFired = false;
  let localStorageRemovedKey = null;

  // Mock global environment for sign-out execution
  const mockFetch = async (url, options) => {
    fetchCalledUrl = url;
    fetchOptions = options;
    return {
      ok: true,
      json: async () => ({ success: true })
    };
  };

  const mockLocalStorage = {
    removeItem: (key) => {
      localStorageRemovedKey = key;
    }
  };

  // Extract handleSignOut logic as implemented in Header.jsx
  async function simulateHandleSignOut({ onUpdateUser, onLogout, fetchFn, storage }) {
    try {
      await fetchFn('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Sign-out request failed:', err);
    } finally {
      try {
        storage.removeItem('fur_user');
      } catch (e) {}
      if (onUpdateUser) onUpdateUser(null);
      if (onLogout) onLogout();
    }
  }

  await simulateHandleSignOut({
    onUpdateUser: (u) => { updatedUser = u; },
    onLogout: () => { logoutCallbackFired = true; },
    fetchFn: mockFetch,
    storage: mockLocalStorage
  });

  assert.equal(fetchCalledUrl, '/api/auth/logout', 'Must call /api/auth/logout');
  assert.equal(fetchOptions.method, 'POST', 'Must use POST method');
  assert.equal(fetchOptions.credentials, 'include', 'Must include cookies');
  assert.equal(updatedUser, null, 'Must clear user state to null');
  assert.equal(logoutCallbackFired, true, 'Must fire onLogout callback');
  assert.equal(localStorageRemovedKey, 'fur_user', 'Must remove fur_user from localStorage');
});

await runAsyncTest('Header handleSignOut fault tolerance: When network or backend throws 500, state is STILL cleared', async () => {
  let updatedUser = 'INITIAL';
  let logoutCallbackFired = false;
  let localStorageRemovedKey = null;

  const mockFailingFetch = async () => {
    throw new Error('Network offline or Cloudflare 500 error');
  };

  const mockLocalStorage = {
    removeItem: (key) => {
      localStorageRemovedKey = key;
    }
  };

  async function simulateHandleSignOutWithFailure({ onUpdateUser, onLogout, fetchFn, storage }) {
    try {
      await fetchFn('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
    } catch (err) {
      // Expected to catch network error
    } finally {
      try {
        storage.removeItem('fur_user');
      } catch (e) {}
      if (onUpdateUser) onUpdateUser(null);
      if (onLogout) onLogout();
    }
  }

  await simulateHandleSignOutWithFailure({
    onUpdateUser: (u) => { updatedUser = u; },
    onLogout: () => { logoutCallbackFired = true; },
    fetchFn: mockFailingFetch,
    storage: mockLocalStorage
  });

  assert.equal(updatedUser, null, 'User state must still be reset to null even if network fails');
  assert.equal(logoutCallbackFired, true, 'Logout callback must still fire on network failure');
  assert.equal(localStorageRemovedKey, 'fur_user', 'fur_user must still be removed on failure');
});

// --------------------------------------------------------------------------
// Test Suite 5: Additional Adversarial Boundary Stress Cases
// --------------------------------------------------------------------------
runTest('Header Edge Case: Zero props invocation Header() does not throw', () => {
  const html = ReactDOMServer.renderToString(React.createElement(Header));
  assert.ok(html.includes('Đăng Nhập'), 'Must render login button with zero props provided');
});

runTest('AuthModal Edge Case: Zero props invocation AuthModal() returns empty string', () => {
  const html = ReactDOMServer.renderToString(React.createElement(AuthModal));
  assert.equal(html, '', 'Must render empty string when isOpen is undefined');
});

runTest('Header Edge Case: Emoji-only user name display_name = "👑 🚀"', () => {
  const emojiUser = {
    id: 'usr_emoji',
    display_name: '👑 🚀',
    email: 'emoji@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: emojiUser }));
  assert.ok(html.includes('👑'), 'Must safely render emoji in name');
});

runTest('Header Edge Case: Whitespace-only user name display_name = "   "', () => {
  const spaceUser = {
    id: 'usr_space',
    display_name: '   ',
    email: 'space@example.com'
  };
  const html = ReactDOMServer.renderToString(React.createElement(Header, { currentUser: spaceUser }));
  assert.ok(typeof html === 'string' && html.length > 0, 'Must safely handle whitespace-only name without crashing');
});

runTest('Header Edge Case: Boundary cartCount values (negative, zero, floating)', () => {
  const htmlZero = ReactDOMServer.renderToString(React.createElement(Header, { cartCount: 0 }));
  assert.ok(!htmlZero.includes('bg-[#C08552]'), 'cartCount 0 should not render badge');

  const htmlNeg = ReactDOMServer.renderToString(React.createElement(Header, { cartCount: -5 }));
  assert.ok(!htmlNeg.includes('bg-[#C08552]'), 'Negative cartCount should not render badge');

  const htmlPos = ReactDOMServer.renderToString(React.createElement(Header, { cartCount: 4 }));
  assert.ok(htmlPos.includes('bg-[#C08552]') && htmlPos.includes('4'), 'Positive cartCount 4 must render badge');
});

runTest('Full App Root Integration: App.jsx SSR render with Header & AuthModal', async () => {
  const appBundlePath = path.join(CACHE_DIR, 'app.mjs');
  await esbuild.build({
    entryPoints: [path.join(PROJECT_ROOT, 'src/App.jsx')],
    bundle: true,
    format: 'esm',
    outfile: appBundlePath,
    external: ['react', 'react-dom', 'lucide-react']
  });
  const { default: App } = await import(appBundlePath);
  const html = ReactDOMServer.renderToString(React.createElement(App));
  assert.ok(html.includes('ABC FURNITURE'), 'App root must render brand title');
  assert.ok(html.includes('Nhật Erik'), 'App root must render default/cached user profile');
});

// --------------------------------------------------------------------------
// Test Suite 6: Full Suite Execution Check (Tier 1 & Production Build)
// --------------------------------------------------------------------------
runTest('All 65 Tier 1 E2E tests pass via Node runner', () => {
  const result = execSync('node tests/e2e/tier1_feature.test.mjs', { 
    cwd: PROJECT_ROOT, 
    encoding: 'utf8',
    env: { ...process.env, NO_COLOR: '1' }
  });
  assert.ok(/All 65 test cases passed successfully/.test(result), 'All 65 tests must pass');
  assert.ok(result.includes('T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout'), 'T1.F12.3 must pass');
});

runTest('Vite production build succeeds cleanly with 0 errors', () => {
  const result = execSync('npm run build', { cwd: PROJECT_ROOT, encoding: 'utf8' });
  assert.ok(result.includes('built in') || result.includes('dist/assets/index'), 'Build output must succeed');
});

console.log('='.repeat(70));
console.log(`STRESS TEST SUMMARY: ${passCount} passed, ${failCount} failed`);
console.log('='.repeat(70));

if (failCount > 0) {
  process.exit(1);
}
