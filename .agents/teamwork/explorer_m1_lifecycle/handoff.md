# Handoff Report — Domain Lifecycle Constraints and Immutability Invariants (Milestone 1)

**Agent:** `explorer_m1_lifecycle`  
**Parent ID:** `2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`  
**Target:** Milestone 1 Schema & Downstream API/Test Contracts  
**Report Artifact:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_lifecycle/lifecycle_invariants_report.md`  

---

## 1. Observation

1. **Legacy D1 Schema (`migrations/0001_initial_schema.sql`)**:
   - Lines 38–55: `orders` table defines columns `id`, `customer_name`, `customer_email`, `customer_phone`, `delivery_address`, `has_freight_elevator`, `floor_number`, `subtotal`, `freight_surcharge`, `total_amount`, `status`, `tracking_code`, `payment_method`, `notes`, `created_at`, `updated_at`.
   - `orders` completely lacks a `customer_id` foreign key referencing authenticated users.
   - Lines 58–66: `order_items` defines `FOREIGN KEY (order_id) REFERENCES orders(id)` and `FOREIGN KEY (product_id) REFERENCES products(id)`, but contains **no secondary index on `order_id`**.
   - Running `npx wrangler d1 execute furproject-db --local --command="EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id = 'ord_123';"` produced:
     ```
     ┌────┬────────┬─────────┬──────────────────┐
     │ id │ parent │ notused │ detail           │
     ├────┼────────┼─────────┼──────────────────┤
     │ 2  │ 0      │ 216     │ SCAN order_items │
     └────┴────────┴─────────┴──────────────────┘
     ```
     Confirming that fetching items for any order triggers a full table scan of all order items.

2. **Existing Pages Functions Handler (`functions/api/[[path]].js`)**:
   - Lines 380–403: `POST /api/orders` receives a payload and generates a mock response:
     ```javascript
     const trackingCode = `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`;
     return jsonResponse({
       success: true,
       order: {
         id: `ord_${Date.now()}`,
         trackingCode,
         customer: body.customer,
         totalAmount: body.totalAmount,
         status: 'Processing'
       }
     });
     ```
   - The endpoint does not insert rows into `orders`, `order_items`, or D1 tables, does not query live catalog prices from `products`, does not snapshot addresses, and does not purge cart items.

3. **Foreign Key Enforcement in Cloudflare D1**:
   - Running `npx wrangler d1 execute furproject-db --local --command="PRAGMA foreign_keys;"` returned `1` (enabled by default in local D1 / workerd).
   - Running an invalid insert into `order_items` with a non-existent `order_id` failed immediately with verbatim error:
     ```
     ✘ [ERROR] FOREIGN KEY constraint failed: SQLITE_CONSTRAINT
     ```

4. **Empirical Behavior of `ALTER TABLE ... ADD COLUMN ... REFERENCES ... ON DELETE SET NULL`**:
   - Executed against local D1:
     ```sql
     CREATE TABLE IF NOT EXISTS test_users (id TEXT PRIMARY KEY, email TEXT);
     CREATE TABLE IF NOT EXISTS test_orders (id TEXT PRIMARY KEY, total REAL);
     ALTER TABLE test_orders ADD COLUMN customer_id TEXT REFERENCES test_users(id) ON DELETE SET NULL;
     CREATE INDEX idx_test_orders_customer_id ON test_orders(customer_id);
     INSERT INTO test_users (id, email) VALUES ('u1', 'test@test.com');
     INSERT INTO test_orders (id, total, customer_id) VALUES ('o1', 100, 'u1');
     DELETE FROM test_users WHERE id = 'u1';
     SELECT id, total, customer_id FROM test_orders;
     ```
   - Result: Returned row `id: o1, total: 100, customer_id: null`. The order record was preserved, and `customer_id` was automatically set to NULL without error.

5. **Index Query Plan Comparison for Customer Order History**:
   - Executed against local D1 with `SELECT * FROM test_orders WHERE customer_id = 'u1' ORDER BY created_at DESC;`:
     - With single-column index `idx_test_cust (customer_id)`:
       `SEARCH test_orders USING INDEX idx_test_cust (customer_id=?)`  
       `USE TEMP B-TREE FOR ORDER BY` (requires temporary in-memory B-Tree sort).
     - With compound index `idx_test_cust_created (customer_id, created_at DESC)`:
       `SEARCH test_orders USING INDEX idx_test_cust_created (customer_id=?)`  
       **Zero temp B-Tree sort**; rows are emitted in reverse chronological order directly from index.

---

## 2. Logic Chain

1. **From Observation 1 & 2 to CartItem vs OrderItem Invariant**:
   - Because `functions/api/[[path]].js` currently performs mock order returns and D1 tables are empty, client-side cart data has no server counterpart.
   - `cart_items` represents transient, pre-contractual shopping intent with floating prices.
   - `order_items` represents an immutable fiscal invoice line.
   - Therefore, at checkout time ($t_{\text{checkout}}$), `POST /api/orders` must read `products.price` directly from D1 (ignoring client prices) and copy it into `order_items.unit_price`. Once written, unit prices are frozen forever: $\frac{d}{dt}(\text{unit\_price}) = 0$.
   - A database trigger `trg_prevent_order_items_update` provides defense-in-depth against accidental modification.

2. **From Observation 1 & Domain Design to Address Immutability**:
   - `addresses` is a living address book edited and deleted by users.
   - If `orders` or `shipments` used a foreign key to `addresses(id)`, updating an address in user profile would retroactively corrupt delivery records of historical orders, and deleting an address would either delete orders (CASCADE) or wipe delivery locations (SET NULL).
   - Therefore, `orders.delivery_address` and `shipments.delivery_address` must store independent text snapshots captured at checkout time, completely decoupled from `addresses.id`.

3. **From Observation 3 & 4 to Foreign Key Cascading Strategy**:
   - Deleting a user should delete user-owned private entities: `customers` profile (CASCADE), `addresses` book (CASCADE), and `carts` with `cart_items` (CASCADE).
   - Deleting a user must NEVER delete orders or accounting records, as this would violate tax audit laws and inventory log consistency.
   - Observation 4 proved that `ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL` works reliably in D1.
   - Therefore, `ON DELETE SET NULL` is the mandatory constraint for `orders.customer_id`.

4. **From Observation 1 & 5 to Index Optimization**:
   - Observation 1 showed an unindexed `order_items.order_id` forces full table scans.
   - Observation 5 proved that a single index on `customer_id` incurs `USE TEMP B-TREE FOR ORDER BY`, while a compound index `(customer_id, created_at DESC)` completely eliminates the temporary B-Tree sort.
   - Therefore, Milestone 1 must add `idx_orders_customer_created ON orders (customer_id, created_at DESC)` and `idx_order_items_order_id ON order_items (order_id)`.

---

## 3. Caveats

- **SQLite In-Memory Test Runners**: Vitest or mocha suites using in-memory SQLite (e.g. `better-sqlite3`) may have `PRAGMA foreign_keys = OFF` by default. Test harness setups must execute `PRAGMA foreign_keys = ON;` on initialization.
- **Concurrent Checkout Stock Deductions**: In high-concurrency flash sales, multiple simultaneous checkouts on the same product could lead to negative stock if checked outside a transaction. In Cloudflare Workers/Pages Functions, batch operations in `env.DB.batch([...])` execute atomically, but application code should verify stock before inserting or include a `CHECK (stock >= 0)` constraint on `products`.
- **Guest Checkout Support**: If guest checkout is supported, `orders.customer_id` will naturally be `NULL` from creation, which is fully compatible with `customer_id TEXT REFERENCES users(id) ON DELETE SET NULL`.

---

## 4. Conclusion

1. **Schema Specifications Finalized**:
   - `migrations/0002_domain_schema.sql` must define tables `users`, `customers`, `addresses`, `carts`, `cart_items`, `shipments`, and `order_payments`.
   - `orders` must be altered with `customer_id TEXT REFERENCES users(id) ON DELETE SET NULL`.
   - `order_items` must be indexed via `idx_order_items_order_id ON order_items (order_id)`.
   - `orders` must be indexed via `idx_orders_customer_created ON orders (customer_id, created_at DESC)`.
   - `trg_prevent_order_items_update` should be deployed to prevent mutation of finalized items.

2. **Application Contracts Finalized**:
   - `POST /api/orders` must execute price capture, shipment snapshotting, inventory decrementing, and cart purge in a single `env.DB.batch([...])`.
   - Delivery addresses in `orders` and `shipments` are standalone string snapshots without a foreign key to `addresses(id)`.

---

## 5. Verification Method

To independently verify the lifecycle invariants and schema behaviors, run the following commands:

```bash
# 1. Verify PRAGMA foreign_keys is enabled in local D1
npx wrangler d1 execute furproject-db --local --command="PRAGMA foreign_keys;"

