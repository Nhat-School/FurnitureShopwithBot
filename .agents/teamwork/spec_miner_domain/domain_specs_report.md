# E-Commerce System Domain Model & Database Specification Report

**Investigation Target:** E-Commerce System Analysis and Design Specifications  
**Authoritative Sources:**
1. `/Users/nhaterik/lastyear/thietkehethong/A03_03_nhatpv.0741.docx` (Official Assignment 03 & Exam 01 Report by Phạm Văn Nhất, B23DCCE074)
2. `/Users/nhaterik/lastyear/thietkehethong/PVNHAT/eComAnalysis/ecomAnalysis.vpp` (Visual Paradigm SQLite DB — Analysis Class Diagram)
3. `/Users/nhaterik/lastyear/thietkehethong/PVNHAT/eComDataModel/eComdatamodel.vpp` (Visual Paradigm SQLite DB — ORM Persistable Relational Data Model)
4. `/Users/nhaterik/lastyear/thietkehethong/slide_03_class_model.pdf` (Course Lecture 03 by PGS.TS Trần Đình Quế)
5. `/Users/nhaterik/lastyear/thietkehethong/TỪ PHÂN TÍCH ĐẾN THIẾT KẾ.pdf` (System Design Guidelines by PGS.TS Trần Đình Quế)
6. `/Users/nhaterik/lastyear/thietkehethong/A03_03_nhatpv.074.pdf` (Comprehensive System Modeling Exercises)
7. `/Users/nhaterik/CloudflareProjects/FlashCardWeb` (`migrations/0017_google_auth.sql` and `functions/api/[[path]].js`)
8. `/Users/nhaterik/CloudflareProjects/Furproject/migrations/0001_initial_schema.sql` (Existing D1 Schema)

---

## 1. Executive Summary

This report establishes the authoritative domain specification mined from the systems analysis and design materials developed under PGS.TS Trần Đình Quế (PTIT Information System Analysis and Design curriculum).

The canonical domain model consists of **19 core domain entities** categorized into three primary subsystems:
1. **Customer & Profile Subsystem**: `Customer`, `FullName`, `Address`, `CustomerVIP`, `CustomerNew`.
2. **Shopping Cart & Order Fulfillment Subsystem**: `Cart`, `CartItem`, `Order`, `OrderItem`, `Shipping`, `Payment`, `PayCash`, `PayCredit`.
3. **Multi-Category Product Catalog Subsystem**: `Book`, `Electronics`, `Laptop`, `Mobile`, `Clothes`, `Shoes`.

The analysis resolves critical architectural requirements:
- **Strict Decoupling of CartItem and OrderItem**: `CartItem != OrderItem`. A shopping cart is a transient session state containing intended items subject to live price adjustments. An order is a legally binding financial contract requiring absolute unit price immutability locked at checkout timestamp.
- **Relational Mapping of OOP Generalization**: 6 inheritance hierarchies (`CustomerVIP/CustomerNew -> Customer`, `PayCash/PayCredit -> Payment`, `Laptop/Mobile -> Electronics`) are mapped to RDBMS schemas using the **Table-per-Subclass (Joined Table)** pattern with 1:1 foreign keys enforcing `UNIQUE` constraints.
- **Structured Address & Identity Normalization**: Separation of `FullName` and `Address` from `Customer` to maintain third normal form (3NF), while ensuring orders capture immutable address snapshots for shipping logistics.
- **Authentication Alignment with FlashCardWeb**: Integrating Google OAuth 2.0 (`auth_provider`, `provider_subject`, `display_name`, `profile_picture_url`) with the customer profile in Cloudflare D1.

---

## 2. Complete Catalog of the 19 Domain Entities

The table below summarizes all 19 entities extracted directly from `ecomAnalysis.vpp` and `eComdatamodel.vpp`:

