import React from 'react';
import { ShoppingBag, Sparkles, Compass, Truck, Search, Mic, Camera } from 'lucide-react';

export default function Header({ 
  cartCount, 
  onOpenCart, 
  onOpenAI, 
  onOpenPlanner, 
  onOpenTracker,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory
}) {
  const categories = [
    { id: 'all', name: 'Tất Cả' },
    { id: 'living-room', name: 'Phòng Khách' },
    { id: 'dining-room', name: 'Phòng Ăn' },
    { id: 'bedroom', name: 'Phòng Ngủ' },
    { id: 'office', name: 'Phòng Làm Việc' }
  ];

  return (
    <header className="sticky top-0 z-40 bg-[#FAF8F5]/90 backdrop-blur-md border-b border-[#E8DFC8]">
      {/* Top Announcement Bar */}
      <div className="bg-[#2D241E] text-[#E8DFC8] text-xs py-1.5 px-4 text-center flex items-center justify-center gap-3">
        <span className="inline-flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-[#D4A373]" />
          <span>Cloudflare Workers AI Powered: Trải nghiệm tư vấn nội thất & đo lường không gian 2D miễn phí</span>
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}>
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#8C5329] to-[#582F0E] text-white flex items-center justify-center shadow-md font-serif text-xl font-bold">
              A
            </div>
            <div>
              <span className="font-serif text-2xl font-bold tracking-wider text-[#2D241E] block leading-none">
                ABC FURNITURE
              </span>
              <span className="text-[10px] tracking-widest text-[#8C5329] font-medium uppercase mt-0.5 block">
                Atelier & AI Spatial Fitting
              </span>
            </div>
          </div>

          {/* Search Bar with Voice & Visual inputs (UC03) */}
          <div className="hidden md:flex flex-1 max-w-md mx-8 relative">
            <div className="relative w-full">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8C5329]/60" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm bàn trà sồi, sofa nỉ, kích thước < 2m..."
                className="w-full pl-10 pr-20 py-2.5 bg-white/80 border border-[#D5BDAF] rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-[#8C5329]/40 transition shadow-xs"
              />
              <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                <button 
                  title="Tìm kiếm bằng giọng nói (Workers AI Whisper)"
                  onClick={() => onOpenAI('Tôi muốn tìm mẫu sofa văng gỗ sồi cho phòng khách dài 4 mét')}
                  className="p-1.5 text-[#8C5329] hover:bg-[#F5EBE0] rounded-full transition"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button 
                  title="Tìm kiếm bằng hình ảnh (Multimodal Vision)"
                  onClick={() => onOpenAI('Tôi muốn phân tích hình ảnh phòng khách để chọn bàn ghế phù hợp')}
                  className="p-1.5 text-[#8C5329] hover:bg-[#F5EBE0] rounded-full transition"
                >
                  <Camera className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex items-center gap-2.5">
            {/* 2D Spatial Room Planner Button */}
            <button
              onClick={onOpenPlanner}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#F5EBE0] text-[#582F0E] hover:bg-[#E3D5CA] transition border border-[#D5BDAF]"
            >
              <Compass className="w-4 h-4 text-[#8C5329]" />
              <span className="hidden sm:inline">Mô Phỏng 2D Phòng</span>
            </button>

            {/* AI Assistant Chatbot Button */}
            <button
              onClick={() => onOpenAI()}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-gradient-to-r from-[#8C5329] to-[#70401E] text-white hover:opacity-95 shadow-xs transition"
            >
              <Sparkles className="w-4 h-4 text-[#FFD166]" />
              <span>AI Tư Vấn</span>
            </button>

            {/* Order Tracking Button */}
            <button
              onClick={onOpenTracker}
              title="Tra cứu đơn hàng cồng kềnh"
              className="p-2 text-[#582F0E] hover:bg-[#F5EBE0] rounded-lg transition"
            >
              <Truck className="w-5 h-5" />
            </button>

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-2 text-[#582F0E] hover:bg-[#F5EBE0] rounded-lg transition"
            >
              <ShoppingBag className="w-5 h-5" />
              {cartCount > 0 && (
                <span className="absolute -top-1 -right-1 bg-[#C08552] text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-xs">
                  {cartCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Category Filter Nav */}
        <div className="flex items-center gap-2 overflow-x-auto pb-3 pt-1 scrollbar-none">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[#582F0E] text-white shadow-xs'
                  : 'bg-white/60 text-[#582F0E] hover:bg-white border border-[#E8DFC8]'
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
    </header>
  );
}
