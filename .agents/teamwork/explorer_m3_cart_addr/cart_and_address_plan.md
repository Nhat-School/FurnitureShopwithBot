# Architecture & Implementation Plan: Persistent Cart and Address Book APIs

**Milestone**: Milestone 3 (Domain Relational Model & Persistent Cart APIs)  
**Author**: Explorer Subagent (explorer_m3_cart_addr)  
**Parent Agent**: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219  
**Target Codebase**: `functions/api/[[path]].js`  
**Database**: Cloudflare D1 (`furproject-db`), schema defined in `migrations/0001_initial_schema.sql` and `migrations/0002_domain_schema.sql`

---

## 1. Executive Summary

This document specifies the technical design, data flows, validation boundaries, and exact implementation drafts for the **Persistent Cart** and **Address Book** subsystems in Furproject. 

These subsystems fulfill requirements **R2** (Domain Model & D1 Persistence) and features **F9** (Persistent Cart APIs) and **F11** (Address Book APIs) from `PROJECT.md`, directly addressing 10 failing test cases in Tier 1 (`T1.F9.1` - `T1.F9.5`, `T1.F11.3` - `T1.F11.5`) as well as cross-tenant security and boundary tests in Tiers 2, 3, and 4.

### Key Objectives
1. **Persistent Cart**: Replace transient local-only state with server-side D1 persistence linked to the authenticated customer account (`carts` and `cart_items`), dynamically joining active catalog data (`products`) to guarantee live catalog prices, titles, and images in the active cart.
2. **Address Book**: Provide authenticated customers with delivery address management in `addresses`, supporting default address designation with mutual exclusivity (`is_default = 1` resets existing defaults), strict tenant isolation, and audit preservation for historical orders.
3. **Security & Data Integrity**: Enforce strict session token validation via HMAC-SHA256 (`fur_session`), prevent IDOR / cross-tenant tampering (returning 403 Forbidden or 404 Not Found), and sanitize inputs with parameterized D1 prepared statements to prevent SQL injection.

---

## 2. Domain Model & Relational Architecture

### 2.1 Database Schema Alignment

The relational model follows the system analysis design from `thietkehethong` and the canonical schema applied in `0002_domain_schema.sql`:

