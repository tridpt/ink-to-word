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
   - Phân đoạn các nét vẽ thành dòng và gửi tới Google Handwriting IME để nhận diện tiếng Việt; kết quả phụ thuộc dịch vụ mạng và độ rõ của chữ.
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

6. **Công thức toán học**:
   - Chế độ toán có nhận diện cấu trúc 2D từ nét vẽ, mẫu/ký hiệu chèn nhanh và xem trước bằng KaTeX; kết quả có thể cần sửa LaTeX thủ công.
   - Có thể nhập Gemini API key để thử nhận diện bằng Vision (tùy chọn, gửi ảnh tới dịch vụ bên ngoài). Key lưu trong `sessionStorage` của trình duyệt, không gửi qua server của app.
   - Khi xuất `.docx`, công thức được ghi dưới dạng **chuỗi LaTeX**, chưa phải phương trình Word có thể chỉnh sửa trực quan. PDF dùng hộp thoại in của trình duyệt.

---

## 🚀 Hướng Dẫn Khởi Chạy

Yêu cầu Node.js và npm. Mở PowerShell tại thư mục dự án rồi chạy:
```powershell
npm install
npm run dev
```
Mở địa chỉ Vite hiển thị trong terminal (mặc định `http://localhost:5173/`).

Để chạy bản production có proxy OCR (sau khi build):
```powershell
npm run build
npm start
```
Mở `http://localhost:4173/`. Server Node đi kèm sẽ chuyển tiếp request `/api/handwriting` tới Google Handwriting API.

> Nhận diện chữ viết tay cần kết nối Internet: Vite và server production chuyển tiếp tới Google Handwriting IME; trình duyệt cũng có đường gọi trực tiếp dự phòng. Nhận diện ảnh tải lên và toán bằng Gemini cần key riêng, có thể phát sinh chi phí theo nhà cung cấp.

---

## ⌨️ Phím Tắt Tiện Lợi

- `Ctrl + Enter`: Chuyển đổi chữ viết tay thành văn bản Word
- `Ctrl + Z`: Hoàn tác nét vẽ (Undo)
- `Ctrl + Y`: Làm lại nét vẽ (Redo)
- `Ctrl + B`: In đậm chữ trong khung soạn thảo
- `Ctrl + I`: In nghiêng chữ trong khung soạn thảo
- `Ctrl + U`: Gạch chân chữ trong khung soạn thảo
