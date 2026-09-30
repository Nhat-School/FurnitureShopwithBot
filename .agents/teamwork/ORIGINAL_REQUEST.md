# Original User Request

## Initial Request — 2026-09-29T16:13:28Z

Implement Google OAuth authentication for Furproject based on the Cloudflare Pages Functions auth pattern in FlashCardWeb, and upgrade the e-commerce system architecture and D1 database schema to align with the domain model specifications in /Users/nhaterik/lastyear/thietkehethong.

Working directory: /Users/nhaterik/CloudflareProjects/Furproject
Integrity mode: development

## Reference Material
- Google OAuth Implementation: /Users/nhaterik/CloudflareProjects/FlashCardWeb (Pages Functions endpoints in functions/api/[[path]].js, schema, cookies, session signing, and frontend auth handlers).
- E-Commerce System Analysis & Design: /Users/nhaterik/lastyear/thietkehethong (19 domain entities in A03_03_nhatpv.0741.docx and PVNHAT: Customer, FullName, Address, Cart/CartItem, Order/OrderItem immutability, Shipping, Payment).

## Requirements

### R1. Google Authentication & Session Architecture
Implement Google OAuth 2.0 sign-in and session management within Cloudflare Pages Functions, adhering to the secure cookie, state verification, and session token strategy demonstrated in FlashCardWeb. Store customer credentials and OAuth profiles in Cloudflare D1.

### R2. System Domain Model & Database Schema Alignment
Extend Cloudflare D1 migrations and API endpoints to incorporate missing domain entities identified in the system design specifications:
- Customer account profiles with structured names (FullName) and shipping addresses (Address).
- Cart persistence distinguishing mutable shopping cart items (CartItem) from immutable placed orders (OrderItem preserving historical unit prices at checkout).
- Shipping details (carrier, tracking, shipping status) and payment tracking (method, transaction status).

### R3. User Interface & Checkout Integration
Integrate the authentication flow and domain enhancements into the React storefront:
- Enable Google OAuth sign-in via the existing AuthModal dialog.
- Reflect user authentication state across the application (header avatar/profile menu, session restoration on reload, sign out).
- Link cart checkout and order history directly to authenticated user profiles while allowing guest checkout fallback if needed.

## Acceptance Criteria

### Authentication & Session Management
- [ ] Endpoint /api/auth/google initiates OAuth 2.0 flow with state parameter, and /api/auth/google/callback validates authorization, upserts the user in D1, and sets a secure HttpOnly session cookie.
- [ ] Endpoint /api/auth/me returns current authenticated user profile (id, email, display_name, avatar, role), and /api/auth/logout revokes session and clears auth cookies.
- [ ] Google OAuth environment configuration (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI) is documented in .env.example and supported in Pages Functions.

### Domain Model & D1 Persistence
- [ ] New D1 database migration file added to migrations/ that defines tables for users/customers, addresses, cart/cart_items, and links them to orders and order_items according to the system specifications.
- [ ] All database migration scripts execute successfully against local D1 (wrangler d1 migrations apply --local).
- [ ] Checkout transition strictly enforces price immutability: order_items.unit_price captures product price at checkout time, decoupling it from future catalog price changes.

### Storefront UI & Client Flow
- [ ] AuthModal.jsx and Header.jsx allow users to trigger Google sign-in and display user avatar and account actions when authenticated.
- [ ] Authenticated users can view their past order history and manage saved delivery addresses.
- [ ] Project builds cleanly via npm run build with zero compiler or bundler errors.
