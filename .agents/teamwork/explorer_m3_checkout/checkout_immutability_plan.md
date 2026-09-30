# Price Immutability Checkout Transaction — Implementation Plan & Architecture Specification

## 1. Executive Summary & Mathematical Invariance

In modern e-commerce architectures (specifically following domain-driven design principles for furniture logistics and volatile retail pricing), product catalog prices are non-stationary time series:

```
P_catalog(t)
```

where prices fluctuate due to flash sales, promotional campaigns, seasonal re-indexing, or supplier cost changes.

### The Price Immutability Law
At the exact timestamp of checkout completion (`t = t_checkout`), the unit price of each purchased item must be permanently frozen and recorded into the persistent relational entity `order_items`:

```
P_order_item(t) = P_catalog(t_checkout),  for all t >= t_checkout
```

Consequently, the time derivative of the historical item price is strictly zero:

```
d/dt ( order_items.unit_price ) = 0,  for all t >= t_checkout
```

Any subsequent catalog mutation:

```
Delta P_catalog != 0
```

must have exactly zero impact on placed orders:

```
Delta P_order_item = 0,   Delta Total_order = 0
```

### Transactional Atomicity (ACID via D1 Batch)
The entire checkout operation encompasses 5 discrete persistence actions across 5 relational tables:
1. **Order Record Creation** (`orders` table).
2. **Order Line Items Snapshot** (`order_items` table with frozen unit prices).
3. **Fulfillment & Logistics Record** (`shipments` table with tracking code and address snapshot).
4. **Financial Transaction Record** (`order_payments` table with matching frozen total amount).
5. **Cart State Transition** (`cart_items` table purged for authenticated customers).

All 5 operations are executed within a single Cloudflare D1 atomic transaction using `env.DB.batch([...])`. If any single statement fails (e.g., constraint error, foreign key issue), the entire batch is rolled back automatically, preventing orphaned orders, unfulfilled payments, or prematurely cleared carts.

---

## 2. Relational Database Schema & Alignment

The implementation aligns directly with `migrations/0001_initial_schema.sql` and `migrations/0002_domain_schema.sql`.

### Relational Schema Contracts

#### 1. `products` (Catalog Source of Truth)
```sql
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    ...
);
```
> **Critical Schema Note**: The column in `products` is `name`, NOT `title`. Queries must select `id, name, price, stock FROM products WHERE id = ?`. For API consumers expecting `title`, map `title: product.name`.

#### 2. `orders` (Order Aggregate Root)
```sql
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    has_freight_elevator INTEGER DEFAULT 1,
    floor_number INTEGER DEFAULT 1,
    subtotal REAL NOT NULL,
    freight_surcharge REAL NOT NULL DEFAULT 0,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Paid',
    tracking_code TEXT UNIQUE,
    payment_method TEXT DEFAULT 'CreditCard',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);
```

#### 3. `order_items` (Historical Line Item Snapshot)
```sql
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);
```

#### 4. `shipments` (Logistics & Fulfillment Entity)
```sql
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    carrier TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    shipping_status TEXT NOT NULL DEFAULT 'pending',
    shipping_cost REAL NOT NULL DEFAULT 0,
    recipient_name TEXT,
    phone TEXT,
    delivery_address TEXT NOT NULL,
    estimated_delivery DATETIME,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

#### 5. `order_payments` (Settlement Tracking Entity)
```sql
CREATE TABLE IF NOT EXISTS order_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    transaction_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    amount REAL NOT NULL,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

#### 6. `carts` & `cart_items` (Active Mutable Session Aggregate)
```sql
CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);
```

---

## 3. Detailed Step-by-Step Checkout Architecture

