## 2026-09-29T17:34:36Z
You are a Worker implementing Milestone 4: Storefront UI & Client Flow Integration for Furproject.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m4_ui
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219

Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read Explorer Plans:
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_auth_ui/auth_ui_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_cart_ui/cart_checkout_plan.md
- /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_orders_addr_ui/orders_and_address_ui_plan.md

File Ownership:
You have exclusive write ownership of:
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/AuthModal.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/Header.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/CartDrawer.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/OrderHistoryModal.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/AddressBookModal.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/components/OrderTrackModal.jsx
- /Users/nhaterik/CloudflareProjects/Furproject/src/App.jsx
Do not modify any other files.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Task:
Implement the complete storefront UI integration as designed in the explorer plans:

1. `src/components/AuthModal.jsx`:
   - Add a prominent Google OAuth sign-in button linking or navigating to `/api/auth/google` (e.g. `<a href="/api/auth/google">` or button with `window.location.href = '/api/auth/google'`) with Google icon.
   - Retain existing mock login and email form as developer fallback.

2. `src/components/Header.jsx`:
   - On mount (`useEffect`), fetch `GET /api/auth/me`. If authenticated, set `currentUser` and call `onUpdateUser(data.user)`.
   - If authenticated, display user avatar (or initials fallback) and display name.
   - Clicking user avatar toggles an account dropdown menu with:
     * "Lịch Sử Đơn Hàng" (triggers `onOpenOrderHistory`)
     * "Sổ Địa Chỉ Giao Hàng" (triggers `onOpenAddressBook`)
     * "Tra Cứu Vận Đơn" (triggers `onOpenTracker`)
     * "Đăng Xuất" calling `POST /api/auth/logout`, clearing local user state, and reloading or resetting session.
     * MUST satisfy test `T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout`!
   - If unauthenticated, display "Đăng nhập" button opening `AuthModal`.

3. `src/components/CartDrawer.jsx`:
   - Accept `user` / `currentUser` prop.
   - When opened and user is authenticated, fetch `GET /api/customer/addresses`.
   - Prefill recipient name, email, phone, and formatted default address into the checkout form.
   - Provide an address selection dropdown allowing the user to select from their saved addresses or choose "Nhập địa chỉ mới" (guest/manual fallback).
   - In order placement (`POST /api/orders`), send flat fields:
     `{ customer_name, customer_email, customer_phone, delivery_address, has_freight_elevator, floor_number, payment_method, notes, freight_surcharge, items: cart.map(i => ({ product_id: i.id, quantity: i.quantity })) }`.
   - On success, call `onOrderSuccess`, clear local cart state, and transition to order confirmation view with link to `OrderTrackModal`.

4. `src/components/OrderHistoryModal.jsx`:
   - Create component that accepts `{ isOpen, onClose, onTrackOrder }`.
   - When opened, fetches `GET /api/customer/orders` (credentials: 'include').
   - Displays past orders with order ID, date, status, tracking code, frozen line items (`unit_price * quantity`), shipping details, and payment method.
   - Provides "Theo Dõi Đơn Hàng" button that calls `onTrackOrder(order.tracking_code)`.

5. `src/components/AddressBookModal.jsx`:
   - Create component that accepts `{ isOpen, onClose }`.
   - When opened, fetches `GET /api/customer/addresses`.
   - Renders saved address cards with default badge.
   - Form to add new address (`POST /api/customer/addresses`).
   - Actions to set default (`PUT /api/customer/addresses/:id/default`) and delete address (`DELETE /api/customer/addresses/:id`).

6. `src/components/OrderTrackModal.jsx`:
   - Accept `initialTrackingCode` prop. When provided and modal opens, set tracking input and automatically perform lookup.

7. `src/App.jsx`:
   - Add state: `isOrderHistoryOpen`, `isAddressBookOpen`, `trackingCodeToView`.
   - In `Header`, pass `onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}`, `onOpenAddressBook={() => setIsAddressBookOpen(true)}`.
   - In `CartDrawer`, pass `user={currentUser}`, `onOrderSuccess={...}`.
   - Render `OrderHistoryModal` and `AddressBookModal`.
   - Render `OrderTrackModal` passing `initialTrackingCode={trackingCodeToView}`.

Verification:
Execute the following verification commands:
- `node tests/e2e/runner.mjs --tier=1` (100% of 65 tests must pass, especially F12 & F13)
- `node tests/e2e/runner.mjs --tier=2` (100% of 66 tests must pass)
- `node tests/e2e/runner.mjs --tier=3` (100% of 15 tests must pass)
- `node tests/e2e/runner.mjs --tier=4` (100% of 7 tests must pass)
- `npm run build` (must compile cleanly with zero errors)

Deliverables:
Write handoff.md in your working directory (/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/worker_m4_ui/handoff.md) documenting:
- Exact component changes and new files created
- Test execution outputs
- Production build status
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
