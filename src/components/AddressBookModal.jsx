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
        recipient_name: prev.recipient_name || currentUser.name || currentUser.display_name || ''
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
      const addrList = data.addresses || [];
      setAddresses(addrList);
      if (addrList.length === 0) {
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
        recipient_name: currentUser?.name || currentUser?.display_name || '',
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
                className="px-3 py-1.5 rounded-xl bg-[#582F0E] hover:bg-[#43281C] text-[#E8DFC8] text-xs font-bold transition flex items-center gap-1.5 border border-[#D4A373]/40 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Thêm Mới</span>
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
                className="px-6 py-2.5 bg-[#582F0E] hover:bg-[#43281C] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-2 cursor-pointer"
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
                    className="text-xs text-stone-500 hover:text-stone-800 underline cursor-pointer"
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
                    className="flex-1 py-2.5 px-4 bg-[#582F0E] hover:bg-[#43281C] text-white font-bold rounded-xl text-xs transition flex items-center justify-center gap-2 disabled:opacity-50 shadow-xs cursor-pointer"
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
                      className="px-4 py-2.5 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl text-xs transition cursor-pointer"
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
                className="px-5 py-2.5 bg-[#8C5329] hover:bg-[#70401E] text-white rounded-xl text-xs font-bold transition shadow-xs inline-flex items-center gap-1.5 cursor-pointer"
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
                            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg border border-[#D5BDAF] text-stone-600 hover:text-[#582F0E] hover:bg-[#FAF8F5] transition disabled:opacity-50 cursor-pointer"
                          >
                            {isBusy ? 'Đang cập nhật...' : 'Đặt Mặc Định'}
                          </button>
                        )}

                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => handleDelete(addr.id)}
                          className="p-1.5 text-stone-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition disabled:opacity-50 cursor-pointer"
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
            className="px-5 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 font-semibold rounded-xl transition cursor-pointer"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
}
