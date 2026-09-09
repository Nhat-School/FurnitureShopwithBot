import React, { useState } from 'react';
import { X, Ruler, ShieldCheck, Box, ShoppingBag, Check, Star, MessageSquare } from 'lucide-react';
import { formatVND } from './ProductCard';

export default function ProductDetailModal({ 
  product, 
  onClose, 
  onAddToCart, 
  onAddToPlanner,
  isInPlanner 
}) {
  const [activeTab, setActiveTab] = useState('specs'); // specs, reviews

  if (!product) return null;

  const sampleReviews = [
    { name: 'Nguyễn Tuấn Anh', rating: 5, accuracy: 5, date: '1 tuần trước', comment: 'Kích thước chuẩn xác từng centimet. Gỗ sồi vân rất đều và sáng, đệm mút ngồi êm không bị lún.' },
    { name: 'Trần Thị Mai', rating: 5, accuracy: 5, date: '2 tuần trước', comment: 'Đội giao hàng 2 người bốc lên tận tầng 3 rất cẩn thận, bọc góc xốp kỹ nên không trầy xước chút nào.' }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-[#E8DFC8]">
        
        {/* Top Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <span className="text-xs font-mono text-[#D4A373]">SKU: {product.sku}</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-[#FAF8F5]">
          {/* Left: Product Image */}
          <div className="space-y-3">
            <div className="aspect-4/3 rounded-2xl overflow-hidden border border-[#D5BDAF] shadow-sm bg-white">
              <img src={product.image_url} alt={product.name} className="w-full h-full object-cover" />
            </div>

            {/* Dimensional Blueprint Summary */}
            <div className="p-4 bg-white rounded-2xl border border-[#E8DFC8] space-y-2">
              <h4 className="text-xs font-bold text-[#582F0E] flex items-center gap-1.5">
                <Ruler className="w-4 h-4 text-[#8C5329]" />
                <span>Quy Cách Kích Thước Sản Phẩm</span>
              </h4>
              <div className="grid grid-cols-3 gap-2 text-center text-xs pt-1">
                <div className="p-2 bg-[#FAF8F5] rounded-xl border border-[#E8DFC8]">
                  <span className="text-[10px] text-stone-500 block">Chiều Dài</span>
                  <span className="font-bold text-[#8C5329] font-mono">{product.width_cm} cm</span>
                </div>
                <div className="p-2 bg-[#FAF8F5] rounded-xl border border-[#E8DFC8]">
                  <span className="text-[10px] text-stone-500 block">Chiều Sâu</span>
                  <span className="font-bold text-[#8C5329] font-mono">{product.depth_cm} cm</span>
                </div>
                <div className="p-2 bg-[#FAF8F5] rounded-xl border border-[#E8DFC8]">
                  <span className="text-[10px] text-stone-500 block">Chiều Cao</span>
                  <span className="font-bold text-[#8C5329] font-mono">{product.height_cm} cm</span>
                </div>
              </div>
              <p className="text-[11px] text-stone-500 text-center pt-1">
                Khối lượng: ~{product.weight_kg}kg | Thể tích đóng kiện: ~{((product.width_cm * product.depth_cm * product.height_cm) / 1000000).toFixed(3)} m³
              </p>
            </div>
          </div>

          {/* Right: Info & Details */}
          <div className="space-y-4 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 text-[10px] font-bold rounded-full bg-[#E3D5CA] text-[#582F0E]">
                  {product.category_name}
                </span>
                <span className="text-xs text-stone-500">{product.wood_finish}</span>
              </div>

              <h2 className="font-serif text-xl font-bold text-[#2D241E] mt-2">
                {product.name}
              </h2>

              <div className="mt-2 text-2xl font-bold text-[#8C5329]">
                {formatVND(product.price)}
              </div>

              <p className="text-xs text-stone-600 leading-relaxed mt-3">
                {product.description}
              </p>

              {/* Material & Durability highlight */}
              <div className="mt-4 p-3.5 rounded-2xl bg-white border border-[#E8DFC8] space-y-2 text-xs">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#2D241E]">Chất Liệu: </span>
                    <span className="text-stone-600">{product.material}</span>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Box className="w-4 h-4 text-[#8C5329] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-[#2D241E]">Bảo Hành: </span>
                    <span className="text-stone-600">36 tháng kết cấu gỗ, bảo trì trọn đời</span>
                  </div>
                </div>
              </div>

              {/* Reviews preview (FR21, UC11) */}
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#2D241E]">
                  <span>Đánh Giá Từ Khách Mua Hàng</span>
                  <span className="flex items-center gap-1 text-amber-500">
                    <Star className="w-3.5 h-3.5 fill-amber-500" />
                    <span>5.0 (28 lượt)</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {sampleReviews.map((rev, i) => (
                    <div key={i} className="p-2.5 bg-white rounded-xl border border-[#E8DFC8] text-[11px]">
                      <div className="flex justify-between font-semibold text-[#582F0E]">
                        <span>{rev.name}</span>
                        <span className="text-[10px] text-stone-400">{rev.date}</span>
                      </div>
                      <p className="text-stone-600 mt-0.5">{rev.comment}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-4 border-t border-[#E8DFC8] grid grid-cols-2 gap-2">
              <button
                onClick={() => onAddToPlanner(product)}
                className={`py-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 border transition ${
                  isInPlanner 
                    ? 'bg-[#E3D5CA] text-[#582F0E] border-[#D5BDAF]' 
                    : 'bg-white hover:bg-[#F5EBE0] text-[#582F0E] border-[#D5BDAF]'
                }`}
              >
                {isInPlanner ? <Check className="w-4 h-4 text-emerald-600" /> : <Box className="w-4 h-4 text-[#8C5329]" />}
                <span>{isInPlanner ? 'Đã Trong Phòng 2D' : 'Thử Không Gian 2D'}</span>
              </button>

              <button
                onClick={() => {
                  onAddToCart(product);
                  onClose();
                }}
                className="py-3 rounded-xl text-xs font-semibold bg-[#582F0E] hover:bg-[#43281C] text-white flex items-center justify-center gap-2 transition shadow-md"
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Thêm Vào Giỏ Hàng</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
