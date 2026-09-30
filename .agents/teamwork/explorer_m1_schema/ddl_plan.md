# D1 Database Migration Plan: Milestone 1 Domain Schema

**File Target:** `migrations/0002_domain_schema.sql`  
**Database Engine:** Cloudflare D1 (SQLite 3.51+ compatible)  
**Author:** Teamwork Explorer (`explorer_m1_schema`)  
**Parent Task:** Milestone 1 (Database Schema & Domain Models)  

---

## 1. Executive Summary & Context

To support Google OAuth 2.0 PKCE authentication and align Furproject with the authoritative PTIT E-Commerce System Analysis and Design specifications (from `/Users/nhaterik/lastyear/thietkehethong`), this migration defines the core domain entities missing from the initial catalog-only schema (`0001_initial_schema.sql`).

The schema upgrade satisfies:
1. **User Identity & Google OAuth Profiles**: Canonical `users` table capturing OpenID Connect subject IDs, names (FullName decomposition), contact info, and role-based access.
2. **Customer Profiles**: `customers` 1:1 extension tracking loyalty points and customer tiers (`standard`, `vip`, `new`).
3. **Customer Address Directory**: `addresses` table managing multiple delivery addresses per customer with default designation.
4. **Persistent Shopping Carts**: `carts` and `cart_items` separating mutable live shopping sessions from immutable historical orders (`CartItem != OrderItem`).
5. **Orders Customer Linkage**: Enriching `orders` with `customer_id` foreign key while allowing guest checkout fallback.
6. **Order Fulfillment Logistics**: Dedicated `shipments` table capturing carrier, tracking code, shipping status, and delivery address snapshots.
7. **Payment Settlement Tracking**: Dedicated `order_payments` table capturing payment methods, transaction IDs, amounts, and settlement statuses.

---

## 2. Table-by-Table Architectural Specification

### 2.1. `users` Table
Stores authenticated customer accounts and administrator credentials, integrating Google OAuth 2.0 claims and FullName structured decomposition.

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `usr_<nanoid>` or `usr_<timestamp>` |
| `email` | `TEXT` | `UNIQUE NOT NULL` | Verified email address |
| `auth_provider` | `TEXT` | `NOT NULL DEFAULT 'google'` | Authentication provider: `'google'`, `'guest'`, `'password'` |
| `provider_subject` | `TEXT` | `NULL` | Google OIDC unique subject ID (`sub` claim) |
| `display_name` | `TEXT` | `NULL` | Formatted display name (from Google profile) |
| `first_name` | `TEXT` | `NULL` | Given name (FullName component) |
| `mid_name` | `TEXT` | `NULL` | Middle name (FullName component) |
| `last_name` | `TEXT` | `NULL` | Family name (FullName component) |
| `phone` | `TEXT` | `NULL` | Customer phone number |
| `avatar_url` | `TEXT` | `NULL` | Profile picture URL from Google OAuth |
| `role` | `TEXT` | `NOT NULL DEFAULT 'customer'` | User role: `'customer'`, `'admin'` |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Account registration UTC timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Last profile update UTC timestamp |

**Indexes & Constraints:**
- `UNIQUE (email)`: Enforces unique emails across all accounts.
- `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;`  
  Partial unique index ensures no duplicate OAuth bindings while permitting multiple guest users with `provider_subject IS NULL`.

---

### 2.2. `customers` Table
Domain extension implementing Table-per-Subclass mapping for customer-specific loyalty points and account classification.

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `cust_<nanoid>` |
| `user_id` | `TEXT` | `UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE` | 1:1 relationship with `users` |
| `customer_type` | `TEXT` | `NOT NULL DEFAULT 'standard'` | Customer tier: `'standard'`, `'vip'`, `'new'` |
| `loyalty_points` | `INTEGER` | `NOT NULL DEFAULT 0` | Accrued loyalty reward points |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Creation UTC timestamp |

**Indexes & Constraints:**
- `UNIQUE (user_id)`: Enforces strict 1:1 cardinality between `users` and `customers`.
- Foreign key cascade: Deleting a `users` row cascades to remove the corresponding `customers` record.

---

### 2.3. `addresses` Table
Directory of customer delivery addresses supporting multiple entries per customer and default selection.

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `addr_<nanoid>` |
| `user_id` | `TEXT` | `NOT NULL REFERENCES users(id) ON DELETE CASCADE` | Owning customer (1:N) |
| `recipient_name` | `TEXT` | `NOT NULL` | Recipient full name at destination |
| `phone` | `TEXT` | `NOT NULL` | Delivery contact phone number |
| `street` | `TEXT` | `NOT NULL` | House number, building, street address |
| `ward` | `TEXT` | `NULL` | Administrative Ward (Phường / Xã) |
| `district` | `TEXT` | `NOT NULL` | Administrative District (Quận / Huyện) |
| `city_province` | `TEXT` | `NOT NULL` | City or Province (Tỉnh / Thành phố) |
| `postal_code` | `TEXT` | `NULL` | Postal / ZIP code |
| `is_default` | `INTEGER` | `NOT NULL DEFAULT 0` | Boolean flag (1 = default delivery address, 0 = secondary) |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Creation UTC timestamp |

