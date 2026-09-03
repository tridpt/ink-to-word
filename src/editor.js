/**
 * Module quản lý Trình soạn thảo văn bản Word & Hệ thống Typography
 * Hỗ trợ các bộ font chữ đẹp chuẩn Việt Nam, định dạng Rich Text,
 * xuất file và đếm ký tự thời gian thực, hỗ trợ tách đoạn văn và kết xuất công thức toán KaTeX.
 */
import katex from 'katex';
import 'katex/dist/katex.min.css';

export const TYPOGRAPHY_PRESETS = {
  office: {
    id: 'office',
    name: 'Văn Bản Chuẩn Word (Hành Chính)',
    fontFamily: '"Times New Roman", Times, serif',
    fontSize: '14pt',
    lineHeight: '1.5',
    textAlign: 'justify',
    paragraphIndent: '1.27cm',
    description: 'Chuẩn Nghị định văn bản nhà nước, trang trọng, chỉn chu.'
  },
  modern: {
    id: 'modern',
    name: 'Hiện Đại & Tinh Tế (Be Vietnam Pro)',
    fontFamily: '"Be Vietnam Pro", sans-serif',
    fontSize: '11pt',
    lineHeight: '1.7',
    textAlign: 'left',
    paragraphIndent: '0px',
    description: 'Font tiếng Việt chuẩn quốc tế, nét chữ thanh thoát, cực kỳ dễ đọc.'
  },
  literary: {
    id: 'literary',
    name: 'Tạp Chí & Văn Học (Merriweather)',
    fontFamily: '"Merriweather", Georgia, serif',
    fontSize: '11.5pt',
    lineHeight: '1.8',
    textAlign: 'justify',
    paragraphIndent: '0.8cm',
    description: 'Kiểu chữ cổ điển tao nhã, êm mắt khi đọc bài viết dài hoặc ghi chép văn học.'
  },
  editorial: {
    id: 'editorial',
    name: 'Nghệ Thuật & Cao Cấp (Playfair)',
    fontFamily: '"Playfair Display", serif',
    fontSize: '12pt',
    lineHeight: '1.7',
    textAlign: 'left',
    paragraphIndent: '0px',
    description: 'Phù hợp cho thư từ, tản văn, thơ ca hoặc bài cảm nghĩ.'
  },
  handwritten: {
    id: 'handwritten',
    name: 'Bút Viết Mềm Mại (Dancing Script)',
    fontFamily: '"Dancing Script", cursive',
    fontSize: '16pt',
    lineHeight: '1.6',
    textAlign: 'left',
    paragraphIndent: '0px',
    description: 'Mô phỏng chữ viết tay cách điệu, lãng mạn và mềm mại.'
  }
};

export class WordDocumentEditor {
  constructor(editorElement, statsElement, options = {}) {
    this.editor = editorElement;
    this.statsElement = statsElement;
    this.currentPreset = 'modern';
    this.onContentChange = options.onContentChange || null;

    this.init();
  }

  init() {
    this.applyPreset(this.currentPreset);
    this.bindEvents();
    this.updateStats();

    // Khôi phục nội dung đã lưu nếu có
    const saved = localStorage.getItem('ink_to_word_draft');
    if (saved && saved.trim()) {
      this.editor.innerHTML = saved;
      this.editor.querySelectorAll('.word-math-block').forEach(block => this.bindMathFormulaInteractions(block));
      this.updateStats();
    }
  }

