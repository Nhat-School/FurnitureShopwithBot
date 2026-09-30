# Cloudflare D1 Migration Execution & Verification Plan: Milestone 1 Domain Schema

**Target Migration:** `migrations/0002_domain_schema.sql`  
**Database Binding:** `DB` (`furproject-db`)  
**Engine:** Cloudflare D1 (Miniflare 3 / SQLite 3.51+)  
**Investigator:** Explorer Agent (`explorer_m1_verification`)  
**Milestone:** Milestone 1 — D1 Database Schema & Migrations  
**Date:** 2026-09-29  

---

## 1. Executive Summary & Objective

This verification plan establishes the definitive methodology, exact CLI commands, SQL queries, and test assertions to validate `migrations/0002_domain_schema.sql` against local Cloudflare D1.

The schema upgrade introduces 7 new domain tables (`users`, `customers`, `addresses`, `carts`, `cart_items`, `shipments`, `order_payments`) and enriches the existing `orders` table with a nullable customer foreign key (`customer_id TEXT REFERENCES users(id) ON DELETE SET NULL`).

### Verification Goals:
1. **Pristine Migration Execution**: Verify migration application via Wrangler CLI without statement errors or schema corruption.
2. **Schema & Index Registration**: Confirm that all tables, foreign keys, unique constraints, check constraints, and performance indexes are registered in `sqlite_master`.
3. **Referential Integrity**: Validate `PRAGMA foreign_key_check;` returns zero integrity violations.
4. **End-to-End Relational Traversal**: Validate data insertion and relational joins spanning the entire e-commerce lifecycle (User -> Customer Profile -> Address Book -> Cart & Items -> Order -> Order Items -> Shipment -> Payment).
5. **Cascade & Immutability Invariant Verification**: Confirm that user deletion cascades to transient operational state (`carts`, `cart_items`, `addresses`, `customers`) while preserving historical accounting records (`orders`, `order_items`, `shipments`, `order_payments`) via `ON DELETE SET NULL`.
6. **Defensive Pitfall Avoidance**: Mitigate known SQLite `ALTER TABLE` limitations, D1 migration tracking rules, and legacy inline D1 table creation conflicts.

---

## 2. Local D1 Migration Execution Protocol

### 2.1. Environment & Database Configuration

Furproject configures Cloudflare D1 in `wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "furproject-db"
database_id = "507651c1-c120-431c-8a6f-10a2a26ecbc2"
```

Local persistence state resides under:
```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/6d088d550e15cfe09553567cfe96cd43d18d80264d8f8a5f0369401a063f404f.sqlite
```

### 2.2. Pre-Migration Status Inspection

Before applying the migration, verify existing migration history:

```bash
# List all migrations and their status against local D1
npx wrangler d1 migrations list furproject-db --local
```

**Expected Baseline Output:**
```
┌────┬─────────────────────────┬─────────────────────┐
│ id │ name                    │ applied_at          │
├────┼─────────────────────────┼─────────────────────┤
│ 1  │ 0001_initial_schema.sql │ 2026-09-29 16:18:03 │
└────┴─────────────────────────┴─────────────────────┘

Migrations to be applied:
└── 0002_domain_schema.sql
```

### 2.3. Executing the Migration

To apply pending migrations locally:

```bash
# Interactive execution
npx wrangler d1 migrations apply furproject-db --local

# Non-interactive / CI automated execution (pipes confirmation)
echo "y" | npx wrangler d1 migrations apply furproject-db --local
```

### 2.4. Post-Migration Verification of `d1_migrations`

Confirm that `0002_domain_schema.sql` was recorded in the internal migration table:

```bash
npx wrangler d1 execute furproject-db --local --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC;"
```

**Expected Result:**
```
┌────┬─────────────────────────┬─────────────────────┐
│ id │ name                    │ applied_at          │
├────┼─────────────────────────┼─────────────────────┤
│ 1  │ 0001_initial_schema.sql │ 2026-09-29 16:18:03 │
│ 2  │ 0002_domain_schema.sql │ 2026-09-29 16:xx:xx │
└────┴─────────────────────────┴─────────────────────┘
```

