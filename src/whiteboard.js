/**
 * WhiteboardStudio - Quản lý Bảng Trắng Tương Tác
 * Hỗ trợ tạo Thẻ Chữ / Sticky Note kéo thả tự do, vẽ bút dạ bảng,
 * đồng bộ sang trang Word và xuất ảnh PNG.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

export const STICKY_COLORS = [
  { id: 'yellow', name: 'Vàng Cổ Điển', bg: '#fef08a', border: '#fde047', text: '#713f12' },
  { id: 'blue', name: 'Xanh Mint', bg: '#bae6fd', border: '#7dd3fc', text: '#0369a1' },
  { id: 'green', name: 'Xanh Lá', bg: '#bbf7d0', border: '#86efac', text: '#15803d' },
  { id: 'pink', name: 'Hồng Pastel', bg: '#fbcfe8', border: '#f472b6', text: '#9d174d' },
  { id: 'purple', name: 'Tím Mộng Mơ', bg: '#e9d5ff', border: '#c084fc', text: '#6b21a8' },
  { id: 'glass', name: 'Trắng Kính', bg: 'rgba(255, 255, 255, 0.9)', border: '#cbd5e1', text: '#1e293b' }
];

export class WhiteboardStudio {
  constructor(containerEl, options = {}) {
    this.container = containerEl;
    this.canvas = containerEl.querySelector('#whiteboard-canvas');
    this.cardsLayer = containerEl.querySelector('#whiteboard-cards-layer');
    this.ctx = this.canvas ? this.canvas.getContext('2d') : null;

    this.onSyncToWord = options.onSyncToWord || null;
    this.onChange = options.onChange || null;

    // Bút vẽ bảng trắng
    this.markerTool = 'marker'; // 'marker' | 'highlighter' | 'eraser' | 'select'
    this.markerColor = '#1e293b';
    this.markerWidth = 3;
    this.isDrawing = false;
    this.lastPoint = null;
    this.currentStroke = null;
    this.strokes = [];

    // Danh sách thẻ ghi chú
    this.cards = [];
    this.cardCounter = 0;

    // Khởi tạo
    this.init();
  }

  init() {
    this.resizeCanvas();
    this.bindCanvasEvents();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    if (!this.canvas) return;
    const rect = this.container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = (rect.width || 800) * dpr;
    this.canvas.height = (rect.height || 600) * dpr;
    if (this.ctx) {
      this.ctx.scale(dpr, dpr);
      this.redrawDrawing();
    }
  }

  redrawDrawing() {
    if (!this.ctx || !this.canvas) return;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const stroke of this.strokes) {
      for (let i = 1; i < stroke.points.length; i++) {
        this.drawMarkerStroke(stroke.points[i - 1], stroke.points[i], stroke.tool, stroke.color, stroke.width);
      }
    }
  }

  notifyChange() {
    if (this.onChange) this.onChange(this.getState());
  }

  setMarkerTool(tool) {
    this.markerTool = tool;
    if (this.canvas) {
      this.canvas.style.pointerEvents = tool === 'select' ? 'none' : 'auto';
    }
  }

  setMarkerColor(color) {
    this.markerColor = color;
  }

  bindCanvasEvents() {
    if (!this.canvas) return;

    this.canvas.addEventListener('pointerdown', (e) => {
      if (this.markerTool === 'select') return;
      this.isDrawing = true;
      this.canvas.setPointerCapture(e.pointerId);
      const rect = this.canvas.getBoundingClientRect();
      this.lastPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      this.currentStroke = {
        tool: this.markerTool,
        color: this.markerColor,
        width: this.markerWidth,
        points: [this.lastPoint]
      };
    });

    this.canvas.addEventListener('pointermove', (e) => {
      if (!this.isDrawing || !this.lastPoint) return;
      const rect = this.canvas.getBoundingClientRect();
      const currentPoint = { x: e.clientX - rect.left, y: e.clientY - rect.top };

      this.drawMarkerStroke(this.lastPoint, currentPoint, this.markerTool, this.markerColor, this.markerWidth);
      this.currentStroke?.points.push(currentPoint);
      this.lastPoint = currentPoint;
    });

    const stopDrawing = (e) => {
      if (this.isDrawing) {
        this.isDrawing = false;
        this.lastPoint = null;
        if (this.currentStroke && this.currentStroke.points.length > 1) {
          this.strokes.push(this.currentStroke);
          this.notifyChange();
        }
        this.currentStroke = null;
        try {
          this.canvas.releasePointerCapture(e.pointerId);
        } catch (_) {}
      }
    };

    window.addEventListener('pointerup', stopDrawing);
    this.canvas.addEventListener('pointercancel', stopDrawing);
  }

  drawMarkerStroke(p1, p2, tool = this.markerTool, color = this.markerColor, width = this.markerWidth) {
    const ctx = this.ctx;
    if (!ctx) return;

    ctx.save();
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 24;
    } else if (tool === 'highlighter') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 16;
      ctx.lineCap = 'square';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    ctx.restore();
  }

  clearDrawing() {
    if (!this.ctx || !this.canvas) return;
    this.strokes = [];
    this.currentStroke = null;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Tạo một thẻ ghi chú mới trên bảng trắng từ chữ viết tay nhận diện
   */
  addCardFromText(text, options = {}) {
    if (!text || !text.trim()) return null;

    this.cardCounter++;
    const cardId = `card-${this.cardCounter}`;

    // Tự động tính toán vị trí ngẫu nhiên hoặc xếp tầng nhẹ
    const rect = this.container.getBoundingClientRect();
    const maxX = Math.max(20, rect.width - 280);
    const maxY = Math.max(20, rect.height - 240);
    const x = options.x !== undefined ? options.x : 40 + ((this.cardCounter * 35) % maxX);
    const y = options.y !== undefined ? options.y : 40 + ((this.cardCounter * 30) % maxY);

    const color = typeof options.color === 'string'
      ? STICKY_COLORS.find(c => c.id === options.color) || STICKY_COLORS[0]
      : (options.color || STICKY_COLORS[(this.cardCounter - 1) % STICKY_COLORS.length]);
    const font = options.font || 'Be Vietnam Pro';

    const cardEl = document.createElement('div');
    cardEl.className = `whiteboard-card card-color-${color.id}`;
    cardEl.id = cardId;
    cardEl.style.left = `${x}px`;
    cardEl.style.top = `${y}px`;
    cardEl.style.background = color.bg;
    cardEl.style.borderColor = color.border;
    cardEl.style.color = color.text;
    cardEl.style.fontFamily = `"${font}", sans-serif`;

    const isMath = /^\\(sqrt|int|frac|sum|prod|lim|alpha|beta|theta|pi|infty)|[\^_{}\\]/.test(text.trim());
    let bodyContent = this.escapeHtml(text.trim());

    if (isMath) {
      try {
        const mathHtml = katex.renderToString(text.trim(), { displayMode: true, throwOnError: false });
        bodyContent = `<div class="card-math-preview">${mathHtml}</div><div class="card-math-code">${this.escapeHtml(text.trim())}</div>`;
      } catch (_) {}
    }

    cardEl.innerHTML = `
      <div class="card-header">
        <span class="drag-handle" title="Kéo để di chuyển">
          <i data-lucide="grip-horizontal"></i>
        </span>
        <div class="card-header-actions">
          <button class="card-action-btn btn-card-color" title="Đổi màu thẻ">
            <i data-lucide="palette"></i>
          </button>
          <button class="card-action-btn btn-card-font" title="Đổi phông chữ">
            <i data-lucide="type"></i>
          </button>
          <button class="card-action-btn btn-card-delete" title="Xóa thẻ">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
      <div class="card-body" contenteditable="true" spellcheck="false">${bodyContent}</div>
    `;

    this.cardsLayer.appendChild(cardEl);
    this.setupCardInteractions(cardEl, cardId);

    if (window.lucide) {
      window.lucide.createIcons();
    }

    const cardObj = { id: cardId, el: cardEl, text: text.trim(), color, font, x, y };
    this.cards.push(cardObj);

    // Cuộn nhẹ tới thẻ vừa tạo
    if (!options.silent) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      this.notifyChange();
    }
    return cardObj;
  }

  escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  setupCardInteractions(cardEl, cardId) {
    const handle = cardEl.querySelector('.drag-handle');
    const deleteBtn = cardEl.querySelector('.btn-card-delete');
    const colorBtn = cardEl.querySelector('.btn-card-color');
    const fontBtn = cardEl.querySelector('.btn-card-font');
    const body = cardEl.querySelector('.card-body');

    // Xóa thẻ
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cardEl.classList.add('removing');
      setTimeout(() => {
        cardEl.remove();
        this.cards = this.cards.filter(c => c.id !== cardId);
        this.notifyChange();
      }, 200);
    });

    // Đổi màu thẻ
    colorBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentCard = this.cards.find(c => c.id === cardId);
      if (!currentCard) return;

      const currentIdx = STICKY_COLORS.findIndex(c => c.id === currentCard.color.id);
      const nextColor = STICKY_COLORS[(currentIdx + 1) % STICKY_COLORS.length];
      currentCard.color = nextColor;

      cardEl.style.background = nextColor.bg;
      cardEl.style.borderColor = nextColor.border;
      cardEl.style.color = nextColor.text;
      this.notifyChange();
    });

    // Đổi phông chữ thẻ
    const fonts = ['Be Vietnam Pro', 'Dancing Script', 'Merriweather', 'Playfair Display', 'Times New Roman'];
    let fontIdx = 0;
    fontBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fontIdx = (fontIdx + 1) % fonts.length;
      const font = fonts[fontIdx];
      cardEl.style.fontFamily = `"${font}", cursive, serif, sans-serif`;
      const currentCard = this.cards.find(c => c.id === cardId);
      if (currentCard) currentCard.font = font;
      this.notifyChange();
    });

    // Cập nhật text khi người dùng gõ
    body.addEventListener('input', () => {
      const currentCard = this.cards.find(c => c.id === cardId);
      if (currentCard) {
        currentCard.text = body.innerText;
        this.notifyChange();
      }
    });

    // Kéo thả (Drag & Drop) thẻ tự do
    let isDragging = false;
    let startX = 0, startY = 0;
    let initialLeft = 0, initialTop = 0;

    const onPointerDown = (e) => {
      if (e.target.closest('.card-action-btn') || e.target === body) return;
      isDragging = true;
      cardEl.classList.add('dragging');
      cardEl.setPointerCapture(e.pointerId);

      // Đưa thẻ lên trên cùng (highest z-index)
      this.bringToFront(cardEl);

      startX = e.clientX;
      startY = e.clientY;
      initialLeft = cardEl.offsetLeft;
      initialTop = cardEl.offsetTop;
    };

    const onPointerMove = (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // Giới hạn trong vùng bảng trắng
      newLeft = Math.max(0, newLeft);
      newTop = Math.max(0, newTop);

      cardEl.style.left = `${newLeft}px`;
      cardEl.style.top = `${newTop}px`;

      const currentCard = this.cards.find(c => c.id === cardId);
      if (currentCard) {
        currentCard.x = newLeft;
        currentCard.y = newTop;
      }
    };

    const onPointerUp = (e) => {
      if (!isDragging) return;
      isDragging = false;
      cardEl.classList.remove('dragging');
      this.notifyChange();
      try {
        cardEl.releasePointerCapture(e.pointerId);
      } catch (_) {}
    };

    cardEl.addEventListener('pointerdown', onPointerDown);
    cardEl.addEventListener('pointermove', onPointerMove);
    cardEl.addEventListener('pointerup', onPointerUp);
    cardEl.addEventListener('pointercancel', onPointerUp);
  }

  bringToFront(cardEl) {
    const allCards = this.cardsLayer.querySelectorAll('.whiteboard-card');
    let maxZ = 10;
    allCards.forEach(c => {
      const z = parseInt(window.getComputedStyle(c).zIndex, 10) || 10;
      if (z > maxZ) maxZ = z;
    });
    cardEl.style.zIndex = maxZ + 1;
  }

  /**
   * Đồng bộ tất cả nội dung thẻ trên Bảng Trắng sang Trang Word
   */
  getAllText() {
    return this.cards.map(c => c.text).filter(Boolean).join('\n\n');
  }

  clearAllCards() {
    this.cards = [];
    if (this.cardsLayer) {
      this.cardsLayer.innerHTML = '';
    }
  }

  clearAll() {
    this.clearAllCards();
    this.clearDrawing();
    this.notifyChange();
  }

  getState() {
    return {
      strokes: this.strokes,
      cards: this.cards.map(card => ({
        text: card.text,
        color: card.color?.id || 'yellow',
        font: card.font || 'Be Vietnam Pro',
        x: card.x,
        y: card.y
      }))
    };
  }

  restoreState(state = {}) {
    this.clearAllCards();
    this.cardCounter = 0;
    this.strokes = Array.isArray(state.strokes)
      ? state.strokes.filter(s => Array.isArray(s?.points) && s.points.length > 1)
      : [];
    this.redrawDrawing();

    if (Array.isArray(state.cards)) {
      state.cards.forEach(card => {
        if (typeof card?.text !== 'string' || !card.text.trim()) return;
        this.addCardFromText(card.text, {
          color: card.color,
          font: card.font,
          x: Number.isFinite(card.x) ? card.x : undefined,
          y: Number.isFinite(card.y) ? card.y : undefined,
          silent: true
        });
      });
    }
    this.notifyChange();
  }

  /**
   * Xuất toàn bộ bảng trắng (Nét vẽ + Thẻ ghi chú) ra ảnh PNG
   */
  async exportAsImage() {
    const rect = this.container.getBoundingClientRect();
    const exportCanvas = document.createElement('canvas');
    const dpr = 2; // Xuất độ phân giải cao 2x
    exportCanvas.width = rect.width * dpr;
    exportCanvas.height = rect.height * dpr;
    const ctx = exportCanvas.getContext('2d');
    ctx.scale(dpr, dpr);

    // 1. Vẽ nền bảng trắng dạng chấm bi
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, rect.width, rect.height);

    const dotGap = 24;
    ctx.fillStyle = '#cbd5e1';
    for (let x = dotGap; x < rect.width; x += dotGap) {
      for (let y = dotGap; y < rect.height; y += dotGap) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // 2. Vẽ nét bút lông bảng trắng
    if (this.canvas) {
      ctx.drawImage(this.canvas, 0, 0, rect.width, rect.height);
    }

    // 3. Vẽ các thẻ ghi chú lên canvas
    for (const card of this.cards) {
      const el = card.el;
      if (!el) continue;

      const cardRect = el.getBoundingClientRect();
      const contRect = this.container.getBoundingClientRect();
      const x = cardRect.left - contRect.left;
      const y = cardRect.top - contRect.top;
      const w = cardRect.width;
      const h = cardRect.height;

      // Bóng đổ
      ctx.save();
      ctx.shadowColor = 'rgba(0,0,0,0.12)';
      ctx.shadowBlur = 12;
      ctx.shadowOffsetY = 6;

      // Nền thẻ
      ctx.fillStyle = card.color.bg;
      ctx.strokeStyle = card.color.border;
      ctx.lineWidth = 1.5;

      // Vẽ hình chữ nhật bo tròn
      const r = 10;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      // Chữ trong thẻ
      ctx.save();
      ctx.fillStyle = card.color.text;
      ctx.font = '15px "Be Vietnam Pro", sans-serif';
      ctx.textBaseline = 'top';

      const lines = (card.text || '').split('\n');
      let textY = y + 36;
      for (const line of lines) {
        ctx.fillText(line, x + 16, textY, w - 32);
        textY += 22;
      }
      ctx.restore();
    }

    // Tải ảnh về máy
    const dataUrl = exportCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `Bang_Trang_InkToWord_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    return true;
  }
}
