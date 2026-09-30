## 2026-09-29T17:06:10Z

You are a Worker implementing Milestone 3: Domain APIs, Persistent Cart & Immutability for Furproject.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m3_domain
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219

Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read TEST_READY.md at: /Users/nhaterik/CloudflareProjects/Furproject/TEST_READY.md
Read Explorer Plans:
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_cart_addr/cart_and_address_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_checkout/checkout_immutability_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_orders_test/order_history_and_testing_plan.md
Read current Pages Functions code at: /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js

File Ownership:
You have exclusive write ownership of:
- /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js
Do not modify other files in this milestone.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
Integrate and implement the complete Domain API specifications into `/Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js`:

1. Persistent Cart Endpoints:
   - `GET /api/cart`: Authenticated endpoint via `getAuthenticatedUser(request, env)`. Return 401 if unauthenticated. Ensure user exists in `users` (`INSERT OR IGNORE INTO users (id, email) VALUES (?, ?)`). Ensure active cart in `carts`. Join `cart_items` with `products` (`SELECT ci.id, ci.product_id, ci.quantity, p.name as title, p.price as current_price, p.image_url FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.cart_id = ?`). Return `{ items: [...] }`.
   - `POST /api/cart/items`: Validate `product_id` and integer `quantity > 0` (return 400 if invalid/non-positive/non-numeric). Check product exists in `products` (return 404 if not found). Upsert into `cart_items` (increment quantity if (cart_id, product_id) already exists). Return 200/201 `{ success: true, item: {...} }`.
   - `PUT /api/cart/items/:id`: Validate integer `quantity > 0` (return 400 if invalid/zero/negative). Check item belongs to user's cart (return 404 if not found in user's cart). Update quantity. Return 200 `{ success: true, item: {...} }`.
   - `DELETE /api/cart/items/:id`: Check item belongs to user's cart (return 404 if not found in user's cart). Delete from `cart_items`. Return 200 `{ success: true }`.
   - `DELETE /api/cart`: Clear all items in user's cart (`DELETE FROM cart_items WHERE cart_id = ?`). Return 200 `{ success: true }`.

2. Customer Address Book Endpoints:
   - `GET /api/customer/addresses`: Authenticated endpoint (401 if unauthenticated). Fetch addresses for `user_id` from `addresses` table, ordered by `is_default DESC, created_at DESC`. Return `{ addresses: [...] }`.
   - `POST /api/customer/addresses`: Authenticated endpoint (401 if unauthenticated). Validate required fields (`recipient_name`, `phone`, `street`, `district`, `city_province`) returning 400 if missing or empty. If `is_default` is 1/true, reset any existing defaults for this user (`UPDATE addresses SET is_default = 0 WHERE user_id = ?`). Insert address into `addresses`. Return 201 `{ success: true, address: {...} }`.
   - `PUT /api/customer/addresses/:id/default`: Authenticated endpoint. Check address belongs to `user_id` (return 404 if not found). Reset prior defaults and set `is_default = 1` for this address. Return 200 `{ success: true }`.
   - `PUT /api/customer/addresses/:id`: Authenticated endpoint. Validate ownership (404 if not found). Update fields. Return 200 `{ success: true, address: {...} }`.
   - `DELETE /api/customer/addresses/:id`: Authenticated endpoint. Validate ownership (404 if not found). Delete from `addresses`. Return 200 `{ success: true }`.

3. Transactional Checkout with Strict Price Immutability (`POST /api/orders`):
   - Wrap `request.json()` in try/catch to return 400 on malformed syntax or missing body.
   - Validate required fields: `customer_name`, `customer_email`, `customer_phone`, `delivery_address`, and non-empty `items` array. Every item must have valid `product_id` and positive integer `quantity > 0`. Return 400 on validation failure.
   - Query each item from `products` table in D1: `SELECT id, name, price, stock FROM products WHERE id = ?`. Return 400/404 if not found.
   - STRICT PRICE IMMUTABILITY: Ignore client-supplied `price`, `unit_price`, or `total_amount`. Calculate each line price from catalog: `unit_price = product.price`, `subtotal = sum(unit_price * quantity)`. `total_amount = subtotal + (freight_surcharge || 0)`.
   - Authenticated vs Guest: Check `getAuthenticatedUser(request, env)`. If authenticated, `customer_id = user.id` and ensure user exists in `users` (`INSERT OR IGNORE INTO users ...`). If unauthenticated, `customer_id = null`.
   - Generate order ID `ord_${Date.now()}_...` and tracking code `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`.
   - Atomic `env.DB.batch([...])`:
     1. Insert `orders` (id, customer_id, customer_name, customer_email, customer_phone, delivery_address, has_freight_elevator, floor_number, subtotal, freight_surcharge, total_amount, status, tracking_code, payment_method, notes)
     2. Insert `order_items` (id, order_id, product_id, quantity, unit_price) for each item
     3. Insert `shipments` (id, order_id, carrier, tracking_number, shipping_status, shipping_cost, recipient_name, phone, delivery_address, estimated_delivery) with frozen address snapshot and carrier 'ABC Bulky Logistics'
     4. Insert `order_payments` (id, order_id, payment_method, transaction_id, payment_status, amount) with payment method (default 'cod'), amount = total_amount, status = 'pending'
     5. If authenticated, purge cart items: `DELETE FROM cart_items WHERE cart_id = (SELECT id FROM carts WHERE user_id = ?)`
   - Execute batch. Return 201/200 `{ success: true, order: { id, customer_id, customer_name, total_amount, status, tracking_code, items: [...], shipment: {...}, payment: {...} } }`.

4. Customer Order History (`GET /api/customer/orders`):
   - Authenticated endpoint (401 `{ orders: null, error: 'Unauthorized' }` if unauthenticated).
   - Query orders `WHERE customer_id = user.id`. Enforce strict tenant isolation!
   - Sort by `ORDER BY o.created_at DESC, o.rowid DESC` (crucial for deterministic order in rapid successive orders test T3.11).
   - For each order, include nested items (with frozen `unit_price`, title from products), shipment (`delivery_address`), and payment.
   - Return 200 `{ orders: [...] }`.

5. Public Order Tracking (`GET /api/orders/:trackingCode`):
   - Query `orders` joined with `shipments` by `tracking_code`, `tracking_number`, or `order_id`.
   - Return 404 if not found.
   - Return structured payload matching `OrderTrackModal.jsx`: `{ trackingCode, status, carrier, estimatedDelivery, timeline: [...] }`.

Verification:
Execute the following commands and confirm all tests pass:
- `node tests/e2e/runner.mjs --tier=1 --grep="F9|F10|F11"`
- `node tests/e2e/runner.mjs --tier=2 --grep="B3|B4|B5|B6|B7|B8|B9|B10"`
- `node tests/e2e/runner.mjs --tier=3`
- `node tests/e2e/runner.mjs --tier=4`
- `npm run build`

Deliverables:
Write handoff.md in your working directory (/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m3_domain/handoff.md) documenting:
- Exact changes applied to `functions/api/[[path]].js`
- Test commands executed and results
- Production build status
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
