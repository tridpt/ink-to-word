/**
 * Digital Handwriting Canvas Studio
 * Hỗ trợ vẽ nét mực mượt mà (Bézier interpolation), đa dạng loại bút,
 * áp lực bút stylus/cảm ứng, nền giấy ô ly/kẻ ngang/chấm bi, và hoàn tác Undo/Redo.
 */

export class HandwritingCanvas {
  constructor(canvasElement, options = {}) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');

    // Cấu hình bút
    this.tool = 'fountain'; // 'fountain' | 'ballpoint' | 'highlighter' | 'eraser'
    this.strokeColor = '#1e293b'; // Đen mực mặc định
    this.strokeWidth = 3;
    this.paperType = 'grid-primary'; // 'grid-primary' | 'lined-notebook' | 'dots' | 'blank' | 'sepia' | 'dark'

    // Trạng thái vẽ
    this.isDrawing = false;
    this.currentPoints = [];
    this.currentStroke = null;

    // Lịch sử nét vẽ (cho nhận diện và Undo/Redo)
    this.strokes = []; // Danh sách stroke: [{ points: [{x,y,pressure}], tool, color, width, x:[], y:[], t:[] }]
    this.redoStack = [];

    // Ảnh tham chiếu tải lên (không phải nét vector OCR)
    this.referenceImage = null;
    this.referenceImageDataUrl = '';

    // Callbacks
    this.onStrokeEnd = options.onStrokeEnd || null;
    this.onHistoryChange = options.onHistoryChange || null;

