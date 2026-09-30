import React, { useState } from 'react';
import { X, User, Shield, LogOut, CheckCircle2, Crown, Mail, ArrowRight, Sparkles, ExternalLink } from 'lucide-react';

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
    const role = forcedRole || (isAdmin ? 'admin' : 'customer');

    let defaultName = name;
    if (!defaultName) {
      if (cleanEmail === 'nhaterik@gmail.com') defaultName = 'Nhật Erik (Admin)';
      else if (cleanEmail === 'ducnhan762013@gmail.com') defaultName = 'Đức Nhân (Admin)';
      else defaultName = 'Khách Mua Hàng';
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
        if (onLoginSuccess) onLoginSuccess(data.user);
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
      display_name: defaultName,
      role,
      avatar_url: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(defaultName)}`
    };
    if (onLoginSuccess) onLoginSuccess(mockUser);
    setIsSwitching(false);
    onClose();
  }

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!cleanCustomEmail) return;
    handleLogin(cleanCustomEmail, customName);
  }

  const showActiveProfile = currentUser && !isSwitching;
  const userDisplayName = currentUser?.display_name || currentUser?.name || currentUser?.email || 'Tài khoản';
  const userAvatar = currentUser?.avatar_url || currentUser?.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(userDisplayName)}`;

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
            type="button"
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
                  src={userAvatar} 
                  alt={userDisplayName} 
                  className="w-16 h-16 rounded-2xl border-2 border-[#8C5329] shadow-xs object-cover bg-white"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <h4 className="font-serif font-bold text-base text-[#2D241E] truncate">
                      {userDisplayName}
                    </h4>
                    {currentUser.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#8C5329] text-[#FFD166] shadow-xs">
                        <Crown className="w-3 h-3" /> Admin
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-stone-200 text-stone-700">
                        <User className="w-3 h-3" /> Thành viên
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-stone-600 truncate">{currentUser.email}</p>
                  {currentUser.loyalty_points !== undefined && (
                    <p className="text-[11px] text-[#8C5329] font-medium mt-1">
                      Điểm tích lũy: <strong className="font-bold">{currentUser.loyalty_points} điểm</strong>
                    </p>
                  )}
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
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>Tài khoản khách hàng chính thức</span>
                  </div>
                  <p className="text-[11px] leading-relaxed text-stone-600">
                    Tài khoản đã đăng nhập có thể đồng bộ giỏ hàng, lưu sổ địa chỉ giao nhận nhiều nơi và theo dõi lịch sử đơn hàng trực tuyến.
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
            <div className="space-y-6">
              <div className="text-center space-y-2">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#F5EBE0] text-[#8C5329] mb-1">
                  <Shield className="w-6 h-6" />
                </div>
                <h4 className="font-serif text-xl font-bold text-[#2D241E]">
                  Đăng Nhập Vào ABC Furniture
                </h4>
                <p className="text-xs text-stone-600 max-w-sm mx-auto leading-relaxed">
                  Đăng nhập để đồng bộ giỏ hàng trên nhiều thiết bị, lưu sổ địa chỉ nhận hàng và theo dõi tiến độ đơn hàng thời gian thực.
                </p>
              </div>

              {/* Primary OAuth Action: Google Sign-In */}
              <div className="space-y-3">
                <a
                  href="/api/auth/google"
                  className="w-full py-3.5 px-5 rounded-2xl bg-white hover:bg-stone-50 text-[#2D241E] text-sm font-semibold border-2 border-stone-200 hover:border-[#8C5329] transition flex items-center justify-center gap-3 shadow-xs hover:shadow-md group"
                >
                  <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <span>Tiếp tục bằng tài khoản Google</span>
                  <ExternalLink className="w-3.5 h-3.5 text-stone-400 group-hover:text-[#8C5329] transition-colors" />
                </a>

                <p className="text-[11px] text-center text-stone-500 leading-normal">
                  Sử dụng Google OAuth 2.0 PKCE chuẩn bảo mật Cloudflare Pages Functions.
                </p>
              </div>

              {/* Divider */}
              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-stone-200"></div>
                <span className="shrink-0 mx-3 text-[10px] text-stone-400 uppercase tracking-wider font-semibold">
                  Hoặc chế độ thử nghiệm nhanh
                </span>
                <div className="flex-grow border-t border-stone-200"></div>
              </div>

              {/* Fast 1-Click Login Accounts for Testing / Dev */}
              <div className="space-y-2.5">
                {/* Default Admin 1: nhaterik@gmail.com */}
                <button
                  type="button"
                  onClick={() => handleLogin('nhaterik@gmail.com', 'Nhật Erik (Admin)', 'admin')}
                  disabled={loading}
                  className="w-full p-2.5 rounded-2xl border border-[#D5BDAF] bg-[#FAF8F5] hover:bg-[#F5EBE0] transition flex items-center justify-between group shadow-2xs text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src="https://api.dicebear.com/7.x/initials/svg?seed=Nhat%20Erik"
                      alt="Nhat Erik"
                      className="w-8 h-8 rounded-full border border-[#8C5329]"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#2D241E]">Nhật Erik</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#8C5329] text-[#FFD166] flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> Admin
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500">nhaterik@gmail.com</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#8C5329] group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>

                {/* Default Admin 2: ducnhan762013@gmail.com */}
                <button
                  type="button"
                  onClick={() => handleLogin('ducnhan762013@gmail.com', 'Đức Nhân (Admin)', 'admin')}
                  disabled={loading}
                  className="w-full p-2.5 rounded-2xl border border-[#D5BDAF] hover:border-[#8C5329] bg-white hover:bg-[#FAF8F5] transition flex items-center justify-between group shadow-2xs text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <img
                      src="https://api.dicebear.com/7.x/initials/svg?seed=Duc%20Nhan"
                      alt="Duc Nhan"
                      className="w-8 h-8 rounded-full border border-stone-300"
                    />
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-[#2D241E]">Đức Nhân</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-[#8C5329] text-[#FFD166] flex items-center gap-0.5">
                          <Crown className="w-2.5 h-2.5" /> Admin
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500">ducnhan762013@gmail.com</span>
                    </div>
                  </div>
                  <span className="text-xs font-semibold text-[#8C5329] group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>

                {/* Customer Demo Account Button */}
                <button
                  type="button"
                  onClick={() => handleLogin('customer@furniture.vn', 'Khách Mua Hàng', 'customer')}
                  disabled={loading}
                  className="w-full p-2.5 rounded-2xl border border-stone-200 hover:border-stone-400 bg-white hover:bg-stone-50 transition flex items-center justify-between group text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full bg-stone-100 border border-stone-300 flex items-center justify-center text-stone-500 font-bold text-xs">
                      👤
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-[#2D241E]">Khách Mua Hàng</span>
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-stone-200 text-stone-700">
                          Khách Hàng
                        </span>
                      </div>
                      <span className="text-[10px] text-stone-500">customer@furniture.vn</span>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-stone-500 group-hover:translate-x-0.5 transition-transform">
                    Chọn →
                  </span>
                </button>
              </div>

              {/* Custom Email Form */}
              <form onSubmit={handleCustomSubmit} className="space-y-3 pt-1">
                <div className="relative">
                  <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    placeholder="Hoặc nhập email thử nghiệm (vd: test@abc.vn)"
                    value={customEmail}
                    onChange={(e) => setCustomEmail(e.target.value)}
                    className="w-full pl-10 pr-3.5 py-2.5 rounded-xl border border-stone-300 focus:border-[#8C5329] focus:ring-1 focus:ring-[#8C5329] text-xs outline-hidden"
                  />
                </div>

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
                        <span>Email hợp lệ! Hệ thống sẽ cấp quyền <strong>Admin</strong>.</span>
                      </>
                    ) : (
                      <>
                        <User className="w-4 h-4 text-stone-500 shrink-0" />
                        <span>Hệ thống sẽ cấp quyền <strong>Khách hàng (Customer)</strong>.</span>
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
                  <span>{loading ? 'Đang Đăng Nhập...' : 'Đăng Nhập Thử Nghiệm'}</span>
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
