# Comprehensive Gap Analysis & Architecture Report: Furproject (ABC Furniture)

**Author:** Teamwork Explorer  
**Date:** 2026-09-29  
**Target Repository:** `/Users/nhaterik/CloudflareProjects/Furproject`  
**Reference Standards:**
1. Google OAuth & Session Pattern: `/Users/nhaterik/CloudflareProjects/FlashCardWeb`
2. Domain Model & Relational Schema: `/Users/nhaterik/lastyear/thietkehethong` (`A03_03_nhatpv.0741.docx`, `PVNHAT`)
3. Original Request: `.agents/teamwork/ORIGINAL_REQUEST.md`

---

## 1. Executive Summary

Furproject ("ABC Furniture") is currently structured as a single-page React 19 application built with Vite 6 and Tailwind CSS v4, deployed onto Cloudflare Pages with Pages Functions acting as the serverless backend.

While the existing implementation provides an interactive storefront (2D spatial room planner, AI consultant with Workers AI, bulky freight logistics calculation, and product browsing), the core e-commerce transactional loop and authentication mechanisms are largely simulated:
- **Authentication**: Currently relies on client-side simulation and mock state saved in `localStorage`. There is no real Google OAuth 2.0 PKCE flow, no secure HttpOnly session cookies, and `GET /api/auth/me` returns a hardcoded administrator profile.
- **Database Schema**: Cloudflare D1 holds only `0001_initial_schema.sql` (categories, products, unlinked orders, order_items, inventory_logs, reviews). Tables for customers, structured names, addresses, persistent carts, cart items, shipments, and payment transactions are completely absent.
- **Order Placement**: `POST /api/orders` returns an in-memory mock JSON response without writing to the D1 database. Checkout does not link to authenticated users or save addresses, and orders do not enforce price immutability from a persisted cart.
- **Frontend Integration**: `AuthModal` provides simulated 1-click role toggling; `Header` lacks account menus for profile management or order history; and no order history or saved address interfaces exist.

---

## 2. Repository Anatomy & Technology Stack

### 2.1 File & Directory Layout
```
/Users/nhaterik/CloudflareProjects/Furproject/
├── .env                  # Account ID and API token (local only)
├── .env.example          # Missing OAuth credentials
├── wrangler.toml         # Cloudflare Pages, D1, R2, AI bindings
├── package.json          # Vite + React 19 + Tailwind v4 + lucide-react
├── migrations/
│   └── 0001_initial_schema.sql  # Initial schema with catalog & seed data
├── functions/
│   └── api/
│       └── [[path]].js   # Monolithic catch-all Cloudflare Pages Function
├── src/
│   ├── main.jsx          # React 19 DOM entry point
│   ├── App.jsx           # Monolithic page & state coordinator
│   ├── index.css         # Tailwind v4 import rules
│   └── components/
│       ├── Header.jsx             # Top bar, search, mode triggers, avatar
│       ├── Footer.jsx             # Static footer
│       ├── ProductCard.jsx        # Grid card with dimensions & cart actions
│       ├── ProductDetailModal.jsx # Detailed spec & dimension popup
│       ├── CartDrawer.jsx         # Ephemeral cart drawer & bulky freight calculation
│       ├── AuthModal.jsx          # Mock/simulated authentication dialog
│       ├── AdminProductModal.jsx  # D1 & R2 product creation/deletion dialog
│       ├── SpatialRoomPlanner.jsx # 2D canvas room layout simulator
│       ├── AIConsultantModal.jsx  # Workers AI LLaMA-3.1 chat assistant
│       └── OrderTrackModal.jsx    # Tracking code status query modal
└── dist/                 # Production build target
```