# 2. Verify ON DELETE SET NULL behavior on orders.customer_id
npx wrangler d1 execute furproject-db --local --command="
CREATE TABLE IF NOT EXISTS test_users (id TEXT PRIMARY KEY, email TEXT);
CREATE TABLE IF NOT EXISTS test_orders (id TEXT PRIMARY KEY, customer_id TEXT REFERENCES test_users(id) ON DELETE SET NULL);
INSERT INTO test_users (id, email) VALUES ('u1', 'test@test.com');
INSERT INTO test_orders (id, customer_id) VALUES ('o1', 'u1');
DELETE FROM test_users WHERE id = 'u1';
SELECT id, customer_id FROM test_orders;
DROP TABLE test_orders;
DROP TABLE test_users;
"
# Expected output: o1 | null

# 3. Verify compound index eliminates temporary B-Tree sort
npx wrangler d1 execute furproject-db --local --command="
CREATE TABLE IF NOT EXISTS test_orders (id TEXT PRIMARY KEY, customer_id TEXT, created_at TEXT);
CREATE INDEX idx_test_compound ON test_orders(customer_id, created_at DESC);
EXPLAIN QUERY PLAN SELECT * FROM test_orders WHERE customer_id = 'u1' ORDER BY created_at DESC;
DROP TABLE test_orders;
"
# Expected output: SEARCH test_orders USING INDEX idx_test_compound (without USE TEMP B-TREE)

# 4. Check that full project builds cleanly
npm run build
```
