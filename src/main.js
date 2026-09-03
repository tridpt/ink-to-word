/**
 * InkToWord Studio - Main Application Controller
 * Điều phối sự kiện, xử lý giao diện người dùng, phím tắt, âm thanh và hiệu ứng
 * Hỗ trợ song song cả Trang Word A4 và Bảng Trắng Tương Tác
 */

import confetti from 'canvas-confetti';
import { HandwritingCanvas } from './canvas.js';
import { HandwritingRecognizer } from './recognizer.js';
import { WordDocumentEditor, TYPOGRAPHY_PRESETS } from './editor.js';
import { DocxExporter } from './docx-export.js';
import { WhiteboardStudio } from './whiteboard.js';
import { MathEngine, MATH_TEMPLATES } from './math-engine.js';

// Hệ thống âm thanh Web Audio API (không cần tải file ngoài)
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        this.ctx = new AudioContext();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playPop() {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(480, this.ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(720, this.ctx.currentTime + 0.08);
      gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + 0.08);
    } catch (_) {}
  }

  playSuccess() {
    if (!this.enabled) return;
    try {
      this.ensureContext();
      if (!this.ctx) return;
      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const start = this.ctx.currentTime + i * 0.06;
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.12, start);
        gain.gain.exponentialRampToValueAtTime(0.001, start + 0.25);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start(start);
        osc.stop(start + 0.25);
      });
    } catch (_) {}
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const soundManager = new SoundManager();

  // Khởi tạo các phần tử DOM
  const canvasEl = document.getElementById('ink-canvas');
  const editorEl = document.getElementById('word-document-editor');
  const statsEl = document.getElementById('document-stats');
  const candidatesListEl = document.getElementById('candidates-list');
  const candidateBarEl = document.getElementById('candidate-bar');
  const convertBtn = document.getElementById('btn-convert-word');
  const convertBtnLabel = document.getElementById('convert-btn-label');
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const clearCanvasBtn = document.getElementById('btn-clear-canvas');
  const paperSelect = document.getElementById('paper-select');
  const toolButtons = document.querySelectorAll('[data-tool]');
  const colorButtons = document.querySelectorAll('[data-color]');
  const customColorInput = document.getElementById('custom-color-picker');
  const strokeWidthRange = document.getElementById('stroke-width-range');
  const strokeWidthVal = document.getElementById('stroke-width-val');
  const typographySelect = document.getElementById('typography-preset-select');
  const presetWrapper = document.getElementById('preset-wrapper');
  const exportDocxBtn = document.getElementById('btn-export-docx');
  const exportPdfBtn = document.getElementById('btn-export-pdf');
  const copyDocBtn = document.getElementById('btn-copy-doc');
  const clearDocBtn = document.getElementById('btn-clear-doc');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const layoutToggleBtns = document.querySelectorAll('[data-layout]');
  const sampleBtn = document.getElementById('btn-load-sample');
  const uploadImageInput = document.getElementById('upload-handwriting-image');
  const statusToast = document.getElementById('status-toast');
  const insertModeSelect = document.getElementById('insert-mode-select');

  // Chuyển đổi View: Word vs Whiteboard
  const tabBtnWord = document.getElementById('tab-btn-word');
  const tabBtnWhiteboard = document.getElementById('tab-btn-whiteboard');
  const viewWord = document.getElementById('view-word-document');
  const viewWhiteboard = document.getElementById('view-whiteboard');
  const whiteboardContainer = document.getElementById('whiteboard-workspace');
  const whiteboardEmptyHint = document.getElementById('whiteboard-empty-hint');

  // Trạng thái hiện tại: 'word' | 'whiteboard'
  let currentOutputMode = 'word';

  // Trạng thái nhập: 'text' (chữ viết) | 'math' (toán học)
  let currentInputMode = 'text';

  function readDraft(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function writeDraft(key, state) {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch (_) {
      // Ảnh có thể làm đầy quota; vẫn giữ lại dữ liệu vector/thẻ.
      if (key === 'ink_canvas_draft' && state?.referenceImageDataUrl) {
        try {
          localStorage.setItem(key, JSON.stringify({ ...state, referenceImageDataUrl: '' }));
        } catch (_) {}
      }
    }
  }

  function saveCanvasDraft(state) {
    writeDraft('ink_canvas_draft', state);
  }

  function saveWhiteboardDraft(state) {
    writeDraft('ink_whiteboard_draft', state);
  }

  // Khởi tạo các module lõi
  const recognizer = new HandwritingRecognizer();
  const editor = new WordDocumentEditor(editorEl, statsEl);
  const whiteboard = new WhiteboardStudio(whiteboardContainer, { onChange: saveWhiteboardDraft });
  const mathEngine = new MathEngine();

  // Các phần tử điều khiển chế độ Toán học
  const btnModeText = document.getElementById('btn-mode-text');
  const btnModeMath = document.getElementById('btn-mode-math');
  const mathQuickTools = document.getElementById('math-quick-tools');
  const btnSampleSqrt = document.getElementById('btn-sample-sqrt');
  const btnSampleIntegral = document.getElementById('btn-sample-integral');
  const btnSamplePower = document.getElementById('btn-sample-power');
  const apiModalOverlay = document.getElementById('api-modal-overlay');
  const btnOpenApiModal = document.getElementById('btn-open-api-modal');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnSaveKey = document.getElementById('btn-save-key');
  const btnClearKey = document.getElementById('btn-clear-key');
  const inputGeminiKey = document.getElementById('input-gemini-key');

  if (inputGeminiKey) {
    inputGeminiKey.value = mathEngine.getApiKey();
  }

  let recognizeDebounceTimer = null;
  let lastRecognizedCandidates = [];
  let recognitionRequestId = 0;

  const canvas = new HandwritingCanvas(canvasEl, {
    onStrokeEnd: (strokes) => {
      soundManager.playPop();
      triggerCandidateRecognition(strokes);
    },
    onHistoryChange: ({ canUndo, canRedo, count }) => {
      if (undoBtn) undoBtn.disabled = !canUndo;
      if (redoBtn) redoBtn.disabled = !canRedo;
      if (clearCanvasBtn) clearCanvasBtn.disabled = count === 0;
      saveCanvasDraft(canvas.getState());
    }
  });

  const savedCanvas = readDraft('ink_canvas_draft');
  if (savedCanvas) {
    canvas.restoreState(savedCanvas);
    if (paperSelect && savedCanvas.paperType) paperSelect.value = savedCanvas.paperType;
  }

  const savedWhiteboard = readDraft('ink_whiteboard_draft');
  if (savedWhiteboard) {
    whiteboard.restoreState(savedWhiteboard);
    if (whiteboardEmptyHint && (savedWhiteboard.cards?.length || savedWhiteboard.strokes?.length)) {
      whiteboardEmptyHint.style.display = 'none';
    }
  }

  // Hiển thị thông báo trạng thái dạng Toast
  function showToast(message, type = 'info', duration = 3000) {
    if (!statusToast) return;
    statusToast.textContent = message;
    statusToast.className = `status-toast show ${type}`;
    setTimeout(() => {
      statusToast.classList.remove('show');
    }, duration);
  }

  // Chuyển đổi giữa chế độ Trang Word và Bảng Trắng
  function switchOutputMode(mode) {
    currentOutputMode = mode;
    if (mode === 'word') {
      tabBtnWord?.classList.add('active');
      tabBtnWhiteboard?.classList.remove('active');
      viewWord?.classList.add('active');
      viewWhiteboard?.classList.remove('active');
      if (convertBtnLabel) convertBtnLabel.textContent = 'Chuyển Thành Word';
      if (insertModeSelect) insertModeSelect.style.display = 'block';
    } else {
      tabBtnWhiteboard?.classList.add('active');
      tabBtnWord?.classList.remove('active');
      viewWhiteboard?.classList.add('active');
      viewWord?.classList.remove('active');
      if (convertBtnLabel) convertBtnLabel.textContent = 'Chuyển Lên Bảng Trắng';
      if (insertModeSelect) insertModeSelect.style.display = 'none';
      setTimeout(() => whiteboard.resizeCanvas(), 50);
    }
  }

  if (tabBtnWord) {
    tabBtnWord.addEventListener('click', () => switchOutputMode('word'));
  }
  if (tabBtnWhiteboard) {
    tabBtnWhiteboard.addEventListener('click', () => switchOutputMode('whiteboard'));
  }

  // Nhận diện từ gợi ý thời gian thực khi vẽ nét
  function triggerCandidateRecognition(strokes) {
    clearTimeout(recognizeDebounceTimer);
    recognizer.cancelPendingRecognition();
    const requestId = ++recognitionRequestId;
    lastRecognizedCandidates = [];
    if (candidatesListEl) candidatesListEl.innerHTML = '';
    if (candidateBarEl) candidateBarEl.classList.remove('has-candidates');
    if (!strokes || strokes.length === 0) {
      return;
    }

    recognizeDebounceTimer = setTimeout(async () => {
      try {
        if (currentInputMode === 'math') {
          // Nhận diện theo cấu trúc 2D toán học
          const mathRes = await mathEngine.recognizeMathFormula(strokes, recognizer, canvas.width, canvas.height);
          if (requestId !== recognitionRequestId) return;
          if (mathRes.success && mathRes.candidates.length > 0) {
            lastRecognizedCandidates = mathRes.candidates;
            renderCandidates(mathRes.candidates, true);
          }
        } else {
          // Nhận diện theo chế độ chữ viết thông thường
          const result = await recognizer.recognize(strokes, canvas.width, canvas.height);
          if (requestId !== recognitionRequestId) return;
          if (result.success && result.candidates.length > 0) {
            lastRecognizedCandidates = result.candidates;
            renderCandidates(result.candidates, false);
          }
        }
      } catch (err) {
        console.warn('Lỗi nhận diện:', err);
      }
    }, 300);
  }

  // Hiển thị danh sách từ gợi ý (hỗ trợ cả Chữ viết và KaTeX Toán học)
  function renderCandidates(candidates, isMath = false) {
    if (!candidatesListEl || !candidateBarEl) return;
    candidatesListEl.innerHTML = '';

    candidates.slice(0, 7).forEach((cand, idx) => {
      const btn = document.createElement('button');
      btn.className = `candidate-chip ${idx === 0 ? 'top-match' : ''} ${isMath ? 'math-candidate-chip' : ''}`;
      
      // Nếu là công thức toán học, render KaTeX trực quan
      const hasMathMarkup = isMath || /^\\(sqrt|int|frac|sum|prod|lim|alpha|beta|theta|pi|infty)|[\^_{}\\]/.test(cand.trim());

      if (hasMathMarkup) {
        try {
          const renderedKaTeX = mathEngine.renderLatexToString(cand.trim(), false);
          btn.innerHTML = `<span class="cand-math-preview">${renderedKaTeX}</span>`;
        } catch (_) {
          btn.innerHTML = `<span class="cand-text">${escapeHtml(cand)}</span>`;
        }
      } else if (cand.includes('\n')) {
        const lineParts = cand.split('\n').map(escapeHtml);
        btn.innerHTML = `<span class="cand-text">${lineParts.join(' <span class="nl-badge">↵ dòng</span> ')}</span>`;
      } else {
        btn.innerHTML = `<span class="cand-text">${escapeHtml(cand)}</span>`;
      }
      
      btn.title = `Bấm để chèn nhanh: "${cand.replace(/\n/g, ' ')}"`;

      btn.addEventListener('click', () => {
        applyRecognizedText(cand);
        soundManager.playSuccess();
        canvas.clear();
      });

      candidatesListEl.appendChild(btn);
    });

    candidateBarEl.classList.add('has-candidates');
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Áp dụng văn bản đã nhận diện vào Word hoặc Bảng Trắng tùy chế độ
  function applyRecognizedText(text) {
    const isMultiLine = text.includes('\n');
    const lineCount = isMultiLine ? text.split('\n').filter(Boolean).length : 1;

    if (currentOutputMode === 'word') {
      const mode = insertModeSelect ? insertModeSelect.value : 'append';
      editor.insertRecognizedText(text, mode);
      showToast(isMultiLine ? `Đã thêm ${lineCount} dòng vào Word!` : `Đã thêm vào Word: "${text}"`, 'success');
    } else {
      whiteboard.addCardFromText(text);
      if (whiteboardEmptyHint) whiteboardEmptyHint.style.display = 'none';
      showToast(isMultiLine ? `Đã tạo thẻ ghi chú (${lineCount} dòng) trên Bảng Trắng!` : `Đã tạo thẻ ghi chú: "${text}" trên Bảng Trắng`, 'success');
    }
  }

  // Xử lý nút bấm Lớn: "Chuyển thành Word" / "Chuyển Lên Bảng Trắng"
  async function handleConvertHandwriting() {
    const strokes = canvas.getStrokesForOCR();
    const imageDataUrl = canvas.getReferenceImageDataUrl();
    if (strokes.length === 0 && !imageDataUrl) {
      showToast('Vui lòng viết nét vẽ trên bảng trước khi chuyển đổi!', 'warning');
      return;
    }

    convertBtn.classList.add('loading');
    convertBtn.disabled = true;
    recognizer.cancelPendingRecognition();

    try {
      let textToInsert = '';

      // Ảnh tải lên cần OCR ảnh; không thể gửi như dữ liệu nét vector.
      if (imageDataUrl && currentInputMode === 'text') {
        const apiKey = mathEngine.getApiKey();
        if (!apiKey) {
          throw new Error('NO_API_KEY_IMAGE');
        }
        showToast('Đang nhận diện ảnh chữ viết tay bằng AI Vision...', 'info', 2500);
        const sourceImage = strokes.length > 0 ? canvas.toDataURL() : imageDataUrl;
        textToInsert = await recognizer.recognizeImageWithGemini(sourceImage, apiKey);
      }

      // ==================== XỬ LÝ CHẾ ĐỘ TOÁN HỌC ====================
      if (!textToInsert && currentInputMode === 'math') {
        const apiKey = mathEngine.getApiKey();
        if (apiKey) {
          showToast('Đang nhận diện công thức toán bằng AI Vision...', 'info', 2000);
          const dataUrl = canvas.toDataURL();
          textToInsert = await mathEngine.recognizeMathWithAI(dataUrl);
        } else {
          // Nhận diện cấu trúc 2D toán học offline
          const mathRes = await mathEngine.recognizeMathFormula(strokes, recognizer, canvas.width, canvas.height);
          if (mathRes.success && mathRes.latex) {
            textToInsert = mathRes.latex;
            showToast('Đã nhận diện công thức toán học!', 'success');
          } else {
            throw new Error('Không nhận diện được công thức toán học. Hãy viết lại rõ hơn hoặc dùng nút ký hiệu nhanh.');
          }
        }
      } else if (!textToInsert) {
        // ==================== XỬ LÝ CHẾ ĐỘ VĂN BẢN ====================
        if (lastRecognizedCandidates.length > 0) {
          textToInsert = lastRecognizedCandidates[0];
        } else {
          const res = await recognizer.recognize(strokes, canvas.width, canvas.height);
          if (res.success && res.candidates.length > 0) {
            textToInsert = res.candidates[0];
          } else {
            throw new Error(res.error || 'Không nhận diện được chữ. Hãy thử viết rõ nét hơn.');
          }
        }
      }

      if (textToInsert) {
        applyRecognizedText(textToInsert);

        triggerCelebration();
        soundManager.playSuccess();

        canvas.clear();
        if (candidatesListEl) candidatesListEl.innerHTML = '';
        if (candidateBarEl) candidateBarEl.classList.remove('has-candidates');
      }
    } catch (err) {
      if (err.message === 'NO_API_KEY') {
        showToast('Vui lòng bấm icon Chìa Khóa trên thanh tiêu đề để nhập Gemini API Key cho AI Toán Học.', 'warning', 4000);
        if (apiModalOverlay) apiModalOverlay.style.display = 'flex';
      } else if (err.message === 'NO_API_KEY_IMAGE') {
        showToast('Muốn nhận diện ảnh, hãy nhập Gemini API Key trong phần cài đặt AI Vision.', 'warning', 4500);
        if (apiModalOverlay) apiModalOverlay.style.display = 'flex';
      } else {
        showToast(err.message || 'Lỗi nhận diện nét vẽ', 'error');
      }
    } finally {
      convertBtn.classList.remove('loading');
      convertBtn.disabled = false;
    }
  }

  function triggerCelebration() {
    try {
      confetti({
        particleCount: 60,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#2563eb', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6']
      });
    } catch (_) {}
  }

  if (convertBtn) {
    convertBtn.addEventListener('click', handleConvertHandwriting);
  }

  // Phím tắt toàn cục
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleConvertHandwriting();
      } else if (e.key === 'z' && !e.shiftKey) {
        if (document.activeElement !== editorEl && !document.activeElement.classList.contains('card-body')) {
          e.preventDefault();
          canvas.undo();
        }
      } else if (e.key === 'y' || (e.key === 'z' && e.shiftKey)) {
        if (document.activeElement !== editorEl && !document.activeElement.classList.contains('card-body')) {
          e.preventDefault();
          canvas.redo();
        }
      }
    }
  });

  // Công cụ bút vẽ canvas
  toolButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      toolButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.getAttribute('data-tool');
      canvas.setTool(tool);
    });
  });

  // Bảng màu mực
  colorButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      colorButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const color = btn.getAttribute('data-color');
      canvas.setColor(color);
      if (customColorInput) customColorInput.value = color;
    });
  });

  if (customColorInput) {
    customColorInput.addEventListener('input', (e) => {
      colorButtons.forEach(b => b.classList.remove('active'));
      canvas.setColor(e.target.value);
    });
  }

  if (strokeWidthRange) {
    strokeWidthRange.addEventListener('input', (e) => {
      const val = e.target.value;
      if (strokeWidthVal) strokeWidthVal.textContent = `${val}px`;
      canvas.setWidth(val);
    });
  }

  if (paperSelect) {
    paperSelect.addEventListener('change', (e) => {
      canvas.setPaperType(e.target.value);
      saveCanvasDraft(canvas.getState());
    });
  }

  if (undoBtn) undoBtn.addEventListener('click', () => canvas.undo());
  if (redoBtn) redoBtn.addEventListener('click', () => canvas.redo());
  if (clearCanvasBtn) {
    clearCanvasBtn.addEventListener('click', () => {
      canvas.clear();
      showToast('Đã làm sạch bảng viết tay', 'info');
    });
  }

  // Bộ chọn Typography Preset
  if (typographySelect) {
    typographySelect.addEventListener('change', (e) => {
      const preset = editor.applyPreset(e.target.value);
      showToast(`Đã áp dụng kiểu: ${preset.name}`, 'info');
    });
  }

  // Thanh công cụ Word
  document.querySelectorAll('[data-edit-cmd]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cmd = btn.getAttribute('data-edit-cmd');
      const val = btn.getAttribute('data-edit-val') || null;
      editor.execFormat(cmd, val);
    });
  });

  const fontSelect = document.getElementById('toolbar-font-select');
  if (fontSelect) {
    fontSelect.addEventListener('change', (e) => {
      editor.execFormat('fontName', e.target.value);
    });
  }

  const fontSizeSelect = document.getElementById('toolbar-fontsize-select');
  if (fontSizeSelect) {
    fontSizeSelect.addEventListener('change', (e) => {
      editor.execFormat('fontSize', e.target.value);
    });
  }

  // ==================== CÔNG CỤ BẢNG TRẮNG ====================

  // Chọn công cụ vẽ bảng trắng
  const wbToolBtns = document.querySelectorAll('[data-wb-tool]');
  wbToolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      wbToolBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tool = btn.getAttribute('data-wb-tool');
      whiteboard.setMarkerTool(tool);
    });
  });

  // Chọn màu bút dạ bảng trắng
  const wbColorDots = document.querySelectorAll('[data-wb-color]');
  wbColorDots.forEach(dot => {
    dot.addEventListener('click', () => {
      wbColorDots.forEach(d => d.classList.remove('active'));
      dot.classList.add('active');
      const color = dot.getAttribute('data-wb-color');
      whiteboard.setMarkerColor(color);
    });
  });

  // Nút thêm thẻ ghi chú thủ công
  const addStickyBtn = document.getElementById('btn-add-sticky');
  if (addStickyBtn) {
    addStickyBtn.addEventListener('click', () => {
      whiteboard.addCardFromText('Ghi chú ý tưởng mới...');
      if (whiteboardEmptyHint) whiteboardEmptyHint.style.display = 'none';
      showToast('Đã thêm 1 thẻ ghi chú mới trên Bảng Trắng', 'info');
    });
  }

  // Nút đồng bộ toàn bộ thẻ sang Word
  const syncToWordBtn = document.getElementById('btn-sync-to-word');
  if (syncToWordBtn) {
    syncToWordBtn.addEventListener('click', () => {
      const text = whiteboard.getAllText();
      if (!text) {
        showToast('Bảng trắng hiện chưa có thẻ ghi chú nào để chuyển sang Word!', 'warning');
        return;
      }
      editor.insertRecognizedText(text, 'append');
      switchOutputMode('word');
      showToast('Đã đồng bộ toàn bộ nội dung Bảng Trắng sang Trang Word A4!', 'success');
      soundManager.playSuccess();
    });
  }

  // Nút xuất ảnh Bảng Trắng PNG
  const exportWbBtn = document.getElementById('btn-export-whiteboard');
  if (exportWbBtn) {
    exportWbBtn.addEventListener('click', async () => {
      try {
        await whiteboard.exportAsImage();
        showToast('Đã tải ảnh Bảng Trắng (.PNG) thành công!', 'success');
      } catch (err) {
        showToast('Lỗi khi xuất ảnh: ' + err.message, 'error');
      }
    });
  }

  // Nút xóa sạch bảng trắng
  const clearWbBtn = document.getElementById('btn-clear-whiteboard');
  if (clearWbBtn) {
    clearWbBtn.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn xóa sạch toàn bộ thẻ và nét vẽ trên Bảng Trắng?')) {
        whiteboard.clearAll();
        if (whiteboardEmptyHint) whiteboardEmptyHint.style.display = 'flex';
        showToast('Đã làm sạch Bảng Trắng', 'info');
      }
    });
  }

  // ==================== XUẤT FILE WORD & PDF ====================

  if (exportDocxBtn) {
    exportDocxBtn.addEventListener('click', async () => {
      try {
        exportDocxBtn.classList.add('loading');
        await DocxExporter.exportToDocx(editorEl, {
          filename: `Van_ban_Word_${Date.now()}.docx`
        });
        showToast('Đã tạo và tải file Word (.docx) thành công!', 'success');
      } catch (err) {
        showToast('Lỗi khi tạo file Word: ' + err.message, 'error');
      } finally {
        exportDocxBtn.classList.remove('loading');
      }
    });
  }

  if (exportPdfBtn) {
    exportPdfBtn.addEventListener('click', () => {
      DocxExporter.printToPdf();
    });
  }

  if (copyDocBtn) {
    copyDocBtn.addEventListener('click', async () => {
      const success = await DocxExporter.copyRichText(editorEl);
      if (success) {
        showToast('Đã sao chép văn bản! Bạn có thể dán (Ctrl+V) thẳng vào MS Word hoặc Google Docs.', 'success');
      } else {
        showToast('Không thể sao chép vào bộ nhớ tạm.', 'error');
      }
    });
  }

  if (clearDocBtn) {
    clearDocBtn.addEventListener('click', () => {
      if (confirm('Bạn có chắc muốn xóa sạch nội dung trang văn bản hiện tại?')) {
        editor.clear();
        showToast('Đã xóa trắng văn bản', 'info');
      }
    });
  }

  // Nét mẫu
  const sample2LinesBtn = document.getElementById('btn-sample-2lines');
  const triggerSampleLoad = () => {
    loadHandwritingSample(canvas);
    showToast('Đã tải nét vẽ mẫu 2 dòng: Dòng 1 "Học" - Dòng 2 "Việt"! Bấm chuyển đổi để thử nghiệm.', 'info');
  };

  if (sampleBtn) {
    sampleBtn.addEventListener('click', triggerSampleLoad);
  }
  if (sample2LinesBtn) {
    sample2LinesBtn.addEventListener('click', triggerSampleLoad);
  }

  // ==================== CHẾ ĐỘ CÔNG THỨC TOÁN HỌC ====================

  function switchInputMode(mode) {
    currentInputMode = mode;
    if (mode === 'math') {
      btnModeMath?.classList.add('active');
      btnModeText?.classList.remove('active');
      if (mathQuickTools) mathQuickTools.style.display = 'flex';
      if (convertBtnLabel) {
        convertBtnLabel.textContent = currentOutputMode === 'word' ? 'Chuyển Thành Công Thức Toán' : 'Tạo Thẻ Công Thức Toán';
      }
      showToast('Đã bật Chế độ Công Thức Toán (Hỗ trợ căn √, tích phân ∫, phân số, số mũ...)', 'info');
    } else {
      btnModeText?.classList.add('active');
      btnModeMath?.classList.remove('active');
      if (mathQuickTools) mathQuickTools.style.display = 'none';
      if (convertBtnLabel) {
        convertBtnLabel.textContent = currentOutputMode === 'word' ? 'Chuyển Thành Word' : 'Chuyển Lên Bảng Trắng';
      }
      showToast('Đã chuyển sang Chế độ Chữ Viết thông thường', 'info');
    }
    // Kích hoạt nhận diện lại các nét hiện tại trên canvas theo chế độ mới
    triggerCandidateRecognition(canvas.getStrokesForOCR());
  }

  if (btnModeText) btnModeText.addEventListener('click', () => switchInputMode('text'));
  if (btnModeMath) btnModeMath.addEventListener('click', () => switchInputMode('math'));

  // Bấm ký hiệu toán học chèn nhanh
  document.querySelectorAll('.math-sym-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const latex = btn.getAttribute('data-latex');
      if (latex) {
        applyRecognizedText(latex);
        soundManager.playSuccess();
        showToast(`Đã chèn công thức: ${latex}`, 'success');
      }
    });
  });

  // Nút nét mẫu Căn bậc hai
  if (btnSampleSqrt) {
    btnSampleSqrt.addEventListener('click', () => {
      switchInputMode('math');
      loadSqrtSample(canvas);
      showToast('Đã tải nét vẽ mẫu Căn bậc hai: √(x² + 1)! Bấm nút chuyển đổi để thử nghiệm.', 'info');
    });
  }

  // Nút nét mẫu Tích phân
  if (btnSampleIntegral) {
    btnSampleIntegral.addEventListener('click', () => {
      switchInputMode('math');
      loadIntegralSample(canvas);
      showToast('Đã tải nét vẽ mẫu Tích phân: ∫₀¹ x dx! Bấm nút chuyển đổi để thử nghiệm.', 'info');
    });
  }

  // Nút nét mẫu Số mũ
  if (btnSamplePower) {
    btnSamplePower.addEventListener('click', () => {
      switchInputMode('math');
      loadPowerSample(canvas);
      showToast('Đã tải nét vẽ mẫu Số mũ: x² + y² = r²! Bấm nút chuyển đổi để thử nghiệm.', 'info');
    });
  }

  // Modal API Key Gemini
  if (btnOpenApiModal && apiModalOverlay) {
    btnOpenApiModal.addEventListener('click', () => {
      if (inputGeminiKey) inputGeminiKey.value = mathEngine.getApiKey();
      apiModalOverlay.style.display = 'flex';
    });
  }

  if (btnCloseModal && apiModalOverlay) {
    btnCloseModal.addEventListener('click', () => {
      apiModalOverlay.style.display = 'none';
    });
  }

  if (apiModalOverlay) {
    apiModalOverlay.addEventListener('click', (e) => {
      if (e.target === apiModalOverlay) apiModalOverlay.style.display = 'none';
    });
  }

  if (btnSaveKey) {
    btnSaveKey.addEventListener('click', () => {
      const key = inputGeminiKey ? inputGeminiKey.value.trim() : '';
      mathEngine.setApiKey(key);
      if (apiModalOverlay) apiModalOverlay.style.display = 'none';
      showToast(key ? 'Đã lưu Gemini API Key thành công!' : 'Đã xóa API Key', 'success');
    });
  }

  if (btnClearKey) {
    btnClearKey.addEventListener('click', () => {
      mathEngine.setApiKey('');
      if (inputGeminiKey) inputGeminiKey.value = '';
      showToast('Đã xóa API Key khỏi trình duyệt', 'info');
    });
  }

  // Tải ảnh ngoài
  if (uploadImageInput) {
    uploadImageInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        canvas.clear();
        canvas.redoStack = [];
        canvas.setReferenceImage(event.target.result);
        saveCanvasDraft(canvas.getState());
        showToast('Đã tải ảnh chữ viết tay lên bảng vẽ.', 'success');
      };
      reader.readAsDataURL(file);
      e.target.value = '';
    });
  }

  // Chế độ Sáng / Tối
  if (themeToggleBtn) {
    const savedTheme = localStorage.getItem('ink_theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);

    themeToggleBtn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('ink_theme', next);
      updateThemeIcon(next);
      canvas.redrawAll();
      whiteboard.resizeCanvas();
    });
  }

  function updateThemeIcon(theme) {
    if (!themeToggleBtn) return;
    themeToggleBtn.innerHTML = theme === 'dark' 
      ? '<i data-lucide="sun"></i>' 
      : '<i data-lucide="moon"></i>';
    if (window.lucide) window.lucide.createIcons();
  }

  // Chuyển đổi bố cục
  layoutToggleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      layoutToggleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const layout = btn.getAttribute('data-layout');
      const container = document.getElementById('main-workspace');
      if (container) {
        container.className = `workspace-container layout-${layout}`;
        setTimeout(() => {
          canvas.resizeCanvas();
          whiteboard.resizeCanvas();
        }, 250);
      }
    });
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