```
Client POST /api/orders
   │
   ├─► 1. Parse JSON Body (catch SyntaxError -> 400 Bad Request)
   │
   ├─► 2. Validate Required Fields & Boundaries
   │      - customer_name, customer_email, customer_phone, delivery_address
   │      - items is non-empty array
   │      - item.quantity is positive integer (> 0, Number.isInteger)
   │
   ├─► 3. Authenticate Session (Cookie: fur_session)
   │      - Verify HMAC-SHA256 signature
   │      - If authenticated: customer_id = session.id (ensure user row exists)
   │      - If unauthenticated / guest: customer_id = NULL
   │
   ├─► 4. Catalog Price Query & Price Tampering Neutralization
   │      - Discard any client-supplied unit_price, price, or total_amount
   │      - For each item: SELECT id, name, price, stock FROM products WHERE id = ?
   │      - If not found: return 404 (or 400)
   │      - Freeze unit_price = Number(product.price)
   │      - Subtotal = sum(unit_price * quantity)
   │      - total_amount = Subtotal + freight_surcharge
   │
   ├─► 5. Generate Entity Identifiers & Codes
   │      - Order ID: ord_<timestamp>_<random>
   │      - Tracking Number: ABC-VN-<6-digit-random>
   │      - Shipment ID: ship_<timestamp>_<random>
   │      - Payment ID: pay_<timestamp>_<random>
   │
   ├─► 6. Execute Atomic D1 Transaction (env.DB.batch)
   │      ┌────────────────────────────────────────────────────────┐
   │      │ BEGIN TRANSACTION;                                     │
   │      │ 1. INSERT INTO orders (...) VALUES (...)               │
   │      │ 2. INSERT INTO order_items (...) VALUES (...) [x N]    │
   │      │ 3. INSERT INTO shipments (...) VALUES (...)            │
   │      │ 4. INSERT INTO order_payments (...) VALUES (...)       │
   │      │ 5. DELETE FROM cart_items WHERE cart_id IN             │
   │      │    (SELECT id FROM carts WHERE user_id = customer_id)  │
   │      │ COMMIT;                                                │
   │      └────────────────────────────────────────────────────────┘
   │
   └─► 7. Return Response (Status 200 OK)
          { success: true, order: { id, customer_id, total_amount, tracking_code, items, shipment, payment } }
```

### Step 1: Resilient JSON Parsing
- When reading `await request.json()`, wrap in a try-catch block.
- If invalid JSON syntax is supplied (as tested in `T2.30`), catch `SyntaxError` and immediately return HTTP 400: `{ error: 'Invalid JSON payload' }`.
- If body is null or not an object, return HTTP 400.

### Step 2: Boundary & Input Validation Matrix
| Field | Rule | Violation Response | Relevant Test Case |
|---|---|---|---|
| `body` | Must be non-empty object | 400 `Empty body or invalid payload` | `T2.29` |
| `customer_name` | Non-empty string after trim | 400 `Missing customer_name` | `T2.23` |
| `customer_phone` | Non-empty string after trim | 400 `Missing customer_phone` | `T2.24` |
| `delivery_address` | Non-empty string after trim | 400 `Missing delivery_address` | `T2.25` |
| `customer_email` | Non-empty string (or session email) | 400 `Missing customer_email` | General schema integrity |
| `items` | Array with `length > 0` | 400 `items array is required and must not be empty` | `T2.21`, `T2.22` |
| `item.product_id` | Non-empty string | 400 `Each item must have a product_id` | `T2.28` |
| `item.quantity` | Integer strictly `> 0` | 400 `Item quantity must be a positive integer` | `T2.26`, `T2.27` |
| `item.product_id` existence | Exists in `products` table | 404 (or 400) `Product not found` | `T2.28` |

### Step 3: Session Extraction & Customer Linkage
- Read `fur_session` cookie via `getCookie(request, 'fur_session')`.
- Verify token via `verifySession(sessionCookie, env.SESSION_SECRET)`.
- If valid session with `session.id`:
  - `customerId = session.id`.
  - Execute `INSERT OR IGNORE INTO users ...` to guarantee foreign key integrity if session is synthetic or first-time customer.