| # | Entity Name | Stereotype / Role | Analysis Attributes (UML) | Analysis Operations | DB Table Name & Physical Columns |
|---|-------------|-------------------|--------------------------|---------------------|----------------------------------|
| 1 | **Customer** | Domain Aggregate Root / Account | `- id: int`<br>`- username: String`<br>`- password: String`<br>`- email: String`<br>`- phone: String` | `+ register(): boolean`<br>`+ login(): boolean`<br>`+ updateProfile(): void` | `Customer`<br>`ID2 (PK, INT)`<br>`Username (VARCHAR 255)`<br>`Password (VARCHAR 255)`<br>`Email (VARCHAR 255)`<br>`Phone (VARCHAR 255)`<br>`FullNameID2 (FK, INT)`<br>`AddressID (FK, INT)`<br>`CartID (FK, INT)` |
| 2 | **FullName** | Value Object / Profile Entity | `- firstName: String`<br>`- midName: String`<br>`- lastName: String` | `+ getFullName(): String` | `FullName`<br>`ID (PK, INT)`<br>`FirstName (VARCHAR 255)`<br>`MidName (VARCHAR 255)`<br>`LastName (VARCHAR 255)` |
| 3 | **Address** | Entity / Location | `- street: String`<br>`- ward: String`<br>`- district: String`<br>`- city: String` | `+ getFullAddress(): String` | `Address`<br>`ID (PK, INT)`<br>`Street (VARCHAR 255)`<br>`Ward (VARCHAR 255)`<br>`District (VARCHAR 255)`<br>`City (VARCHAR 255)` |
| 4 | **CustomerVIP** | Subclass (`is-a Customer`) | `- vipLevel: String`<br>`- discountRate: double`<br>`- loyaltyPoints: int` | `+ applyDiscount(): double`<br>`+ redeemPoints(): void` | `CustomerVIP`<br>`ID (PK, INT)`<br>`VipLevel (VARCHAR 255)`<br>`DiscountRate (DOUBLE)`<br>`LoyaltyPoints (INT)`<br>`CustomerID2 (FK, UNIQUE, INT)` |
| 5 | **CustomerNew** | Subclass (`is-a Customer`) | `- promoCode: String`<br>`- welcomeDiscount: double` | `+ applyWelcomePromo(): bool` | `CustomerNew`<br>`ID (PK, INT)`<br>`PromoCode (VARCHAR 255)`<br>`WelcomeDiscount (DOUBLE)`<br>`CustomerID2 (FK, UNIQUE, INT)` |
| 6 | **Cart** | Active Session Aggregate Root | `- cartId: int`<br>`- createdDate: Date`<br>`- totalAmount: double` | `+ addItem(): void`<br>`+ removeItem(): void`<br>`+ clearCart(): void`<br>`+ calculateTotal(): double` | `Cart`<br>`ID (PK, INT)`<br>`CreateDate (DATETIME/DATE)`<br>`TotalAmount (DOUBLE)` |
| 7 | **CartItem** | Mutable Line Item | `- cartItemId: int`<br>`- quantity: int`<br>`- currentPrice: double` | `+ getSubTotal(): double`<br>`+ updateQty(qty: int): void` | `CartItem`<br>`ID (PK, INT)`<br>`Quantity (INT)`<br>`CurrentPrice (DOUBLE)`<br>`CartID (FK, INT)`<br>`BookID/LaptopID/MobileID/ShoesID/ClothesID (FKs)` |
| 8 | **Order** | Confirmed Contract Aggregate Root | `- orderId: int`<br>`- orderDate: Date`<br>`- orderStatus: String`<br>`- totalAmount: double` | `+ checkout(cart): Order`<br>`+ cancelOrder(): boolean`<br>`+ calculateTotal(): double`<br>`+ updateStatus(): void` | `Order`<br>`ID (PK, INT)`<br>`OrderDate (DATETIME/DATE)`<br>`OrderStatus (VARCHAR 255)`<br>`TotalAmount (DOUBLE)`<br>`CustomerID2 (FK, INT)` |
| 9 | **OrderItem** | Immutable Line Item | `- orderItemId: int`<br>`- quantity: int`<br>`- unitPrice: double` | `+ getSubTotal(): double` | `OrderItem`<br>`ID (PK, INT)`<br>`Quantity (INT)`<br>`UnitPrice (DOUBLE, FROZEN)`<br>`OrderID (FK, INT)`<br>`ElectronicsID/MobileID/ClothesID/ShoesID (FKs)` |
| 10 | **Shipping** | Fulfillment Record | `- shippingId: int`<br>`- carrierName: String`<br>`- trackingNumber: String`<br>`- shippingFee: double`<br>`- shippingStatus: String` | `+ updateStatus(): void`<br>`+ calculateShippingFee(): double` | `Shipping`<br>`ID (PK, INT)`<br>`CarrierName (VARCHAR 255)`<br>`TrackingNumber (VARCHAR 255)`<br>`ShippingFee (DOUBLE)`<br>`ShippingStatus (VARCHAR 255)`<br>`OrderID (FK, UNIQUE, INT)` |
| 11 | **Payment** | Base Financial Transaction | `- paymentId: int`<br>`- paymentDate: Date`<br>`- amount: double`<br>`- paymentStatus: String` | `+ processPayment(): boolean`<br>`+ getReceipt(): String` | `Payment`<br>`ID (PK, INT)`<br>`PaymentDate (DATETIME/DATE)`<br>`Amount (DOUBLE)`<br>`PaymentStatus (VARCHAR 255)`<br>`OrderID (FK, UNIQUE, INT)`<br>`PaycashID (FK, INT)` |
| 12 | **PayCash** | Subclass (`is-a Payment`) | `- cashTendered: double`<br>`- changeAmount: double` | `+ calculateChange(): double` | `Paycash`<br>`ID (PK, INT)`<br>`CashTendered (DOUBLE)`<br>`ChangeAmount (DOUBLE)` |
| 13 | **PayCredit** | Subclass (`is-a Payment`) | `- cardNumber: String`<br>`- cardHolderName: String`<br>`- expirationDate: String`<br>`- cardType: String` | `+ authorizePayment(): bool` | `PayCredit`<br>`ID (PK, INT)`<br>`CardNumber (VARCHAR 255)`<br>`CardHolderName (VARCHAR 255)`<br>`ExpirationDate (VARCHAR 255)`<br>`CardType (VARCHAR 255)`<br>`PaymentID (FK, UNIQUE, INT)` |
| 14 | **Book** | Product Subtype | `- bookId: int`<br>`- title: String`<br>`- isbn: String`<br>`- author: String`<br>`- price: double` | `+ getBookDetails(): String` | `Book`<br>`ID (PK, INT)`<br>`Title (VARCHAR 255)`<br>`Isbn (VARCHAR 255)`<br>`Author (VARCHAR 255)`<br>`Price (DOUBLE)` |
| 15 | **Electronics** | Product Base Subtype | `- electronicsId: int`<br>`- name: String`<br>`- brand: String`<br>`- warrantyMonths: int`<br>`- price: double` | `+ checkWarranty(): boolean` | `Electronics`<br>`ID (PK, INT)`<br>`Name (VARCHAR 255)`<br>`Brand (VARCHAR 255)`<br>`WarrantyMonths (INT)`<br>`Price (DOUBLE)`<br>`LaptopID / MobileID (FKs)` |
| 16 | **Laptop** | Subclass (`is-a Electronics`) | `- cpu: String`<br>`- ram: String`<br>`- storage: String`<br>`- gpu: String` | `+ getSpecs(): String` | `Laptop`<br>`ID (PK, INT)`<br>`Cpu (VARCHAR 255)`<br>`Ram (VARCHAR 255)`<br>`Storage (VARCHAR 255)`<br>`Gpu (VARCHAR 255)`<br>`ElectronicsID (FK, UNIQUE, INT)` |
| 17 | **Mobile** | Subclass (`is-a Electronics`) | `- screenSize: String`<br>`- simSlots: int`<br>`- cameraResolution: String`<br>`- batteryCapacity: int` | `+ getSpecs(): String` | `Mobile`<br>`ID (PK, INT)`<br>`ScreenSize (VARCHAR 255)`<br>`SimSlots (INT)`<br>`CameraResolution (VARCHAR 255)`<br>`BatteryCapacity (INT)`<br>`ElectronicsID (FK, UNIQUE, INT)` |
| 18 | **Clothes** | Product Subtype | `- clothesId: int`<br>`- name: String`<br>`- size: String`<br>`- color: String`<br>`- price: double` | `+ checkSizeAvailable(): bool` | `Clothes`<br>`ID (PK, INT)`<br>`Name (VARCHAR 255)`<br>`Size (VARCHAR 255)`<br>`Color (VARCHAR 255)`<br>`Price (DOUBLE)` |
| 19 | **Shoes** | Product Subtype | `- shoesId: int`<br>`- name: String`<br>`- shoeSize: int`<br>`- color: String`<br>`- price: double` | `+ checkSizeAvailable(): bool` | `Shoes`<br>`ID (PK, INT)`<br>`Name (VARCHAR 255)`<br>`ShoeSize (INT)`<br>`Color (VARCHAR 255)`<br>`Price (DOUBLE)` |

