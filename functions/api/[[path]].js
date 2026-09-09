// Cloudflare Pages Functions - Catch-all API Handler
// Handles Products, Orders, Bulky Shipping, and Cloudflare Workers AI

const SAMPLE_PRODUCTS = [
  {
    id: 'prod_sofa_nordic',
    sku: 'SOFA-ND-01',
    name: 'Sofa Văng Nordic Scandinavian 3 Chỗ',
    category_id: 'cat_living',
    category_name: 'Phòng Khách',
    price: 14500000,
    stock: 8,
    safety_stock: 3,
    width_cm: 210,
    depth_cm: 85,
    height_cm: 82,
    weight_kg: 48,
    material: 'Khung Gỗ Sồi Nga + Vải Nỉ Bouclé',
    wood_finish: 'Sồi Tự Nhiên (Natural Oak)',
    color_palette: ['#F3E9DC', '#C08552', '#5E503F'],
    description: 'Thiết kế phong cách Bắc Âu thanh lịch với chân gỗ sồi nguyên khối tiện vát tinh tế, đệm mút D40 êm ái chống xẹp lún.',
    image_url: 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_table_oak',
    sku: 'COF-OAK-02',
    name: 'Bàn Trà Gỗ Sồi Ovan Kép Minimalist',
    category_id: 'cat_living',
    category_name: 'Phòng Khách',
    price: 4200000,
    stock: 15,
    safety_stock: 5,
    width_cm: 110,
    depth_cm: 60,
    height_cm: 42,
    weight_kg: 18,
    material: 'Gỗ Sồi Tự Nhiên Bắc Mỹ',
    wood_finish: 'Sồi Tự Nhiên (Natural Oak)',
    color_palette: ['#D4A373', '#FAEDCD'],
    description: 'Bàn trà đôi dáng ovan xếp tầng hiện đại, xử lý cạnh bo tròn an toàn cho nhà có trẻ nhỏ, bề mặt sơn lót PU chống thấm nước.',
    image_url: 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_tv_walnut',
    sku: 'TV-WAL-03',
    name: 'Kệ Tivi Gỗ Óc Chó Walnut Elegance',
    category_id: 'cat_living',
    category_name: 'Phòng Khách',
    price: 11800000,
    stock: 5,
    safety_stock: 2,
    width_cm: 180,
    depth_cm: 40,
    height_cm: 50,
    weight_kg: 36,
    material: 'Gỗ Óc Chó Bắc Mỹ Tự Nhiên',
    wood_finish: 'Óc Chó (Dark Walnut)',
    color_palette: ['#43281C', '#7F4F24'],
    description: 'Vân gỗ óc chó cuộn sóng sang trọng, ngăn kéo ray giảm chấn Hafele êm ái, khoang luồn dây điện thông minh giấu dây gọn gàng.',
    image_url: 'https://images.unsplash.com/photo-1601084881623-cdf9a8ea242c?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_dining_table',
    sku: 'DIN-SET-04',
    name: 'Bộ Bàn Ăn 6 Ghế Gỗ Sồi Tự Nhiên Harmony',
    category_id: 'cat_dining',
    category_name: 'Phòng Ăn',
    price: 18900000,
    stock: 6,
    safety_stock: 2,
    width_cm: 160,
    depth_cm: 80,
    height_cm: 75,
    weight_kg: 58,
    material: 'Gỗ Sồi Tự Nhiên + Da Nappa Cao Cấp',
    wood_finish: 'Sồi Lau Màu Óc Chó',
    color_palette: ['#582F0E', '#7F4F24', '#DDA15E'],
    description: 'Bàn ăn bo cạnh mềm mại kết hợp 6 ghế đệm da nappa êm ái, khả năng chịu lực vượt trội, thích hợp cho căn hộ và nhà phố hiện đại.',
    image_url: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_bed_zen',
    sku: 'BED-ZEN-05',
    name: 'Giường Ngủ Phong Cách Nhật Zen Gỗ Tần Bì',
    category_id: 'cat_bedroom',
    category_name: 'Phòng Ngủ',
    price: 16500000,
    stock: 7,
    safety_stock: 3,
    width_cm: 185,
    depth_cm: 205,
    height_cm: 88,
    weight_kg: 65,
    material: 'Gỗ Tần Bì (Ash Wood)',
    wood_finish: 'Tần Bì Tự Nhiên Sáng Màu',
    color_palette: ['#E9ECEF', '#DEE2E6', '#6C757D'],
    description: 'Giường ngủ vạt phản giấu chân tạo hiệu ứng bay nhẹ nhàng, tựa đầu giường bọc mút êm ái tựa đọc sách trước khi ngủ.',
    image_url: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_wardrobe_lux',
    sku: 'WAR-LUX-06',
    name: 'Tủ Áo 4 Cánh Cửa Kính Khung Gỗ Óc Chó',
    category_id: 'cat_bedroom',
    category_name: 'Phòng Ngủ',
    price: 24500000,
    stock: 3,
    safety_stock: 2,
    width_cm: 200,
    depth_cm: 60,
    height_cm: 220,
    weight_kg: 95,
    material: 'Gỗ Óc Chó + Kính Cường Lực Trà',
    wood_finish: 'Óc Chó Bắc Mỹ',
    color_palette: ['#3F2E23', '#222222'],
    description: 'Tủ áo cao kịch trần tích hợp dải đèn LED cảm ứng mở cửa, cánh kính mờ sang trọng tôn vinh bộ sưu tập thời trang.',
    image_url: 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=80',
    is_featured: 0
  },
  {
    id: 'prod_desk_ergonomic',
    sku: 'DESK-ER-07',
    name: 'Bàn Làm Việc Gỗ Sồi Nâng Hạ Chiều Cao',
    category_id: 'cat_office',
    category_name: 'Phòng Làm Việc',
    price: 9200000,
    stock: 12,
    safety_stock: 4,
    width_cm: 140,
    depth_cm: 70,
    height_cm: 74,
    weight_kg: 32,
    material: 'Mặt Gỗ Sồi Nga + Khung Thép Sơn Tĩnh Điện',
    wood_finish: 'Sồi Tự Nhiên',
    color_palette: ['#E2D4B7', '#333333'],
    description: 'Mặt bàn bo góc chữ U công thái học, hỗ trợ nâng hạ điện tử 2 động cơ từ 70cm đến 118cm ghi nhớ 4 vị trí.',
    image_url: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1000&q=80',
    is_featured: 1
  },
  {
    id: 'prod_shelf_geo',
    sku: 'SHELF-GE-08',
    name: 'Kệ Sách Tổ Ong Gỗ Tự Nhiên Modular',
    category_id: 'cat_office',
    category_name: 'Phòng Làm Việc',
    price: 5600000,
    stock: 10,
    safety_stock: 3,
    width_cm: 120,
    depth_cm: 30,
    height_cm: 180,
    weight_kg: 26,
    material: 'Gỗ Cao Su Tự Nhiên Ghép Thanh Chuẩn AA',
    wood_finish: 'Vàng Gỗ Tự Nhiên',
    color_palette: ['#F3C68F', '#BC6C25'],
    description: 'Các module lục giác đa năng có thể lắp ghép linh hoạt theo kích thước mảng tường, chịu tải 25kg mỗi ngăn.',
    image_url: 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=80',
    is_featured: 0
  }
];

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/?/, '');
  const segments = path.split('/').filter(Boolean);
  const method = request.method.toUpperCase();

  if (method === 'OPTIONS') {
    return jsonResponse({}, 204);
  }

  try {
    // 1. GET /api/products - Browse, search, filter
    if (segments[0] === 'products' && (!segments[1] || segments[1] === '')) {
      if (method === 'GET') {
        const category = url.searchParams.get('category');
        const search = url.searchParams.get('search')?.toLowerCase() || '';
        const material = url.searchParams.get('material')?.toLowerCase() || '';
        const maxPrice = parseFloat(url.searchParams.get('max_price')) || Infinity;
        const maxWidth = parseFloat(url.searchParams.get('max_width')) || Infinity;

        // Try reading from D1 if available
        if (env?.DB) {
          try {
            let query = 'SELECT p.*, c.name as category_name FROM products p JOIN categories c ON p.category_id = c.id WHERE 1=1';
            const params = [];

            if (category && category !== 'all') {
              query += ' AND c.slug = ?';
              params.push(category);
            }
            if (search) {
              query += ' AND (LOWER(p.name) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(p.sku) LIKE ?)';
              params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }
            if (material) {
              query += ' AND LOWER(p.material) LIKE ?';
              params.push(`%${material}%`);
            }
            if (maxPrice < Infinity) {
              query += ' AND p.price <= ?';
              params.push(maxPrice);
            }
            if (maxWidth < Infinity) {
              query += ' AND p.width_cm <= ?';
              params.push(maxWidth);
            }

            const { results } = await env.DB.prepare(query).bind(...params).all();
            if (results && results.length > 0) {
              const formatted = results.map(r => ({
                ...r,
                color_palette: typeof r.color_palette === 'string' ? JSON.parse(r.color_palette) : r.color_palette
              }));
              return jsonResponse({ products: formatted, source: 'd1' });
            }
          } catch (e) {
            console.warn('D1 read failed, falling back to cached catalog:', e.message);
          }
        }

        // Fallback filter on SAMPLE_PRODUCTS
        let filtered = [...SAMPLE_PRODUCTS];
        if (category && category !== 'all') {
          filtered = filtered.filter(p => p.category_id.includes(category) || p.category_name.toLowerCase().includes(category));
        }
        if (search) {
          filtered = filtered.filter(p => 
            p.name.toLowerCase().includes(search) || 
            p.description.toLowerCase().includes(search) || 
            p.sku.toLowerCase().includes(search)
          );
        }
        if (material) {
          filtered = filtered.filter(p => p.material.toLowerCase().includes(material));
        }
        if (maxPrice < Infinity) {
          filtered = filtered.filter(p => p.price <= maxPrice);
        }
        if (maxWidth < Infinity) {
          filtered = filtered.filter(p => p.width_cm <= maxWidth);
        }

        return jsonResponse({ products: filtered, source: 'memory' });
      }
    }

    // 2. GET /api/products/:id - Single product detail
    if (segments[0] === 'products' && segments[1]) {
      const prodId = segments[1];
      const product = SAMPLE_PRODUCTS.find(p => p.id === prodId || p.sku === prodId);
      if (!product) {
        return jsonResponse({ error: 'Product not found' }, 404);
      }
      return jsonResponse({ product });
    }

    // 3. POST /api/ai/chat - Cloudflare Workers AI Consultation & Spatial Advisor
    if (segments[0] === 'ai' && segments[1] === 'chat' && method === 'POST') {
      const body = await request.json();
      const { messages, roomContext } = body;

      const systemPrompt = `Bạn là "FurniAI" - Chuyên gia Tư Vấn Thiết Kế Nội Thất & Tối Ưu Không Gian của ABC Furniture Shop.
Bạn nắm rõ thông số kích thước, chất liệu gỗ (Sồi Bắc Mỹ, Óc Chó Walnut, Tần Bì Ash), và các quy chuẩn lối đi trong phòng:
1. Quy tắc khoảng lọt lòng lối đi (walking clearance): Tối thiểu 75cm - 90cm giữa sofa và bàn trà hoặc kệ tivi để không bị chật chội.
2. Quy tắc tỷ lệ chiếm dụng (footprint ratio): Tổng diện tích đồ nội thất không nên vượt quá 35% - 40% diện tích phòng.
3. Quy tắc phối màu gỗ & vật liệu: Gỗ sáng (Sồi/Tần bì) hợp phong cách Bắc Âu Scandinavian hoặc Japandi. Gỗ tối (Óc Chó) hợp phong cách Sang trọng Hiện đại (Modern Luxury).
Danh mục sản phẩm hiện có:
- Sofa Văng Nordic (210x85x82cm, Gỗ Sồi + Vải Bouclé, 14.500.000đ)
- Bàn Trà Ovan Kép (110x60x42cm, Gỗ Sồi Tự Nhiên, 4.200.000đ)
- Kệ Tivi Gỗ Óc Chó (180x40x50cm, Gỗ Óc Chó Tự Nhiên, 11.800.000đ)
- Bộ Bàn Ăn 6 Ghế (160x80x75cm, Gỗ Sồi + Ghế Da Nappa, 18.900.000đ)
- Giường Ngủ Zen Nhật (185x205x88cm, Gỗ Tần Bì, 16.500.000đ)
- Bàn Làm Việc Nâng Hạ (140x70x74cm, Gỗ Sồi + Khung Điện Tử, 9.200.000đ)

Hãy trả lời chuyên nghiệp, thân thiện bằng Tiếng Việt. Phân tích cụ thể kích thước phòng của khách hàng nếu được cung cấp và đề xuất phương án sắp đặt tối ưu nhất.`;

      // If Cloudflare Workers AI binding is available:
      if (env?.AI) {
        try {
          const aiMessages = [
            { role: 'system', content: systemPrompt },
            ...(messages || [])
          ];
          const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
            messages: aiMessages,
            max_tokens: 650,
            temperature: 0.6
          });
          return jsonResponse({
            reply: aiResponse.response || aiResponse.choices?.[0]?.message?.content || 'Xin lỗi, tôi đang xử lý thông tin.',
            model: '@cf/meta/llama-3.1-8b-instruct',
            source: 'workers-ai'
          });
        } catch (e) {
          console.warn('Workers AI chat error:', e.message);
        }
      }

      // Intelligent local fallback response when AI binding is initializing
      const userText = (messages?.[messages.length - 1]?.content || '').toLowerCase();
      let fallbackReply = `Chào bạn! Tôi là chuyên viên thiết kế của ABC Furniture. `;
      
      if (userText.includes('phòng khách') || userText.includes('sofa') || userText.includes('bàn trà')) {
        fallbackReply += `Với phòng khách, tôi đề xuất bộ đôi **Sofa Văng Nordic 2.1m** kết hợp cùng **Bàn Trà Gỗ Sồi Ovan Kép (1.1m x 0.6m)**. Bộ này chỉ chiếm chiều sâu khoảng 1.85m tính cả khoảng lọt lòng 40cm giữa bàn và sofa, giữ được lối đi chính trên 80cm cực kỳ thông thoáng!`;
      } else if (userText.includes('phòng ăn') || userText.includes('bàn ăn')) {
        fallbackReply += `Cho không gian dùng bữa, **Bộ Bàn Ăn 6 Ghế Harmony (160x80cm)** từ gỗ sồi lau màu óc chó mang lại cảm giác ấm cúng. Chiều dài 1.6m rất tối ưu cho gia đình 4-6 người mà không cản trở lối đi vào bếp.`;
      } else if (userText.includes('kích thước') || userText.includes('diện tích') || userText.includes('m2') || userText.includes('mét')) {
        fallbackReply += `Để đồ nội thất hài hòa, diện tích chiếm sàn nên từ 30% đến 38% diện tích phòng. Bạn có thể mở công cụ **"Mô Phỏng Không Gian 2D"** trên trang để nhập chiều dài x chiều rộng phòng, hệ thống sẽ tính toán ngay lối đi an toàn cho bạn!`;
      } else {
        fallbackReply += `Tôi có thể hỗ trợ bạn tính toán kích thước vừa vặn cho phòng, gợi ý phối màu vân gỗ (Sồi tự nhiên, Óc chó, Tần bì) và tính phụ phí vận chuyển hàng cồng kềnh. Bạn đang cần tư vấn cho không gian nào?`;
      }

      return jsonResponse({
        reply: fallbackReply,
        model: 'furniai-heuristics-engine',
        source: 'local-engine'
      });
    }

    // 4. POST /api/ai/spatial-check - 2D Spatial Clearance & Walkway Calculator
    if (segments[0] === 'ai' && segments[1] === 'spatial-check' && method === 'POST') {
      const body = await request.json();
      const { roomLengthM, roomWidthM, roomType, selectedProductIds } = body;

      const length = parseFloat(roomLengthM) || 4.0;
      const width = parseFloat(roomWidthM) || 3.5;
      const roomAreaSqM = parseFloat((length * width).toFixed(2));

      // Calculate total footprint of selected items
      const selected = SAMPLE_PRODUCTS.filter(p => (selectedProductIds || []).includes(p.id));
      let totalFootprintSqM = 0;
      let maxItemLengthM = 0;

      selected.forEach(p => {
        const itemArea = (p.width_cm / 100) * (p.depth_cm / 100);
        totalFootprintSqM += itemArea;
        if (p.width_cm / 100 > maxItemLengthM) maxItemLengthM = p.width_cm / 100;
      });

      totalFootprintSqM = parseFloat(totalFootprintSqM.toFixed(2));
      const occupancyPercentage = parseFloat(((totalFootprintSqM / roomAreaSqM) * 100).toFixed(1));

      // Clearance analysis:
      // Minimum corridor requirement: 75cm (0.75m)
      const remainingCorridorM = parseFloat((Math.min(length, width) - (selected[0]?.depth_cm || 85) / 100).toFixed(2));
      const isCorridorSafe = remainingCorridorM >= 0.75;
      const isOccupancyHealthy = occupancyPercentage >= 15 && occupancyPercentage <= 40;

      let verdict = 'Phù hợp hoàn hảo';
      let advice = `Không gian chiếm ${occupancyPercentage}% diện tích phòng, đạt tỷ lệ vàng 30-40%.`;
      if (occupancyPercentage > 45) {
        verdict = 'Cảnh báo: Có thể gây cảm giác chật chội';
        advice = `Tổng đồ nội thất chiếm ${occupancyPercentage}% diện tích sàn. Bạn nên cân nhắc đổi sang mẫu bàn trà đơn hoặc sofa văng nhỏ hơn để mở rộng lối đi.`;
      } else if (!isCorridorSafe) {
        verdict = 'Cảnh báo lối đi hẹp';
        advice = `Lối đi còn lại chỉ đạt khoảng ${(remainingCorridorM * 100).toFixed(0)}cm (tiêu chuẩn khuyến nghị >= 75cm). Cân nhắc xoay hướng sofa hoặc dịch chuyển vị trí bàn trà.`;
      }

      return jsonResponse({
        roomAreaSqM,
        totalFootprintSqM,
        occupancyPercentage,
        remainingCorridorCm: Math.round(remainingCorridorM * 100),
        isCorridorSafe,
        isOccupancyHealthy,
        verdict,
        advice,
        itemsEvaluated: selected.map(s => ({ id: s.id, name: s.name, dimensions: `${s.width_cm}x${s.depth_cm}x${s.height_cm}cm` }))
      });
    }

    // 5. POST /api/ai/concept-image - Room Visual Concept Generator
    if (segments[0] === 'ai' && segments[1] === 'concept-image' && method === 'POST') {
      const body = await request.json();
      const { style, roomType, woodType } = body;

      const prompt = `Photorealistic interior design render of a modern ${style || 'Scandinavian'} ${roomType || 'living room'}, featuring handcrafted ${woodType || 'natural oak'} furniture, warm ambient lighting, elegant neutral color palette, architectural digest photography style, 8k resolution`;

      if (env?.AI) {
        try {
          const imageBuffer = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
            prompt,
            num_steps: 4
          });
          return new Response(imageBuffer, {
            headers: {
              'Content-Type': 'image/jpeg',
              'Cache-Control': 'public, max-age=86400'
            }
          });
        } catch (e) {
          console.warn('Workers AI Image Gen error:', e.message);
        }
      }

      // High-resolution concept staging fallback
      const curatedConcepts = {
        living: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80',
        dining: 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1200&q=80',
        bedroom: 'https://images.unsplash.com/photo-1540518614846-7ede433c4550?auto=format&fit=crop&w=1200&q=80',
        office: 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1200&q=80'
      };

      return jsonResponse({
        imageUrl: curatedConcepts[roomType] || curatedConcepts.living,
        prompt,
        source: 'curated-concept'
      });
    }

    // 6. POST /api/shipping/calculate - Bulky Freight Calculation (FR11, NFR02)
    if (segments[0] === 'shipping' && segments[1] === 'calculate' && method === 'POST') {
      const body = await request.json();
      const { items, floorNumber, hasFreightElevator, province } = body;

      let totalCubicMeters = 0;
      let totalWeightKg = 0;

      (items || []).forEach(item => {
        const prod = SAMPLE_PRODUCTS.find(p => p.id === item.id) || item;
        const vol = ((prod.width_cm || 100) / 100) * ((prod.depth_cm || 60) / 100) * ((prod.height_cm || 80) / 100);
        const qty = item.quantity || 1;
        totalCubicMeters += vol * qty;
        totalWeightKg += (prod.weight_kg || 25) * qty;
      });

      // Bulky freight formula:
      // Base fee: 150,000 VND
      // Volumetric surcharge: 250,000 VND per m3
      // Staircase surcharge: if no freight elevator and floor > 1, +80,000 VND per floor
      const baseFreight = 150000;
      const volumeSurcharge = Math.round(totalCubicMeters * 250000);
      const floor = parseInt(floorNumber) || 1;
      const stairsSurcharge = (!hasFreightElevator && floor > 1) ? (floor - 1) * 80000 : 0;
      const totalFreight = baseFreight + volumeSurcharge + stairsSurcharge;

      return jsonResponse({
        baseFreight,
        volumeSurcharge,
        stairsSurcharge,
        totalFreight,
        totalCubicMeters: parseFloat(totalCubicMeters.toFixed(3)),
        totalWeightKg: Math.round(totalWeightKg),
        deliveryEta: '2 - 3 ngày làm việc (Đội xe 2 người bốc xếp tận phòng)'
      });
    }

    // 7. POST /api/orders - Order Placement & Checkout (FR12, FR15, UC06)
    if (segments[0] === 'orders' && method === 'POST') {
      const body = await request.json();
      const { customer, items, freight, subtotal, totalAmount } = body;

      const trackingCode = `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`;
      const orderRecord = {
        id: `ord_${Date.now()}`,
        trackingCode,
        customer,
        items,
        freight,
        subtotal,
        totalAmount,
        status: 'Processing',
        createdAt: new Date().toISOString(),
        timeline: [
          { status: 'Order Placed', time: 'Vừa xong', description: 'Đơn hàng đã thanh toán thành công và chuyển cho bộ phận kho.' },
          { status: 'Picking & Packing', time: 'Dự kiến 4h tới', description: 'Đóng gói bọc góc xốp bảo vệ chống trầy xước.' },
          { status: 'Bulky Dispatch', time: 'Ngày mai', description: 'Giao cho đội ngũ vận tải chuyên dụng 2 người.' }
        ]
      };

      return jsonResponse({
        success: true,
        order: orderRecord,
        message: 'Đơn hàng đã được ghi nhận thành công.'
      });
    }

    // 8. GET /api/orders/:code - Order Tracking (UC10, FR19)
    if (segments[0] === 'orders' && segments[1]) {
      const code = segments[1].toUpperCase();
      return jsonResponse({
        trackingCode: code,
        status: 'In Transit',
        carrier: 'ABC Specialized Bulky Freight Logistics',
        estimatedDelivery: '14:00 - 17:00 ngày mai',
        timeline: [
          { time: '14:30 Hôm qua', status: 'Đã tạo đơn hàng', desc: 'Thanh toán hoàn tất, xác nhận thông số kích thước.' },
          { time: '09:00 Hôm nay', status: 'Xuất kho phân loại', desc: 'Kiểm tra bề mặt gỗ, dán tem mã vạch cồng kềnh.' },
          { time: '13:15 Hôm nay', status: 'Đang vận chuyển', desc: 'Xe tải chở hàng đang di chuyển đến kho trung chuyển khu vực.' }
        ]
      });
    }

    // 9. POST or GET /api/admin/init-db - Automatic D1 schema & seed executor
    if (segments[0] === 'admin' && segments[1] === 'init-db') {
      if (!env?.DB) {
        return jsonResponse({
          error: 'D1 binding DB is not available in environment.',
          suggestion: 'Check that [[d1_databases]] binding = "DB" is configured in wrangler.toml'
        }, 500);
      }

      try {
        const statements = [
          `CREATE TABLE IF NOT EXISTS categories (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL,
              slug TEXT UNIQUE NOT NULL,
              description TEXT,
              icon TEXT,
              created_at TEXT DEFAULT (datetime('now'))
          )`,
          `CREATE TABLE IF NOT EXISTS products (
              id TEXT PRIMARY KEY,
              sku TEXT UNIQUE NOT NULL,
              name TEXT NOT NULL,
              category_id TEXT NOT NULL,
              price REAL NOT NULL,
              stock INTEGER NOT NULL DEFAULT 0,
              safety_stock INTEGER NOT NULL DEFAULT 5,
              width_cm REAL NOT NULL,
              depth_cm REAL NOT NULL,
              height_cm REAL NOT NULL,
              weight_kg REAL NOT NULL,
              material TEXT NOT NULL,
              wood_finish TEXT,
              color_palette TEXT,
              description TEXT,
              image_url TEXT,
              images TEXT,
              is_featured INTEGER DEFAULT 0,
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (category_id) REFERENCES categories(id)
          )`,
          `CREATE TABLE IF NOT EXISTS orders (
              id TEXT PRIMARY KEY,
              customer_name TEXT NOT NULL,
              customer_email TEXT NOT NULL,
              customer_phone TEXT NOT NULL,
              delivery_address TEXT NOT NULL,
              has_freight_elevator INTEGER DEFAULT 1,
              floor_number INTEGER DEFAULT 1,
              subtotal REAL NOT NULL,
              freight_surcharge REAL NOT NULL DEFAULT 0,
              total_amount REAL NOT NULL,
              status TEXT NOT NULL DEFAULT 'Paid',
              tracking_code TEXT UNIQUE,
              payment_method TEXT DEFAULT 'CreditCard',
              notes TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              updated_at TEXT DEFAULT (datetime('now'))
          )`,
          `CREATE TABLE IF NOT EXISTS order_items (
              id TEXT PRIMARY KEY,
              order_id TEXT NOT NULL,
              product_id TEXT NOT NULL,
              quantity INTEGER NOT NULL,
              unit_price REAL NOT NULL,
              FOREIGN KEY (order_id) REFERENCES orders(id),
              FOREIGN KEY (product_id) REFERENCES products(id)
          )`,
          `CREATE TABLE IF NOT EXISTS inventory_logs (
              id TEXT PRIMARY KEY,
              product_id TEXT NOT NULL,
              change_amount INTEGER NOT NULL,
              remaining_stock INTEGER NOT NULL,
              reason TEXT NOT NULL,
              staff_name TEXT DEFAULT 'Warehouse Staff',
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (product_id) REFERENCES products(id)
          )`,
          `CREATE TABLE IF NOT EXISTS reviews (
              id TEXT PRIMARY KEY,
              product_id TEXT NOT NULL,
              customer_name TEXT NOT NULL,
              rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
              dimensional_accuracy_rating INTEGER DEFAULT 5,
              material_quality_rating INTEGER DEFAULT 5,
              comment TEXT,
              created_at TEXT DEFAULT (datetime('now')),
              FOREIGN KEY (product_id) REFERENCES products(id)
          )`,
          `INSERT OR IGNORE INTO categories (id, name, slug, description, icon) VALUES
          ('cat_living', 'Phòng Khách (Living Room)', 'living-room', 'Sofa, bàn trà, kệ tivi gỗ tự nhiên cao cấp', 'Sofa'),
          ('cat_dining', 'Phòng Ăn (Dining Room)', 'dining-room', 'Bàn ăn, ghế ăn gỗ sồi và óc chó nguyên khối', 'Utensils'),
          ('cat_bedroom', 'Phòng Ngủ (Bedroom)', 'bedroom', 'Giường ngủ, tủ quần áo, tab đầu giường hiện đại', 'Bed'),
          ('cat_office', 'Phòng Làm Việc (Home Office)', 'office', 'Bàn làm việc thông minh, kệ sách tinh tế', 'Briefcase')`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_sofa_nordic', 'SOFA-ND-01', 'Sofa Văng Nordic Scandinavian 3 Chỗ', 'cat_living', 14500000, 8, 3, 210, 85, 82, 48, 'Khung Gỗ Sồi Nga + Vải Nỉ Bouclé', 'Sồi Tự Nhiên (Natural Oak)', '["#F3E9DC", "#C08552", "#5E503F"]', 'Thiết kế phong cách Bắc Âu thanh lịch với chân gỗ sồi nguyên khối tiện vát tinh tế, đệm mút D40 êm ái chống xẹp lún.', 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_table_oak', 'COF-OAK-02', 'Bàn Trà Gỗ Sồi Ovan Kép Minimalist', 'cat_living', 4200000, 15, 5, 110, 60, 42, 18, 'Gỗ Sồi Tự Nhiên Bắc Mỹ', 'Sồi Tự Nhiên (Natural Oak)', '["#D4A373", "#FAEDCD"]', 'Bàn trà đôi dáng ovan xếp tầng hiện đại, xử lý cạnh bo tròn an toàn cho nhà có trẻ nhỏ, bề mặt sơn lót PU chống thấm nước.', 'https://images.unsplash.com/photo-1533090161767-e6ffed986c88?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_tv_walnut', 'TV-WAL-03', 'Kệ Tivi Gỗ Óc Chó Walnut Elegance', 'cat_living', 11800000, 5, 2, 180, 40, 50, 36, 'Gỗ Óc Chó Bắc Mỹ Tự Nhiên', 'Óc Chó (Dark Walnut)', '["#43281C", "#7F4F24"]', 'Vân gỗ óc chó cuộn sóng sang trọng, ngăn kéo ray giảm chấn Hafele êm ái, khoang luồn dây điện thông minh giấu dây gọn gàng.', 'https://images.unsplash.com/photo-1601084881623-cdf9a8ea242c?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_dining_table', 'DIN-SET-04', 'Bộ Bàn Ăn 6 Ghế Gỗ Sồi Tự Nhiên Harmony', 'cat_dining', 18900000, 6, 2, 160, 80, 75, 58, 'Gỗ Sồi Tự Nhiên + Da Nappa Cao Cấp', 'Sồi Lau Màu Óc Chó', '["#582F0E", "#7F4F24", "#DDA15E"]', 'Bàn ăn bo cạnh mềm mại kết hợp 6 ghế đệm da nappa êm ái, khả năng chịu lực vượt trội, thích hợp cho căn hộ và nhà phố hiện đại.', 'https://images.unsplash.com/photo-1617806118233-18e1de247200?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_bed_zen', 'BED-ZEN-05', 'Giường Ngủ Phong Cách Nhật Zen Gỗ Tần Bì', 'cat_bedroom', 16500000, 7, 3, 185, 205, 88, 65, 'Gỗ Tần Bì (Ash Wood)', 'Tần Bì Tự Nhiên Sáng Màu', '["#E9ECEF", "#DEE2E6", "#6C757D"]', 'Giường ngủ vạt phản giấu chân tạo hiệu ứng bay nhẹ nhàng, tựa đầu giường bọc mút êm ái tựa đọc sách trước khi ngủ.', 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_wardrobe_lux', 'WAR-LUX-06', 'Tủ Áo 4 Cánh Cửa Kính Khung Gỗ Óc Chó', 'cat_bedroom', 24500000, 3, 2, 200, 60, 220, 95, 'Gỗ Óc Chó + Kính Cường Lực Trà', 'Óc Chó Bắc Mỹ', '["#3F2E23", "#222222"]', 'Tủ áo cao kịch trần tích hợp dải đèn LED cảm ứng mở cửa, cánh kính mờ sang trọng tôn vinh bộ sưu tập thời trang.', 'https://images.unsplash.com/photo-1595428774223-ef52624120d2?auto=format&fit=crop&w=1000&q=80', 0)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_desk_ergonomic', 'DESK-ER-07', 'Bàn Làm Việc Gỗ Sồi Nâng Hạ Chiều Cao', 'cat_office', 9200000, 12, 4, 140, 70, 74, 32, 'Mặt Gỗ Sồi Nga + Khung Thép Sơn Tĩnh Điện', 'Sồi Tự Nhiên', '["#E2D4B7", "#333333"]', 'Mặt bàn bo góc chữ U công thái học, hỗ trợ nâng hạ điện tử 2 động cơ từ 70cm đến 118cm ghi nhớ 4 vị trí.', 'https://images.unsplash.com/photo-1518455027359-f3f8164ba6bd?auto=format&fit=crop&w=1000&q=80', 1)`,
          `INSERT OR IGNORE INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, color_palette, description, image_url, is_featured) VALUES
          ('prod_shelf_geo', 'SHELF-GE-08', 'Kệ Sách Tổ Ong Gỗ Tự Nhiên Modular', 'cat_office', 5600000, 10, 3, 120, 30, 180, 26, 'Gỗ Cao Su Tự Nhiên Ghép Thanh Chuẩn AA', 'Vàng Gỗ Tự Nhiên', '["#F3C68F", "#BC6C25"]', 'Các module lục giác đa năng có thể lắp ghép linh hoạt theo kích thước mảng tường, chịu tải 25kg mỗi ngăn.', 'https://images.unsplash.com/photo-1594633312681-425c7b97ccd1?auto=format&fit=crop&w=1000&q=80', 0)`
        ];

        for (const sql of statements) {
          await env.DB.prepare(sql).run();
        }

        return jsonResponse({
          success: true,
          message: 'D1 Database schema and seed data created and executed successfully!',
          tables: ['categories', 'products', 'orders', 'order_items', 'inventory_logs', 'reviews'],
          itemsSeeded: 8
        });
      } catch (err) {
        return jsonResponse({ error: err.message, stack: err.stack }, 500);
      }
    }

    // Default 404
    return jsonResponse({ error: 'Endpoint not found', path }, 404);

  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack }, 500);
  }
}