### 2.2 Dependencies & Build Configuration (`package.json`)
```json
{
  "name": "aifurniture",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "deploy": "npm run build && wrangler pages deploy dist --project-name=aifurniture"
  },
  "dependencies": {
    "lucide-react": "^1.16.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@tailwindcss/vite": "^4.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "tailwindcss": "^4.0.0",
    "vite": "^6.2.0",
    "wrangler": "^3.114.0"
  }
}
```
**Key Observations:**
- Build verification: `npm run build` runs `vite build` cleanly with 0 errors in ~619ms.
- React version: React 19.0.0.
- Bundler: Vite 6.4.3 with `@tailwindcss/vite` plugin.
- Testing libraries: None currently installed (no `vitest`, `jest`, or `@testing-library/react`).

### 2.3 Cloudflare Infrastructure Configuration (`wrangler.toml`)
- **Pages Project Name**: `aifurniture`
- **Compatibility Date**: `2026-05-20`
- **Output Directory**: `dist`
- **Bindings**:
  - `[[d1_databases]]`: `binding = "DB"`, `database_name = "furproject-db"`, `database_id = "507651c1-c120-431c-8a6f-10a2a26ecbc2"`.
  - `[[r2_buckets]]`: `binding = "R2_ASSETS"`, `bucket_name = "aifurniture-assets"`.
  - `[ai]`: `binding = "AI"`.
