import React, { useState, useMemo } from 'react';
import { X, Trash2, Plus, Minus, Truck, ArrowRight, ShieldCheck, CheckCircle2, Box } from 'lucide-react';
import { formatVND } from './ProductCard';

export default function CartDrawer({ 
  isOpen, 
  onClose, 
  cartItems, 
  onUpdateQuantity, 
  onRemoveItem, 
  onOrderSuccess 
}) {
  const [hasFreightElevator, setHasFreightElevator] = useState(true);
  const [floorNumber, setFloorNumber] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmedOrder, setConfirmedOrder] = useState(null);

  // Subtotal calculation
  const subtotal = useMemo(() => {
    return cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }, [cartItems]);

  // Bulky Freight Surcharge Calculation (FR11, NFR02)
  const freightDetails = useMemo(() => {
    let totalCubicMeters = 0;
    let totalWeightKg = 0;

    cartItems.forEach(item => {
      const vol = ((item.width_cm || 100) / 100) * ((item.depth_cm || 60) / 100) * ((item.height_cm || 80) / 100);
      totalCubicMeters += vol * item.quantity;
      totalWeightKg += (item.weight_kg || 25) * item.quantity;
    });

    if (cartItems.length === 0) {
      return { baseFreight: 0, volumeSurcharge: 0, stairsSurcharge: 0, totalFreight: 0, totalCubicMeters: 0, totalWeightKg: 0 };
    }

    const baseFreight = 150000;
    const volumeSurcharge = Math.round(totalCubicMeters * 250000);
    const stairsSurcharge = (!hasFreightElevator && floorNumber > 1) ? (floorNumber - 1) * 80000 : 0;
    const totalFreight = baseFreight + volumeSurcharge + stairsSurcharge;

    return {
      baseFreight,
      volumeSurcharge,
      stairsSurcharge,
      totalFreight,
      totalCubicMeters: parseFloat(totalCubicMeters.toFixed(3)),
      totalWeightKg: Math.round(totalWeightKg)
    };
  }, [cartItems, hasFreightElevator, floorNumber]);

  const totalAmount = subtotal + freightDetails.totalFreight;

  async function handleCheckout(e) {
    e.preventDefault();
    if (!customerName || !customerPhone || !customerAddress) {
      alert('Vui lòng điền đầy đủ tên, số điện thoại và địa chỉ giao hàng.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            name: customerName,
            phone: customerPhone,
            address: customerAddress,
            floor: floorNumber,
            hasElevator: hasFreightElevator
          },
          items: cartItems,
          freight: freightDetails,
          subtotal,
          totalAmount
        })
      });

      const data = await res.json();
      if (data.success) {
        setConfirmedOrder(data.order);
        onOrderSuccess(data.order);
      }
    } catch (err) {
      // Offline fallback mock order
      const mockOrder = {
        trackingCode: `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`,
        customer: { name: customerName, phone: customerPhone, address: customerAddress },
        items: cartItems,
        freight: freightDetails,
        totalAmount
      };
      setConfirmedOrder(mockOrder);
      onOrderSuccess(mockOrder);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col justify-between overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Box className="w-5 h-5 text-[#D4A373]" />
            <h2 className="font-serif text-base font-bold">Giỏ Hàng & Cước Phí Vận Tải</h2>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        {confirmedOrder ? (
          /* Order Confirmation Screen */
          <div className="p-8 text-center flex-1 flex flex-col items-center justify-center space-y-4">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto shadow-inner">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            <h3 className="font-serif text-xl font-bold text-[#2D241E]">Đặt Hàng Thành Công!</h3>
            <p className="text-xs text-stone-600 max-w-xs mx-auto">
              Đơn hàng nội thất cồng kềnh của bạn đã được chuyển tới bộ phận kho bãi và đội vận tải chuyên dụng.
            </p>
            <div className="bg-[#FAF8F5] p-4 rounded-2xl border border-[#D5BDAF] w-full text-left space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Mã Vận Đơn:</span>
                <span className="font-mono font-bold text-[#8C5329]">{confirmedOrder.trackingCode}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Người Nhận:</span>
                <span className="font-medium text-[#2D241E]">{confirmedOrder.customer.name}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-stone-500">Tổng Thanh Toán:</span>
                <span className="font-bold text-[#582F0E]">{formatVND(confirmedOrder.totalAmount)}</span>
              </div>
            </div>
            <button
              onClick={() => {
                setConfirmedOrder(null);
                onClose();
              }}
              className="w-full py-3 bg-[#582F0E] text-white rounded-xl text-xs font-semibold hover:bg-[#43281C] transition"
            >
              Tiếp Tục Mua Sắm
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Cart Item List */}
            {cartItems.length === 0 ? (
              <div className="text-center py-12 text-stone-400">
                <Box className="w-12 h-12 mx-auto text-[#D5BDAF] mb-3" />
                <p className="text-sm font-medium">Giỏ hàng của bạn đang trống</p>
                <p className="text-xs mt-1">Chọn sản phẩm từ danh mục để bắt đầu</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cartItems.map(item => (
                  <div key={item.id} className="flex gap-3 bg-[#FAF8F5] p-3 rounded-2xl border border-[#E8DFC8]">
                    <img src={item.image_url} alt="" className="w-16 h-16 object-cover rounded-xl shrink-0" />
                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-[#2D241E] line-clamp-1">{item.name}</h4>
                        <p className="text-[11px] text-stone-500 font-mono">
                          {item.width_cm}x{item.depth_cm}x{item.height_cm} cm | ~{item.weight_kg}kg
                        </p>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs font-bold text-[#8C5329]">{formatVND(item.price)}</span>
                        
                        <div className="flex items-center gap-2">
                          <div className="flex items-center border border-[#D5BDAF] rounded-lg bg-white">
                            <button 
                              onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
                              className="p-1 hover:bg-stone-100 text-stone-600 rounded-l-lg"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="px-2 text-xs font-semibold">{item.quantity}</span>
                            <button 
                              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
                              className="p-1 hover:bg-stone-100 text-stone-600 rounded-r-lg"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          
                          <button 
                            onClick={() => onRemoveItem(item.id)}
                            className="p-1 text-stone-400 hover:text-red-500 transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {cartItems.length > 0 && (
              <>
                {/* Bulky Logistics Parameters (FR11, NFR02) */}
                <div className="p-4 rounded-2xl bg-[#F5EBE0] border border-[#D5BDAF] space-y-3">
                  <div className="flex items-center gap-2 text-xs font-bold text-[#582F0E]">
                    <Truck className="w-4 h-4 text-[#8C5329]" />
                    <span>Điều Kiện Giao Hàng Cồng Kềnh (Bulky Freight)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <label className="text-[11px] font-medium text-stone-600 block mb-1">Vị trí tầng giao:</label>
                      <select
                        value={floorNumber}
                        onChange={(e) => setFloorNumber(parseInt(e.target.value))}
                        className="w-full bg-white p-2 border border-[#D5BDAF] rounded-xl text-xs"
                      >
                        <option value={1}>Tầng 1 (Mặt đất)</option>
                        <option value={2}>Tầng 2</option>
                        <option value={3}>Tầng 3</option>
                        <option value={4}>Tầng 4 trở lên</option>
                      </select>
                    </div>

                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-[#2D241E]">
                        <input
                          type="checkbox"
                          checked={hasFreightElevator}
                          onChange={(e) => setHasFreightElevator(e.target.checked)}
                          className="w-4 h-4 accent-[#8C5329] rounded"
                        />
                        <span>Có Thang Máy Vận Chuyển</span>
                      </label>
                    </div>
                  </div>

                  {/* Freight Breakdown */}
                  <div className="pt-2 border-t border-stone-200/60 space-y-1 text-[11px] text-stone-600">
                    <div className="flex justify-between">
                      <span>Thể tích quy đổi:</span>
                      <span className="font-mono font-medium">{freightDetails.totalCubicMeters} m³ (~{freightDetails.totalWeightKg} kg)</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Phí cước thể tích (250k/m³):</span>
                      <span>{formatVND(freightDetails.volumeSurcharge)}</span>
                    </div>
                    {freightDetails.stairsSurcharge > 0 && (
                      <div className="flex justify-between text-amber-700 font-medium">
                        <span>Phụ phí bốc thang bộ (Tầng {floorNumber}):</span>
                        <span>{formatVND(freightDetails.stairsSurcharge)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-1 border-t border-stone-200 font-bold text-[#582F0E]">
                      <span>Tổng Cước Vận Tải Chuyên Dụng:</span>
                      <span>{formatVND(freightDetails.totalFreight)}</span>
                    </div>
                  </div>
                </div>

                {/* Customer Checkout Info */}
                <form onSubmit={handleCheckout} id="checkout-form" className="space-y-3">
                  <h4 className="text-xs font-bold text-[#2D241E]">Thông Tin Người Nhận & Địa Chỉ</h4>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Họ và tên *"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      className="px-3 py-2 bg-white border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                    <input
                      type="tel"
                      required
                      placeholder="Số điện thoại *"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="px-3 py-2 bg-white border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                  </div>

                  <input
                    type="text"
                    required
                    placeholder="Địa chỉ số nhà, ngõ/đường, quận huyện *"
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                  />
                </form>
              </>
            )}
          </div>
        )}

        {/* Footer Payment Summary */}
        {!confirmedOrder && cartItems.length > 0 && (
          <div className="p-6 bg-[#FAF8F5] border-t border-[#E8DFC8] space-y-3">
            <div className="space-y-1.5 text-xs text-stone-600">
              <div className="flex justify-between">
                <span>Tiền Hàng:</span>
                <span className="font-semibold text-[#2D241E]">{formatVND(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Cước Vận Tải:</span>
                <span className="font-semibold text-[#2D241E]">{formatVND(freightDetails.totalFreight)}</span>
              </div>
              <div className="flex justify-between pt-2 border-t border-[#E8DFC8] text-sm font-bold text-[#582F0E]">
                <span>Tổng Thanh Toán:</span>
                <span className="text-base text-[#8C5329]">{formatVND(totalAmount)}</span>
              </div>
            </div>

            <button
              type="submit"
              form="checkout-form"
              disabled={isSubmitting}
              className="w-full py-3.5 bg-[#582F0E] hover:bg-[#43281C] disabled:opacity-50 text-white rounded-xl text-xs font-bold tracking-wide uppercase flex items-center justify-center gap-2 transition shadow-md"
            >
              {isSubmitting ? (
                <span>Đang Xử Lý Giao Dịch...</span>
              ) : (
                <>
                  <span>Xác Nhận Đặt Hàng & Thanh Toán</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
