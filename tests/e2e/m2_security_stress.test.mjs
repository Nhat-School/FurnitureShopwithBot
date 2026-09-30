import assert from 'node:assert/strict';
import {
  createTestClient,
  signSessionToken,
  DEFAULT_SESSION_SECRET,
  base64UrlEncode
} from './helpers.mjs';
import {
  verifySession,
  signSession,
  timingSafeEqual,
  base64UrlDecode
} from '../../functions/api/[[path]].js';

async function runEmpiricalStressTests() {
  console.log('--- Starting Empirical Security Stress Tests for OAuth & Session ---');
  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${err.message}`);
    }
  }

  // ==========================================================================
  // Edge Case Suite 1: Session Token with Extra Dots & Delimiter Variations
  // ==========================================================================
  console.log('\n[Edge Case Suite 1: Extra Dots & Delimiter Variations]');

  await check('Token with 3 parts (one extra dot: payload.middle.sig) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'header.payload.signature');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.user, null);
  });

  await check('Token with 4 parts (a.b.c.d) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'part1.part2.part3.part4');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token with leading dot (.payload.signature) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', '.payload.signature');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token with trailing dot (payload.signature.) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'payload.signature.');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token with double dot in middle (payload..signature) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'payload..signature');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Tokens consisting solely of dots (".", "..", "...", "....") return 401', async () => {
    const client = createTestClient();
    for (const dotStr of ['.', '..', '...', '....']) {
      client.setCookie('fur_session', dotStr);
      const res = await client.get('/api/auth/me');
      assert.equal(res.status, 401, `Failed for dot string: "${dotStr}"`);
    }
  });

  await check('Direct verifySession unit calls on dot variations all return null', async () => {
    assert.equal(await verifySession('a.b.c', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('a.b.c.d', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('..', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('...', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('.a.b', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('a.b.', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('a..b', DEFAULT_SESSION_SECRET), null);
  });

  // ==========================================================================
  // Edge Case Suite 2: Malformed Base64URL Characters & Bad Encodings
  // ==========================================================================
  console.log('\n[Edge Case Suite 2: Malformed Base64URL Characters & Bad Encodings]');

  await check('Payload containing non-base64url characters (!@#$%^&*) returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', '!@#$%^&*.valid_sig_here');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Signature containing non-base64url characters returns 401', async () => {
    const client = createTestClient();
    const legitPayload = base64UrlEncode(JSON.stringify({ id: 'usr_1', email: 'u1@test.com' }));
    client.setCookie('fur_session', `${legitPayload}.!@#$%^&*()_+`);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token containing emoji/unicode characters returns 401 without crashing', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'payload_🔥_test.sig_🔒_val');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token containing null bytes and control characters returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'part1\x00payload.part2\x01sig');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Token with truncated single-character segments ("a.b") returns 401', async () => {
    const client = createTestClient();
    client.setCookie('fur_session', 'a.b');
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  await check('Direct verifySession unit calls on malformed base64url return null', async () => {
    assert.equal(await verifySession('invalid^payload.invalidsig', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('validpayload.invalid^sig', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('🔥.🔒', DEFAULT_SESSION_SECRET), null);
    assert.equal(await verifySession('\x00.\x01', DEFAULT_SESSION_SECRET), null);
  });

  // ==========================================================================
  // Edge Case Suite 3: Valid Signatures with Adversarial / Corrupted Payloads
  // ==========================================================================
  console.log('\n[Edge Case Suite 3: Valid Signatures with Corrupted Payloads]');

  await check('Valid HMAC signature for non-JSON payload returns 401', async () => {
    const nonJsonPayloadB64 = base64UrlEncode('plain text message, not json');
    const { hmacSha256 } = await import('../../functions/api/[[path]].js');
    const signature = await hmacSha256(DEFAULT_SESSION_SECRET, nonJsonPayloadB64);
    const nonJsonSignedToken = `${nonJsonPayloadB64}.${signature}`;

    const client = createTestClient();
    client.setCookie('fur_session', nonJsonSignedToken);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401, 'Non-JSON payload even with valid signature must return 401');
  });

  await check('Valid HMAC signature for JSON missing "id" property returns 401', async () => {
    const tokenNoId = await signSessionToken({ email: 'no_id@example.com', role: 'customer' }, DEFAULT_SESSION_SECRET);
    const client = createTestClient();
    client.setCookie('fur_session', tokenNoId);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
    const data = await res.json();
    assert.equal(data.user, null);
  });

  await check('Valid HMAC signature with exp in past (-1) returns 401', async () => {
    const token = await signSessionToken({ id: 'usr_past', email: 'past@test.com', exp: -1 }, DEFAULT_SESSION_SECRET);
    const client = createTestClient();
    client.setCookie('fur_session', token);
    const res = await client.get('/api/auth/me');
    assert.equal(res.status, 401);
  });

  // ==========================================================================
  // Edge Case Suite 4: OAuth PKCE State & Callback Security
  // ==========================================================================
  console.log('\n[Edge Case Suite 4: OAuth PKCE State & Callback Security]');

  await check('OAuth callback with state containing invalid characters returns error', async () => {
    const client = createTestClient();
    client.setCookie('fur_google_oauth_state', 'expected_state_abc');
    client.setCookie('fur_google_oauth_verifier', 'expected_verifier_abc');
    const res = await client.get('/api/auth/google/callback?code=mock_code&state=%3Cscript%3Ealert(1)%3C/script%3E');
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location')?.includes('auth_error=google_invalid_state'));
  });

  await check('OAuth callback with empty state query parameter returns error', async () => {
    const client = createTestClient();
    client.setCookie('fur_google_oauth_state', 'expected_state');
    client.setCookie('fur_google_oauth_verifier', 'expected_verifier');
    const res = await client.get('/api/auth/google/callback?code=mock_code&state=');
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location')?.includes('auth_error=google_invalid_state'));
  });

  await check('OAuth callback with empty code query parameter returns error', async () => {
    const client = createTestClient();
    client.setCookie('fur_google_oauth_state', 'expected_state');
    client.setCookie('fur_google_oauth_verifier', 'expected_verifier');
    const res = await client.get('/api/auth/google/callback?code=&state=expected_state');
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location')?.includes('auth_error=google_invalid_state'));
  });

  await check('OAuth callback with error=access_denied clears state and verifier cookies', async () => {
    const client = createTestClient();
    client.setCookie('fur_google_oauth_state', 'state_val');
    client.setCookie('fur_google_oauth_verifier', 'verifier_val');
    const res = await client.get('/api/auth/google/callback?error=access_denied');
    assert.equal(res.status, 302);
    assert.ok(res.headers.get('location')?.includes('auth_error=google_access_denied'));
    assert.equal(client.cookieJar['fur_google_oauth_state'], undefined);
    assert.equal(client.cookieJar['fur_google_oauth_verifier'], undefined);
  });

  console.log(`\n==================================================================`);
  console.log(`Empirical Stress Test Summary: ${passed} passed, ${failed} failed.`);
  console.log(`==================================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runEmpiricalStressTests().catch(err => {
  console.error('Stress test harness encountered fatal error:', err);
  process.exit(1);
});
