# Handoff Report: Milestone 1 Database Schema & Domain Models

**Agent:** Teamwork Explorer (`explorer_m1_schema`)  
**Working Directory:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema`  
**Target Milestone:** Milestone 1 (D1 Database Schema & Migrations)  
**Deliverable File:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema/ddl_plan.md`  

---

## 1. Observation

1. **Existing Schema (`migrations/0001_initial_schema.sql`)**:
   - Contains definitions for `categories` (lines 4-11), `products` (lines 14-35), `orders` (lines 38-55), `order_items` (lines 58-66), `inventory_logs` (lines 69-78), and `reviews` (lines 81-91).
   - `orders` (lines 38-55) currently stores customer data in denormalized text columns (`customer_name`, `customer_email`, `customer_phone`, `delivery_address`), with no `customer_id` foreign key.
   - No tables exist for `users`, `customers`, `addresses`, `carts`, `cart_items`, `shipments`, or `order_payments`.
   - Local D1 state (`.wrangler/state/v3/d1/.../6d088d550e15cfe09553567cfe96cd43d18d80264d8f8a5f0369401a063f404f.sqlite`) contains table `d1_migrations` with record:
     ```
     1|0001_initial_schema.sql|2026-09-29 16:18:03
     ```
     indicating `0001_initial_schema.sql` is currently applied and `0002_domain_schema.sql` will be the next migration executed.

2. **Project Contracts (`PROJECT.md` & `domain_specs_report.md`)**:
   - `PROJECT.md` lines 48-65 specifies exact schema contracts:
     - `users`: `id`, `email UNIQUE`, `auth_provider`, `provider_subject`, `display_name`, `first_name`, `mid_name`, `last_name`, `phone`, `avatar_url`, `role`, `created_at`, `updated_at`.
     - `customers`: `id`, `user_id UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `customer_type`, `loyalty_points`, `created_at`.
     - `addresses`: `id`, `user_id NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `recipient_name`, `phone`, `street`, `ward`, `district`, `city_province`, `postal_code`, `is_default`, `created_at`.
     - `carts`: `id`, `user_id UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE`, `created_at`, `updated_at`.
     - `cart_items`: `id`, `cart_id NOT NULL REFERENCES carts(id) ON DELETE CASCADE`, `product_id NOT NULL REFERENCES products(id) ON DELETE CASCADE`, `quantity`, `created_at`, `updated_at`. Unique index on `(cart_id, product_id)`.
     - `orders` linkage: `customer_id TEXT REFERENCES users(id)`.
     - `shipments`: `id`, `order_id UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE`, `carrier`, `tracking_number`, `shipping_status`, `shipping_cost`, `recipient_name`, `phone`, `delivery_address`, `estimated_delivery`, `created_at`, `updated_at`.
     - `order_payments`: `id`, `order_id UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE`, `payment_method`, `transaction_id`, `payment_status`, `amount`, `created_at`, `updated_at`.
   - `src/components/AuthModal.jsx` line 104 and `src/components/Header.jsx` line 130 confirm UI expects `avatar_url`.

3. **Empirical SQLite Simulation Results**:
   - Command: `sqlite3 :memory:` testing partial unique index:
     - Inserting duplicate `provider_subject` failed with `UNIQUE constraint failed: users.auth_provider, users.provider_subject (19)`.
     - Inserting multiple rows with `provider_subject IS NULL` succeeded, proving partial index correctness for guest checkout.
   - Command testing user deletion when orders exist:
     - Omitting `ON DELETE` clause resulted in `FOREIGN KEY constraint failed (19)` when executing `DELETE FROM users WHERE id = 'usr_1'`.
     - Specifying `customer_id TEXT REFERENCES users(id) ON DELETE SET NULL` succeeded with exit code 0, preserving the historical order row with `customer_id = NULL` while cascading deletion to `customers`, `addresses`, `carts`, and `cart_items`.
   - Cloned local D1 database test (`.backup /tmp/test_d1_furproject.sqlite`):
     - Executed full DDL draft including `ALTER TABLE orders ADD COLUMN ...` and 8 secondary/unique indexes.
     - Succeeded with exit code 0; verified all 15 tables and 13 indexes in `sqlite_master`.

