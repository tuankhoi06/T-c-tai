# HairMatch — Ứng Dụng Đặt Lịch Cắt Tóc & AI Tư Vấn Kiểu Tóc

> **Bài tập lớn cuối kỳ môn Lập trình ứng dụng di động**  
> Mô hình: Một salon tóc cao cấp với 2 vai trò **Khách hàng** và **Quản trị viên (Chủ tiệm)**.

---

## 1. Công nghệ & Kiến trúc hệ thống

- **Frontend Mobile**: React Native (Expo SDK 52), Expo Router, TypeScript, Expo ImagePicker, Expo SecureStore. Hỗ trợ chạy trên **iOS**, **Android** và **Web**.
- **Backend API**: Node.js, Express, TypeScript, Zod Schema Validation, Sharp Image Processing, Mutex Concurrency Control (`async-mutex`), Rate Limiting, Helmet Security Headers.
- **Tầng dữ liệu (In-Memory Repository)**: Thiết kế theo mẫu Repository Pattern (`backend/src/repository.ts`), cho phép cắm Database thật (PostgreSQL / MongoDB) ở giai đoạn sau mà không làm thay đổi tầng nghiệp vụ.
- **AI Tư vấn kiểu tóc**: Tích hợp OpenAI Responses API (Structured Outputs) hỗ trợ 2 chế độ:
  - `mock`: Dữ liệu minh họa an toàn, dùng để test & demo không tốn chi phí.
  - `live`: Gọi trực tiếp model đa phương thức (GPT-4o / GPT-4o-mini) phân tích ảnh trực diện và trả về kết quả chuẩn theo schema.

---

## 2. Cấu trúc mã nguồn

```text
hairmatch/
├── README.md                           # Tài liệu hướng dẫn cài đặt & nghiệp vụ
├── .gitignore                          # Loại trừ node_modules, .env, build cache
├── shared/                             # Kiểu dữ liệu dùng chung
│   └── types/
│       └── index.ts                    # User, Appointment, Barber, HairService, AI Consultation types
├── mobile/                             # Ứng dụng di động React Native Expo
│   ├── app/
│   │   ├── _layout.tsx                 # Cấu hình Stack & StatusBar Dark/Gold
│   │   └── index.tsx                   # Cổng phân luồng Auth (Khách / Admin) & Điều hướng
│   ├── src/
│   │   ├── Customer.tsx                # Giao diện Khách hàng (4 tabs: Home, AI, Lịch hẹn, Hồ sơ)
│   │   ├── Consultation.tsx            # Chụp/chọn ảnh, khảo sát & kết quả AI kèm nút đặt lịch
│   │   ├── Admin.tsx                   # Quản trị viên (Thống kê, Duyệt lịch, Dịch vụ, Thợ, Ca làm)
│   │   ├── api.ts                      # Client gọi REST API & SecureStore lưu JWT Token
│   │   ├── ui.tsx                      # Design System Dark/Gold, Formatters, Components
│   │   └── types.ts                    # Re-export các kiểu dữ liệu
│   ├── app.json                        # Cấu hình Expo
│   ├── package.json
│   └── tsconfig.json
└── backend/                            # Máy chủ REST API Express TypeScript
    ├── src/
    │   ├── server.ts                   # Điểm khởi chạy server (port 4000)
    │   ├── app.ts                      # Cấu hình Express app, Middleware & Routes
    │   ├── config.ts                   # Biến môi trường & múi giờ Asia/Ho_Chi_Minh
    │   ├── security.ts                 # Scrypt Password Hash, JWT Bearer Token, Mutex
    │   ├── errors.ts                   # AppError & Error Handling Middleware
    │   ├── models.ts                   # Entity models & Session interface
    │   ├── repository.ts               # In-Memory Repository & Mock Seeding Data
    │   ├── booking.ts                  # Nghiệp vụ đặt lịch, kiểm tra trống, Mutex chống trùng
    │   ├── ai.ts                       # OpenAI Structured Outputs Provider & Mock Provider
    │   └── tests/
    │       ├── booking.test.ts         # Unit test đặt lịch & chống xung đột khung giờ
    │       └── security_and_ai.test.ts # Test phân quyền & xử lý lỗi AI / Validation
    ├── package.json
    └── tsconfig.json
```

