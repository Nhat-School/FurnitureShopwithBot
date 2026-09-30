# Milestone 3 Empirical Challenger 2 Report

**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Test Suite Executions and Verbatim Tool Results

1. **Targeted Tier 2 Boundary & Error Suite**:
   Command:
   ```bash
   node tests/e2e/runner.mjs --tier=2 --grep="B4|B8|B9|B10"
   ```
   Result:
   ```text
   ▶ [Tier 2] B4: Cart Authorization & Scope Boundaries
     ✓ T2.16: GET /api/cart unauthenticated access returns 401 or empty guest cart (16.5ms)
     ✓ T2.17: POST /api/cart/items unauthenticated returns 401 (1.1ms)
     ✓ T2.18: PUT /api/cart/items/:id attempting to modify another user cart item returns 403 or 404 (3.2ms)
     ✓ T2.19: DELETE /api/cart/items/:id attempting to delete another user cart item returns 403 or 404 (1.8ms)
     ✓ T2.20: DELETE /api/cart/items/:id with non-existent item ID returns 404 or handles gracefully (1.3ms)

   ▶ [Tier 2] B8: Address Book Validation & Missing Fields
     ✓ T2.36: POST /api/customer/addresses without authentication returns 401 (0.8ms)
     ✓ T2.37: POST /api/customer/addresses with missing recipient_name rejected with 400 (0.8ms)
     ✓ T2.38: POST /api/customer/addresses with missing phone rejected with 400 (0.8ms)
     ✓ T2.39: POST /api/customer/addresses with missing street rejected with 400 (0.8ms)
     ✓ T2.40: POST /api/customer/addresses with missing city_province rejected with 400 (0.8ms)

   ▶ [Tier 2] B9: Address Isolation & Unauthorized Modifications
     ✓ T2.41: GET /api/customer/addresses returns only caller addresses (no cross-tenant leakage) (1.1ms)
     ✓ T2.42: PUT /api/customer/addresses/:id attempting to modify another user address returns 403 or 404 (1.4ms)
     ✓ T2.43: DELETE /api/customer/addresses/:id attempting to delete another user address returns 403 or 404 (1.2ms)
     ✓ T2.44: Setting is_default=1 on one address resets is_default=0 on prior addresses of same user (5.2ms)
     ✓ T2.45: Deleting an address does not corrupt or cascade delete historical order delivery address (1.8ms)

   ▶ [Tier 2] B10: Customer Order History Isolation & Boundary
     ✓ T2.46: GET /api/customer/orders unauthenticated returns 401 Unauthorized (0.7ms)
     ✓ T2.47: Customer A cannot view Customer B orders via /api/customer/orders (1.1ms)
     ✓ T2.48: Customer with 0 past orders receives empty array [] without 500 error (1.2ms)
     ✓ T2.49: Order items in customer history retain frozen unit price regardless of catalog changes (1.3ms)
     ✓ T2.50: Order history records include shipment and payment status details (1.5ms)

   Total: 20 passed, 0 failed, 100.0% pass rate in 45.0ms.
   ```

2. **Real-World Workload User Journeys Suite**:
   Command:
   ```bash
   node tests/e2e/runner.mjs --tier=4
   ```
   Result:
   ```text
   ▶ [Tier 4] Tier 4: Real-World Workload Journeys
     ✓ T4.1: Journey 1: New Visitor First Purchase Workflow (Google Auth -> Save Address -> Add to Cart -> Checkout COD -> Track Order) (15.6ms)
     ✓ T4.2: Journey 2: Multi-Address Office vs Home Delivery Workflow (2.7ms)
     ✓ T4.3: Journey 3: Flash Sale Volatility & Immutability Audit Verification (1.7ms)
     ✓ T4.4: Journey 4: Guest Browsing to Authenticated Checkout Transition (2.0ms)
     ✓ T4.5: Journey 5: Complex Shopping Cart Manipulation & Multi-Item Checkout (7.8ms)
     ✓ T4.6: Journey 6: Multi-Device / Session Interruption & Resume Workflow (1.7ms)
     ✓ T4.7: Journey 7: High-Concurrency Multi-Customer Order Processing & Isolation (5.5ms)

   Total: 7 passed, 0 failed, 100.0% pass rate in 37.2ms.
   ```