- **Gaps in `wrangler.toml`**:
  - Does NOT define `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, or `SESSION_SECRET` under `[vars]`.

---

## 3. Database Schema & D1 Migrations Analysis

### 3.1 Migration History
Only a single migration file exists: `migrations/0001_initial_schema.sql`.
Local execution test: `npx wrangler d1 migrations apply furproject-db --local -y` succeeded with 9 SQL statements executed.

### 3.2 Current Tables in `0001_initial_schema.sql`

| Table Name | Existing Columns | Foreign Keys | Status & Deficiencies |
| :--- | :--- | :--- | :--- |
| `categories` | `id`, `name`, `slug`, `description`, `icon`, `created_at` | None | Functional. Has seed data for living, dining, bedroom, office. |
| `products` | `id`, `sku`, `name`, `category_id`, `price`, `stock`, `safety_stock`, `width_cm`, `depth_cm`, `height_cm`, `weight_kg`, `material`, `wood_finish`, `color_palette`, `description`, `image_url`, `images`, `is_featured`, `created_at` | `category_id -> categories(id)` | Functional. 8 seeded luxury furniture items with 3D spatial dimensions. |
| `orders` | `id`, `customer_name`, `customer_email`, `customer_phone`, `delivery_address`, `has_freight_elevator`, `floor_number`, `subtotal`, `freight_surcharge`, `total_amount`, `status`, `tracking_code`, `payment_method`, `notes`, `created_at`, `updated_at` | **None** | **Critical Defect**: Lacks `customer_id` / `user_id` foreign key. Unlinked to user accounts; no way to query past orders for a logged-in user. |
| `order_items` | `id`, `order_id`, `product_id`, `quantity`, `unit_price` | `order_id -> orders(id)`, `product_id -> products(id)` | Contains `unit_price` for price capture, but backend does not write records here on checkout. |
| `inventory_logs` | `id`, `product_id`, `change_amount`, `remaining_stock`, `reason`, `staff_name`, `created_at` | `product_id -> products(id)` | Functional schema, but no automatic triggers or backend calls on checkout. |
| `reviews` | `id`, `product_id`, `customer_name`, `rating`, `dimensional_accuracy_rating`, `material_quality_rating`, `comment`, `created_at` | `product_id -> products(id)` | Functional schema. |

### 3.3 Missing Entities Required by System Domain Specification (`thietkehethong`)
1. **`users` / `customers`**: No table defined in migrations. (`functions/api/[[path]].js` has an ad-hoc inline `CREATE TABLE IF NOT EXISTS users (...)`, but it lacks auth provider columns, subject IDs, and customer profile relations).
2. **`full_names`**: In `thietkehethong`, `FullName (firstName, midName, lastName)` is a formal 1..1 composite Value Object.
3. **`addresses`**: In `thietkehethong`, `Customer (1) ── (1..*) Address (street, ward, district, city, is_default)` supports multiple delivery addresses.
4. **`carts` & `cart_items`**: Persistent shopping carts (`Customer (1) ── (0..1) Cart (1) ◆── (0..*) CartItem`). Missing entirely.
5. **`shipments` / `shipping`**: In `thietkehethong`, `Order (1) ── (1) Shipping (carrierName, trackingNumber, shippingFee, shippingStatus, estimatedDelivery)`.
6. **`payments`**: In `thietkehethong`, `Order (1) ── (1) Payment (paymentMethod, amount, paymentStatus, paymentDate, transactionId)`.

---

## 4. Backend API Endpoints Analysis (`functions/api/[[path]].js`)

Cloudflare Pages Functions handle all API requests through `functions/api/[[path]].js`. The request pipeline parses path segments via `request.url.replace(/^\/api\/?/, '').split('/')`.

### 4.1 Detailed Endpoint Audit

| Endpoint | Method | Implemented Behavior | Gaps & Deviations from Specifications |
| :--- | :--- | :--- | :--- |
| `/api/auth/google` | `GET` | **Not Implemented (404)** | Must initiate OAuth 2.0 PKCE flow: generate random `state` and `code_verifier`, calculate `code_challenge` (S256), set HttpOnly cookies, and redirect (302) to Google authorization URL. |
| `/api/auth/google` | `POST` | Accepts `{ email, name, avatar }` in JSON body. Inline-creates ad-hoc `users` table and executes `INSERT OR REPLACE INTO users`. Returns `{ success: true, user }`. | **Insecure Mock**: No token verification, no session cookie issued, relies on client claiming its identity. |
| `/api/auth/google/callback` | `GET` | **Not Implemented (404)** | Must validate `state` and `code_verifier` cookies against query parameters, exchange `code` with Google OAuth token endpoint, fetch Google UserInfo, upsert user in D1, generate HMAC-SHA256 session token, set `session_token` cookie, and redirect. |
| `/api/auth/me` | `GET` | Hardcoded stub: returns `{ user: { email: 'nhaterik@gmail.com', name: 'Nhật Erik (Admin)', role: 'admin' } }`. | Must extract `session_token` cookie, verify HMAC signature via Web Crypto, fetch current user and customer profile from D1, or return 401 if unauthenticated. |
| `/api/auth/logout` | `POST` / `GET` | **Not Implemented (404)** | Must clear session cookie (`Max-Age=0`) and invalidate session. |
| `/api/products` | `GET` | Queries D1 `products` table joined with `categories`. Supports filtering by category, search, material, max price, max width. | Works as intended. |
| `/api/products` | `POST` | Inserts new product into D1. | Works, but lacks authentication/role authorization guard (anyone can post if route is reached). |
| `/api/products/:id` | `DELETE` | Deletes product by ID from D1. | Works, but lacks authentication/role authorization guard. |
| `/api/upload` | `POST` | Uploads image to R2 (`R2_ASSETS.put`) or returns base64 fallback. | Works as intended. |
| `/api/assets/*` | `GET` | Serves binary objects from Cloudflare R2 bucket. | Works as intended. |
| `/api/ai/chat` | `POST` | Calls `@cf/meta/llama-3.1-8b-instruct` via Workers AI binding. | Works as intended. |
| `/api/ai/spatial-check`| `POST` | Calculates 2D corridor width and walkway clearances. | Works as intended. |
| `/api/ai/concept-image`| `POST` | Generates rendering via `@cf/black-forest-labs/flux-1-schnell`. | Works as intended. |
| `/api/shipping/calculate` | `POST` | Calculates bulky freight based on total volume ($m^3$) and stairs surcharge. | Works as intended. |
| `/api/orders` | `POST` | Reads JSON payload and generates random tracking code `ABC-VN-XXXXXX`. Returns `{ success: true, order: {...} }`. | **Critical Defect**: **Does NOT write to D1!** The `orders` and `order_items` tables remain empty. No customer linking, no cart clearing, no price capture. |
| `/api/orders/:trackingCode`| `GET` | Returns mock tracking JSON: `{ trackingCode, status: 'In Transit', carrier: 'ABC Bulky Logistics' }`. | Does not query D1 `orders` or `shipping`. |
| `/api/orders` (User orders)| `GET` | **Not Implemented (404)** | Required for authenticated customer order history. |
| `/api/cart` | `GET`, `POST`, `PUT`, `DELETE` | **Not Implemented (404)** | Required for persistent shopping cart (`Cart` and `CartItem`). |
| `/api/customer/addresses` | `GET`, `POST`, `DELETE` | **Not Implemented (404)** | Required for managing saved delivery addresses. |

---

## 5. Frontend Client Code Analysis (`src/`)

### 5.1 State Management Architecture
- **Global state**: All state resides directly inside `App.jsx` using `useState`:
  - `products`: Product catalog initialized from static `INITIAL_CATALOG`, updated via `/api/products`.
  - `cart`: Array of items held in memory (`setCart`). Resets on reload.
  - `currentUser`: Initialized synchronously from `localStorage.getItem('fur_user')`. If absent, defaults to `DEFAULT_ADMIN_USER` (`nhaterik@gmail.com`).
  - Modal flags: `isCartOpen`, `isPlannerOpen`, `isAIOpen`, `isTrackerOpen`, `isAuthOpen`, `isAdminOpen`.
- **State Management Deficiencies**:
  - No React Context or unified state container.
  - Cart is lost on browser refresh.
  - Authentication status is completely disconnected from real server sessions.

### 5.2 Component Audit

#### `AuthModal.jsx`
- **Location**: `src/components/AuthModal.jsx` (354 lines)
- **Current Behavior**:
  - Offers three quick-login buttons: "Nhật Erik (Admin)", "Đức Nhân (Admin)", "Khách Mua Hàng (Guest)".
  - Provides a custom email input form.
  - Submits a `POST /api/auth/google` with `{ email, name, role, avatar }`.
  - When backend responds or errors out, synthesizes a mock user object and invokes `onLoginSuccess(user)`, which writes to `localStorage`.
- **Gaps**:
  - No button or link to trigger the real Google OAuth flow (`/api/auth/google`).
  - No error handling for Google OAuth query parameters (e.g. `?auth_error=...`).
  - No UI for profile details, order history link, or address book.

#### `Header.jsx`
- **Location**: `src/components/Header.jsx` (193 lines)
- **Current Behavior**:
  - Displays sticky header with logo, search input, 2D planner button, AI assistant button, bulky order tracking button, and cart badge count.
  - If `currentUser` is present, renders their avatar, name, and role badge (Admin / Guest).
  - If `currentUser` is null, renders "Đăng Nhập" button.
- **Gaps**:
  - Clicking the user avatar simply triggers `onOpenAuth`, opening `AuthModal`.
  - No user dropdown menu for:
    - User Profile / Saved Addresses
    - Past Order History
    - Sign Out / Logout
  - Missing visual indicators for session loading / verifying state.

#### `CartDrawer.jsx`
- **Location**: `src/components/CartDrawer.jsx` (349 lines)
- **Current Behavior**:
  - Slides in from right when `isCartOpen` is true.
  - Computes subtotal, total volume ($m^3$), total weight ($kg$), base freight, and floor/elevator stairs surcharge.
  - Checkout form asks for: `customerName`, `customerPhone`, `customerAddress`, `floorNumber`, `hasFreightElevator`.
  - Submits to `POST /api/orders`.
- **Gaps**:
  - Does NOT autofill customer information from logged-in `currentUser` or saved addresses.
  - Does NOT send `customer_id` or `user_id`.
  - Does NOT interface with backend cart persistence.
  - When order succeeds, only clears in-memory `cart` array and shows a mock success screen.

#### `OrderTrackModal.jsx`
- **Location**: `src/components/OrderTrackModal.jsx` (125 lines)
- **Current Behavior**:
  - Single input field for tracking code (e.g. `ABC-VN-83921`).
  - Makes a GET request to `/api/orders/:trackingCode` and displays a hardcoded 3-step timeline.
- **Gaps**:
  - No view for authenticated users to see a list of their past placed orders with tracking links.

---

## 6. Domain Model Comparison & Gap Analysis

Based on `/Users/nhaterik/lastyear/thietkehethong` (`A03_03_nhatpv.0741.docx` and `PVNHAT` UML Class Diagrams), the e-commerce system is specified into 19 domain entities across 3 core subsystems:
1. **Phân hệ Khách hàng (Customer & Profiles)**
2. **Phân hệ Giỏ hàng & Đơn hàng (Shopping Cart & Order Fulfillment)**
3. **Phân hệ Danh mục Sản phẩm (Product Catalog)**

### 6.1 Domain Entity Gap Matrix

| Domain Entity (`thietkehethong`) | UML Association & Multiplicity | Status in Furproject Codebase | Gap Severity & Architectural Impact |
| :--- | :--- | :--- | :--- |
| **`Customer`** | Root account: `id, username/email, phone, created_at` | Completely missing in D1 migrations. (Ad-hoc `users` table created on the fly in [[path]].js). | **High**: Cannot associate addresses, orders, or carts with a customer. |
| **`FullName`** | Value Object: `Customer (1) ◆── (1) FullName (firstName, midName, lastName)` | Missing. Single unstructured `customer_name` string in orders. | **Medium**: Required to match domain model design. |
| **`Address`** | `Customer (1) ── (1..*) Address (street, ward, district, city, is_default)` | Missing in D1. Only a raw string `delivery_address` in `orders`. | **High**: Customers cannot save or reuse shipping addresses. |
| **`Cart`** | `Customer (1) ── (0..1) Cart (cartId, customerId, createdDate, totalAmount)` | Completely missing in D1. Frontend holds cart in temporary React state. | **High**: Shopping cart is volatile; shopping state is lost across sessions/devices. |
| **`CartItem`** | `Cart (1) ◆── (0..*) CartItem (cartItemId, cartId, productId, quantity, currentPrice)` | Completely missing in D1. | **High**: No backend cart item lifecycle; cannot validate stock or synchronize items. |
| **`Order`** | `Customer (1) ── (0..*) Order (orderId, customerId, orderDate, orderStatus, totalAmount)` | Table exists in `0001_initial_schema.sql`, but lacks `customer_id` FK and is not inserted into during checkout. | **Critical**: Orders are not recorded in D1 and have no relationship to customers. |
| **`OrderItem`** | `Order (1) ◆── (1..*) OrderItem (orderItemId, orderId, productId, quantity, unitPrice)` | Table exists in `0001_initial_schema.sql`, but backend `POST /api/orders` never inserts items into it. | **Critical**: Checkout does not persist items or enforce price immutability. |
| **`Shipping`** | `Order (1) ── (1) Shipping (shippingId, orderId, carrierName, trackingNumber, shippingFee, shippingStatus, estimatedDelivery)` | Missing in D1. Flattened partially into `orders` columns (`tracking_code`, `freight_surcharge`). | **Medium**: Lacks dedicated shipping tracking and status update records. |
| **`Payment`** | `Order (1) ── (1) Payment (paymentId, orderId, paymentMethod, amount, paymentStatus, paymentDate, transactionId)` | Missing in D1. Flattened partially into `orders.payment_method`. | **Medium**: Lacks payment transaction logging and auditability. |

### 6.2 CartItem vs. OrderItem Immutability Distinction
Paragraphs 108–109 of `A03_03_nhatpv.0741.docx` explicitly emphasize:
> **"CartItem != OrderItem: Cart ..> Order («creates» checkout)"**  
> - `CartItem` represents a volatile, mutable shopping intention. Its price reflects current catalog pricing and fluctuates with promotions.  
> - `OrderItem` represents an immutable legal contract created at checkout time. Its `unit_price` MUST capture the exact historical price paid, completely decoupled from any future product price changes in the catalog.

**Current codebase violation:**  
In `functions/api/[[path]].js`, `POST /api/orders` receives cart items from the client and ignores both `orders` and `order_items` tables in D1. It never executes an `INSERT INTO order_items` to lock in `unit_price`.

---

## 7. Google OAuth Pattern Gap Analysis (vs. `FlashCardWeb`)

The reference pattern in `/Users/nhaterik/CloudflareProjects/FlashCardWeb` implements a production-grade Cloudflare Pages Functions OAuth flow:

```
[User clicks 'Sign in with Google']
               │
               ▼
      GET /api/auth/google
   (Generates state & PKCE verifier)
   (Sets cookies: google_oauth_state, google_oauth_verifier)
   (Redirects 302 to accounts.google.com/o/oauth2/v2/auth)
               │
               ▼
[Google Consent & Callback to Pages Function]
               │
               ▼
   GET /api/auth/google/callback
   (Validates state & PKCE verifier cookies)
   (Exchanges code for access_token with Google token endpoint)
   (Fetches profile from www.googleapis.com/oauth2/v3/userinfo)
   (Upserts user in D1: users table)
   (Signs session token via HMAC-SHA256: Web Crypto API)
   (Sets session cookie: HttpOnly; Path=/; SameSite=Lax; Max-Age=7 days)
   (Redirects 302 to /)
               │
               ▼
        GET /api/auth/me
   (Validates session cookie signature)
   (Returns user profile JSON)
```

### 7.1 FlashCardWeb vs. Furproject Auth Comparison

| Component / Feature | FlashCardWeb Implementation | Furproject Current Implementation |
| :--- | :--- | :--- |
| **OAuth Initiation** | `GET /api/auth/google`: generates PKCE `code_verifier`, SHA-256 `code_challenge`, cryptographically random `state`, sets HttpOnly cookies scoped to callback path. | None. Only a simulated `POST /api/auth/google` accepting raw JSON from client. |
| **OAuth Callback** | `GET /api/auth/google/callback`: validates state, checks PKCE verifier, exchanges code via Google token API, fetches verified email & sub. | None. Callback route does not exist. |
| **Session Security** | Signs session token using HMAC-SHA256 (`crypto.subtle.sign`) with `SESSION_SECRET`. Scoped to `HttpOnly; SameSite=Lax; Secure`. | No session token or cookie. Relies on client storing raw JSON in `localStorage` under `fur_user`. |
| **Profile & Restoration**| `GET /api/auth/me`: decodes session token, verifies HMAC, queries user from D1. | Hardcoded stub: always returns `nhaterik@gmail.com` as Admin regardless of cookie or state. |
| **Logout** | `POST /api/auth/logout`: clears session cookie with `Max-Age=0`. | None. Frontend just deletes `fur_user` from `localStorage`. |
| **Admin Detection** | Compares Google verified email against configured admin email list (`GOOGLE_ALLOWED_EMAILS` or `ADMIN_EMAIL`). | Hardcoded in `[[path]].js` (`nhaterik@gmail.com`, `ducnhan762013@gmail.com`). |

---

## 8. Environment & Configuration Gaps

1. **`.env.example`**:
   - Current content:
     ```bash
     CLOUDFLARE_ACCOUNT_ID=your_cloudflare_account_id_here
     CLOUDFLARE_API_TOKEN=your_cloudflare_api_token_here
     ```
   - Missing required OAuth variables:
     ```bash
     GOOGLE_CLIENT_ID=your_google_client_id_here
     GOOGLE_CLIENT_SECRET=your_google_client_secret_here
     GOOGLE_REDIRECT_URI=http://localhost:5173/api/auth/google/callback
     SESSION_SECRET=a_secure_random_hmac_secret_key_at_least_32_bytes
     ```
2. **`wrangler.toml`**:
   - `[vars]` block lacks configuration for Google OAuth defaults or session secret placeholders.

---

## 9. Actionable Architecture Roadmap & Implementation Blueprint

To fully satisfy all acceptance criteria of `ORIGINAL_REQUEST.md`, the implementation plan should be organized into four cohesive phases:

```
┌────────────────────────────────────────────────────────────────────────┐
│ Phase 1: Database Migration (0002_domain_schema.sql)                  │
│ • users, customers, full_names, addresses                              │
│ • carts, cart_items                                                    │
│ • update orders (customer_id FK), order_items, shipments, payments     │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 2: Backend Pages Functions (/api/auth/* & /api/orders & /api/cart)│
│ • Web Crypto HMAC session signing & verification                       │
│ • Real Google OAuth PKCE endpoints (/api/auth/google & callback)       │
│ • /api/auth/me & /api/auth/logout with HttpOnly session cookies        │
│ • /api/cart CRUD persisting to D1                                      │
│ • /api/orders transactional checkout with price immutability           │
│ • /api/customer/orders (order history) & /api/customer/addresses       │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 3: Frontend Storefront Integration                              │
│ • Real Google Sign-in trigger in AuthModal & error banner handling     │
│ • Header user dropdown: Profile, Order History, Saved Addresses, Logout│
│ • Order History modal/drawer for authenticated users                   │
│ • Saved Delivery Addresses selector in CartDrawer checkout form        │
│ • Synchronize cart between frontend and D1 /api/cart                   │
└──────────────────────────────────┬─────────────────────────────────────┘
                                   │
┌──────────────────────────────────▼─────────────────────────────────────┐
│ Phase 4: Verification & Build Validation                              │
│ • wrangler d1 migrations apply --local                                 │
│ • Local OAuth flow verification & mock session tests                   │
│ • Price immutability verification test                                 │
│ • Clean production build (npm run build)                               │
└────────────────────────────────────────────────────────────────────────┘
```

### 9.1 Phase 1: D1 Migration Specification (`0002_domain_schema.sql`)
1. **`users`**:
   - `id TEXT PRIMARY KEY`
   - `email TEXT UNIQUE NOT NULL`
   - `display_name TEXT`
   - `avatar_url TEXT`
   - `role TEXT DEFAULT 'customer'` (or 'admin')
   - `auth_provider TEXT DEFAULT 'google'`
   - `provider_subject TEXT`
   - `created_at TEXT DEFAULT (datetime('now'))`
   - `updated_at TEXT DEFAULT (datetime('now'))`
2. **`customers`**:
   - `id TEXT PRIMARY KEY`
   - `user_id TEXT UNIQUE NOT NULL REFERENCES users(id)`
   - `phone TEXT`
   - `created_at TEXT DEFAULT (datetime('now'))`
3. **`full_names`**:
   - `id TEXT PRIMARY KEY`
   - `customer_id TEXT UNIQUE NOT NULL REFERENCES customers(id)`
   - `first_name TEXT NOT NULL`
   - `mid_name TEXT`
   - `last_name TEXT NOT NULL`
4. **`addresses`**:
   - `id TEXT PRIMARY KEY`
   - `customer_id TEXT NOT NULL REFERENCES customers(id)`
   - `street TEXT NOT NULL`
   - `ward TEXT`
   - `district TEXT`
   - `city TEXT NOT NULL`
   - `is_default INTEGER DEFAULT 0`
   - `created_at TEXT DEFAULT (datetime('now'))`
5. **`carts`**:
   - `id TEXT PRIMARY KEY`
   - `customer_id TEXT UNIQUE REFERENCES customers(id)`
   - `session_id TEXT`
   - `created_at TEXT DEFAULT (datetime('now'))`
   - `updated_at TEXT DEFAULT (datetime('now'))`
6. **`cart_items`**:
   - `id TEXT PRIMARY KEY`
   - `cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE`
   - `product_id TEXT NOT NULL REFERENCES products(id)`
   - `quantity INTEGER NOT NULL DEFAULT 1`
   - `current_price REAL NOT NULL`
   - `created_at TEXT DEFAULT (datetime('now'))`
7. **Refactor `orders`**:
   - Add `customer_id TEXT REFERENCES customers(id)`
   - Maintain `subtotal`, `freight_surcharge`, `total_amount`, `status`, `tracking_code`
8. **`shipments`**:
   - `id TEXT PRIMARY KEY`
   - `order_id TEXT UNIQUE NOT NULL REFERENCES orders(id)`
   - `carrier_name TEXT NOT NULL`
   - `tracking_number TEXT UNIQUE NOT NULL`
   - `shipping_fee REAL NOT NULL`
   - `shipping_status TEXT DEFAULT 'Processing'`
   - `has_freight_elevator INTEGER DEFAULT 1`
   - `floor_number INTEGER DEFAULT 1`
   - `estimated_delivery TEXT`
   - `created_at TEXT DEFAULT (datetime('now'))`
9. **`payments`**:
   - `id TEXT PRIMARY KEY`
   - `order_id TEXT UNIQUE NOT NULL REFERENCES orders(id)`
   - `payment_method TEXT NOT NULL` (PayCash / PayCredit)
   - `amount REAL NOT NULL`
   - `payment_status TEXT DEFAULT 'Completed'`
   - `transaction_id TEXT`
   - `created_at TEXT DEFAULT (datetime('now'))`

### 9.2 Phase 2: Pages Functions Implementation
- Adopt FlashCardWeb's HMAC-SHA256 session token logic (`signSession`, `verifySession`, `sessionCookieValue`, `redirectWithCookies`).
- Integrate real Google OAuth endpoints (`/api/auth/google`, `/api/auth/google/callback`).
- Replace stub in `/api/auth/me` with session extraction and verification.
- Implement `/api/auth/logout`.
- Implement `/api/cart` (GET, POST item, PUT quantity, DELETE item, DELETE clear).
- Rewrite `/api/orders`:
  - Enforce price immutability by copying product prices to `order_items.unit_price`.
  - Link to `customer_id` if authenticated.
  - Insert records into `orders`, `order_items`, `shipments`, and `payments` within a D1 batch transaction.
  - Clear customer's active cart.
- Implement `/api/customer/orders` to list past orders for the authenticated user.
- Implement `/api/customer/addresses` to list and add saved delivery addresses.

### 9.3 Phase 3: Storefront Integration
- **`AuthModal.jsx`**:
  - Add a prominent "Sign in with Google" button redirecting to `/api/auth/google`.
  - Maintain a clean developer/guest bypass option if desired, but default to Google OAuth.
- **`Header.jsx`**:
  - Add a user profile popover/dropdown menu displaying user avatar, name, email, role, and navigation items:
    - 📦 Đơn Hàng Của Tôi (My Orders)
    - 📍 Sổ Địa Chỉ (Saved Addresses)
    - 🚪 Đăng Xuất (Sign Out -> `/api/auth/logout`)
- **`CartDrawer.jsx`**:
  - When user is authenticated, automatically fetch saved addresses and populate the recipient form.
  - Submit `customer_id` alongside the order.
- **Order History UI**:
  - Provide a modal or slide-over where users can view their past orders, list of purchased products, unit prices at purchase, and live bulky freight tracking codes.
- **Address Management UI**:
  - Allow adding, selecting, and deleting delivery addresses (street, ward, district, city).

---

## 10. Conclusion

The current Furproject codebase has an elegant UI and functioning edge AI capabilities, but operates with simulated authentication and mock checkout logic. By applying the proven Google OAuth architecture from `FlashCardWeb` and structuring Cloudflare D1 migrations according to the 19 domain entity specifications in `thietkehethong`, Furproject will become a robust, fully-persisted, production-grade luxury e-commerce platform.