---

## 3. Bảng đối chiếu tính năng đã triển khai

| STT | Phân hệ / Nghiệp vụ | Yêu cầu | Trạng thái triển khai |
| :--- | :--- | :--- | :--- |
| **1** | **Xác thực & Phân quyền** | Phân luồng Khách hàng & Admin riêng biệt, Đăng ký bằng SĐT/Email, Quên mật khẩu demo, Hash mật khẩu Scrypt | ✅ Hoàn thành 100% |
| **2** | **Trang chủ Khách hàng** | Giới thiệu salon, danh sách dịch vụ kèm giá & thời lượng, danh sách thợ, nút đặt lịch nhanh | ✅ Hoàn thành 100% |
| **3** | **AI Tư vấn kiểu tóc** | Chụp/chọn ảnh trực diện, khảo sát sở thích, trả về 3 gợi ý kiểu tóc, màu nhuộm, uốn, disclaimer an toàn | ✅ Hoàn thành 100% |
| **4** | **Chuyển từ AI sang Đặt lịch** | Bấm "Đặt lịch kiểu tóc này" trên kết quả AI -> tự động chuyển sang luồng đặt lịch và chọn dịch vụ | ✅ Hoàn thành 100% |
| **5** | **Đặt lịch & Chống trùng lịch** | Chọn Dịch vụ → Thợ → Ngày → Khung giờ trống (`/availability`), khoá Mutex chống race-condition | ✅ Hoàn thành 100% |
| **6** | **Quản lý lịch hẹn (Khách)** | Xem chi tiết, theo dõi 4 trạng thái (chờ xác nhận, đã xác nhận, hoàn thành, đã hủy), hủy lịch hợp lệ | ✅ Hoàn thành 100% |
| **7** | **Hồ sơ cá nhân (Khách)** | Xem & cập nhật họ tên, số điện thoại, email, đăng xuất an toàn | ✅ Hoàn thành 100% |
| **8** | **Dashboard Quản trị** | Thống kê tổng số lịch hẹn, lịch chờ duyệt, đã xác nhận, hoàn thành, doanh thu thực tế | ✅ Hoàn thành 100% |
| **9** | **Quản lý lịch hẹn (Admin)** | Lọc lịch theo ngày/trạng thái, duyệt xác nhận, đánh dấu hoàn thành, hủy lịch | ✅ Hoàn thành 100% |
| **10** | **Quản lý Dịch vụ & Thợ** | Thêm mới, chỉnh sửa thông tin, bật/tắt ngừng hoạt động mà không xoá mất lịch sử | ✅ Hoàn thành 100% |
| **11** | **Quản lý ca làm việc** | Thêm và phân ca làm việc cho từng thợ theo ngày và khung giờ | ✅ Hoàn thành 100% |
| **12** | **Bảo mật & Kiểm thử** | Múi giờ Asia/Ho_Chi_Minh, Rate limiting, không log ảnh, kiểm thử tự động 9/9 tests pass | ✅ Hoàn thành 100% |

---

## 4. Tài khoản Demo sẵn có

Hệ thống đã nạp sẵn dữ liệu ban đầu phục vụ chạy thử và chấm bài:

- **Tài khoản Quản trị viên (Chủ tiệm)**:
  - Định danh: `0900000000` (hoặc email: `admin@hairmatch.vn`)
  - Mật khẩu: `Admin123!`
  - Vai trò: `admin` (toàn quyền quản trị salon, xem thống kê doanh thu, duyệt lịch hẹn)
- **Tài khoản Khách hàng**:
  - Định danh: `0911111111` (hoặc email: `customer@hairmatch.vn`)
  - Mật khẩu: `Customer123!`
  - Vai trò: `customer` (đặt lịch, AI tư vấn kiểu tóc, quản lý lịch của mình)

