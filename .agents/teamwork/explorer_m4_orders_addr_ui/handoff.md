# Handoff Report: Order History & Address Management UI Architecture (Milestone 4)

**Agent**: Explorer (`explorer_m4_orders_addr_ui`)  
**Parent Agent**: Orchestrator (`2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`)  
**Date**: 2026-09-30  
**Artifact**: `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_orders_addr_ui/orders_and_address_ui_plan.md`  

---

## 1. Observation

1. **Test Suite Analysis (`tests/e2e/tier1_feature.test.mjs`)**:
   - Running `node tests/e2e/tier1_feature.test.mjs` resulted in 64 passed, 1 failed:
     ```
     FAIL 1 out of 65 test cases failed (843.9ms).
     1. [Tier 1] F12: Storefront Auth UI > T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout
        AssertionError [ERR_ASSERTION]: Header.jsx must support sign-out functionality
         at Object.fn (file:///Users/nhaterik/CloudflareProjects/FurProject/tests/e2e/tier1_feature.test.mjs:863:14)
     ```
   - Inspection of `src/components/Header.jsx` lines 122–149 showed that `currentUser` was rendered as a static card with `onClick={onOpenAuth}` rather than a dropdown menu with sign-out capability calling `/api/auth/logout`.
   - Inspection of `tests/e2e/tier2_boundary.test.mjs`, `tests/e2e/tier3_cross_feature.test.mjs`, and `tests/e2e/tier4_real_world.test.mjs` showed 100% pass rates across all 88 combined backend and journey test cases.

2. **Backend API Implementation in `functions/api/[[path]].js`**:
   - `GET /api/customer/orders` (lines 1470–1558) extracts user ID from verified session cookies, joins `orders`, `order_items`, `shipments`, and `order_payments`, and returns:
     ```json
     {
       "orders": [
         {
           "id": "...", "customer_id": "...", "customer_name": "...", "delivery_address": "...",
           "subtotal": 14500000, "freight_surcharge": 150000, "total_amount": 14650000, "totalAmount": 14650000,
           "status": "Paid", "tracking_code": "ABC-VN-...", "payment_method": "cod",
           "items": [ { "id": "...", "title": "...", "quantity": 1, "unit_price": 14500000, "subtotal": 14500000, "image_url": "..." } ],
           "shipment": { "carrier": "...", "tracking_number": "...", "shipping_status": "in_transit", "shipping_cost": 150000 },
           "payment": { "payment_method": "cod", "payment_status": "pending", "amount": 14650000 }
         }
       ]
     }
     ```
   - `/api/customer/addresses` (lines 1299–1465) implements:
     - `GET /api/customer/addresses` -> returns `{ addresses: [...] }` sorted by `is_default DESC, created_at DESC`.
     - `POST /api/customer/addresses` -> validates `recipient_name`, `phone`, `street`, `city_province`, unsets previous default if `is_default=1`, and inserts address.
     - `PUT /api/customer/addresses/:id/default` -> sets target address `is_default = 1` and all others to `0`.
     - `DELETE /api/customer/addresses/:id` -> removes address belonging to authenticated user.

3. **Existing Storefront Modals & Patterns (`src/components/`, `src/App.jsx`)**:
   - `OrderTrackModal.jsx` takes `{ isOpen, onClose }` and handles tracking queries with warm neutral palette (`#2D241E`, `#582F0E`, `#FAF8F5`).
   - `ProductCard.jsx` exports `formatVND(amount)` formatting numbers as Vietnamese Dong currency (`14.500.000 ₫`).
   - `src/App.jsx` handles state for `isAuthOpen`, `isAdminOpen`, `isTrackerOpen`, `isCartOpen`, `currentUser`, and `products`.
   - `npm run build` compiles cleanly with zero bundler errors.

---

## 2. Logic Chain