```
┌─────────────────────────────────────────────────────────────┐
│                          users                              │
│  id (PK) | email (UQ) | display_name | role | ...           │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:1
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                          carts                              │
│  id (PK) | user_id (FK, UQ) | created_at | updated_at       │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        cart_items                           │
│  id (PK) | cart_id (FK) | product_id (FK) | quantity        │
│  UNIQUE(cart_id, product_id)                                │
└──────────────────────────────┬──────────────────────────────┘
                               │ N:1
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                         products                            │
│  id (PK) | name | price | stock | image_url | ...           │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                          users                              │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1:N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                        addresses                            │
│  id (PK) | user_id (FK) | recipient_name | phone | street   │
│  ward | district | city_province | postal_code | is_default │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Invariant Guarantees
1. **Single Active Cart per User**: The `carts` table enforces a `UNIQUE(user_id)` constraint. Each customer has at most one persistent cart aggregate.
2. **Product Uniqueness per Cart**: `cart_items` enforces `UNIQUE(cart_id, product_id)`. Adding an existing product increments `quantity` rather than inserting a duplicate row.
3. **Quantity Integrity**: `cart_items.quantity` has a database CHECK constraint (`quantity > 0`). Zero or negative quantities are rejected at the API boundary with 400 Bad Request.
4. **Live Catalog Price Reflection**: The `GET /api/cart` endpoint dynamically joins `cart_items` with `products` on `cart_items.product_id = products.id`. The active shopping cart always reflects current catalog prices (`p.price as current_price`). When checkout occurs, prices are snapshotted into `order_items.unit_price` (immutability).
5. **Default Address Mutual Exclusivity**: A customer can have multiple saved delivery addresses, but at most one default address (`is_default = 1`). Setting an address to default automatically clears `is_default = 0` for all other addresses owned by that customer.
6. **Order Snapshot Decoupling**: Deleting or editing a saved address in `addresses` never mutates or cascades to historical orders; `orders.delivery_address` is stored as an immutable literal string snapshot.

---

## 3. Authentication & Security Architecture

### 3.1 Session Extraction (`getAuthenticatedUser`)
Authentication uses the existing HMAC-SHA256 signed `fur_session` cookie pattern implemented in `functions/api/[[path]].js`:
- The session cookie contains `<payload_base64url>.<signature_base64url>`.
- Verification validates the cryptographic signature using `crypto.subtle` with `env.SESSION_SECRET || DEFAULT_SESSION_SECRET` and checks payload expiration (`exp`).
- If the cookie is missing, tampered with, or expired, unauthenticated endpoints return `401 Unauthorized` with `{ error: 'Unauthorized' }`.

### 3.2 Automated User Row Synchronization (`ensureUserExists`)
Because in-memory test suites (`createTestClient({ withSession })`) may inject valid cryptographic session claims for users that have not yet executed an OAuth callback in the current test database instance, and because foreign keys are active (`PRAGMA foreign_keys = ON;`), all cart and address database operations call `ensureUserExists(env, user)`:
```javascript
async function ensureUserExists(env, user) {
  if (!env?.DB || !user?.id) return;
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, email, display_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      user.id,
      user.email || `${user.id}@example.com`,
      user.display_name || user.name || 'Customer',
      user.role || 'customer'
    ).run();
  } catch (e) {
    console.warn('ensureUserExists warning:', e.message);
  }
}
```

### 3.3 Authorization & Cross-Tenant Boundary Protection
To prevent Insecure Direct Object References (IDOR):
1. **Cart Item Operations**:
   - `PUT /api/cart/items/:id` and `DELETE /api/cart/items/:id` query the database joining `cart_items` with `carts` on `cart_id`:
     `SELECT ci.id, ci.cart_id, c.user_id FROM cart_items ci JOIN carts c ON ci.cart_id = c.id WHERE ci.id = ?`
   - If the item is not found, return `404 Not Found`.
   - If `c.user_id !== authenticatedUser.id`, return `403 Forbidden` (`T2.18`, `T2.19`).
2. **Address Operations**:
   - `PUT /api/customer/addresses/:id`, `PUT /api/customer/addresses/:id/default`, and `DELETE /api/customer/addresses/:id` query:
     `SELECT id, user_id FROM addresses WHERE id = ?`
   - If not found, return `404 Not Found`.
   - If `address.user_id !== authenticatedUser.id`, return `403 Forbidden` (`T2.42`, `T2.43`).
3. **Data Segregation**:
   - `GET /api/customer/addresses` strictly filters `WHERE user_id = ?` (`T2.41`). No cross-tenant address leakage is possible.

---

## 4. API Endpoints Specification

### 4.1 Persistent Cart Endpoints

#### 1. `GET /api/cart`
- **Method / Path**: `GET /api/cart`
- **Authentication**: Required (`fur_session`). Returns `401 Unauthorized` if unauthenticated.
- **Query Strategy**:
  1. Retrieve or create cart for user: `SELECT id FROM carts WHERE user_id = ?`.
  2. If cart does not exist, return `{ items: [] }`.
  3. Query active cart items joined with live catalog:
     ```sql
     SELECT 
       ci.id,
       ci.product_id,
       ci.quantity,
       p.name AS title,
       p.name AS name,
       p.price AS current_price,
       p.price AS price,
       p.image_url,
       p.sku,
       p.stock
     FROM cart_items ci
     JOIN products p ON ci.product_id = p.id
     WHERE ci.cart_id = ?
     ORDER BY ci.created_at ASC
     ```
- **Response (200 OK)**:
  ```json
  {
    "items": [
      {
        "id": "ci_1727630000000_abc123",
        "product_id": "prod_sofa_nordic",
        "title": "Sofa Văng Nordic Scandinavian 3 Chỗ",
        "name": "Sofa Văng Nordic Scandinavian 3 Chỗ",
        "current_price": 14500000,
        "price": 14500000,
        "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80",
        "quantity": 2
      }
    ]
  }
  ```

#### 2. `POST /api/cart/items`
- **Method / Path**: `POST /api/cart/items`
- **Authentication**: Required (`fur_session`). Returns `401 Unauthorized` if unauthenticated.
- **Request Body**:
  ```json
  {
    "product_id": "prod_sofa_nordic",
    "quantity": 2
  }
  ```
- **Validation**:
  - Missing `product_id` -> `400 Bad Request` (`{ error: 'product_id is required' }`).
  - `quantity`: Must be a positive integer (`> 0`). Missing defaults to 1.
    - `quantity <= 0` or non-numeric (`typeof !== 'number'` or `!Number.isInteger(quantity)`) -> `400 Bad Request` (`T2.11`, `T2.12`, `T2.13`).
  - Product existence: Check `SELECT id, price FROM products WHERE id = ?`. If not found -> `404 Not Found` (`T2.15`).
- **Upsert Logic**:
  1. Retrieve `cart_id` via `ensureUserCart(env, user)`.
  2. Check existing item: `SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?`.
  3. If found:
     `UPDATE cart_items SET quantity = quantity + ?, updated_at = datetime('now') WHERE id = ?`
  4. If not found:
     `INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "item": {
      "id": "ci_1727630000000_abc123",
      "cart_id": "cart_usr1",
      "product_id": "prod_sofa_nordic",
      "quantity": 2
    }
  }
  ```

#### 3. `PUT /api/cart/items/:id`
- **Method / Path**: `PUT /api/cart/items/:id`
- **Authentication**: Required.
- **Request Body**:
  ```json
  {
    "quantity": 5
  }
  ```
- **Validation & Ownership**:
  - Check item existence and ownership in `cart_items` JOIN `carts`.
  - Item not found -> `404 Not Found`.
  - Item belongs to another user -> `403 Forbidden` (`T2.18`).
  - `quantity <= 0`: Remove item (`DELETE FROM cart_items WHERE id = ?`) or update.
  - `quantity > 0`: `UPDATE cart_items SET quantity = ?, updated_at = datetime('now') WHERE id = ?`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "item": {
      "id": "ci_1727630000000_abc123",
      "quantity": 5
    }
  }
  ```

