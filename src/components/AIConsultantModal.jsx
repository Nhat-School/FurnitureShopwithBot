import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, Bot, User, Image, Loader2, RefreshCw } from 'lucide-react';

export default function AIConsultantModal({ isOpen, onClose, initialPrompt }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: 'Xin chào! Tôi là **FurniAI** – Chuyên gia tư vấn thiết kế nội thất & đo lường không gian của ABC Furniture. Bạn cần tư vấn chọn kích thước bàn ghế, phối màu gỗ hay kiểm tra khoảng cách lối đi cho phòng nào?'
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [conceptImage, setConceptImage] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (initialPrompt) {
      sendMessage(initialPrompt);
    }
  }, [initialPrompt]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const quickPrompts = [
    'Tư vấn phòng khách 20m² phong cách Bắc Âu',
    'Khoảng cách chuẩn giữa sofa và bàn trà là bao nhiêu?',
    'Phối màu gỗ sồi tự nhiên với sàn gạch vân mây',
    'Tính phí vận chuyển cồng kềnh bộ bàn ăn lên tầng 3'
  ];

  async function sendMessage(textToSend) {
    const query = textToSend || input.trim();
    if (!query) return;

    const newMessages = [...messages, { role: 'user', content: query }];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      });

      if (res.ok) {
        const data = await res.json();
        setMessages([...newMessages, { role: 'assistant', content: data.reply }]);
      } else {
        throw new Error('API request failed');
      }
    } catch (e) {
      // Fallback assistant response
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Cảm ơn câu hỏi của bạn! Đối với kích thước nội thất tiêu chuẩn, chúng tôi luôn khuyên bạn giữ khoảng cách tối thiểu 75cm cho lối đi chính và 40cm giữa sofa với bàn trà để vừa tầm với cốc nước mà không bị va đầu gối. Bạn có thể dùng công cụ "Mô Phỏng 2D Phòng" trên thanh menu để thử trực quan.'
        }
      ]);
    } finally {
      setLoading(false);
    }
  }

  async function generateConceptVisualization() {
    setGeneratingImage(true);
    try {
      const res = await fetch('/api/ai/concept-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          style: 'Scandinavian Minimalist',
          roomType: 'living',
          woodType: 'Natural Oak and Bouclé Fabric'
        })
      });

      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('image')) {
          const blob = await res.blob();
          setConceptImage(URL.createObjectURL(blob));
        } else {
          const data = await res.json();
          setConceptImage(data.imageUrl);
        }
      }
    } catch (e) {
      console.warn('Concept render error:', e);
      setConceptImage('https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=1200&q=80');
    } finally {
      setGeneratingImage(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-xs">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col border border-[#E8DFC8] overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-[#2D241E] via-[#43281C] to-[#582F0E] text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#8C5329] text-white flex items-center justify-center border border-[#D4A373]/40 shadow-sm">
              <Sparkles className="w-5 h-5 text-[#FFD166]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif text-base font-bold">FurniAI Interior Consultant</h3>
                <span className="px-2 py-0.5 text-[9px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  Workers AI Free Tier
                </span>
              </div>
              <p className="text-[11px] text-stone-300">Tư vấn không gian, vật liệu gỗ và quy chuẩn kích thước lối đi</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 transition text-stone-300 hover:text-white"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Log */}
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-[#FAF8F5]">
          {messages.map((m, idx) => (
            <div key={idx} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {m.role === 'assistant' && (
                <div className="w-8 h-8 rounded-full bg-[#8C5329] text-white flex items-center justify-center shrink-0 text-xs shadow-xs">
                  <Bot className="w-4 h-4" />
                </div>
              )}
              
              <div className={`max-w-[82%] p-3.5 rounded-2xl text-xs leading-relaxed shadow-xs ${
                m.role === 'user'
                  ? 'bg-[#582F0E] text-white rounded-tr-xs'
                  : 'bg-white text-[#2D241E] border border-[#E8DFC8] rounded-tl-xs'
              }`}>
                {m.content.split('\n').map((line, i) => (
                  <p key={i} className={i > 0 ? 'mt-1.5' : ''}>{line}</p>
                ))}
              </div>

              {m.role === 'user' && (
                <div className="w-8 h-8 rounded-full bg-[#D5BDAF] text-[#582F0E] flex items-center justify-center shrink-0 text-xs shadow-xs">
                  <User className="w-4 h-4" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 items-center text-xs text-stone-500">
              <div className="w-8 h-8 rounded-full bg-[#8C5329] text-white flex items-center justify-center shrink-0">
                <Loader2 className="w-4 h-4 animate-spin" />
              </div>
              <span className="italic">FurniAI đang tính toán thông số không gian...</span>
            </div>
          )}

          {/* Render Concept Image if generated */}
          {conceptImage && (
            <div className="bg-white p-3 rounded-2xl border border-[#D5BDAF] shadow-sm space-y-2">
              <div className="flex items-center justify-between text-xs font-semibold text-[#8C5329]">
                <span>Phối Cảnh Nội Thất Gợi Ý (FLUX.1-schnell Render)</span>
                <button onClick={() => setConceptImage(null)} className="text-stone-400 hover:text-stone-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <img src={conceptImage} alt="AI Concept Staging" className="w-full rounded-xl aspect-16/9 object-cover" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div className="px-4 py-2 bg-white border-t border-[#E8DFC8] flex items-center gap-1.5 overflow-x-auto scrollbar-none">
          {quickPrompts.map((p, i) => (
            <button
              key={i}
              onClick={() => sendMessage(p)}
              className="px-2.5 py-1 text-[11px] bg-[#FAF8F5] hover:bg-[#F5EBE0] text-[#582F0E] rounded-full border border-[#D5BDAF] whitespace-nowrap transition"
            >
              {p}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 bg-white border-t border-[#E8DFC8]">
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage();
            }}
            className="flex items-center gap-2"
          >
            <button
              type="button"
              onClick={generateConceptVisualization}
              disabled={generatingImage}
              title="Tạo ảnh mô phỏng phối cảnh bằng AI (FLUX.1-schnell)"
              className="p-2.5 rounded-xl border border-[#D5BDAF] bg-[#F5EBE0] text-[#582F0E] hover:bg-[#E3D5CA] transition shrink-0"
            >
              {generatingImage ? <Loader2 className="w-4 h-4 animate-spin text-[#8C5329]" /> : <Image className="w-4 h-4 text-[#8C5329]" />}
            </button>

            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Hỏi về kích thước phòng, phối màu gỗ hoặc phụ phí..."
              className="flex-1 px-4 py-2.5 bg-[#FAF8F5] border border-[#D5BDAF] rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-[#8C5329]/40"
            />

            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2.5 bg-[#582F0E] hover:bg-[#43281C] disabled:opacity-50 text-white rounded-xl transition shadow-xs shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
