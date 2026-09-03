/**
 * Module nhận diện chữ viết tay thông minh
 * Hỗ trợ nhận diện nhiều dòng (Multi-line Recognition),
 * tự động phân đoạn dòng chữ theo tọa độ Y,
 * sử dụng Google Handwriting IME Vector API và Gemini Vision.
 */

export class HandwritingRecognizer {
  constructor() {
    this.language = 'vi';
    this.apiUrl = '/api/handwriting';
    this.directUrl = 'https://www.google.com.tw/inputtools/request?ime=handwriting&app=mobilesearch&cs=1&oe=UTF-8';
    this.pendingControllers = new Set();
  }

  setLanguage(lang) {
    this.language = lang;
  }

  cancelPendingRecognition() {
    this.pendingControllers.forEach(controller => controller.abort());
    this.pendingControllers.clear();
  }

  /**
   * Thuật toán phân đoạn nét vẽ thành các dòng riêng biệt (Line Segmentation)
   * dựa trên tọa độ Y và phân cụm dấu thanh tiếng Việt.
   * @param {Array} strokes - Mảng các nét vẽ [{ x: [], y: [], t: [] }]
   * @returns {Array<Array>} Mảng các dòng, mỗi dòng là một mảng strokes
   */
  segmentLines(strokes) {
    if (!strokes || strokes.length === 0) return [];
    if (strokes.length <= 2) return [strokes];

    // Trích xuất bounding box và tâm của từng nét vẽ
    const strokeData = strokes.map((s, idx) => {
      const minY = Math.min(...s.y);
      const maxY = Math.max(...s.y);
      const minX = Math.min(...s.x);
      const maxX = Math.max(...s.x);
      return {
        index: idx,
        stroke: s,
        minY, maxY, minX, maxX,
        width: maxX - minX,
        height: maxY - minY,
        centerY: (minY + maxY) / 2
      };
    });

    // Tính chiều cao trung bình của các nét chính (loại trừ dấu chấm quá nhỏ)
    const mainStrokes = strokeData.filter(s => s.height > 12 || s.width > 12);
    const avgHeight = mainStrokes.length > 0
      ? mainStrokes.reduce((sum, s) => sum + s.height, 0) / mainStrokes.length
      : 30;

    // Ngưỡng khoảng cách dòng: thông thường giữa các dòng có khoảng cách rõ ràng
    const lineThreshold = Math.max(38, avgHeight * 0.85);

    // Sắp xếp các nét theo tọa độ Y từ trên xuống dưới
    const sortedStrokes = [...strokeData].sort((a, b) => a.centerY - b.centerY);

    const lines = [];

    for (const s of sortedStrokes) {
      let matchedLine = null;
      let minDistance = Infinity;

      for (const line of lines) {
        const lineCenter = (line.minY + line.maxY) / 2;
        const verticalDist = Math.abs(s.centerY - lineCenter);

        // Kiểm tra độ phủ theo phương dọc (Y overlap)
        const overlapY = Math.min(s.maxY, line.maxY) - Math.max(s.minY, line.minY);

        // Kiểm tra dấu phụ (dấu hỏi, ngã, sắc, nặng, dấu mũ) có trùng tọa độ X với chữ trong dòng
        const hasXOverlap = line.strokes.some(other => {
          const overlapX = Math.min(s.maxX, other.maxX) - Math.max(s.minX, other.minX);
          return overlapX > -12; // Gần nhau hoặc thẳng cột theo trục X
        });

        // Nét thuộc về dòng này nếu:
        // 1. Có trùng lặp Y (viết cùng cao độ)
        // 2. Hoặc khoảng cách tới tâm dòng nhỏ hơn ngưỡng dòng
        // 3. Hoặc là dấu phụ nằm thẳng cột X và cách dòng không quá xa
        if (overlapY > 0 || verticalDist < lineThreshold || (hasXOverlap && verticalDist < lineThreshold * 1.35)) {
          if (verticalDist < minDistance) {
            minDistance = verticalDist;
            matchedLine = line;
          }
        }
      }

      if (matchedLine) {
        matchedLine.strokes.push(s);
        matchedLine.minY = Math.min(matchedLine.minY, s.minY);
        matchedLine.maxY = Math.max(matchedLine.maxY, s.maxY);
      } else {
        lines.push({
          minY: s.minY,
          maxY: s.maxY,
          strokes: [s]
        });
      }
    }

    // Sắp xếp các dòng từ trên xuống dưới
    lines.sort((a, b) => a.minY - b.minY);

    // Trong mỗi dòng, sắp xếp lại các nét theo thứ tự viết từ trái sang phải
    return lines.map(line => {
      const sorted = [...line.strokes].sort((a, b) => a.minX - b.minX);
      return sorted.map(item => item.stroke);
    });
  }