**Indexes & Constraints:**
- `CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);`  
  Optimizes `GET /api/customer/addresses` lookup by `user_id`.

---

### 2.4. `carts` Table
Persistent server-side shopping cart session aggregate for authenticated customers.

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `cart_<nanoid>` |
| `user_id` | `TEXT` | `UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE` | 1:1 relationship with active user |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Creation UTC timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Last modification UTC timestamp |

**Indexes & Constraints:**
- `UNIQUE (user_id)`: Each authenticated user has exactly one active persistent cart.
- Cascade delete: Removing user purges cart session.

---

### 2.5. `cart_items` Table
Mutable shopping cart line items referencing catalog products.

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `ci_<nanoid>` |
| `cart_id` | `TEXT` | `NOT NULL REFERENCES carts(id) ON DELETE CASCADE` | Owning cart (Composition) |
| `product_id` | `TEXT` | `NOT NULL REFERENCES products(id) ON DELETE CASCADE` | Referenced catalog product |
| `quantity` | `INTEGER` | `NOT NULL DEFAULT 1 CHECK (quantity > 0)` | Selected item quantity ($\ge 1$) |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Creation UTC timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Last update UTC timestamp |

**Indexes & Constraints:**
- `CHECK (quantity > 0)`: Enforces valid non-zero positive quantities.
- `CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product ON cart_items (cart_id, product_id);`  
  Prevents duplicate item rows for the same product in a cart; adding an existing item increments its quantity.
- `CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);`  
  Accelerates loading all items for a cart.
- `CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items(product_id);`  
  Accelerates foreign key resolution and product lookups.

---

### 2.6. Linking `orders` to `users`
Enriches the existing `orders` table (from `0001_initial_schema.sql`) to record the purchasing customer.

**DDL Modification:**
```sql
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);
```

**Architectural Rationale:**
- `customer_id` is nullable to preserve seamless **Guest Checkout** compatibility (where orders are placed without an authenticated account).
- `ON DELETE SET NULL` ensures that if a user account is deleted, legal historical financial transactions and audit logs are preserved (satisfying e-commerce compliance requirements in `domain_specs_report §4.2`).
- Index `idx_orders_customer_id` optimizes `GET /api/customer/orders` queries by `customer_id`.

---

### 2.7. `shipments` Table
Dedicated physical delivery and carrier tracking record (1:1 with `orders`).

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `ship_<nanoid>` |
| `order_id` | `TEXT` | `UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE` | 1:1 relationship with parent order |
| `carrier` | `TEXT` | `NOT NULL` | Logistics carrier (e.g. "ABC Bulky Logistics", "GHN") |
| `tracking_number` | `TEXT` | `NOT NULL` | Carrier tracking code (e.g. "ABC-VN-827361") |
| `shipping_status` | `TEXT` | `NOT NULL DEFAULT 'pending'` | Status: `'pending'`, `'in_transit'`, `'delivered'`, `'returned'` |
| `shipping_cost` | `REAL` | `NOT NULL DEFAULT 0` | Calculated freight cost (base + bulky + stairs) |
| `recipient_name` | `TEXT` | `NULL` | Destination contact recipient name |
| `phone` | `TEXT` | `NULL` | Destination contact phone number |
| `delivery_address` | `TEXT` | `NOT NULL` | Frozen immutable delivery address snapshot |
| `estimated_delivery` | `TEXT` | `NULL` | Expected delivery date/time string |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Creation UTC timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Status update UTC timestamp |

**Indexes & Constraints:**
- `UNIQUE (order_id)`: Enforces 1:1 association between order and fulfillment contract.
- `CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);`  
  Supports rapid public tracking lookups via `/api/orders/:trackingCode`.

---

### 2.8. `order_payments` Table
Base financial transaction record tracking settlement method, external transaction references, and payment lifecycle (1:1 with `orders`).

| Column | Type | Constraints & Defaults | Description |
|---|---|---|---|
| `id` | `TEXT` | `PRIMARY KEY` | Unique ID format `pay_<nanoid>` |
| `order_id` | `TEXT` | `UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE` | 1:1 relationship with parent order |
| `payment_method` | `TEXT` | `NOT NULL DEFAULT 'cod'` | Method: `'cod'`, `'credit_card'`, `'bank_transfer'` |
| `transaction_id` | `TEXT` | `NULL` | Gateway or bank reference ID |
| `payment_status` | `TEXT` | `NOT NULL DEFAULT 'pending'` | Status: `'pending'`, `'authorized'`, `'paid'`, `'failed'`, `'refunded'` |
| `amount` | `REAL` | `NOT NULL` | Exact transaction monetary amount (VND) |
| `created_at` | `TEXT` | `DEFAULT (datetime('now'))` | Transaction creation UTC timestamp |
| `updated_at` | `TEXT` | `DEFAULT (datetime('now'))` | Settlement status update UTC timestamp |

