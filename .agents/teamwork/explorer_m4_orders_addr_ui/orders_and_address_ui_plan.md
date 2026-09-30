# Milestone 4 Implementation Plan: Order History & Address Management UI

**Author**: Explorer Agent (Milestone 4 - Storefront UI)  
**Target Subsystems**: Customer Order History (`OrderHistoryModal.jsx`), Customer Address Book (`AddressBookModal.jsx`), Navigation Account Dropdown (`Header.jsx`), Root Application Wiring (`App.jsx`), Order Tracking integration (`OrderTrackModal.jsx`).  
**Status**: Ready for Implementation  
**Integrity Mode**: Development / Cloudflare Pages + React 19 + Tailwind CSS v4  

---

## 1. Executive Summary & Objective

In Milestones 1–3, the Cloudflare D1 schema (`0002_domain_schema.sql`) and backend Pages Functions (`functions/api/[[path]].js`) were implemented to support:
- Authenticated customer address management (`GET`, `POST`, `PUT /api/customer/addresses/:id/default`, `DELETE /api/customer/addresses/:id`)
- Authenticated customer order history with price immutability and bulky freight snapshots (`GET /api/customer/orders`)
- Session management and cookie revocation (`/api/auth/me`, `/api/auth/logout`)

This plan provides the architecture and exact, production-grade React component code for:
1. **`src/components/OrderHistoryModal.jsx`**: Customer Order History dialog displaying past orders, frozen checkout unit prices (`order_items.unit_price * quantity`), bulky freight delivery snapshots, tracking codes, and direct 1-click tracking handover.
2. **`src/components/AddressBookModal.jsx`**: Delivery address management dialog displaying saved locations, default status badges, new address registration form, default toggling, and address deletion.
3. **`src/components/Header.jsx`**: User account dropdown replacing the basic auth click, featuring customer avatar/name/role header, navigation links for Order History, Address Book, Order Tracking, Admin portal, and sign-out action calling `/api/auth/logout` (fulfilling E2E test `T1.F12.3`).
4. **`src/App.jsx`**: Global state management wiring for `isOrderHistoryOpen`, `isAddressBookOpen`, `trackerCode`, session restoration on initial mount via `/api/auth/me`, and seamless modal transitions.
5. **`src/components/OrderTrackModal.jsx`**: Parameterized tracking lookup accepting `initialTrackingCode` from `OrderHistoryModal`.

---

## 2. Interface & Data Contracts

### 2.1 Customer Order History Contract (`GET /api/customer/orders`)
- **Headers**: Session cookie (`fur_session`) automatically sent via `credentials: 'include'`
- **Status Codes**: `200 OK` (authenticated), `401 Unauthorized` (unauthenticated)
- **Response Structure**:
```json
{
  "orders": [
    {
      "id": "ord_1727650000000_abc123",
      "customer_id": "usr_xyz789",
      "customer_name": "Nguyen Van A",
      "customer_email": "nguyenvana@example.com",
      "customer_phone": "0901234567",
      "delivery_address": "123 Le Loi Street, Ben Nghe Ward, District 1, Ho Chi Minh City",
      "has_freight_elevator": 1,
      "floor_number": 2,
      "subtotal": 14500000,
      "freight_surcharge": 150000,
      "total_amount": 14650000,
      "totalAmount": 14650000,
      "status": "Paid",
      "tracking_code": "ABC-VN-83921",
      "trackingCode": "ABC-VN-83921",
      "payment_method": "cod",
      "notes": null,
      "created_at": "2026-09-30 00:20:00",
      "updated_at": "2026-09-30 00:20:00",
      "items": [
        {
          "id": "oi_123",
          "order_id": "ord_1727650000000_abc123",
          "product_id": "prod_sofa_nordic",
          "title": "Sofa Văng Nordic Scandinavian 3 Chỗ",
          "name": "Sofa Văng Nordic Scandinavian 3 Chỗ",
          "quantity": 1,
          "unit_price": 14500000,
          "subtotal": 14500000,
          "image_url": "https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80"
        }
      ],
      "shipment": {
        "id": "ship_456",
        "order_id": "ord_1727650000000_abc123",
        "carrier": "Đội xe vận tải nội thất chuyên dụng ABC",
        "tracking_number": "ABC-VN-83921",
        "tracking_code": "ABC-VN-83921",
        "shipping_status": "in_transit",
        "shipping_cost": 150000,
        "recipient_name": "Nguyen Van A",
        "phone": "0901234567",
        "delivery_address": "123 Le Loi Street...",
        "estimated_delivery": "14:00 - 17:00 ngày mai"
      },
      "payment": {
        "id": "pay_789",
        "order_id": "ord_1727650000000_abc123",
        "payment_method": "cod",
        "payment_status": "pending",
        "amount": 14650000
      }
    }
  ]
}
```

