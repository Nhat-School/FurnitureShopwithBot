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