- If no cookie or invalid token:
  - `customerId = null` (Guest Checkout Fallback per `T1.F4.2`).

### Step 4: Catalog Price Freezing ($d/dt(\text{unit\_price}) = 0$)
- In order to defeat client price spoofing (`T2.31`, `T2.32`, `T2.33`):
  - Any client-submitted `price`, `unit_price`, or `total_amount` in the JSON body is ignored.
  - The server queries `products` directly in D1 for each item:
    ```sql
    SELECT id, name, price, stock FROM products WHERE id = ?
    ```
  - `unit_price` is extracted directly: `const unitPrice = Number(product.price);`.
  - Calculate `line_total = unitPrice * item.quantity`.
  - Sum `subtotal = sum(line_total)`.
  - Calculate `total_amount = subtotal + freightSurcharge`.
  - This guarantees that even if the client claims `price: 1` or `total_amount: 100`, the database stores and responds with the exact server-calculated catalog amount.

### Step 5: Entity Identification & Tracking Codes
- `orderId`: `ord_${Date.now()}_${randomBase64Url(6)}`
- `trackingCode`: `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`
- `shipmentId`: `ship_${Date.now()}_${randomBase64Url(6)}`
- `paymentId`: `pay_${Date.now()}_${randomBase64Url(6)}`
- `itemIds`: `oi_${Date.now()}_${idx}_${randomBase64Url(4)}`

### Step 6: Atomic D1 Batch Execution
The statements prepared for `env.DB.batch([...])`:
1. `INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, has_freight_elevator, floor_number, subtotal, freight_surcharge, total_amount, status, tracking_code, payment_method, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?, ?, ?, datetime('now'), datetime('now'))`
2. For each frozen line item:
   `INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)`
3. `INSERT INTO shipments (id, order_id, carrier, tracking_number, shipping_status, shipping_cost, recipient_name, phone, delivery_address, estimated_delivery, created_at, updated_at) VALUES (?, ?, 'ABC Bulky Logistics', ?, 'pending', ?, ?, ?, ?, datetime('now', '+3 days'), datetime('now'), datetime('now'))`
4. `INSERT INTO order_payments (id, order_id, payment_method, transaction_id, payment_status, amount, created_at, updated_at) VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))`
5. If `customerId` is present:
   `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)`

### Step 7: Response Contract
Return HTTP 200 (or 201) with:
```json
{
  "success": true,
  "order": {
    "id": "ord_...",
    "customer_id": "usr_...",
    "customer_name": "Nguyen Van A",
    "customer_email": "a@example.com",
    "customer_phone": "0901234567",
    "delivery_address": "123 Street",
    "subtotal": 29000000,
    "freight_surcharge": 0,
    "total_amount": 29000000,
    "totalAmount": 29000000,
    "status": "Processing",
    "tracking_code": "ABC-VN-123456",
    "trackingCode": "ABC-VN-123456",
    "payment_method": "cod",
    "items": [
      {
        "id": "oi_...",
        "order_id": "ord_...",
        "product_id": "prod_sofa_nordic",
        "name": "Sofa Văng Nordic",
        "quantity": 2,
        "unit_price": 14500000,
        "subtotal": 29000000
      }
    ],
    "shipment": {
      "id": "ship_...",
      "order_id": "ord_...",
      "carrier": "ABC Bulky Logistics",
      "tracking_number": "ABC-VN-123456",
      "shipping_status": "pending",
      "shipping_cost": 0,
      "delivery_address": "123 Street"
    },
    "payment": {
      "id": "pay_...",
      "order_id": "ord_...",
      "payment_method": "cod",
      "payment_status": "pending",
      "amount": 29000000
    }
  }
}
```

---

## 4. Code Implementation Draft for `functions/api/[[path]].js`

Here is the exact production code block designed for insertion into `functions/api/[[path]].js`:

