# Handoff Report: Furproject Existing Architecture & Gap Analysis

**Agent:** `explorer_furproject_existing`  
**Parent Conversation ID:** `2b9ce9ab-84d4-452b-a6f9-ba8a04f45219`  
**Primary Deliverable:** `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_furproject_existing/existing_architecture_report.md`

---

## 1. Observation

1. **Build Tool & Dependencies (`package.json`)**:
   - `package.json:12-23`: React `^19.0.0`, `react-dom: ^19.0.0`, `lucide-react: ^1.16.0`, `@tailwindcss/vite: ^4.0.0`, `vite: ^6.2.0`, `wrangler: ^3.114.0`.
   - No test framework is installed (`package.json:6-11` has scripts: `dev`, `build`, `preview`, `deploy`).
   - Running `npm run build` ran `vite build` and transformed 1871 modules, producing `dist/index.html` (1.34 kB), `dist/assets/index-CzWtQNGP.css` (42.54 kB), and `dist/assets/index-C2Pui5xr.js` (305.07 kB) in 619ms with zero errors.

2. **Database & Infrastructure (`wrangler.toml`, `migrations/0001_initial_schema.sql`)**:
   - `wrangler.toml:8-11`: D1 binding `DB` maps to `furproject-db` (`507651c1-c120-431c-8a6f-10a2a26ecbc2`).
   - `wrangler.toml:21-25`: Environment variables only include `STORE_NAME`, `CURRENCY`, `ENVIRONMENT`. No OAuth or session secrets exist.
   - `.env.example:1-4`: Only lists `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN`.
   - `migrations/0001_initial_schema.sql:1-117`: Defines tables `categories`, `products`, `orders`, `order_items`, `inventory_logs`, and `reviews`.
   - `0001_initial_schema.sql:38-55`: `orders` table defines customer contact columns (`customer_name`, `customer_email`, `customer_phone`, `delivery_address`) but contains NO `customer_id` or `user_id` foreign key.
   - Running `npx wrangler d1 migrations apply furproject-db --local -y` successfully applied `0001_initial_schema.sql`. Running `SELECT name FROM sqlite_master WHERE type='table'` confirmed tables: `d1_migrations`, `sqlite_sequence`, `categories`, `products`, `orders`, `order_items`, `inventory_logs`, `reviews`.
   - Tables for `users`, `customers`, `full_names`, `addresses`, `carts`, `cart_items`, `shipments`, and `payments` do not exist in D1.

3. **Backend API Endpoints (`functions/api/[[path]].js`)**:
   - `functions/api/[[path]].js:95-152`: Auth section:
     - `POST /api/auth/google`: Accepts `{ email, name, avatar }` in the POST body without any OAuth verification. Dynamically attempts an inline `CREATE TABLE IF NOT EXISTS users (...)` and writes the record, returning `{ success: true, user }`. No session cookies or tokens are set.
     - `GET /api/auth/me`: Lines 142-151 return a hardcoded static user: `{ user: { email: 'nhaterik@gmail.com', name: 'Nhật Erik (Admin)', role: 'admin', avatar_url: '...' } }`.
     - `GET /api/auth/google`, `GET /api/auth/google/callback`, and `/api/auth/logout` are completely unhandled (yielding 404).
   - `functions/api/[[path]].js:380-403`: Order section:
     - `POST /api/orders`: Generates a random tracking code `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}` and returns `{ success: true, order: {...} }` without executing any SQL queries against `orders` or `order_items` in D1.
     - `GET /api/orders/:trackingCode`: Returns a static mock payload (`{ trackingCode, status: 'In Transit', carrier: 'ABC Bulky Logistics' }`).
     - Persistent cart endpoints (`/api/cart`), user order history endpoints (`/api/orders`), and customer address endpoints (`/api/customer/addresses`) do not exist.

4. **Frontend Client State & Components (`src/App.jsx`, `src/components/`)**:
   - `src/App.jsx:185, 203-220`: Cart is ephemeral state in `useState([])`. Current user is initialized from `localStorage.getItem('fur_user')`, defaulting to `DEFAULT_ADMIN_USER` (`nhaterik@gmail.com`).
   - `src/components/AuthModal.jsx:17-66`: Login submits client-provided name/email to `POST /api/auth/google` and falls back to a simulated `mockUser` stored in `localStorage`. There is no link or trigger for Google OAuth 2.0.
   - `src/components/Header.jsx:123-156`: Displays user avatar and name, but clicking it only opens `AuthModal`. There is no dropdown menu for user profile, order history, saved addresses, or sign out.
   - `src/components/CartDrawer.jsx:58-104`: Checkout form requires re-typing name, phone, and delivery address. It submits to `POST /api/orders` without customer ID, and resets only client-side cart state upon completion.
   - `src/components/OrderTrackModal.jsx:9-37`: Only queries single orders by tracking code, with no listing of authenticated user orders.