---

## 3. Specialized Deep Dive on Core Domains

### 3.1. Customer & Account Structure
In the analytical model, `Customer` owns credentials (`username`, `password`, `email`, `phone`), linking to `FullName` (1:1), `Address` (1:N), active `Cart` (0..1), and past `Order` list (0..*).

When upgrading Furproject with Google OAuth (patterned from FlashCardWeb `migrations/0017_google_auth.sql` and `functions/api/[[path]].js`):
- `Customer` / `User` stores standard account fields plus OAuth provider metadata:
  - `auth_provider`: `'google'` or `'password'` / `'guest'`.
  - `provider_subject`: Google `sub` (OpenID Connect unique user ID).
  - `display_name`: Formatted full name from Google profile or FullName entity.
  - `profile_picture_url`: Secure avatar URL from Google.
  - `role`: `'customer'` or `'admin'`.
- Indexing: `CREATE UNIQUE INDEX idx_users_auth_provider_subject ON users (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL;`

### 3.2. FullName Value Object / Entity
The design strictly separates structured name components from the user table:
- `firstName`: Given name (e.g., "Nhất").
- `midName`: Middle name (e.g., "Văn").
- `lastName`: Family name (e.g., "Phạm").
- Method `getFullName()`: Concatenates formatted components based on locale:
  ```
  Vietnamese/East Asian: [lastName] [midName] [firstName]
  Western: [firstName] [midName] [lastName]
  ```