#### 4. `DELETE /api/cart/items/:id`
- **Method / Path**: `DELETE /api/cart/items/:id`
- **Authentication**: Required.
- **Ownership & Deletion**:
  - Check item existence and ownership.
  - If not found -> `404 Not Found` (`T2.20` accepts 200 or 404).
  - If item belongs to another user -> `403 Forbidden` (`T2.19`).
  - Delete: `DELETE FROM cart_items WHERE id = ?`.
- **Response (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

#### 5. `DELETE /api/cart`
- **Method / Path**: `DELETE /api/cart`
- **Authentication**: Required.
- **Behavior**:
  - Lookup user's cart: `SELECT id FROM carts WHERE user_id = ?`.
  - If cart exists: `DELETE FROM cart_items WHERE cart_id = ?`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "cleared": true
  }
  ```

---

### 4.2 Address Book Endpoints

#### 1. `GET /api/customer/addresses`
- **Method / Path**: `GET /api/customer/addresses`
- **Authentication**: Required. Returns `401 Unauthorized` if unauthenticated (`T2.36`).
- **Query**:
  ```sql
  SELECT 
    id, user_id, recipient_name, phone, street, 
    ward, district, city_province, postal_code, 
    is_default, created_at
  FROM addresses
  WHERE user_id = ?
  ORDER BY is_default DESC, created_at DESC
  ```
- **Response (200 OK)**:
  ```json
  {
    "addresses": [
      {
        "id": "addr_987abc",
        "user_id": "usr_rw1",
        "recipient_name": "Nguyen Van A",
        "phone": "0901234567",
        "street": "123 Le Loi Street",
        "ward": "Ben Nghe Ward",
        "district": "District 1",
        "city_province": "Ho Chi Minh City",
        "postal_code": "70000",
        "is_default": 1,
        "created_at": "2026-09-30 00:00:00"
      }
    ]
  }
  ```

#### 2. `POST /api/customer/addresses`
- **Method / Path**: `POST /api/customer/addresses`
- **Authentication**: Required. Returns `401 Unauthorized` if unauthenticated.
- **Request Body**:
  ```json
  {
    "recipient_name": "Nguyen Van A",
    "phone": "0901234567",
    "street": "123 Le Loi Street",
    "ward": "Ben Nghe Ward",
    "district": "District 1",
    "city_province": "Ho Chi Minh City",
    "postal_code": "70000",
    "is_default": 1
  }
  ```
- **Validation**:
  - `recipient_name`: missing or empty -> `400 Bad Request` (`T2.37`).
  - `phone`: missing or empty -> `400 Bad Request` (`T2.38`).
  - `street`: missing or empty -> `400 Bad Request` (`T2.39`).
  - `city_province`: missing or empty -> `400 Bad Request` (`T2.40`).
  - `district`: if empty, default to `''` or validate.
- **Default Address Management**:
  - Normalize flag: `const isDefault = (is_default === 1 || is_default === true || is_default === '1') ? 1 : 0;`
  - If `isDefault === 1`:
    `UPDATE addresses SET is_default = 0 WHERE user_id = ?` (`T1.F11.5`, `T2.44`, `T3.5`).
- **Insertion**:
  - Ensure user exists in `users` (`ensureUserExists`).
  - Generate ID: `addr_${crypto.randomUUID()}`.
  - Insert record into `addresses`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "address": {
      "id": "addr_987abc",
      "user_id": "usr_rw1",
      "recipient_name": "Nguyen Van A",
      "phone": "0901234567",
      "street": "123 Le Loi Street",
      "ward": "Ben Nghe Ward",
      "district": "District 1",
      "city_province": "Ho Chi Minh City",
      "postal_code": "70000",
      "is_default": 1
    }
  }
  ```