5. **Reference Domain Specification (`/Users/nhaterik/lastyear/thietkehethong/A03_03_nhatpv.0741.docx`)**:
   - Paragraphs 102–114 & 179: Defines 19 domain entities including:
     - `Customer (1) ◆── (1) FullName (firstName, midName, lastName)`
     - `Customer (1) ── (1..*) Address (street, ward, district, city, is_default)`
     - `Customer (1) ── (0..1) Cart (1) ◆── (0..*) CartItem (mutable shopping state, currentPrice)`
     - `Cart ..> Order («creates» checkout)`: Checkout transition creating `Order (1) ◆── (1..*) OrderItem`
     - `OrderItem`: Explicitly requires capturing immutable `unit_price` at checkout time, distinct from mutable `CartItem.currentPrice`.
     - `Order (1) ── (1) Shipping` and `Order (1) ── (1) Payment`.

6. **Reference Auth Implementation (`/Users/nhaterik/CloudflareProjects/FlashCardWeb/functions/api/[[path]].js`)**:
   - Lines 190–385: Implements Google OAuth 2.0 PKCE flow:
     - `startGoogleLogin`: generates cryptographically random `state` and `code_verifier`, computes SHA-256 `code_challenge`, sets HttpOnly cookies (`google_oauth_state`, `google_oauth_verifier`) scoped to `/api/auth/google/callback`, and redirects to Google.
     - `finishGoogleLogin`: verifies state and PKCE verifier, exchanges authorization code for tokens, retrieves user profile from Google UserInfo endpoint, upserts user in D1, signs session token with Web Crypto HMAC-SHA256, and sets `session_token` HttpOnly cookie.

---

## 2. Logic Chain

1. **From Observations 1 & 2**: The project has a solid modern foundation (Vite 6, React 19, Tailwind v4, working D1 local migrations), but the D1 schema in `0001_initial_schema.sql` lacks customer account modeling, user linkages in `orders`, persistent carts, and formal fulfillment/payment entities.
2. **From Observations 3 & 4**: Authentication in `functions/api/[[path]].js` and `AuthModal.jsx` is currently mock/simulated. The client self-reports user identity via JSON POST, `localStorage` caches this identity, and `GET /api/auth/me` always returns a hardcoded administrator.
3. **From Observations 3, 4, & 5**: The checkout flow violates both system persistence and domain immutability requirements: `POST /api/orders` never writes to D1 `orders` or `order_items`. Cart state exists solely in React memory (`cart = []`), meaning customers cannot retrieve saved carts across sessions, cannot view their order history, and historical unit prices are never formally captured in the database.
4. **From Observations 5 & 6**: Bridging the gap requires adding a second migration (`0002_domain_schema.sql`) to introduce `users`, `customers`, `full_names`, `addresses`, `carts`, `cart_items`, `shipments`, and `payments`, while adopting FlashCardWeb's PKCE OAuth and Web Crypto HMAC session pattern in Pages Functions.

---

## 3. Caveats

- **No Caveats**: All local directories, migrations, Pages Functions, and frontend components were directly inspected and verified via file viewing and CLI tool execution (`npm run build`, `wrangler d1 migrations apply --local`).

---

## 4. Conclusion

Furproject requires a 4-phase upgrade to satisfy `ORIGINAL_REQUEST.md`:
1. **D1 Migration (`0002_domain_schema.sql`)**: Add `users`, `customers`, `full_names`, `addresses`, `carts`, `cart_items`, `shipments`, `payments`, and alter `orders` to link `customer_id`.
2. **Pages Functions Refactor (`functions/api/[[path]].js`)**:
   - Implement real Google OAuth PKCE (`/api/auth/google` and `/api/auth/google/callback`).
   - Implement secure session management (`/api/auth/me` and `/api/auth/logout`) with HttpOnly cookies signed via Web Crypto HMAC-SHA256.
   - Implement `/api/cart` CRUD and transactional checkout in `POST /api/orders` that inserts into `orders`, `order_items` (locking in `unit_price`), `shipments`, and `payments`.
   - Add `/api/customer/orders` and `/api/customer/addresses`.
3. **Storefront UI Enhancements (`src/`)**:
   - Update `AuthModal.jsx` to initiate Google OAuth.
   - Update `Header.jsx` with an account dropdown for profile, order history, saved addresses, and logout.
   - Add Order History and Saved Address UI components.
   - Update `CartDrawer.jsx` to autofill customer info from saved addresses.
4. **Configuration Updates**: Document `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, and `SESSION_SECRET` in `.env.example`.

Detailed findings, entity specifications, and endpoint schemas are documented in `existing_architecture_report.md`.

---

## 5. Verification Method

To independently verify these findings:
1. **Check build health**:
   ```bash
   npm run build
   ```
   (Should succeed cleanly with 0 errors).
2. **Inspect existing D1 tables**:
   ```bash
   npx wrangler d1 execute furproject-db --local --command "SELECT name FROM sqlite_master WHERE type='table'"
   ```
   (Notice the absence of `users`, `customers`, `full_names`, `addresses`, `carts`, `cart_items`, `shipments`, `payments`).
3. **Inspect mock API behavior**:
   ```bash
   grep -n "auth/me" functions/api/\[\[path\]\].js
   grep -n "INSERT INTO orders" functions/api/\[\[path\]\].js
   ```
   (Notice `auth/me` is hardcoded at line 143 and `INSERT INTO orders` does not exist in `POST /api/orders`).
4. **Inspect full architecture report**:
   Read `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_furproject_existing/existing_architecture_report.md`.