- In relational storage, `FullName` can either exist as a dedicated 1:1 table (`FullName` with `customer_id` / `id`) or flattened into `first_name`, `mid_name`, `last_name` columns on the `users` table while exposing the structured Value Object abstraction at the API level.

### 3.3. Address Entity
The `Address` entity models physical locations:
- Columns: `street`, `ward`, `district`, `city` (province/city).
- Extensions for e-commerce delivery: `postal_code`, `phone`, `recipient_name`, and `is_default` (boolean flag).
- Cardinality: `Customer (1..1) ── resides_at ── (1..*) Address`. A registered buying customer must have at least 1 default address, and may save multiple secondary addresses (home, office).
- Critical Invariant: **Address Snapshotting**. Placed orders must NOT store a mutable foreign key to `addresses.id` alone. If a customer edits their home address 3 weeks later, the delivery record of an order placed in the past must remain unchanged. Thus, `orders` or `shipping` must store either an immutable JSON address snapshot or copy the text fields (`shipping_address_line`, `ward`, `district`, `city`, `phone`).

### 3.4. Cart & CartItem Lifecycle
- `Cart`: Represents an ephemeral shopping session (`cartId`, `createdDate`, `totalAmount`).
- `CartItem`: Represents an intended product line (`quantity`, `currentPrice`).
- Lifecycle Operations:
  - `addItem(productId, quantity)`: If item exists, increments `quantity`; otherwise creates a new `CartItem`.
  - `updateQty(cartItemId, newQty)`: Updates intended quantity. If `newQty <= 0`, removes the item.
  - `removeItem(cartItemId)`: Removes the line item.
  - `clearCart()`: Deletes all items in `CartItem` where `cart_id = ?`.
  - `calculateTotal()`: Re-queries live catalog prices from `products.price` and recalculates `totalAmount = sum(quantity * live_price)`.
- Volatility: `CartItem.currentPrice` floats with catalog prices, discounts, and flash sales until checkout.

### 3.5. Order & OrderItem Immutability (The Checkout Invariant)
The core architectural rule from Lecture 03 and Assignment 03 is:
> **CartItem != OrderItem**
> `CartItem` is mutable shopping state; `OrderItem` is an immutable legal audit record.

#### Architectural Comparison Matrix:
| Dimension | CartItem | OrderItem |
|---|---|---|
| **Business Intent** | Pending selection (intent to buy) | Contractual purchase commitment |
| **Lifecycle** | Transient, mutable, deletable | Permanent, immutable historical record |
| **Owner** | Owned by `Cart` (Composition) | Owned by `Order` (Composition) |
| **Quantity** | Variable (user updates freely) | Fixed at checkout confirmation |
| **Unit Price** | Dynamic (tracks catalog price changes) | **STRICTLY FROZEN** at checkout timestamp |
| **Post-Checkout** | Destroyed / purged (`Cart.items = ∅`) | Persistently stored in database forever |

#### Mathematical Immutability Invariant:
At checkout timestamp $t_{\text{checkout}}$:
```
OrderItem.unitPrice = Product.price(t_checkout)
OrderItem.quantity  = CartItem.quantity
OrderItem.subtotal  = OrderItem.quantity * OrderItem.unitPrice
Order.totalAmount   = sum(OrderItem.subtotal) + Shipping.shippingFee + Order.freightSurcharge - discounts
```
For any future time $t > t_{\text{checkout}}$, even if $Product.price(t) \neq Product.price(t_{\text{checkout}})$, the database must guarantee:
```
d/dt (OrderItem.unitPrice) = 0
d/dt (Order.totalAmount)   = 0
```

### 3.6. Shipping Logistics & Delivery Fulfillment
- `Shipping`: Represents the physical delivery contract associated 1:1 with an `Order`.
- Attributes:
  - `carrierName`: Name of carrier (e.g., "Giao Hàng Nhanh", "ViettelPost", "ABC Logistics").
  - `trackingNumber`: Unique carrier tracking code.
  - `shippingFee`: Cost of standard transport.
  - `shippingStatus`: Delivery state machine: `pending` -> `dispatched` -> `in_transit` -> `out_for_delivery` -> `delivered` / `returned`.
  - Snapshot data: Full destination recipient name, phone, address text, freight elevator status, and floor number (critical for furniture delivery in Furproject).

### 3.7. Payment Tracking & Settlement
- `Payment`: Base transaction record linked 1:1 with `Order`.
- Attributes: `paymentDate`, `amount`, `paymentStatus` (`pending`, `authorized`, `paid`, `failed`, `refunded`), `paymentMethod`.
- Specialized Subclasses (Table-per-Subclass):
  - `PayCash`: For Cash-on-Delivery (COD). Attributes: `cashTendered`, `changeAmount`. Settled upon delivery.
  - `PayCredit`: For online card / digital payment. Attributes: `cardNumber` (masked / last 4), `cardHolderName`, `expirationDate`, `cardType` (Visa/Mastercard/JCB), `transactionId` (payment gateway reference).

