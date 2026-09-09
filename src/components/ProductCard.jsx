import React from 'react';
import { Ruler, Sparkles, Check, ShoppingBag, Box } from 'lucide-react';

export function formatVND(amount) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(amount);
}

export default function ProductCard({ 
  product, 
  onAddToCart, 
  onAddToPlanner,
  isInPlanner,
  onOpenDetails
}) {
  return (
    <div className="group bg-white rounded-2xl overflow-hidden border border-[#E8DFC8] hover:border-[#8C5329]/50 hover:shadow-xl transition-all duration-300 flex flex-col justify-between">
      <div>
        {/* Product Image & Badges */}
        <div className="relative aspect-4/3 overflow-hidden bg-[#F4EDE2] cursor-pointer" onClick={() => onOpenDetails(product)}>
          <img 
            src={product.image_url} 
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
          
          {/* Top Badges */}
          <div className="absolute top-3 left-3 flex flex-col gap-1.5">
            <span className="px-2.5 py-1 text-[11px] font-semibold rounded-full bg-white/90 backdrop-blur-xs text-[#582F0E] shadow-xs border border-[#D5BDAF]">
              {product.category_name || 'Nội thất'}
            </span>
            {product.stock <= (product.safety_stock || 3) && (
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/90 text-white shadow-xs">
                Chỉ còn {product.stock} chiếc
              </span>
            )}
          </div>

          {/* Dimension Tag */}
          <div className="absolute bottom-3 left-3 bg-[#2D241E]/80 backdrop-blur-xs text-white px-2.5 py-1 rounded-md text-[11px] font-mono flex items-center gap-1.5 shadow-sm">
            <Ruler className="w-3 h-3 text-[#D4A373]" />
            <span>{product.width_cm} × {product.depth_cm} × {product.height_cm} cm</span>
          </div>
        </div>

        {/* Product Content */}
        <div className="p-4">
          <div className="flex items-center justify-between text-xs text-[#8C5329] font-medium mb-1">
            <span>SKU: {product.sku}</span>
            <span className="text-stone-500 font-normal">{product.wood_finish}</span>
          </div>

          <h3 
            className="font-serif text-base font-bold text-[#2D241E] line-clamp-1 group-hover:text-[#8C5329] transition-colors cursor-pointer"
            onClick={() => onOpenDetails(product)}
          >
            {product.name}
          </h3>

          <p className="text-xs text-stone-500 mt-1 line-clamp-2 leading-relaxed">
            {product.description}
          </p>

          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-lg font-bold text-[#8C5329]">
              {formatVND(product.price)}
            </span>
            <span className="text-[11px] text-stone-400">
              Khối lượng: ~{product.weight_kg}kg
            </span>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="p-4 pt-0 grid grid-cols-2 gap-2">
        <button
          onClick={() => onAddToPlanner(product)}
          className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 border transition ${
            isInPlanner 
              ? 'bg-[#E3D5CA] text-[#582F0E] border-[#D5BDAF]' 
              : 'bg-white hover:bg-[#F5EBE0] text-[#582F0E] border-[#D5BDAF]'
          }`}
        >
          {isInPlanner ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>Đã Trong Phòng</span>
            </>
          ) : (
            <>
              <Box className="w-3.5 h-3.5 text-[#8C5329]" />
              <span>Thử Không Gian</span>
            </>
          )}
        </button>

        <button
          onClick={() => onAddToCart(product)}
          className="px-3 py-2 rounded-xl text-xs font-semibold bg-[#582F0E] hover:bg-[#43281C] text-white flex items-center justify-center gap-1.5 transition shadow-xs"
        >
          <ShoppingBag className="w-3.5 h-3.5" />
          <span>Thêm Giỏ Hàng</span>
        </button>
      </div>
    </div>
  );
}