  /**
   * Nhận diện chữ viết tay từ nét vẽ vector
   * Tự động phân đoạn nếu người dùng viết từ 2 dòng trở lên!
   */
  async recognize(strokes, width = 800, height = 500) {
    if (!strokes || strokes.length === 0) {
      return { success: false, candidates: [], top: '', error: 'Chưa có nét vẽ nào để nhận diện' };
    }

    // 1. Phân đoạn nét thành các dòng
    const lines = this.segmentLines(strokes);

    // Nếu chỉ có 1 dòng, nhận diện đơn giản
    if (lines.length <= 1) {
      const res = await this.recognizeSingleLine(strokes, width, height);
      return {
        ...res,
        isMultiLine: false,
        lineTexts: res.top ? [res.top] : []
      };
    }

    // Nếu có từ 2 dòng trở lên: nhận diện từng dòng song song
    try {
      const linePromises = lines.map(lineStrokes =>
        this.recognizeSingleLine(lineStrokes, width, height)
      );

      const lineResults = await Promise.all(linePromises);

      // Lọc các dòng nhận diện thành công
      const recognizedLines = lineResults
        .map(r => (r.success && r.top ? r.top.trim() : ''))
        .filter(Boolean);

      if (recognizedLines.length === 0) {
        // Fallback: Thử nhận diện toàn bộ cùng một lúc nếu phân đoạn bị lỗi
        return await this.recognizeSingleLine(strokes, width, height);
      }

      const fullMultiLineText = recognizedLines.join('\n');

      return {
        success: true,
        candidates: [fullMultiLineText, ...recognizedLines],
        top: fullMultiLineText,
        isMultiLine: true,
        lineTexts: recognizedLines
      };
    } catch (err) {
      console.warn('Lỗi nhận diện đa dòng, fallback về đơn dòng:', err);
      return await this.recognizeSingleLine(strokes, width, height);
    }
  }

  /**
   * Gửi tọa độ nét của một dòng duy nhất tới Google Handwriting IME API
   */
  async recognizeSingleLine(strokes, width = 800, height = 500) {
    if (!strokes || strokes.length === 0) {
      return { success: false, candidates: [], top: '' };
    }

    const ink = strokes.map(stroke => [
      stroke.x.map(Math.round),
      stroke.y.map(Math.round),
      stroke.t.map(Math.round)
    ]);

    const requestBody = {
      options: 'enable_pre_space',
      requests: [
        {
          writing_guide: {
            writing_area_width: Math.round(width),
            writing_area_height: Math.round(height)
          },
          ink: ink,
          language: this.language
        }
      ]
    };

    const endpoints = [this.apiUrl, this.directUrl];

    for (const url of endpoints) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);
      this.pendingControllers.add(controller);
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal
        });

        if (response.ok) {
          const data = await response.json();
          if (data && data[0] === 'SUCCESS' && data[1] && data[1][0] && data[1][0][1]) {
            const rawCandidates = data[1][0][1];
            const candidates = rawCandidates.map(c => c.trim()).filter(Boolean);
            const topCandidate = candidates[0] || '';
            return {
              success: true,
              candidates: candidates,
              top: topCandidate
            };
          }
        }
      } catch (err) {
        if (err.name === 'AbortError') {
          return {
            success: false,
            candidates: [],
            top: '',
            error: 'Nhận diện bị hủy hoặc quá thời gian chờ'
          };
        }
        console.warn(`Lỗi API tại ${url}:`, err);
      } finally {
        clearTimeout(timeoutId);
        this.pendingControllers.delete(controller);
      }
    }

    return {
      success: false,
      candidates: [],
      top: '',
      error: 'Không thể kết nối đến máy chủ nhận diện'
    };
  }

  /**
   * Nhận diện văn bản từ hình ảnh chụp bài viết tay qua Gemini Vision (tùy chọn với API Key)
   */
  async recognizeImageWithGemini(base64Image, apiKey) {
    if (!apiKey) {
      throw new Error('Vui lòng cung cấp Gemini API Key để nhận diện ảnh viết tay chụp từ bên ngoài.');
    }

    const mimeMatch = base64Image.match(/^data:(image\/[a-zA-Z+]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';
    const cleanBase64 = base64Image.replace(/^data:image\/[a-zA-Z+]+;base64,/, '');

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const prompt = `Bạn là chuyên gia chuyển chữ viết tay tiếng Việt thành văn bản Word.
Hãy đọc toàn bộ chữ viết tay trong hình ảnh này một cách trung thực, chính xác nhất.
Yêu cầu:
1. Giữ nguyên dấu tiếng Việt (hỏi, ngã, sắc, huyền, nặng).
2. Phân tách rõ ràng các dòng và đoạn văn.
3. Không thêm các lời giải thích rườm rà, chỉ trả về nội dung văn bản đã được nhận diện.`;

    const body = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: cleanBase64
              }
            }
          ]
        }
      ]
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    this.pendingControllers.add(controller);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Lỗi AI Vision (${res.status})`);
      }

      const json = await res.json();
      const resultText = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return resultText.trim();
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error('AI Vision quá thời gian chờ. Hãy thử lại.');
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      this.pendingControllers.delete(controller);
    }
  }
}