/**
 * Tải nét vẽ mẫu vector chữ "Việt Nam" để người dùng thử ngay
 */
/**
 * Tải nét vẽ mẫu vector 2 dòng để người dùng kiểm thử tính năng nhận diện đa dòng
 * Dòng 1: "Học" (ở phía trên)
 * Dòng 2: "Việt" (ở phía dưới)
 */
function loadHandwritingSample(canvas) {
  canvas.clear();
  canvas.redoStack = [];

  const sampleStrokes = [
    // ========== DÒNG 1: "Học" (y ~ 65 -> 125) ==========
    // Chữ H (cột trái)
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 80, y: 70 }, { x: 80, y: 120 }],
      x: [80, 80, 80],
      y: [70, 95, 120],
      t: [0, 40, 80]
    },
    // Chữ H (cột phải)
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 105, y: 70 }, { x: 105, y: 120 }],
      x: [105, 105, 105],
      y: [70, 95, 120],
      t: [0, 40, 80]
    },
    // Chữ H (gạch ngang giữa)
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 80, y: 95 }, { x: 105, y: 95 }],
      x: [80, 92, 105],
      y: [95, 95, 95],
      t: [0, 30, 60]
    },
    // Chữ o
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 125, y: 95 }, { x: 145, y: 95 }, { x: 145, y: 120 }, { x: 125, y: 120 }, { x: 125, y: 95 }],
      x: [125, 145, 145, 125, 125],
      y: [95, 95, 120, 120, 95],
      t: [0, 40, 80, 120, 160]
    },
    // Chữ c
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 175, y: 95 }, { x: 155, y: 105 }, { x: 155, y: 115 }, { x: 175, y: 120 }],
      x: [175, 160, 155, 160, 175],
      y: [95, 100, 110, 118, 120],
      t: [0, 30, 60, 90, 120]
    },
    // Dấu nặng chữ Học
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 135, y: 130 }],
      x: [135],
      y: [130],
      t: [0]
    },

    // ========== DÒNG 2: "Việt" (y ~ 200 -> 260) ==========
    // Chữ V
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 80, y: 200 }, { x: 95, y: 245 }, { x: 110, y: 200 }],
      x: [80, 85, 90, 95, 100, 105, 110],
      y: [200, 215, 230, 245, 230, 215, 200],
      t: [0, 40, 80, 120, 160, 200, 240]
    },
    // Chữ i
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 125, y: 215 }, { x: 125, y: 245 }],
      x: [125, 125, 125],
      y: [215, 230, 245],
      t: [0, 40, 80]
    },
    // Dấu chấm i
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 125, y: 200 }],
      x: [125],
      y: [200],
      t: [0]
    },
    // Chữ e
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 140, y: 230 }, { x: 165, y: 225 }, { x: 145, y: 215 }, { x: 140, y: 235 }, { x: 165, y: 245 }],
      x: [140, 155, 165, 155, 145, 140, 145, 155, 165],
      y: [230, 228, 225, 218, 215, 225, 235, 242, 245],
      t: [0, 30, 60, 90, 120, 150, 180, 210, 240]
    },
    // Dấu mũ ê
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 145, y: 205 }, { x: 153, y: 195 }, { x: 160, y: 205 }],
      x: [145, 153, 160],
      y: [205, 195, 205],
      t: [0, 30, 60]
    },
    // Dấu nặng chữ ệ
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 153, y: 255 }],
      x: [153],
      y: [255],
      t: [0]
    },
    // Chữ t
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 180, y: 195 }, { x: 180, y: 245 }, { x: 195, y: 243 }],
      x: [180, 180, 180, 185, 195],
      y: [195, 220, 245, 245, 243],
      t: [0, 50, 100, 130, 160]
    },
    // Gạch ngang chữ t
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 170, y: 215 }, { x: 192, y: 215 }],
      x: [170, 180, 192],
      y: [215, 215, 215],
      t: [0, 30, 60]
    }
  ];

  for (const s of sampleStrokes) {
    canvas.strokes.push(s);
  }

  canvas.redrawAll();
  canvas.notifyHistoryChange();
  if (canvas.onStrokeEnd) {
    canvas.onStrokeEnd(canvas.getStrokesForOCR());
  }
}

