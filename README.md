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
| **2** | **Trang chủ Khách hàng** | Tìm dịch vụ/thợ, lịch sắp tới ghim đầu, ưu đãi, đặt nhanh và lookbook dùng ảnh salon cung cấp | ✅ Hoàn thành |
| **3** | **AI Tư vấn kiểu tóc** | Chụp/chọn ảnh trực diện, khảo sát sở thích, trả về 3 gợi ý kiểu tóc, màu nhuộm, uốn, disclaimer an toàn | ✅ Hoàn thành 100% |
| **4** | **Chuyển từ AI sang Đặt lịch** | Bấm "Đặt lịch kiểu tóc này" trên kết quả AI -> tự động chuyển sang luồng đặt lịch và chọn dịch vụ | ✅ Hoàn thành 100% |
| **5** | **Đặt lịch & Chống trùng lịch** | 4 bước; tối đa 5 dịch vụ/lịch, cộng dồn giá và thời gian; thợ rảnh sớm nhất hoặc tự chọn; slot 30 phút trong 14 ngày; khoá Mutex chống trùng | ✅ Hoàn thành |
| **6** | **Quản lý lịch hẹn (Khách)** | Lịch sắp tới/lịch sử, mã nhận lịch, đổi/hủy trước 2 giờ kèm lý do, đặt lại, đánh giá và tải ảnh tóc | ✅ Hoàn thành |
| **7** | **Hồ sơ cá nhân (Khách)** | Họ tên, ngày sinh, hạng/điểm thành viên, voucher sinh nhật, đổi điểm, ví ưu đãi, nhật ký tóc và nhắn tin salon | ✅ Hoàn thành |
| **8** | **Dashboard Quản trị** | KPI ngày, doanh thu dự kiến/thực thu, lịch kế tiếp, trạng thái thợ; làm mới mỗi 15 giây | ✅ Hoàn thành |
| **9** | **Quản lý lịch hẹn (Admin)** | Timeline theo thợ/giờ, khách vãng lai, đổi lịch, chặn giờ, trạng thái đang phục vụ/không đến, ghi nhận thanh toán | ✅ Hoàn thành |
| **10** | **Quản lý Dịch vụ & Thợ** | Danh mục, giá ưu đãi, ảnh, quy trình; chức danh, kỹ năng, hoa hồng, đánh giá | ✅ Hoàn thành |
| **11** | **Quản lý ca làm việc** | Ca theo ngày, ca lặp trong khoảng ngày, đơn nghỉ chờ duyệt và khóa giờ nghỉ | ✅ Hoàn thành |
| **12** | **Bảo mật & Kiểm thử** | Múi giờ Asia/Ho_Chi_Minh, Rate limiting, không log ảnh, kiểm thử API quản trị | ✅ Hoàn thành |
| **13** | **Quản lý khách hàng (Admin)** | Hạng thành viên, ghi chú nội bộ, lịch sử tóc, chặn đặt lịch; ghi chú chỉ hiện ở Admin | ✅ Hoàn thành |
| **14** | **Ưu đãi & Thông báo** | Mã theo ngày/giờ/lượt dùng; thông báo đặt lịch, nhắc trước 2 giờ và 30 phút, tích điểm, mời đánh giá và chăm sóc sau 3 tuần | ✅ Cần cấu hình thiết bị cho push |
| **15** | **Báo cáo** | Doanh thu theo kỳ, dịch vụ, phương thức thanh toán, thợ, hoa hồng, giờ cao/thấp điểm và tỷ lệ quay lại | ✅ Hoàn thành |
| **16** | **Hỗ trợ** | Khách nhắn trong app, Admin xem và trả lời, khách nhận thông báo khi có phản hồi | ✅ Hoàn thành |

---

## 4. Tài khoản Demo sẵn có

Hệ thống đã nạp sẵn dữ liệu ban đầu phục vụ chạy thử và chấm bài:

- **Tài khoản Quản trị viên (Chủ tiệm)**:
  - Định danh: `0900000000` (hoặc email: `admin@hairmatch.vn`)
  - Mật khẩu: `Admin123!`
  - Vai trò: `admin` (toàn quyền quản trị salon, xem giá trị lịch hoàn thành, duyệt lịch hẹn)
- **Tài khoản Khách hàng**:
  - Định danh: `0911111111` (hoặc email: `customer@hairmatch.vn`)
  - Mật khẩu: `Customer123!`
  - Vai trò: `customer` (đặt lịch, AI tư vấn kiểu tóc, quản lý lịch của mình)
- **Khách mẫu trong CRM**: `lan.anh@hairmatch.vn` (Lan Anh) và `hoang.nam@hairmatch.vn` (Hoàng Nam), cùng dùng mật khẩu `Customer123!`.

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
  Điền `EXPO_PUBLIC_SALON_ADDRESS` và `EXPO_PUBLIC_SALON_PHONE` trong `mobile/.env` để hiện nút chỉ đường và gọi salon. Để trống thì hai nút này ẩn, tránh dùng địa chỉ/số điện thoại mẫu.
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

Kiểm tra hiện tại: `npm test` chạy bộ test backend, `npm run typecheck` kiểm tra TypeScript. Bộ test quản trị bao gồm lọc và chuyển trạng thái lịch, phân quyền, CRUD dịch vụ/thợ, ca nối tiếp/chồng lấn và bảo vệ lịch đang hiệu lực.

### API quản trị bổ sung

