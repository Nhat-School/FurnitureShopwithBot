import React, { useState } from 'react';
import { X, Sparkles, Shield, User, LogIn, CheckCircle2 } from 'lucide-react';

export default function AuthModal({ isOpen, onClose, onLoginSuccess, currentUser }) {
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  async function handleGoogleLogin(email, name, role = 'customer') {
    setLoading(true);
    try {
      const res = await fetch('/api/auth/google', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          name,
          role,
          avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
        })
      });

      if (res.ok) {
        const data = await res.json();
        onLoginSuccess(data.user);
        onClose();
      }
    } catch (err) {
      // Local fallback
      const mockUser = {
        id: `usr_${Date.now()}`,
        email,
        name,
        role,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`
      };
      onLoginSuccess(mockUser);
      onClose();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-[#E8DFC8]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <User className="w-5 h-5 text-[#D4A373]" />
            <h3 className="font-serif text-base font-bold">Đăng Nhập Tài Khoản</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          <div className="text-center space-y-1">
            <h4 className="font-serif text-lg font-bold text-[#2D241E]">
              Chào Mừng Đến Với ABC Furniture
            </h4>
            <p className="text-xs text-stone-500">
              Đăng nhập nhanh để lưu bản vẽ phòng 2D và quản lý sản phẩm
            </p>
          </div>

          {/* Quick Google Sign In */}
          <div className="space-y-3">
            <button
              onClick={() => handleGoogleLogin('phamnhat7625@gmail.com', 'Phạm Văn Nhất (Admin)', 'admin')}
              disabled={loading}
              className="w-full py-3 px-4 rounded-2xl border-2 border-[#D5BDAF] hover:border-[#8C5329] bg-white hover:bg-[#FAF8F5] transition flex items-center justify-center gap-3 shadow-xs"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span className="text-xs font-bold text-[#2D241E]">
                Đăng Nhập Nhanh Bằng Google (Admin)
              </span>
            </button>

            <button
              onClick={() => handleGoogleLogin('khachhang@gmail.com', 'Khách Mua Hàng', 'customer')}
              disabled={loading}
              className="w-full py-2.5 px-4 rounded-xl border border-stone-200 hover:bg-stone-50 text-stone-600 text-xs font-semibold flex items-center justify-center gap-2"
            >
              <span>Tiếp Tục Với Tư Cách Khách Hàng</span>
            </button>
          </div>

          <div className="p-3 bg-[#F5EBE0] rounded-xl border border-[#D5BDAF] text-[11px] text-[#582F0E] flex items-center gap-2">
            <Shield className="w-4 h-4 text-[#8C5329] shrink-0" />
            <span>Tài khoản Admin có quyền đăng sản phẩm và upload ảnh trực tiếp lên Cloudflare R2.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