/**
 * Tải nét vẽ mẫu Căn Bậc Hai: √(x² + 1)
 */
function loadSqrtSample(canvas) {
  canvas.clear();
  canvas.redoStack = [];
  const strokes = [
    // Nét căn bậc hai: √
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 60, y: 130 }, { x: 75, y: 145 }, { x: 90, y: 80 }, { x: 230, y: 80 }],
      x: [60, 68, 75, 82, 90, 130, 180, 230],
      y: [130, 138, 145, 110, 80, 80, 80, 80],
      t: [0, 30, 60, 90, 120, 150, 180, 210]
    },
    // Chữ x
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 110, y: 105 }, { x: 135, y: 135 }],
      x: [110, 122, 135],
      y: [105, 120, 135],
      t: [0, 40, 80]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 135, y: 105 }, { x: 110, y: 135 }],
      x: [135, 122, 110],
      y: [105, 120, 135],
      t: [0, 40, 80]
    },
    // Số mũ 2
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 2.5,
      points: [{ x: 145, y: 95 }, { x: 155, y: 95 }, { x: 145, y: 108 }, { x: 155, y: 108 }],
      x: [145, 155, 145, 155],
      y: [95, 95, 108, 108],
      t: [0, 30, 60, 90]
    },
    // Dấu +
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 170, y: 105 }, { x: 170, y: 135 }],
      x: [170, 170],
      y: [105, 135],
      t: [0, 40]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 158, y: 120 }, { x: 182, y: 120 }],
      x: [158, 182],
      y: [120, 120],
      t: [0, 40]
    },
    // Số 1
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 200, y: 105 }, { x: 200, y: 135 }],
      x: [200, 200],
      y: [105, 135],
      t: [0, 40]
    }
  ];

  for (const s of strokes) canvas.strokes.push(s);
  canvas.redrawAll();
  canvas.notifyHistoryChange();
}