---

## 2. Logic Chain

1. **Step 1 (Catalog vs Account Isolation)**:
   - Observation 1 shows that catalog data (`products`, `categories`) and transient checkout data (`orders`, `order_items`) exist, but user authentication and session persistence tables do not.
   - Therefore, new DDL must define `users` and its extension `customers` without modifying catalog tables.

2. **Step 2 (OAuth & Guest Coexistence)**:
   - Requirement specifies supporting Google OAuth 2.0 PKCE while maintaining guest checkout fallback.
   - Observation 3 proves that a partial unique index `CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;` allows multiple guest records with `NULL` provider subject while strictly preventing duplicate Google accounts.

3. **Step 3 (Cart vs Order Immutability)**:
   - Analytical specification states `CartItem != OrderItem`.
   - `cart_items` table links to `carts` and `products` with mutable `quantity`, querying live catalog `products.price`.
   - `order_items` (already in `0001_initial_schema.sql`) retains its frozen `unit_price REAL NOT NULL`, capturing price at checkout.

4. **Step 4 (Order Customer Linkage & Audit Lock)**:
   - Observation 3 demonstrated that SQLite rejects user deletion if a child order has a default `NO ACTION` FK.
   - In accordance with e-commerce compliance rules (`domain_specs_report §4.2`), historical purchases must not be destroyed if an account is closed.
   - Therefore, `ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;` safely dissociates deleted user IDs while preserving legal invoice records.

5. **Step 5 (Fulfillment and Payment Normalization)**:
   - `shipments` and `order_payments` capture 1:1 logistics and financial records with `order_id UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE`.
   - Dedicated indexes on `shipments(tracking_number)` and `order_payments(transaction_id)` allow fast order tracking queries and payment gateway callback reconciliation.

---

## 3. Caveats

1. **ALTER TABLE Syntax in SQLite**:
   - SQLite does not support `IF NOT EXISTS` on `ALTER TABLE ... ADD COLUMN`. The statement will error if executed a second time on an already migrated database. Because Cloudflare D1 tracks migrations in `d1_migrations`, this statement will run once and only once during `0002_domain_schema.sql`.
2. **Nullable `customer_id` on `orders`**:
   - `customer_id` is intentionally nullable to support unauthenticated guest checkouts. Application logic in `POST /api/orders` must populate `customer_id` when an authenticated session is present and leave it `NULL` for guests.
3. **No Direct Modification to Project Migration Files**:
   - As an Explorer in read-only investigation mode, `migrations/0002_domain_schema.sql` was not created directly in the project directory; instead, the exact SQL is documented in `ddl_plan.md` for the implementing agent to create.

---

## 4. Conclusion

The exact DDL statements required for `migrations/0002_domain_schema.sql` have been formulated, verified against SQLite 3.51 and cloned Cloudflare D1 local storage, and documented in:
`/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema/ddl_plan.md`

The schema strictly fulfills:
- All 8 table and linkage specifications from the task prompt.
- Full compatibility with Cloudflare D1 SQLite engine.
- Proper cascade behaviors (`ON DELETE CASCADE` for user profile data, `ON DELETE SET NULL` for historical orders).
- All required unique and lookup indexes.

---

## 5. Verification Method

To independently verify the DDL plan:

1. **Verify DDL File Exists**:
   ```bash
   cat /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema/ddl_plan.md
   ```

2. **Test SQLite Syntax & Foreign Key Constraints**:
   Run an in-memory SQLite validation extracting the SQL script:
   ```bash
   sqlite3 :memory: < (sed -n '/```sql/,/```/p' /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema/ddl_plan.md | grep -v '```')
   ```

3. **Downstream Implementation Verification (by Coder)**:
   Once the file is written to `migrations/0002_domain_schema.sql`:
   ```bash
   npx wrangler d1 migrations apply furproject-db --local
   ```
   Check applied tables:
   ```bash
   npx wrangler d1 execute furproject-db --local --command="SELECT name FROM sqlite_master WHERE type='table';"
   ```
