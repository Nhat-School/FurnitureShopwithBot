import React, { useState, useMemo } from 'react';
import { X, Sliders, AlertTriangle, CheckCircle2, Info, Sparkles, Trash2, Box } from 'lucide-react';
import { formatVND } from './ProductCard';

export default function SpatialRoomPlanner({ 
  isOpen, 
  onClose, 
  plannerItems, 
  onRemoveItem,
  onAddToCart,
  onOpenAIWithAdvice
}) {
  const [roomLength, setRoomLength] = useState(4.2); // meters
  const [roomWidth, setRoomWidth] = useState(3.6);  // meters
  const [roomType, setRoomType] = useState('living'); // living, bedroom, dining

  // Calculations
  const calculations = useMemo(() => {
    const area = parseFloat((roomLength * roomWidth).toFixed(2));
    
    let totalFootprint = 0;
    let maxDepth = 0;
    plannerItems.forEach(item => {
      const itemArea = (item.width_cm / 100) * (item.depth_cm / 100);
      totalFootprint += itemArea;
      if (item.depth_cm > maxDepth) maxDepth = item.depth_cm;
    });

    totalFootprint = parseFloat(totalFootprint.toFixed(2));
    const occupancyRatio = parseFloat(((totalFootprint / area) * 100).toFixed(1));

    // Clearance check:
    // Minimum corridor threshold is 75cm (0.75m)
    const shortestWall = Math.min(roomLength, roomWidth);
    const corridorRemaining = parseFloat((shortestWall - (maxDepth / 100 || 0.8)).toFixed(2));
    const isCorridorClear = corridorRemaining >= 0.75;
    const isOccupancyHealthy = occupancyRatio >= 15 && occupancyRatio <= 40;

    return {
      area,
      totalFootprint,
      occupancyRatio,
      corridorRemaining: Math.round(corridorRemaining * 100),
      isCorridorClear,
      isOccupancyHealthy
    };
  }, [roomLength, roomWidth, plannerItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col border border-[#E8DFC8]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-[#8C5329]/40 border border-[#D4A373]/30">
              <Box className="w-5 h-5 text-[#D4A373]" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold">Mô Phỏng 2D & Kiểm Tra Lối Đi Không Gian</h2>
              <p className="text-xs text-stone-300">Tính toán tỷ lệ lọt lòng, diện tích chiếm sàn và kích thước an toàn</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition text-stone-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12 flex-1 overflow-y-auto">
          
          {/* Left: Dimension Controls & Selected Items (4 cols) */}
          <div className="lg:col-span-5 p-6 bg-[#FAF8F5] border-r border-[#E8DFC8] space-y-5">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C5329] mb-3 flex items-center gap-2">
                <Sliders className="w-3.5 h-3.5" />
                1. Kích Thước Phòng Của Bạn
              </h3>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-xl border border-[#D5BDAF]">
                  <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                    Chiều Dài: <span className="text-[#8C5329] font-bold">{roomLength}m</span>
                  </label>
                  <input 
                    type="range" 
                    min="2.5" 
                    max="8.0" 
                    step="0.1" 
                    value={roomLength}
                    onChange={(e) => setRoomLength(parseFloat(e.target.value))}
                    className="w-full accent-[#8C5329]"
                  />
                </div>

                <div className="bg-white p-3 rounded-xl border border-[#D5BDAF]">
                  <label className="text-[11px] font-semibold text-stone-600 block mb-1">
                    Chiều Rộng: <span className="text-[#8C5329] font-bold">{roomWidth}m</span>
                  </label>
                  <input 
                    type="range" 
                    min="2.5" 
                    max="7.0" 
                    step="0.1" 
                    value={roomWidth}
                    onChange={(e) => setRoomWidth(parseFloat(e.target.value))}
                    className="w-full accent-[#8C5329]"
                  />
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="p-4 rounded-2xl bg-white border border-[#E8DFC8] shadow-xs space-y-3">
              <h4 className="text-xs font-bold text-[#2D241E] flex items-center justify-between">
                <span>Chỉ Số Tối Ưu Không Gian</span>
                <span className="text-[11px] font-normal text-stone-500">Phòng: {calculations.area} m²</span>
              </h4>

              {/* Progress bar occupancy */}
              <div>
                <div className="flex justify-between text-xs font-medium mb-1">
                  <span>Chiếm Dụng Sàn</span>
                  <span className={calculations.occupancyRatio > 40 ? 'text-amber-600 font-bold' : 'text-emerald-600 font-bold'}>
                    {calculations.occupancyRatio}% {calculations.occupancyRatio > 40 ? '(Hơi Dày)' : '(Lý Tưởng)'}
                  </span>
                </div>
                <div className="w-full bg-stone-200 h-2 rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-300 ${calculations.occupancyRatio > 40 ? 'bg-amber-500' : 'bg-emerald-600'}`}
                    style={{ width: `${Math.min(calculations.occupancyRatio, 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-stone-400 mt-1 block">Tiêu chuẩn vàng nội thất: 25% - 40% diện tích sàn</span>
              </div>

              {/* Walkway Clearance Alert */}
              <div className={`p-3 rounded-xl flex items-start gap-2.5 text-xs ${
                calculations.isCorridorClear ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
              }`}>
                {calculations.isCorridorClear ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <span className="font-bold block">
                    Lối đi ước tính: ~{calculations.corridorRemaining} cm
                  </span>
                  <span className="text-[11px] leading-tight block mt-0.5">
                    {calculations.isCorridorClear 
                      ? 'Đạt chuẩn thông thoáng (>= 75cm). Bạn có thể thoải mái di chuyển mà không bị va chạm.' 
                      : 'Cảnh báo: Lối đi hẹp dưới 75cm. Nên ưu tiên kê sát tường hoặc chọn bàn trà nhỏ hơn.'}
                  </span>
                </div>
              </div>
            </div>

            {/* Selected Items in Room */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C5329] mb-2 flex items-center justify-between">
                <span>Đồ Đang Đặt Trong Phòng ({plannerItems.length})</span>
                <span className="text-[10px] text-stone-400 font-normal">Tổng: {calculations.totalFootprint} m²</span>
              </h3>

              {plannerItems.length === 0 ? (
                <div className="text-center py-6 bg-white rounded-xl border border-dashed border-[#D5BDAF] text-xs text-stone-400">
                  Chưa có sản phẩm nào. Hãy bấm "Thử Không Gian" ở danh sách sản phẩm bên ngoài.
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {plannerItems.map(item => (
                    <div key={item.id} className="bg-white p-2.5 rounded-xl border border-[#E8DFC8] flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <img src={item.image_url} alt="" className="w-10 h-10 object-cover rounded-lg" />
                        <div>
                          <p className="text-xs font-bold text-[#2D241E] line-clamp-1">{item.name}</p>
                          <p className="text-[11px] text-stone-500 font-mono">
                            {item.width_cm}x{item.depth_cm} cm
                          </p>
                        </div>
                      </div>
                      <button 
                        onClick={() => onRemoveItem(item.id)}
                        className="p-1 text-stone-400 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: 2D Interactive Canvas & Layout Visualizer (7 cols) */}
          <div className="lg:col-span-7 p-6 flex flex-col justify-between space-y-4 bg-white">
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-stone-500">Mặt Bằng Bố Trí Không Gian (2D Floorplan)</span>
                <div className="flex items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1 text-emerald-700">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Lối đi thoáng
                  </span>
                  <span className="inline-flex items-center gap-1 text-[#8C5329]">
                    <span className="w-2.5 h-2.5 rounded-full bg-[#8C5329]"></span> Đồ nội thất
                  </span>
                </div>
              </div>

              {/* Visual Scaled Floor Canvas */}
              <div className="relative w-full aspect-4/3 bg-[#FAF8F5] border-2 border-[#D5BDAF] rounded-2xl overflow-hidden p-6 flex flex-col justify-between shadow-inner">
                {/* Door Marker */}
                <div className="absolute top-0 left-12 bg-emerald-600 text-white text-[9px] px-2 py-0.5 rounded-b font-mono tracking-wider">
                  CỬA VÀO CHÍNH (DOOR)
                </div>

                {/* Grid guidelines */}
                <div className="absolute inset-0 grid grid-cols-6 grid-rows-6 pointer-events-none opacity-10">
                  {Array.from({ length: 36 }).map((_, i) => (
                    <div key={i} className="border border-[#8C5329]" />
                  ))}
                </div>

                {/* Simulated Furniture Arrangement Area */}
                <div className="relative w-full h-full flex flex-col items-center justify-center gap-4">
                  {plannerItems.length === 0 ? (
                    <div className="text-center text-stone-400">
                      <Box className="w-10 h-10 mx-auto text-[#D5BDAF] mb-2" />
                      <p className="text-sm font-medium">Phòng Trống ({roomLength}m × {roomWidth}m)</p>
                      <p className="text-xs mt-1">Chọn sofa, bàn trà hoặc giường từ catalog để xem tỷ lệ lọt lòng</p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-3 w-full max-w-md">
                      {plannerItems.map((item, idx) => (
                        <div 
                          key={item.id}
                          className="bg-gradient-to-r from-[#D4A373]/30 to-[#8C5329]/20 border-2 border-[#8C5329] rounded-xl p-3 text-center shadow-xs transition-all hover:scale-[1.02]"
                          style={{
                            width: `${Math.min(95, Math.max(45, (item.width_cm / (roomLength * 100)) * 100))}%`
                          }}
                        >
                          <span className="text-xs font-bold text-[#582F0E] block">{item.name}</span>
                          <span className="text-[10px] text-stone-600 font-mono">
                            {item.width_cm} × {item.depth_cm} cm
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Dimension Dimensions Overlay */}
                <div className="flex justify-between items-center text-[10px] font-mono text-stone-500 pt-2 border-t border-dashed border-[#D5BDAF]">
                  <span>Dài: {roomLength}m</span>
                  <span>Rộng: {roomWidth}m</span>
                  <span>Lối Đi Giữa: ~{calculations.corridorRemaining}cm</span>
                </div>
              </div>
            </div>

            {/* Bottom Actions & AI Advice trigger */}
            <div className="p-4 rounded-2xl bg-[#F5EBE0] border border-[#D5BDAF] flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#8C5329] text-white flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-[#FFD166]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-[#582F0E]">Hỏi Ý Kiến Chuyên Gia AI Về Bố Cục Này?</p>
                  <p className="text-[11px] text-stone-600">Phân tích chuyên sâu về phong thủy, ánh sáng và màu gỗ.</p>
                </div>
              </div>

              <button
                onClick={() => {
                  onClose();
                  onOpenAIWithAdvice(`Tôi đang bố trí phòng diện tích ${calculations.area}m² (${roomLength}m x ${roomWidth}m) với các món đồ: ${plannerItems.map(i => i.name).join(', ')}. Hãy tư vấn chi tiết cách đặt và phối màu hợp lý.`);
                }}
                className="px-4 py-2 bg-[#582F0E] text-white text-xs font-semibold rounded-xl hover:bg-[#43281C] transition whitespace-nowrap shadow-xs"
              >
                Hỏi FurniAI
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
