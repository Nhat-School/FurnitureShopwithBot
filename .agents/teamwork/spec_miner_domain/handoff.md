# Handoff Report — E-Commerce Domain Model & System Design Mining

**Agent Archetype:** Specification Miner  
**Task:** Inspect system design specifications in `/Users/nhaterik/lastyear/thietkehethong` and deliver domain specification models, cardinalities, constraints, and immutability invariants for Furproject.

---

## 1. Observation

1. **Document Inspection (`A03_03_nhatpv.0741.docx`)**:
   - Section 2.1 documents the 19 domain entities across three core subsystems:
     > Customer, FullName, Address, CustomerVIP, CustomerNew, Cart, CartItem, Order, OrderItem, Shipping, Payment, PayCash, PayCredit, Book, Electronics, Laptop, Mobile, Clothes, Shoes.
   - Section 2.2 explicitly contrasts `CartItem` and `OrderItem`:
     > "CartItem là thông tin mua sắm TẠM THỜI. Giá của nó có thể thay đổi linh hoạt theo biến động giá niêm yết hiện tại của hệ thống hoặc các chương trình Flash Sale. OrderItem là hồ sơ giao dịch LỊCH SỬ BẤT BIẾN. Khi đơn hàng đã ký kết thành công, thuộc tính unitPrice trong OrderItem bắt buộc phải KHÓA CHẶT giá tại đúng thời điểm giao dịch để phục vụ kiểm toán tài chính, kế toán thuế..."
   - Section 3.1 & 3.2 details the Table-per-Subclass ORM mapping and cardinalities:
     > "Bảng con được cấp một Khóa ngoại (FK) trỏ chính xác về Khóa chính (PK) của bảng cha, đồng thời khóa ngoại này được gán chỉ mục duy nhất (UNIQUE) để đảm bảo tính duy nhất 1-đối-1."
     > Multiplicities: Customer (1..1) - (1..*) Address, Customer (1..1) - (0..*) Order, Cart (1..1) - (0..*) CartItem, Order (1..1) - (1..*) OrderItem.

2. **Visual Paradigm Database Inspection (`eComdatamodel.vpp` & `ecomAnalysis.vpp`)**:
   - File format verified via header: SQLite format 3 (`PRAGMA table_info(MODEL_ELEMENT)`).
   - In `eComDataModel.vpp`: Exactly 19 `DBTable` elements, 19 `Class` elements, 22 `Association` elements, and 23 `DBForeignKey` elements.
   - Column types identified: Primary keys (integer length 10), text fields (`VARCHAR(255)` type 27), prices (`DOUBLE` type 6), timestamps (`DATE/DATETIME` type 17).

3. **Course Lecture Slides (`slide_03_class_model.pdf`)**:
   - Slides 6 to 12 emphasize:
     > "CartItem != OrderItem"
     > "CartItem = temporary shopping information. OrderItem = historical transaction information."
     > "OrderItem.unitPrice should preserve the price used for the transaction."
     > Conceptual transformation: `Cart ---[«creates» checkout]---> Order`, where after checkout `Cart.items = ∅` and `Order.items = {OrderItem1, OrderItem2, ...}`.

4. **Reference Implementation Inspection (`FlashCardWeb`)**:
   - `migrations/0017_google_auth.sql`: Defines `auth_provider`, `provider_subject`, `display_name`, `profile_picture_url`, and unique compound index `idx_users_auth_provider_subject`.
   - `functions/api/[[path]].js`: Lines 203–345 implement Google OAuth 2.0 PKCE / state-cookie flow, token exchange, user profile upsert in D1, and signed session cookies.

5. **Existing Target Project Inspection (`Furproject`)**:
   - `migrations/0001_initial_schema.sql`: Contains `categories`, `products`, `orders`, `order_items`, `inventory_logs`, `reviews`.
   - Gaps observed: No `users` table, no structured `addresses` table, no `cart` or `cart_items` tables, denormalized contact info in `orders`, and embedded unverified payment/shipping columns.

---

## 2. Logic Chain

1. **From Requirements to Domain Model**:
   - The user request requires aligning Furproject's architecture and D1 database schema with the domain model specifications in `/Users/nhaterik/lastyear/thietkehethong` and adding Google OAuth from `FlashCardWeb`.
   - Observations 1, 2, and 3 confirm that the authoritative specification defines 19 distinct domain entities, with special emphasis on customer accounts, structured names (`FullName`), delivery addresses (`Address`), shopping carts (`Cart`/`CartItem`), immutable purchase orders (`Order`/`OrderItem`), delivery fulfillment (`Shipping`), and payment tracking (`Payment`/`PayCash`/`PayCredit`).

