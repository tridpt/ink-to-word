/**
 * Module xuất file Microsoft Word (.docx), PDF và Sao chép Rich Text vào Clipboard
 */
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, convertInchesToTwip } from 'docx';
import { saveAs } from 'file-saver';

export class DocxExporter {
  /**
   * Chuyển đổi nội dung HTML từ Editor thành tài liệu .docx
   */
  static async exportToDocx(editorElement, options = {}) {
    const filename = options.filename || `Tai_lieu_${new Date().toISOString().slice(0, 10)}.docx`;
    const computed = typeof window !== 'undefined' && window.getComputedStyle
      ? window.getComputedStyle(editorElement)
      : null;
    const computedFont = computed?.fontFamily?.split(',')[0]?.trim().replace(/^['"]|['"]$/g, '');
    const computedSize = computed ? Math.round(parseFloat(computed.fontSize) * 2 * 72 / 96) : 0;
    const fontName = options.fontName || computedFont || 'Times New Roman';
    const fontSize = options.fontSize || computedSize || 28; // half-points
    const alignment = ({ left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED })[
      computed?.textAlign
    ] || AlignmentType.LEFT;

    const docChildren = [];
    const childNodes = Array.from(editorElement.childNodes);

    for (const node of childNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const tagName = node.tagName.toLowerCase();

        // Công thức được xuất dưới dạng LaTeX thuần, không đưa nút thao tác/UI vào Word.
        if (node.classList.contains('word-math-block')) {
          const latex = node.getAttribute('data-latex') || '';
          if (latex) {
            docChildren.push(new Paragraph({
              children: [new TextRun({ text: latex, font: fontName, size: fontSize })],
              spacing: { line: 360, after: 120 },
              alignment
            }));
          }
          continue;
        }

        if (tagName === 'h1') {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: node.innerText, font: fontName, size: fontSize, bold: true })],
              heading: HeadingLevel.HEADING_1,
              spacing: { before: 240, after: 120 }
            })
          );
        } else if (tagName === 'h2') {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: node.innerText, font: fontName, size: fontSize, bold: true })],
              heading: HeadingLevel.HEADING_2,
              spacing: { before: 200, after: 100 }
            })
          );
        } else if (tagName === 'h3') {
          docChildren.push(
            new Paragraph({
              children: [new TextRun({ text: node.innerText, font: fontName, size: fontSize, bold: true })],
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 160, after: 80 }
            })
          );
        } else if (tagName === 'ul' || tagName === 'ol') {
          const listItems = Array.from(node.querySelectorAll('li'));
          listItems.forEach((li, index) => {
            docChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: (tagName === 'ul' ? '• ' : `${index + 1}. `) + li.innerText,
                    font: fontName,
                    size: fontSize
                  })
                ],
                spacing: { after: 100 }
              })
            );
          });
        } else {
          // Đoạn văn thông thường <p> hoặc <div>
          const runs = DocxExporter.parseElementRuns(node, fontName, fontSize);
          if (runs.length > 0) {
            docChildren.push(
              new Paragraph({
                children: runs,
                spacing: { line: 360, after: 120 }, // Giãn dòng 1.5
                alignment
              })
            );
          }
        }
      } else if (node.nodeType === Node.TEXT_NODE && node.textContent.trim()) {
        docChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: node.textContent,
                font: fontName,
                size: fontSize
              })
            ],
            spacing: { line: 360, after: 120 }
          })
        );
      }
    }

    if (docChildren.length === 0) {
      docChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: 'Nội dung tài liệu trống',
              font: fontName,
              size: fontSize
            })
          ]
        })
      );
    }

    const doc = new Document({
      creator: 'InkToWord Studio',
      title: 'Văn bản chuyển đổi từ chữ viết tay',
      description: 'Được tạo bởi ứng dụng InkToWord Studio',
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: convertInchesToTwip(0.79), // ~2cm
                bottom: convertInchesToTwip(0.79), // ~2cm
                left: convertInchesToTwip(0.98), // ~2.5cm
                right: convertInchesToTwip(0.79) // ~2cm
              }
            }
          },
          children: docChildren
        }
      ]
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, filename);
    return true;
  }

  /**
   * Phân tích các định dạng đậm, nghiêng, gạch chân trong thẻ
   */
  static parseElementRuns(element, defaultFont, defaultSize) {
    const runs = [];

    function traverse(node, currentStyles) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (node.textContent) {
          runs.push(
            new TextRun({
              text: node.textContent,
              font: defaultFont,
              size: defaultSize,
              bold: currentStyles.bold,
              italics: currentStyles.italic,
              underline: currentStyles.underline ? {} : undefined
            })
          );
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName.toLowerCase();
        const nextStyles = { ...currentStyles };

        if (tag === 'b' || tag === 'strong') nextStyles.bold = true;
        if (tag === 'i' || tag === 'em') nextStyles.italic = true;
        if (tag === 'u') nextStyles.underline = true;

        node.childNodes.forEach(child => traverse(child, nextStyles));
      }
    }

    traverse(element, { bold: false, italic: false, underline: false });
    return runs;
  }

  /**
   * Sao chép định dạng Rich Text vào Clipboard
   */
  static async copyRichText(editorElement) {
    const html = editorElement.innerHTML;
    const text = editorElement.innerText;

    try {
      if (navigator.clipboard && window.ClipboardItem) {
        const blobHtml = new Blob([html], { type: 'text/html' });
        const blobText = new Blob([text], { type: 'text/plain' });
        const item = new ClipboardItem({
          'text/html': blobHtml,
          'text/plain': blobText
        });
        await navigator.clipboard.write([item]);
        return true;
      }
    } catch (err) {
      console.warn('Không thể ghi ClipboardItem, chuyển sang fallback:', err);
    }

    // Fallback: sao chép text thuần
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * In ấn hoặc xuất PDF thông qua hộp thoại Print của trình duyệt
   */
  static printToPdf() {
    window.print();
  }
}
