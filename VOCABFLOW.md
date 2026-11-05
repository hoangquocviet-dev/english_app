# VocabFlow PWA

Ứng dụng Progressive Web App (PWA) hỗ trợ học từ vựng tiếng Anh trên thiết bị di động (tối ưu hóa cho iOS Safari và Android Chrome). Ứng dụng chạy theo mô hình Local-first, lưu trữ toàn bộ dữ liệu trên trình duyệt của người dùng, hỗ trợ học offline và tương thích đồng bộ dữ liệu với kho tài liệu học tiếng Anh hàng ngày (`daily-english`).

---

## 1. Thông tin tổng quan

- **Tên ứng dụng:** VocabFlow PWA
- **Loại ứng dụng:** Mobile-First Progressive Web App (Standalone SPA)
- **Đường dẫn thư mục dự án:** `C:\gehihi\projects\vocab-flashcard-pwa`
- **Mục tiêu:**
  - Cung cấp trải nghiệm học từ vựng trực quan, phản xạ nhanh và luyện tập ngữ âm trên điện thoại.
  - Hỗ trợ cài đặt trực tiếp vào màn hình chính (Add to Home Screen) mà không cần qua App Store hoặc Google Play.
  - Vận hành hoàn toàn miễn phí, không yêu cầu máy chủ cơ sở dữ liệu riêng.

---

## 2. Kiến trúc kỹ thuật

- **Framework:** React 19, TypeScript, Vite
- **Giao diện & Bố cục:** Tailwind CSS v4, Lucide Icons (SVG chuyên dụng, không dùng emoji màu sắc)
- **Hiệu ứng cử chỉ:** Touch Event Engine kết hợp CSS 3D Transforms (`perspective`, `rotateX`)
- **PWA & Bộ nhớ đệm:** `vite-plugin-pwa`, Service Worker hỗ trợ truy cập offline
- **Âm thanh & Phát âm:**
  - Web Audio API (`AudioContext`): Tổng hợp trực tiếp hiệu ứng âm thanh (xác nhận, cảnh báo) qua dao động sóng âm, không phụ thuộc file mp3 tĩnh.
  - Web Speech API (`SpeechSynthesis`): Đọc phát âm chuẩn giọng bản xứ (US/UK) với cơ chế fallback linh hoạt trên iOS và Android.
- **Lưu trữ dữ liệu:** `LocalStorage` có lớp bọc xử lý lỗi an toàn (Safe Storage Wrapper) và cơ chế tự động sao lưu.
- **Tra cứu từ điển:** Free Dictionary API (gợi ý IPA, từ loại, câu ví dụ).

---

## 3. Các phân hệ chức năng chính

### 3.1. Phân hệ Luyện tập (Practice)
Bao gồm 3 chế độ học tập tùy chọn cho từng bộ từ vựng:

1. **Flashcard 3D:**
   - Mặt trước hiển thị từ tiếng Anh, từ loại và nút nghe phát âm.
   - Thao tác vuốt LÊN (Swipe Up) lật thẻ 180° để xem phiên âm IPA, nghĩa tiếng Việt và câu ví dụ.
   - Vuốt PHẢI (hoặc nút xác nhận): Đánh dấu từ đã thuộc và chuyển tiếp.
   - Vuốt TRÁI (hoặc nút ôn tập): Đánh dấu từ chưa nhớ, tự động xếp lại vào cuối danh sách bài học.

2. **Trắc nghiệm 4 đáp án (Quiz):**
   - Hiển thị từ vựng kèm phát âm.
   - Tạo ngẫu nhiên 4 lựa chọn nghĩa tiếng Việt dựa trên danh sách từ trong bộ (áp dụng thuật toán Fisher–Yates).
   - Khóa tương tác ngay khi người dùng chọn đáp án; phản hồi trực quan bằng màu sắc và âm thanh.

3. **Ghép chữ cái (Spelling Tiles):**
   - Xáo trộn các chữ cái thành các ô phím riêng biệt.
   - Tự động điền trước dấu cách và các ký tự đặc biệt (dấu gạch nối, dấu nháy đơn).
   - Khi ghép hoàn chỉnh và chính xác: Phát âm thanh xác nhận và tự động kích hoạt giọng đọc tiếng Anh bản xứ.
   - Khi ghép sai: Kích hoạt hiệu ứng rung cảnh báo và cho phép người dùng hoàn tác để thử lại.

### 3.2. Phân hệ Thêm từ mới (Add Word)
- Tra cứu nhanh qua Free Dictionary API để lấy phiên âm IPA và ví dụ.
- Trường nhập nghĩa tiếng Việt do người dùng tự quản lý và chỉnh sửa theo ngữ cảnh học tập thực tế.
- Tự động kiểm tra trùng lặp từ vựng trong cùng một bộ thẻ.

### 3.3. Phân hệ Quản lý Kho từ & Đồng bộ (Library & Sync)
- Quản lý danh sách các bộ từ có sẵn (IT & Development, Office & Workplace, Core Daily Words) và các bộ từ do người dùng tự tạo.
- Hỗ trợ nhập và xuất dữ liệu tương thích hai chiều với định dạng dòng của `C:\gehihi\projects\daily-english`:
  ```text
  Word [/IPA/]: Nghĩa tiếng Việt
  ```
- Bộ phân tích cú pháp (Parser) xử lý tốt các trường hợp từ phức, từ có chú thích ngoặc đơn và định dạng không chứa IPA.

---

## 4. Hướng dẫn vận hành & Triển khai

### 4.1. Chạy môi trường phát triển (Local Development)
```bash
# Cài đặt thư viện phụ thuộc
npm install

# Khởi chạy server nội bộ (hỗ trợ truy cập qua mạng LAN từ điện thoại)
npm run dev -- --host
```

### 4.2. Đóng gói ứng dụng (Production Build)
```bash
npm run build
```
Toàn bộ mã nguồn sẽ được biên dịch vào thư mục `dist/`, sẵn sàng đưa lên môi trường hosting tĩnh.

### 4.3. Triển khai miễn phí (Deployment)
- **Vercel / Cloudflare Pages / Netlify:** Kết nối trực tiếp với Git repository hoặc tải thư mục `dist/` lên.
- **Yêu cầu kết nối:** Cung cấp sẵn chứng chỉ HTTPS bảo mật để Service Worker và tính năng PWA Standalone hoạt động chuẩn xác trên Safari và Chrome.
