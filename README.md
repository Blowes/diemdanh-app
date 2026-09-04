# Điểm Danh (Ban Giáo Lý) — App di động (Android + iOS)

App wrap chức năng web `bglmautam.com` bằng **Capacitor** — **1 source code** build ra cả **APK** (Android) và **IPA** (iPhone). Giao diện native, gọi thẳng API `api.bglmautam.com` để bạn thêm tính năng ngay trong app, không cần deploy lại web production.

- **App ID:** `com.bglmautam.app` · **Tên:** Điểm Danh · **Phiên bản:** 1.1 (versionCode 2)
- **Frontend:** HTML/CSS/JS thuần trong `www/` (không framework → build nhẹ, nhanh)
- **Theme:** Sáng / Tối (hệ slate) / Theo hệ thống (đổi trong tab **Tôi**) · **màu chủ đạo theo lớp đang dạy** (khăn): Khai Tâm hồng · Rước Lễ xanh lá · Thêm Sức xanh dương · Bao Đồng vàng

---

## 1. Chức năng

UX kiểu app-native (bottom-nav), khác hẳn web, giữ 100% chức năng gốc.

- **Trang chủ**: thẻ chào + niên khóa, lối tắt "Điểm danh nhanh" cho lớp mình phụ trách
- **Lớp học**: danh sách lớp (lọc theo tên), chi tiết lớp gồm 3 tab
  - *Thiếu nhi*: sĩ số theo trạng thái, điểm số, chuyên cần, SĐT phụ huynh
  - *Điểm danh*: **2 chế độ** (xem mục dưới)
  - *Giáo lý viên*: danh sách GLV của lớp
- **Giáo lý viên**: toàn bộ GLV trong năm (lọc theo tên) → hồ sơ + hành trình
- **Tôi**: hồ sơ, cấu hình cử chỉ quẹt, đổi theme (Sáng/Tối/Hệ thống), đổi thông tin đăng nhập, đăng xuất
- **Tìm kiếm** người theo tên
- **Số điện thoại** bấm ra Gọi / SMS / Zalo
- **Sửa kết quả học** của thiếu nhi (bấm nhãn trạng thái)
- **Đăng nhập**: lưu tài khoản, báo lỗi/thành công tại chỗ, thanh loading %, sẵn sàng vân tay/FaceID

### Điểm danh — 2 chế độ
1. **Cột** (mặc định): danh sách từng em, bấm để chọn trạng thái; thống kê realtime; nút **Xác nhận** gửi batch lên server (POST/PUT/DELETE theo từng người).
2. **Quẹt** (Tinder, toàn màn hình): mỗi em 1 thẻ, vuốt để gán trạng thái.
   - Mặc định: **↑ Hiện Diện · ↓ Vắng Lễ · ← Có Phép · → Báo Trễ · Chạm đôi Không Phép**
   - **Tùy chỉnh** mapping trong *Tôi → Cử chỉ quẹt* (hoặc nút ⚙ khi quẹt), có Hoàn tác.
   - Quẹt xong → tự sang chế độ Cột để soát lại rồi Xác nhận.

