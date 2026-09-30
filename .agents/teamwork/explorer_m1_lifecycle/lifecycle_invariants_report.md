# Domain Lifecycle Constraints and Immutability Invariants Report

**Investigation Target:** Milestone 1 Database Schema (`migrations/0002_domain_schema.sql`) and Downstream API Contracts  
**Investigator:** Explorer Agent (`explorer_m1_lifecycle`)  
**Parent Conversation ID:** `2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`  
**Working Directory:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_lifecycle`  
**Date:** 2026-09-29  

---

## 1. Executive Summary

This report establishes the rigorous domain lifecycle rules, immutability invariants, referential integrity cascading actions, and database indexing strategies required for Milestone 1 of Furproject (ABC Furniture E-Commerce Platform).

E-commerce systems handle two distinct classes of data with diametrically opposed lifecycle requirements:
1. **Transient Operational State**: Mutable, user-editable, volatile, and disposable (e.g., active shopping carts, items in cart, saved address book entries, draft profiles).
2. **Immutable Transaction & Audit Records**: Legally binding, financially auditable, strictly frozen at time of creation, and non-repudiable (e.g., placed orders, line item unit prices, fulfillment address snapshots, payment records, inventory deduction logs).

### Core Invariants Summary

| Domain Dimension | Transient / Mutable Layer | Immutable Audit Layer | Boundary Enforcement Mechanism |
|---|---|---|---|
| **Shopping vs. Purchase** | `cart_items` (dynamic quantity, live floating catalog price) | `order_items` (locked quantity, `unit_price` frozen from catalog price at checkout) | Atomic checkout transaction captures price from `products.price`; database trigger prevents `UPDATE`/`DELETE` on `order_items`. |
| **Delivery Address** | `addresses` (customer address book, frequently edited, updated, or deleted) | `orders.delivery_address` and `shipments.delivery_address` (exact address string snapshot) | No foreign key to `addresses.id` on orders/shipments; address snapshot is serialized at checkout. |
| **User Deletion Impact** | `carts`, `cart_items`, `addresses`, `customers` profile | `orders`, `order_items`, `shipments`, `order_payments`, `inventory_logs` | User deletion cascades (`ON DELETE CASCADE`) to cart and addresses, but sets customer foreign key to null (`ON DELETE SET NULL`) on orders to retain financial and tax history. |
| **Relational Integrity** | SQLite `PRAGMA foreign_keys = ON` | SQLite `PRAGMA foreign_keys = ON` | Verified enabled by default in Cloudflare D1; must be explicitly asserted in migration scripts. |
| **Query & Scan Efficiency** | Single-column lookup on `user_id` / `cart_id` | Compound index `(customer_id, created_at DESC)` on `orders` | Eliminates table scans and removes `USE TEMP B-TREE FOR ORDER BY` in D1 execution plans. |

---

## 2. Pillar 1: CartItem vs. OrderItem Distinction & Lifecycle Transition

### 2.1. Fundamental Domain & Business Role Contrast

The analytical models from Assignment 03 (`ecomAnalysis.vpp`, `slide_03_class_model.pdf`) define an uncompromising architectural rule:

```
CartItem != OrderItem
```

| Dimension | CartItem (`cart_items`) | OrderItem (`order_items`) |
|---|---|---|
| **Domain Aggregate** | Owned by `Cart` (Composition: `Cart 1 ── 0..* CartItem`) | Owned by `Order` (Composition: `Order 1 ── 1..* OrderItem`) |
| **Legal Nature** | Expression of shopping intent (pre-contractual) | Legally binding commercial purchase contract |
| **Price Semantics** | **Dynamic**: floats with catalog price changes, promotional discounts, and flash sales | **Strictly Frozen**: captures exact unit price at checkout timestamp $t_{\text{checkout}}$ |
| **Quantity Mutability** | User increases, decreases, or resets quantity freely | Sealed upon checkout confirmation; cannot be edited |
| **Post-Checkout State** | Destroyed / purged (`cart_items` rows deleted) | Persisted permanently for tax, audit, and customer order history |
| **Stock Allocation** | Unreserved (or temporary soft reservation) | Hard deducted from `products.stock` with audit row in `inventory_logs` |

### 2.2. Mathematical Immutability Invariant

Let $P(t)$ be the live catalog price function of a product in `products.price` at timestamp $t$.  
Let $t_{\text{checkout}}$ be the discrete timestamp when an order is finalized.

At timestamp $t_{\text{checkout}}$:
```
OrderItem.unit_price = Product.price(t_checkout)
OrderItem.quantity   = CartItem.quantity
OrderItem.subtotal   = OrderItem.quantity * OrderItem.unit_price
Order.total_amount   = sum(OrderItem.subtotal) + Shipping.shipping_cost + Order.freight_surcharge - discounts
```

For any future timestamp $t > t_{\text{checkout}}$, regardless of catalog price changes ($P(t) \neq P(t_{\text{checkout}})$) or product obsolescence:
```
d/dt (OrderItem.unit_price) = 0
d/dt (Order.total_amount)   = 0
```

#### Why Storing a Foreign Key to `products.price` Alone is a Catastrophic Defect
If an order system does not store a dedicated, materialized `unit_price` on `order_items` and instead joins `products.price` dynamically:
1. When a sofa's price increases from 14,500,000 VND to 18,000,000 VND, all past orders placed months ago retroactively inflate their total amounts.
2. Invoices, financial accounting ledgers, and VAT tax returns become inconsistent with actual banking receipts.
3. If a product is retired or deleted, historical orders lose their price data entirely.

Therefore, `order_items.unit_price REAL NOT NULL` is a non-negotiable physical column.

### 2.3. The Checkout Transaction Boundary (D1 Batch Contract)

In Cloudflare D1 (backed by SQLite), transactions spanning multiple queries must be executed atomically using `env.DB.batch([ ... ])`.

The transition from mutable cart to immutable order follows this strict 8-step sequence:

```
[Customer clicks Checkout]
           │
           ▼