2. **From OO Hierarchy to Relational Persistence**:
   - As documented in Observation 1 (Section 3.1) and Observation 2, object-oriented inheritance cannot be directly queried in relational databases.
   - The specification mandates Table-per-Subclass (Joined Table) pattern with foreign keys having `UNIQUE` constraints to enforce 1-to-1 relationships for `CustomerVIP`, `CustomerNew`, `PayCash`, `PayCredit`, `Laptop`, and `Mobile`.

3. **From Immutability Requirement to Checkout Workflow**:
   - Observation 1 (§2.2) and Observation 3 (slides 8–11) explicitly state that `CartItem` and `OrderItem` serve incompatible lifecycles.
   - Therefore, the database migration must ensure `order_items.unit_price` is frozen from `products.price` at the instant of order placement, and `cart_items` are emptied post-checkout.
   - Customer address edits must not retroactively modify past delivery records; thus, historical address data must be captured as an immutable snapshot on `orders`/`shipping`.

4. **From Auth Pattern to Unified Customer Entity**:
   - FlashCardWeb uses a lightweight Google OAuth profile on `users`.
   - Merging this with the `Customer` and `FullName` specifications creates a complete profile entity with `id`, `email`, `auth_provider`, `provider_subject`, `display_name`, `first_name`, `mid_name`, `last_name`, `phone`, and `profile_picture_url`.

---

## 3. Caveats

1. **Multi-Category Catalog Adaptation**: The general specification models 4 distinct product categories (`Book`, `Electronics`, `Clothes`, `Shoes`). Furproject is specifically a furniture store with spatial dimensions (`width_cm`, `depth_cm`, `height_cm`, `weight_kg`) and material attributes. The furniture catalog in Furproject replaces the 4 specific test categories while fully adhering to the generic `Product` interface and the `CartItem` / `OrderItem` relationship.
2. **Session Cookie Signing**: FlashCardWeb implements signed cookies using a secret key (`JWT_SECRET` / `SESSION_SECRET`). When deploying to Furproject, developers must ensure appropriate environment variables or fallbacks are defined.

---

## 4. Conclusion

The domain specification is fully mined, verified against primary SQLite models, course lecture slides, and assignment documentation, and synthesized into `/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/spec_miner_domain/domain_specs_report.md`.

Key architectural conclusions:
1. Cloudflare D1 requires a new migration file introducing `users`, `addresses`, `carts`, `cart_items`, `shipping`, and `payments`.
2. The checkout transition must enforce price immutability by locking `order_items.unit_price` to `products.price` at checkout time and purging `cart_items`.
3. Delivery addresses must be snapshot-preserved in the order fulfillment record.
4. Google OAuth 2.0 endpoints (`/api/auth/google`, `/api/auth/google/callback`, `/api/auth/me`, `/api/auth/logout`) can be directly ported following the FlashCardWeb pattern.

---

## 5. Verification Method

1. **Inspect Generated Report**:
   ```bash
   cat /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/spec_miner_domain/domain_specs_report.md
   ```
2. **Inspect Underlying SQLite Model Elements in Visual Paradigm**:
   ```bash
   python3 -c "
   import sqlite3
   conn = sqlite3.connect('/Users/nhaterik/lastyear/thietkehethong/PVNHAT/eComDataModel/eComdatamodel.vpp')
   cur = conn.cursor()
   cur.execute('SELECT COUNT(*) FROM MODEL_ELEMENT WHERE MODEL_TYPE=\"DBTable\";')
   print('DB Tables count:', cur.fetchone()[0])
   cur.execute('SELECT COUNT(*) FROM MODEL_ELEMENT WHERE MODEL_TYPE=\"DBForeignKey\";')
   print('Foreign Keys count:', cur.fetchone()[0])
   "
   ```
   *Expected Output:* `DB Tables count: 19`, `Foreign Keys count: 23`.
3. **Inspect Original Course Documentation**:
   ```bash
   pdftotext -f 6 -l 10 "/Users/nhaterik/lastyear/thietkehethong/slide_03_class_model.pdf" -
   ```
   *Expected Output:* Verification of "CartItem != OrderItem" and checkout price preservation.