    // Khởi tạo
    this.init();
  }

  init() {
    this.resizeCanvas();
    this.bindEvents();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 800;
    this.height = rect.height || 480;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);

    this.redrawAll();
  }

  setTool(tool) {
    this.tool = tool;
  }

  setColor(color) {
    this.strokeColor = color;
  }

  setWidth(width) {
    this.strokeWidth = Number(width);
  }

  setPaperType(paperType) {
    this.paperType = paperType;
    this.redrawAll();
  }

  setReferenceImage(dataUrl) {
    this.referenceImageDataUrl = dataUrl || '';
    this.referenceImage = null;
    if (!dataUrl) {
      this.redrawAll();
      return;
    }

    const image = new Image();
    image.onload = () => {
      this.referenceImage = image;
      this.redrawAll();
    };
    image.src = dataUrl;
  }

  getReferenceImageDataUrl() {
    return this.referenceImageDataUrl;
  }

  clearReferenceImage() {
    this.referenceImage = null;
    this.referenceImageDataUrl = '';
    this.redrawAll();
  }

  bindEvents() {
    const el = this.canvas;

    el.addEventListener('pointerdown', (e) => this.handlePointerDown(e));
    el.addEventListener('pointermove', (e) => this.handlePointerMove(e));
    window.addEventListener('pointerup', (e) => this.handlePointerUp(e));
    el.addEventListener('pointercancel', (e) => this.handlePointerUp(e));

    // Ngăn chặn gesture kéo trang mặc định
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
  }

  getPointerPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
      time: Date.now()
    };
  }

  handlePointerDown(e) {
    // Chỉ xử lý chuột trái hoặc bút/tay
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    this.isDrawing = true;
    this.canvas.setPointerCapture(e.pointerId);

    const pos = this.getPointerPos(e);
    this.strokeStartTime = pos.time;

    this.currentPoints = [pos];
    // Tẩy chỉ thay đổi nét hiện có, không được đưa vào dữ liệu OCR.
    this.currentStroke = this.tool === 'eraser' ? null : {
      tool: this.tool,
      color: this.strokeColor,
      width: this.strokeWidth,
      points: [pos],
      // Dữ liệu tọa độ vector phục vụ OCR Google Handwriting IME
      x: [pos.x],
      y: [pos.y],
      t: [0]
    };

    // Vẽ điểm đầu tiên
    this.drawDot(pos);
  }

  handlePointerMove(e) {
    if (!this.isDrawing) return;

    const pos = this.getPointerPos(e);
    this.currentPoints.push(pos);

    if (this.currentStroke) {
      this.currentStroke.points.push(pos);
      this.currentStroke.x.push(pos.x);
      this.currentStroke.y.push(pos.y);
      this.currentStroke.t.push(pos.time - this.strokeStartTime);
    }

    if (this.tool === 'eraser') {
      this.eraseAt(pos);
    } else {
      this.drawSmoothSegment();
    }
  }

  handlePointerUp(e) {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    try {
      this.canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}

    if (this.currentStroke && this.currentStroke.x.length > 0) {
      this.strokes.push(this.currentStroke);
      this.redoStack = []; // Xóa stack redo khi có thao tác mới
      this.notifyHistoryChange();

      if (this.onStrokeEnd) {
        this.onStrokeEnd(this.getStrokesForOCR());
      }
    }

    this.currentPoints = [];
    this.currentStroke = null;
  }

  drawDot(pos) {
    const ctx = this.ctx;
    ctx.save();

    if (this.tool === 'eraser') {
      this.eraseAt(pos);
      ctx.restore();
      return;
    }

    let radius = this.strokeWidth / 2;
    if (this.tool === 'fountain') {
      radius = (this.strokeWidth * (0.6 + pos.pressure * 0.8)) / 2;
    } else if (this.tool === 'highlighter') {
      radius = this.strokeWidth * 1.5;
      ctx.globalAlpha = 0.35;
    }

    ctx.fillStyle = this.strokeColor;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  drawSmoothSegment() {
    const pts = this.currentPoints;
    if (pts.length < 2) return;

    const ctx = this.ctx;
    ctx.save();

    const p1 = pts[pts.length - 2];
    const p2 = pts[pts.length - 1];

    let width = this.strokeWidth;
    if (this.tool === 'fountain') {
      // Mô phỏng nét bút mực thanh đậm theo tốc độ và áp lực
      const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const timeDiff = Math.max(1, p2.time - p1.time);
      const speed = dist / timeDiff;
      const speedFactor = Math.max(0.5, Math.min(1.5, 1.2 - speed * 0.2));
      width = this.strokeWidth * (0.4 + p2.pressure * 0.8) * speedFactor;
    } else if (this.tool === 'highlighter') {
      width = this.strokeWidth * 3;
      ctx.globalAlpha = 0.35;
      ctx.lineCap = 'square';
    } else {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    ctx.strokeStyle = this.strokeColor;
    ctx.lineWidth = Math.max(1, width);
    ctx.lineCap = this.tool === 'highlighter' ? 'square' : 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    if (pts.length === 2) {
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
    } else {
      // Nội suy đường cong Bézier bậc 2 mượt mà qua trung điểm
      const p0 = pts[pts.length - 3];
      const mid1 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
      const mid2 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };

      ctx.moveTo(mid1.x, mid1.y);
      ctx.quadraticCurveTo(p1.x, p1.y, mid2.x, mid2.y);
    }

    ctx.stroke();
    ctx.restore();
  }

  eraseAt(pos) {
    const eraserRadius = this.strokeWidth * 4;
    // Xóa các nét vẽ giao với vùng tẩy
    const initialCount = this.strokes.length;
    this.strokes = this.strokes.filter(stroke => {
      // Kiểm tra khoảng cách các điểm trong stroke tới pos
      return !stroke.points.some(pt => Math.hypot(pt.x - pos.x, pt.y - pos.y) < eraserRadius);
    });

    if (this.strokes.length !== initialCount) {
      this.redrawAll();
      this.notifyHistoryChange();
      if (this.onStrokeEnd) {
        this.onStrokeEnd(this.getStrokesForOCR());
      }
    }
  }

  /**
   * Vẽ lại toàn bộ canvas gồm nền giấy và các nét vẽ hiện tại
   */
  redrawAll() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Vẽ nền giấy
    this.drawPaperBackground();

    // Vẽ ảnh tham chiếu theo đúng tỷ lệ trước các nét vector.
    if (this.referenceImage) {
      const padding = 20;
      const maxWidth = Math.max(1, this.width - padding * 2);
      const maxHeight = Math.max(1, this.height - padding * 2);
      const scale = Math.min(maxWidth / this.referenceImage.width, maxHeight / this.referenceImage.height, 1);
      const drawWidth = this.referenceImage.width * scale;
      const drawHeight = this.referenceImage.height * scale;
      const x = (this.width - drawWidth) / 2;
      const y = (this.height - drawHeight) / 2;
      ctx.drawImage(this.referenceImage, x, y, drawWidth, drawHeight);
    }

    // Vẽ lại các nét
    for (const stroke of this.strokes) {
      this.renderStroke(stroke);
    }
  }

  renderStroke(stroke) {
    const pts = stroke.points;
    if (!pts || pts.length === 0) return;

    const ctx = this.ctx;
    ctx.save();

    let baseWidth = stroke.width || 3;
    if (stroke.tool === 'highlighter') {
      baseWidth = baseWidth * 3;
      ctx.globalAlpha = 0.35;
      ctx.lineCap = 'square';
    } else {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
    }

    ctx.strokeStyle = stroke.color || '#1e293b';
    ctx.fillStyle = stroke.color || '#1e293b';

    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, baseWidth / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }

    ctx.lineWidth = baseWidth;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);

    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
    }

    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Vẽ họa tiết nền giấy chuyên nghiệp
   */
  drawPaperBackground() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    ctx.save();

    switch (this.paperType) {
      case 'grid-primary': // Giấy vở ô ly học sinh tiểu học Việt Nam
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(0, 0, w, h);

        const subGrid = 12; // Ô ly nhỏ 12px
        const mainGrid = 60; // Ô lớn 5 ô ly = 60px

        // Ô ly mờ nhỏ
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        for (let x = 0; x <= w; x += subGrid) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += subGrid) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        // Đường kẻ chính đậm hơn
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let x = 0; x <= w; x += mainGrid) {
          ctx.moveTo(x, 0);
          ctx.lineTo(x, h);
        }
        for (let y = 0; y <= h; y += mainGrid) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        break;

      case 'lined-notebook': // Vở kẻ ngang
        ctx.fillStyle = '#fcfcfc';
        ctx.fillRect(0, 0, w, h);

        const lineGap = 32;
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = lineGap; y < h; y += lineGap) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();

        // Đường kẻ lề đỏ bên trái
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(64, 0);
        ctx.lineTo(64, h);
        ctx.stroke();
        break;

      case 'dots': // Sổ tay chấm bi
        ctx.fillStyle = '#fafafa';
        ctx.fillRect(0, 0, w, h);

        const dotGap = 24;
        ctx.fillStyle = '#cbd5e1';
        for (let x = dotGap; x < w; x += dotGap) {
          for (let y = dotGap; y < h; y += dotGap) {
            ctx.beginPath();
            ctx.arc(x, y, 1.2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        break;

      case 'sepia': // Giấy ngả vàng cổ điển
        ctx.fillStyle = '#fefce8';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(202, 138, 4, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 30; y < h; y += 30) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        break;

      case 'dark': // Bảng phấn đen
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let y = 32; y < h; y += 32) {
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
        }
        ctx.stroke();
        break;

      case 'blank':
      default:
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
        break;
    }

    ctx.restore();
  }

  /**
   * Trả về mảng các nét vẽ dạng vector phục vụ OCR
   */
  getStrokesForOCR() {
    return this.strokes.map(s => ({
      x: s.x,
      y: s.y,
      t: s.t
    }));
  }

  getState() {
    return {
      paperType: this.paperType,
      strokes: this.strokes,
      referenceImageDataUrl: this.referenceImageDataUrl
    };
  }

  restoreState(state = {}) {
    const strokes = Array.isArray(state.strokes)
      ? state.strokes.filter(s => Array.isArray(s?.x) && Array.isArray(s?.y) && Array.isArray(s?.t))
      : [];
    this.paperType = typeof state.paperType === 'string' ? state.paperType : this.paperType;
    this.strokes = strokes;
    this.redoStack = [];
    this.referenceImage = null;
    this.referenceImageDataUrl = '';
    if (typeof state.referenceImageDataUrl === 'string' && state.referenceImageDataUrl.startsWith('data:image/')) {
      this.setReferenceImage(state.referenceImageDataUrl);
    } else {
      this.redrawAll();
    }
    this.notifyHistoryChange();
  }

  undo() {
    if (this.strokes.length === 0) return;
    const removed = this.strokes.pop();
    this.redoStack.push(removed);
    this.redrawAll();
    this.notifyHistoryChange();

    if (this.onStrokeEnd) {
      this.onStrokeEnd(this.getStrokesForOCR());
    }
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const restored = this.redoStack.pop();
    this.strokes.push(restored);
    this.redrawAll();
    this.notifyHistoryChange();

    if (this.onStrokeEnd) {
      this.onStrokeEnd(this.getStrokesForOCR());
    }
  }

  clear() {
    if (this.strokes.length === 0 && !this.referenceImageDataUrl) return;
    this.redoStack = [...this.strokes];
    this.strokes = [];
    this.referenceImage = null;
    this.referenceImageDataUrl = '';
    this.redrawAll();
    this.notifyHistoryChange();

    if (this.onStrokeEnd) {
      this.onStrokeEnd([]);
    }
  }

  notifyHistoryChange() {
    if (this.onHistoryChange) {
      this.onHistoryChange({
        canUndo: this.strokes.length > 0,
        canRedo: this.redoStack.length > 0,
        count: this.strokes.length
      });
    }
  }

  /**
   * Xuất ảnh nét vẽ PNG (có thể bỏ nền giấy để chỉ lấy nét mực trong suốt)
   */
  toDataURL(transparent = false) {
    if (!transparent) {
      return this.canvas.toDataURL('image/png');
    }

    // Tạo canvas tạm không vẽ nền giấy
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    tempCtx.scale(dpr, dpr);

    for (const stroke of this.strokes) {
      const origCtx = this.ctx;
      this.ctx = tempCtx;
      this.renderStroke(stroke);
      this.ctx = origCtx;
    }

    return tempCanvas.toDataURL('image/png');
  }
}
