import React, { useState } from 'react';
import { X, Search, Truck, CheckCircle2, Clock, MapPin, PackageCheck } from 'lucide-react';

export default function OrderTrackModal({ isOpen, onClose }) {
  const [trackingCode, setTrackingCode] = useState('ABC-VN-83921');
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleSearch(e) {
    e?.preventDefault();
    if (!trackingCode.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${trackingCode.trim()}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingData(data);
      } else {
        throw new Error('Order not found');
      }
    } catch (err) {
      // Mock tracking timeline
      setTrackingData({
        trackingCode: trackingCode.toUpperCase(),
        status: 'Đang Vận Chuyển Chuyên Dụng (In Transit)',
        carrier: 'Đội xe vận tải nội thất cồng kềnh ABC',
        estimatedDelivery: '14:00 - 17:00 ngày mai',
        timeline: [
          { time: '14:30 Hôm qua', status: 'Xác nhận đơn hàng', desc: 'Thanh toán thành công, kiểm tra kích thước lọt lòng thang máy.' },
          { time: '09:15 Hôm nay', status: 'Xuất kho phân loại', desc: 'Đóng kiện góc gỗ, bọc màng co PE 3 lớp chống ẩm.' },
          { time: '13:00 Hôm nay', status: 'Đang trung chuyển', desc: 'Xe tải chuyên dụng 2.5 tấn đang di chuyển theo lộ trình.' }
        ]
      });
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#E8DFC8]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Truck className="w-5 h-5 text-[#D4A373]" />
            <h3 className="font-serif text-base font-bold">Theo Dõi Đơn Hàng Cồng Kềnh</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input */}
        <div className="p-6 space-y-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={trackingCode}
              onChange={(e) => setTrackingCode(e.target.value)}
              placeholder="Nhập mã vận đơn (VD: ABC-VN-83921)..."
              className="flex-1 px-4 py-2.5 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs uppercase font-mono focus:ring-1 focus:ring-[#8C5329]"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2.5 bg-[#582F0E] text-white rounded-xl text-xs font-semibold hover:bg-[#43281C] transition shadow-xs flex items-center gap-1.5"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Tra Cứu</span>
            </button>
          </form>

          {/* Results */}
          {trackingData ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-[#F5EBE0] border border-[#D5BDAF] space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Mã vận đơn:</span>
                  <span className="font-mono font-bold text-[#8C5329]">{trackingData.trackingCode}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Trạng thái hiện tại:</span>
                  <span className="font-semibold text-emerald-700">{trackingData.status}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-stone-500">Dự kiến giao:</span>
                  <span className="font-semibold text-[#2D241E]">{trackingData.estimatedDelivery}</span>
                </div>
              </div>

              {/* Timeline */}
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-[#2D241E]">Lịch Trình Vận Chuyển</h4>
                <div className="relative pl-6 space-y-4 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#D5BDAF]">
                  {trackingData.timeline.map((item, idx) => (
                    <div key={idx} className="relative">
                      <div className="absolute -left-6 top-1 w-4 h-4 rounded-full bg-[#8C5329] text-white flex items-center justify-center text-[9px] shadow-xs">
                        ✓
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#2D241E]">{item.status}</span>
                          <span className="text-[10px] text-stone-400 font-mono">{item.time}</span>
                        </div>
                        <p className="text-[11px] text-stone-600 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-stone-400 text-xs">
              Nhập mã vận đơn được cung cấp khi đặt hàng để xem lộ trình bốc dỡ và xe vận tải.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