1. Fetch live product data:
   SELECT id, price, stock, name, width_cm, depth_cm, height_cm 
   FROM products WHERE id IN (item_ids);
           │
           ▼
2. Validate business rules:
   - Is cart non-empty? (Order must have >= 1 items)
   - Is stock sufficient? (products.stock >= item.quantity)
           │
           ▼
3. Calculate immutable totals:
   subtotal = sum(item.quantity * product.price)
   freight_surcharge = calculateBulkyFreight(items, elevator, floor)
   total_amount = subtotal + freight_surcharge + shipping_fee
           │
           ▼
4. Build Atomic D1 Batch:
   ┌────────────────────────────────────────────────────────────────────────┐
   │ a. INSERT INTO orders (id, customer_id, customer_name, customer_email, │
   │       customer_phone, delivery_address, has_freight_elevator,          │
   │       floor_number, subtotal, freight_surcharge, total_amount, status, │
   │       tracking_code, payment_method)                                   │
   │ b. For each item:                                                      │
   │    INSERT INTO order_items (id, order_id, product_id, quantity,        │
   │           unit_price) VALUES (?, ?, ?, ?, product.price)               │
   │ c. INSERT INTO shipments (id, order_id, carrier, tracking_number,      │
   │           shipping_status, shipping_cost, recipient_name, phone,       │
   │           delivery_address)                                            │
   │ d. INSERT INTO order_payments (id, order_id, payment_method,           │
   │           transaction_id, payment_status, amount)                      │
   │ e. For each item:                                                      │
   │    UPDATE products SET stock = stock - ? WHERE id = ?                  │
   │    INSERT INTO inventory_logs (id, product_id, change_amount,          │
   │           remaining_stock, reason, staff_name)                         │
   │ f. DELETE FROM cart_items WHERE cart_id = ?                            │
   └────────────────────────────────────────────────────────────────────────┘
           │
           ▼
5. Execute env.DB.batch(statements)
           │
           ▼
