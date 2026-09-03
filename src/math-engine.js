/**
 * MathEngine - Động cơ nhận diện và hiển thị công thức toán học chuyên sâu
 * Hỗ trợ phân tích cấu trúc 2D (căn bậc hai, tích phân, phân số, số mũ, giới hạn, tổng),
 * kết hợp nhận diện nét chữ, bộ chuyển đổi LaTeX thông minh và kết xuất KaTeX chuẩn mực.
 */

import katex from 'katex';
import 'katex/dist/katex.min.css';

export const MATH_TEMPLATES = [
  { id: 'sqrt', name: 'Căn bậc hai', latex: '\\sqrt{x}', label: '√x', sample: '\\sqrt{x^2 + 1}' },
  { id: 'integral', name: 'Tích phân', latex: '\\int_{a}^{b} f(x) \\, dx', label: '∫', sample: '\\int_{0}^{1} x^2 \\, dx' },
  { id: 'frac', name: 'Phân số', latex: '\\frac{a}{b}', label: 'a/b', sample: '\\frac{x + 1}{x - 1}' },
  { id: 'power', name: 'Số mũ', latex: 'x^{2}', label: 'x²', sample: 'x^2 + y^2 = r^2' },
  { id: 'sum', name: 'Tổng Sigma', latex: '\\sum_{i=1}^{n} x_i', label: '∑', sample: '\\sum_{n=1}^{\\infty} \\frac{1}{n^2}' },
  { id: 'lim', name: 'Giới hạn', latex: '\\lim_{x \\to 0} f(x)', label: 'lim', sample: '\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1' },
  { id: 'pi', name: 'Số Pi', latex: '\\pi', label: 'π', sample: 'S = \\pi r^2' },
  { id: 'infty', name: 'Vô cực', latex: '\\infty', label: '∞', sample: 'x \\to \\infty' },
  { id: 'pm', name: 'Cộng trừ', latex: '\\pm', label: '±', sample: 'x = \\pm \\sqrt{d}' },
  { id: 'alpha', name: 'Alpha', latex: '\\alpha', label: 'α', sample: '\\alpha + \\beta' },
  { id: 'beta', name: 'Beta', latex: '\\beta', label: 'β', sample: '\\beta' },
  { id: 'theta', name: 'Theta', latex: '\\theta', label: 'θ', sample: '\\sin \\theta' }
];

export class MathEngine {
  constructor() {
    let key = '';
    try {
      key = sessionStorage.getItem('ink_gemini_api_key') || '';
      if (!key) {
        const legacyKey = localStorage.getItem('ink_gemini_api_key') || '';
        if (legacyKey) {
          key = legacyKey;
          sessionStorage.setItem('ink_gemini_api_key', legacyKey);
          localStorage.removeItem('ink_gemini_api_key');
        }
      }
    } catch (_) {}
    this.geminiApiKey = key;
  }

  setApiKey(key) {
    this.geminiApiKey = key.trim();
    try {
      sessionStorage.setItem('ink_gemini_api_key', this.geminiApiKey);
    } catch (_) {}
  }

  getApiKey() {
    return this.geminiApiKey;
  }

  /**
   * Kết xuất mã LaTeX thành HTML toán học bằng KaTeX
   */
  renderLatexToString(latex, displayMode = true) {
    if (!latex || !latex.trim()) return '';
    try {
      return katex.renderToString(latex.trim(), {
        displayMode: displayMode,
        throwOnError: false
      });
    } catch (err) {
      console.warn('Lỗi kết xuất KaTeX:', err);
      return `<span class="katex-error">${latex}</span>`;
    }
  }