**Indexes & Constraints:**
- `UNIQUE (order_id)`: Enforces 1:1 association with order.
- `CREATE INDEX IF NOT EXISTS idx_order_payments_transaction_id ON order_payments(transaction_id) WHERE transaction_id IS NOT NULL;`  
  Supports gateway webhook reconciliation and audit searches.

---

## 3. Exact SQL Script for `migrations/0002_domain_schema.sql`

```sql
-- D1 Database Migration: 0002_domain_schema.sql
-- Furproject E-Commerce Domain Models & Google OAuth Integration

-- 1. Users Table (Google OAuth Profile & FullName Structure)
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
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
    ON users (auth_provider, provider_subject)
    WHERE provider_subject IS NOT NULL;

-- 2. Customer Profile Extension (Table-per-Subclass pattern)
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    customer_type TEXT NOT NULL DEFAULT 'standard',
    loyalty_points INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 3. Customer Delivery Addresses Directory
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
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- 4. Persistent Shopping Carts (Active Mutable Session Aggregate)
CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 5. Shopping Cart Items
CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cart_items_cart_product ON cart_items (cart_id, product_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items (cart_id);
CREATE INDEX IF NOT EXISTS idx_cart_items_product_id ON cart_items (product_id);

-- 6. Link Orders to Users (Customer Order Linkage with Guest Fallback)
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);

-- 7. Shipments Table (Order Fulfillment Tracking)
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
    estimated_delivery TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_shipments_tracking_number ON shipments(tracking_number);

-- 8. Order Payments Table (Payment Settlement Tracking)
CREATE TABLE IF NOT EXISTS order_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    transaction_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_order_payments_transaction_id ON order_payments(transaction_id) WHERE transaction_id IS NOT NULL;
```

---

## 4. Verification and Simulation Results

The exact DDL above was validated using SQLite 3.51 against a clone of the real local Cloudflare D1 database (`.wrangler/state/v3/d1/...`):

1. **Syntax & Compilation**:
   - Zero syntax errors across all 8 tables and `ALTER TABLE` statement.
   - All table constraints (`PRIMARY KEY`, `NOT NULL`, `DEFAULT`, `CHECK`) compiled cleanly.
2. **Index Registration**:
   - Partial unique index `idx_users_auth_provider_subject` verified: duplicate OIDC subjects rejected with exit code 19, multiple `NULL` subjects accepted.
   - Unique composite index `idx_cart_items_cart_product` verified: duplicate `(cart_id, product_id)` entries rejected.
   - Secondary query indexes (`idx_addresses_user_id`, `idx_orders_customer_id`, `idx_shipments_tracking_number`, `idx_order_payments_transaction_id`) confirmed active in `sqlite_master`.
3. **Foreign Key Integrity & Cascades**:
   - `DELETE FROM users WHERE id = ?`:
     - Cascaded cleanly to delete child `customers`, `addresses`, `carts`, and `cart_items`.
     - Preserved historical `orders` with `customer_id` updated to `NULL` via `ON DELETE SET NULL`, retaining fiscal auditability.
   - `DELETE FROM orders WHERE id = ?`:
     - Cascaded cleanly to delete child `shipments` and `order_payments`.
   - `cart_items` properly enforces FKs to both `carts(id)` and `products(id)` with `ON DELETE CASCADE`.

---

## 5. Architectural Alignment Across Milestones

| Subsystem | Table / Column | Usage in Downstream Milestones |
|---|---|---|
| **Google OAuth** (M2) | `users.auth_provider`, `provider_subject`, `avatar_url` | `/api/auth/google/callback` upserts user by `email` and sets `fur_session` cookie; `/api/auth/me` returns sanitized profile. |
| **Customer Profile** (M2, M3) | `customers.customer_type`, `loyalty_points` | `/api/auth/me` reads profile tier and loyalty points to show customer perks in storefront. |
| **Address Book** (M3, M4) | `addresses.*` | `/api/customer/addresses` provides CRUD; `CartDrawer.jsx` autofills default address into delivery fields. |
| **Persistent Cart** (M3, M4) | `carts`, `cart_items` | `/api/cart` endpoints synchronize shopping cart across browser reloads and multi-device sessions for logged-in users. |
| **Price Immutability** (M3) | `order_items.unit_price`, `orders.customer_id` | `POST /api/orders` snapshots current `products.price` into `order_items.unit_price`, creates `shipments` and `order_payments`, links to `customer_id`, and purges `cart_items`. |
| **Order History** (M3, M4) | `orders.customer_id`, `shipments`, `order_payments` | `/api/customer/orders` returns authenticated user's past purchases with frozen historical item pricing and fulfillment status. |
