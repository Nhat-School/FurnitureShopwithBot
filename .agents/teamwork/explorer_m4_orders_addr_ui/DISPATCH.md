## 2026-09-29T17:30:00Z
You are an Explorer designing the Order History and Address Management UI Modals for Milestone 4.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_orders_addr_ui
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read existing modals in `/Users/nhaterik/CloudflareProjects/Furproject/src/components/`
Read App.jsx at: /Users/nhaterik/CloudflareProjects/Furproject/src/App.jsx
Read E2E tests for Storefront at: /Users/nhaterik/CloudflareProjects/Furproject/tests/e2e/tier1_feature.test.mjs (Suite F12, F13)

Task:
Design the implementation plan for:
1. Customer Order History Component/Modal (`src/components/OrderHistoryModal.jsx`):
   - Fetches `GET /api/customer/orders` when opened.
   - Displays list of past orders with order ID, date, status, tracking code, frozen line items (`unit_price * quantity`), shipping status, and payment method.
   - Provides a "Theo dõi đơn hàng" (Track Order) button that opens `OrderTrackModal` with the tracking code.
2. Customer Address Book Component/Modal (`src/components/AddressBookModal.jsx`):
   - Fetches `GET /api/customer/addresses` when opened.
   - Displays list of saved addresses with default badge.
   - Form to add new address (`POST /api/customer/addresses`).
   - Action to set address as default (`PUT /api/customer/addresses/:id/default`).
   - Action to delete address (`DELETE /api/customer/addresses/:id`).
3. Integration in `App.jsx`:
   - Wire state and triggers for opening `OrderHistoryModal` and `AddressBookModal` from the `Header` user dropdown.
4. Verify that `npm run build` compiles cleanly with zero errors.

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_orders_addr_ui/orders_and_address_ui_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