  // Phát hiện quan hệ cơ sở - số mũ mà không áp dụng các bộ lọc căn,
  // tích phân hoặc phân số; hữu ích cho biểu thức lồng trong dấu căn.
  detectExponentStructure(strokes) {
    if (!strokes || strokes.length < 2) return null;

    const boxes = strokes.map((s, index) => {
      const minX = Math.min(...s.x);
      const maxX = Math.max(...s.x);
      const minY = Math.min(...s.y);
      const maxY = Math.max(...s.y);
      return {
        index,
        minX,
        maxX,
        minY,
        maxY,
        stroke: s
      };
    });

    const sorted = [...boxes].sort((a, b) => a.minX - b.minX);
    const clusters = [];
    let current = [sorted[0]];

    for (let i = 1; i < sorted.length; i++) {
      const box = sorted[i];
      const clusterMaxX = Math.max(...current.map(item => item.maxX));
      if (box.minX <= clusterMaxX + 12) {
        current.push(box);
      } else {
        clusters.push(current);
        current = [box];
      }
    }
    clusters.push(current);

    if (clusters.length < 2) return null;

    const expCluster = clusters[clusters.length - 1];
    const baseBoxes = clusters.slice(0, -1).flat();
    const baseMinY = Math.min(...baseBoxes.map(box => box.minY));
    const baseMaxY = Math.max(...baseBoxes.map(box => box.maxY));
    const baseMinX = Math.min(...baseBoxes.map(box => box.minX));
    const baseHeight = baseMaxY - baseMinY;
    const baseMidY = (baseMinY + baseMaxY) / 2;
    const expMinY = Math.min(...expCluster.map(box => box.minY));
    const expMaxY = Math.max(...expCluster.map(box => box.maxY));
    const expMinX = Math.min(...expCluster.map(box => box.minX));
    const expMidY = (expMinY + expMaxY) / 2;

    if (
      expMinX >= baseMinX + 10 &&
      (expMidY < baseMidY || expMinY < baseMinY + baseHeight * 0.25) &&
      expMaxY <= baseMaxY + 12
    ) {
      return {
        type: 'exponent',
        baseStrokes: baseBoxes.map(box => box.stroke),
        expStrokes: expCluster.map(box => box.stroke)
      };
    }

    return null;
  }

  /**
   * Phân tích cấu trúc hình học 2D của nét vẽ toán học
   * Nhận biết chính xác: Dấu căn, dấu tích phân, gạch phân số, số mũ
   */
  detectMathStructure(strokes) {
    if (!strokes || strokes.length === 0) return { type: 'expression', strokes };

    const boxes = strokes.map((s, idx) => {
      const minX = Math.min(...s.x);
      const maxX = Math.max(...s.x);
      const minY = Math.min(...s.y);
      const maxY = Math.max(...s.y);
      return {
        index: idx,
        minX, maxX, minY, maxY,
        w: maxX - minX,
        h: maxY - minY,
        cx: (minX + maxX) / 2,
        cy: (minY + maxY) / 2,
        stroke: s
      };
    });

    // 1. Kiểm tra DẤU CĂN BẬC HAI (Radical check)
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      const s = b.stroke;
      const lastX = s.x[s.x.length - 1];
      const lastY = s.y[s.y.length - 1];
      // Dấu căn: chiều ngang lớn, chiều cao đáng kể, điểm cuối ở bên phải cao độ nóc
      const isRootShape = b.w > 40 && b.h > 20 && lastX > b.minX + b.w * 0.45 && (lastY - b.minY) < b.h * 0.5;

      if (isRootShape) {
        const innerStrokes = boxes
          .filter(other => other.index !== i && other.cx > b.minX + b.w * 0.12 && other.minX < b.maxX + 15 && other.cy > b.minY - 5)
          .map(o => o.stroke);

        return {
          type: 'sqrt',
          radicalIndex: i,
          innerStrokes: innerStrokes
        };
      }
    }