### 2.2 Customer Address Book Contracts (`/api/customer/addresses`)
1. **`GET /api/customer/addresses`**:
   - Returns: `{ addresses: [ { id, user_id, recipient_name, phone, street, ward, district, city_province, postal_code, is_default, created_at } ] }`
2. **`POST /api/customer/addresses`**:
   - Request Body:
     ```json
     {
       "recipient_name": "Nguyen Van A",
       "phone": "0901234567",
       "street": "123 Le Loi",
       "ward": "Phuong Ben Nghe",
       "district": "Quan 1",
       "city_province": "TP. Ho Chi Minh",
       "postal_code": "70000",
       "is_default": 1
     }
     ```
   - Returns: `{ success: true, address: { ... } }`
3. **`PUT /api/customer/addresses/:id/default`**:
   - Returns: `{ success: true, id: "...", is_default: 1 }`
4. **`DELETE /api/customer/addresses/:id`**:
   - Returns: `{ success: true }`

---

## 3. UI/UX Specifications & Styling Conventions

Consistent with the ABC Furniture atelier aesthetic:
- **Color Palette**:
  - Primary Wood Brown: `#582F0E` (hover: `#43281C`)
  - Accent Amber/Bronze: `#8C5329` / `#D4A373`
  - Espresso Header: `#2D241E`
  - Background Neutral: `#FAF8F5`
  - Card Sand Background: `#F5EBE0` / `#E8DFC8`
  - Status Badges:
    - Delivered / Complete: `bg-emerald-100 text-emerald-800 border-emerald-300`
    - Paid: `bg-emerald-50 text-emerald-700 border-emerald-200`
    - In Transit / Shipped: `bg-blue-100 text-blue-800 border-blue-200`
    - Pending: `bg-amber-100 text-amber-800 border-amber-200`
    - Default Address Badge: `bg-[#8C5329] text-[#FFD166]`
- **Responsive Layout**: Full width with mobile padding (`p-4`), modal max-width (`max-w-2xl` to `max-w-3xl`), max-height (`max-h-[85vh]`) with smooth vertical scroll.
- **Micro-Interactions**:
  - Click tracking code to copy to clipboard with 2-second checkmark confirmation.
  - "Theo dõi đơn hàng" button opens `OrderTrackModal` with pre-filled tracking code.
  - Empty states with illustrative icons and direct action buttons.
  - Loading skeleton indicators.

---

## 4. Exact Component Code Drafts

### 4.1 `src/components/OrderHistoryModal.jsx` (New Component)

```jsx
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
  RefreshCw,
  Search,
  Box
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
                className="p-1.5 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
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
                className="px-6 py-2.5 bg-[#582F0E] hover:bg-[#43281C] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2"
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
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold transition"
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
                className="px-5 py-2.5 bg-[#8C5329] hover:bg-[#70401E] text-white rounded-xl text-xs font-bold transition shadow-xs"
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
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-white border border-[#D5BDAF] text-stone-700 hover:bg-[#FAF8F5] transition flex items-center gap-1"
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
                            className="px-3 py-1 text-[11px] font-bold rounded-lg bg-[#582F0E] hover:bg-[#43281C] text-white transition flex items-center gap-1 shadow-2xs"
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
            className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl transition"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
```

