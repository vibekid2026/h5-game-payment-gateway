# H5 Game Payment Gateway (Universal Payment Component)

Một bộ API Component độc lập, hiệu năng cao, chuyên biệt hóa cho việc tự động xử lý thanh toán và nạp tiền cho các dòng game H5 / Web Game / Mobile Game.

## Tính Năng Chính
- 🚀 **Auto Xử Lý Thanh Toán (Automated Payment Processing):** Tự động sinh mã thanh toán, mã QR VietQR (Napas247) và lắng nghe Webhook ngân hàng tức thì.
- 🏦 **Tích hợp SePay Adapter:** Tương thích 100% chuẩn Webhook của SePay (hỗ trợ MBBank, Vietcombank, ACB, TPBank, Techcombank, VPBank, MSB, OCB...).
- 🔄 **Game Dispatcher & Retry Queue:** Tự động bắn Callback an toàn (kèm mã hóa chữ ký HMAC-SHA256) sang Server Game để cộng tiền/vàng/KNB cho người chơi.
- ⚡ **Realtime Server-Sent Events (SSE):** Giao diện H5 tự động cập nhật trạng thái "Thanh toán thành công" ngay khi tiền về tài khoản mà không cần polling liên tục.
- 🛡️ **Bảo Mật & Idempotency:** Chống duplicate webhook (ngăn cộng tiền 2 lần), chống giả mạo IP và chống replay attack.
- 🧪 **Interactive Sandbox / Test Dashboard:** Tích hợp sẵn giao diện Web Test trực quan tại `/test` để giả lập nạp tiền và kiểm thử quy trình mà không cần tiền thật.
- 📦 **Multi-language SDK:** Cung cấp sẵn SDK PHP và JS Widget nhúng 1 dòng code vào mọi Game H5.
