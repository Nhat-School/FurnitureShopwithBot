import React, { useState, useEffect } from 'react';
import { 
  X, 
  Package, 
  Truck, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ExternalLink, 
  ShoppingBag, 
  ArrowRight, 
  CreditCard, 
  MapPin, 
  RefreshCw 
} from 'lucide-react';
import { formatVND } from './ProductCard';

export default function OrderHistoryModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onOpenAuth, 
  onTrackOrder 
}) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copiedCode, setCopiedCode] = useState(null);

  useEffect(() => {
    if (isOpen && currentUser) {
      fetchOrders();
    }
  }, [isOpen, currentUser]);

  async function fetchOrders() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/customer/orders', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (res.status === 401) {
        setError('unauthorized');
        setOrders([]);
        return;
      }

      if (!res.ok) {
        throw new Error(`Lỗi tải đơn hàng: mã ${res.status}`);
      }

      const data = await res.json();
      setOrders(data.orders || []);
    } catch (err) {
      console.warn('Lỗi kết nối /api/customer/orders:', err);
      setError(err.message || 'Không thể tải lịch sử đơn hàng.');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(code) {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  }

  function renderStatusBadge(status) {
    const s = (status || '').toLowerCase();
    if (s === 'paid' || s === 'đã thanh toán') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Đã Thanh Toán</span>
        </span>
      );
    }
    if (s === 'delivered' || s === 'hoàn thành') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
          <span>Giao Hàng Thành Công</span>
        </span>
      );
    }
    if (s === 'processing' || s === 'đang xử lý') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
          <Clock className="w-3 h-3 text-amber-600" />
          <span>Đang Xử Lý & Đóng Kiện</span>
        </span>
      );
    }
    if (s === 'cancelled' || s === 'đã hủy') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700 border border-red-200">
          <AlertCircle className="w-3 h-3 text-red-500" />
          <span>Đã Hủy</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-stone-100 text-stone-700 border border-stone-300">
        <Clock className="w-3 h-3 text-stone-500" />
        <span>{status || 'Chờ Xác Nhận'}</span>
      </span>
    );
  }

  function renderShippingBadge(shippingStatus) {
    const s = (shippingStatus || '').toLowerCase();
    if (s === 'delivered' || s === 'đã giao') {
      return <span className="text-emerald-700 font-semibold">Đã giao tận phòng</span>;
    }
    if (s === 'in_transit' || s === 'shipping' || s === 'shipped') {
      return <span className="text-blue-700 font-semibold">Xe chuyên dụng đang di chuyển</span>;
    }
    return <span className="text-amber-700 font-semibold">Đang chuẩn bị tại kho bãi</span>;
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl overflow-hidden border border-[#E8DFC8] flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <Package className="w-5 h-5 text-[#D4A373]" />
            <div>
              <h3 className="font-serif text-base font-bold">Lịch Sử Đơn Hàng Của Bạn</h3>
              <p className="text-[11px] text-stone-300">
                Lưu trữ giá gốc bất biến tại thời điểm đặt hàng & hành trình bốc xếp
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && (
              <button 
                onClick={fetchOrders} 
                disabled={loading}
                title="Làm mới danh sách"
                className="p-1.5 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition cursor-pointer"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5 bg-[#FAF8F5]">
          
          {/* Guest Unauthenticated Guard */}
          {!currentUser ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-dashed border-[#D5BDAF] space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#F5EBE0] text-[#8C5329] flex items-center justify-center mx-auto shadow-inner">
                <Package className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-serif font-bold text-base text-[#2D241E]">
                  Vui lòng đăng nhập để xem lịch sử mua hàng
                </h4>
                <p className="text-xs text-stone-500">
                  Lịch sử đơn hàng, biên lai điện tử và mã vận đơn cồng kềnh được liên kết trực tiếp với tài khoản của bạn.
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (onOpenAuth) onOpenAuth();
                }}
                className="px-6 py-2.5 bg-[#582F0E] hover:bg-[#43281C] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
              >
                <span>Đăng Nhập Ngay</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : loading && orders.length === 0 ? (
            /* Loading Skeleton */
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="p-5 rounded-2xl bg-white border border-[#E8DFC8] space-y-4 animate-pulse">
                  <div className="flex justify-between items-center pb-3 border-b border-stone-100">
                    <div className="h-4 bg-stone-200 rounded w-1/3"></div>
                    <div className="h-5 bg-stone-200 rounded-full w-24"></div>
                  </div>
                  <div className="space-y-2">
                    <div className="h-12 bg-stone-100 rounded-xl"></div>
                    <div className="h-12 bg-stone-100 rounded-xl"></div>
                  </div>
                  <div className="h-6 bg-stone-200 rounded w-1/4 ml-auto"></div>
                </div>
              ))}
            </div>
          ) : error && error !== 'unauthorized' ? (
            /* Error State */
            <div className="p-6 text-center bg-red-50 rounded-2xl border border-red-200 text-red-800 space-y-3">
              <AlertCircle className="w-8 h-8 mx-auto text-red-500" />
              <p className="text-xs font-semibold">{error}</p>
              <button
                onClick={fetchOrders}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Thử Lại
              </button>
            </div>
          ) : orders.length === 0 ? (
            /* Empty Order History */
            <div className="text-center py-16 px-4 bg-white rounded-2xl border border-dashed border-[#D5BDAF] space-y-4">
              <div className="w-16 h-16 rounded-full bg-[#F5EBE0] text-[#D5BDAF] flex items-center justify-center mx-auto">
                <ShoppingBag className="w-8 h-8 text-[#8C5329]" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-serif font-bold text-base text-[#2D241E]">
                  Bạn chưa có đơn đặt hàng nào
                </h4>
                <p className="text-xs text-stone-500">
                  Khi bạn hoàn tất đặt các sản phẩm nội thất gỗ tự nhiên, toàn bộ chi tiết quy cách và hành trình giao nhận sẽ xuất hiện tại đây.
                </p>
              </div>
              <button
                onClick={onClose}
                className="px-5 py-2.5 bg-[#8C5329] hover:bg-[#70401E] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
              >
                Khám Phá Danh Mục Sản Phẩm
              </button>
            </div>
          ) : (
            /* Order List */
            <div className="space-y-4">
              {orders.map((order) => {
                const tracking = order.tracking_code || order.trackingCode || order.shipment?.tracking_number;
                const formattedDate = order.created_at
                  ? new Date(order.created_at).toLocaleDateString('vi-VN', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                  : 'Gần đây';

                return (
                  <div 
                    key={order.id} 
                    className="p-5 rounded-2xl bg-white border border-[#E8DFC8] shadow-xs hover:border-[#8C5329]/50 transition-all space-y-4"
                  >
                    {/* Order Top Meta */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-stone-200">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-xs text-[#2D241E]">
                            #{order.id}
                          </span>
                          <span className="text-[11px] text-stone-400">•</span>
                          <span className="text-[11px] text-stone-500 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-stone-400" />
                            {formattedDate}
                          </span>
                        </div>
                        <p className="text-[11px] text-stone-500 truncate max-w-md">
                          Người nhận: <strong className="text-[#2D241E]">{order.customer_name}</strong> ({order.customer_phone})
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {renderStatusBadge(order.status)}
                      </div>
                    </div>

                    {/* Tracking Code Highlight Banner */}
                    {tracking && (
                      <div className="p-3 bg-[#F5EBE0]/80 rounded-xl border border-[#D5BDAF] flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <Truck className="w-4 h-4 text-[#8C5329] shrink-0" />
                          <div className="truncate">
                            <span className="text-stone-500 mr-1.5">Mã vận đơn cồng kềnh:</span>
                            <span className="font-mono font-bold text-[#8C5329] bg-white px-2 py-0.5 rounded border border-[#D5BDAF]">
                              {tracking}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleCopy(tracking)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-[#D5BDAF] text-stone-700 hover:bg-[#FAF8F5] transition flex items-center gap-1 cursor-pointer"
                            title="Sao chép mã vận đơn"
                          >
                            {copiedCode === tracking ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-600" />
                                <span className="text-emerald-700 font-bold">Đã chép</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3 text-stone-500" />
                                <span>Sao chép</span>
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              if (onTrackOrder) onTrackOrder(tracking);
                            }}
                            className="px-3 py-1 text-[11px] font-bold rounded-lg bg-[#582F0E] hover:bg-[#43281C] text-white transition flex items-center gap-1 shadow-2xs cursor-pointer"
                          >
                            <ExternalLink className="w-3 h-3 text-[#D4A373]" />
                            <span>Theo Dõi Vận Đơn</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Frozen Line Items List */}
                    <div className="space-y-2.5">
                      <div className="text-[11px] font-bold uppercase tracking-wider text-stone-400">
                        Chi Tiết Sản Phẩm (Giá Gốc Khóa Chặt Tại Checkout)
                      </div>
                      <div className="divide-y divide-stone-100">
                        {(order.items || []).map((item, idx) => (
                          <div key={item.id || idx} className="py-2.5 flex items-center gap-3">
                            <img
                              src={item.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=200&q=80'}
                              alt={item.title || item.name}
                              className="w-12 h-12 object-cover rounded-xl border border-[#E8DFC8] bg-stone-50 shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <h5 className="text-xs font-bold text-[#2D241E] truncate">
                                {item.title || item.name || `Sản phẩm #${item.product_id}`}
                              </h5>
                              <div className="flex items-center gap-2 text-[11px] text-stone-500 mt-0.5">
                                <span className="font-mono text-[#8C5329] font-medium">
                                  {formatVND(item.unit_price)}
                                </span>
                                <span>×</span>
                                <span className="font-semibold text-[#2D241E]">
                                  {item.quantity}
                                </span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-xs font-bold text-[#2D241E]">
                                {formatVND((item.unit_price || 0) * (item.quantity || 1))}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Delivery & Payment Snapshots */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3 border-t border-stone-200 text-xs">
                      {/* Shipping info snapshot */}
                      <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFC8] space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-[#582F0E]">
                          <MapPin className="w-3.5 h-3.5 text-[#8C5329]" />
                          <span>Địa Chỉ Giao Nhận Cồng Kềnh</span>
                        </div>
                        <p className="text-[11px] text-stone-600 leading-relaxed">
                          {order.delivery_address || 'Địa chỉ tiêu chuẩn'}
                        </p>
                        <div className="text-[10px] text-stone-500 flex items-center gap-2 pt-1">
                          <span>
                            {order.has_freight_elevator === 1 ? '✓ Có thang máy' : '⚠ Thang bộ'}
                          </span>
                          {order.floor_number && (
                            <span>• Tầng {order.floor_number}</span>
                          )}
                          {order.shipment?.shipping_status && (
                            <>
                              <span>•</span>
                              {renderShippingBadge(order.shipment.shipping_status)}
                            </>
                          )}
                        </div>
                      </div>

                      {/* Payment summary snapshot */}
                      <div className="p-3 rounded-xl bg-[#FAF8F5] border border-[#E8DFC8] space-y-1">
                        <div className="flex items-center gap-1.5 font-bold text-[#582F0E]">
                          <CreditCard className="w-3.5 h-3.5 text-[#8C5329]" />
                          <span>Phương Thức & Tổng Thanh Toán</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-stone-500 pt-0.5">
                          <span>Tiền hàng:</span>
                          <span className="font-medium text-[#2D241E]">{formatVND(order.subtotal || 0)}</span>
                        </div>
                        <div className="flex justify-between text-[11px] text-stone-500">
                          <span>Cước vận tải cồng kềnh:</span>
                          <span className="font-medium text-[#2D241E]">
                            {formatVND(order.freight_surcharge || order.shipment?.shipping_cost || 0)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs font-bold text-[#582F0E] pt-1 border-t border-stone-200">
                          <span>Tổng thanh toán ({order.payment_method?.toUpperCase() || 'COD'}):</span>
                          <span className="text-[#8C5329] font-mono text-sm">
                            {formatVND(order.total_amount || order.totalAmount || 0)}
                          </span>
                        </div>
                      </div>
                    </div>

                  </div>
                );
              })}
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 bg-white border-t border-[#E8DFC8] flex items-center justify-between text-xs shrink-0">
          <span className="text-stone-500">
            Hiển thị {orders.length} đơn hàng đã lưu
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