/**
 * Tải nét vẽ mẫu Tích Phân: ∫₀¹ x dx
 */
function loadIntegralSample(canvas) {
  canvas.clear();
  canvas.redoStack = [];
  const strokes = [
    // Nét tích phân uốn lượn: ∫
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3.5,
      points: [{ x: 80, y: 80 }, { x: 70, y: 80 }, { x: 75, y: 140 }, { x: 80, y: 190 }, { x: 70, y: 190 }],
      x: [80, 72, 75, 78, 80, 75, 70],
      y: [80, 80, 110, 140, 175, 190, 190],
      t: [0, 30, 60, 90, 120, 150, 180]
    },
    // Cận trên 1
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 2.5,
      points: [{ x: 88, y: 75 }, { x: 88, y: 90 }],
      x: [88, 88],
      y: [75, 90],
      t: [0, 30]
    },
    // Cận dưới 0
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 2.5,
      points: [{ x: 88, y: 180 }, { x: 96, y: 180 }, { x: 96, y: 195 }, { x: 88, y: 195 }, { x: 88, y: 180 }],
      x: [88, 96, 96, 88, 88],
      y: [180, 180, 195, 195, 180],
      t: [0, 30, 60, 90, 120]
    },
    // Chữ x
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 120, y: 120 }, { x: 140, y: 150 }],
      x: [120, 140],
      y: [120, 150],
      t: [0, 40]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 140, y: 120 }, { x: 120, y: 150 }],
      x: [140, 120],
      y: [120, 150],
      t: [0, 40]
    },
    // dx
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 165, y: 110 }, { x: 165, y: 150 }],
      x: [165, 165],
      y: [110, 150],
      t: [0, 40]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 165, y: 130 }, { x: 150, y: 130 }, { x: 150, y: 150 }, { x: 165, y: 150 }],
      x: [165, 150, 150, 165],
      y: [130, 130, 150, 150],
      t: [0, 30, 60, 90]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 180, y: 130 }, { x: 195, y: 150 }],
      x: [180, 195],
      y: [130, 150],
      t: [0, 40]
    },
    {
      tool: 'fountain',
      color: '#1e293b',
      width: 3,
      points: [{ x: 195, y: 130 }, { x: 180, y: 150 }],
      x: [195, 180],
      y: [130, 150],
      t: [0, 40]
    }
  ];

  for (const s of strokes) canvas.strokes.push(s);
  canvas.redrawAll();
  canvas.notifyHistoryChange();
}

