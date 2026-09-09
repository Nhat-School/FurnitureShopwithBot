import React, { useState, useEffect, useMemo } from 'react';
import Header from './components/Header';
import Footer from './components/Footer';
import ProductCard from './components/ProductCard';
import SpatialRoomPlanner from './components/SpatialRoomPlanner';
import AIConsultantModal from './components/AIConsultantModal';
import CartDrawer from './components/CartDrawer';
import ProductDetailModal from './components/ProductDetailModal';
import OrderTrackModal from './components/OrderTrackModal';
import { Sparkles, Compass, Truck, Filter, ArrowRight, CheckCircle2, RotateCcw } from 'lucide-react';

const INITIAL_CATALOG = [
  {
    id: 'prod_sofa_nordic',
    sku: 'SOFA-ND-01',
    name: 'Sofa Văng Nordic Scandinavian 3 Chỗ',
    category_id: 'cat_living',
    category_slug: 'living-room',
    category_name: 'Phòng Khách',
    price: 14500000,
    stock: 8,
    safety_stock: 3,
    width_cm: 210,
    depth_cm: 85,
    height_cm: 82,
    weight_kg: 48,
    material: 'Gỗ Sồi Nga + Vải Nỉ Bouclé',
    wood_finish: 'Sồi Tự Nhiên (Natural Oak)',
    description: 'Thiết kế phong cách Bắc Âu thanh lịch với chân gỗ sồi nguyên khối tiện vát tinh tế, đệm mút D40 êm ái chống xẹp lún.',
    image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_table_oak',
    sku: 'COF-OAK-02',
    name: 'Bàn Trà Gỗ Sồi Ovan Kép Minimalist',
    category_id: 'cat_living',
    category_slug: 'living-room',
    category_name: 'Phòng Khách',
    price: 4200000,
    stock: 15,
    safety_stock: 5,
    width_cm: 110,
    depth_cm: 60,
    height_cm: 42,
    weight_kg: 18,
    material: 'Gỗ Sồi Tự Nhiên Bắc Mỹ',
    wood_finish: 'Sồi Tự Nhiên (Natural Oak)',
    description: 'Bàn trà đôi dáng ovan xếp tầng hiện đại, xử lý cạnh bo tròn an toàn cho nhà có trẻ nhỏ, bề mặt sơn lót PU chống thấm nước.',
    image_url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_tv_walnut',
    sku: 'TV-WAL-03',
    name: 'Kệ Tivi Gỗ Óc Chó Walnut Elegance',
    category_id: 'cat_living',
    category_slug: 'living-room',
    category_name: 'Phòng Khách',
    price: 11800000,
    stock: 5,
    safety_stock: 2,
    width_cm: 180,
    depth_cm: 40,
    height_cm: 50,
    weight_kg: 36,
    material: 'Gỗ Óc Chó Bắc Mỹ Tự Nhiên',
    wood_finish: 'Óc Chó (Dark Walnut)',
    description: 'Vân gỗ óc chó cuộn sóng sang trọng, ngăn kéo ray giảm chấn Hafele êm ái, khoang luồn dây điện thông minh giấu dây gọn gàng.',
    image_url: 'https://images.unsplash.com/photo-1601084881623-cdf9a8ea242c?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_dining_table',
    sku: 'DIN-SET-04',
    name: 'Bộ Bàn Ăn 6 Ghế Gỗ Sồi Tự Nhiên Harmony',
    category_id: 'cat_dining',
    category_slug: 'dining-room',
    category_name: 'Phòng Ăn',
    price: 18900000,
    stock: 6,
    safety_stock: 2,
    width_cm: 160,
    depth_cm: 80,
    height_cm: 75,
    weight_kg: 58,
    material: 'Gỗ Sồi Tự Nhiên + Da Nappa Cao Cấp',
    wood_finish: 'Sồi Lau Màu Óc Chó',
    description: 'Bàn ăn bo cạnh mềm mại kết hợp 6 ghế đệm da nappa êm ái, khả năng chịu lực vượt trội, thích hợp cho căn hộ và nhà phố hiện đại.',
    image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_bed_zen',
    sku: 'BED-ZEN-05',
    name: 'Giường Ngủ Phong Cách Nhật Zen Gỗ Tần Bì',
    category_id: 'cat_bedroom',
    category_slug: 'bedroom',
    category_name: 'Phòng Ngủ',
    price: 16500000,
    stock: 7,
    safety_stock: 3,
    width_cm: 185,
    depth_cm: 205,
    height_cm: 88,
    weight_kg: 65,
    material: 'Gỗ Tần Bì (Ash Wood)',
    wood_finish: 'Tần Bì Tự Nhiên Sáng Màu',
    description: 'Giường ngủ vạt phản giấu chân tạo hiệu ứng bay nhẹ nhàng, tựa đầu giường bọc mút êm ái tựa đọc sách trước khi ngủ.',
    image_url: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_wardrobe_lux',
    sku: 'WAR-LUX-06',
    name: 'Tủ Áo 4 Cánh Cửa Kính Khung Gỗ Óc Chó',
    category_id: 'cat_bedroom',
    category_slug: 'bedroom',
    category_name: 'Phòng Ngủ',
    price: 24500000,
    stock: 3,
    safety_stock: 2,
    width_cm: 200,
    depth_cm: 60,
    height_cm: 220,
    weight_kg: 95,
    material: 'Gỗ Óc Chó + Kính Cường Lực Trà',
    wood_finish: 'Óc Chó Bắc Mỹ',
    description: 'Tủ áo cao kịch trần tích hợp dải đèn LED cảm ứng mở cửa, cánh kính mờ sang trọng tôn vinh bộ sưu tập thời trang.',
    image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=80',
    is_featured: 0
  },
  {
    id: 'prod_desk_ergonomic',
    sku: 'DESK-ER-07',
    name: 'Bàn Làm Việc Gỗ Sồi Nâng Hạ Chiều Cao',
    category_id: 'cat_office',
    category_slug: 'office',
    category_name: 'Phòng Làm Việc',
    price: 9200000,
    stock: 12,
    safety_stock: 4,
    width_cm: 140,
    depth_cm: 70,
    height_cm: 74,
    weight_kg: 32,
    material: 'Mặt Gỗ Sồi Nga + Khung Thép Sơn Tĩnh Điện',
    wood_finish: 'Sồi Tự Nhiên',
    description: 'Mặt bàn bo góc chữ U công thái học, hỗ trợ nâng hạ điện tử 2 động cơ từ 70cm đến 118cm ghi nhớ 4 vị trí.',
    image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_shelf_geo',
    sku: 'SHELF-GE-08',
    name: 'Kệ Sách Tổ Ong Gỗ Tự Nhiên Modular',
    category_id: 'cat_office',
    category_slug: 'office',
    category_name: 'Phòng Làm Việc',
    price: 5600000,
    stock: 10,
    safety_stock: 3,
    width_cm: 120,
    depth_cm: 30,
    height_cm: 180,
    weight_kg: 26,
    material: 'Gỗ Cao Su Tự Nhiên Ghép Thanh Chuẩn AA',
    wood_finish: 'Vàng Gỗ Tự Nhiên',
    description: 'Các module lục giác đa năng có thể lắp ghép linh hoạt theo kích thước mảng tường, chịu tải 25kg mỗi ngăn.',
    image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=80',
    is_featured: 0
  }
];