### 3.8. Product Catalog & Linkage to Furproject
In the design specifications:
- The general domain catalog demonstrates multiple categories (`Book`, `Electronics`, `Clothes`, `Shoes`) with subclasses (`Laptop`, `Mobile` extending `Electronics`).
- In **Furproject (ABC Furniture Online Shop)**:
  - The catalog is modeled in `products` with `categories` (Living Room, Dining Room, Bedroom, Home Office) and furniture-specific attributes (`material`, `wood_finish`, `dimensions: width_cm, depth_cm, height_cm, weight_kg`, `freight_surcharge`).
  - `CartItem` and `OrderItem` in Furproject link to `products(id)`.
  - The immutability and checkout principles specified in the design doc apply universally to Furproject: cart lines point dynamically to products, and order lines freeze unit price, dimensions, and product name at checkout.

---

## 4. Relational Database Modeling & Cardinality Matrix

### 4.1. Association & Multiplicity Analysis (Data Model)
Directly extracted from `eComDataModel.vpp` (22 Associations):

| # | Association Name | Source Entity | Target Entity | Multiplicity | Business Rule & FK Location |
|---|------------------|---------------|---------------|--------------|------------------------------|
| 1 | `hasFullName` | `Customer` | `FullName` | `1..1` : `1..1` | 1-to-1 identity composition. `Customer.FullNameID` references `FullName.ID`. |
| 2 | `reside_at` | `Customer` | `Address` | `1..1` : `1..*` | 1 customer has 1 or more addresses. `Address.CustomerID` references `Customer.ID`. |
| 3 | `own_cart` | `Customer` | `Cart` | `1..1` : `0..1` | 1 customer has at most 1 active cart. `Cart.CustomerID` (UNIQUE) or `Customer.CartID`. |
| 4 | `place_order` | `Customer` | `Order` | `1..1` : `0..*` | 1 customer places 0 or many orders. `Order.CustomerID` references `Customer.ID`. |
| 5 | `contains` | `Cart` | `CartItem` | `1..1` : `0..*` | Active cart contains 0 or many lines. `CartItem.CartID` references `Cart.ID`. |
| 6 | `includes` | `Order` | `OrderItem` | `1..1` : `1..*` | Confirmed order must contain $\ge 1$ lines. `OrderItem.OrderID` references `Order.ID`. |
| 7 | `shipped_by` | `Order` | `Shipping` | `1..1` : `1..1` | 1 order has exactly 1 shipping record. `Shipping.OrderID` (UNIQUE) references `Order.ID`. |
| 8 | `setteled_by` | `Order` | `Payment` | `1..1` : `1..1` | 1 order has 1 payment settlement. `Payment.OrderID` (UNIQUE) references `Order.ID`. |
| 9 | `has_vip_profile` | `Customer` | `CustomerVIP` | `1..1` : `0..1` | Table-per-subclass. `CustomerVIP.CustomerID` (UNIQUE) references `Customer.ID`. |
| 10 | `has_new_profile` | `Customer` | `CustomerNew` | `1..1` : `0..1` | Table-per-subclass. `CustomerNew.CustomerID` (UNIQUE) references `Customer.ID`. |
| 11 | `settled_by_cash` | `Payment` | `Paycash` | `1..1` : `0..1` | Table-per-subclass. `Paycash.PaymentID` (UNIQUE) references `Payment.ID`. |
| 12 | `settled_by_credit` | `Payment` | `PayCredit` | `1..1` : `0..1` | Table-per-subclass. `PayCredit.PaymentID` (UNIQUE) references `Payment.ID`. |
| 13 | `sub_laptop` | `Electronics` | `Laptop` | `1..1` : `0..1` | Table-per-subclass. `Laptop.ElectronicsID` (UNIQUE) references `Electronics.ID`. |
| 14 | `sub_mobile` | `Electronics` | `Mobile` | `1..1` : `0..1` | Table-per-subclass. `Mobile.ElectronicsID` (UNIQUE) references `Electronics.ID`. |
| 15 | `ref_book` (cart) | `CartItem` | `Book` | `0..*` : `0..1` | Cart line references book item. |
| 16 | `ref_clothes` (cart) | `CartItem` | `Clothes` | `0..*` : `0..1` | Cart line references apparel item. |
| 17 | `ref_shoes` (cart) | `CartItem` | `Shoes` | `0..*` : `0..1` | Cart line references footwear item. |
| 18 | `ref_electronics` (cart) | `CartItem` | `Electronics` | `0..*` : `0..1` | Cart line references electronics item. |
| 19 | `ref_book` (order) | `OrderItem` | `Book` | `0..*` : `0..1` | Order line references book item. |
| 20 | `ref_clothes` (order) | `OrderItem` | `Clothes` | `0..*` : `0..1` | Order line references apparel item. |
| 21 | `ref_shoes` (order) | `OrderItem` | `Shoes` | `0..*` : `0..1` | Order line references footwear item. |
| 22 | `ref_electronics` (order)| `OrderItem` | `Electronics` | `0..*` : `0..1` | Order line references electronics item. |

