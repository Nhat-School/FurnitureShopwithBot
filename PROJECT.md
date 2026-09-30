# Project: Furproject - Google OAuth & Domain Model Architecture Upgrade

## Architecture
Furproject is a modern furniture e-commerce web application running on Cloudflare Pages (React 19 + Vite 6 + Tailwind CSS v4 frontend) and Cloudflare Pages Functions (`functions/api/[[path]].js`) backed by Cloudflare D1 (`furproject-db`).

### Key Subsystems:
1. **Identity & Authentication**: Google OAuth 2.0 PKCE Authorization Code flow with cryptographic state & verifier verification, stateless HMAC-SHA256 signed session cookies (`fur_session`), and D1 user profile upserting.
2. **Domain Relational Model (D1)**: Schema aligned with the 19 domain entities in `thietkehethong`, separating mutable active cart items (`cart_items`) from immutable historical order items (`order_items`), with dedicated customer address books, fulfillment tracking (`shipments`), and transaction tracking (`order_payments`).
3. **Transaction & Fulfillment API**: Secure endpoints supporting persistent carts, atomic checkout with historical catalog price snapshotting, customer order history, and address book management.
4. **Storefront Client**: Interactive UI integrating Google OAuth triggers in `AuthModal`, authenticated account menu in `Header`, saved address autofill in `CartDrawer`, and authenticated order history tracking.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | F1: Users & Customer Profiles Schema | D1 migration `0002_domain_schema.sql` defining `users` table with auth fields and `customers` profile extension | M1 | ORIGINAL_REQUEST §R2, thietkehethong §2.1 |
| 2 | F2: Address Book Schema | D1 migration defining `addresses` table for customer delivery addresses with default flag | M1 | ORIGINAL_REQUEST §R2, thietkehethong §2.1 |
| 3 | F3: Persistent Cart Schema | D1 migration defining `carts` and `cart_items` for active mutable shopping carts | M1 | ORIGINAL_REQUEST §R2, thietkehethong §2.2 |
| 4 | F4: Order Customer Linkage Schema | Linking `orders` to `users`/`customers` with `customer_id` foreign key and snapshot delivery fields | M1 | ORIGINAL_REQUEST §R2, thietkehethong §3.1 |
| 5 | F5: Shipments & Payments Schema | D1 migration defining `shipments` (carrier, tracking, status, cost) and `order_payments` (method, status, amount) | M1 | ORIGINAL_REQUEST §R2, thietkehethong §2.1 |
| 6 | F6: Google OAuth 2.0 PKCE Flow | Pages Functions `/api/auth/google` and `/api/auth/google/callback` with PKCE verifier and state cookies | M2 | ORIGINAL_REQUEST §R1, FlashCardWeb |
| 7 | F7: Session Management & Logout | `/api/auth/me` with HMAC-SHA256 signed token verification, sanitized profile, and `/api/auth/logout` cookie revocation | M2 | ORIGINAL_REQUEST §R1, FlashCardWeb |
| 8 | F8: Environment Configuration | Documentation of `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`, `GOOGLE_REDIRECT_URI` in `.env.example` and wrangler config | M2 | ORIGINAL_REQUEST §R1 |
| 9 | F9: Persistent Cart APIs | `/api/cart` GET/POST/PUT/DELETE for authenticated cart persistence | M3 | ORIGINAL_REQUEST §R2, thietkehethong §2.2 |
| 10 | F10: Price Immutability Checkout API | `POST /api/orders` locking `order_items.unit_price` from `products.price` at checkout, recording shipments and payments, and clearing cart | M3 | ORIGINAL_REQUEST §R2, thietkehethong §2.2 |
| 11 | F11: Order History & Address APIs | `GET /api/customer/orders` and `/api/customer/addresses` CRUD for authenticated customers | M3 | ORIGINAL_REQUEST §R2, thietkehethong §2.1 |
| 12 | F12: Storefront Auth UI | AuthModal Google sign-in link, Header user profile avatar & dropdown, session restoration on mount | M4 | ORIGINAL_REQUEST §R3 |
| 13 | F13: Storefront Checkout & Account UI | Saved address autofill, order history viewing, and price immutability display in client UI | M4 | ORIGINAL_REQUEST §R3 |
| 14 | F14: E2E Validation & Adversarial Tests | Complete passing E2E test suite (Tiers 1-4) and adversarial coverage hardening (Tier 5) | M5 | ORIGINAL_REQUEST Acceptance Criteria |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | M1: D1 Database Schema & Migrations | Create `migrations/0002_domain_schema.sql` with tables for users, customers, addresses, carts, cart_items, shipments, order_payments, and link orders. Apply locally. | none | DONE |
| 2 | M2: Google OAuth & Session Pages Functions | Implement Web Crypto PKCE OAuth (`/api/auth/google`, `/api/auth/google/callback`), HMAC signed sessions (`/api/auth/me`, `/api/auth/logout`), and `.env.example`. | M1 | DONE |
| 3 | M3: Domain APIs, Persistent Cart & Immutability | Implement `/api/cart` endpoints, transactional `POST /api/orders` enforcing price immutability + shipments + payments, and `/api/customer/*` endpoints. | M1, M2 | DONE |
| 4 | M4: Storefront UI & Client Flow Integration | Integrate Google OAuth in `AuthModal.jsx`, user menu in `Header.jsx`, order history and address management in storefront, verified via `npm run build`. | M2, M3 | DONE |
| 5 | M5: E2E Test Suite Pass & Adversarial Hardening | Phase 1: Pass 100% of E2E tests (Tiers 1-4) [DONE]. Phase 2: Adversarial coverage hardening (Tier 5) [DONE]. | M1, M2, M3, M4, TEST_READY | DONE |

