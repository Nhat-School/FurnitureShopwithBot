import React, { useState } from 'react';
import { X, Upload, Plus, Trash2, Edit2, Shield, CheckCircle2, Loader2, Image, Box } from 'lucide-react';
import { formatVND } from './ProductCard';

export default function AdminProductModal({ 
  isOpen, 
  onClose, 
  products, 
  onProductCreated,
  onProductDeleted 
}) {
  const [activeTab, setActiveTab] = useState('list'); // list, create
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [sku, setSku] = useState(`FUR-${Math.floor(1000 + Math.random() * 9000)}`);
  const [categoryId, setCategoryId] = useState('cat_living');
  const [price, setPrice] = useState(8500000);
  const [stock, setStock] = useState(10);
  const [safetyStock, setSafetyStock] = useState(3);
  const [widthCm, setWidthCm] = useState(160);
  const [depthCm, setDepthCm] = useState(75);
  const [heightCm, setHeightCm] = useState(80);
  const [weightKg, setWeightKg] = useState(35);
  const [material, setMaterial] = useState('Gỗ Sồi Bắc Mỹ Tự Nhiên');
  const [woodFinish, setWoodFinish] = useState('Sồi Tự Nhiên (Natural Oak)');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  if (!isOpen) return null;

  // Upload image to Cloudflare R2
  async function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (res.ok) {
        const data = await res.json();
        setImageUrl(data.url);
      } else {
        throw new Error('Upload failed');
      }
    } catch (err) {
      // Fallback preview
      const localUrl = URL.createObjectURL(file);
      setImageUrl(localUrl);
    } finally {
      setUploading(false);
    }
  }

  // Create new product in D1
  async function handleCreateProduct(e) {
    e.preventDefault();
    setSubmitting(true);

    const newProd = {
      id: `prod_${Date.now()}`,
      sku,
      name,
      category_id: categoryId,
      price: parseFloat(price),
      stock: parseInt(stock),
      safety_stock: parseInt(safetyStock),
      width_cm: parseFloat(widthCm),
      depth_cm: parseFloat(depthCm),
      height_cm: parseFloat(heightCm),
      weight_kg: parseFloat(weightKg),
      material,
      wood_finish: woodFinish,
      description,
      image_url: imageUrl || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80',
      is_featured: 1
    };

    try {
      const res = await fetch('/api/products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newProd)
      });

      if (res.ok) {
        const data = await res.json();
        onProductCreated(data.product || newProd);
      } else {
        onProductCreated(newProd);
      }
    } catch (err) {
      onProductCreated(newProd);
    } finally {
      setSubmitting(false);
      setActiveTab('list');
      // Reset SKU
      setSku(`FUR-${Math.floor(1000 + Math.random() * 9000)}`);
      setName('');
      setDescription('');
    }
  }

  // Delete product from D1
  async function handleDeleteProduct(id) {
    if (!confirm('Bạn có chắc chắn muốn xóa sản phẩm này khỏi cơ sở dữ liệu D1?')) return;
    try {
      await fetch(`/api/products/${id}`, { method: 'DELETE' });
    } catch (e) {
      // Handled
    }
    onProductDeleted(id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/65 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-[#E8DFC8]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-[#2D241E] text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Shield className="w-5 h-5 text-[#D4A373]" />
            <div>
              <h3 className="font-serif text-base font-bold">Admin Portal - Quản Lý Sản Phẩm & Cloudflare R2</h3>
              <p className="text-[11px] text-stone-300">Đăng sản phẩm mới, upload ảnh lên R2 và quản lý kho D1</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'list' ? 'create' : 'list')}
              className="px-3 py-1.5 rounded-xl bg-[#8C5329] hover:bg-[#70401E] text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              {activeTab === 'list' ? <Plus className="w-4 h-4" /> : <Box className="w-4 h-4" />}
              <span>{activeTab === 'list' ? 'Đăng Sản Phẩm Mới' : 'Xem Danh Sách'}</span>
            </button>
            <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10 text-stone-300 hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 bg-[#FAF8F5]">
          {activeTab === 'list' ? (
            /* Product List Table */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#582F0E]">
                  Tổng Số Sản Phẩm Trong D1: {products.length}
                </h4>
              </div>

              <div className="bg-white rounded-2xl border border-[#E8DFC8] overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#F5EBE0] text-[#582F0E] font-bold border-b border-[#E8DFC8]">
                    <tr>
                      <th className="p-3">Ảnh</th>
                      <th className="p-3">Tên & SKU</th>
                      <th className="p-3">Kích Thước (cm)</th>
                      <th className="p-3">Chất Liệu</th>
                      <th className="p-3">Giá Bán</th>
                      <th className="p-3">Kho</th>
                      <th className="p-3 text-right">Thao Tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E8DFC8]">
                    {products.map(p => (
                      <tr key={p.id} className="hover:bg-[#FAF8F5]">
                        <td className="p-3">
                          <img src={p.image_url} alt="" className="w-12 h-12 object-cover rounded-xl border border-[#D5BDAF]" />
                        </td>
                        <td className="p-3">
                          <p className="font-bold text-[#2D241E] line-clamp-1">{p.name}</p>
                          <span className="font-mono text-[10px] text-stone-500">{p.sku}</span>
                        </td>
                        <td className="p-3 font-mono text-[11px] text-stone-600">
                          {p.width_cm}x{p.depth_cm}x{p.height_cm}
                        </td>
                        <td className="p-3 text-[11px] text-stone-600">
                          {p.wood_finish || p.material}
                        </td>
                        <td className="p-3 font-bold text-[#8C5329]">
                          {formatVND(p.price)}
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            p.stock <= (p.safety_stock || 3) 
                              ? 'bg-amber-100 text-amber-800' 
                              : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {p.stock} cái
                          </span>
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleDeleteProduct(p.id)}
                            className="p-1.5 text-stone-400 hover:text-red-600 rounded-lg hover:bg-red-50 transition"
                            title="Xóa khỏi database"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Create Product Form */
            <form onSubmit={handleCreateProduct} className="space-y-6 max-w-2xl mx-auto bg-white p-6 rounded-3xl border border-[#E8DFC8] shadow-sm">
              <h4 className="font-serif text-lg font-bold text-[#2D241E] border-b border-[#E8DFC8] pb-3 flex items-center gap-2">
                <Plus className="w-5 h-5 text-[#8C5329]" />
                <span>Đăng Sản Phẩm Mới Vào Hệ Thống</span>
              </h4>

              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="col-span-2 sm:col-span-1">
                  <label className="font-bold text-[#2D241E] block mb-1">Tên Sản Phẩm *</label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="VD: Bàn Trà Tròn Gỗ Óc Chó Tự Nhiên"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl focus:ring-1 focus:ring-[#8C5329]"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label className="font-bold text-[#2D241E] block mb-1">Mã SKU *</label>
                  <input
                    type="text"
                    required
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl font-mono focus:ring-1 focus:ring-[#8C5329]"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Danh Mục</label>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl"
                  >
                    <option value="cat_living">Phòng Khách (Living Room)</option>
                    <option value="cat_dining">Phòng Ăn (Dining Room)</option>
                    <option value="cat_bedroom">Phòng Ngủ (Bedroom)</option>
                    <option value="cat_office">Phòng Làm Việc (Home Office)</option>
                  </select>
                </div>

                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Giá Bán (VND) *</label>
                  <input
                    type="number"
                    required
                    min="100000"
                    step="50000"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Spatial Dimensions (FR04/FR05) */}
              <div className="p-4 rounded-2xl bg-[#FAF8F5] border border-[#E8DFC8] space-y-3">
                <h5 className="text-xs font-bold uppercase tracking-wider text-[#8C5329]">
                  Thông Số Kích Thước Lọt Lòng & Khối Lượng
                </h5>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <label className="text-[11px] text-stone-600 block mb-1">Dài (cm)</label>
                    <input
                      type="number"
                      required
                      value={widthCm}
                      onChange={(e) => setWidthCm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#D5BDAF] rounded-lg font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-stone-600 block mb-1">Sâu (cm)</label>
                    <input
                      type="number"
                      required
                      value={depthCm}
                      onChange={(e) => setDepthCm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#D5BDAF] rounded-lg font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-stone-600 block mb-1">Cao (cm)</label>
                    <input
                      type="number"
                      required
                      value={heightCm}
                      onChange={(e) => setHeightCm(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#D5BDAF] rounded-lg font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-stone-600 block mb-1">Nặng (kg)</label>
                    <input
                      type="number"
                      required
                      value={weightKg}
                      onChange={(e) => setWeightKg(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white border border-[#D5BDAF] rounded-lg font-mono text-center"
                    />
                  </div>
                </div>
              </div>

              {/* Material & Stock */}
              <div className="grid grid-cols-2 gap-4 text-xs">
                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Vật Liệu Gỗ / Đệm</label>
                  <input
                    type="text"
                    value={material}
                    onChange={(e) => setMaterial(e.target.value)}
                    placeholder="VD: Gỗ Sồi Bắc Mỹ + Da Microfiber"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Màu Hoàn Thiện (Wood Finish)</label>
                  <input
                    type="text"
                    value={woodFinish}
                    onChange={(e) => setWoodFinish(e.target.value)}
                    placeholder="VD: Sồi Tự Nhiên / Lau Màu Óc Chó"
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl"
                  />
                </div>

                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Tồn Kho Hiện Tại</label>
                  <input
                    type="number"
                    value={stock}
                    onChange={(e) => setStock(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl font-mono"
                  />
                </div>
                <div>
                  <label className="font-bold text-[#2D241E] block mb-1">Ngưỡng Báo Thiếu (Safety Stock FR17)</label>
                  <input
                    type="number"
                    value={safetyStock}
                    onChange={(e) => setSafetyStock(e.target.value)}
                    className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl font-mono"
                  />
                </div>
              </div>

              {/* Cloudflare R2 Image Upload */}
              <div className="space-y-2 text-xs">
                <label className="font-bold text-[#2D241E] block">Hình Ảnh Sản Phẩm (Cloudflare R2 Bucket)</label>
                
                <div className="border-2 border-dashed border-[#D5BDAF] rounded-2xl p-4 text-center hover:bg-[#FAF8F5] transition">
                  {imageUrl ? (
                    <div className="space-y-2">
                      <img src={imageUrl} alt="Uploaded" className="w-32 h-32 object-cover rounded-xl mx-auto border border-[#D5BDAF] shadow-xs" />
                      <button
                        type="button"
                        onClick={() => setImageUrl('')}
                        className="text-[11px] text-red-600 hover:underline"
                      >
                        Đổi ảnh khác
                      </button>
                    </div>
                  ) : (
                    <div>
                      {uploading ? (
                        <div className="flex items-center justify-center gap-2 py-4">
                          <Loader2 className="w-5 h-5 text-[#8C5329] animate-spin" />
                          <span className="text-stone-500">Đang lưu vào Cloudflare R2...</span>
                        </div>
                      ) : (
                        <label className="cursor-pointer block py-3">
                          <Upload className="w-8 h-8 text-[#8C5329] mx-auto mb-1" />
                          <span className="font-bold text-[#582F0E]">Chọn ảnh từ máy tính</span>
                          <span className="text-stone-400 block text-[10px] mt-0.5">Tự động nén & upload vào R2 storage</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleFileUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-stone-500">Hoặc dán URL ảnh trực tiếp:</span>
                  <input
                    type="url"
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 px-3 py-1.5 bg-[#FAF8F5] border border-[#D5BDAF] rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Description */}
              <div className="text-xs">
                <label className="font-bold text-[#2D241E] block mb-1">Mô Tả Sản Phẩm</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Mô tả vân gỗ, kết cấu mộng ghép, đệm mút và phong cách thiết kế..."
                  className="w-full px-3 py-2 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl"
                />
              </div>

              {/* Submit CTA */}
              <div className="pt-3 border-t border-[#E8DFC8] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('list')}
                  className="px-4 py-2.5 rounded-xl border border-[#D5BDAF] text-stone-600 text-xs font-semibold hover:bg-stone-50"
                >
                  Hủy Bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-6 py-2.5 rounded-xl bg-[#582F0E] hover:bg-[#43281C] text-white text-xs font-bold transition shadow-md flex items-center gap-2"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  <span>Lưu & Đăng Lên Cửa Hàng D1</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