### Mới trong v1.1
- **Logo & tên app**: icon launcher / splash Android dùng logo giáo xứ, tên hiển thị **Điểm Danh**, màn khởi động có logo.
- **Niên khóa theo lớp**: mở lớp năm cũ từ *Hành trình* hiện đúng niên khóa của lớp (không còn hiện năm hiện tại); lịch Chúa Nhật cũng theo năm đó.
- **Xuất bảng điểm danh** (tab Điểm danh): khi điểm đủ cả lớp hoặc vừa Xác nhận xong, hiện ô vàng lấp lánh → ảnh PNG (Tên thánh · Họ tên · Ngày · Trạng thái, tóm tắt, màu theo lớp) → *Lưu ảnh / Gửi phụ huynh* (share sheet, Zalo…) hoặc *Sao chép dạng văn bản*.
- **Chuỗi học** (ô thứ 6 trong Chuyên cần, đốm lửa kiểu streak): số buổi học liên tiếp. Cấp độ lửa: 3 **Hiền lành** (đỏ) · 5 **Ngoan** (xanh, to hơn) · 7 **Hy sinh** (7 màu) · 10 **Dấn thân** (7 màu + quầng sáng, cao nhất); từ cấp 3 có tàn lửa bay. Nút **Khoe chuỗi** tạo ảnh chúc mừng (avatar · tên thánh · họ tên · ngọn lửa lớn · số buổi) để gửi phụ huynh. Chuỗi tính mọi ngày đã điểm danh (kể cả ngày sau hôm nay). Tuần **cả lớp không điểm danh** = tuần nghỉ, không mất chuỗi. Bấm vào xem lịch sử, *Khôi phục chuỗi*, đánh dấu *Tuần nghỉ cả lớp* / *Bỏ qua ngày này*. Quy tắc cộng/giữ/mất theo trạng thái: *Tôi → Tiện ích → Chuỗi học* (mặc định: Hiện Diện, Báo Trễ cộng · Vắng Lễ giữ · Có Phép, Không Phép, Nghỉ Luôn mất). Dữ liệu điều chỉnh lưu trên máy.
- **Cột điểm danh**: bộ lọc theo trạng thái (Tất cả · Chưa điểm · Hiện Diện · …) và **Đặt tất cả** — gán 1 trạng thái cho toàn bộ em đang hiển thị (ví dụ lọc *Chưa điểm* → Đặt tất cả *Hiện Diện*), vẫn cần Xác nhận để gửi.
- **Nền chính** là ảnh rừng thông hoàng hôn (`www/assets/bg-login.jpg`) cố định sau toàn app, phủ mờ theo theme sáng/tối và nhuộm theo màu lớp; appbar/nav kính mờ.
- **Font nhúng sẵn** (`www/assets/fonts`, Be Vietnam Pro + Bricolage Grotesque, latin + vietnamese) — không phụ thuộc mạng, không lỗi font khi offline.
- **Thông báo trong app** (chuông góc phải, badge số chưa đọc): lưu điểm danh thành công / lỗi, đạt mốc chuỗi (3, 5, 10, 15…), mất chuỗi; bấm nhảy tới đúng lớp / thiếu nhi; *Xoá tất cả*. Lưu trên máy theo tài khoản.

## 2. Thêm tính năng mới

Toàn bộ API ở `www/js/api.js` (`window.BGL`). Sửa `www/js/app.js`, chạy `npx cap sync` rồi build lại — **không đụng web production**.

> Lưu ý API: tài khoản GLV chỉ thấy điểm danh của **niên khóa hiện tại** (năm cũ trả về rỗng); `v1/academic_years` (danh sách) bị 403 nên năm cũ dùng khoảng 20/08 → 20/06 suy từ `classroom.year`.

## 2b. Đã research — chức năng web có thể thêm vào app

Payload đã dò sẵn, thêm nhanh khi cần:

| Chức năng | Endpoint |
|---|---|
| **Điểm số** (Giữa/Cuối HK1, HK2) | `POST v1/grades {grade:{name,value,enrollment_id}}` · `PUT v1/grades/{id}` |
| **Nhận xét** thiếu nhi/GLV | `POST v1/evaluations {evaluation:{content,evaluable_type,evaluable_id}}` · `PUT v1/evaluations/{id}` |
| **Sửa hồ sơ** người | `PUT v1/people/{id} {person:{...}}` |
| **Thêm thiếu nhi vào lớp** | `POST v1/enrollments {enrollment:{person_id,classroom_id}}` |
| Đổi kết quả học | `PUT v1/enrollments/{id} {enrollment:{result}}` *(đã có trong app)* |

Chỉ admin/super-admin: `dashboard/*`, `teacher-attendances`, `custom_export` (PDF/Excel) — tài khoản GLV bị 403.

## 3. Backend API (đã khảo sát & test thật)

