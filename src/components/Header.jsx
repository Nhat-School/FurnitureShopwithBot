import React, { useState, useEffect, useRef } from 'react';
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
  LogOut, 
  Package, 
  MapPin, 
  Settings 
} from 'lucide-react';

export default function Header({ 
  cartCount = 0, 
  onOpenCart, 
  onOpenAI, 
  onOpenPlanner, 
  onOpenTracker,
  searchQuery = '',
  setSearchQuery = () => {},
  selectedCategory = 'all',
  setSelectedCategory = () => {},
  currentUser = null,
  onUpdateUser,
  onOpenAuth,
  onOpenAuthModal,
  onOpenAdmin,
  onOpenOrderHistory,
  onOpenOrders,
  onOpenAddressBook,
  onOpenAddresses,
  onLogout
}) {
  const [localUser, setLocalUser] = useState(currentUser);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const dropdownRef = useRef(null);

  const categories = [
    { id: 'all', name: 'Tất Cả' },
    { id: 'living-room', name: 'Phòng Khách' },
    { id: 'dining-room', name: 'Phòng Ăn' },
    { id: 'bedroom', name: 'Phòng Ngủ' },
    { id: 'office', name: 'Phòng Làm Việc' }
  ];

  // Sync internal state when parent currentUser changes
  useEffect(() => {
    setLocalUser(currentUser);
  }, [currentUser]);

  // Session Restoration: fetch /api/auth/me on mount
  useEffect(() => {
    let isMounted = true;
    async function restoreSession() {
      try {
        const res = await fetch('/api/auth/me', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'include'
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.user && isMounted) {
            setLocalUser(data.user);
            if (onUpdateUser) onUpdateUser(data.user);
          }
        }
      } catch (err) {
        console.debug('Session check skipped or offline:', err);
      }
    }
    restoreSession();
    return () => {
      isMounted = false;
    };
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    if (isDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  // Sign out action calling /api/auth/logout (satisfies T1.F12.3)
  async function handleSignOut() {
    setIsDropdownOpen(false);
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
    } catch (err) {
      console.warn('Sign-out request failed:', err);
    } finally {
      setLocalUser(null);
      try {
        localStorage.removeItem('fur_user');
      } catch (e) {}
      if (onUpdateUser) onUpdateUser(null);
      if (onLogout) onLogout();
    }
  }

  const handleOpenLogin = onOpenAuthModal || onOpenAuth;
  const handleOpenMyOrders = onOpenOrderHistory || onOpenOrders;
  const handleOpenMyAddresses = onOpenAddressBook || onOpenAddresses;

  const activeUser = localUser || currentUser;
  const displayName = activeUser?.display_name || activeUser?.first_name || activeUser?.name || (activeUser?.email ? activeUser.email.split('@')[0] : '');
  const avatarSrc = activeUser?.avatar_url || activeUser?.avatar;

  function getUserInitials(name, email) {
    if (name) {
      const parts = name.trim().split(/\s+/);
      if (parts.length >= 2) {
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }
      return name.slice(0, 2).toUpperCase();
    }
    if (email) {
      return email.slice(0, 2).toUpperCase();
    }
    return 'U';
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
          <div 
            className="flex items-center gap-3 cursor-pointer" 
            onClick={() => { setSelectedCategory('all'); setSearchQuery(''); }}
          >
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

          {/* Search Bar with Voice & Visual inputs (UC03) */}
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
                  onClick={() => onOpenAI && onOpenAI('Tôi muốn tìm mẫu sofa văng gỗ sồi cho phòng khách dài 4 mét')}
                  className="p-1.5 text-[#8C5329] hover:bg-[#F5EBE0] rounded-full transition"
                >
                  <Mic className="w-4 h-4" />
                </button>
                <button 
                  title="Tìm kiếm bằng hình ảnh (Multimodal Vision)"
                  onClick={() => onOpenAI && onOpenAI('Tôi muốn phân tích hình ảnh phòng khách để chọn bàn ghế phù hợp')}
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
              onClick={() => onOpenAI && onOpenAI()}
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

            {/* Admin Management Button (If Admin) */}
            {activeUser?.role === 'admin' && (
              <button
                onClick={onOpenAdmin}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg bg-[#2D241E] text-[#D4A373] hover:bg-black transition border border-[#D4A373]/40 shadow-xs"
              >
                <span>⚙️ Quản Trị D1</span>
              </button>
            )}

            {/* User Account / Google Login & Account Dropdown */}
            {activeUser ? (
              <div className="relative" ref={dropdownRef}>
                <button 
                  type="button"
                  onClick={() => setIsDropdownOpen(prev => !prev)}
                  className="flex items-center gap-2 p-1.5 pr-2.5 rounded-xl hover:bg-[#F5EBE0] transition border border-[#D5BDAF]/60 bg-white/80 shadow-2xs group cursor-pointer"
                  aria-expanded={isDropdownOpen}
                  aria-haspopup="true"
                  title={`${displayName} (${activeUser.email || ''})`}
                >
                  {avatarSrc && !avatarError ? (
                    <img 
                      src={avatarSrc} 
                      alt={displayName} 
                      onError={() => setAvatarError(true)}
                      className="w-7 h-7 rounded-full border border-[#8C5329] object-cover bg-white" 
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[#8C5329] to-[#582F0E] text-white text-[11px] font-bold flex items-center justify-center border border-[#8C5329] shadow-2xs">
                      {getUserInitials(displayName, activeUser.email)}
                    </div>
                  )}

                  <div className="hidden md:flex flex-col text-left leading-tight">
                    <span className="text-xs font-bold text-[#2D241E] max-w-[110px] truncate">
                      {displayName}
                    </span>
                    <span className={`text-[10px] font-bold flex items-center gap-0.5 ${activeUser.role === 'admin' ? 'text-[#8C5329]' : 'text-stone-500'}`}>
                      {activeUser.role === 'admin' ? (
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

                  <ChevronDown className={`w-3.5 h-3.5 text-stone-500 group-hover:text-[#8C5329] transition-transform duration-200 ${isDropdownOpen ? 'rotate-180' : ''}`} />
                </button>

                {/* Account Dropdown Menu */}
                {isDropdownOpen && (
                  <div className="absolute right-0 top-full mt-2 w-64 bg-white rounded-2xl shadow-xl border border-[#E8DFC8] py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* User Card Header */}
                    <div className="px-4 py-3 border-b border-stone-100 flex items-center gap-3 bg-[#FAF8F5]/80 rounded-t-xl">
                      {avatarSrc && !avatarError ? (
                        <img 
                          src={avatarSrc} 
                          alt={displayName} 
                          className="w-10 h-10 rounded-full border border-[#8C5329] object-cover" 
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#8C5329] to-[#582F0E] text-white text-xs font-bold flex items-center justify-center">
                          {getUserInitials(displayName, activeUser.email)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#2D241E] truncate">{displayName}</p>
                        <p className="text-[11px] text-stone-500 truncate">{activeUser.email}</p>
                        {activeUser.loyalty_points !== undefined && (
                          <span className="text-[10px] text-[#8C5329] font-medium block mt-0.5">
                            ⭐ {activeUser.loyalty_points} điểm tích lũy
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Navigation Items */}
                    <div className="py-1 text-xs">
                      {/* My Orders */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (handleOpenMyOrders) handleOpenMyOrders();
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-[#2D241E] hover:bg-[#FAF8F5] transition text-left cursor-pointer"
                      >
                        <Package className="w-4 h-4 text-[#8C5329]" />
                        <span>Lịch Sử Đơn Hàng</span>
                      </button>

                      {/* Address Book */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (handleOpenMyAddresses) handleOpenMyAddresses();
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-[#2D241E] hover:bg-[#FAF8F5] transition text-left cursor-pointer"
                      >
                        <MapPin className="w-4 h-4 text-[#8C5329]" />
                        <span>Sổ Địa Chỉ Giao Hàng</span>
                      </button>

                      {/* Tracker */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (onOpenTracker) onOpenTracker();
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-[#2D241E] hover:bg-[#FAF8F5] transition text-left cursor-pointer"
                      >
                        <Truck className="w-4 h-4 text-[#8C5329]" />
                        <span>Tra Cứu Vận Đơn</span>
                      </button>

                      {/* Account info modal */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsDropdownOpen(false);
                          if (handleOpenLogin) handleOpenLogin();
                        }}
                        className="w-full px-4 py-2.5 flex items-center gap-2.5 text-[#2D241E] hover:bg-[#FAF8F5] transition text-left cursor-pointer"
                      >
                        <User className="w-4 h-4 text-[#8C5329]" />
                        <span>Thông Tin Tài Khoản</span>
                      </button>

                      {/* Admin link if role is admin */}
                      {activeUser.role === 'admin' && (
                        <button
                          type="button"
                          onClick={() => {
                            setIsDropdownOpen(false);
                            if (onOpenAdmin) onOpenAdmin();
                          }}
                          className="w-full px-4 py-2.5 flex items-center gap-2.5 text-[#8C5329] font-medium hover:bg-amber-50/50 transition text-left cursor-pointer"
                        >
                          <Settings className="w-4 h-4 text-amber-600" />
                          <span>Quản trị D1 Database</span>
                        </button>
                      )}
                    </div>

                    <div className="border-t border-stone-100 my-1"></div>

                    {/* Sign-Out Action calling /api/auth/logout */}
                    <div className="px-1 py-1">
                      <button
                        type="button"
                        onClick={handleSignOut}
                        className="w-full px-3 py-2 flex items-center gap-2 text-xs font-semibold text-red-700 hover:bg-red-50 rounded-xl transition text-left cursor-pointer"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Đăng xuất (Sign out)</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={handleOpenLogin}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg bg-white hover:bg-[#F5EBE0] text-[#582F0E] transition border border-[#D5BDAF] shadow-2xs cursor-pointer"
              >
                <User className="w-4 h-4 text-[#8C5329]" />
                <span>Đăng Nhập</span>
              </button>
            )}

            {/* Shopping Cart Button */}
            <button
              onClick={onOpenCart}
              className="relative p-2 text-[#582F0E] hover:bg-[#F5EBE0] rounded-lg transition cursor-pointer"
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
              className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
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
