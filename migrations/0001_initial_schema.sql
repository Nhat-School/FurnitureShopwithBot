-- D1 Database Schema for ABC Furniture Online Shop (Assignment 02)

-- 1. Categories
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    icon TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- 2. Products (Includes spatial dimensions and material attributes)
CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    sku TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category_id TEXT NOT NULL,
    price REAL NOT NULL,
    stock INTEGER NOT NULL DEFAULT 0,
    safety_stock INTEGER NOT NULL DEFAULT 5, -- Low-stock trigger (FR17)
    width_cm REAL NOT NULL,                 -- Dimension (FR04/FR05)
    depth_cm REAL NOT NULL,
    height_cm REAL NOT NULL,
    weight_kg REAL NOT NULL,
    material TEXT NOT NULL,                  -- Wood / Fabric type
    wood_finish TEXT,                        -- e.g. Natural Oak, Dark Walnut, Teak
    color_palette TEXT,                      -- JSON array e.g. ["#D4A373", "#CCD5AE"]
    description TEXT,
    image_url TEXT,
    images TEXT,                             -- JSON array of images
    is_featured INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- 3. Orders
CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    customer_name TEXT NOT NULL,
    customer_email TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    has_freight_elevator INTEGER DEFAULT 1,
    floor_number INTEGER DEFAULT 1,
    subtotal REAL NOT NULL,
    freight_surcharge REAL NOT NULL DEFAULT 0, -- Bulky freight (FR11)
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Paid',       -- Paid, Processing, Dispatched, Delivered
    tracking_code TEXT UNIQUE,
    payment_method TEXT DEFAULT 'CreditCard',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- 4. Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    product_id TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    unit_price REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 5. Inventory Logs (UC13)
