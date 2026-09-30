## 2026-09-29T16:57:19Z
You are an Explorer designing the Persistent Cart and Address Book APIs for Milestone 3.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_cart_addr
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read current Pages Functions code at: /Users/nhaterik/CloudflareProjects/Furproject/functions/api/[[path]].js
Read migration schema at: /Users/nhaterik/CloudflareProjects/Furproject/migrations/0002_domain_schema.sql
Read E2E tests at: /Users/nhaterik/CloudflareProjects/Furproject/tests/e2e/tier1_feature.test.mjs

Task:
Design the implementation plan for:
1. Persistent Cart Endpoints:
   - `GET /api/cart`: Authenticated endpoint. Fetches user's cart from `carts`, joins `cart_items` with `products` table to return current catalog titles, prices, images: `{ items: [ { id, product_id, title, current_price, image_url, quantity } ] }`. Returns 401 if unauthenticated.
   - `POST /api/cart/items`: Body `{ product_id, quantity }`. Upserts item into `cart_items` (increments quantity if already in cart). Validates `quantity > 0` and product exists in `products`.
   - `PUT /api/cart/items/:id`: Body `{ quantity }`. Updates quantity. If `quantity <= 0`, removes item or returns error.
   - `DELETE /api/cart/items/:id`: Removes item from cart.
   - `DELETE /api/cart`: Clears all items in user's cart.
2. Address Book Endpoints:
   - `GET /api/customer/addresses`: Returns saved addresses for authenticated user from `addresses` table, ordered by `is_default DESC, created_at DESC`. Returns 401 if unauthenticated.
   - `POST /api/customer/addresses`: Creates new address. Body `{ recipient_name, phone, street, ward, district, city_province, postal_code, is_default }`. If `is_default === 1`, clears previous default for this user.
   - `PUT /api/customer/addresses/:id/default`: Sets address as default for user, unsets other addresses as default.
   - `DELETE /api/customer/addresses/:id`: Deletes address ensuring it belongs to authenticated user.

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m3_cart_addr/cart_and_address_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
