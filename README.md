# VocabFlow PWA

> Ứng dụng Progressive Web App (PWA) học từ vựng tiếng Anh Mobile-First dành cho iOS Safari và Android Chrome.

Chi tiết đặc tả kỹ thuật, kiến trúc và hướng dẫn sử dụng xem tại tài liệu: [VOCABFLOW.md](./VOCABFLOW.md).

## Bắt đầu nhanh

```bash
# Cài đặt thư viện
npm install

# Chạy server phát triển (mở truy cập LAN cho điện thoại)
npm run dev -- --host

# Đóng gói sản phẩm (Production build)
npm run build
```

## Tính năng cốt lõi

- **Flashcard 3D:** Cảm ứng vuốt lật thẻ và đánh giá ghi nhớ.
- **Trắc nghiệm 4 đáp án:** Phản xạ nhận diện từ vựng.
- **Ghép chữ cái:** Luyện chính tả và phát âm chuẩn bản xứ.
- **Đồng bộ dữ liệu:** Nhập và xuất định dạng tương thích với kho tài liệu `daily-english`.
- **Hỗ trợ Offline:** Cài đặt trực tiếp lên màn hình chính qua PWA.