---

## 3. Phase 1: Schema Registration & Metadata Verification

### 3.1. Verification of Table Existence in `sqlite_master`

Execute this query to assert that all 13 project tables (existing catalog + new domain entities + migration log) are present:

```sql
SELECT name, type 
FROM sqlite_master 
WHERE type = 'table' 
  AND name NOT LIKE 'sqlite_%'
ORDER BY name ASC;
```

**CLI Command:**
```bash
npx wrangler d1 execute furproject-db --local --command "SELECT name, type FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
```

**Pass Criterion (13 tables):**
| Table Name | Classification | Purpose |
|---|---|---|
| `addresses` | New Domain (M1) | Customer delivery address book |
| `cart_items` | New Domain (M1) | Mutable active shopping cart line items |
| `carts` | New Domain (M1) | Server-side user shopping cart session |
| `categories` | Initial Catalog (0001) | Furniture catalog categories |
| `customers` | New Domain (M1) | Customer profile & loyalty extension |
| `d1_migrations` | System (D1) | Cloudflare D1 migration history |
| `inventory_logs` | Initial Catalog (0001) | Stock replenishment and deduction audit |
| `order_items` | Initial Catalog (0001) | Immutable order line items with locked price |
| `order_payments` | New Domain (M1) | Payment method and settlement tracking |
| `orders` | Modified (0001 + M1) | Placed order records with `customer_id` |
| `products` | Initial Catalog (0001) | Furniture product catalog |
| `reviews` | Initial Catalog (0001) | Product reviews and ratings |
| `shipments` | New Domain (M1) | Order fulfillment & tracking record |
| `users` | New Domain (M1) | Google OAuth identity & customer account |

### 3.2. Verification of `customer_id` on `orders`

Verify that the `ALTER TABLE orders ADD COLUMN customer_id ...` statement successfully added the foreign key column:

```sql
SELECT cid, name, type, notnull, dflt_value, pk 
FROM pragma_table_info('orders') 
WHERE name = 'customer_id';
```

**CLI Command:**
```bash
npx wrangler d1 execute furproject-db --local --command "SELECT cid, name, type, notnull, dflt_value, pk FROM pragma_table_info('orders') WHERE name = 'customer_id';"
```

**Pass Criterion:**
```
┌─────┬─────────────┬──────┬─────────┬────────────┬────┐
│ cid │ name        │ type │ notnull │ dflt_value │ pk │
├─────┼─────────────┼──────┼─────────┼────────────┼────┤
│ 16  │ customer_id │ TEXT │ 0       │ null       │ 0  │
└─────┴─────────────┴──────┴─────────┴────────────┴────┘
```

### 3.3. Verification of Indexes in `sqlite_master`

Validate that all unique, partial, and lookup indexes are properly registered:

```sql
SELECT name, tbl_name, sql 
FROM sqlite_master 
WHERE type = 'index' 
  AND name LIKE 'idx_%'
ORDER BY tbl_name, name;
```

**CLI Command:**
```bash
npx wrangler d1 execute furproject-db --local --command "SELECT name, tbl_name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'idx_%' ORDER BY tbl_name, name;"
```

**Pass Criterion (8 domain indexes):**
1. `idx_addresses_user_id` on `addresses(user_id)`
2. `idx_cart_items_cart_product` (UNIQUE) on `cart_items(cart_id, product_id)`
3. `idx_cart_items_cart_id` on `cart_items(cart_id)`
4. `idx_cart_items_product_id` on `cart_items(product_id)`
5. `idx_orders_customer_id` on `orders(customer_id)`
6. `idx_order_payments_transaction_id` on `order_payments(transaction_id) WHERE transaction_id IS NOT NULL`
7. `idx_shipments_tracking_number` on `shipments(tracking_number)`
8. `idx_users_auth_provider_subject` (UNIQUE) on `users(auth_provider, provider_subject) WHERE provider_subject IS NOT NULL`

---

## 4. Phase 2: Foreign Key Integrity & Pragma Checks

### 4.1. Verification of Pragma Foreign Keys Activation