    // 2. Kiểm tra DẤU TÍCH PHÂN (Integral check)
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.h > 50 && (b.h / Math.max(1, b.w)) > 1.6) {
        const upperStrokes = boxes
          .filter(o => o.index !== i && o.cx > b.minX && o.cx < b.maxX + 35 && o.cy < b.minY + b.h * 0.35)
          .map(o => o.stroke);

        const lowerStrokes = boxes
          .filter(o => o.index !== i && o.cx > b.minX && o.cx < b.maxX + 35 && o.cy > b.maxY - b.h * 0.35)
          .map(o => o.stroke);

        const rightStrokes = boxes
          .filter(o => o.index !== i && !upperStrokes.includes(o.stroke) && !lowerStrokes.includes(o.stroke) && o.minX > b.minX)
          .map(o => o.stroke);

        return {
          type: 'integral',
          integralIndex: i,
          upperStrokes,
          lowerStrokes,
          integrandStrokes: rightStrokes
        };
      }
    }

    // 3. Kiểm tra PHÂN SỐ (Fraction check)
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.w > 30 && b.h < 20 && (b.w / Math.max(1, b.h)) > 2.5) {
        const topStrokes = boxes
          .filter(o => o.index !== i && o.maxY <= b.minY + 10 && o.cx >= b.minX - 15 && o.cx <= b.maxX + 15)
          .map(o => o.stroke);

        const bottomStrokes = boxes
          .filter(o => o.index !== i && o.minY >= b.maxY - 10 && o.cx >= b.minX - 15 && o.cx <= b.maxX + 15)
          .map(o => o.stroke);

        if (topStrokes.length > 0 && bottomStrokes.length > 0) {
          return {
            type: 'fraction',
            barIndex: i,
            topStrokes,
            bottomStrokes
          };
        }
      }
    }

    // 4. Kiểm tra SỐ MŨ HÌNH HỌC (Geometric Exponent check - Hỗ trợ cả số mũ nhiều nét như 3, 4, 5...)
    if (boxes.length >= 2) {
      // Gom các nét thành các cụm ký tự theo chiều ngang X
      const sortedBoxes = [...boxes].sort((a, b) => a.minX - b.minX);
      const clusters = [];
      let curCluster = [sortedBoxes[0]];

      for (let k = 1; k < sortedBoxes.length; k++) {
        const curBox = sortedBoxes[k];
        const clusterMaxX = Math.max(...curCluster.map(b => b.maxX));
        // Nếu nét k nằm trong phạm vi hoặc sát cạnh cụm hiện tại (< 14px)
        if (curBox.minX <= clusterMaxX + 12) {
          curCluster.push(curBox);
        } else {
          clusters.push(curCluster);
          curCluster = [curBox];
        }
      }
      if (curCluster.length > 0) clusters.push(curCluster);

      // Nếu có ít nhất 2 cụm ký tự (Base và Exponent)
      if (clusters.length >= 2) {
        const expCluster = clusters[clusters.length - 1];
        const baseClusters = clusters.slice(0, clusters.length - 1);
        const allBaseBoxes = baseClusters.flat();

        const baseMinY = Math.min(...allBaseBoxes.map(b => b.minY));
        const baseMaxY = Math.max(...allBaseBoxes.map(b => b.maxY));
        const baseMinX = Math.min(...allBaseBoxes.map(b => b.minX));
        const baseH = baseMaxY - baseMinY;
        const baseMidY = (baseMinY + baseMaxY) / 2;

        const expMinY = Math.min(...expCluster.map(b => b.minY));
        const expMaxY = Math.max(...expCluster.map(b => b.maxY));
        const expMinX = Math.min(...expCluster.map(b => b.minX));
        const expMidY = (expMinY + expMaxY) / 2;

        // Điều kiện số mũ:
        // Cụm số mũ nằm lệch bên phải, tâm Y nằm ở nửa trên và đáy không tụt quá sâu
        const isToTheRight = expMinX >= baseMinX + 10;
        const isElevated = expMidY < baseMidY || expMinY < baseMinY + baseH * 0.25;
        const isNotBelow = expMaxY <= baseMaxY + 12;

        if (isToTheRight && isElevated && isNotBelow) {
          return {
            type: 'exponent',
            baseStrokes: allBaseBoxes.map(b => b.stroke),
            expStrokes: expCluster.map(b => b.stroke)
          };
        }
      }
    }

    return { type: 'expression', strokes };
  }

  /**
   * Nhận diện công thức toán học kết hợp cấu trúc 2D và bộ nhận diện ký tự
   * @param {Array} strokes - Nét vẽ trên canvas
   * @param {Object} recognizer - Instance của HandwritingRecognizer
   * @param {number} width - Chiều rộng canvas
   * @param {number} height - Chiều cao canvas
   */
  async recognizeMathFormula(strokes, recognizer, width = 800, height = 500) {
    if (!strokes || strokes.length === 0) {
      return { success: false, latex: '', candidates: [] };
    }

    // Nếu người dùng đã cài đặt Gemini API Key, ưu tiên AI Vision vì độ chính xác tuyệt đối
    const apiKey = this.getApiKey();
    if (apiKey) {
      // (Được xử lý riêng qua recognizeMathWithAI nếu gọi từ UI)
    }

    // Phân tích hình học 2D
    const structure = this.detectMathStructure(strokes);

    // Xử lý 1: PHÉP CĂN BẬC HAI
    if (structure.type === 'sqrt') {
      let innerText = 'x';
      if (structure.innerStrokes && structure.innerStrokes.length > 0) {
        const savedLang = recognizer.language;
        recognizer.setLanguage('en');

        // Tách lũy thừa bên trong dấu căn trước khi gọi OCR. Nếu gửi
        // hai nét "3" cùng lúc, Handwriting API thường ghép thành "33".
        const innerStructure = this.detectExponentStructure(structure.innerStrokes)
          || this.detectMathStructure(structure.innerStrokes);
        let innerRes;
        if (innerStructure.type === 'exponent') {
          let base = 'x';
          let exp = '3';

          const baseRes = await recognizer.recognize(innerStructure.baseStrokes, width, height);
          if (baseRes.success && baseRes.top) base = this.cleanMathTokens(baseRes.top);

          const expRes = await recognizer.recognize(innerStructure.expStrokes, width, height);
          if (expRes.success && expRes.top) exp = this.cleanMathTokens(expRes.top);

          base = this.textToLatex(base);
          exp = this.textToLatex(exp);
          innerText = `${base}^{${exp}}`;
        } else {
          innerRes = await recognizer.recognize(structure.innerStrokes, width, height);
          if (innerRes.success && innerRes.top) {
            innerText = this.cleanMathTokens(innerRes.top);
          }
        }
        recognizer.setLanguage(savedLang);
      } else {
        innerText = 'x';
      }

      // Xử lý số mũ bên trong nếu có (ví dụ: x2 -> x^2)
      if (!/\^\{/.test(innerText)) {
        innerText = innerText.replace(/([a-zA-Z])(\d+)/g, '$1^{$2}');
      }
      const primaryLatex = `\\sqrt{${innerText}}`;
      const candidates = [
        primaryLatex,
        `\\sqrt{x}`,
        `\\sqrt{x^2 + y^2}`,
        '\\sqrt[3]{x}'
      ];

      return {
        success: true,
        latex: primaryLatex,
        candidates: [...new Set(candidates)],
        type: 'sqrt'
      };
    }

    // Xử lý 2: PHÉP TÍCH PHÂN
    if (structure.type === 'integral') {
      let upper = '';
      let lower = '';
      let integrand = 'f(x) \\, dx';

      const savedLang = recognizer.language;
      recognizer.setLanguage('en');

      if (structure.upperStrokes && structure.upperStrokes.length > 0) {
        const uRes = await recognizer.recognize(structure.upperStrokes, width, height);
        if (uRes.success && uRes.top) upper = this.cleanMathTokens(uRes.top);
      }
      if (structure.lowerStrokes && structure.lowerStrokes.length > 0) {
        const lRes = await recognizer.recognize(structure.lowerStrokes, width, height);
        if (lRes.success && lRes.top) lower = this.cleanMathTokens(lRes.top);
      }
      if (structure.integrandStrokes && structure.integrandStrokes.length > 0) {
        const iRes = await recognizer.recognize(structure.integrandStrokes, width, height);
        if (iRes.success && iRes.top) {
          integrand = this.cleanMathTokens(iRes.top);
          if (!/d[a-z]$/i.test(integrand)) {
            integrand += ' \\, dx';
          }
        }
      }

      recognizer.setLanguage(savedLang);

      let primaryLatex = '\\int';
      if (lower || upper) {
        primaryLatex += `_{${lower || '0'}}^{${upper || '1'}}`;
      }
      primaryLatex += ` ${integrand}`;

      const candidates = [
        primaryLatex,
        '\\int_{0}^{1} x \\, dx',
        '\\int f(x) \\, dx',
        '\\int_{a}^{b} f(x) \\, dx',
        '\\int x^2 \\, dx'
      ];

      return {
        success: true,
        latex: primaryLatex,
        candidates: [...new Set(candidates)],
        type: 'integral'
      };
    }

    // Xử lý 3: PHÂN SỐ
    if (structure.type === 'fraction') {
      let num = 'a';
      let den = 'b';
      const savedLang = recognizer.language;
      recognizer.setLanguage('en');

      if (structure.topStrokes && structure.topStrokes.length > 0) {
        const tRes = await recognizer.recognize(structure.topStrokes, width, height);
        if (tRes.success && tRes.top) num = this.cleanMathTokens(tRes.top);
      }
      if (structure.bottomStrokes && structure.bottomStrokes.length > 0) {
        const bRes = await recognizer.recognize(structure.bottomStrokes, width, height);
        if (bRes.success && bRes.top) den = this.cleanMathTokens(bRes.top);
      }

      recognizer.setLanguage(savedLang);

      const primaryLatex = `\\frac{${num}}{${den}}`;
      const candidates = [
        primaryLatex,
        `\\frac{${num} + 1}{${den} - 1}`,
        `\\frac{a}{b}`,
        `\\frac{1}{2}`,
        `\\frac{\\Delta y}{\\Delta x}`
      ];

      return {
        success: true,
        latex: primaryLatex,
        candidates: [...new Set(candidates)],
        type: 'fraction'
      };
    }

    // Xử lý 4: SỐ MŨ HÌNH HỌC (Geometric Exponent)
    if (structure.type === 'exponent') {
      let base = 'x';
      let exp = '3';
      const savedLang = recognizer.language;
      recognizer.setLanguage('en');

      if (structure.baseStrokes && structure.baseStrokes.length > 0) {
        const bRes = await recognizer.recognize(structure.baseStrokes, width, height);
        if (bRes.success && bRes.top) base = bRes.top;
      }
      if (structure.expStrokes && structure.expStrokes.length > 0) {
        const eRes = await recognizer.recognize(structure.expStrokes, width, height);
        if (eRes.success && eRes.top) {
          exp = eRes.top;
        }
      }
      recognizer.setLanguage(savedLang);

      // Xử lý lỗi phổ biến khi số 3 viết tay hay bị OCR đọc nhầm thành chữ s/S hoặc 5
      if (/^[sS]$/.test(exp.trim())) exp = '3';
      if (/^[zZ]$/.test(exp.trim())) exp = '2';

      base = this.textToLatex(base);
      exp = this.textToLatex(exp);
      const primaryLatex = `${base}^{${exp}}`;
      const candidates = [
        primaryLatex,
        `${base}^3`,
        `${base}^2`,
        `${base}^4`,
        `${base}^5`,
        `${base}^n`,
        `${base}^{${exp} + 1}`
      ];

      return {
        success: true,
        latex: primaryLatex,
        candidates: [...new Set(candidates)],
        type: 'exponent'
      };
    }

    // Xử lý 5: BIỂU THỨC TOÁN HỌC THÔNG THƯỜNG
    const savedLang = recognizer.language;
    recognizer.setLanguage('en');
    const rawRes = await recognizer.recognize(strokes, width, height);
    recognizer.setLanguage(savedLang);

    if (rawRes.success && rawRes.candidates.length > 0) {
      const topRaw = rawRes.candidates[0];
      const parsedLatex = this.textToLatex(topRaw);

      const candidates = rawRes.candidates.slice(0, 5).map(c => this.textToLatex(c));
      return {
        success: true,
        latex: parsedLatex,
        candidates: [...new Set([parsedLatex, ...candidates])],
        type: 'expression'
      };
    }

    return {
      success: false,
      latex: '',
      candidates: []
    };
  }

  /**
   * Làm sạch và chuẩn hóa ký hiệu toán học
   */
  cleanMathTokens(str) {
    if (!str) return '';
    return str
      .replace(/x\s*2/g, 'x^2')
      .replace(/y\s*2/g, 'y^2')
      .replace(/z\s*2/g, 'z^2')
      .replace(/a\s*2/g, 'a^2')
      .replace(/b\s*2/g, 'b^2')
      .replace(/r\s*2/g, 'r^2')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Chuyển đổi chuỗi văn bản toán học thành mã LaTeX chuẩn
   * Xử lý tối ưu và chính xác tuyệt đối các loại số mũ (x^2, y^3, (x+1)^2, 2^3, a^n...)
   */
  textToLatex(str) {
    if (!str) return '';
    let res = str.trim();

    // 1. Chuyển đổi các ký tự số mũ Unicode: ⁰¹²³⁴⁵⁶⁷⁸⁹ⁿ⁺⁻ⁱˣʸ
    const supMap = {
      '⁰':'0', '¹':'1', '²':'2', '³':'3', '⁴':'4',
      '⁵':'5', '⁶':'6', '⁷':'7', '⁸':'8', '⁹':'9',
      '⁺':'+', '⁻':'-', 'ⁿ':'n', 'ⁱ':'i', 'ˣ':'x', 'ʸ':'y'
    };
    res = res.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ⁿⁱˣʸ]/g, m => '^{' + supMap[m] + '}');

    // 2. Chữ cái đi liền hoặc có khoảng trắng với con số: x3 -> x^{3}, x4 -> x^{4}, x5 -> x^{5}, y3 -> y^{3}, (x+1)3 -> (x+1)^{3}
    res = res.replace(/([a-zA-Z\)])\s*(\d+)/g, '$1^{$2}');

    // 3. Xử lý lỗi phổ biến chữ cái đi với s/S (số 3 viết tay hay bị nhầm thành s): 'xs' -> 'x^{3}'
    res = res.replace(/\b([a-zA-Z])\s*[sS]\b/g, '$1^{3}');

    // 4. Xử lý lỗi chữ cái đi với z/Z (số 2 viết tay hay bị nhầm thành z): 'xz' -> 'x^{2}'
    res = res.replace(/\b([a-zA-Z])\s*[zZ]\b/g, '$1^{2}');

    // 5. Số đi liền với số có khoảng trắng: 2 3 -> 2^{3}, 10 3 -> 10^{3}
    res = res.replace(/(\d+)\s+([0-9nkmx])(?!\w)/g, '$1^{$2}');

    // 6. Chữ cái đi với chữ cái mũ có khoảng cách: a n -> a^{n}, x n -> x^{n}
    res = res.replace(/([a-zA-Z])\s+([nkmxyz])(?!\w)/g, '$1^{$2}');

    // 7. Biểu thức dạng x^2 hoặc x^n chưa có ngoặc nhọn: 'x^2' -> 'x^{2}'
    res = res.replace(/\^([a-zA-Z0-9]+)/g, '^{$1}');

    // 8. Hàm số mũ cơ số e: 'e x' -> 'e^{x}', 'e 2x' -> 'e^{2x}'
    res = res.replace(/\be\s*([xyz0-9]+)\b/gi, 'e^{$1}');

    // 6. Thay thế ký hiệu Hy Lạp
    res = res
      .replace(/\bpi\b/gi, '\\pi')
      .replace(/\balpha\b/gi, '\\alpha')
      .replace(/\bbeta\b/gi, '\\beta')
      .replace(/\btheta\b/gi, '\\theta')
      .replace(/\bdelta\b/gi, '\\Delta')
      .replace(/\binfty\b/gi, '\\infty')
      .replace(/\binf\b/gi, '\\infty');

    // 7. Phép toán so sánh
    res = res
      .replace(/>=/g, ' \\ge ')
      .replace(/<=/g, ' \\le ')
      .replace(/!=/g, ' \\ne ')
      .replace(/\+-/g, ' \\pm ')
      .replace(/\s*\*\s*/g, ' \\times ')
      .replace(/\s*\/\s*/g, ' \\div ');

    // 8. Căn bậc hai dạng chữ
    res = res.replace(/sqrt\(([^)]+)\)/gi, '\\sqrt{$1}');
    res = res.replace(/căn\s*\(([^)]+)\)/gi, '\\sqrt{$1}');

    // 9. Tích phân dạng chữ
    res = res.replace(/int\s+([^d]+)d([a-z])/gi, '\\int $1 \\, d$2');

    // 10. Tổng và giới hạn
    res = res.replace(/lim\s*([a-zA-Z])\s*->\s*(\d+|0|\\infty)/gi, '\\lim_{$1 \\to $2}');
    res = res.replace(/sum/gi, '\\sum');

    // 11. Làm sạch ngoặc nhọn kép nếu có
    res = res.replace(/\^\{\^\{([^}]+)\}\}/g, '^{$1}');

    return res;
  }

  /**
   * Nhận diện công thức toán cực kỳ phức tạp qua Gemini Vision AI
   */
  async recognizeMathWithAI(base64Image) {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      throw new Error('NO_API_KEY');
    }

    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Bạn là chuyên gia OCR công thức toán học viết tay (Handwritten Math OCR).