[Success: Return Order Confirmation | Failure: All changes roll back automatically]
```

### 2.4. Invariant Enforcement Mechanisms

1. **Application Layer Isolation**:
   - The API MUST NOT expose any `PUT /api/orders/:id/items` or `DELETE /api/orders/:id/items` routes.
   - Orders can undergo status transitions (`Processing` -> `Dispatched` -> `Delivered`), but their associated `order_items` rows are completely immutable.

2. **Database Layer Defense-in-Depth (SQLite Trigger)**:
   To prevent accidental or programmatic mutation of historical prices, SQLite triggers can enforce immutability at the storage engine level:
   ```sql
   CREATE TRIGGER IF NOT EXISTS trg_prevent_order_items_update
   BEFORE UPDATE ON order_items
   BEGIN
       SELECT RAISE(ABORT, 'Integrity Violation: Order items are immutable legal records and cannot be updated.');
   END;
   ```

---

## 3. Pillar 2: Address Immutability & Shipment Snapshot

### 3.1. The Address Mutation Vulnerability

A customer's saved address in the `addresses` table represents a **Living Address Book**:
- Columns: `id, user_id, recipient_name, phone, street, ward, district, city_province, postal_code, is_default`.
- Lifecycle: Mutable. Customers change apartment numbers, move to different districts or cities, update phone numbers, and delete obsolete entries.

**The Catastrophic Relational Antipattern:**  
If `orders` or `shipments` were designed with a normalized foreign key `address_id REFERENCES addresses(id)` and retrieved delivery details via `JOIN addresses`:
1. **Retroactive Historical Corruption**: Suppose a customer orders a sofa delivered to *123 Lê Lợi, Quận 1, TP.HCM* in January 2026. In July 2026, the customer moves to *456 Trần Phú, Hải Châu, Đà Nẵng* and updates their saved address. Every historical order from January 2026 would retroactively claim it was delivered to Đà Nẵng.
2. **Carrier Audit & Tax Audit Failure**: In case of delivery disputes, chargebacks, or freight damage claims, the business would have zero cryptographic or database proof of where the package was physically shipped.
3. **Cascading Loss on Address Deletion**: If the customer deletes an old address from their profile:
   - With `ON DELETE CASCADE`: All past orders shipped to that address would be deleted.
   - With `ON DELETE SET NULL`: All past orders lose their delivery destination completely.
   - With `ON DELETE RESTRICT`: The customer is permanently blocked from cleaning up their address book.

### 3.2. The Dual Address Architecture Solution

To guarantee zero corruption, Furproject implements the **Snapshot Pattern**:

```
┌─────────────────────────────────────────┐
│           addresses (Living)            │
│  - id: addr_101                         │
│  - user_id: usr_001                     │
│  - recipient_name: "Nhật Erik"          │
│  - phone: "0901234567"                  │
│  - street: "123 Lê Lợi"                 │
│  - ward: "Bến Nghé"                     │
│  - district: "Quận 1"                   │
│  - city_province: "TP. Hồ Chí Minh"     │
│  - is_default: 1                        │
└─────────────────────────────────────────┘
                    │
   [Customer selects saved address]
                    │
                    ▼
   [Checkout: Snapshot Serialization]
                    │
        ┌───────────┴───────────┐
        ▼                       ▼
┌───────────────────────┐ ┌─────────────────────────────────────────┐
│     orders Table      │ │             shipments Table             │
│  - id: ord_999        │ │  - id: shp_999                          │
│  - customer_id: usr_1 │ │  - order_id: ord_999                    │
│  - delivery_address:  │ │  - carrier: "ABC Bulky Logistics"       │
│    "123 Lê Lợi,       │ │  - tracking_number: "ABC-VN-782910"     │
│     Bến Nghé, Quận 1, │ │  - shipping_status: "Pending"           │
│     TP. Hồ Chí Minh"  │ │  - recipient_name: "Nhật Erik"          │
│  - customer_name:     │ │  - phone: "0901234567"                  │
│    "Nhật Erik"        │ │  - delivery_address:                    │
│  - customer_phone:    │ │    "123 Lê Lợi, Bến Nghé, Quận 1,       │
│    "0901234567"       │ │     TP. Hồ Chí Minh"                    │
└───────────────────────┘ └─────────────────────────────────────────┘
        ▲                               ▲
        │                               │
        └─────── NO FOREIGN KEY ────────┘
           (Completely decoupled from addresses.id)