3. **Custom Empirical Stress Test Suite (`tests/empirical_m3_isolation.test.mjs`)**:
   Command:
   ```bash
   node tests/empirical_m3_isolation.test.mjs
   ```
   Result:
   ```text
   =============================================================
     STARTING EMPIRICAL CHALLENGER STRESS TESTS (CROSS-TENANT)   
   =============================================================

   • Testing: User A and User B maintain completely isolated carts with same products... ✓ PASS
   • Testing: User B cannot modify User A cart item (IDOR attempt via PUT /api/cart/items/:id)... ✓ PASS
   • Testing: User B cannot delete User A cart item (IDOR attempt via DELETE /api/cart/items/:id)... ✓ PASS
   • Testing: User B clearing cart (DELETE /api/cart) only clears User B cart, leaving User A unaffected... ✓ PASS
   • Testing: User A and User B save addresses with complete tenant isolation... ✓ PASS
   • Testing: User B cannot modify User A address (IDOR via PUT /api/customer/addresses/:id)... ✓ PASS
   • Testing: User B cannot set User A address as default (PUT /api/customer/addresses/:id/default)... ✓ PASS
   • Testing: User B cannot delete User A address (DELETE /api/customer/addresses/:id)... ✓ PASS
   • Testing: Injecting foreign user_id in POST /api/customer/addresses is strictly ignored... ✓ PASS
   • Testing: User A checkout creates order with customer_id bound strictly to User A... ✓ PASS
   • Testing: User B attempting to spoof customer_id = User A in POST /api/orders is bound to User B... ✓ PASS
   • Testing: Guest checkout has null customer_id and is not visible in any user history... ✓ PASS
   • Testing: Guest order placing order with Alice email does NOT appear in Alice registered orders... ✓ PASS
   • Testing: Public tracking endpoint returns shipment tracking without leaking payment details... ✓ PASS
   • Testing: Cross-tenant IDOR with SQL injection payloads fails safely... ✓ PASS
   • Testing: Simultaneous 3-tenant cart actions preserve exact tenant partition... ✓ PASS

   =============================================================
     STRESS TEST SUMMARY: 16 passed, 0 failed
   =============================================================
   ```

4. **Production Build**:
   Command:
   ```bash
   npm run build
   ```
   Result:
   ```text
   vite v6.4.3 building for production...
   ✓ 1871 modules transformed.
   dist/index.html                   1.34 kB │ gzip:  0.81 kB
   dist/assets/index-BiY5aQvB.css   43.85 kB │ gzip:  8.45 kB
   dist/assets/index-OSkjDEjQ.js   305.07 kB │ gzip: 87.09 kB
   ✓ built in 590ms
   ```

### 1.2 Code Implementation Verification in `functions/api/[[path]].js`

- **Cart Tenant Isolation (Lines 1101-1287)**:
  - `GET /api/cart`: Queries `cart_items` where `cart_id = ?` obtained from `ensureUserCart(env, user)`, strictly bound to the authenticated user ID (`user.id`).
  - `PUT /api/cart/items/:id` & `DELETE /api/cart/items/:id`: Joins `cart_items ci` with `carts c ON ci.cart_id = c.id` and verifies `if (item.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);`.
  - `DELETE /api/cart`: Uses `WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)`, restricting deletion strictly to the session user.
- **Address Book Isolation (Lines 1298-1467)**:
  - `GET /api/customer/addresses`: Uses `WHERE user_id = ?` bound with `user.id`.
  - `POST /api/customer/addresses`: Inserts `user.id` from session into the `user_id` column. Any client-sent `user_id` in body is ignored. When `is_default = 1`, it resets `UPDATE addresses SET is_default = 0 WHERE user_id = ?`, leaving other tenants' default flags untouched.
  - `PUT /api/customer/addresses/:id` & `DELETE /api/customer/addresses/:id`: Queries the address and checks `if (address.user_id !== user.id) return jsonResponse({ error: 'Forbidden' }, 403);`.
  - `PUT /api/customer/addresses/:id/default`: Verifies `address.user_id === user.id` before resetting the user's defaults and setting the selected address as default.
- **Orders & History Isolation (Lines 1469-1555 & 1600-1712)**:
  - In `POST /api/orders`: `customerId` is resolved strictly via `const user = await getAuthenticatedUser(request, env); customerId = user?.id || null;`. Body values for `customer_id` or `user_id` are disregarded.
  - In `POST /api/orders`: Cart clearing statement is appended only `if (customerId)` and binds `DELETE FROM cart_items WHERE cart_id IN (SELECT id FROM carts WHERE user_id = ?)` to `customerId`.
  - In `GET /api/customer/orders`: Queries `SELECT ... FROM orders o WHERE o.customer_id = ?` bound to `user.id`. Guest orders (where `customer_id` is `NULL`) and other users' orders are completely invisible.
