import React from 'react';
import { ShieldCheck, Truck, Sparkles, MapPin, Phone, Mail } from 'lucide-react';

export default function Footer() {
  return (
    <footer className="bg-[#231B15] text-[#D5BDAF] pt-16 pb-12 border-t border-[#3D2F25]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        
        {/* Top 3 Selling Points */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pb-12 border-b border-[#3D2F25]">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-[#8C5329]/30 text-[#D4A373] border border-[#8C5329]/40">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-serif text-base font-bold text-white">AI Spatial Fitting</h4>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                Ứng dụng trí tuệ nhân tạo tính toán khoảng lọt lòng lối đi, loại bỏ hoàn toàn rủi ro mua đồ quá khổ.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-[#8C5329]/30 text-[#D4A373] border border-[#8C5329]/40">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-serif text-base font-bold text-white">Vận Tải Chuyên Dụng 2 Người</h4>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                Đội ngũ chuyên nghiệp bốc xếp tận phòng, hỗ trợ kiểm tra thang máy và cầu thang bộ an toàn.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-4">
            <div className="p-3 rounded-2xl bg-[#8C5329]/30 text-[#D4A373] border border-[#8C5329]/40">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h4 className="font-serif text-base font-bold text-white">Gỗ Tự Nhiên Tuyển Chọn</h4>
              <p className="text-xs text-stone-400 mt-1 leading-relaxed">
                100% gỗ sồi Bắc Mỹ, óc chó và tần bì qua xử lý sấy tiêu chuẩn chống cong vênh mối mọt 36 tháng.
              </p>
            </div>
          </div>
        </div>

        {/* Links & Company info */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 py-12 border-b border-[#3D2F25]">
          <div className="space-y-3">
            <h3 className="font-serif text-lg font-bold text-white tracking-wider">ABC FURNITURE</h3>
            <p className="text-xs text-stone-400 leading-relaxed">
              Hệ thống Thương Mại Điện Tử Nội Thất Gỗ Tự Nhiên & Nền Tảng Thiết Kế Không Gian Thông Minh.
            </p>
            <p className="text-[11px] text-[#8C5329] font-medium">
              Đề án Môn Thiết Kế Hệ Thống Thông Tin - PTIT 2026
            </p>
          </div>

          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Danh Mục Sản Phẩm</h4>
            <ul className="space-y-1.5 text-stone-400">
              <li>Sofa & Bàn Trà Phòng Khách</li>
              <li>Bộ Bàn Ăn Gỗ Sồi & Ghế Nappa</li>
              <li>Giường Ngủ Zen & Tủ Áo Khung Kính</li>
              <li>Bàn Làm Việc Công Thái Học Nâng Hạ</li>
            </ul>
          </div>

          <div className="space-y-2 text-xs">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Hạ Tầng Cloudflare</h4>
            <ul className="space-y-1.5 text-stone-400">
              <li>Cloudflare Pages + Pages Functions</li>
              <li>Workers AI: Llama 3.1 & FLUX.1-schnell</li>
              <li>Cloudflare D1 SQL Database & R2 Storage</li>
              <li>Automated CI/CD via GitHub Actions</li>
            </ul>
          </div>

          <div className="space-y-2.5 text-xs text-stone-400">
            <h4 className="font-bold text-white uppercase tracking-wider text-[11px]">Liên Hệ Showroom</h4>
            <p className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#8C5329] shrink-0" />
              <span>Hà Nội: PTIT Campus, Hà Đông, Hà Nội</span>
            </p>
            <p className="flex items-center gap-2">
              <Phone className="w-4 h-4 text-[#8C5329] shrink-0" />
              <span>Hotline CSKH: 0988.762.599</span>
            </p>
            <p className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-[#8C5329] shrink-0" />
              <span>support@abcfurniture.pages.dev</span>
            </p>
          </div>
        </div>

        {/* Bottom copyright */}
        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between text-[11px] text-stone-500 gap-4">
          <p>© 2026 ABC Furniture Shop. All rights reserved. Phạm Văn Nhất - B23DCCE074.</p>
          <div className="flex items-center gap-4">
            <span>Chính Sách Bảo Hành</span>
            <span>Vận Tải Cồng Kềnh</span>
            <span>Bảo Mật Thông Tin</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
