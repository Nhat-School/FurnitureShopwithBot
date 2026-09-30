## 2026-09-29T16:21:19Z
You are an Explorer designing the D1 database migration for Milestone 1 (Database Schema & Domain Models).
Your working directory is: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema
Parent conversation ID: 2b9ce9ab-84d4-452b-a6f9-ba8a04f45219
Read ORIGINAL_REQUEST.md at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/ORIGINAL_REQUEST.md
Read PROJECT.md at: /Users/nhaterik/CloudflareProjects/Furproject/PROJECT.md
Read existing schema at: /Users/nhaterik/CloudflareProjects/Furproject/migrations/0001_initial_schema.sql
Read domain specs report at: /Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/spec_miner_domain/domain_specs_report.md

Task:
Formulate the exact SQL DDL statements for `migrations/0002_domain_schema.sql` to support:
1. `users` table: id, email, auth_provider, provider_subject, display_name, first_name, mid_name, last_name, phone, avatar_url, role, created_at, updated_at. Include unique index `idx_users_auth_provider_subject` on (auth_provider, provider_subject) WHERE provider_subject IS NOT NULL.
2. `customers` table: id, user_id (FK to users on delete cascade unique), customer_type, loyalty_points, created_at.
3. `addresses` table: id, user_id (FK to users on delete cascade), recipient_name, phone, street, ward, district, city_province, postal_code, is_default, created_at.
4. `carts` table: id, user_id (FK to carts on delete cascade unique), created_at, updated_at.
5. `cart_items` table: id, cart_id (FK to carts on delete cascade), product_id (FK to products on delete cascade), quantity, created_at, updated_at. Unique index on (cart_id, product_id).
6. Linking `orders` to `users`: Alter orders table or ensure customer_id foreign key can be recorded.
7. `shipments` table: id, order_id (FK to orders on delete cascade unique), carrier, tracking_number, shipping_status, shipping_cost, recipient_name, phone, delivery_address, estimated_delivery, created_at, updated_at.
8. `order_payments` table: id, order_id (FK to orders on delete cascade unique), payment_method, transaction_id, payment_status, amount, created_at, updated_at.

Ensure SQLite/Cloudflare D1 compatibility, proper foreign keys, constraints, and indexes.

Deliverables:
Write your findings and exact SQL draft to:
/Users/nhaterik/CloudflareProjects/Furproject/.agents/teamwork/explorer_m1_schema/ddl_plan.md
Also write handoff.md in your working directory.
When finished, send a message to parent (2b9ce9ab-84d4-452b-a6f9-ba8a04f45219).