export default function App() {
  const [products, setProducts] = useState(INITIAL_CATALOG);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWood, setSelectedWood] = useState('all');
  const [maxWidthFilter, setMaxWidthFilter] = useState(250);
  
  // Interactive state
  const [cart, setCart] = useState([]);
  const [plannerItems, setPlannerItems] = useState([INITIAL_CATALOG[0], INITIAL_CATALOG[1]]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isPlannerOpen, setIsPlannerOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [aiInitialPrompt, setAiInitialPrompt] = useState('');
  const [isTrackerOpen, setIsTrackerOpen] = useState(false);
  const [detailProduct, setDetailProduct] = useState(null);

  // Fetch products from serverless API if available
  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => {
        if (data?.products && data.products.length > 0) {
          setProducts(data.products);
        }
      })
      .catch(() => {
        // Keeps initial catalog
      });
  }, []);

  // Filtered products list
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const matchCat = selectedCategory === 'all' || 
                       p.category_slug === selectedCategory || 
                       p.category_id?.includes(selectedCategory);
      
      const matchSearch = !searchQuery || 
                          p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          p.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          p.sku.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchWood = selectedWood === 'all' || 
                        p.material.toLowerCase().includes(selectedWood) ||
                        p.wood_finish?.toLowerCase().includes(selectedWood);

      const matchWidth = p.width_cm <= maxWidthFilter;

      return matchCat && matchSearch && matchWood && matchWidth;
    });
  }, [products, selectedCategory, searchQuery, selectedWood, maxWidthFilter]);

  // Cart operations
  function handleAddToCart(product) {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item);
      }
      return [...prev, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  }

  function handleUpdateCartQty(id, qty) {
    if (qty <= 0) {
      setCart(prev => prev.filter(item => item.id !== id));
    } else {
      setCart(prev => prev.map(item => item.id === id ? { ...item, quantity: qty } : item));
    }
  }

  function handleRemoveFromCart(id) {
    setCart(prev => prev.filter(item => item.id !== id));
  }

  // 2D Spatial Planner operations
  function handleTogglePlanner(product) {
    setPlannerItems(prev => {
      const exists = prev.find(item => item.id === product.id);
      if (exists) {
        return prev.filter(item => item.id !== product.id);
      }
      return [...prev, product];
    });
  }

  function handleOpenAI(promptText = '') {
    setAiInitialPrompt(promptText);
    setIsAIOpen(true);
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF8F5]">
      {/* Navigation Header */}
      <Header
        cartCount={cart.reduce((s, i) => s + i.quantity, 0)}
        onOpenCart={() => setIsCartOpen(true)}
        onOpenAI={handleOpenAI}
        onOpenPlanner={() => setIsPlannerOpen(true)}
        onOpenTracker={() => setIsTrackerOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
      />

      <main className="flex-1">
        {/* Luxury Hero Banner */}
        <section className="relative overflow-hidden bg-gradient-to-b from-[#FAF8F5] via-[#F5EBE0]/60 to-[#FAF8F5] py-14 sm:py-20 border-b border-[#E8DFC8]">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
              
              {/* Left Hero Copy */}
              <div className="lg:col-span-7 space-y-6">
                <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#E3D5CA] text-[#582F0E] text-xs font-semibold border border-[#D5BDAF]">
                  <Sparkles className="w-4 h-4 text-[#8C5329]" />
                  <span>Giải Pháp Đo Lường Kích Thước & Khắc Phục Đổi Trả Bằng AI</span>
                </div>

                <h1 className="font-serif text-3xl sm:text-5xl font-bold text-[#2D241E] leading-[1.15]">
                  Nội Thất Gỗ Tự Nhiên Tinh Hoa & Trợ Lý Không Gian Thông Minh
                </h1>

                <p className="text-sm sm:text-base text-stone-600 leading-relaxed max-w-xl">
                  Loại bỏ nỗi lo bàn ghế quá khổ hoặc chắn lối đi. Trải nghiệm hệ thống mô phỏng 2D tính toán khoảng lọt lòng lối đi và chuyên gia AI tư vấn kiểu dáng, chất liệu gỗ sồi và óc chó chuẩn từng centimet.
                </p>

                {/* Hero CTAs */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    onClick={() => setIsPlannerOpen(true)}
                    className="px-6 py-3.5 bg-[#582F0E] hover:bg-[#43281C] text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition shadow-md"
                  >
                    <Compass className="w-4 h-4 text-[#D4A373]" />
                    <span>Mô Phỏng 2D Không Gian</span>
                  </button>

                  <button
                    onClick={() => handleOpenAI('Hãy tư vấn cho tôi cách chọn nội thất phòng khách có diện tích 25m2')}
                    className="px-6 py-3.5 bg-white hover:bg-[#F5EBE0] text-[#582F0E] rounded-xl text-xs font-bold uppercase tracking-wider border border-[#D5BDAF] flex items-center gap-2 transition shadow-xs"
                  >
                    <Sparkles className="w-4 h-4 text-[#8C5329]" />
                    <span>Tư Vấn Cùng FurniAI</span>
                  </button>
                </div>

                {/* Micro guarantees */}
                <div className="grid grid-cols-3 gap-4 pt-4 border-t border-[#D5BDAF]/60 text-xs text-stone-600">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Kiểm tra lối đi &gt; 75cm</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Minh bạch cước cồng kềnh</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>Giao hàng 2 người bốc xếp</span>
                  </div>
                </div>
              </div>

              {/* Right Hero Staging Preview */}
              <div className="lg:col-span-5 relative">
                <div className="relative rounded-3xl overflow-hidden border-2 border-[#D5BDAF] shadow-2xl aspect-4/3 bg-white">
                  <img
                    src="https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1000&q=80"
                    alt="Phòng khách Scandinavian"
                    className="w-full h-full object-cover"
                  />
                  {/* Floating badge */}
                  <div className="absolute bottom-4 left-4 right-4 bg-white/95 backdrop-blur-md p-3.5 rounded-2xl border border-[#D5BDAF] shadow-lg flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#8C5329] block">Bố cục khuyên dùng</span>
                      <p className="text-xs font-bold text-[#2D241E]">Phòng Khách 18m² (4.5m x 4.0m)</p>
                      <span className="text-[11px] text-emerald-700 font-medium">Lối đi giữa bàn & sofa: 85cm (Rộng rãi)</span>
                    </div>
                    <button
                      onClick={() => setIsPlannerOpen(true)}
                      className="p-2 rounded-xl bg-[#582F0E] text-white hover:bg-[#43281C] transition"
                    >
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

            </div>
          </div>
        </section>

        {/* Catalog & Filter Section */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          
          {/* Section Heading & Secondary Filters */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#E8DFC8]">
            <div>
              <h2 className="font-serif text-2xl font-bold text-[#2D241E]">
                Bộ Sưu Tập Nội Thất Theo Quy Cách
              </h2>
              <p className="text-xs text-stone-500 mt-1">
                Hiển thị {filteredProducts.length} sản phẩm nội thất có đầy đủ kích thước 3 chiều và chất liệu
              </p>
            </div>

            {/* Quick attribute filters */}
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-[#D5BDAF]">
                <Filter className="w-3.5 h-3.5 text-[#8C5329]" />
                <span className="text-stone-500 font-medium">Chất gỗ:</span>
                <select
                  value={selectedWood}
                  onChange={(e) => setSelectedWood(e.target.value)}
                  className="bg-transparent font-semibold text-[#582F0E] focus:outline-none"
                >
                  <option value="all">Tất cả loại gỗ</option>
                  <option value="sồi">Gỗ Sồi Bắc Mỹ (Oak)</option>
                  <option value="óc chó">Gỗ Óc Chó (Walnut)</option>
                  <option value="tần bì">Gỗ Tần Bì (Ash)</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-[#D5BDAF]">
                <span className="text-stone-500 font-medium">Chiều dài tối đa:</span>
                <span className="font-bold text-[#8C5329] font-mono">{maxWidthFilter}cm</span>
                <input
                  type="range"
                  min="100"
                  max="250"
                  step="10"
                  value={maxWidthFilter}
                  onChange={(e) => setMaxWidthFilter(parseInt(e.target.value))}
                  className="w-20 accent-[#8C5329]"
                />
              </div>

              {(selectedCategory !== 'all' || selectedWood !== 'all' || searchQuery || maxWidthFilter < 250) && (
                <button
                  onClick={() => {
                    setSelectedCategory('all');
                    setSelectedWood('all');
                    setSearchQuery('');
                    setMaxWidthFilter(250);
                  }}
                  className="flex items-center gap-1 text-[#8C5329] hover:underline px-2 py-1 text-xs"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Đặt lại lọc</span>
                </button>
              )}
            </div>
          </div>

          {/* Product Grid */}
          {filteredProducts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-[#D5BDAF] my-8">
              <p className="text-base font-serif font-bold text-[#582F0E]">Không tìm thấy sản phẩm phù hợp</p>
              <p className="text-xs text-stone-500 mt-1">Thử thay đổi từ khóa hoặc điều chỉnh khoảng kích thước lọc</p>
              <button
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedWood('all');
                  setSearchQuery('');
                  setMaxWidthFilter(250);
                }}
                className="mt-4 px-4 py-2 bg-[#8C5329] text-white rounded-xl text-xs font-semibold"
              >
                Xem Toàn Bộ Sản Phẩm
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 pt-8">
              {filteredProducts.map(product => (
                <ProductCard
                  key={product.id}
                  product={product}
                  onAddToCart={handleAddToCart}
                  onAddToPlanner={handleTogglePlanner}
                  isInPlanner={plannerItems.some(i => i.id === product.id)}
                  onOpenDetails={(p) => setDetailProduct(p)}
                />
              ))}
            </div>
          )}
        </section>
      </main>

      {/* Floating AI Consultant Widget (Bottom Right) */}
      <div className="fixed bottom-6 right-6 z-40">
        <button
          onClick={() => handleOpenAI()}
          className="group flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-[#8C5329] to-[#582F0E] text-white rounded-full shadow-2xl hover:shadow-amber-900/30 hover:scale-105 transition-all duration-300 border border-[#D4A373]/40"
        >
          <div className="relative">
            <Sparkles className="w-5 h-5 text-[#FFD166] animate-spin-slow" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full border-2 border-[#582F0E]"></span>
          </div>
          <span className="text-xs font-bold tracking-wide">FurniAI Tư Vấn</span>
        </button>
      </div>

      {/* Modals & Drawers */}
      <SpatialRoomPlanner
        isOpen={isPlannerOpen}
        onClose={() => setIsPlannerOpen(false)}
        plannerItems={plannerItems}
        onRemoveItem={(id) => setPlannerItems(prev => prev.filter(i => i.id !== id))}
        onAddToCart={handleAddToCart}
        onOpenAIWithAdvice={handleOpenAI}
      />

      <AIConsultantModal
        isOpen={isAIOpen}
        onClose={() => setIsAIOpen(false)}
        initialPrompt={aiInitialPrompt}
      />

      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cartItems={cart}
        onUpdateQuantity={handleUpdateCartQty}
        onRemoveItem={handleRemoveFromCart}
        onOrderSuccess={(order) => {
          setCart([]);
        }}
      />

      <ProductDetailModal
        product={detailProduct}
        onClose={() => setDetailProduct(null)}
        onAddToCart={handleAddToCart}
        onAddToPlanner={handleTogglePlanner}
        isInPlanner={plannerItems.some(i => i.id === detailProduct?.id)}
      />

      <OrderTrackModal
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
      />

      {/* Footer */}
      <Footer />
    </div>
  );
}