#### 3. `PUT /api/customer/addresses/:id/default`
- **Method / Path**: `PUT /api/customer/addresses/:id/default`
- **Authentication**: Required.
- **Behavior**:
  1. Verify address exists and belongs to authenticated user: `SELECT id, user_id FROM addresses WHERE id = ?`.
  2. If not found -> `404 Not Found`.
  3. If `address.user_id !== authenticatedUser.id` -> `403 Forbidden`.
  4. Reset existing defaults: `UPDATE addresses SET is_default = 0 WHERE user_id = ?`.
  5. Set new default: `UPDATE addresses SET is_default = 1 WHERE id = ?`.
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "id": "addr_987abc",
    "is_default": 1
  }
  ```

#### 4. `PUT /api/customer/addresses/:id` (General Edit)
- **Method / Path**: `PUT /api/customer/addresses/:id`
- **Authentication**: Required.
- **Behavior** (`T2.42`, `T3.4`):
  1. Verify address exists and belongs to caller:
     - Not found -> `404 Not Found`.
     - Different user -> `403 Forbidden` (`T2.42`).
  2. If `is_default === 1`, clear other defaults for this user.
  3. Update provided fields (`recipient_name`, `phone`, `street`, `ward`, `district`, `city_province`, `postal_code`, `is_default`).
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "address": { ... }
  }
  ```

#### 5. `DELETE /api/customer/addresses/:id`
- **Method / Path**: `DELETE /api/customer/addresses/:id`
- **Authentication**: Required.
- **Behavior** (`T2.43`, `T2.45`):
  1. Verify address exists and belongs to caller:
     - Not found -> `404 Not Found`.
     - Different user -> `403 Forbidden` (`T2.43`).
  2. Delete: `DELETE FROM addresses WHERE id = ?`.
  3. Note: Does not cascade delete historical orders (`T2.45`).
- **Response (200 OK)**:
  ```json
  {
    "success": true
  }
  ```

---

## 5. Exact Drop-In Code Implementation Drafts

The following code snippets are designed to be integrated directly into `/Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js`.

### 5.1 Helper Functions (Place near Line 440)