/**
 * Tải nét vẽ mẫu Số Mũ: x² + y² = r²
 */
function loadPowerSample(canvas) {
  canvas.clear();
  canvas.redoStack = [];
  const strokes = [
    // Chữ x
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 50, y: 120 }, { x: 75, y: 155 }],
      x: [50, 62, 75], y: [120, 138, 155], t: [0, 40, 80]
    },
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 75, y: 120 }, { x: 50, y: 155 }],
      x: [75, 62, 50], y: [120, 138, 155], t: [0, 40, 80]
    },
    // Số mũ 2 (vị trí góc trên bên phải của x)
    {
      tool: 'fountain', color: '#1e293b', width: 2.8,
      points: [{ x: 82, y: 105 }, { x: 94, y: 105 }, { x: 82, y: 122 }, { x: 96, y: 122 }],
      x: [82, 94, 82, 96], y: [105, 105, 122, 122], t: [0, 30, 60, 90]
    },
    // Dấu +
    {
      tool: 'fountain', color: '#1e293b', width: 3,
      points: [{ x: 115, y: 125 }, { x: 115, y: 150 }],
      x: [115, 115], y: [125, 150], t: [0, 40]
    },
    {
      tool: 'fountain', color: '#1e293b', width: 3,
      points: [{ x: 103, y: 137 }, { x: 127, y: 137 }],
      x: [103, 127], y: [137, 137], t: [0, 40]
    },
    // Chữ y
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 145, y: 120 }, { x: 155, y: 140 }, { x: 165, y: 120 }],
      x: [145, 155, 165], y: [120, 140, 120], t: [0, 40, 80]
    },
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 165, y: 120 }, { x: 140, y: 165 }],
      x: [165, 152, 140], y: [120, 142, 165], t: [0, 40, 80]
    },
    // Số mũ 2 của y
    {
      tool: 'fountain', color: '#1e293b', width: 2.8,
      points: [{ x: 172, y: 105 }, { x: 184, y: 105 }, { x: 172, y: 122 }, { x: 186, y: 122 }],
      x: [172, 184, 172, 186], y: [105, 105, 122, 122], t: [0, 30, 60, 90]
    },
    // Dấu =
    {
      tool: 'fountain', color: '#1e293b', width: 3,
      points: [{ x: 200, y: 130 }, { x: 220, y: 130 }],
      x: [200, 220], y: [130, 130], t: [0, 40]
    },
    {
      tool: 'fountain', color: '#1e293b', width: 3,
      points: [{ x: 200, y: 142 }, { x: 220, y: 142 }],
      x: [200, 220], y: [142, 142], t: [0, 40]
    },
    // Chữ r
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 235, y: 125 }, { x: 235, y: 150 }],
      x: [235, 235], y: [125, 150], t: [0, 40]
    },
    {
      tool: 'fountain', color: '#1e293b', width: 3.5,
      points: [{ x: 235, y: 132 }, { x: 245, y: 125 }, { x: 252, y: 128 }],
      x: [235, 245, 252], y: [132, 125, 128], t: [0, 30, 60]
    },
    // Số mũ 2 của r
    {
      tool: 'fountain', color: '#1e293b', width: 2.8,
      points: [{ x: 258, y: 105 }, { x: 270, y: 105 }, { x: 258, y: 122 }, { x: 272, y: 122 }],
      x: [258, 270, 258, 272], y: [105, 105, 122, 122], t: [0, 30, 60, 90]
    }
  ];

  for (const s of strokes) canvas.strokes.push(s);
  canvas.redrawAll();
  canvas.notifyHistoryChange();
}