Cloudflare D1 runs on SQLite with foreign keys active. Confirm enforcement:

```bash
npx wrangler d1 execute furproject-db --local --command "PRAGMA foreign_keys;"
```

**Pass Criterion:** Returns `1`.

### 4.2. Universal Foreign Key Integrity Audit

Run SQLite's built-in referential integrity checker across the entire database:

```bash
npx wrangler d1 execute furproject-db --local --command "PRAGMA foreign_key_check;"
```

**Pass Criterion:** Returns `0 rows` (completely empty).  
*If any rows are returned, it indicates orphaned foreign key records.*

### 4.3. Foreign Key Definition Inspection

Verify that each domain table has the correct foreign key targets and cascading rules:

```bash
npx wrangler d1 execute furproject-db --local --command "
SELECT 'customers' AS tbl, * FROM pragma_foreign_key_list('customers')
UNION ALL
SELECT 'addresses', * FROM pragma_foreign_key_list('addresses')
UNION ALL
SELECT 'carts', * FROM pragma_foreign_key_list('carts')
UNION ALL
SELECT 'cart_items', * FROM pragma_foreign_key_list('cart_items')
UNION ALL
SELECT 'orders', * FROM pragma_foreign_key_list('orders')
UNION ALL
SELECT 'shipments', * FROM pragma_foreign_key_list('shipments')
UNION ALL
SELECT 'order_payments', * FROM pragma_foreign_key_list('order_payments');
"
```

**Pass Criterion Summary:**
- `customers.user_id` -> `users(id)`: `on_delete = CASCADE`
- `addresses.user_id` -> `users(id)`: `on_delete = CASCADE`
- `carts.user_id` -> `users(id)`: `on_delete = CASCADE`
- `cart_items.cart_id` -> `carts(id)`: `on_delete = CASCADE`
- `cart_items.product_id` -> `products(id)`: `on_delete = CASCADE`
- `orders.customer_id` -> `users(id)`: `on_delete = SET NULL`
- `shipments.order_id` -> `orders(id)`: `on_delete = CASCADE`
- `order_payments.order_id` -> `orders(id)`: `on_delete = CASCADE`

---

## 5. Phase 3: End-to-End Sample Data Insertion & Relational Traversal

This test executes a coherent lifecycle across all domain entities: creating a user, establishing a customer profile, adding delivery addresses, managing a shopping cart with items, simulating checkout by creating an order with frozen item pricing, generating a shipment record, and settling a payment.

### 5.1. Test Execution Script

Execute via Wrangler:

```bash
npx wrangler d1 execute furproject-db --local --command "
-- Step 1: Insert Authenticated User
INSERT INTO users (
    id, email, auth_provider, provider_subject, display_name,
    first_name, mid_name, last_name, phone, avatar_url, role
) VALUES (
    'usr_vtest_01', 'john.doe@example.com', 'google', 'sub_google_123456789',
    'John Doe', 'John', NULL, 'Doe', '+84912345678',
    'https://lh3.googleusercontent.com/a/vtest01', 'customer'
);

-- Step 2: Insert Customer Profile (Table-per-Subclass extension)
INSERT INTO customers (
    id, user_id, customer_type, loyalty_points
) VALUES (
    'cust_vtest_01', 'usr_vtest_01', 'standard', 150
);

-- Step 3: Insert Delivery Address
INSERT INTO addresses (
    id, user_id, recipient_name, phone, street, ward,
    district, city_province, postal_code, is_default
) VALUES (
    'addr_vtest_01', 'usr_vtest_01', 'John Doe', '+84912345678',
    '123 Le Loi Street', 'Ben Nghe Ward', 'District 1',
    'Ho Chi Minh City', '70000', 1
);

-- Step 4: Insert Shopping Cart
INSERT INTO carts (
    id, user_id
) VALUES (
    'cart_vtest_01', 'usr_vtest_01'
);

-- Step 5: Insert Shopping Cart Item (Referencing existing catalog product)
INSERT INTO cart_items (
    id, cart_id, product_id, quantity
) VALUES (
    'ci_vtest_01', 'cart_vtest_01', 'prod_sofa_nordic', 2
);
"
```