- Base: `https://api.bglmautam.com`
- Header bắt buộc: `X-Api-Client-Key: 787ec34e0946e14880486a94ae8140ec7d2de0cfd1986228af62d01304837c13`
- Auth: cookie **HttpOnly** (`access_token` ~15', `refresh_token` ~7 ngày), `credentials: include`. App dùng **CapacitorHttp** (HTTP native) nên cookie hoạt động dù origin app là `localhost` (fetch trên web thường sẽ bị chặn bởi `SameSite=Strict`).

Endpoint chính:

```
POST  v1/auth/login            {username, password}
POST  v1/auth/logout
GET   v1/auth/me
POST  v1/auth/refresh
GET   v1/academic_years/current
GET   v1/classrooms?filters[year_eq]=2026
GET   v1/classrooms/{id}
GET   v1/classrooms/{id}/enrollments          # danh sách thiếu nhi
GET   v1/enrollments?filters[classroom_id_eq]=
PUT   v1/enrollments/{id}       {enrollment:{result}}
GET   v1/attendances?classroom_id=&start_date=&end_date=
POST  v1/attendances            {attendance:{attendable_type:"Enrollment", attendable_id, date, status}}
PUT   v1/attendances/{id}        {attendance:{status}}
DELETE v1/attendances/{id}
GET   v1/teaching_assignments?filters[classroom_year_eq]=2026   # danh sách GLV
GET   v1/teaching_assignments?filters[person_id_eq]=            # hành trình
GET   v1/people/{id}
PUT   v1/users/{id}             {user:{username, password, password_confirmation}}
GET   v1/resource_types/attendance_status | enrollment_result | teaching_assignment_position
GET   v1/search?q=
```

Trạng thái điểm danh: `Hiện Diện, Vắng Lễ, Có Phép, Báo Trễ, Không Phép, Nghỉ Luôn`
Kết quả học: `Đang Học, Nghỉ Luôn, Lên Lớp, Học Lại, Chuyển Xứ`

---

## 4. Build

### Yêu cầu
- Node ≥ 18, npm
- **Android:** JDK 17 + Android SDK (platform 34, build-tools 34)
- **iOS:** macOS + Xcode + CocoaPods (bắt buộc, chỉ có trên máy Mac)

```bash
npm install
npx cap sync
```

### Android → APK (build tại máy)
```bash
export JAVA_HOME="$(/usr/libexec/java_home -v 17)"     # hoặc đường dẫn JDK 17
export ANDROID_HOME="$HOME/Library/Android/sdk"
cd android
./gradlew assembleDebug          # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease        # bản release (cần ký để lên CH Play)
```

> **Lỗi `PKIX path building failed` khi gradle tải thư viện?** JDK homebrew đôi khi thiếu root CA. Đã kèm sẵn truststore `android/bgl-truststore.jks` (root CA hệ thống) và cấu hình trong `android/gradle.properties`. Nếu vẫn lỗi, đặt `JAVA_HOME` đúng thư mục JDK thật (có `lib/security/cacerts`).

### Android → APK release (đã ký)
Khoá ký nằm ở `android/keystore/diemdanh.jks` + mật khẩu trong `android/keystore.properties` (**không commit**, hãy sao lưu 2 file này — mất khoá là không cập nhật được app đã cài). Có 2 file đó thì `./gradlew assembleRelease` ra bản đã ký `app/build/outputs/apk/release/app-release.apk`; thiếu thì ra bản unsigned (không cài được).
Bản release ký khác bản debug → cài lần đầu phải **gỡ bản debug** trước (mất ảnh/cài đặt lưu trên máy → Sao lưu ở Tôi → Tiện ích rồi Nhập lại).

### iOS → IPA
Cần Mac có Xcode:
```bash
cd ios/App && pod install
npx cap open ios          # mở Xcode -> chọn team ký -> Product > Archive -> Export IPA
```
- Cài lên **iPhone thật** cần ký bằng tài khoản Apple (Developer 99$/năm, hoặc Apple ID free chỉ trụ 7 ngày).
- Bản **Simulator** (`.app`) không cần ký.

### Build cả 2 trên cloud (không cần Xcode ở máy)
Đã có sẵn `.github/workflows/build.yml`. Push code lên GitHub → tab **Actions** → chạy **Build App (APK + IPA)** → tải file ở mục **Artifacts**. Runner `macos-14` build IPA, `ubuntu` build APK.

---

## 5. Cấu trúc

```
bglapp/
├─ www/                    # frontend (source chính bạn sửa)
│  ├─ index.html           # shell + theme CSS
│  └─ js/{api.js, app.js}  # API client + toàn bộ màn hình
├─ android/                # project Android (Capacitor tạo)
├─ ios/                    # project Xcode (Capacitor tạo)
├─ assets/                 # icon.png, splash.png nguồn
├─ capacitor.config.json
└─ .github/workflows/build.yml
```
