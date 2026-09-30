## 2026-09-29T17:30:00Z
Sender: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Priority: MESSAGE_PRIORITY_HIGH

You are an Explorer designing the Storefront Cart Drawer & Checkout Integration for Milestone 4.
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_cart_ui
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read existing CartDrawer at: /Users/nhaterik/CloudflareProjects/Furproject/src/components/CartDrawer.jsx
Read App.jsx at: /Users/nhaterik/CloudflareProjects/Furproject/src/App.jsx

Task:
Design the implementation plan and drop-in code for `src/components/CartDrawer.jsx`:
1. Customer Info Autofill:
   - When user is authenticated (pass `user` prop from App/Header or query `/api/auth/me`), automatically fetch saved addresses from `GET /api/customer/addresses`.
   - Autofill customer name, email, phone, and default delivery address (`recipient_name`, `phone`, `street`, `district`, `city_province`) into the checkout form.
   - If user has multiple saved addresses, provide a dropdown or quick-select selector to switch delivery address.
2. Order Placement:
   - When placing order, submit payload to `POST /api/orders`:
     `{ customer_name, customer_email, customer_phone, delivery_address, has_freight_elevator, floor_number, payment_method, notes, items: cart.map(i => ({ product_id: i.id, quantity: i.quantity })) }`.
   - On success, clear local cart state and open order confirmation / tracking view (`OrderTrackModal.jsx`).
3. Price Display & Sync:
   - Display items, quantities, and catalog prices cleanly with bulky delivery surcharge breakdown.

Deliverables:
Write implementation plan and exact code drafts to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m4_cart_ui/cart_checkout_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