### 4.2. Foreign Key Cascade & Referential Integrity Rules
- **Cart Deletion**:
  - `CartItem` -> `ON DELETE CASCADE`: When an active cart is cleared or customer deletes the cart session, all associated `CartItem` records are purged automatically.
- **Order Protection (Audit Lock)**:
  - `OrderItem` -> `ON DELETE RESTRICT`: An order item cannot be individually deleted while an order is active.
  - `Customer` -> `ON DELETE RESTRICT` (on orders): If a customer account is marked for closure, existing historical orders cannot be cascade deleted (preserves fiscal tax and accounting history). The customer account status is set to `closed` or `archived`.
  - `Product` -> `ON DELETE RESTRICT` (on order_items): A product cannot be deleted from the database if historical `order_items` reference it. Instead, products must be soft-deleted (`is_active = 0` or `archived_at = datetime('now')`).
- **Shipping & Payment**:
  - `Shipping` -> `ON DELETE CASCADE` or `RESTRICT`: Directly tied to the lifecycle of the order.
  - `Payment` -> `ON DELETE RESTRICT`: Financial records must be retained for auditing.

---

## 5. Alignment with Furproject & Target D1 Architecture

### 5.1. Gap Analysis of Current Furproject Schema
Inspection of `/Users/nhaterik/CloudflareProjects/Furproject/migrations/0001_initial_schema.sql` reveals:
1. **Missing `users` / `customers` table**: No table stores authenticated customer profiles, password hashes, or Google OAuth identity tokens.
2. **Missing `addresses` table**: Delivery addresses are stored as raw text strings inside `orders.delivery_address`. Customers cannot save multiple delivery addresses or set a default.
3. **Missing `cart` and `cart_items` tables**: Shopping cart state currently resides exclusively in browser memory/localStorage; no server-side synchronization exists.
4. **Denormalized `orders`**: Customer contact fields (`customer_name`, `customer_email`, `customer_phone`) are duplicated on every order row rather than linked via `customer_id`.
5. **Coupled Shipping and Payment**: `tracking_code` and `payment_method` are stored directly in `orders` without dedicated lifecycle status tracking.

### 5.2. Recommended Schema Migration Blueprint (Cloudflare D1)
To bring Furproject into strict alignment with both the domain specifications and the Google OAuth requirements:

```sql
-- 1. Users / Customers Table (incorporating Google OAuth & FullName)
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE,
    password_hash TEXT,
    auth_provider TEXT NOT NULL DEFAULT 'google', -- 'google', 'password', 'guest'
    provider_subject TEXT,                        -- Google OpenID sub
    display_name TEXT,
    first_name TEXT,
    mid_name TEXT,
    last_name TEXT,
    phone TEXT,
    profile_picture_url TEXT,
    role TEXT NOT NULL DEFAULT 'customer',        -- 'customer', 'admin'
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_auth_provider_subject
    ON users (auth_provider, provider_subject)
    WHERE provider_subject IS NOT NULL;

-- 2. Customer Delivery Addresses
CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    street TEXT NOT NULL,
    ward TEXT NOT NULL,
    district TEXT NOT NULL,
    city TEXT NOT NULL,
    postal_code TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON addresses(user_id);

-- 3. Shopping Carts (Server-Side Persistence)
CREATE TABLE IF NOT EXISTS carts (
    id TEXT PRIMARY KEY,
    user_id TEXT UNIQUE, -- 1:0..1 association with registered customer; NULL for guest cart
    session_token TEXT UNIQUE, -- Cookie-based tracking for guest carts
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 4. Shopping Cart Items (Mutable Session State)
CREATE TABLE IF NOT EXISTS cart_items (
    id TEXT PRIMARY KEY,
    cart_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE (cart_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON cart_items(cart_id);

-- 5. Orders Table Enhancement (Linking Customer & Address Snapshot)
-- (ALTER TABLE or upgraded orders schema with customer_id, address_id, status)

-- 6. Shipping Fulfillment Table
CREATE TABLE IF NOT EXISTS shipping (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    carrier_name TEXT NOT NULL,
    tracking_number TEXT UNIQUE,
    shipping_fee REAL NOT NULL DEFAULT 0,
    shipping_status TEXT NOT NULL DEFAULT 'Pending', -- Pending, InTransit, Delivered, Returned
    recipient_name TEXT NOT NULL,
    recipient_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    estimated_delivery TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

-- 7. Payment Transactions Table
CREATE TABLE IF NOT EXISTS payments (
    id TEXT PRIMARY KEY,
    order_id TEXT UNIQUE NOT NULL,
    payment_method TEXT NOT NULL, -- CreditCard, COD, BankTransfer
    amount REAL NOT NULL,
    payment_status TEXT NOT NULL DEFAULT 'Pending', -- Pending, Paid, Failed, Refunded
    transaction_id TEXT,
    paid_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT
);
```