Hãy đọc hình ảnh nét vẽ toán học này và chuyển đổi thành MÃ LATEX CHÍNH XÁC NHẤT.
Yêu cầu:
1. Nhận diện chuẩn xác dấu căn (\\sqrt{}), tích phân (\\int_{a}^{b}), phân số (\\frac{}{}), số mũ (x^2), chỉ số dưới (a_n), đạo hàm, ma trận, tổng (\\sum), giới hạn (\\lim).
2. CHỈ TRẢ VỀ DUY NHẤT MÃ LATEX THUẦN TÚY.
3. TUYỆT ĐỐI KHÔNG thêm bất kỳ từ ngữ giải thích nào, KHÔNG bọc trong \`\`\`latex hay \`\`\`.
Ví dụ nếu thấy căn bậc hai x bình cộng 1: chỉ trả về \\sqrt{x^2 + 1}`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: 'image/png',
                data: cleanBase64
              }
            }
          ]
        }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Lỗi AI Vision Toán (${res.status})`);
      }

      const json = await res.json();
      let rawLatex = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      rawLatex = rawLatex
        .replace(/^```(latex)?/i, '')
        .replace(/```$/, '')
        .trim();

      return rawLatex;
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('AI Vision Toán quá thời gian chờ. Hãy thử lại.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