### 5.2. Active Cart Traversal Query

Verify the shopping cart join with catalog product pricing:

```sql
SELECT 
    c.id AS cart_id,
    u.email AS user_email,
    u.display_name,
    ci.id AS cart_item_id,
    p.id AS product_id,
    p.name AS product_name,
    p.price AS catalog_price,
    ci.quantity,
    (p.price * ci.quantity) AS item_subtotal
FROM carts c
JOIN users u ON c.user_id = u.id
JOIN cart_items ci ON c.id = ci.cart_id
JOIN products p ON ci.product_id = p.id
WHERE u.id = 'usr_vtest_01';
```

**Expected Result:**
```
cart_id: cart_vtest_01
user_email: john.doe@example.com
display_name: John Doe
product_id: prod_sofa_nordic
product_name: Sofa Văng Nordic Scandinavian 3 Chỗ
catalog_price: 14500000
quantity: 2
item_subtotal: 29000000
```

### 5.3. Checkout Simulation & Price Immutability Snapshot

Simulate the transactional transition from mutable cart to immutable order:

```bash
npx wrangler d1 execute furproject-db --local --command "
-- Step 6: Create Confirmed Order with frozen delivery address and user linkage
INSERT INTO orders (
    id, customer_id, customer_name, customer_email, customer_phone,
    delivery_address, has_freight_elevator, floor_number, subtotal,
    freight_surcharge, total_amount, status, tracking_code, payment_method
) VALUES (
    'ord_vtest_01', 'usr_vtest_01', 'John Doe', 'john.doe@example.com', '+84912345678',
    '123 Le Loi Street, Ben Nghe Ward, District 1, Ho Chi Minh City',
    1, 1, 29000000, 0, 29050000, 'Processing', 'TRK-VERIFY-001', 'CreditCard'
);

-- Step 7: Freeze Order Item with immutable unit_price (captured from products.price)
INSERT INTO order_items (
    id, order_id, product_id, quantity, unit_price
) VALUES (
    'oi_vtest_01', 'ord_vtest_01', 'prod_sofa_nordic', 2, 14500000
);

-- Step 8: Create Shipment Fulfillment Record
INSERT INTO shipments (
    id, order_id, carrier, tracking_number, shipping_status,
    shipping_cost, recipient_name, phone, delivery_address, estimated_delivery
) VALUES (
    'ship_vtest_01', 'ord_vtest_01', 'ABC Bulky Logistics', 'TRK-VERIFY-001', 'pending',
    50000, 'John Doe', '+84912345678',
    '123 Le Loi Street, Ben Nghe Ward, District 1, Ho Chi Minh City',
    datetime('now', '+3 days')
);

-- Step 9: Create Payment Settlement Record
INSERT INTO order_payments (
    id, order_id, payment_method, transaction_id, payment_status, amount
) VALUES (
    'pay_vtest_01', 'ord_vtest_01', 'credit_card', 'txn_stripe_vtest_987', 'paid', 29050000
);

-- Step 10: Purge Cart Items post-checkout
DELETE FROM cart_items WHERE cart_id = 'cart_vtest_01';
"
```

### 5.4. Full Relational Graph Query

Verify the complete relational chain spanning orders, shipments, order payments, and products:

```sql
SELECT 
    o.id AS order_id,
    o.customer_id,
    o.status AS order_status,
    o.total_amount,
    oi.product_id,
    p.name AS product_name,
    oi.unit_price AS frozen_order_price,
    p.price AS current_catalog_price,
    oi.quantity,
    s.carrier,
    s.tracking_number,
    s.shipping_status,
    s.shipping_cost,
    op.payment_method,
    op.payment_status,
    op.transaction_id,
    op.amount AS settled_amount
FROM orders o
LEFT JOIN users u ON o.customer_id = u.id
JOIN order_items oi ON o.id = oi.order_id
JOIN products p ON oi.product_id = p.id
JOIN shipments s ON o.id = s.order_id
JOIN order_payments op ON o.id = op.order_id
WHERE o.id = 'ord_vtest_01';
```