---

## 6. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Account & Profile | Customer Authentication & Profile | Manages user credentials, contact details, and account state | `id, username, password, email, phone` | Account profile record, session tokens | Reject duplicate email/username; require valid email format | `A03_03_nhatpv.0741.docx` §2.1; `eComDataModel.vpp` |
| 2 | Name Structure | FullName Value Object | Decomposes identity names into first, middle, and last name | `firstName, midName, lastName` | Formatted name string via `getFullName()` | Handle null or empty middle name gracefully | `A03_03_nhatpv.0741.docx` §2.1, §3.3; `FullName` table |
| 3 | Address Management | Address Delivery Directory | Manages multiple delivery addresses per customer with default designation | `street, ward, district, city, phone, is_default` | Formatted address string via `getFullAddress()` | Foreign key constraint fails if user does not exist | `A03_03_nhatpv.0741.docx` §2.1, §3.2; `Address` table |
| 4 | Loyalty System | CustomerVIP Specialization | Extends customer with VIP tier, discount rates, and loyalty points | `vipLevel, discountRate, loyaltyPoints` | Discount deductions, reward point balance | Unique constraint violation if non-1:1 mapping with customer | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `CustomerVIP` table |
| 5 | Promo Onboarding | CustomerNew Specialization | Extends new customers with welcome promo codes and initial discounts | `promoCode, welcomeDiscount` | Promo validity boolean via `applyWelcomePromo()` | Expired or non-existent promo codes rejected | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `CustomerNew` table |
| 6 | Shopping Cart | Cart Session Container | Maintains active user shopping cart with session tracking | `cartId, userId, createdDate` | Current cart summary and total | At most 1 active cart per authenticated user | `slide_03_class_model.pdf` slide 6-12; `Cart` table |
| 7 | Cart Items | Mutable CartItem Line | Tracks product and intended quantity in active cart | `cartId, productId, quantity` | Subtotal calculation (`quantity * currentPrice`) | Reject quantity $\le 0$; remove item when quantity set to 0 | `slide_03_class_model.pdf` slide 7; `CartItem` table |
| 8 | Order Processing | Order Contract Record | Persists legally binding purchase contract with timestamps and status | `orderId, customerId, orderDate, orderStatus, totals` | Order confirmation, tracking status | Rejects checkout if cart is empty (Order must have $\ge 1$ items) | `slide_03_class_model.pdf` slide 8-10; `Order` table |
| 9 | Order Items | Immutable OrderItem Line | Locks purchased quantity and unit price at checkout timestamp | `orderId, productId, quantity, unitPrice` | Immutable line total (`quantity * unitPrice`) | Denies update/delete on finalized orders | `A03_03_nhatpv.0741.docx` §2.2; `slide_03_class_model.pdf` slide 8-9 |
| 10 | Logistics | Shipping Fulfillment | Manages carrier dispatch, tracking numbers, and delivery statuses | `orderId, carrierName, trackingNumber, shippingFee` | Tracking status updates, fee calculations | Enforces 1:1 relationship with Order via unique key | `A03_03_nhatpv.0741.docx` §2.1, §3.3; `Shipping` table |
| 11 | Payment Base | Payment Transaction Record | Base settlement tracking amount, status, and timestamp | `orderId, amount, paymentDate, paymentStatus` | Payment receipt, reconciliation status | Rejects mismatched payment amounts against order total | `A03_03_nhatpv.0741.docx` §2.1, §3.3; `Payment` table |
| 12 | Cash Settlement | PayCash COD Method | Specialization for Cash-On-Delivery with tendered/change accounting | `cashTendered, changeAmount` | Calculated change via `calculateChange()` | Error if cash tendered < total order amount | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `Paycash` table |
| 13 | Digital Payment | PayCredit Card Method | Specialization for credit/debit card processing | `cardNumber, cardHolder, expirationDate, cardType` | Card authorization result via `authorizePayment()` | Reject expired cards or invalid card format | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `PayCredit` table |
| 14 | Catalog Books | Book Domain Subtype | Book publishing catalog metadata | `bookId, title, isbn, author, price` | Book details string via `getBookDetails()` | Unique ISBN violation on duplicate additions | `A03_03_nhatpv.0741.docx` §2.1; `Book` table |
| 15 | Catalog Electronics | Electronics Base Domain Subtype | Consumer electronics catalog metadata | `electronicsId, name, brand, warrantyMonths, price` | Warranty status via `checkWarranty()` | Negative warranty or price rejected | `A03_03_nhatpv.0741.docx` §2.1; `Electronics` table |
| 16 | Specialized Hardware | Laptop Electronics Subtype | Hardware specs for portable computers | `cpu, ram, storage, gpu` | Spec summary via `getSpecs()` | Enforces 1:1 link with parent Electronics ID | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `Laptop` table |
| 17 | Mobile Hardware | Mobile Electronics Subtype | Hardware specs for smartphones/tablets | `screenSize, simSlots, cameraResolution, batteryCapacity` | Spec summary via `getSpecs()` | Invalid sim slots ($\le 0$) rejected | `A03_03_nhatpv.0741.docx` §2.1, §3.1; `Mobile` table |
| 18 | Apparel Catalog | Clothes Domain Subtype | Apparel catalog with sizing and colors | `clothesId, name, size, color, price` | Size availability via `checkSizeAvailable()` | Missing size/color rejected | `A03_03_nhatpv.0741.docx` §2.1; `Clothes` table |
| 19 | Footwear Catalog | Shoes Domain Subtype | Footwear catalog with numeric sizing | `shoesId, name, shoeSize, color, price` | Size availability via `checkSizeAvailable()` | Invalid shoe sizes (< 10 or > 60) rejected | `A03_03_nhatpv.0741.docx` §2.1; `Shoes` table |
| 20 | Authentication | Google OAuth 2.0 Identity | Secure OpenID Connect authentication flow with state & verifier cookies | `state, verifier, authorization_code` | User account creation/login, secure session cookie | Reject unverified emails or CSRF state mismatch | `FlashCardWeb/functions/api/[[path]].js` |
| 21 | Session Storage | Signed Session Cookies | Tamper-proof session storage using HMAC/SHA-256 signatures | `sessionToken, userProfile` | Authenticated request context in Pages Functions | Invalidate expired or forged signature cookies | `FlashCardWeb/functions/api/[[path]].js` |
| 22 | Inventory Audit | Inventory Stock Adjustment Logs | Auditing stock fluctuations for reorders and purchases | `productId, changeAmount, reason, staffName` | Remaining stock level | Block checkout if requested quantity > current stock | `Furproject/migrations/0001_initial_schema.sql` |