*(Bạn cũng có thể bấm "Đăng ký tài khoản mới" trên app để tạo khách hàng mới bằng số điện thoại hoặc email bất kỳ).*

---

## 5. Hướng dẫn cài đặt & Khởi chạy

### Bước 1: Khởi động Backend (Express + TypeScript)

```bash
cd backend
npm install
npm run dev
```

Server sẽ lắng nghe tại: `http://localhost:4000`.

### Bước 2: Cấu hình địa chỉ Backend cho Mobile

Tạo file `mobile/.env` từ file mẫu `mobile/.env.example`:

- **Nếu chạy trên Web local (trên máy tính)**:
  ```env
  EXPO_PUBLIC_API_URL=http://localhost:4000/api
  ```
- **Nếu chạy trên Android Emulator**:
  ```env
  EXPO_PUBLIC_API_URL=http://10.0.2.2:4000/api
  ```
- **Nếu chạy trên điện thoại thật (qua Expo Go)**:
  Tìm địa chỉ IPv4 máy tính (ví dụ `192.168.1.15` bằng lệnh `ipconfig`) và cấu hình:
  ```env
  EXPO_PUBLIC_API_URL=http://192.168.1.15:4000/api
  ```
  *(Đảm bảo điện thoại và máy tính kết nối chung mạng Wi-Fi và tường lửa cho phép cổng 4000).*

### Bước 3: Khởi động Mobile (Expo)

```bash
cd mobile
npm install
npx expo start
```

- Bấm phím **`w`** để mở ngay trên trình duyệt web (`http://localhost:8081`).
- Bấm phím **`a`** để mở trên Android Emulator.
- Quét mã QR bằng ứng dụng **Expo Go** trên điện thoại iOS/Android.

---

## 6. Chạy Kiểm Thử Tự Động (Automated Tests)

Chạy bộ kiểm thử backend bao gồm:
1. Nhận biết chồng lấn và cho phép lịch nối tiếp nhau.
2. Hai yêu cầu đặt lịch đồng thời trên cùng khung giờ chỉ một yêu cầu thành công (Mutex anti-collision).
3. Chặn đặt lịch trong quá khứ hoặc ngoài ca làm việc.
4. Phân quyền: Khách hàng không thể hủy lịch của khách hàng khác.
5. Bảo vệ phân quyền: Không cho phép người đăng ký tự gán quyền admin.
6. Xử lý lỗi AI: Từ chối ảnh không hợp lệ, kiểm tra bắt buộc đồng ý gửi ảnh (`consent = true`).
7. Kiểm tra dữ liệu tư vấn Mock trả về đầy đủ 3 kiểu tóc, uốn, nhuộm và disclaimer an toàn.

```bash
cd backend
npm test
npm run typecheck
```

Kết quả: **9/9 test cases passed** (100% pass), **0 lỗi TypeScript**.

---

## 7. Giới hạn phiên bản MVP & Hướng mở rộng

- **Lưu trữ in-memory**: Bản demo lưu dữ liệu trong bộ nhớ để chấm bài nhanh không cần cài PostgreSQL/MySQL. Khi server khởi động lại, dữ liệu quay về trạng thái seed ban đầu.
- **Tích hợp Database giai đoạn 2**: Đã chuẩn bị sẵn interface `Repository` (`backend/src/repository.ts`) để cắm Prisma/TypeORM/Mongoose mà không cần sửa đổi các controllers và services.
- **Chưa có thanh toán trực tuyến**: Phiên bản đầu ghi nhận thanh toán tiền mặt trực tiếp tại tiệm sau khi hoàn thành dịch vụ.
- **Tạo ảnh tóc mô phỏng**: AI hiện tại phản hồi tư vấn bằng văn bản chi tiết; giai đoạn sau có thể tích hợp mô hình Image-to-Image inpainting để ghép tóc trực tiếp vào khuôn mặt khách.