  bindEvents() {
    this.editor.addEventListener('input', () => {
      this.updateStats();
      this.saveDraft();
      if (this.onContentChange) this.onContentChange(this.getText());
    });

    this.editor.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') {
          e.preventDefault();
          this.execFormat('bold');
        } else if (e.key === 'i') {
          e.preventDefault();
          this.execFormat('italic');
        } else if (e.key === 'u') {
          e.preventDefault();
          this.execFormat('underline');
        }
      }
    });
  }

  applyPreset(presetKey) {
    const preset = TYPOGRAPHY_PRESETS[presetKey] || TYPOGRAPHY_PRESETS.modern;
    this.currentPreset = presetKey;

    this.editor.style.fontFamily = preset.fontFamily;
    this.editor.style.fontSize = preset.fontSize;
    this.editor.style.lineHeight = preset.lineHeight;
    this.editor.style.textAlign = preset.textAlign;

    document.documentElement.style.setProperty('--doc-text-indent', preset.paragraphIndent);
    return preset;
  }

  execFormat(command, value = null) {
    document.execCommand(command, false, value);
    this.editor.focus();
    this.updateStats();
    this.saveDraft();
  }

  bindMathFormulaInteractions(formulaBox) {
    if (!formulaBox || formulaBox._mathActionsBound) return;
    formulaBox._mathActionsBound = true;

    const editBtn = formulaBox.querySelector('.btn-math-edit');
    const copyBtn = formulaBox.querySelector('.btn-math-copy');
    const delBtn = formulaBox.querySelector('.btn-math-del');
    const renderedDiv = formulaBox.querySelector('.math-rendered');
    const labelSpan = formulaBox.querySelector('.latex-label');

    editBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      const currentLatex = formulaBox.getAttribute('data-latex') || '';
      const newLatex = prompt('Chỉnh sửa mã LaTeX của công thức:', currentLatex);
      if (newLatex !== null && newLatex.trim()) {
        formulaBox.setAttribute('data-latex', newLatex.trim());
        try {
          renderedDiv.innerHTML = katex.renderToString(newLatex.trim(), { displayMode: true, throwOnError: false });
        } catch (_) {
          renderedDiv.textContent = newLatex.trim();
        }
        labelSpan.textContent = `LaTeX: ${newLatex.trim()}`;
        this.saveDraft();
      }
    });

    copyBtn?.addEventListener('click', async (e) => {
      e.stopPropagation();
      const currentLatex = formulaBox.getAttribute('data-latex') || '';
      try {
        await navigator.clipboard.writeText(currentLatex);
      } catch (_) {}
      copyBtn.innerHTML = '<i data-lucide="check"></i>';
      setTimeout(() => {
        copyBtn.innerHTML = '<i data-lucide="copy"></i>';
        if (window.lucide) window.lucide.createIcons();
      }, 1500);
    });

    delBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      formulaBox.remove();
      this.saveDraft();
      this.updateStats();
    });

    if (window.lucide) {
      setTimeout(() => window.lucide.createIcons(), 10);
    }
  }

  /**
   * Chèn công thức toán học KaTeX vào tài liệu Word
   * @param {string} latex - Mã LaTeX toán học (ví dụ: \sqrt{x^2 + 1}, \int_0^1 x dx)
   * @param {'append'|'replace'|'cursor'} mode - Phương thức chèn
   */
  insertMathFormula(latex, mode = 'append') {
    if (!latex || !latex.trim()) return;

    let mathHtml = '';
    try {
      mathHtml = katex.renderToString(latex.trim(), { displayMode: true, throwOnError: false });
    } catch (e) {
      mathHtml = `<span class="katex-raw">${this.escapeHtml(latex)}</span>`;
    }

    const formulaBox = document.createElement('div');
    formulaBox.className = 'word-math-block';
    formulaBox.setAttribute('data-latex', latex.trim());
    formulaBox.innerHTML = `
      <div class="math-rendered">${mathHtml}</div>
      <div class="math-sub-badge">
        <span class="latex-label">LaTeX: ${this.escapeHtml(latex.trim())}</span>
        <button class="btn-math-action btn-math-edit" title="Chỉnh sửa mã LaTeX của công thức"><i data-lucide="edit-2"></i> Sửa</button>
        <button class="btn-math-action btn-math-copy" title="Sao chép mã LaTeX"><i data-lucide="copy"></i></button>
        <button class="btn-math-action btn-math-del" title="Xóa công thức"><i data-lucide="trash-2"></i></button>
      </div>
    `;

    this.bindMathFormulaInteractions(formulaBox);

    if (mode === 'replace') {
      this.editor.innerHTML = '';
      this.editor.appendChild(formulaBox);
    } else if (mode === 'append') {
      const currentHtml = this.editor.innerHTML.trim();
      if (!currentHtml || currentHtml === '<p><br></p>' || currentHtml === '<p></p>') {
        this.editor.innerHTML = '';
      }
      this.editor.appendChild(formulaBox);

      // Thêm 1 dòng trống phía dưới để tiếp tục viết văn bản
      const blankP = document.createElement('p');
      blankP.innerHTML = '<br>';
      this.editor.appendChild(blankP);
    } else {
      this.editor.appendChild(formulaBox);
    }

    this.updateStats();
    this.saveDraft();
    if (this.onContentChange) this.onContentChange(this.getText());
    formulaBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Chèn văn bản hoặc công thức nhận diện được vào tài liệu
   */
  insertRecognizedText(text, mode = 'append') {
    if (!text || !text.trim()) return;

    // Tự động phát hiện nếu là công thức toán học LaTeX (căn, tích phân, phân số, số mũ...)
    const isMath = /^\\(sqrt|int|frac|sum|prod|lim|alpha|beta|theta|pi|infty)|[\^_{}\\]/.test(text.trim());
    if (isMath) {
      this.insertMathFormula(text, mode);
      return;
    }

    // Tách các dòng thành mảng
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    if (mode === 'replace') {
      this.editor.innerHTML = lines.map(line => `<p>${this.escapeHtml(line)}</p>`).join('');
    } else if (mode === 'append') {
      const currentHtml = this.editor.innerHTML.trim();
      const isEmpty = !currentHtml || currentHtml === '<p><br></p>' || currentHtml === '<p></p>';

      if (isEmpty) {
        this.editor.innerHTML = lines.map(line => `<p>${this.escapeHtml(line)}</p>`).join('');
      } else {
        lines.forEach(line => {
          const newParagraph = document.createElement('p');
          newParagraph.textContent = line;
          this.editor.appendChild(newParagraph);
        });
      }
    } else {
      // Chèn tại vị trí con trỏ
      this.editor.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();

        const fragment = document.createDocumentFragment();
        lines.forEach((line, index) => {
          if (index > 0) {
            fragment.appendChild(document.createElement('br'));
          }
          fragment.appendChild(document.createTextNode(line + ' '));
        });

        range.insertNode(fragment);
      } else {
        this.insertRecognizedText(text, 'append');
      }
    }

    this.updateStats();
    this.saveDraft();
    if (this.onContentChange) this.onContentChange(this.getText());

    this.editor.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  getText() {
    return this.editor.innerText || '';
  }

  getHtml() {
    return this.editor.innerHTML || '';
  }

  clear() {
    this.editor.innerHTML = '<p><br></p>';
    this.updateStats();
    this.saveDraft();
  }

  saveDraft() {
    try {
      localStorage.setItem('ink_to_word_draft', this.editor.innerHTML);
    } catch (_) {}
  }

  updateStats() {
    if (!this.statsElement) return;

    const text = this.getText().trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    const chars = text.length;
    const readTime = Math.ceil(words / 200) || 1;

    this.statsElement.innerHTML = `
      <span class="stat-item"><i data-lucide="file-text"></i> ${words} từ</span>
      <span class="stat-item"><i data-lucide="type"></i> ${chars} ký tự</span>
      <span class="stat-item"><i data-lucide="clock"></i> ~${readTime} phút đọc</span>
    `;

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
}