- **Public Tracking Boundary (Lines 1757-1826)**:
  - `GET /api/orders/:code`: Returns logistics timeline, shipping status, carrier, recipient name, and delivery address. It excludes payment records, transaction IDs, and internal customer IDs.

---

## 2. Logic Chain

1. **Step 1 (Cart Authorization & Isolation)**:
   - Observation 1.1 (Tests T2.16-T2.20 and Custom Stress Suite 1) verified that an unauthenticated user receives 401, while User B receives 403 Forbidden when attempting to update or delete User A's cart items via IDOR.
   - Observation 1.2 confirmed that all cart queries in `functions/api/[[path]].js` join `carts c ON ci.cart_id = c.id` and enforce `item.user_id === user.id`.
   - Inferences: Active shopping carts are strictly partitioned per tenant; cross-tenant modification or leakage is prevented.

2. **Step 2 (Address Book Isolation & Default Precedence)**:
   - Observation 1.1 (Tests T2.36-T2.45 and Custom Stress Suite 2) verified that missing fields produce 400 Bad Request, unauthorized access produces 401, and cross-tenant edits/deletes produce 403.
   - Observation 1.2 confirmed that setting `is_default = 1` executes `UPDATE addresses SET is_default = 0 WHERE user_id = ?` scoped strictly to `user.id`.
   - Inferences: Each authenticated user manages an isolated address book. Switching default addresses never affects another user's address book.

3. **Step 3 (Order Creation, Spoofing Immunity, & Order History Privacy)**:
   - Observation 1.1 (Tests T2.46-T2.50, T4.1-T4.7, and Custom Stress Suite 3) demonstrated that:
     1. User B sending `customer_id = 'tenant_user_a'` in the payload has their order bound to User B (`tenant_user_b`), leaving User A's history clean.
     2. Guest orders with `customer_email = 'alice@example.com'` do not appear in Alice's customer order history because history queries strictly match `customer_id = ?`.
     3. Checkout by User A clears only User A's cart and leaves User B's cart completely intact.
   - Inferences: The server treats the session token as the sole authority for customer identity, preventing order spoofing and cross-tenant history pollution.

4. **Step 4 (Workflow Completeness & Production Build)**:
   - Observation 1.1 (Tier 4 tests T4.1 to T4.7) demonstrated passing execution for guest checkouts, registered customer checkout with saved address, order history tracking, price immutability across flash sale fluctuations, and high-concurrency multi-customer order processing.
   - Observation 1.1 (Production build) executed Vite cleanly in 590ms with 0 bundler errors and 1871 transformed modules.
   - Inferences: The system satisfies all Milestone 3 domain API, persistent cart, price immutability, fulfillment linkage, and production build requirements.

---

## 3. Caveats

- **Scope Boundary**: Full suite run showed 1 failure in Tier 1 (`T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout`). Per `PROJECT.md`, Feature F12 (`Storefront Auth UI`) is scheduled for Milestone 4 and is outside Milestone 3's backend domain API scope.
- **Tracking Exposure**: Public tracking endpoint `GET /api/orders/:code` allows anyone with the tracking code or order ID to query shipment status and timeline. This is by design for logistics tracking and does not expose sensitive payment or customer account IDs.

---

## 4. Conclusion

**Verdict**: **APPROVE**

Milestone 3's domain APIs, persistent shopping cart, address book management, transactional orders with historical price immutability, and cross-tenant data isolation mechanisms are empirically verified to be sound, robust against IDOR and spoofing attacks, and fully compliant with all architectural specifications.

---

## 5. Verification Method

To independently verify these findings:

1. **Run Tier 2 Cross-Tenant Isolation Tests**:
   ```bash
   node tests/e2e/runner.mjs --tier=2 --grep="B4|B8|B9|B10"
   ```
   *Expected*: 20/20 PASS.

2. **Run Tier 4 Real-World Workload User Journeys**:
   ```bash
   node tests/e2e/runner.mjs --tier=4
   ```
   *Expected*: 7/7 PASS.

3. **Run Challenger 2 Dedicated Cross-Tenant Stress Harness**:
   ```bash
   node tests/empirical_m3_isolation.test.mjs
   ```
   *Expected*: 16/16 PASS.

4. **Run Production Build**:
   ```bash
   npm run build
   ```
   *Expected*: Clean exit code 0, 0 compiler/bundler errors.