```javascript
    // -------------------------------------------------------------
    // 6. Bulky Shipping & Orders (/api/shipping, /api/orders)
    // -------------------------------------------------------------
    if (segments[0] === 'shipping' && segments[1] === 'calculate' && method === 'POST') {
      const body = await request.json();
      let totalCubicMeters = 0;
      (body.items || []).forEach(item => {
        const vol = ((item.width_cm || 100) / 100) * ((item.depth_cm || 60) / 100) * ((item.height_cm || 80) / 100);
        totalCubicMeters += vol * (item.quantity || 1);
      });

      const baseFreight = 150000;
      const volumeSurcharge = Math.round(totalCubicMeters * 250000);
      const floor = parseInt(body.floorNumber) || 1;
      const stairsSurcharge = (!body.hasFreightElevator && floor > 1) ? (floor - 1) * 80000 : 0;

      return jsonResponse({
        baseFreight,
        volumeSurcharge,
        stairsSurcharge,
        totalFreight: baseFreight + volumeSurcharge + stairsSurcharge,
        totalCubicMeters: parseFloat(totalCubicMeters.toFixed(3)),
      });
    }

    if (segments[0] === 'orders') {
      // POST /api/orders: Atomic checkout with strict price immutability
      if (method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch {
          return jsonResponse({ error: 'Invalid JSON payload' }, 400);
        }

        if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length === 0) {
          return jsonResponse({ error: 'Request body must be a non-empty JSON object' }, 400);
        }

        // Required field validation (T2.21 - T2.25)
        const customerName = String(body.customer_name || '').trim();
        const customerPhone = String(body.customer_phone || '').trim();
        const deliveryAddress = String(body.delivery_address || '').trim();
        const customerEmail = String(body.customer_email || '').trim();

        if (!customerName) {
          return jsonResponse({ error: 'customer_name is required' }, 400);
        }
        if (!customerPhone) {
          return jsonResponse({ error: 'customer_phone is required' }, 400);
        }
        if (!deliveryAddress) {
          return jsonResponse({ error: 'delivery_address is required' }, 400);
        }

        if (!Array.isArray(body.items) || body.items.length === 0) {
          return jsonResponse({ error: 'items array is required and must not be empty' }, 400);
        }

        // Validate each item in payload (T2.26, T2.27, T2.28)
        for (const it of body.items) {
          if (!it || typeof it !== 'object' || !it.product_id) {
            return jsonResponse({ error: 'Each item must have a product_id' }, 400);
          }
          if (typeof it.quantity !== 'number' || !Number.isInteger(it.quantity) || it.quantity <= 0) {
            return jsonResponse({ error: 'Item quantity must be a positive integer' }, 400);
          }
        }

        if (!env?.DB) {
          return jsonResponse({ error: 'Database binding unavailable' }, 500);
        }

        // Customer Authentication Linkage
        let customerId = null;
        let authEmail = customerEmail;
        const sessionCookie = getCookie(request, SESSION_COOKIE);
        if (sessionCookie) {
          const session = await verifySession(sessionCookie, env.SESSION_SECRET);
          if (session && session.id) {
            customerId = session.id;
            authEmail = customerEmail || session.email || `${session.id}@example.com`;

            // Pre-seed user if not exists to satisfy foreign key constraint on orders(customer_id)
            try {
              await env.DB.prepare(`
                INSERT OR IGNORE INTO users (id, email, auth_provider, display_name, role, created_at, updated_at)
                VALUES (?, ?, 'google', ?, 'customer', datetime('now'), datetime('now'))
              `).bind(customerId, authEmail, customerName || session.name || 'Customer').run();
            } catch (_) {
              // Ignore unique conflicts or schema locks
            }
          }
        }

        const effectiveEmail = customerEmail || authEmail || 'guest@example.com';

        // Catalog Price Immutability Enforcement (T2.31 - T2.35)
        // Disregard any client-sent unit_price, price, or total_amount!
        const frozenItems = [];
        let calculatedSubtotal = 0;

        for (let i = 0; i < body.items.length; i++) {
          const it = body.items[i];
          const prod = await env.DB.prepare(
            'SELECT id, name, price, stock FROM products WHERE id = ?'
          ).bind(it.product_id).first();

          if (!prod) {
            return jsonResponse({ error: `Product not found: ${it.product_id}` }, 404);
          }

          const frozenUnitPrice = Number(prod.price);
          const lineSubtotal = frozenUnitPrice * it.quantity;
          calculatedSubtotal += lineSubtotal;

          frozenItems.push({
            id: `oi_${Date.now()}_${i}_${randomBase64Url(4)}`,
            product_id: prod.id,
            name: prod.name,
            quantity: it.quantity,
            unit_price: frozenUnitPrice,
            subtotal: lineSubtotal,
          });
        }

        const freightSurcharge = parseFloat(body.freight_surcharge) || 0;
        const totalAmount = calculatedSubtotal + freightSurcharge;

        // Identifiers & Tracking
        const orderId = `ord_${Date.now()}_${randomBase64Url(6)}`;
        const trackingCode = `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`;
        const shipmentId = `ship_${Date.now()}_${randomBase64Url(6)}`;
        const paymentId = `pay_${Date.now()}_${randomBase64Url(6)}`;
        const paymentMethod = String(body.payment_method || 'cod').toLowerCase();
        const hasElevator = body.has_freight_elevator === false || body.has_freight_elevator === 0 ? 0 : 1;
        const floorNum = parseInt(body.floor_number) || 1;
        const notes = body.notes ? String(body.notes).trim() : null;

        // Construct Atomic D1 Batch Statements
        const batchStatements = [];

        // 1. Insert Order
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO orders (
              id, customer_id, customer_name, customer_email, customer_phone,
              delivery_address, has_freight_elevator, floor_number,
              subtotal, freight_surcharge, total_amount, status,
              tracking_code, payment_method, notes, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Processing', ?, ?, ?, datetime('now'), datetime('now'))
          `).bind(
            orderId,
            customerId,
            customerName,
            effectiveEmail,
            customerPhone,
            deliveryAddress,
            hasElevator,
            floorNum,
            calculatedSubtotal,
            freightSurcharge,
            totalAmount,
            trackingCode,
            paymentMethod,
            notes
          )
        );

        // 2. Insert Order Items with strictly frozen unit_price
        for (const item of frozenItems) {
          batchStatements.push(
            env.DB.prepare(`
              INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
              VALUES (?, ?, ?, ?, ?)
            `).bind(item.id, orderId, item.product_id, item.quantity, item.unit_price)
          );
        }

        // 3. Insert Shipment Record (Logistics snapshot)
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO shipments (
              id, order_id, carrier, tracking_number, shipping_status,
              shipping_cost, recipient_name, phone, delivery_address,
              estimated_delivery, created_at, updated_at
            ) VALUES (?, ?, 'ABC Bulky Logistics', ?, 'pending', ?, ?, ?, ?, datetime('now', '+3 days'), datetime('now'), datetime('now'))
          `).bind(
            shipmentId,
            orderId,
            trackingCode,
            freightSurcharge,
            customerName,
            customerPhone,
            deliveryAddress
          )
        );

        // 4. Insert Order Payment Record (Financial settlement)
        batchStatements.push(
          env.DB.prepare(`
            INSERT INTO order_payments (
              id, order_id, payment_method, transaction_id, payment_status,
              amount, created_at, updated_at
            ) VALUES (?, ?, ?, ?, 'pending', ?, datetime('now'), datetime('now'))
          `).bind(
            paymentId,
            orderId,
            paymentMethod,
            `txn_${Date.now()}_${randomBase64Url(6)}`,
            totalAmount
          )
        );

        // 5. Post-Checkout Cart Purge (if customer is authenticated)
        if (customerId) {
          batchStatements.push(
            env.DB.prepare(`
              DELETE FROM cart_items
              WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)
            `).bind(customerId)
          );
        }

        // Execute all 5 persistence operations atomically
        await env.DB.batch(batchStatements);

        // Build Response Payload conforming to all test assertions
        return jsonResponse({
          success: true,
          order: {
            id: orderId,
            customer_id: customerId,
            customer_name: customerName,
            customer_email: effectiveEmail,
            customer_phone: customerPhone,
            delivery_address: deliveryAddress,
            subtotal: calculatedSubtotal,
            freight_surcharge: freightSurcharge,
            total_amount: totalAmount,
            totalAmount: totalAmount, // for backward/dual compatibility
            status: 'Processing',
            tracking_code: trackingCode,
            trackingCode: trackingCode,
            payment_method: paymentMethod,
            items: frozenItems.map(fi => ({
              id: fi.id,
              order_id: orderId,
              product_id: fi.product_id,
              name: fi.name,
              quantity: fi.quantity,
              unit_price: fi.unit_price,
              subtotal: fi.subtotal,
            })),
            shipment: {
              id: shipmentId,
              order_id: orderId,
              carrier: 'ABC Bulky Logistics',
              tracking_number: trackingCode,
              shipping_status: 'pending',
              shipping_cost: freightSurcharge,
              recipient_name: customerName,
              phone: customerPhone,
              delivery_address: deliveryAddress,
            },
            payment: {
              id: paymentId,
              order_id: orderId,
              payment_method: paymentMethod,
              payment_status: 'pending',
              amount: totalAmount,
            },
          },
        }, 200);
      }

      // GET /api/orders/:trackingCode
      if (segments[1] && method === 'GET') {
        const queryCode = segments[1];
        if (env?.DB) {
          try {
            const order = await env.DB.prepare(`
              SELECT o.*, s.carrier, s.tracking_number, s.shipping_status
              FROM orders o
              LEFT JOIN shipments s ON o.id = s.order_id
              WHERE o.tracking_code = ? OR o.id = ? OR s.tracking_number = ?
            `).bind(queryCode, queryCode, queryCode).first();

            if (order) {
              return jsonResponse({
                trackingCode: order.tracking_code || order.tracking_number,
                status: order.shipping_status || order.status || 'Processing',
                carrier: order.carrier || 'ABC Bulky Logistics',
                order,
              });
            }
          } catch (_) {}
        }

        return jsonResponse({
          trackingCode: queryCode.toUpperCase(),
          status: 'In Transit',
          carrier: 'ABC Bulky Logistics',
        });
      }
    }
```