---

## Interface Contracts

### 1. Database Schema Contracts (`migrations/0002_domain_schema.sql`)
- `users`:
  `id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, auth_provider TEXT NOT NULL DEFAULT 'google', provider_subject TEXT, display_name TEXT, first_name TEXT, mid_name TEXT, last_name TEXT, phone TEXT, avatar_url TEXT, role TEXT NOT NULL DEFAULT 'customer', created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`
  `CREATE UNIQUE INDEX idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;`
- `customers`:
  `id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, customer_type TEXT NOT NULL DEFAULT 'standard', loyalty_points INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `addresses`:
  `id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_name TEXT NOT NULL, phone TEXT NOT NULL, street TEXT NOT NULL, ward TEXT, district TEXT NOT NULL, city_province TEXT NOT NULL, postal_code TEXT, is_default INTEGER DEFAULT 0, created_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `carts`:
  `id TEXT PRIMARY KEY, user_id TEXT UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `cart_items`:
  `id TEXT PRIMARY KEY, cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE, product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE, quantity INTEGER NOT NULL DEFAULT 1, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`
  `CREATE UNIQUE INDEX idx_cart_items_cart_product ON cart_items (cart_id, product_id);`
- `orders` update / linkage:
  Add `customer_id TEXT REFERENCES users(id)` column to `orders`.
- `shipments`:
  `id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE, carrier TEXT NOT NULL, tracking_number TEXT NOT NULL, shipping_status TEXT NOT NULL DEFAULT 'pending', shipping_cost REAL DEFAULT 0, recipient_name TEXT, phone TEXT, delivery_address TEXT NOT NULL, estimated_delivery DATETIME, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`
- `order_payments`:
  `id TEXT PRIMARY KEY, order_id TEXT UNIQUE NOT NULL REFERENCES orders(id) ON DELETE CASCADE, payment_method TEXT NOT NULL DEFAULT 'cod', transaction_id TEXT, payment_status TEXT NOT NULL DEFAULT 'pending', amount REAL NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP`

### 2. Auth Endpoints Contract
- `GET /api/auth/google`:
  Sets cookies `fur_google_oauth_state` (32 bytes random base64url) and `fur_google_oauth_verifier` (64 bytes random base64url, `Path=/api/auth/google/callback; HttpOnly; SameSite=Lax; Max-Age=600`).
  Redirects (302) to `https://accounts.google.com/o/oauth2/v2/auth` with `code_challenge` (S256), `client_id`, `redirect_uri`, `scope=openid email profile`.
- `GET /api/auth/google/callback`:
  Validates `state` against cookie. Exchanges `code` with Google token endpoint using `verifier`.
  Fetches userinfo. Upserts user & customer into D1.
  Issues `fur_session` cookie (`Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; Secure`), signs token with HMAC-SHA256 (`SESSION_SECRET`).
  Clears oauth cookies, redirects (302) to `/?auth=success`.
- `GET /api/auth/me`:
  Reads `fur_session` cookie. Verifies HMAC signature.
  Returns `{ user: { id, email, display_name, avatar_url, role, customer_type, loyalty_points } }`. If unauthenticated, returns 401 `{ user: null }`.
- `POST /api/auth/logout`:
  Sets `fur_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`. Returns `{ success: true }`.

### 3. Cart & Orders Immutability Contract
- `GET /api/cart`: Returns `{ items: [ { id, product_id, title, current_price, image_url, quantity } ] }`.
- `POST /api/cart/items`: Body: `{ product_id, quantity }`. Upserts into `cart_items`.
- `PUT /api/cart/items/:id`: Body: `{ quantity }`.
- `DELETE /api/cart/items/:id`: Removes item.
- `POST /api/orders`:
  Input: `{ customer_name, customer_email, customer_phone, delivery_address, items: [{ product_id, quantity }], payment_method }`.
  Behavior:
  1. For each item, queries current price from `products` table in D1: `SELECT id, price, title FROM products WHERE id = ?`.
  2. Computes total amount.
  3. Inserts into `orders (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, total_amount, status)`.
  4. Inserts into `order_items (id, order_id, product_id, quantity, unit_price)` where `unit_price` is strictly frozen from current `products.price`.
  5. Inserts into `shipments` with generated tracking code and address snapshot.
  6. Inserts into `order_payments` with method and pending status.
  7. If authenticated, deletes all items from `cart_items` for the user.
  8. Returns `{ success: true, order: { id, tracking_code, total_amount, status, items, shipment, payment } }`.
- `GET /api/customer/orders`:
  Returns past orders for authenticated user with frozen item prices and shipment tracking.
- `GET /api/customer/addresses` & `POST /api/customer/addresses`:
  Manage customer delivery addresses.

---

## Code Layout
- `migrations/0001_initial_schema.sql` (Existing D1 catalog and order schema)
- `migrations/0002_domain_schema.sql` (New domain models, auth tables, cart, fulfillment)
- `functions/api/[[path]].js` (Pages Functions routing all `/api/*` endpoints)
- `.env.example` (OAuth and session secrets documentation)
- `src/App.jsx` (Root React application, session restoration, global cart)
- `src/components/AuthModal.jsx` (Google OAuth trigger dialog)
- `src/components/Header.jsx` (Navigation, authenticated avatar and account actions)
- `src/components/CartDrawer.jsx` (Cart slide-over, checkout trigger, address selection)
- `src/components/AccountModal.jsx` or profile views (Order history and address manager)
- `tests/e2e/` (Independent E2E test suite created by E2E Testing Track)