```javascript
// --- Cart & Customer Helper Utilities ---

export async function getAuthenticatedUser(request, env) {
  const token = getCookie(request, SESSION_COOKIE);
  if (!token) return null;

  const secret = env?.SESSION_SECRET || DEFAULT_SESSION_SECRET;
  const payload = await verifySession(token, secret);
  if (!payload || !payload.id) return null;

  return payload;
}

export async function ensureUserExists(env, user) {
  if (!env?.DB || !user?.id) return;
  try {
    await env.DB.prepare(`
      INSERT OR IGNORE INTO users (id, email, display_name, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `).bind(
      user.id,
      user.email || `${user.id}@example.com`,
      user.display_name || user.name || 'Customer',
      user.role || 'customer'
    ).run();
  } catch (e) {
    console.warn('ensureUserExists warning:', e.message);
  }
}

export async function ensureUserCart(env, user) {
  if (!env?.DB || !user?.id) return null;
  await ensureUserExists(env, user);

  try {
    let cart = await env.DB.prepare('SELECT id FROM carts WHERE user_id = ?').bind(user.id).first();
    if (!cart) {
      const cartId = `cart_${crypto.randomUUID()}`;
      await env.DB.prepare(`
        INSERT INTO carts (id, user_id, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
      `).bind(cartId, user.id).run();
      return cartId;
    }
    return cart.id;
  } catch (e) {
    console.warn('ensureUserCart error:', e.message);
    return null;
  }
}
```

### 5.2 Persistent Cart Handlers

```javascript
// --- Persistent Cart Handlers ---

export async function handleGetCart(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized', items: [] }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ items: [] }, 200);
  }

  try {
    const cartId = await ensureUserCart(env, user);
    if (!cartId) {
      return jsonResponse({ items: [] }, 200);
    }

    const { results } = await env.DB.prepare(`
      SELECT 
        ci.id,
        ci.product_id,
        ci.quantity,
        p.name AS title,
        p.name AS name,
        p.price AS current_price,
        p.price AS price,
        p.image_url,
        p.sku,
        p.stock
      FROM cart_items ci
      JOIN products p ON ci.product_id = p.id
      WHERE ci.cart_id = ?
      ORDER BY ci.created_at ASC
    `).bind(cartId).all();

    const items = (results || []).map(row => ({
      id: row.id,
      product_id: row.product_id,
      title: row.title || row.name,
      name: row.name || row.title,
      current_price: row.current_price,
      price: row.price,
      image_url: row.image_url,
      quantity: row.quantity,
      sku: row.sku,
      stock: row.stock,
    }));

    return jsonResponse({ items }, 200);
  } catch (err) {
    console.error('handleGetCart error:', err.message);
    return jsonResponse({ error: 'Failed to retrieve cart', items: [] }, 500);
  }
}

export async function handleAddToCartItem(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { product_id, quantity } = body || {};

  // 1. Validate product_id
  if (!product_id || typeof product_id !== 'string' || !product_id.trim()) {
    return jsonResponse({ error: 'product_id is required' }, 400);
  }

  // 2. Validate quantity
  if (quantity === undefined || quantity === null) {
    return jsonResponse({ error: 'quantity is required' }, 400);
  }
  if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
    return jsonResponse({ error: 'quantity must be a positive integer' }, 400);
  }

  // 3. Check product exists in catalog
  const product = await env.DB.prepare('SELECT id, price, name FROM products WHERE id = ?').bind(product_id).first();
  if (!product) {
    return jsonResponse({ error: 'Product not found' }, 404);
  }

  try {
    const cartId = await ensureUserCart(env, user);
    if (!cartId) {
      return jsonResponse({ error: 'Unable to initialize user cart' }, 500);
    }

    // Check if item already in cart
    const existing = await env.DB.prepare(
      'SELECT id, quantity FROM cart_items WHERE cart_id = ? AND product_id = ?'
    ).bind(cartId, product_id).first();

    let itemId;
    let newQuantity;

    if (existing) {
      itemId = existing.id;
      newQuantity = existing.quantity + quantity;
      await env.DB.prepare(`
        UPDATE cart_items
        SET quantity = ?, updated_at = datetime('now')
        WHERE id = ?
      `).bind(newQuantity, itemId).run();
    } else {
      itemId = `ci_${crypto.randomUUID()}`;
      newQuantity = quantity;
      await env.DB.prepare(`
        INSERT INTO cart_items (id, cart_id, product_id, quantity, created_at, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
      `).bind(itemId, cartId, product_id, newQuantity).run();
    }

    // Touch cart updated_at
    await env.DB.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").bind(cartId).run();

    return jsonResponse({
      success: true,
      item: {
        id: itemId,
        cart_id: cartId,
        product_id,
        quantity: newQuantity,
      }
    }, 200);
  } catch (err) {
    console.error('handleAddToCartItem error:', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}

export async function handleUpdateCartItem(request, env, user, itemId) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { quantity } = body || {};

  // Check item existence and ownership
  const item = await env.DB.prepare(`
    SELECT ci.id, ci.cart_id, ci.quantity, c.user_id
    FROM cart_items ci
    JOIN carts c ON ci.cart_id = c.id
    WHERE ci.id = ?
  `).bind(itemId).first();

  if (!item) {
    return jsonResponse({ error: 'Cart item not found' }, 404);
  }

  if (item.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (typeof quantity !== 'number' || isNaN(quantity)) {
    return jsonResponse({ error: 'quantity must be a valid number' }, 400);
  }

  if (quantity <= 0) {
    await env.DB.prepare('DELETE FROM cart_items WHERE id = ?').bind(itemId).run();
    return jsonResponse({ success: true, removed: true, id: itemId }, 200);
  }

  const newQty = Math.floor(quantity);
  await env.DB.prepare(`
    UPDATE cart_items
    SET quantity = ?, updated_at = datetime('now')
    WHERE id = ?
  `).bind(newQty, itemId).run();

  return jsonResponse({
    success: true,
    item: {
      id: itemId,
      quantity: newQty,
    }
  }, 200);
}

export async function handleDeleteCartItem(request, env, user, itemId) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  const item = await env.DB.prepare(`
    SELECT ci.id, ci.cart_id, c.user_id
    FROM cart_items ci
    JOIN carts c ON ci.cart_id = c.id
    WHERE ci.id = ?
  `).bind(itemId).first();

  if (!item) {
    return jsonResponse({ error: 'Cart item not found' }, 404);
  }

  if (item.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  await env.DB.prepare('DELETE FROM cart_items WHERE id = ?').bind(itemId).run();
  return jsonResponse({ success: true, id: itemId }, 200);
}

export async function handleClearCart(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  const cart = await env.DB.prepare('SELECT id FROM carts WHERE user_id = ?').bind(user.id).first();
  if (cart) {
    await env.DB.prepare('DELETE FROM cart_items WHERE cart_id = ?').bind(cart.id).run();
  }

  return jsonResponse({ success: true, cleared: true }, 200);
}
```

### 5.3 Address Book Handlers

```javascript
// --- Customer Address Book Handlers ---

export async function handleGetAddresses(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized', addresses: [] }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ addresses: [] }, 200);
  }

  try {
    const { results } = await env.DB.prepare(`
      SELECT 
        id, user_id, recipient_name, phone, street,
        ward, district, city_province, postal_code,
        is_default, created_at
      FROM addresses
      WHERE user_id = ?
      ORDER BY is_default DESC, created_at DESC
    `).bind(user.id).all();

    return jsonResponse({ addresses: results || [] }, 200);
  } catch (err) {
    console.error('handleGetAddresses error:', err.message);
    return jsonResponse({ error: 'Failed to retrieve addresses', addresses: [] }, 500);
  }
}

export async function handleCreateAddress(request, env, user) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const {
    recipient_name,
    phone,
    street,
    ward,
    district,
    city_province,
    postal_code,
    is_default,
  } = body || {};

  // Required Field Validations
  if (!recipient_name || typeof recipient_name !== 'string' || !recipient_name.trim()) {
    return jsonResponse({ error: 'recipient_name is required' }, 400);
  }
  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    return jsonResponse({ error: 'phone is required' }, 400);
  }
  if (!street || typeof street !== 'string' || !street.trim()) {
    return jsonResponse({ error: 'street is required' }, 400);
  }
  if (!city_province || typeof city_province !== 'string' || !city_province.trim()) {
    return jsonResponse({ error: 'city_province is required' }, 400);
  }

  const cleanDistrict = district && typeof district === 'string' ? district.trim() : (body.district || '');
  const isDefault = (is_default === 1 || is_default === true || is_default === '1') ? 1 : 0;

  try {
    await ensureUserExists(env, user);

    // If setting as default, reset previous default addresses for this user
    if (isDefault === 1) {
      await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
    }

    const addrId = `addr_${crypto.randomUUID()}`;
    await env.DB.prepare(`
      INSERT INTO addresses (
        id, user_id, recipient_name, phone, street,
        ward, district, city_province, postal_code,
        is_default, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      addrId,
      user.id,
      recipient_name.trim(),
      phone.trim(),
      street.trim(),
      ward ? ward.trim() : null,
      cleanDistrict,
      city_province.trim(),
      postal_code ? postal_code.trim() : null,
      isDefault
    ).run();

    return jsonResponse({
      success: true,
      address: {
        id: addrId,
        user_id: user.id,
        recipient_name: recipient_name.trim(),
        phone: phone.trim(),
        street: street.trim(),
        ward: ward ? ward.trim() : null,
        district: cleanDistrict,
        city_province: city_province.trim(),
        postal_code: postal_code ? postal_code.trim() : null,
        is_default: isDefault,
      }
    }, 200);
  } catch (err) {
    console.error('handleCreateAddress error:', err.message);
    return jsonResponse({ error: err.message }, 500);
  }
}

export async function handleUpdateAddress(request, env, user, addrId, isDefaultOnly = false) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  const existing = await env.DB.prepare('SELECT * FROM addresses WHERE id = ?').bind(addrId).first();
  if (!existing) {
    return jsonResponse({ error: 'Address not found' }, 404);
  }

  if (existing.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  if (isDefaultOnly) {
    // Dedicated /api/customer/addresses/:id/default endpoint
    await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
    await env.DB.prepare('UPDATE addresses SET is_default = 1 WHERE id = ?').bind(addrId).run();
    return jsonResponse({ success: true, id: addrId, is_default: 1 }, 200);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    // If empty body, no updates
  }

  const isDefault = body.is_default !== undefined
    ? ((body.is_default === 1 || body.is_default === true || body.is_default === '1') ? 1 : 0)
    : existing.is_default;

  if (isDefault === 1 && existing.is_default !== 1) {
    await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').bind(user.id).run();
  }

  await env.DB.prepare(`
    UPDATE addresses SET
      recipient_name = COALESCE(?, recipient_name),
      phone = COALESCE(?, phone),
      street = COALESCE(?, street),
      ward = COALESCE(?, ward),
      district = COALESCE(?, district),
      city_province = COALESCE(?, city_province),
      postal_code = COALESCE(?, postal_code),
      is_default = ?
    WHERE id = ?
  `).bind(
    body.recipient_name || null,
    body.phone || null,
    body.street || null,
    body.ward || null,
    body.district || null,
    body.city_province || null,
    body.postal_code || null,
    isDefault,
    addrId
  ).run();

  const updated = await env.DB.prepare('SELECT * FROM addresses WHERE id = ?').bind(addrId).first();
  return jsonResponse({ success: true, address: updated }, 200);
}

export async function handleDeleteAddress(request, env, user, addrId) {
  if (!user) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database not available' }, 500);
  }

  const existing = await env.DB.prepare('SELECT id, user_id FROM addresses WHERE id = ?').bind(addrId).first();
  if (!existing) {
    return jsonResponse({ error: 'Address not found' }, 404);
  }

  if (existing.user_id !== user.id) {
    return jsonResponse({ error: 'Forbidden' }, 403);
  }

  await env.DB.prepare('DELETE FROM addresses WHERE id = ?').bind(addrId).run();
  return jsonResponse({ success: true, id: addrId }, 200);
}
```

### 5.4 Routing Integration in `onRequest`

Integrate into `functions/api/[[path]].js` inside `onRequest`:

```javascript
    // -------------------------------------------------------------
    // Persistent Shopping Cart API (/api/cart, /api/cart/items/*)
    // -------------------------------------------------------------
    if (segments[0] === 'cart') {
      const user = await getAuthenticatedUser(request, env);

      // GET /api/cart
      if (method === 'GET' && segments.length === 1) {
        return await handleGetCart(request, env, user);
      }

      // DELETE /api/cart
      if (method === 'DELETE' && segments.length === 1) {
        return await handleClearCart(request, env, user);
      }

      // /api/cart/items
      if (segments[1] === 'items') {
        // POST /api/cart/items
        if (method === 'POST' && segments.length === 2) {
          return await handleAddToCartItem(request, env, user);
        }

        // PUT /api/cart/items/:id
        if (method === 'PUT' && segments.length === 3) {
          return await handleUpdateCartItem(request, env, user, segments[2]);
        }

        // DELETE /api/cart/items/:id
        if (method === 'DELETE' && segments.length === 3) {
          return await handleDeleteCartItem(request, env, user, segments[2]);
        }
      }

      return jsonResponse({ error: 'Cart endpoint not found' }, 404);
    }

    // -------------------------------------------------------------
    // Customer Portal: Address Book & Orders (/api/customer/*)
    // -------------------------------------------------------------
    if (segments[0] === 'customer') {
      const user = await getAuthenticatedUser(request, env);

      // Customer Address Book (/api/customer/addresses/*)
      if (segments[1] === 'addresses') {
        // GET /api/customer/addresses
        if (method === 'GET' && segments.length === 2) {
          return await handleGetAddresses(request, env, user);
        }

        // POST /api/customer/addresses
        if (method === 'POST' && segments.length === 2) {
          return await handleCreateAddress(request, env, user);
        }

        // PUT /api/customer/addresses/:id/default
        if (method === 'PUT' && segments.length === 4 && segments[3] === 'default') {
          return await handleUpdateAddress(request, env, user, segments[2], true);
        }

        // PUT /api/customer/addresses/:id
        if (method === 'PUT' && segments.length === 3) {
          return await handleUpdateAddress(request, env, user, segments[2], false);
        }

        // DELETE /api/customer/addresses/:id
        if (method === 'DELETE' && segments.length === 3) {
          return await handleDeleteAddress(request, env, user, segments[2]);
        }
      }

      return jsonResponse({ error: 'Customer endpoint not found' }, 404);
    }