CREATE TABLE IF NOT EXISTS inventory_logs (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    change_amount INTEGER NOT NULL,
    remaining_stock INTEGER NOT NULL,
    reason TEXT NOT NULL, -- "Supplier Restock", "Order Placed", "Audit Adjustment"
    staff_name TEXT DEFAULT 'Warehouse Staff',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 6. Product Reviews (FR21, UC11)
CREATE TABLE IF NOT EXISTS reviews (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL,
    customer_name TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
    dimensional_accuracy_rating INTEGER DEFAULT 5,
    material_quality_rating INTEGER DEFAULT 5,
    comment TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Seed Categories
INSERT OR IGNORE INTO categories (id, name, slug, description, icon) VALUES
('cat_living', 'Phòng Khách (Living Room)', 'living-room', 'Sofa, bàn trà, kệ tivi gỗ tự nhiên cao cấp', 'Sofa'),
('cat_dining', 'Phòng Ăn (Dining Room)', 'dining-room', 'Bàn ăn, ghế ăn gỗ sồi và óc chó nguyên khối', 'Utensils'),
('cat_bedroom', 'Phòng Ngủ (Bedroom)', 'bedroom', 'Giường ngủ, tủ quần áo, tab đầu giường hiện đại', 'Bed'),
('cat_office', 'Phòng Làm Việc (Home Office)', 'office', 'Bàn làm việc thông minh, kệ sách tinh tế', 'Briefcase');

-- Seed Products with Dimensions
INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
('prod_sofa_nordic', 'SOFA-ND-01', 'Sofa Văng Nordic Scandinavian 3 Chỗ', 'cat_living', 14500000, 8, 3, 210, 85, 82, 48, 'Khung Gỗ Sồi Nga + Vải Nỉ Bouclé', 'Sồi Tự Nhiên (Natural Oak)', '["#F3E9DC", "#C08552", "#5E503F"]', 'Thiết kế phong cách Bắc Âu thanh lịch với chân gỗ sồi nguyên khối tiện vát tinh tế, đệm mút D40 êm ái chống xẹp lún.', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80', 1),

('prod_table_oak', 'COF-OAK-02', 'Bàn Trà Gỗ Sồi Ovan Kép Minimalist', 'cat_living', 4200000, 15, 5, 110, 60, 42, 18, 'Gỗ Sồi Tự Nhiên Bắc Mỹ', 'Sồi Tự Nhiên (Natural Oak)', '["#D4A373", "#FAEDCD"]', 'Bàn trà đôi dáng ovan xếp tầng hiện đại, xử lý cạnh bo tròn an toàn cho nhà có trẻ nhỏ, bề mặt sơn lót PU chống thấm nước.', 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80', 1),

('prod_tv_walnut', 'TV-WAL-03', 'Kệ Tivi Gỗ Óc Chó Walnut Elegance', 'cat_living', 11800000, 5, 2, 180, 40, 50, 36, 'Gỗ Óc Chó Bắc Mỹ Tự Nhiên', 'Óc Chó (Dark Walnut)', '["#43281C", "#7F4F24"]', 'Vân gỗ óc chó cuộn sóng sang trọng, ngăn kéo ray giảm chấn Hafele êm ái, khoang luồn dây điện thông minh giấu dây gọn gàng.', 'https://images.unsplash.com/photo-1601084881623-cdf9a8ea242c?auto=format&fit=crop&w=1000&q=80', 1),

('prod_dining_table', 'DIN-SET-04', 'Bộ Bàn Ăn 6 Ghế Gỗ Sồi Tự Nhiên Harmony', 'cat_dining', 18900000, 6, 2, 160, 80, 75, 58, 'Gỗ Sồi Tự Nhiên + Da Nappa Cao Cấp', 'Sồi Lau Màu Óc Chó', '["#582F0E", "#7F4F24", "#DDA15E"]', 'Bàn ăn bo cạnh mềm mại kết hợp 6 ghế đệm da nappa êm ái, khả năng chịu lực vượt trội, thích hợp cho căn hộ và nhà phố hiện đại.', 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1000&q=80', 1),

('prod_bed_zen', 'BED-ZEN-05', 'Giường Ngủ Phong Cách Nhật Zen Gỗ Tần Bì', 'cat_bedroom', 16500000, 7, 3, 185, 205, 88, 65, 'Gỗ Tần Bì (Ash Wood)', 'Tần Bì Tự Nhiên Sáng Màu', '["#E9ECEF", "#DEE2E6", "#6C757D"]', 'Giường ngủ vạt phản giấu chân tạo hiệu ứng bay nhẹ nhàng, tựa đầu giường bọc mút êm ái tựa đọc sách trước khi ngủ.', 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80', 1),

('prod_wardrobe_lux', 'WAR-LUX-06', 'Tủ Áo 4 Cánh Cửa Kính Khung Gỗ Óc Chó', 'cat_bedroom', 24500000, 3, 2, 200, 60, 220, 95, 'Gỗ Óc Chó + Kính Cường Lực Trà', 'Óc Chó Bắc Mỹ', '["#3F2E23", "#222222"]', 'Tủ áo cao kịch trần tích hợp dải đèn LED cảm ứng mở cửa, cánh kính mờ sang trọng tôn vinh bộ sưu tập thời trang.', 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=80', 0),

('prod_desk_ergonomic', 'DESK-ER-07', 'Bàn Làm Việc Gỗ Sồi Nâng Hạ Chiều Cao', 'cat_office', 9200000, 12, 4, 140, 70, 74, 32, 'Mặt Gỗ Sồi Nga + Khung Thép Sơn Tĩnh Điện', 'Sồi Tự Nhiên', '["#E2D4B7", "#333333"]', 'Mặt bàn bo góc chữ U công thái học, hỗ trợ nâng hạ điện tử 2 động cơ từ 70cm đến 118cm ghi nhớ 4 vị trí.', 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1000&q=80', 1),

('prod_shelf_geo', 'SHELF-GE-08', 'Kệ Sách Tổ Ong Gỗ Tự Nhiên Modular', 'cat_office', 5600000, 10, 3, 120, 30, 180, 26, 'Gỗ Cao Su Tự Nhiên Ghép Thanh Chuẩn AA', 'Vàng Gỗ Tự Nhiên', '["#F3C68F", "#BC6C25"]', 'Các module lục giác đa năng có thể lắp ghép linh hoạt theo kích thước mảng tường, chịu tải 25kg mỗi ngăn.', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=80', 0);
