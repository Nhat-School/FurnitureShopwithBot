// Cloudflare Pages Functions - ABC Furniture Platform API
// Integrates: Cloudflare D1 (Database), Cloudflare R2 (Image Storage), and Workers AI

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
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
    // -------------------------------------------------------------
    // 1. Image Serving from Cloudflare R2 Storage (/api/assets/*)
    // -------------------------------------------------------------
    if (segments[0] === 'assets' && segments.length > 1) {
      const key = segments.slice(1).join('/');
      if (env?.R2_ASSETS) {
        try {
          const object = await env.R2_ASSETS.get(key);
          if (object) {
            const headers = new Headers();
            object.writeHttpMetadata(headers);
            headers.set('etag', object.httpEtag);
            headers.set('Cache-Control', 'public, max-age=31536000');
            return new Response(object.body, { headers });
          }
        } catch (e) {
          console.warn('R2 get error:', e.message);
        }
      }
      return jsonResponse({ error: 'Asset not found in R2' }, 404);
    }

    // -------------------------------------------------------------
    // 2. Upload Image to Cloudflare R2 Storage (/api/upload)
    // -------------------------------------------------------------
    if (segments[0] === 'upload' && method === 'POST') {
      const formData = await request.formData();
      const file = formData.get('file');

      if (!file || typeof file === 'string') {
        return jsonResponse({ error: 'No file uploaded' }, 400);
      }

      const ext = file.name.split('.').pop() || 'jpg';
      const key = `products/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;
      const buffer = await file.arrayBuffer();

      // If R2 is bound, save object
      if (env?.R2_ASSETS) {
        try {
          await env.R2_ASSETS.put(key, buffer, {
            httpMetadata: {
              contentType: file.type || 'image/jpeg'
            }
          });
          return jsonResponse({
            success: true,
            url: `/api/assets/${key}`,
            key,
            storage: 'r2'
          });
        } catch (e) {
          console.warn('R2 put error:', e.message);
        }
      }

      // Fallback base64 data url if R2 is initializing
      const base64 = `data:${file.type || 'image/jpeg'};base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`;
      return jsonResponse({
        success: true,
        url: base64,
        storage: 'memory-fallback'
      });
    }

    // -------------------------------------------------------------
    // 3. Fast Google Authentication & User Profile (/api/auth/*)
    // -------------------------------------------------------------
    if (segments[0] === 'auth') {
      if (segments[1] === 'google' && method === 'POST') {
        const body = await request.json();
        const { email, name, avatar } = body;

        const cleanEmail = (email || '').trim().toLowerCase();
        const isAdmin = cleanEmail === 'nhaterik@gmail.com' || cleanEmail === 'ducnhan762013@gmail.com';
        const assignedRole = isAdmin ? 'admin' : 'guest';
        
        let defaultName = 'Khách Vãng Lai';
        if (cleanEmail === 'nhaterik@gmail.com') defaultName = 'Nhật Erik (Admin)';
        else if (cleanEmail === 'ducnhan762013@gmail.com') defaultName = 'Đức Nhân (Admin)';

        const user = {
          id: `usr_${Date.now()}`,
          email: cleanEmail || 'guest@example.com',
          name: name || defaultName,
          role: assignedRole,
          avatar_url: avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name || defaultName)}`
        };

        // Persist to D1 if available
        if (env?.DB) {
          try {
            await env.DB.prepare(`
              CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT UNIQUE NOT NULL,
                name TEXT NOT NULL,
                avatar_url TEXT,
                role TEXT DEFAULT 'guest',
                created_at TEXT DEFAULT (datetime('now'))
              )
            `).run();

            await env.DB.prepare(`
              INSERT OR REPLACE INTO users (id, email, name, avatar_url, role)
              VALUES (?, ?, ?, ?, ?)
            `).bind(user.id, user.email, user.name, user.avatar_url, user.role).run();
          } catch (e) {
            console.warn('D1 users table write failed:', e.message);
          }
        }

        return jsonResponse({ success: true, user });
      }

      if (segments[1] === 'me' && method === 'GET') {
        return jsonResponse({
          user: {
            email: 'nhaterik@gmail.com',
            name: 'Nhật Erik (Admin)',
            role: 'admin',
            avatar_url: 'https://api.dicebear.com/7.x/initials/svg?seed=Nhat%20Erik'
          }
        });
      }
    }

    // -------------------------------------------------------------
    // 4. Products API - D1 Database (/api/products)
    // -------------------------------------------------------------
    if (segments[0] === 'products') {
      // GET /api/products (List, search, filter)
      if (method === 'GET' && (!segments[1] || segments[1] === '')) {
        const category = url.searchParams.get('category');
        const search = url.searchParams.get('search')?.toLowerCase() || '';
        const material = url.searchParams.get('material')?.toLowerCase() || '';
        const maxPrice = parseFloat(url.searchParams.get('max_price')) || Infinity;
        const maxWidth = parseFloat(url.searchParams.get('max_width')) || Infinity;

        if (env?.DB) {
          try {
            let query = `
              SELECT p.*, c.name as category_name, c.slug as category_slug 
              FROM products p 
              LEFT JOIN categories c ON p.category_id = c.id 
              WHERE 1=1
            `;
            const params = [];

            if (category && category !== 'all') {
              query += ' AND (c.slug = ? OR p.category_id = ?)';
              params.push(category, category);
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

            query += ' ORDER BY p.created_at DESC';

            const { results } = await env.DB.prepare(query).bind(...params).all();
            if (results && results.length > 0) {
              return jsonResponse({ products: results, source: 'd1' });
            }
          } catch (e) {
            console.warn('D1 read error:', e.message);
          }
        }
      }

      // POST /api/products (Admin Create Product in D1)
      if (method === 'POST') {
        const prod = await request.json();
        const id = prod.id || `prod_${Date.now()}`;
        const newProduct = {
          id,
          sku: prod.sku || `SKU-${Date.now()}`,
          name: prod.name,
          category_id: prod.category_id || 'cat_living',
          price: parseFloat(prod.price) || 0,
          stock: parseInt(prod.stock) || 1,
          safety_stock: parseInt(prod.safety_stock) || 3,
          width_cm: parseFloat(prod.width_cm) || 100,
          depth_cm: parseFloat(prod.depth_cm) || 60,
          height_cm: parseFloat(prod.height_cm) || 75,
          weight_kg: parseFloat(prod.weight_kg) || 20,
          material: prod.material || 'Gỗ Tự Nhiên',
          wood_finish: prod.wood_finish || 'Tự Nhiên',
          description: prod.description || '',
          image_url: prod.image_url || 'https://images.unsplash.com/photo-1555041469-a586c61ea9bc?auto=format&fit=crop&w=1000&q=80',
          is_featured: prod.is_featured ? 1 : 0
        };

        if (env?.DB) {
          try {
            await env.DB.prepare(`
              INSERT INTO products (id, sku, name, category_id, price, stock, safety_stock, width_cm, depth_cm, height_cm, weight_kg, material, wood_finish, description, image_url, is_featured)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(
              newProduct.id,
              newProduct.sku,
              newProduct.name,
              newProduct.category_id,
              newProduct.price,
              newProduct.stock,
              newProduct.safety_stock,
              newProduct.width_cm,
              newProduct.depth_cm,
              newProduct.height_cm,
              newProduct.weight_kg,
              newProduct.material,
              newProduct.wood_finish,
              newProduct.description,
              newProduct.image_url,
              newProduct.is_featured
            ).run();
          } catch (e) {
            console.warn('D1 insert product error:', e.message);
          }
        }

        return jsonResponse({ success: true, product: newProduct });
      }

      // DELETE /api/products/:id (Admin Delete Product from D1)
      if (method === 'DELETE' && segments[1]) {
        const id = segments[1];
        if (env?.DB) {
          try {
            await env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run();
          } catch (e) {
            console.warn('D1 delete product error:', e.message);
          }
        }
        return jsonResponse({ success: true, id });
      }
    }

    // -------------------------------------------------------------
    // 5. Workers AI Interior Design & Spatial Advisor (/api/ai/*)
    // -------------------------------------------------------------
    if (segments[0] === 'ai') {
      // POST /api/ai/chat
      if (segments[1] === 'chat' && method === 'POST') {
        const body = await request.json();
        const { messages } = body;

        const systemPrompt = `Bạn là "FurniAI" – Chuyên gia tư vấn thiết kế nội thất của ABC Furniture.
Nhiệm vụ: Tư vấn kích thước nội thất (Sofa văng, Bàn trà sồi, Kệ tivi óc chó, Giường ngủ zen), chất liệu gỗ tự nhiên và khoảng cách lối đi tối thiểu 75-90cm. Trả lời chuyên nghiệp bằng Tiếng Việt.`;

        if (env?.AI) {
          try {
            const aiResponse = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
              messages: [
                { role: 'system', content: systemPrompt },
                ...(messages || [])
              ],
              max_tokens: 600,
              temperature: 0.6
            });
            return jsonResponse({
              reply: aiResponse.response || aiResponse.choices?.[0]?.message?.content || 'Xin chào, tôi sẵn sàng hỗ trợ!',
              source: 'workers-ai'
            });
          } catch (e) {
            console.warn('Workers AI chat error:', e.message);
          }
        }

        return jsonResponse({
          reply: 'Chào bạn! Tôi là chuyên viên thiết kế của ABC Furniture. Với phòng khách, tôi đề xuất bộ đôi Sofa Văng Nordic 2.1m kết hợp cùng Bàn Trà Gỗ Sồi Ovan Kép. Bộ này chỉ chiếm chiều sâu khoảng 1.85m tính cả khoảng lọt lòng 40cm giữa bàn và sofa, giữ được lối đi chính trên 80cm cực kỳ thông thoáng!',
          source: 'local-engine'
        });
      }

      // POST /api/ai/spatial-check (2D Walkway & Clearance Calculation)
      if (segments[1] === 'spatial-check' && method === 'POST') {
        const body = await request.json();
        const length = parseFloat(body.roomLengthM) || 4.0;
        const width = parseFloat(body.roomWidthM) || 3.5;
        const roomArea = parseFloat((length * width).toFixed(2));
        const remainingCorridor = Math.round((Math.min(length, width) - 0.85) * 100);

        return jsonResponse({
          roomArea,
          remainingCorridorCm: remainingCorridor,
          isCorridorSafe: remainingCorridor >= 75,
          verdict: remainingCorridor >= 75 ? 'Đạt chuẩn thông thoáng' : 'Cảnh báo lối đi hẹp'
        });
      }

      // POST /api/ai/concept-image (Workers AI FLUX.1 Render)
      if (segments[1] === 'concept-image' && method === 'POST') {
        const body = await request.json();
        const prompt = `Photorealistic interior design render of a modern ${body.style || 'Scandinavian'} ${body.roomType || 'living room'}, handcrafted oak furniture, 8k resolution`;

        if (env?.AI) {
          try {
            const imageBuffer = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', {
              prompt,
              num_steps: 4
            });
            return new Response(imageBuffer, {
              headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'public, max-age=86400' }
            });
          } catch (e) {
            console.warn('Flux image gen error:', e.message);
          }
        }

        return jsonResponse({
          imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80'
        });
      }
    }

    // -------------------------------------------------------------
    // 6. Bulky Shipping & Orders (/api/shipping, /api/orders)
    // -------------------------------------------------------------
    if (segments[0] === 'shipping' && segments[1] === 'calculate' && method === 'POST') {
      const body = await request.json();
      let totalCubicMeters = 0;
      (body.items || []).forEach(item => {
        const vol = ((item.width_cm || 100) / 100) * ((item.depth_cm || 60) / 100) * ((item.height_cm || 80) / 100);
        totalCubicMeters += vol * (item.quantity || 1);
      });

      const baseFreight = 150000;
      const volumeSurcharge = Math.round(totalCubicMeters * 250000);
      const floor = parseInt(body.floorNumber) || 1;
      const stairsSurcharge = (!body.hasFreightElevator && floor > 1) ? (floor - 1) * 80000 : 0;

      return jsonResponse({
        baseFreight,
        volumeSurcharge,
        stairsSurcharge,
        totalFreight: baseFreight + volumeSurcharge + stairsSurcharge,
        totalCubicMeters: parseFloat(totalCubicMeters.toFixed(3))
      });
    }

    if (segments[0] === 'orders') {
      if (method === 'POST') {
        const body = await request.json();
        const trackingCode = `ABC-VN-${Math.floor(100000 + Math.random() * 900000)}`;
        return jsonResponse({
          success: true,
          order: {
            id: `ord_${Date.now()}`,
            trackingCode,
            customer: body.customer,
            totalAmount: body.totalAmount,
            status: 'Processing'
          }
        });
      }

      if (segments[1]) {
        return jsonResponse({
          trackingCode: segments[1].toUpperCase(),
          status: 'In Transit',
          carrier: 'ABC Bulky Logistics'
        });
      }
    }

    return jsonResponse({ error: 'Endpoint not found', path }, 404);

  } catch (err) {
    return jsonResponse({ error: err.message, stack: err.stack }, 500);
  }
}
