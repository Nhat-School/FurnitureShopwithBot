import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

export const DEFAULT_SESSION_SECRET = 'furproject-test-session-secret-key-32-chars-minimum!';
export const DEFAULT_GOOGLE_CLIENT_ID = 'mock-furproject-client-id.apps.googleusercontent.com';
export const DEFAULT_GOOGLE_CLIENT_SECRET = 'mock-furproject-client-secret';
export const DEFAULT_GOOGLE_REDIRECT_URI = 'http://localhost:8788/api/auth/google/callback';

export const CANONICAL_DOMAIN_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  auth_provider TEXT NOT NULL DEFAULT 'google',
  provider_subject TEXT,
  display_name TEXT,
  first_name TEXT,
  mid_name TEXT,
  last_name TEXT,
  phone TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'customer',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
  ON users (auth_provider, provider_subject)
  WHERE provider_subject IS NOT NULL;

CREATE TABLE IF NOT EXISTS customers (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_type TEXT NOT NULL DEFAULT 'standard',
  loyalty_points INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS addresses (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  street TEXT NOT NULL,
  ward TEXT,
  district TEXT NOT NULL,
  city_province TEXT NOT NULL,
  postal_code TEXT,
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY,
  user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS cart_items (
  id TEXT PRIMARY KEY,
  cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product
  ON cart_items (cart_id, product_id);

CREATE TABLE IF NOT EXISTS shipments (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  carrier TEXT NOT NULL,
  tracking_number TEXT NOT NULL,
  shipping_status TEXT NOT NULL DEFAULT 'pending',
  shipping_cost REAL DEFAULT 0,
  recipient_name TEXT,
  phone TEXT,
  delivery_address TEXT NOT NULL,
  estimated_delivery DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS order_payments (
  id TEXT PRIMARY KEY,
  order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  payment_method TEXT NOT NULL DEFAULT 'cod',
  transaction_id TEXT,
  payment_status TEXT NOT NULL DEFAULT 'pending',
  amount REAL NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
`;

/**
 * Creates a Cloudflare D1-compatible database wrapper around Node's DatabaseSync.
 */
export function createMockD1Database(db) {
  function createStatement(sql, boundParams = []) {
    return {
      bind(...newParams) {
        return createStatement(sql, newParams);
      },
      async all(...callParams) {
        const params = callParams.length > 0 ? callParams : boundParams;
        try {
          const stmt = db.prepare(sql);
          const results = stmt.all(...params);
          return { results: Array.from(results), success: true };
        } catch (err) {
          throw new Error(`D1 all() error on [${sql}]: ${err.message}`);
        }
      },
      async first(colOrParams, ...rest) {
        let col = null;
        let params = boundParams;
        if (typeof colOrParams === 'string' && rest.length === 0 && !boundParams.length) {
          col = colOrParams;
        } else if (colOrParams !== undefined && typeof colOrParams !== 'string') {
          params = [colOrParams, ...rest];
        }
        try {
          const stmt = db.prepare(sql);
          const row = stmt.get(...params);
          if (!row) return null;
          return col ? row[col] : row;
        } catch (err) {
          throw new Error(`D1 first() error on [${sql}]: ${err.message}`);
        }
      },
      async run(...callParams) {
        const params = callParams.length > 0 ? callParams : boundParams;
        try {
          const stmt = db.prepare(sql);
          const info = stmt.run(...params);
          return {
            success: true,
            meta: {
              changes: info.changes,
              last_row_id: Number(info.lastInsertRowid)
            }
          };
        } catch (err) {
          throw new Error(`D1 run() error on [${sql}]: ${err.message}`);
        }
      }
    };
  }

  return {
    prepare(sql) {
      return createStatement(sql);
    },
    async batch(statements) {
      const results = [];
      db.exec('BEGIN TRANSACTION;');
      try {
        for (const stmt of statements) {
          if (stmt.run) {
            results.push(await stmt.run());
          }
        }
        db.exec('COMMIT;');
        return results;
      } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
      }
    },
    async exec(sql) {
      db.exec(sql);
      return { count: 1, duration: 0 };
    }
  };
}

/**
 * Initializes in-memory test database applying migrations.
 */
export function setupTestDatabase({ applyMigration0002 = true, fallbackToCanonical = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');

  const migration0001Path = path.join(PROJECT_ROOT, 'migrations/0001_initial_schema.sql');
  if (fs.existsSync(migration0001Path)) {
    const sql1 = fs.readFileSync(migration0001Path, 'utf8');
    db.exec(sql1);
  }

  const migration0002Path = path.join(PROJECT_ROOT, 'migrations/0002_domain_schema.sql');
  if (fs.existsSync(migration0002Path) && applyMigration0002) {
    const sql2 = fs.readFileSync(migration0002Path, 'utf8');
    db.exec(sql2);
  } else if (fallbackToCanonical && applyMigration0002) {
    db.exec(CANONICAL_DOMAIN_SCHEMA_SQL);
    try {
      db.exec('ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id);');
    } catch (_) {
      // Column may already exist
    }
  }

  const mockD1 = createMockD1Database(db);
  return { db, mockD1 };
}

/**
 * Encodes base64url without padding.
 */
export function base64UrlEncode(bufferOrString) {
  const buf = typeof bufferOrString === 'string' ? Buffer.from(bufferOrString) : Buffer.from(bufferOrString);
  return buf.toString('base64url');
}

/**
 * Signs payload using HMAC-SHA256.
 */
export async function signSessionToken(payload, secret = DEFAULT_SESSION_SECRET) {
  const enc = new TextEncoder();
  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signatureBuffer = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  const signatureB64 = base64UrlEncode(signatureBuffer);

  return `${payloadB64}.${signatureB64}`;
}

/**
 * Verifies HMAC-SHA256 signed session token.
 */
export async function verifySessionToken(token, secret = DEFAULT_SESSION_SECRET) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signatureB64] = parts;

  try {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const signatureBytes = Buffer.from(signatureB64, 'base64url');
    const valid = await crypto.subtle.verify('HMAC', key, signatureBytes, enc.encode(payloadB64));
    if (!valid) return null;

    const payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const payload = JSON.parse(payloadJson);
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch {
    return null;
  }
}

/**
 * Parses cookies from Set-Cookie header strings or Cookie header.
 */
export function parseSetCookies(headers) {
  const cookies = {};
  const setCookieHeaders = headers.getSetCookie ? headers.getSetCookie() : [];
  for (const str of setCookieHeaders) {
    const [pair, ...flags] = str.split(';');
    const eqIdx = pair.indexOf('=');
    if (eqIdx !== -1) {
      const name = pair.substring(0, eqIdx).trim();
      const val = pair.substring(eqIdx + 1).trim();
      cookies[name] = {
        value: val,
        raw: str,
        flags: flags.map(f => f.trim().toLowerCase())
      };
    }
  }
  return cookies;
}

/**
 * Creates an HTTP test client interacting with Pages Functions or Base URL.
 */
export function createTestClient(options = {}) {
  const {
    db: customDb,
    mockD1: customMockD1,
    env: customEnv = {},
    baseUrl = process.env.BASE_URL || null,
    applyMigration0002 = true,
    fallbackToCanonical = true
  } = options;

  let db = customDb;
  let mockD1 = customMockD1;

  if (!baseUrl && !mockD1) {
    const setup = setupTestDatabase({ applyMigration0002, fallbackToCanonical });
    db = setup.db;
    mockD1 = setup.mockD1;
  }

  const defaultEnv = {
    DB: mockD1,
    SESSION_SECRET: DEFAULT_SESSION_SECRET,
    GOOGLE_CLIENT_ID: DEFAULT_GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: DEFAULT_GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI: DEFAULT_GOOGLE_REDIRECT_URI,
    ...customEnv
  };

  const cookieJar = {};
  let defaultSession = null;

  async function request(method, urlPath, { headers = {}, body = null, cookies = {} } = {}) {
    const fullUrl = baseUrl ? new URL(urlPath, baseUrl).toString() : `http://localhost:8788${urlPath.startsWith('/') ? urlPath : '/' + urlPath}`;
    const reqHeaders = new Headers(headers);

    // Merge cookie jar, explicit cookies, and defaultSession
    const combinedCookies = { ...cookieJar, ...cookies };
    if (defaultSession && !combinedCookies['fur_session']) {
      const token = await signSessionToken(defaultSession, defaultEnv.SESSION_SECRET);
      combinedCookies['fur_session'] = token;
    }

    const cookieString = Object.entries(combinedCookies)
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('; ');

    if (cookieString) {
      reqHeaders.set('Cookie', cookieString);
    }

    let requestBody = null;
    if (body !== null && body !== undefined) {
      if (typeof body === 'object' && !(body instanceof FormData) && !(body instanceof URLSearchParams)) {
        requestBody = JSON.stringify(body);
        if (!reqHeaders.has('Content-Type')) {
          reqHeaders.set('Content-Type', 'application/json; charset=utf-8');
        }
      } else {
        requestBody = body;
      }
    }

    const req = new Request(fullUrl, {
      method,
      headers: reqHeaders,
      body: ['GET', 'HEAD'].includes(method.toUpperCase()) ? undefined : requestBody
    });

    let res;
    if (baseUrl) {
      res = await fetch(req);
    } else {
      const handlerModule = await import(path.join(PROJECT_ROOT, 'functions/api/[[path]].js'));
      res = await handlerModule.onRequest({ request: req, env: defaultEnv });
    }

    // Update cookie jar from response set-cookie headers
    const parsedSetCookies = parseSetCookies(res.headers);
    for (const [name, meta] of Object.entries(parsedSetCookies)) {
      if (meta.flags.includes('max-age=0') || meta.value === '') {
        delete cookieJar[name];
      } else {
        cookieJar[name] = meta.value;
      }
    }

    // Wrap response with helper methods
    return {
      status: res.status,
      ok: res.ok,
      headers: res.headers,
      cookies: parsedSetCookies,
      getCookie(name) {
        return parsedSetCookies[name]?.value || null;
      },
      async json() {
        return await res.json();
      },
      async text() {
        return await res.text();
      },
      rawResponse: res
    };
  }

  return {
    db,
    mockD1,
    env: defaultEnv,
    cookieJar,
    setCookie(name, value) {
      cookieJar[name] = value;
    },
    clearCookies() {
      for (const k of Object.keys(cookieJar)) delete cookieJar[k];
    },
    withSession(sessionData) {
      defaultSession = sessionData;
      return this;
    },
    clearSession() {
      defaultSession = null;
      delete cookieJar['fur_session'];
    },
    get(path, opts) {
      return request('GET', path, opts);
    },
    post(path, body, opts) {
      return request('POST', path, { ...opts, body });
    },
    put(path, body, opts) {
      return request('PUT', path, { ...opts, body });
    },
    delete(path, opts) {
      return request('DELETE', path, opts);
    },
    options(path, opts) {
      return request('OPTIONS', path, opts);
    },
    request
  };
}