---

## 5. Integration with Customer Order History (`GET /api/customer/orders`)

To complete the audit loop and satisfy `T1.F11.1`, `T1.F11.2`, `T2.46 - T2.50`, `T3.10`, and `T4.3`, the customer order history endpoint must query the frozen values:

```javascript
    // GET /api/customer/orders: Retrieve authenticated customer's past orders
    if (segments[0] === 'customer' && segments[1] === 'orders' && method === 'GET') {
      const sessionCookie = getCookie(request, SESSION_COOKIE);
      if (!sessionCookie) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }
      const session = await verifySession(sessionCookie, env?.SESSION_SECRET);
      if (!session || !session.id) {
        return jsonResponse({ error: 'Unauthorized' }, 401);
      }

      if (!env?.DB) {
        return jsonResponse({ orders: [] });
      }

      // Query orders strictly belonging to caller (tenant isolation)
      const { results: orders } = await env.DB.prepare(`
        SELECT o.*,
               s.carrier, s.tracking_number, s.shipping_status, s.shipping_cost,
               p.payment_method AS payment_method_detail, p.payment_status, p.amount AS payment_amount
        FROM orders o
        LEFT JOIN shipments s ON o.id = s.order_id
        LEFT JOIN order_payments p ON o.id = p.order_id
        WHERE o.customer_id = ?
        ORDER BY o.created_at DESC, o.id DESC
      `).bind(session.id).all();

      // For each order, attach frozen items
      for (const order of orders) {
        const { results: items } = await env.DB.prepare(`
          SELECT oi.id, oi.order_id, oi.product_id, oi.quantity, oi.unit_price,
                 p.name AS product_name, p.image_url
          FROM order_items oi
          LEFT JOIN products p ON oi.product_id = p.id
          WHERE oi.order_id = ?
        `).bind(order.id).all();

        order.items = items || [];
        order.shipment = order.tracking_number ? {
          carrier: order.carrier,
          tracking_number: order.tracking_number,
          shipping_status: order.shipping_status,
          shipping_cost: order.shipping_cost,
        } : null;
        order.payment = order.payment_amount ? {
          payment_method: order.payment_method_detail,
          payment_status: order.payment_status,
          amount: order.payment_amount,
        } : null;
      }

      return jsonResponse({ orders: orders || [] });
    }
```

