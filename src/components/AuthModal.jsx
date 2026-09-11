import React, { useState } from 'react';
import { X, User, Shield, LogOut, CheckCircle2, Crown, Mail, ArrowRight, Sparkles } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLoginSuccess, onLogout, currentUser }) {
  const [loading, setLoading] = useState(false);
  const [customEmail, setCustomEmail] = useState('');
  const [customName, setCustomName] = useState('');
  const [isSwitching, setIsSwitching] = useState(false);

  if (!isOpen) return null;

  const ADMIN_EMAILS = ['nhaterik@gmail.com', 'ducnhan762013@gmail.com'];

  const cleanCustomEmail = customEmail.trim().toLowerCase();
  const isCustomAdmin = ADMIN_EMAILS.includes(cleanCustomEmail);

  async function handleLogin(email, name = '', forcedRole = null) {
    const cleanEmail = (email || '').trim().toLowerCase();
    const isAdmin = ADMIN_EMAILS.includes(cleanEmail);
    const role = forcedRole || (isAdmin ? 'admin' : 'guest');

    let defaultName = name;
    if (!defaultName) {
      if (cleanEmail === 'nhaterik@gmail.com') defaultName = 'Nhật Erik (Admin)';
      else if (cleanEmail === 'ducnhan762013@gmail.com') defaultName = 'Đức Nhân (Admin)';
      else defaultName = 'Khách Vãng Lai';
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          name: defaultName,
          role,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(defaultName)}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.user);
        setIsSwitching(false);
        onClose();
        return;
      }
    } catch (err) {
      console.warn('Backend auth endpoint unavailable, falling back to client auth:', err);
    } finally {
      setLoading(false);
    }

    // Client-side fallback if backend API is not running
    const mockUser = {
      id: `usr_${Date.now()}`,
      email: cleanEmail,
      name: defaultName,
      role,
      avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(defaultName)}`
    };
    onLoginSuccess(mockUser);
    setIsSwitching(false);
    onClose();
  }

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!cleanCustomEmail) return;
    handleLogin(cleanCustomEmail, customName);
  }

  const showActiveProfile = currentUser && !isSwitching;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-[#E8DFC8] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-[#D4A373]" />
            <h3 className="font-serif text-base font-bold">
              {showActiveProfile ? 'Thông Tin Tài Khoản' : 'Đăng Nhập Hệ Thống'}
            </h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white transition"
            title="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 max-h-[85vh] overflow-y-auto">
          {showActiveProfile ? (
            /* Current Profile View */
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8DFC8]">
                <img 
                  src={currentUser.avatar_url || currentUser.avatar} 
                  alt={currentUser.name} 
                  className="w-16 h-16 rounded-2xl border-2 border-[#8C5329] shadow-xs object-cover bg-white"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-serif font-bold text-base text-[#2D241E] truncate">
                      {currentUser.name}
                    </h4>
                    {currentUser.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#8C5329] text-[#FFD166] shadow-xs">
                        <Crown className="w-3 h-3" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-200 text-stone-700">
                        <User className="w-3 h-3" /> Guest
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-600 truncate">{currentUser.email}</p>
                </div>
              </div>

              {currentUser.role === 'admin' ? (
                <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-2 font-bold text-amber-800">
                    <Crown className="w-4 h-4 text-amber-600" />
                    <span>Quyền Quản Trị Viên (Admin) đang kích hoạt</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-amber-700">
                    Tài khoản của bạn được cấp toàn quyền: Đăng tải và cập nhật sản phẩm vào Cloudflare D1, upload ảnh trực tiếp lên Cloudflare R2, và quản lý danh mục.
                  </p>
                </div>
              ) : (
                <div className="p-3.5 bg-stone-50 rounded-2xl border border-stone-200 text-xs text-stone-700 space-y-1.5">
                  <div className="flex items-center gap-2 font-semibold text-stone-800">
                    <User className="w-4 h-4 text-stone-500" />
                    <span>Tài khoản Khách Vãng Lai (Guest)</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-stone-600">
                    Tài khoản khách có thể xem toàn bộ sản phẩm, mô phỏng phòng 2D, chat với AI tư vấn và lên đơn hàng. Để quản trị hệ thống, hãy đăng nhập với email Admin.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsSwitching(true)}
                  className="flex-1 py-2.5 px-4 rounded-xl border border-[#D5BDAF] hover:bg-[#FAF8F5] text-[#582F0E] text-xs font-bold transition flex items-center justify-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  Đổi Tài Khoản Khác
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (onLogout) onLogout();
                    setIsSwitching(false);
                    onClose();
                  }}
                  className="py-2.5 px-4 rounded-xl bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold transition flex items-center justify-center gap-1.5 border border-red-200"
                >
                  <LogOut className="w-4 h-4" />
                  Đăng Xuất
                </button>
              </div>
            </div>
          ) : (
            /* Login & Account Selection View */
            <div className="space-y-5">
              <div className="text-center space-y-1">
                <h4 className="font-serif text-lg font-bold text-[#2D241E]">
                  Đăng Nhập & Phân Quyền Tài Khoản
                </h4>
                <p className="text-xs text-stone-500">
                  Email <strong className="text-[#8C5329]">nhaterik@gmail.com</strong> và <strong className="text-[#8C5329]">ducnhan762013@gmail.com</strong> được thiết lập quyền <strong>Admin</strong>. Mọi tài khoản khác được coi là <strong>Guest</strong>.
                </p>
              </div>

              {/* Fast 1-Click Login Accounts */}
              <div className="space-y-2.5">
                <label className="text-[11px] font-bold uppercase tracking-wider text-stone-500 block">
                  Đăng Nhập Nhanh 1-Chạm (Khuyên Dùng)
                </label>

                {/* Default Admin 1: nhaterik@gmail.com */}
                <button
                  type="button"
                  onClick={() => handleLogin('nhaterik@gmail.com', 'Nhật Erik (Admin)', 'admin')}
                  disabled={loading}
                  className="w-full p-3 rounded-2xl border-2 border-[#8C5329] bg-[#FAF8F5] hover:bg-[#F5EBE0] transition flex items-center justify-between group shadow-xs"
                >
                  <div className="flex items-center gap-3 text-left">
                    <img
                      src="https://api.dicebear.com/7.x/initials/svg?seed=Nhat%20Erik"
                      alt="Nhat Erik"
                      className="w-9 h-9 rounded-full border border-[#8C5329]"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#2D241E]">Nhật Erik</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#8C5329] text-[#FFD166] flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5" /> Admin Mặc Định
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-500">nhaterik@gmail.com</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#8C5329] group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>

                {/* Admin 2: ducnhan762013@gmail.com */}
                <button
                  type="button"
                  onClick={() => handleLogin('ducnhan762013@gmail.com', 'Đức Nhân (Admin)', 'admin')}
                  disabled={loading}
                  className="w-full p-3 rounded-2xl border border-[#D5BDAF] hover:border-[#8C5329] bg-white hover:bg-[#FAF8F5] transition flex items-center justify-between group shadow-xs"
                >
                  <div className="flex items-center gap-3 text-left">
                    <img
                      src="https://api.dicebear.com/7.x/initials/svg?seed=Duc%20Nhan"
                      alt="Duc Nhan"
                      className="w-9 h-9 rounded-full border border-stone-300"
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[#2D241E]">Đức Nhân</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-[#8C5329] text-[#FFD166] flex items-center gap-1">
                          <Crown className="w-2.5 h-2.5" /> Admin
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-500">ducnhan762013@gmail.com</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#8C5329] group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>

                {/* Guest Account Button */}
                <button
                  type="button"
                  onClick={() => handleLogin('guest@furniture.vn', 'Khách Mua Hàng', 'guest')}
                  disabled={loading}
                  className="w-full p-3 rounded-2xl border border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50 transition flex items-center justify-between group"
                >
                  <div className="flex items-center gap-3 text-left">
                    <div className="w-9 h-9 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-500 font-bold text-xs">
                      👤
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#2D241E]">Khách Mua Hàng</span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-stone-200 text-stone-700">
                          Guest
                        </span>
                      </div>
                      <span className="text-[11px] text-stone-500">guest@furniture.vn</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-stone-500 group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>
              </div>

              {/* Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="shrink-0 mx-3 text-[11px] text-stone-400 uppercase tracking-wider font-semibold">
                  Hoặc Nhập Email Tùy Chọn
                </span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>

              {/* Custom Email Form */}
              <form onSubmit={handleCustomSubmit} className="space-y-3">
                <div>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="email"
                      required
                      placeholder="Nhập địa chỉ email (vd: nhaterik@gmail.com)"
                      value={customEmail}
                      onChange={(e) => setCustomEmail(e.target.value)}
                      className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:border-[#8C5329] focus:ring-1 focus:ring-[#8C5329] text-xs outline-hidden"
                    />
                  </div>
                </div>

                {/* Real-time Role Indicator Badge */}
                {cleanCustomEmail && (
                  <div 
                    className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 transition-all ${
                      isCustomAdmin
                        ? 'bg-amber-50 border-amber-300 text-amber-900'
                        : 'bg-stone-50 border-stone-300 text-stone-700'
                    }`}
                  >
                    {isCustomAdmin ? (
                      <>
                        <Crown className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Email hợp lệ! Hệ thống sẽ cấp quyền <strong>Admin (Quản trị)</strong>.
                        </span>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 text-stone-500 shrink-0" />
                        <span>
                          Hệ thống sẽ cấp quyền <strong>Khách vãng lai (Guest)</strong>.
                        </span>
                      </>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || !cleanCustomEmail}
                  className="w-full py-2.5 px-4 rounded-xl bg-[#2D241E] hover:bg-black text-[#D4A373] text-xs font-bold transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-xs"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{loading ? 'Đang Đăng Nhập...' : 'Đăng Nhập Với Email Này'}</span>
                </button>
              </form>

              {currentUser && (
                <div className="pt-2 text-center">
                  <button
                    type="button"
                    onClick={() => setIsSwitching(false)}
                    className="text-xs text-stone-500 hover:text-stone-800 underline"
                  >
                    ← Quay lại tài khoản hiện tại
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