- `GET /api/admin/appointments`: `date`, `from`, `to`, `barberId`, `status`, `q` (tên khách, điện thoại hoặc mã lịch).
- `POST /api/admin/appointments` và `PATCH /api/admin/appointments/:id`: thêm lịch cho khách có tài khoản hoặc đổi lịch sang khung giờ hợp lệ còn trống.
- `POST /api/admin/appointments` cũng nhận `walkInName`/`walkInPhone` cho khách vãng lai; `voucherCode` tùy chọn.
- `PATCH /api/admin/appointments/:id/status`: trạng thái `in_progress`, `no_show`; khi hủy cần `cancelReason`, khi hoàn thành có thể ghi `payment.method` và `payment.amount`.
- `GET /api/admin/dashboard-live`: KPI, lịch sắp tới và trạng thái thợ; giao diện tự gọi lại mỗi 15 giây.
- `GET /api/admin/reports`: lọc `from`, `to`, phân tích doanh thu, thanh toán, thợ, dịch vụ, giờ đặt và khách quay lại.
- `GET/POST/DELETE /api/admin/blocks`, `GET/POST/PATCH /api/admin/leaves`, `GET/POST/DELETE /api/admin/weekly-shifts`: chặn giờ, duyệt nghỉ và tạo ca lặp.
- `GET/POST/PATCH/DELETE /api/admin/vouchers`: mã ưu đãi có giới hạn thời gian và lượt dùng.
- `GET/POST /api/admin/notifications`, `GET /api/notifications/me`, `POST/DELETE /api/push-tokens`: gửi/xem thông báo, đăng ký token thiết bị. Backend kiểm tra lịch mỗi phút và gửi nhắc lịch trong vòng 2 giờ trước giờ hẹn.
- `GET/POST/PATCH/DELETE /api/admin/customers`: quản lý tài khoản khách; chỉ xóa được khách chưa từng có lịch.
- `GET /api/admin/statistics?from=YYYY-MM-DD&to=YYYY-MM-DD`: số lịch theo trạng thái và `completedValue`, tính theo ngày phục vụ ở `Asia/Ho_Chi_Minh`; có danh sách lịch hôm nay và lịch chờ xử lý.
- `GET /api/admin/services` và `/api/admin/barbers`: thêm `futureAppointmentCount` để cảnh báo trước khi tạm ngừng.
- `DELETE /api/admin/services/:id?permanent=true` và `/api/admin/barbers/:id?permanent=true`: xóa hẳn mục chưa từng có lịch hẹn; DELETE không có tham số tiếp tục tạm ngừng.
- `GET /api/admin/work-schedules`: lọc `barberId`, `from`, `to`; mỗi ca có `activeAppointmentCount`.
- `POST /api/appointments`: chỉ lưu `aiSuggestion` khi khách chọn gửi gợi ý AI cùng lịch. Không lưu ảnh khuôn mặt vào lịch.
- `POST /api/appointments`: nhận `serviceIds` (1–5 dịch vụ), `note`, `styleName`; tổng thời lượng được kiểm tra khi tìm slot và tạo lịch. `/api/availability` nhận `serviceIds` ngăn cách bằng dấu phẩy.
- `PATCH /api/appointments/:id/reschedule`, `PATCH /api/appointments/:id/cancel`: khách tự đổi/hủy lịch trước giờ hẹn ít nhất 2 giờ; hủy cần `reason`.
- `GET /api/vouchers/me`, `POST /api/loyalty/redeem`: mã cá nhân và đổi 100 điểm lấy mã 50.000đ; mỗi 10.000đ thực thu được 1 điểm.
- `POST /api/support/messages`, `GET /api/support/messages/me`, `GET /api/admin/support/messages`, `PATCH /api/admin/support/messages/:id/reply`: hộp tin nhắn khách và phản hồi Admin.
- `GET /api/barbers`: trả điểm đánh giá và portfolio chỉ gồm ảnh/kiểu tóc khách đã đồng ý chia sẻ.
- `/api/availability` và đặt lịch khách chỉ cho phép 14 ngày tới. Sinh nhật tạo voucher cá nhân giảm 10%, hiệu lực 14 ngày.

---

## 7. Giới hạn phiên bản MVP & Hướng mở rộng

- **Lưu trữ in-memory**: Bản demo lưu dữ liệu trong bộ nhớ để chấm bài nhanh không cần cài PostgreSQL/MySQL. Khi server khởi động lại, dữ liệu quay về trạng thái seed ban đầu.
- **Tích hợp Database giai đoạn 2**: Đã chuẩn bị sẵn interface `Repository` (`backend/src/repository.ts`) để cắm Prisma/TypeORM/Mongoose mà không cần sửa đổi các controllers và services.
- **Chưa có cổng thanh toán trực tuyến**: Admin ghi nhận số tiền thực thu và phương thức tiền mặt/chuyển khoản/thẻ sau khi phục vụ; ứng dụng chưa tự đối soát giao dịch.
- **Khách thanh toán tại salon**: Màn xác nhận chưa cho chọn thanh toán trước vì chưa tích hợp cổng thanh toán. Đăng nhập OTP cần nhà cung cấp SMS; bản demo hiện dùng mật khẩu. Zalo/Messenger cần tài khoản chính thức của salon, còn nhắn tin trong app đã hoạt động.
- **Push trên thiết bị thật**: Cần EAS project ID (`EXPO_PUBLIC_EAS_PROJECT_ID` trong `mobile/.env`) và thông tin ký/push credentials của Android/iOS. Web chỉ dùng hộp thông báo trong ứng dụng. Dịch vụ Expo nhận push không đồng nghĩa thiết bị đã hiển thị thành công; bản MVP chưa kiểm tra push receipts.
- **Một chi nhánh**: Chưa có dữ liệu chi nhánh nên bộ lọc chi nhánh chưa xuất hiện.
- **Tạo ảnh tóc mô phỏng**: AI hiện tại phản hồi tư vấn bằng văn bản chi tiết; giai đoạn sau có thể tích hợp mô hình Image-to-Image inpainting để ghép tóc trực tiếp vào khuôn mặt khách.
