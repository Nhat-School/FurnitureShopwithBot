# Handoff Report: Milestone 1 D1 Database Schema & Migrations

**Agent:** Worker (`worker_m1_schema`)  
**Parent Conversation ID:** `2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`  
**Working Directory:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m1_schema`  
**Date:** 2026-09-29  

---

## 1. Observation

### 1.1. File Created
- **Path:** `/Users/nhaterik/CloudflareProjects/Furproject/migrations/0002_domain_schema.sql` (105 lines)
- **Tables Created:**
  1. `users` (Google OAuth claims, FullName structure, contact info, role, timestamps)
  2. `customers` (1:1 Table-per-Subclass extension with `user_id UNIQUE REFERENCES users(id) ON DELETE CASCADE`, `customer_type`, `loyalty_points`)
  3. `addresses` (1:N delivery address book with `user_id REFERENCES users(id) ON DELETE CASCADE`, `recipient_name`, `phone`, `street`, `ward`, `district`, `city_province`, `postal_code`, `is_default`)
  4. `carts` (1:1 server-side mutable cart aggregate with `user_id UNIQUE REFERENCES users(id) ON DELETE CASCADE`)
  5. `cart_items` (Cart line items with `cart_id REFERENCES carts(id) ON DELETE CASCADE`, `product_id REFERENCES products(id) ON DELETE CASCADE`, `quantity > 0 CHECK constraint`)
  6. `ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;`
  7. `shipments` (1:1 order fulfillment tracking with `order_id UNIQUE REFERENCES orders(id) ON DELETE CASCADE`, `carrier`, `tracking_number`, `shipping_status`, `shipping_cost`, `delivery_address`)
  8. `order_payments` (1:1 payment tracking with `order_id UNIQUE REFERENCES orders(id) ON DELETE CASCADE`, `payment_method`, `transaction_id`, `payment_status`, `amount`)
- **Indexes Created:**
  - `idx_users_auth_provider_subject` (UNIQUE on `(auth_provider, provider_subject) WHERE provider_subject IS NOT NULL`)
  - `idx_addresses_user_id` on `addresses(user_id)`
  - `idx_cart_items_cart_product` (UNIQUE composite on `(cart_id, product_id)`)
  - `idx_cart_items_cart_id` on `cart_items(cart_id)`
  - `idx_cart_items_product_id` on `cart_items(product_id)`
  - `idx_orders_customer_id` on `orders(customer_id)`
  - `idx_shipments_tracking_number` on `shipments(tracking_number)`
  - `idx_order_payments_transaction_id` on `order_payments(transaction_id) WHERE transaction_id IS NOT NULL`

### 1.2. Migration Execution Command and Output
```bash
$ echo "y" | npx wrangler d1 migrations apply furproject-db --local
```
**Verbatim Output:**
```
Migrations to be applied:
┌────────────────────────┐
│ name                   │
├────────────────────────┤
│ 0002_domain_schema.sql │
└────────────────────────┘
? About to apply 1 migration(s)
Your database may not be available to serve requests during the migration, continue?
🤖 Using fallback value in non-interactive context: yes
🌀 Executing on local database furproject-db (507651c1-c120-431c-8a6f-10a2a26ecbc2) from .wrangler/state/v3/d1:
🌀 To execute on your remote database, add a --remote flag to your wrangler command.
🚣 17 commands executed successfully.
┌────────────────────────┬────────┐
│ name                   │ status │
├────────────────────────┼────────┤
│ 0002_domain_schema.sql │ ✅     │
└────────────────────────┴────────┘
```

### 1.3. Post-Migration Verification Queries and Output

#### A. Migration List Status
```bash
$ npx wrangler d1 migrations list furproject-db --local
```
**Output:**
```
✅ No migrations to apply!
```

#### B. Migration History Record
```bash
$ npx wrangler d1 execute furproject-db --local --command "SELECT id, name, applied_at FROM d1_migrations ORDER BY id ASC;"
```
**Output:**
```
┌────┬─────────────────────────┬─────────────────────┐
│ id │ name                    │ applied_at          │
├────┼─────────────────────────┼─────────────────────┤
│ 1  │ 0001_initial_schema.sql │ 2026-09-29 16:18:03 │
├────┼─────────────────────────┼─────────────────────┤
│ 2  │ 0002_domain_schema.sql  │ 2026-09-29 16:28:48 │
└────┴─────────────────────────┴─────────────────────┘
```

#### C. Table Inventory in `sqlite_master`
```bash
$ npx wrangler d1 execute furproject-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
```
**Output:**
```
┌────────────────┐
│ name           │
├────────────────┤
│ addresses      │
├────────────────┤
│ cart_items     │
├────────────────┤
│ carts          │
├────────────────┤
│ categories     │
├────────────────┤
│ customers      │
├────────────────┤
│ d1_migrations  │
├────────────────┤
│ inventory_logs │
├────────────────┤
│ order_items    │
├────────────────┤
│ order_payments │
├────────────────┤
│ orders         │
├────────────────┤
│ products       │
├────────────────┤
│ reviews        │
├────────────────┤
│ shipments      │
├────────────────┤
│ users          │
└────────────────┘
```

#### D. Column Verification on `orders` Table
```bash
$ npx wrangler d1 execute furproject-db --local --command "PRAGMA table_info('orders');"
```
**Output (relevant row):**
```
┌─────┬──────────────────────┬─────────┬─────────┬─────────────────┬────┐
│ cid │ name                 │ type    │ notnull │ dflt_value      │ pk │
├─────┼──────────────────────┼─────────┼─────────┼─────────────────┼────┤
│ 16  │ customer_id          │ TEXT    │ 0       │ null            │ 0  │
└─────┴──────────────────────┴─────────┴─────────┴─────────────────┴────┘
```

#### E. Referential Integrity Audit (`PRAGMA foreign_key_check`)
```bash
$ npx wrangler d1 execute furproject-db --local --command "PRAGMA foreign_key_check;"
```
**Output:**
```
🚣 1 command executed successfully.
(0 rows returned - zero violations)
```

#### F. Cascade Deletion Behavior Verification
Inserting full fixture hierarchy (`users` -> `customers` -> `addresses` -> `carts` -> `cart_items` -> `orders` -> `order_items` -> `shipments` -> `order_payments`) and deleting the user produced:
- `customers` count: 0 (cascaded)
- `addresses` count: 0 (cascaded)
- `carts` count: 0 (cascaded)
- `cart_items` count: 0 (cascaded)
- `orders` row retained: `id = 'ord_vtest_01'`, `customer_id = NULL` (retained with `SET NULL`)
- `order_items` count: 1 (retained)
- `shipments` count: 1 (retained)
- `order_payments` count: 1 (retained)
Subsequent deletion of `orders` cleanly cascaded to `shipments` (count: 0) and `order_payments` (count: 0).

### 1.4. Build Verification
```bash
$ npm run build
```
**Output:**
```
> aifurniture@1.0.0 build
> vite build