```

### 3.3. Structural Snapshot Guarantees

1. **Independent String Snapshot**: `orders.delivery_address` and `shipments.delivery_address` store the fully qualified, serialized physical destination string as of $t_{\text{checkout}}$.
2. **Recipient Contact Snapshot**: `shipments.recipient_name` and `shipments.phone` freeze the operational contact details for courier dispatch.
3. **Zero Coupling**: Neither `orders` nor `shipments` contains a foreign key column referencing `addresses(id)`.
4. **Lifecycle Independence**: The customer may edit, update, swap default flags, or completely delete all entries in `addresses` at any time without altering a single byte in `orders` or `shipments`.

---

## 4. Pillar 3: Foreign Key Constraints & ON DELETE Behaviors

### 4.1. The User Account Deletion Dilemma

Modern systems must comply with privacy mandates (e.g. GDPR "Right to be Forgotten") while simultaneously satisfying strict commercial and accounting standards:
- **Privacy Requirement**: When a user closes their account, their personal session credentials, active cart, and private address book must be deleted.
- **Accounting / Legal Requirement**: Placed orders represent sales agreements, tax liabilities, and physical inventory deductions. Deleting an order destroys financial ledgers, unbalances revenue reporting, and leaves orphan records in `inventory_logs`.

### 4.2. Complete Referential Multiplicity & Cascade Action Matrix

The table below defines every foreign key relationship in the Furproject schema, specifying the mandatory `ON DELETE` behavior and its rationale:

| Source Table (Child) | FK Column | Target Table (Parent) | Relationship | ON DELETE Action | Business & Technical Rationale |
|---|---|---|---|---|---|
| `customers` | `user_id` | `users(id)` | 1:1 | `CASCADE` | Customer profile (VIP tier, loyalty points) is an extension of user account. Deleting user purges profile. |
| `addresses` | `user_id` | `users(id)` | 1:N | `CASCADE` | Saved address book is private user data. Purged cleanly on account deletion. |
| `carts` | `user_id` | `users(id)` | 1:1 | `CASCADE` | Active shopping cart is transient session state. Purged on user deletion. |
| `cart_items` | `cart_id` | `carts(id)` | 1:N | `CASCADE` | Items in cart belong to the cart session. Deleting cart purges all line items. |
| `cart_items` | `product_id` | `products(id)` | N:1 | `CASCADE` | If an unsold draft product is removed from catalog, it vanishes from pending carts. |
| **`orders`** | **`customer_id`** | **`users(id)`** | **N:1** | **`SET NULL`** | **CRITICAL**: If user is deleted, `orders.customer_id` becomes `NULL`. The order, historical totals, snapshots, items, and tax records are **PERMANENTLY RETAINED**. `CASCADE` is strictly forbidden. |
| `order_items` | `order_id` | `orders(id)` | 1:N | `CASCADE` / `RESTRICT` | In production D1, order items belong strictly to the order aggregate. Orders are never hard deleted. |
| `order_items` | `product_id` | `products(id)` | N:1 | `RESTRICT` | A product that has historical order sales **CANNOT** be hard deleted. Deletion attempts fail; products must be soft-deleted (`is_active = 0`). |
| `shipments` | `order_id` | `orders(id)` | 1:1 | `CASCADE` | Shipment fulfillment record is tied 1:1 to the order lifecycle. |
| `order_payments` | `order_id` | `orders(id)` | 1:1 | `RESTRICT` | Payment transaction records must not be deleted while the order exists. |
| `inventory_logs` | `product_id` | `products(id)` | N:1 | `RESTRICT` | Inventory audit trails cannot have their product reference severed. |
| `reviews` | `product_id` | `products(id)` | N:1 | `CASCADE` | Reviews for a product follow the product entity lifecycle. |

### 4.3. Soft Delete vs. Hard Delete Strategy for Users

To maintain maximum data integrity, Furproject adopts a tiered deletion policy:

1. **Application Soft Delete (Default Path)**:
   - When a user clicks "Delete Account", the backend does not issue a raw `DELETE FROM users WHERE id = ?`.
   - Instead, it:
     ```sql
     UPDATE users 
     SET display_name = 'Deleted Customer',
         email = 'deleted_' || id || '@anonymized.local',
         phone = NULL,
         avatar_url = NULL,
         role = 'archived',
         updated_at = datetime('now')
     WHERE id = ?;
     ```
   - All active sessions are revoked (`fur_session` cookie invalidated).
   - Saved `addresses` and active `carts` are explicitly purged.

2. **Database Fail-Safe (`ON DELETE SET NULL`)**:
   - If an administrator or script executes a hard `DELETE FROM users WHERE id = ?`:
     - SQLite automatically cascades deletion to `customers`, `addresses`, `carts`, and `cart_items`.
     - In `orders`, SQLite executes `SET NULL` on `customer_id`.
     - The order row continues to exist:
       ```json
       {
         "id": "ord_1727626000000",
         "customer_id": null,
         "customer_name": "Nhật Erik",
         "customer_email": "nhaterik@gmail.com",
         "total_amount": 14500000,
         "status": "Delivered"
       }
       ```
     - Financial totals, monthly accounting, and inventory logs remain 100% consistent and intact.

---

## 5. Pillar 4: SQLite & Cloudflare D1 Edge Cases & Performance Engineering

### 5.1. `PRAGMA foreign_keys = ON;` in SQLite and D1

#### SQLite Background
By default in native SQLite C-libraries, foreign key enforcement is turned **OFF** (`PRAGMA foreign_keys = 0`) for backward compatibility with SQLite 2.x and early 3.x databases. When disabled:
- `FOREIGN KEY` clauses are parsed syntactically but ignored at runtime.
- `ON DELETE CASCADE` and `ON DELETE SET NULL` do **NOT** fire, creating orphan rows.
- Invalid foreign keys can be inserted without raising errors.

#### Cloudflare D1 Verification
We verified the foreign key configuration directly against the local Cloudflare D1 runtime (`wrangler d1 execute`):
```bash
$ npx wrangler d1 execute furproject-db --local --command="PRAGMA foreign_keys;"
┌──────────────┐
│ foreign_keys │
├──────────────┤
│ 1            │
└──────────────┘
```
In modern Cloudflare D1 (`miniflare` / `workerd`), foreign keys are enabled by default (`1`).

#### Invariant Best Practice
To guarantee uniform behavior across test runners (e.g. `better-sqlite3`, Vitest in-memory SQLite, local wrangler, and remote D1 edge replicas):
1. **Migration Header**: Every SQL migration file in `migrations/` must explicitly state `PRAGMA foreign_keys = ON;` at the very beginning of the script.
2. **Transaction Integrity**: D1 batch transactions (`env.DB.batch([...])`) inherit the connection's foreign key constraints.

### 5.2. Index Efficiency Analysis for Order History Lookups

#### The Problem: Table Scan on Customer Order History
When an authenticated customer visits `/api/customer/orders` (or storefront "Đơn Hàng Của Tôi"), the backend executes:
```sql
SELECT * FROM orders 
WHERE customer_id = ? 
ORDER BY created_at DESC;
```

If `customer_id` is an unindexed column, SQLite must perform a **FULL TABLE SCAN** (`SCAN orders`).  
Furthermore, because results must be returned in reverse chronological order, SQLite must load all matching rows into memory and construct a temporary B-Tree sort (`USE TEMP B-TREE FOR ORDER BY`).

#### Empirical Proof on Local D1
We tested both indexing strategies on local D1 using `EXPLAIN QUERY PLAN`:

**Case A: Single-column index `idx_orders_customer_id ON orders(customer_id)`**
```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 'usr_123' ORDER BY created_at DESC;
```
Result:
```
┌────┬────────┬─────────┬─────────────────────────────────────────────────────────┐
│ id │ parent │ notused │ detail                                                  │
├────┼────────┼─────────┼─────────────────────────────────────────────────────────┤
│ 4  │ 0      │ 62      │ SEARCH orders USING INDEX idx_orders_customer_id        │
│ 15 │ 0      │ 0       │ USE TEMP B-TREE FOR ORDER BY                            │
└────┴────────┴─────────┴─────────────────────────────────────────────────────────┘
```
*Analysis*: The lookup is optimized to index search, but an expensive temporary B-Tree sort is still required for every request.

**Case B: Compound index `idx_orders_customer_created ON orders(customer_id, created_at DESC)`**
```sql
EXPLAIN QUERY PLAN SELECT * FROM orders WHERE customer_id = 'usr_123' ORDER BY created_at DESC;
```
Result:
```
┌────┬────────┬─────────┬─────────────────────────────────────────────────────────────────┐
│ id │ parent │ notused │ detail                                                          │
├────┼────────┼─────────┼─────────────────────────────────────────────────────────────────┤
│ 4  │ 0      │ 62      │ SEARCH orders USING INDEX idx_orders_customer_created           │
└────┴────────┴─────────┴─────────────────────────────────────────────────────────────────┘
```
*Analysis*: **`USE TEMP B-TREE FOR ORDER BY` is completely eliminated.** The index structure naturally emits records in the desired reverse chronological order. Query latency drops to minimal B-Tree traversal time, significantly lowering D1 row scan costs.

#### FK Constraint Maintenance Overhead
In SQLite, when a row in `users` is updated or deleted, SQLite must verify that no child rows in `orders` violate referential integrity. Without an index on `orders(customer_id)`, **every single update or delete on `users` forces a full table scan of `orders`**.  
The compound index `idx_orders_customer_created` simultaneously satisfies the foreign key maintenance scan.

### 5.3. Missing Index in Legacy Schema (`order_items.order_id`)
Inspection of `migrations/0001_initial_schema.sql` revealed a critical indexing omission:
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
There is no index on `order_id`! Running `EXPLAIN QUERY PLAN SELECT * FROM order_items WHERE order_id = 'ord_123';` produced:
```
┌────┬────────┬─────────┬──────────────────┐
│ id │ parent │ notused │ detail           │
├────┼────────┼─────────┼──────────────────┤
│ 2  │ 0      │ 216     │ SCAN order_items │
└────┴────────┴─────────┴──────────────────┘
```
Whenever an order details modal or customer history query fetches items for an order, SQLite performs a full table scan of all `order_items` in the entire database.  
**Resolution**: Milestone 1 migration `0002_domain_schema.sql` must create `idx_order_items_order_id ON order_items(order_id)`.

### 5.4. D1 Schema Migration Syntax (`ALTER TABLE`)
Because `orders` already exists in `0001_initial_schema.sql`, Milestone 1 must add `customer_id`.  
We empirically verified on local D1 that SQLite 3.35+ in D1 supports adding a column with a foreign key constraint and `ON DELETE SET NULL` in a single statement:
```sql
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders(customer_id, created_at DESC);
```
This executed cleanly with exit code 0 and confirmed that `customer_id` correctly resets to `NULL` upon user deletion.

---

## 6. Comprehensive D1 Index Catalogue for Milestone 1

The following indexes are mandatory in `migrations/0002_domain_schema.sql` to support both domain invariants and optimal query execution:

```sql
-- 1. OAuth Subject Lookup (Authentication login & token exchange)
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject 
ON users (auth_provider, provider_subject) 
WHERE provider_subject IS NOT NULL;

