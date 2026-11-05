# HairMatch

Ứng dụng đặt lịch cắt tóc và tư vấn kiểu tóc bằng AI.

## Công nghệ

- Mobile: React Native, Expo, Expo Router, TypeScript.
- Backend: Node.js, Express, TypeScript.
- Dữ liệu: in-memory.
- AI: mock hoặc OpenAI.

## Giới hạn

- Không có database.
- Backend khởi động lại sẽ mất tài khoản, token và lịch hẹn đã tạo.
- Chạy một backend process.
- Mutex trong bộ nhớ không bảo vệ được nhiều backend instance.
- Một lịch hẹn chỉ chọn một dịch vụ.
- Chưa thanh toán trực tuyến.
- Chưa tạo ảnh thử kiểu tóc.
- Gợi ý AI chỉ mang tính tham khảo.

## Tài khoản demo

Admin:
- Số điện thoại: 0900000000
- Mật khẩu: Admin123!

Customer:
- Số điện thoại: 0911111111
- Mật khẩu: Customer123!

Đây chỉ là tài khoản phát triển.
Không sử dụng tài khoản demo khi đưa ứng dụng lên môi trường công khai.

## Backend

cd backend
npm install
cp .env.example .env
npm run dev

Windows có thể tự copy file .env.example thành .env.

## Mobile

Khởi tạo project Expo theo hướng dẫn trong bộ mã nguồn.
Sau đó chép các file mobile vào project.

Cài thư viện:

npx expo install expo-image-picker expo-image-manipulator expo-secure-store

Copy .env.example thành .env và sửa địa chỉ backend.

npx expo start

## Địa chỉ backend

Điện thoại thật:
http://IP_LAN_MAY_TINH:4000/api

Android emulator:
http://10.0.2.2:4000/api

iOS simulator chạy trên cùng máy:
http://localhost:4000/api

Điện thoại thật và máy tính cần kết nối được với nhau.
Mở cổng 4000 trong firewall nếu cần.

## AI

AI_MODE=mock:
- Không gọi AI thật.
- Kết quả luôn hiển thị nhãn minh họa.

AI_MODE=live:
- Cần OPENAI_API_KEY.
- Cần AI_MODEL hỗ trợ ảnh và Structured Outputs.
- Khi gọi AI thất bại, trả lỗi.
- Không giả kết quả mock thành kết quả thật.

Không đặt API key trong mobile.
Không commit .env.

## Test

cd backend
npm test
npm run typecheck

Các lệnh trên cần được chạy thực tế để xác nhận kết quả.

## Database sau này

Thay MemoryRepository bằng implementation database.
Giữ interface Repository.

Phần kiểm tra và tạo lịch phải được thiết kế lại thành thao tác
nguyên tử ở database, không chỉ giữ mutex trong RAM.