**Pass Criteria:**
1. All 5 entities (`orders`, `order_items`, `products`, `shipments`, `order_payments`) successfully join on their primary/foreign keys.
2. `frozen_order_price` equals `14500000`. If catalog `products.price` is updated in a subsequent test, `frozen_order_price` remains strictly `14500000`.
3. `settled_amount` matches `total_amount` (`29050000`).

---

## 6. Phase 4: Cascade Deletion & Boundary Invariant Verification

### 6.1. Test Scenario A: Deleting a User Account

**Action:**
```sql
DELETE FROM users WHERE id = 'usr_vtest_01';
```

**Assertions:**
1. **Cascade Purge of Operational State**:
   ```sql
   SELECT count(*) FROM customers WHERE user_id = 'usr_vtest_01';  -- Must return 0
   SELECT count(*) FROM addresses WHERE user_id = 'usr_vtest_01';  -- Must return 0
   SELECT count(*) FROM carts WHERE user_id = 'usr_vtest_01';      -- Must return 0
   SELECT count(*) FROM cart_items WHERE id = 'ci_vtest_01';        -- Must return 0
   ```
2. **Preservation of Legal Historical Orders (`ON DELETE SET NULL`)**:
   ```sql
   SELECT id, customer_id, customer_name, customer_email, total_amount 
   FROM orders 
   WHERE id = 'ord_vtest_01';
   ```
   - `id`: `'ord_vtest_01'` (Row exists!).
   - `customer_id`: `NULL` (FK decoupled successfully).
   - `customer_name`: `'John Doe'` (Snapshotted audit data preserved).
   - `customer_email`: `'john.doe@example.com'` (Snapshotted audit data preserved).
   - `total_amount`: `29050000` (Preserved for accounting & tax records).
3. **Preservation of Order Fulfillment & Payment Records**:
   ```sql
   SELECT count(*) FROM order_items WHERE order_id = 'ord_vtest_01';   -- Must return 1
   SELECT count(*) FROM shipments WHERE order_id = 'ord_vtest_01';     -- Must return 1
   SELECT count(*) FROM order_payments WHERE order_id = 'ord_vtest_01'; -- Must return 1
   ```

### 6.2. Test Scenario B: Order Cascade Deletion

**Context & Rule:**  
In `0001_initial_schema.sql`, `order_items` was defined with:
```sql
FOREIGN KEY (order_id) REFERENCES orders(id)  -- Default NO ACTION / RESTRICT
```
Therefore, attempting `DELETE FROM orders WHERE id = 'ord_vtest_01';` while `order_items` rows exist triggers `SQLITE_CONSTRAINT_FOREIGNKEY` (code 19).

**Correct Two-Step Deletion Flow:**
```sql
-- Step 1: Delete dependent line items
DELETE FROM order_items WHERE order_id = 'ord_vtest_01';

-- Step 2: Delete parent order (cascades to shipments and order_payments)
DELETE FROM orders WHERE id = 'ord_vtest_01';
```

**Assertions:**
```sql
SELECT count(*) FROM shipments WHERE order_id = 'ord_vtest_01';     -- Must return 0
SELECT count(*) FROM order_payments WHERE order_id = 'ord_vtest_01'; -- Must return 0
```
Both `shipments` and `order_payments` cascade-delete cleanly when the parent order is deleted.

### 6.3. Test Scenario C: Negative Constraint & Rejection Testing

Verify that SQLite and D1 enforce schema constraints and reject invalid mutations:

| Test Case | Attempted SQL Query | Expected Result & Code |
|---|---|---|
| **Invalid FK Parent** | `INSERT INTO customers (id, user_id) VALUES ('c_bad', 'nonexistent_usr');` | Error: `FOREIGN KEY constraint failed (19)` |
| **Duplicate Cart Item** | Insert duplicate `(cart_id, product_id)` into `cart_items` | Error: `UNIQUE constraint failed: cart_items.cart_id, cart_items.product_id (19)` |
| **Duplicate Provider Subject** | Insert duplicate `(auth_provider, provider_subject)` into `users` | Error: `UNIQUE constraint failed: users.auth_provider, users.provider_subject (19)` |
| **Multiple NULL Subjects** | Insert multiple users with `provider_subject = NULL` (guest users) | **Success** (Partial unique index allows multiple NULLs) |
| **Duplicate User Profile** | Insert duplicate `user_id` into `customers` | Error: `UNIQUE constraint failed: customers.user_id (19)` |
| **Duplicate User Cart** | Insert duplicate `user_id` into `carts` | Error: `UNIQUE constraint failed: carts.user_id (19)` |
| **Invalid Quantity** | `INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_bad', 'cart_x', 'prod_y', 0);` | Error: `CHECK constraint failed: quantity > 0 (19)` |
| **Negative Quantity** | `INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_bad', 'cart_x', 'prod_y', -5);` | Error: `CHECK constraint failed: quantity > 0 (19)` |

---

## 7. Phase 5: Cloudflare D1 & SQLite Migration Pitfalls & Mitigations

### Pitfall 1: SQLite `ALTER TABLE ADD COLUMN` lacks `IF NOT EXISTS`
- **Issue**: SQLite's grammar supports `CREATE TABLE IF NOT EXISTS`, but does **not** support `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. Attempting to include `IF NOT EXISTS` causes:  
  `SQLITE_ERROR: near "EXISTS": syntax error at offset 42`.
- **Mitigation**: The migration script must use plain `ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;`. Since D1 tracks migrations in `d1_migrations`, each migration file is executed exactly once.

### Pitfall 2: `ALTER TABLE ADD COLUMN` with Foreign Key Defaults
- **Issue**: In SQLite with foreign keys enabled, adding a column with a `REFERENCES` clause requires that the column defaults to `NULL`. Adding a foreign key column with a `NOT NULL` constraint and non-null default will fail unless the default value references a row that already exists.
- **Mitigation**: `orders.customer_id` is defined as nullable (`TEXT REFERENCES users(id) ON DELETE SET NULL`), which satisfies both SQLite requirements and the business requirement for guest checkout support.

### Pitfall 3: Single Column Limitation per `ALTER TABLE`
- **Issue**: SQLite does not support adding multiple columns in a single `ALTER TABLE` statement (e.g. `ALTER TABLE t ADD COLUMN c1, ADD COLUMN c2;` is invalid).
- **Mitigation**: Each column addition must be an independent `ALTER TABLE` statement.

### Pitfall 4: D1 Migration State Divergence (`migrations apply` vs `execute --file`)
- **Issue**: Running `wrangler d1 execute --file=migrations/0002_domain_schema.sql` applies the DDL to the database, but does **not** insert a record into the `d1_migrations` table. If `wrangler d1 migrations apply` is subsequently run, it will attempt to re-execute `0002_domain_schema.sql` and fail with `table already exists` or `duplicate column name`.
- **Mitigation**: Schema changes must strictly be applied using `npx wrangler d1 migrations apply furproject-db --local`. Ad-hoc verification scripts or test fixtures must use `npx wrangler d1 execute --command="..."`.

### Pitfall 5: Inline Legacy Table Creation in Existing API Code
- **Observation**: In `functions/api/[[path]].js` (lines 120-128), there is legacy code that executes an inline DDL statement:
  ```js
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT DEFAULT 'guest',
    created_at TEXT DEFAULT (datetime('now'))
  )
  ```
- **Hazard**: If a developer launches `wrangler pages dev` or triggers `/api/auth/google` before `migrations/0002_domain_schema.sql` is applied, this legacy query will create a `users` table missing the Google OAuth claims (`auth_provider`, `provider_subject`) and FullName components (`first_name`, `mid_name`, `last_name`). Applying `0002_domain_schema.sql` later will silently skip creating `users` (due to `CREATE TABLE IF NOT EXISTS`), leading to runtime column errors!
- **Mitigation**:
  1. Always apply migrations locally before starting development servers.
  2. In Milestone 2 (Google Auth Functions implementation), remove the legacy inline `CREATE TABLE` from `functions/api/[[path]].js` and rely entirely on D1 migrations.