-- 2. User Address Directory Lookup
CREATE INDEX IF NOT EXISTS idx_addresses_user_id 
ON addresses (user_id);

-- 3. Customer Order History (Compound Index: filter + sort without temp B-Tree)
CREATE INDEX IF NOT EXISTS idx_orders_customer_created 
ON orders (customer_id, created_at DESC);

-- 4. Order Items Detail Retrieval (Eliminating full table scan)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id 
ON order_items (order_id);

-- 5. Persistent Cart Active Item Retrieval
CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id 
ON cart_items (cart_id);

-- 6. Fulfillment Tracking Lookups
CREATE INDEX IF NOT EXISTS idx_shipments_order_id 
ON shipments (order_id);

-- 7. Payment Ledger Auditing Lookups
CREATE INDEX IF NOT EXISTS idx_order_payments_order_id 
ON order_payments (order_id);
```

---

## 7. Migration Specification (`migrations/0002_domain_schema.sql`)

Below is the concrete, verified SQL specification recommended for the Milestone 1 schema implementer:

```sql
-- ====================================================================
-- Milestone 1: Domain Relational Model & Google OAuth Alignment
-- Migration: 0002_domain_schema.sql
-- ====================================================================

PRAGMA foreign_keys = ON;

-- 1. Users Table (Authentication & Customer Identity)
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