---

## 7. Edge Cases

| # | Feature | Input / Trigger Condition | Observed / Required Behavior |
|---|---------|---------------------------|------------------------------|
| 1 | Checkout Price Transition | Product price changes in catalog from 14,500,000 to 16,000,000 while item is in user's cart | `CartItem.currentPrice` displays latest 16,000,000 before checkout; once user clicks checkout, `OrderItem.unitPrice` is permanently frozen at 16,000,000. Future price drops back to 12,000,000 do NOT alter the historical `OrderItem` price. |
| 2 | Empty Cart Checkout | User clicks checkout button with 0 items in cart (`Cart.items = ∅`) | System halts transaction: Business rule strictly specifies `Order (1..1) ── includes ── (1..*) OrderItem`. An order cannot be created with zero line items. |
| 3 | Post-Checkout Cart Purge | User successfully places order with 3 items | Order is created with 3 `OrderItem` records; `CartItem` records for that user are deleted (`Cart.items = ∅`). User cart icon displays badge 0 immediately. |
| 4 | Customer Profile Mutation vs Order History | Customer updates delivery address or phone number in profile | Changes apply to `addresses` table for future orders. Past orders retain original destination text and recipient phone in `shipping` table to prevent retroactively corrupting delivery audit logs. |
| 5 | Concurrent Cart Item Addition | User adds same product SKU twice in separate actions | Application updates existing `CartItem` row (`quantity = quantity + added_qty`) rather than inserting duplicate rows (enforced by `UNIQUE (cart_id, product_id)` constraint). |
| 6 | Out-of-Stock Checkout Race Condition | Product stock is 1; two concurrent users attempt checkout simultaneously | Database transaction checks stock level before order insertion. First checkout succeeds and decrements stock to 0; second checkout fails with `INSUFFICIENT_STOCK` error and preserves cart. |
| 7 | Google OAuth Account Linking | User signs in with Google email matching an existing guest or password account | System locates user by email, sets `auth_provider = 'google'`, records `provider_subject`, updates display name and avatar, and returns active session without creating duplicate account rows. |
| 8 | Multiple Delivery Addresses | Customer saves 3 delivery addresses and marks the 2nd as default | Setting address #2 `is_default = 1` triggers transaction that sets `is_default = 0` on all other addresses belonging to the same `user_id`. |
| 9 | Soft-Deleting Products with Historical Orders | Administrator deletes discontinued furniture product | System rejects hard `DELETE FROM products` due to foreign key constraint on `order_items`. Instead, system sets `is_featured = 0`, `is_active = 0`, allowing past orders to load product history while hiding it from active catalog. |
| 10 | Split / Installment Payments | Payment method fails or partial amount tendered | Base `Payment` status remains `Pending` or `Failed`; order fulfillment is held (`OrderStatus = 'Hold'`) until `Payment.amount >= Order.totalAmount`. |