---

## 6. Verification & Test Matrix

| Test ID | Title | Verified Behavior |
|---|---|---|
| `T1.F10.1` | Catalog price lookup at checkout | Computes `total_amount = prod.price * quantity` |
| `T1.F10.2` | Frozen `unit_price` in `order_items` | Catalog price updated x3; `order_items.unit_price` remains original price |
| `T1.F10.3` | Automatic `shipments` creation | Record inserted with carrier, tracking code, and address snapshot |
| `T1.F10.4` | Automatic `order_payments` creation | Record inserted with payment method, amount = total_amount, status = pending |
| `T1.F10.5` | Post-checkout cart purge | Authenticated user `cart_items` completely emptied upon order placement |
| `T2.21` | Empty `items` array rejected | Returns 400 Bad Request |
| `T2.22` | Missing `items` field rejected | Returns 400 Bad Request |
| `T2.23` | Missing `customer_name` rejected | Returns 400 Bad Request |
| `T2.24` | Missing `customer_phone` rejected | Returns 400 Bad Request |
| `T2.25` | Missing `delivery_address` rejected | Returns 400 Bad Request |
| `T2.26` | Item `quantity <= 0` rejected | Returns 400 Bad Request |
| `T2.27` | Non-integer `quantity` (1.5) rejected | Returns 400 Bad Request |
| `T2.28` | Non-existent `product_id` rejected | Returns 404 (or 400) Bad Request |
| `T2.29` | Empty JSON body rejected | Returns 400 Bad Request |
| `T2.30` | Malformed JSON syntax rejected | Returns 400 Bad Request |
| `T2.31` | Spoofed item price (1 VND) ignored | Overridden by D1 catalog price |
| `T2.32` | Spoofed `unit_price = 0` ignored | Overridden by D1 catalog price |
| `T2.33` | Spoofed `total_amount` overridden | Server recalculates based on D1 catalog prices |
| `T2.34` | Post-checkout catalog price increase | `order_items.unit_price` remains locked |
| `T2.35` | Catalog product deactivated/archived | Historical `order_items.unit_price` remains immutable |
| `T2.53` | SQL injection in `customer_name` | Safely parameterized via `.bind(...)`, orders table remains intact |
| `T3.1` | Full Auth -> Cart -> Checkout -> Historical Lock | End-to-end price freeze verification |
| `T3.6` | Multi-item checkout purge | All line items created; persistent cart is cleared |
| `T3.8` | 1:1 Shipment and 1:1 Payment matching totals | Exactly 1 shipment and 1 payment record per order |
| `T3.15` | Multi-revision price immutability cascade | 3 consecutive orders retain discrete snapshot prices |
| `T4.1` | Journey 1: Visitor first purchase workflow | Google Auth -> Address -> Cart -> Checkout -> History |
| `T4.3` | Journey 3: Flash sale volatility audit | Flash sale order preserves discounted price after promo ends |
| `T4.4` | Journey 4: Converted guest checkout | Guest converts to authenticated user; `customer_id` linked |