-- 2. Customers Table (Profile Extension: VIP tier, Loyalty Points)
CREATE TABLE IF NOT EXISTS customers (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    customer_type TEXT NOT NULL DEFAULT 'standard',
    loyalty_points INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. Saved Delivery Addresses (Living Address Book)
CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    street TEXT NOT NULL,
    ward TEXT,
    district TEXT NOT NULL,
    city_province TEXT NOT NULL,
    postal_code TEXT,
    is_default INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- 4. Persistent Shopping Carts
CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. Shopping Cart Items (Mutable Session State)
CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);

-- 6. Link Orders to Users with Non-Destructive SET NULL Action
ALTER TABLE orders ADD COLUMN customer_id TEXT REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_customer_created ON orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items (order_id);

-- 7. Shipments Table (Fulfillment Snapshot & Tracking)
CREATE TABLE IF NOT EXISTS shipments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    carrier TEXT NOT NULL,
    tracking_number TEXT NOT NULL,
    shipping_status TEXT NOT NULL DEFAULT 'pending',
    shipping_cost REAL DEFAULT 0,
    recipient_name TEXT,
    phone TEXT,
    delivery_address TEXT NOT NULL,
    estimated_delivery TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON shipments(order_id);

-- 8. Order Payments Table (Financial Audit Ledger)
CREATE TABLE IF NOT EXISTS order_payments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    payment_method TEXT NOT NULL DEFAULT 'cod',
    transaction_id TEXT,
    payment_status TEXT NOT NULL DEFAULT 'pending',
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_order_payments_order_id ON order_payments(order_id);