vite v6.4.3 building for production...
✓ 1871 modules transformed.
dist/index.html                   1.34 kB │ gzip:  0.81 kB
dist/assets/index-DBmdSAKR.css   43.80 kB │ gzip:  8.42 kB
dist/assets/index-CnaPWAr7.js   305.07 kB │ gzip: 87.09 kB
✓ built in 693ms
```

---

## 2. Logic Chain

1. **Schema Formulation**:
   - `0001_initial_schema.sql` established the catalog and baseline order tables (`categories`, `products`, `orders`, `order_items`, `inventory_logs`, `reviews`).
   - The user's system specification (`/Users/nhaterik/lastyear/thietkehethong`) and Google OAuth requirements required 19 domain concepts, specifically user identity with OpenID subjects and structured names, 1:1 customer profiles with loyalty tiers, multi-address directories, server-persisted carts distinct from frozen orders, physical shipment tracking, and financial payment settlement records.
   - The DDL from `explorer_m1_schema/ddl_plan.md` defined these exact structures with appropriate data types (`TEXT`, `INTEGER`, `REAL`), constraints (`PRIMARY KEY`, `UNIQUE`, `NOT NULL`, `CHECK (quantity > 0)`), and referential cascading rules.

2. **Invariants & Referential Protections**:
   - Deleting a user must purge private operational data (`customers`, `addresses`, `carts`, `cart_items`) via `ON DELETE CASCADE`.
   - Placed orders represent tax and accounting records that must never be destroyed by user account deletion; hence `orders.customer_id` strictly implements `ON DELETE SET NULL`.
   - The partial index `idx_users_auth_provider_subject` guarantees unicity for Google OAuth subjects while permitting multiple guest checkouts (`provider_subject IS NULL`).

3. **Execution & Integrity Assertion**:
   - Wrangler CLI executed the 17 SQL statements within `0002_domain_schema.sql` cleanly against the local D1 SQLite store.
   - `PRAGMA foreign_key_check;` confirmed that all parent-child relationships are completely valid.
   - Live fixture simulation verified that `ON DELETE SET NULL` on `orders` and `ON DELETE CASCADE` across child entities functioned exactly as designed.
   - `npm run build` confirmed zero bundler or build breakages.

---

## 3. Caveats

1. **Remote Cloudflare D1 Deployment**: The migration has been applied locally (`--local`). When deploying to production Cloudflare, `wrangler d1 migrations apply furproject-db --remote` must be run with proper Cloudflare credentials.
2. **Milestone 2 Legacy Code Cleanup**: In `functions/api/[[path]].js`, lines 120-128 contain an obsolete inline table creation statement (`CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT NOT NULL...)`). Milestone 2 will replace or remove this legacy code so that it uses the complete schema from `0002_domain_schema.sql`.

---

## 4. Conclusion

Milestone 1 is complete:
- `migrations/0002_domain_schema.sql` is authored and committed.
- Local D1 database has applied migration 0002 cleanly.
- All 13 application tables and 8 domain indexes are active in SQLite.
- Foreign key checks and cascade/retention lifecycles pass with zero violations.
- Project build (`npm run build`) compiles with zero errors.

---

## 5. Verification Method

To independently verify the milestone deliverables:

1. **Inspect Migration File**:
   ```bash
   cat /Users/nhaterik/CloudflareProjects/Furproject/migrations/0002_domain_schema.sql
   ```

2. **Verify Local Migration Status**:
   ```bash
   npx wrangler d1 migrations list furproject-db --local
   ```
   *Expected: `No migrations to apply!` and `0002_domain_schema.sql` present in `d1_migrations`.*

3. **Verify Table Inventory**:
   ```bash
   npx wrangler d1 execute furproject-db --local --command "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC;"
   ```
   *Expected: 14 tables (addresses, cart_items, carts, categories, customers, d1_migrations, inventory_logs, order_items, order_payments, orders, products, reviews, shipments, users).*

4. **Verify Foreign Keys & Referential Integrity**:
   ```bash
   npx wrangler d1 execute furproject-db --local --command "PRAGMA foreign_key_check;"
   ```
   *Expected: Zero rows returned.*

5. **Verify Orders Column Extension**:
   ```bash
   npx wrangler d1 execute furproject-db --local --command "PRAGMA table_info('orders');"
   ```
   *Expected: Row 16 shows `customer_id TEXT`.*

6. **Verify Frontend Build**:
   ```bash
   npm run build
   ```
   *Expected: `✓ built in ...ms` with exit code 0.*