### Pitfall 6: Foreign Key Cascade vs Fiscal Accounting Conflict
- **Hazard**: Setting `orders.customer_id REFERENCES users(id) ON DELETE CASCADE` would result in customer account deletions destroying their past sales orders, invoices, and accounting history.
- **Mitigation**: Enforce `ON DELETE SET NULL` on `orders.customer_id`. The order record, shipping snapshot, and payment settlement rows remain completely intact for tax and financial audits.

### Pitfall 7: Date & Time Affinity in D1
- **Nuance**: SQLite does not possess a native `DATETIME` storage type; it uses `TEXT`, `REAL`, or `INTEGER` affinities.
- **Convention**: Maintain the project standard established in `0001_initial_schema.sql`: `TEXT DEFAULT (datetime('now'))`. This produces ISO-8601 strings (`YYYY-MM-DD HH:MM:SS`) compatible with standard JavaScript `Date` parsing.

### Pitfall 8: Wrangler CLI Interactive Prompts in Automation
- **Nuance**: When migrations are pending, `wrangler d1 migrations apply` prompts interactively: `✔ About to apply 1 migration(s)... Ok to proceed? (y/N)`. In non-interactive environments or background tasks, this can hang indefinitely.
- **Mitigation**: Always pipe confirmation in test scripts: `echo "y" | npx wrangler d1 migrations apply furproject-db --local`.

---

## 8. Automated Verification Script (`scripts/verify_m1_migration.sh`)

This standalone Bash script can be executed after `0002_domain_schema.sql` is committed to automatically execute all 5 verification phases:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " Starting Local Cloudflare D1 Milestone 1 Verification   "
echo "=========================================================="

DB_NAME="furproject-db"

# 1. Apply Migration Locally
echo "--> 1. Applying pending migrations..."
echo "y" | npx wrangler d1 migrations apply "$DB_NAME" --local

# 2. Check Migration Table
echo "--> 2. Checking d1_migrations table..."
npx wrangler d1 execute "$DB_NAME" --local --command "SELECT id, name, applied_at FROM d1_migrations;"

# 3. Check Pragma FKs
echo "--> 3. Checking foreign_keys pragma..."
npx wrangler d1 execute "$DB_NAME" --local --command "PRAGMA foreign_keys;"

# 4. Check Foreign Key Integrity
echo "--> 4. Executing PRAGMA foreign_key_check..."
FK_CHECK_OUTPUT=$(npx wrangler d1 execute "$DB_NAME" --local --command "PRAGMA foreign_key_check;")
echo "$FK_CHECK_OUTPUT"

# 5. Verify Table List
echo "--> 5. Verifying domain tables presence..."
npx wrangler d1 execute "$DB_NAME" --local --command "
SELECT name FROM sqlite_master 
WHERE type='table' 
  AND name IN ('users', 'customers', 'addresses', 'carts', 'cart_items', 'orders', 'order_items', 'shipments', 'order_payments')
ORDER BY name;
"

# 6. Verify customer_id Column on Orders
echo "--> 6. Verifying orders.customer_id column..."
npx wrangler d1 execute "$DB_NAME" --local --command "
SELECT cid, name, type, notnull, dflt_value, pk FROM pragma_table_info('orders') WHERE name = 'customer_id';
"

# 7. Verify Registered Indexes
echo "--> 7. Verifying domain indexes..."
npx wrangler d1 execute "$DB_NAME" --local --command "
SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%' ORDER BY tbl_name;
"

# 8. Run End-to-End Fixture Insertion & Cascade Tests
echo "--> 8. Running CRUD fixture & cascade delete validation..."
npx wrangler d1 execute "$DB_NAME" --local --command "
-- Insert User
INSERT INTO users (id, email, auth_provider, provider_subject, display_name, role)
VALUES ('usr_auto_01', 'auto@test.com', 'google', 'sub_auto_1', 'Auto User', 'customer');

-- Insert Customer Profile
INSERT INTO customers (id, user_id, customer_type, loyalty_points)
VALUES ('cust_auto_01', 'usr_auto_01', 'standard', 50);