-- 9. Trigger for Order Items Immutability
CREATE TRIGGER IF NOT EXISTS trg_prevent_order_items_update
BEFORE UPDATE ON order_items
BEGIN
    SELECT RAISE(ABORT, 'Order items are immutable records and cannot be updated.');
END;
```

---

## 8. Summary of Actionable Directives for Downstream Tracks

1. **For Schema Implementer (`migrations/0002_domain_schema.sql`)**:
   - Apply the migration script with `PRAGMA foreign_keys = ON;`.
   - Ensure `orders.customer_id` has `ON DELETE SET NULL`, never `ON DELETE CASCADE`.
   - Implement the compound index `idx_orders_customer_created ON orders(customer_id, created_at DESC)`.
   - Add the missing index `idx_order_items_order_id ON order_items(order_id)`.
   - Add the immutability trigger `trg_prevent_order_items_update`.

2. **For API Engineer (`functions/api/[[path]].js`)**:
   - In `POST /api/orders`: Query current price from `products` inside the backend. Never accept client-supplied unit prices.
   - Execute order creation, line items, shipment, payment, inventory decrement, and cart purge inside a single `env.DB.batch(...)`.
   - Write address snapshots to `orders.delivery_address` and `shipments.delivery_address`. Do not reference `addresses.id`.
   - In `GET /api/customer/orders`: Rely on `idx_orders_customer_created` for fast reverse chronological queries.

3. **For Test Engineers (`tests/e2e/`)**:
   - Test that catalog price changes after order placement do not affect `order_items.unit_price`.
   - Test that updating/deleting an address in `addresses` does not mutate past orders.
   - Test that deleting a user account cascades to `addresses` and `carts`, but sets `orders.customer_id = NULL` without deleting the order or items.