```

---

## 6. Edge Cases & Boundary Handling Matrix

| Scenario / Request | Endpoint | Expected Status | Behavioral Guarantee | Test Reference |
|---|---|---|---|---|
| Unauthenticated cart query | `GET /api/cart` | `401 Unauthorized` | Returns `{ error, items: [] }` without exposing cart data | `T2.16` |
| Add item without auth | `POST /api/cart/items` | `401 Unauthorized` | Item not saved | `T2.17` |
| Add item with quantity = 0 | `POST /api/cart/items` | `400 Bad Request` | Rejected; cart untouched | `T2.11` |
| Add item with quantity = -1 | `POST /api/cart/items` | `400 Bad Request` | Rejected; cart untouched | `T2.12` |
| Non-numeric quantity ('two') | `POST /api/cart/items` | `400 Bad Request` | Rejected | `T2.13` |
| Missing product_id | `POST /api/cart/items` | `400 Bad Request` | Rejected | `T2.14` |
| Non-existent product ID | `POST /api/cart/items` | `404 Not Found` | D1 lookup checks products table | `T2.15` |
| Cross-tenant cart modification | `PUT /api/cart/items/:id` | `403 Forbidden` | Checks cart ownership via JOIN with carts table | `T2.18` |
| Cross-tenant cart deletion | `DELETE /api/cart/items/:id` | `403 Forbidden` | Checks cart ownership via JOIN with carts table | `T2.19` |
| Deleting non-existent cart item | `DELETE /api/cart/items/:id` | `404 Not Found` | Handled gracefully | `T2.20` |
| Price change after cart insert | `GET /api/cart` | `200 OK` | Live join with `products` reflects current catalog price | `T3.2`, `T3.3` |
| Add address without auth | `POST /api/customer/addresses` | `401 Unauthorized` | Address not saved | `T2.36` |
| Missing recipient_name | `POST /api/customer/addresses` | `400 Bad Request` | Validates trimmed non-empty string | `T2.37` |
| Missing phone | `POST /api/customer/addresses` | `400 Bad Request` | Validates trimmed non-empty string | `T2.38` |
| Missing street | `POST /api/customer/addresses` | `400 Bad Request` | Validates trimmed non-empty string | `T2.39` |
| Missing city_province | `POST /api/customer/addresses` | `400 Bad Request` | Validates trimmed non-empty string | `T2.40` |
| Cross-tenant address isolation | `GET /api/customer/addresses` | `200 OK` | Strictly filters `WHERE user_id = ?` (empty for other users) | `T2.41` |
| Cross-tenant address modification | `PUT /api/customer/addresses/:id` | `403 Forbidden` | Compares address.user_id with session user | `T2.42` |
| Cross-tenant address deletion | `DELETE /api/customer/addresses/:id` | `403 Forbidden` | Compares address.user_id with session user | `T2.43` |
| Set is_default=1 on new address | `POST /api/customer/addresses` | `200 OK` | Resets all other user addresses to is_default=0 | `T1.F11.5`, `T2.44` |
| Set is_default=1 via default endpoint | `PUT /api/customer/addresses/:id/default` | `200 OK` | Resets other defaults and sets this one | Contract §2 |
| Address deletion impact on orders | `DELETE /api/customer/addresses/:id` | `200 OK` | Past order snapshot remains unchanged | `T2.45` |
| Extreme quantity / long string | `POST /api/cart/items` | `200 / 400` | SQLite handles integers and text lengths safely | `T2.51`, `T2.52` |
| SQL injection in street / name | Address / Cart Endpoints | `200 OK` | Parameterized D1 statements treat characters literally | `T2.54` |

---

## 7. Verification Method

Once implemented, the APIs can be independently validated through the project's test runner:

1. **Feature Tests (Tier 1)**:
   ```bash
   node tests/e2e/tier1_feature.test.mjs
   ```
   *Expected outcome*: Tests `T1.F9.1` - `T1.F9.5` (Persistent Cart) and `T1.F11.3` - `T1.F11.5` (Address Book) pass with 100% success.

2. **Boundary & Error Tests (Tier 2)**:
   ```bash
   node tests/e2e/tier2_boundary.test.mjs
   ```
   *Expected outcome*: Tests `T2.11` - `T2.20` (Cart boundaries, authorization, isolation) and `T2.36` - `T2.45` (Address boundaries, isolation, default precedence) pass.

3. **Cross-Feature Tests (Tier 3)**:
   ```bash
   node tests/e2e/tier3_cross_feature.test.mjs
   ```
   *Expected outcome*: Tests `T3.1`, `T3.2`, `T3.3`, `T3.4`, `T3.5`, `T3.6`, `T3.7`, `T3.9` pass.

4. **Real-World Workload Journeys (Tier 4)**:
   ```bash
   node tests/e2e/tier4_real_world.test.mjs
   ```
   *Expected outcome*: Journey 1 (`T4.1`) and Journey 2 (`T4.2`) complete full user flows.