-- Insert Address
INSERT INTO addresses (id, user_id, recipient_name, phone, street, district, city_province)
VALUES ('addr_auto_01', 'usr_auto_01', 'Auto User', '+84900000000', '1 St', 'Dist 1', 'HCMC');

-- Insert Cart & CartItem
INSERT INTO carts (id, user_id) VALUES ('cart_auto_01', 'usr_auto_01');
INSERT INTO cart_items (id, cart_id, product_id, quantity) VALUES ('ci_auto_01', 'cart_auto_01', 'prod_sofa_nordic', 1);

-- Insert Order & OrderItem & Shipment & Payment
INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, subtotal, total_amount, status)
VALUES ('ord_auto_01', 'usr_auto_01', 'Auto User', 'auto@test.com', '+84900000000', '1 St, HCMC', 14500000, 14500000, 'Processing');

INSERT INTO order_items (id, order_id, product_id, quantity, unit_price)
VALUES ('oi_auto_01', 'ord_auto_01', 'prod_sofa_nordic', 1, 14500000);

INSERT INTO shipments (id, order_id, carrier, tracking_number, delivery_address)
VALUES ('ship_auto_01', 'ord_auto_01', 'ABC Logistics', 'TRK-AUTO-01', '1 St, HCMC');

INSERT INTO order_payments (id, order_id, amount)
VALUES ('pay_auto_01', 'ord_auto_01', 14500000);

-- Delete User -> Should cascade to customers, addresses, carts, cart_items, and set orders.customer_id = NULL
DELETE FROM users WHERE id = 'usr_auto_01';

-- Assertions
SELECT 'Customers remaining (expected 0):' AS test, count(*) AS count FROM customers WHERE id = 'cust_auto_01'
UNION ALL
SELECT 'Addresses remaining (expected 0):', count(*) FROM addresses WHERE id = 'addr_auto_01'
UNION ALL
SELECT 'Carts remaining (expected 0):', count(*) FROM carts WHERE id = 'cart_auto_01'
UNION ALL
SELECT 'Cart Items remaining (expected 0):', count(*) FROM cart_items WHERE id = 'ci_auto_01'
UNION ALL
SELECT 'Orders retained (expected 1):', count(*) FROM orders WHERE id = 'ord_auto_01'
UNION ALL
SELECT 'Shipments retained (expected 1):', count(*) FROM shipments WHERE id = 'ship_auto_01'
UNION ALL
SELECT 'Payments retained (expected 1):', count(*) FROM order_payments WHERE id = 'pay_auto_01';

-- Clean up test order
DELETE FROM order_items WHERE order_id = 'ord_auto_01';
DELETE FROM orders WHERE id = 'ord_auto_01';
"

echo "=========================================================="
echo " Milestone 1 Migration Verification Succeeded Cleanly!    "
echo "=========================================================="
```

---

## 9. Verification Sign-Off Checklist

Before passing Milestone 1 to Milestone 2 (Google Auth Functions), the implementing agent must sign off on the following:

- [ ] Command `echo "y" | npx wrangler d1 migrations apply furproject-db --local` exits with code 0.
- [ ] Table `d1_migrations` contains row `2 | 0002_domain_schema.sql`.
- [ ] All 13 tables are confirmed present in `sqlite_master`.
- [ ] Column `customer_id` is present on table `orders`.
- [ ] Partial unique index `idx_users_auth_provider_subject` allows multiple guest users (`NULL` subjects) and blocks duplicate Google subjects.
- [ ] Unique composite index `idx_cart_items_cart_product` blocks duplicate line items.
- [ ] Check constraint `quantity > 0` on `cart_items` blocks zero or negative quantities.
- [ ] `PRAGMA foreign_key_check;` returns zero rows.
- [ ] Deleting a user row cleanly cascades to `customers`, `addresses`, `carts`, and `cart_items`.
- [ ] Deleting a user row sets `orders.customer_id = NULL` without deleting the historical order, shipments, or payments.
- [ ] No regression exists in catalog queries against `categories`, `products`, `inventory_logs`, or `reviews`.