1. **Root Cause of Test T1.F12.3 Failure & UI Requirement Alignment**:
   - Observation: Test `T1.F12.3` fails because `Header.jsx` does not contain a sign-out action invoking `/api/auth/logout`.
   - Observation: Milestone 4 requires wiring customer actions (`OrderHistoryModal` and `AddressBookModal`) into the user navigation interface.
   - Inference: Upgrading the `currentUser` avatar in `Header.jsx` into an interactive dropdown containing:
     1. "Lịch Sử Đơn Hàng" (`onOpenOrderHistory`)
     2. "Sổ Địa Chỉ Giao Hàng" (`onOpenAddressBook`)
     3. "Tra Cứu Vận Đơn" (`onOpenTracker`)
     4. "Thông Tin Tài Khoản" (`onOpenAuth`)
     5. "Đăng Xuất (Sign out)" calling `fetch('/api/auth/logout', { method: 'POST' })`
     simultaneously fulfills the user story and turns `T1.F12.3` from FAIL to PASS.

2. **Price Immutability in Order History UI**:
   - Observation: `GET /api/customer/orders` returns `order_items` with `unit_price` locked at checkout time from Cloudflare D1.
   - Inference: `OrderHistoryModal.jsx` should explicitly render the frozen `unit_price`, line quantity, and subtotal (`unit_price * quantity`) along with bulky freight fees and elevator/stair details, guaranteeing customers have full visibility into their historical purchases regardless of future catalog price changes.

3. **Tracking Integration Workflow**:
   - Observation: `OrderTrackModal.jsx` currently defaults to hardcoded code `'ABC-VN-83921'` if unparameterized.
   - Inference: Adding `initialTrackingCode` prop to `OrderTrackModal.jsx` and passing it via `handleOpenTracker(code)` from `App.jsx` allows customers in `OrderHistoryModal.jsx` to click "Theo Dõi Vận Đơn" on any order card and immediately see that order's real-time shipment status without manually retyping the tracking number.

---

## 3. Caveats

1. **Guest Checkout Linkage**: Orders placed while unauthenticated (guest orders) have `customer_id = NULL` in D1 and will not appear in `GET /api/customer/orders`. Guest customers must use the tracking code directly in `OrderTrackModal`.
2. **Session Cookies on Cross-Origin / Dev Preview**: Authentication relies on the HttpOnly `fur_session` cookie; requests from the frontend to Pages Functions must specify `credentials: 'include'`.
3. **Responsive Viewport**: On very small mobile screens (< 360px), modal containers should maintain `overflow-y-auto` and `max-h-[90vh]` to prevent viewport clipping.

---

## 4. Conclusion

The architectural design and complete production code drafts are ready in:
`/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_orders_addr_ui/orders_and_address_ui_plan.md`

Summary of deliverables designed:
- **`src/components/OrderHistoryModal.jsx`**: Complete modal fetching `GET /api/customer/orders`, displaying frozen line items, status badges, freight calculations, and 1-click tracking handover.
- **`src/components/AddressBookModal.jsx`**: Address manager with list view, default badges, add address form with validation, default toggle (`PUT /default`), and deletion (`DELETE /:id`).
- **`src/components/Header.jsx`**: Interactive dropdown menu with customer details, order history trigger, address book trigger, and sign-out action calling `/api/auth/logout` (fixes test `T1.F12.3`).
- **`src/components/OrderTrackModal.jsx`**: Parameterized tracking lookup accepting `initialTrackingCode`.
- **`src/App.jsx`**: State wiring for modals, session restoration on mount via `GET /api/auth/me`, and seamless modal transitions.

---

## 5. Verification Method

To verify the implementation once applied:
1. **Compilation Check**:
   ```bash
   npm run build
   ```
   Must output `dist/` with 0 warnings/errors.

2. **Feature Coverage Test Suite (Tier 1)**:
   ```bash
   node tests/e2e/tier1_feature.test.mjs
   ```
   Expected result: 65 passed out of 65 tests (100.0% pass rate, resolving `T1.F12.3`).

3. **Regression Test Suites (Tiers 2, 3, 4)**:
   ```bash
   node tests/e2e/tier2_boundary.test.mjs
   node tests/e2e/tier3_cross_feature.test.mjs
   node tests/e2e/tier4_real_world.test.mjs
   ```
   Expected result: All 88 test cases pass without regressions.