---

### 4.2 `src/components/AddressBookModal.jsx` (New Component)

```jsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Plus, 
  Check, 
  Trash2, 
  Star, 
  User, 
  Phone, 
  Home, 
  Building2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCw,
  ArrowRight
} from 'lucide-react';

export default function AddressBookModal({ 
  isOpen, 
  onClose, 
  currentUser, 
  onOpenAuth,
  onSelectAddress 
}) {
  const [addresses, setAddresses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [statusMessage, setStatusMessage] = useState(null);
  const [errorMessage, setErrorMessage] = useState(null);

  // Form Fields
  const [formData, setFormData] = useState({
    recipient_name: '',
    phone: '',
    street: '',
    ward: '',
    district: '',
    city_province: 'TP. Hồ Chí Minh',
    postal_code: '',
    is_default: false
  });

  useEffect(() => {
    if (isOpen && currentUser) {
      fetchAddresses();
      // Pre-fill recipient name if available
      setFormData(prev => ({
        ...prev,
        recipient_name: prev.recipient_name || currentUser.name || ''
      }));
    }
  }, [isOpen, currentUser]);

  async function fetchAddresses() {
    setLoading(true);
    setErrorMessage(null);
    try {
      const res = await fetch('/api/customer/addresses', {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (res.status === 401) {
        setErrorMessage('unauthorized');
        setAddresses([]);
        return;
      }

      if (!res.ok) {
        throw new Error(`Lỗi tải sổ địa chỉ: mã ${res.status}`);
      }

      const data = await res.json();
      setAddresses(data.addresses || []);
      // If customer has no addresses, open form by default
      if ((data.addresses || []).length === 0) {
        setShowAddForm(true);
      }
    } catch (err) {
      console.warn('Lỗi kết nối /api/customer/addresses:', err);
      setErrorMessage(err.message || 'Không thể tải danh sách địa chỉ.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSetDefault(id) {
    setActionLoadingId(id);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/customer/addresses/${id}/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Không thể đặt làm địa chỉ mặc định');

      // Update state locally
      setAddresses(prev => prev.map(addr => ({
        ...addr,
        is_default: addr.id === id ? 1 : 0
      })));
      setStatusMessage('Đã thiết lập địa chỉ giao hàng mặc định thành công.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('Bạn có chắc chắn muốn xóa địa chỉ giao hàng này không?')) {
      return;
    }

    setActionLoadingId(id);
    setStatusMessage(null);
    setErrorMessage(null);
    try {
      const res = await fetch(`/api/customer/addresses/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });

      if (!res.ok) throw new Error('Không thể xóa địa chỉ');

      setAddresses(prev => prev.filter(addr => addr.id !== id));
      setStatusMessage('Đã xóa địa chỉ thành công.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setActionLoadingId(null);
    }
  }

  async function handleCreateAddress(e) {
    e.preventDefault();
    if (!formData.recipient_name.trim() || !formData.phone.trim() || !formData.street.trim() || !formData.city_province.trim()) {
      setErrorMessage('Vui lòng điền các trường bắt buộc (*).');
      return;
    }

    setIsSubmitting(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const res = await fetch('/api/customer/addresses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          recipient_name: formData.recipient_name.trim(),
          phone: formData.phone.trim(),
          street: formData.street.trim(),
          ward: formData.ward.trim(),
          district: formData.district.trim(),
          city_province: formData.city_province.trim(),
          postal_code: formData.postal_code.trim(),
          is_default: formData.is_default ? 1 : 0
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Lỗi khi lưu địa chỉ mới');
      }

      await fetchAddresses();
      setShowAddForm(false);
      setFormData({
        recipient_name: currentUser?.name || '',
        phone: '',
        street: '',
        ward: '',
        district: '',
        city_province: 'TP. Hồ Chí Minh',
        postal_code: '',
        is_default: false
      });
      setStatusMessage('Đã thêm địa chỉ giao hàng mới vào sổ địa chỉ.');
      setTimeout(() => setStatusMessage(null), 3000);
    } catch (err) {
      setErrorMessage(err.message);
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden border border-[#E8DFC8] flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <MapPin className="w-5 h-5 text-[#D4A373]" />
            <div>
              <h3 className="font-serif text-base font-bold">Sổ Địa Chỉ Giao Hàng</h3>
              <p className="text-[11px] text-stone-300">
                Quản lý các địa điểm nhận nội thất cồng kềnh (Nhà riêng, Văn phòng)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {currentUser && !showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="px-3 py-1.5 rounded-xl bg-[#582F0E] hover:bg-[#43281C] text-[#E8DFC8] text-xs font-bold transition flex items-center gap-1.5 border border-[#D4A373]/40 shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Mới</span>
              </button>
            )}
            <button 
              onClick={onClose} 
              className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
              title="Đóng"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-[#FAF8F5]">
          
          {/* Notifications */}
          {statusMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && errorMessage !== 'unauthorized' && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-center gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Unauthenticated View */}
          {!currentUser ? (
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-dashed border-[#D5BDAF] space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#F5EBE0] text-[#8C5329] flex items-center justify-center mx-auto shadow-inner">
                <MapPin className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-serif font-bold text-base text-[#2D241E]">
                  Đăng nhập để quản lý sổ địa chỉ
                </h4>
                <p className="text-xs text-stone-500">
                  Lưu sẵn các địa chỉ giao nhận giúp bạn thanh toán nhanh chóng và tự động ước tính cước bốc xếp tầng lầu.
                </p>
              </div>
              <button
                onClick={() => {
                  onClose();
                  if (onOpenAuth) onOpenAuth();
                }}
                className="px-6 py-2.5 bg-[#582F0E] hover:bg-[#43281C] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2"
              >
                <span>Đăng Nhập Ngay</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : showAddForm ? (
            /* Add Address Form */
            <div className="p-5 bg-white rounded-2xl border border-[#E8DFC8] shadow-xs space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-stone-200">
                <h4 className="font-serif font-bold text-sm text-[#2D241E] flex items-center gap-2">
                  <Plus className="w-4 h-4 text-[#8C5329]" />
                  <span>Thêm Địa Chỉ Giao Hàng Mới</span>
                </h4>
                {addresses.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="text-xs text-stone-500 hover:text-stone-800 underline"
                  >
                    Hủy & Quay lại
                  </button>
                )}
              </div>

              <form onSubmit={handleCreateAddress} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Tên người nhận hàng *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Nguyễn Văn A"
                      value={formData.recipient_name}
                      onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Số điện thoại liên lạc *
                    </label>
                    <input
                      type="tel"
                      required
                      placeholder="VD: 0901234567"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-stone-600 block mb-1">
                    Số nhà, tên ngõ/đường, tòa nhà *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Tòa nhà Landmark 81, số 208 Nguyễn Hữu Cảnh"
                    value={formData.street}
                    onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Phường / Xã
                    </label>
                    <input
                      type="text"
                      placeholder="VD: Phường 22"
                      value={formData.ward}
                      onChange={(e) => setFormData({ ...formData, ward: e.target.value })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Quận / Huyện *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="VD: Quận Bình Thạnh"
                      value={formData.district}
                      onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-stone-600 block mb-1">
                      Tỉnh / Thành phố *
                    </label>
                    <select
                      value={formData.city_province}
                      onChange={(e) => setFormData({ ...formData, city_province: e.target.value })}
                      className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:ring-1 focus:ring-[#8C5329]"
                    >
                      <option value="TP. Hồ Chí Minh">TP. Hồ Chí Minh</option>
                      <option value="Hà Nội">Hà Nội</option>
                      <option value="Đà Nẵng">Đà Nẵng</option>
                      <option value="Bình Dương">Bình Dương</option>
                      <option value="Đồng Nai">Đồng Nai</option>
                      <option value="Cần Thơ">Cần Thơ</option>
                      <option value="Hải Phòng">Hải Phòng</option>
                      <option value="Khác">Tỉnh / Thành khác</option>
                    </select>
                  </div>
                </div>

                <div className="pt-2">
                  <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#2D241E]">
                    <input
                      type="checkbox"
                      checked={formData.is_default}
                      onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
                      className="w-4 h-4 accent-[#8C5329] rounded"
                    />
                    <span>Đặt làm địa chỉ nhận hàng mặc định</span>
                  </label>
                </div>

                <div className="flex gap-2.5 pt-3">
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex-1 py-2.5 px-4 bg-[#582F0E] hover:bg-[#43281C] text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs"
                  >
                    {isSubmitting ? (
                      <span>Đang Lưu Địa Chỉ...</span>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Lưu Địa Chỉ Này</span>
                      </>
                    )}
                  </button>
                  {addresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAddForm(false)}
                      className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-xs transition"
                    >
                      Hủy
                    </button>
                  )}
                </div>
              </form>
            </div>
          ) : addresses.length === 0 ? (
            /* Empty State */
            <div className="text-center py-12 px-4 bg-white rounded-2xl border border-dashed border-[#D5BDAF] space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#F5EBE0] text-[#D5BDAF] flex items-center justify-center mx-auto">
                <MapPin className="w-7 h-7 text-[#8C5329]" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h4 className="font-serif font-bold text-base text-[#2D241E]">
                  Bạn chưa lưu địa chỉ giao hàng nào
                </h4>
                <p className="text-xs text-stone-500">
                  Thêm địa chỉ nhà riêng hoặc văn phòng để thuận tiện trong khâu đo lường kích thước thang máy và giao nhận.
                </p>
              </div>
              <button
                onClick={() => setShowAddForm(true)}
                className="px-5 py-2.5 bg-[#8C5329] hover:bg-[#70401E] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Địa Chỉ Đầu Tiên</span>
              </button>
            </div>
          ) : (
            /* Address List */
            <div className="space-y-3">
              {addresses.map((addr) => {
                const isDefault = addr.is_default === 1;
                const isBusy = actionLoadingId === addr.id;

                return (
                  <div
                    key={addr.id}
                    className={`p-4 rounded-2xl border transition-all ${
                      isDefault 
                        ? 'bg-white border-[#8C5329] shadow-xs' 
                        : 'bg-white/80 border-[#E8DFC8] hover:border-[#D5BDAF]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-[#2D241E]">
                            {addr.recipient_name}
                          </span>
                          <span className="text-[11px] text-stone-500">
                            ({addr.phone})
                          </span>
                          {isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#8C5329] text-[#FFD166] shadow-2xs">
                              <Star className="w-2.5 h-2.5 fill-current" />
                              <span>Mặc Định</span>
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-stone-700 leading-relaxed">
                          {addr.street}
                          {addr.ward ? `, ${addr.ward}` : ''}
                          {addr.district ? `, ${addr.district}` : ''}
                          {addr.city_province ? `, ${addr.city_province}` : ''}
                          {addr.postal_code ? ` (Mã: ${addr.postal_code})` : ''}
                        </p>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {!isDefault && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleSetDefault(addr.id)}
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-[#D5BDAF] text-stone-600 hover:text-[#582F0E] hover:bg-[#FAF8F5] transition disabled:opacity-50"
                          >
                            {isBusy ? 'Đang cập nhật...' : 'Đặt Mặc Định'}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(addr.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50"
                          title="Xóa địa chỉ"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
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
            {addresses.length} địa chỉ đã lưu
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl transition"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
```

---

### 4.3 Proposed Updates to `src/components/Header.jsx`

Add customer navigation dropdown menu with triggers for Order History, Address Book, and Sign Out calling `/api/auth/logout`.

```jsx
import React, { useState, useRef, useEffect } from 'react';
import { 
  ShoppingBag, 
  Sparkles, 
  Compass, 
  Truck, 
  Search, 
  Mic, 
  Camera, 
  Crown, 
  User, 
  ChevronDown, 
  Package, 
  MapPin, 
  LogOut,
  Settings
} from 'lucide-react';

export default function Header({ 
  cartCount, 
  onOpenCart, 
  onOpenAI, 
  onOpenPlanner, 
  onOpenTracker,
  searchQuery,
  setSearchQuery,
  selectedCategory,
  setSelectedCategory,
  currentUser,
  onOpenAuth,
  onOpenAdmin,
  onOpenOrderHistory,
  onOpenAddressBook,
  onLogout
}) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const categories = [
    { id: 'all', name: 'Tất Cả' },
    { id: 'living-room', name: 'Phòng Khách' },
    { id: 'dining-room', name: 'Phòng Ăn' },
    { id: 'bedroom', name: 'Phòng Ngủ' },
    { id: 'office', name: 'Phòng Làm Việc' }
  ];

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Handle Logout Action (Satisfies E2E T1.F12.3 calling /api/auth/logout)
  async function handleSignOut() {
    try {
      await fetch('/api/auth/logout', { 
        method: 'POST',
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Lỗi khi gọi /api/auth/logout:', err);
    }
    setIsDropdownOpen(false);
    if (onLogout) {
      onLogout();
    }
  }

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

          {/* Search Bar with Voice & Visual inputs */}
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

            {/* User Account Menu with Dropdown */}
            {currentUser ? (
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 cursor-pointer p-1 px-2.5 rounded-xl hover:bg-[#F5EBE0] transition border border-[#D5BDAF]/60 bg-white/80 shadow-2xs"
                  title={`${currentUser.name} (${currentUser.email})`}
                >
                  <img 
                    src={currentUser.avatar_url || currentUser.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(currentUser.name || 'User')}`} 
                    alt={currentUser.name} 
                    className="w-7 h-7 rounded-full border border-[#8C5329] object-cover" 
                  />
                  <div className="hidden md:flex flex-col text-left leading-tight">
                    <span className="text-xs font-bold text-[#2D241E] max-w-[110px] truncate">
                      {currentUser.name}
                    </span>
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${currentUser.role === 'admin' ? 'text-[#8C5329]' : 'text-stone-500'}`}>
                      {currentUser.role === 'admin' ? (
                        <>
                          <Crown className="w-2.5 h-2.5 text-amber-600 inline" /> Admin
                        </>
                      ) : (
                        <>
                          <User className="w-2.5 h-2.5 inline" /> Khách hàng
                        </>
                      )}
                    </span>
                  </div>
                  <ChevronDown className="w-3.5 h-3.5 text-stone-400 ml-0.5" />
                </button>

                {/* Dropdown Menu Panel */}
                {isDropdownOpen && (
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#E8DFC8] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    
                    {/* User profile preview header */}
                    <div className="px-4 py-2.5 border-b border-stone-100 flex items-center gap-2.5">
                      <img 
                        src={currentUser.avatar_url || currentUser.avatar} 
                        alt="" 
                        className="w-9 h-9 rounded-full border border-[#8C5329] object-cover" 
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-bold text-[#2D241E] truncate">{currentUser.name}</div>
                        <div className="text-[11px] text-stone-500 truncate">{currentUser.email}</div>
                      </div>
                    </div>

                    {/* Navigation Items */}
                    <div className="py-1">
                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onOpenOrderHistory) onOpenOrderHistory();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-[#2D241E] hover:bg-[#FAF8F5] hover:text-[#8C5329] flex items-center gap-2.5 transition"
                      >
                        <Package className="w-4 h-4 text-[#8C5329]" />
                        <span>Lịch Sử Đơn Hàng</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onOpenAddressBook) onOpenAddressBook();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-[#2D241E] hover:bg-[#FAF8F5] hover:text-[#8C5329] flex items-center gap-2.5 transition"
                      >
                        <MapPin className="w-4 h-4 text-[#8C5329]" />
                        <span>Sổ Địa Chỉ Giao Hàng</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onOpenTracker) onOpenTracker();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-[#2D241E] hover:bg-[#FAF8F5] hover:text-[#8C5329] flex items-center gap-2.5 transition"
                      >
                        <Truck className="w-4 h-4 text-[#8C5329]" />
                        <span>Tra Cứu Vận Đơn</span>
                      </button>

                      <button
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onOpenAuth) onOpenAuth();
                        }}
                        className="w-full px-4 py-2 text-left text-xs font-semibold text-[#2D241E] hover:bg-[#FAF8F5] hover:text-[#8C5329] flex items-center gap-2.5 transition"
                      >
                        <User className="w-4 h-4 text-[#8C5329]" />
                        <span>Thông Tin Tài Khoản</span>
                      </button>

                      {/* Admin Management Option */}
                      {currentUser?.role === 'admin' && (
                        <button
                          onClick={() => {
                            setIsDropdownOpen(false);
                            if (onOpenAdmin) onOpenAdmin();
                          }}
                          className="w-full px-4 py-2 text-left text-xs font-bold text-amber-800 bg-amber-50/60 hover:bg-amber-100/80 flex items-center gap-2.5 transition"
                        >
                          <Settings className="w-4 h-4 text-amber-700" />
                          <span>⚙️ Quản Trị Danh Mục D1</span>
                        </button>
                      )}
                    </div>

                    {/* Divider and Logout Action (Satisfies T1.F12.3: logout action calling /api/auth/logout) */}
                    <div className="pt-1 mt-1 border-t border-stone-100">
                      <button
                        onClick={handleSignOut}
                        className="w-full px-4 py-2 text-left text-xs font-bold text-red-600 hover:bg-red-50 flex items-center gap-2.5 transition"
                      >
                        <LogOut className="w-4 h-4 text-red-500" />
                        <span>Đăng Xuất (Sign out)</span>
                      </button>
                    </div>

                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={onOpenAuth}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-[#F5EBE0] text-[#582F0E] transition border border-[#D5BDAF]"
              >
                <span>Đăng Nhập</span>
              </button>
            )}

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
```

---

### 4.4 Proposed Updates to `src/App.jsx`

Wiring the state, session restoration on mount via `/api/auth/me`, and opening modals:

```jsx
// 1. New imports:
import OrderHistoryModal from './components/OrderHistoryModal';
import AddressBookModal from './components/AddressBookModal';

// 2. New state inside App():
const [isOrderHistoryOpen, setIsOrderHistoryOpen] = useState(false);
const [isAddressBookOpen, setIsAddressBookOpen] = useState(false);
const [trackerInitialCode, setTrackerInitialCode] = useState('');

// 3. Helper to open tracker with specific code:
function handleOpenTracker(code = '') {
  if (typeof code === 'string' && code) {
    setTrackerInitialCode(code);
  }
  setIsTrackerOpen(true);
}

// 4. Session restoration on initial mount (satisfies T1.F12.4):
useEffect(() => {
  fetch('/api/auth/me', { credentials: 'include' })
    .then(res => res.ok ? res.json() : null)
    .then(data => {
      if (data?.user) {
        handleUpdateUser(data.user);
      }
    })
    .catch(() => {
      // Offline fallback: keep existing currentUser from localStorage
    });
}, []);

// 5. Header props integration:
<Header
  cartCount={cart.reduce((s, i) => s + i.quantity, 0)}
  onOpenCart={() => setIsCartOpen(true)}
  onOpenAI={handleOpenAI}
  onOpenPlanner={() => setIsPlannerOpen(true)}
  onOpenTracker={() => handleOpenTracker()}
  searchQuery={searchQuery}
  setSearchQuery={setSearchQuery}
  selectedCategory={selectedCategory}
  setSelectedCategory={setSelectedCategory}
  currentUser={currentUser}
  onOpenAuth={() => setIsAuthOpen(true)}
  onOpenAdmin={() => setIsAdminOpen(true)}
  onOpenOrderHistory={() => setIsOrderHistoryOpen(true)}
  onOpenAddressBook={() => setIsAddressBookOpen(true)}
  onLogout={() => handleUpdateUser(null)}
/>

// 6. Modal JSX rendering:
<OrderTrackModal
  isOpen={isTrackerOpen}
  onClose={() => setIsTrackerOpen(false)}
  initialTrackingCode={trackerInitialCode}
/>

<OrderHistoryModal
  isOpen={isOrderHistoryOpen}
  onClose={() => setIsOrderHistoryOpen(false)}
  currentUser={currentUser}
  onOpenAuth={() => {
    setIsOrderHistoryOpen(false);
    setIsAuthOpen(true);
  }}
  onTrackOrder={(code) => {
    setIsOrderHistoryOpen(false);
    handleOpenTracker(code);
  }}
/>

<AddressBookModal
  isOpen={isAddressBookOpen}
  onClose={() => setIsAddressBookOpen(false)}
  currentUser={currentUser}
  onOpenAuth={() => {
    setIsAddressBookOpen(false);
    setIsAuthOpen(true);
  }}
/>
```

---

### 4.5 Proposed Updates to `src/components/OrderTrackModal.jsx`

Add support for `initialTrackingCode` and auto-search on open:

```jsx
import React, { useState, useEffect } from 'react';
import { X, Search, Truck, CheckCircle2, Clock, MapPin, PackageCheck } from 'lucide-react';

export default function OrderTrackModal({ isOpen, onClose, initialTrackingCode = '' }) {
  const [trackingCode, setTrackingCode] = useState(initialTrackingCode || 'ABC-VN-83921');
  const [trackingData, setTrackingData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialTrackingCode) {
      setTrackingCode(initialTrackingCode);
      lookupTracking(initialTrackingCode);
    }
  }, [initialTrackingCode, isOpen]);

  async function lookupTracking(code) {
    if (!code || !code.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(code.trim())}`);
      if (res.ok) {
        const data = await res.json();
        setTrackingData(data);
      } else {
        throw new Error('Order not found');
      }
    } catch (err) {
      // Mock tracking timeline
      setTrackingData({
        trackingCode: code.toUpperCase(),
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

  function handleSearch(e) {
    e?.preventDefault();
    lookupTracking(trackingCode);
  }

  if (!isOpen) return null;

  return (
    // ... rest of modal rendering identical to existing OrderTrackModal
  );
}
```

---

## 5. Verification & Test Plan

1. **Static Analysis & Build Verification**:
   - Run `npm run build` to verify Vite 6 cleanly compiles all new JSX modules with 0 errors.
2. **E2E Test Suites**:
   - `node tests/e2e/tier1_feature.test.mjs`
     - Verify `T1.F12.2: src/components/Header.jsx includes user profile avatar or account menu elements` passes.
     - Verify `T1.F12.3: src/components/Header.jsx includes sign-out action calling /api/auth/logout` passes (resolves prior failure).
     - Verify `T1.F12.4: src/App.jsx contains session restoration logic on initial mount` passes.
     - Verify `T1.F13.3: Order tracking or modal component displays tracking code and order status` passes.
     - Verify `T1.F13.4: Production storefront build (npm run build) compiles cleanly with zero errors` passes.
     - Verify `T1.F13.5: All required JSX components export clean React modules without broken imports` passes.
   - `node tests/e2e/tier2_boundary.test.mjs`, `node tests/e2e/tier3_cross_feature.test.mjs`, `node tests/e2e/tier4_real_world.test.mjs` pass 100%.
3. **Manual Flow Verification**:
   - Click user dropdown in Header -> Select "Lịch Sử Đơn Hàng" -> OrderHistoryModal renders with past orders.
   - Click "Theo Dõi Vận Đơn" on any order item -> OrderTrackModal opens preloaded with that order's tracking code.
   - Click user dropdown -> Select "Sổ Địa Chỉ Giao Hàng" -> AddressBookModal renders.
   - Add new address -> List updates -> Click "Đặt Mặc Định" -> Default badge moves to chosen address.
   - Click "Đăng Xuất (Sign out)" -> Revokes session via `POST /api/auth/logout` and returns Header to guest state.
