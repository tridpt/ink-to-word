# InkToWord Studio ✍️ ➡️ 📄

Ứng dụng viết tay kỹ thuật số nhận diện thông minh tiếng Việt và tự động chuyển đổi thành văn bản chuẩn Microsoft Word với kiểu chữ đẹp, dễ nhìn, thanh lịch và hỗ trợ xuất file `.docx` / `PDF`.

---

## 🌟 Tính Năng Nổi Bật

1. **Bảng Viết Tay Chuyên Nghiệp (Digital Ink Canvas)**:
   - Thuật toán làm mượt Bézier curve cho nét chữ tự nhiên, thanh thoát.
   - Các loại bút: Bút mực (thanh đậm theo áp lực/tốc độ), Bút bi, Bút dạ quang, Tẩy xóa nét.
   - Nền giấy chân thực: Vở ô ly học sinh Việt Nam, Vở kẻ ngang, Sổ tay chấm bi (Dot Grid), Giấy trắng trơn, Giấy vàng cổ điển (Sepia), Bảng phấn đen.
   - Hỗ trợ chuột, ngón tay cảm ứng và bút cảm ứng Stylus (Apple Pencil, Wacom, Surface Pen).
   - Tải ảnh chữ viết tay chụp từ bên ngoài lên bảng vẽ (OCR ảnh cần Gemini API Key).

2. **Nhận Diện Chữ Viết Tay Thông Minh (Handwriting OCR Engine)**:
   - Phân tích tọa độ nét vẽ vector thời gian thực, đọc chuẩn xác toàn bộ dấu thanh tiếng Việt.
   - Thanh gợi ý từ (Candidate Bar) xuất hiện linh hoạt để chọn từ nhanh chỉ với 1 cú nhấp.
   - Chuyển đổi 1-click hoặc qua phím tắt `Ctrl + Enter` với hiệu ứng ăn mừng pháo hoa.

3. **Trang Văn Bản Giả Lập Microsoft Word (A4 Document Canvas)**:
   - Khung giấy A4 chuẩn kèm thước đo căn lề (Ruler).
   - Bộ Typography tuyển chọn cực đẹp cho tiếng Việt:
     - **Hiện Đại & Tinh Tế**: *Be Vietnam Pro*
     - **Chuẩn Văn Bản Word (Hành Chính)**: *Times New Roman* (14pt, giãn dòng 1.5, thụt đầu dòng 1.27cm)
     - **Tạp Chí & Văn Học**: *Merriweather*
     - **Nghệ Thuật & Sang Trọng**: *Playfair Display*
     - **Sổ Tay Bút Viết**: *Dancing Script*
   - Thanh công cụ Word Ribbon: In đậm, nghiêng, gạch chân, gạch ngang, căn lề, danh sách đầu dòng, danh sách số.
   - Đếm số từ, số ký tự và thời gian đọc thời gian thực.

4. **Xuất Bản & Chia Sẻ**:
   - Tải file Word chuẩn `.docx` (mở tốt trên Microsoft Word, Google Docs, LibreOffice).
   - In ấn / Xuất file `.pdf` khổ giấy A4 sạch đẹp.
   - Sao chép Rich Text vào bộ nhớ tạm (Clipboard) để dán thẳng vào ứng dụng văn phòng.

5. **Giao Diện Hiện Đại & Trải Nghiệm Người Dùng**:
   - Hỗ trợ chế độ Sáng / Tối (Dark / Light Mode).
   - Tự động lưu bản nháp vào LocalStorage.
   - Âm thanh phản hồi tương tác nhẹ nhàng (Web Audio API).

---

## 🚀 Hướng Dẫn Khởi Chạy

Ứng dụng đang chạy sẵn tại:
```
http://localhost:5173/
```

Nếu muốn khởi động lại sau này, mở PowerShell tại thư mục này và chạy:
```powershell
npm run dev
```

Để chạy bản production có proxy OCR (sau khi build):
```powershell
npm run build
npm start
```
Mở `http://localhost:4173/`. Server Node đi kèm sẽ chuyển tiếp request `/api/handwriting` tới Google Handwriting API.

---

## ⌨️ Phím Tắt Tiện Lợi

- `Ctrl + Enter`: Chuyển đổi chữ viết tay thành văn bản Word
- `Ctrl + Z`: Hoàn tác nét vẽ (Undo)
- `Ctrl + Y`: Làm lại nét vẽ (Redo)
- `Ctrl + B`: In đậm chữ trong khung soạn thảo
- `Ctrl + I`: In nghiêng chữ trong khung soạn thảo
- `Ctrl + U`: Gạch chân chữ trong khung soạn thảo
