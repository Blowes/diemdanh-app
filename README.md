# Điểm Danh (Ban Giáo Lý) — App di động (Android + iOS)

App wrap chức năng web `bglmautam.com` bằng **Capacitor** — **1 source code** build ra cả **APK** (Android) và **IPA** (iPhone). Giao diện native, gọi thẳng API `api.bglmautam.com` để bạn thêm tính năng ngay trong app, không cần deploy lại web production.

- **App ID:** `com.bglmautam.app` · **Tên:** Điểm Danh · **Phiên bản:** 1.2 (versionCode 3)
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
- **Tôi**: hồ sơ, cấu hình cử chỉ quẹt, đổi theme (Sáng/Tối/Hệ thống), đổi thông tin đăng nhập, đăng xuất, Tiện ích (sao lưu / nhập dữ liệu, chuỗi học, kiểm tra cập nhật)
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

### Mới trong v1.2
- **Kiểm tra cập nhật** (Android, *Tôi → Tiện ích ứng dụng → Kiểm tra cập nhật*): đọc GitHub Releases mới nhất của repo `Blowes/diemdanh-app` → có bản mới thì hỏi cập nhật hay để sau → app tự tải APK (hiện % tải) → mở trình cài của Android để **người dùng tự bấm Cài đặt** xác nhận → giữ nguyên ảnh, tài khoản đăng nhập / vân tay, cài đặt → APK tải về **tự xoá** sau khi cập nhật. Trước khi mở trình cài, app kiểm tra APK đúng app, phiên bản mới hơn, cùng chữ ký — sai thì báo lỗi, không bao giờ bắt gỡ app. Lần đầu Android hỏi quyền *Cài ứng dụng không rõ nguồn gốc* cho Điểm Danh. Cách đăng bản mới: mục *Phát hành bản cập nhật (Android)* bên dưới.

### Mới trong v1.1
- **Logo & tên app**: icon launcher / splash Android dùng logo giáo xứ, tên hiển thị **Điểm Danh**, màn khởi động có logo.
- **Niên khóa theo lớp**: mở lớp năm cũ từ *Hành trình* hiện đúng niên khóa của lớp (không còn hiện năm hiện tại); lịch Chúa Nhật cũng theo năm đó.
- **Xuất bảng điểm danh** (tab Điểm danh): khi điểm đủ cả lớp hoặc vừa Xác nhận xong, hiện ô vàng lấp lánh → ảnh PNG (Tên thánh · Họ tên · Ngày · Trạng thái, tóm tắt, màu theo lớp) → *Lưu ảnh / Gửi phụ huynh* (share sheet, Zalo…) hoặc *Sao chép dạng văn bản*.
- **Chuỗi học** (ô thứ 6 trong Chuyên cần, đốm lửa kiểu streak): số buổi học liên tiếp. Cấp độ lửa: 3 **Hiền lành** (đỏ) · 5 **Ngoan** (xanh, to hơn) · 7 **Hy sinh** (7 màu) · 10 **Dấn thân** (7 màu + quầng sáng, cao nhất); từ cấp 3 có tàn lửa bay. Nút **Khoe chuỗi** tạo ảnh chúc mừng (avatar · tên thánh · họ tên · ngọn lửa lớn · số buổi) để gửi phụ huynh. Chuỗi tính mọi ngày đã điểm danh (kể cả ngày sau hôm nay). Tuần **cả lớp không điểm danh** = tuần nghỉ, không mất chuỗi. Bấm vào xem lịch sử, *Khôi phục chuỗi*, đánh dấu *Tuần nghỉ cả lớp* / *Bỏ qua ngày này*. Quy tắc cộng/giữ/mất theo trạng thái: *Tôi → Tiện ích → Chuỗi học* (mặc định: Hiện Diện, Báo Trễ cộng · Vắng Lễ giữ · Có Phép, Không Phép, Nghỉ Luôn mất). Dữ liệu điều chỉnh lưu trên máy.
- **Cột điểm danh**: bộ lọc theo trạng thái (Tất cả · Chưa điểm · Hiện Diện · …) và **Đặt tất cả** — gán 1 trạng thái cho toàn bộ em đang hiển thị (ví dụ lọc *Chưa điểm* → Đặt tất cả *Hiện Diện*), vẫn cần Xác nhận để gửi.
- **Nền chính** là ảnh rừng thông hoàng hôn (`www/assets/bg-login.jpg`) cố định sau toàn app, phủ mờ theo theme sáng/tối và nhuộm theo màu lớp; appbar/nav kính mờ.
- **Font nhúng sẵn** (`www/assets/fonts`, Be Vietnam Pro + Bricolage Grotesque, latin + vietnamese) — không phụ thuộc mạng, không lỗi font khi offline.
- **Thông báo trong app** (chuông góc phải, badge số chưa đọc): lưu điểm danh thành công / lỗi, đạt mốc chuỗi (3, 5, 10, 15…), mất chuỗi; bấm nhảy tới đúng lớp / thiếu nhi; *Xoá tất cả*. Lưu trên máy theo tài khoản.

### Giao diện "Liquid Glass" (kiểu iOS 26/27)
- **Thanh tab nổi** dạng viên kính, bong bóng trượt theo tab đang mở; **kéo ngang** trên thanh để chuyển tab; bấm lại tab đang mở → cuộn lên đầu.
- **Thanh trên**: nút kính tròn (quay lại / chuông / tìm kiếm), **tiêu đề lớn** trong nội dung, tiêu đề nhỏ + mép mờ chỉ hiện khi cuộn.
- **Segmented** (tab lớp, Cá nhân/Hành trình, Quẹt/Cột, giao diện) có bong bóng trượt; **sheet nổi** bo theo góc máy, nút ✕, **vuốt mép trên xuống để đóng**.
- Thẻ, nút, ô tìm kiếm, chip đều bo tròn kiểu bong bóng; avatar tròn; biểu tượng lớp là viên kẹo màu khăn.
- iOS và chế độ *Tắt hiệu ứng* dùng kính đặc (không blur) để cuộn mượt.

### Sửa lỗi
- **Nhập dữ liệu từ file .zip**: *Nhập dữ liệu* và *Nhập dữ liệu chuỗi* nhận thẳng file `.zip` (file sao lưu gửi qua Zalo/Drive hay bị nén) — tự lấy mọi file `.json` bên trong (kể cả trong thư mục con, bỏ rác `__MACOSX`), không cần giải nén tay. Giải nén bằng `DecompressionStream`, WebView cũ dùng bộ inflate JS trong `www/js/unzip.js`. *Nhập dữ liệu chuỗi* cũng đọc được phần chuỗi học trong file sao lưu đầy đủ.
- **403 Forbidden khi mở hồ sơ GLV khác**: API `GET v1/people/:id` chỉ cho xem khi `can_view_profile = true`. App không gọi API khi biết trước bị chặn, hiện **hồ sơ rút gọn** từ dữ liệu danh sách GLV (SĐT, email, ngày sinh, hành trình năm nay). Lớp không được xem chi tiết (403) hiện thông tin chung thay vì lỗi.
- Mở app không còn render 2 lần (mỗi API gọi 2 lần) khi chuyển vào lớp mình dạy.

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

### Endpoint web có mà app chưa dùng (dò từ bundle web `main.2f7e3f67.js`, cập nhật 25/10/2026)

| Chức năng | Endpoint |
|---|---|
| **Tìm kiếm (ĐÃ ĐỔI)** | `GET v1/search?query=&year=` → `{students[], teachers[], orphans[]}` (người kèm `enrollment{result,classroom}` / `teaching_assignment{position,classroom}`), tối thiểu 2 ký tự — *app đã chuyển sang cách này* |
| Tổng quan lớp | `GET v1/classrooms/{id}/overview_card` · `GET v1/classrooms/overview?year=` |
| GLV của lớp | `GET v1/classrooms/{id}/teaching_assignments` |
| **Điểm danh GLV** | `GET v1/attendances?filters[attendable_type_eq]=TeachingAssignment&filters[date_eq]=` (tạo/sửa như điểm danh thiếu nhi với `attendable_type: "TeachingAssignment"`) |
| Chuyển lớp thiếu nhi | `PUT v1/enrollments/{id}/transfer {classroom_id}` |
| Anh chị em | `GET v1/people/{id}/siblings` |
| Gộp hồ sơ trùng | `GET v1/people?q=&exclude_id=` · `POST v1/people/{id}/merge {duplicate_id}` |
| Xuất file theo lớp | `GET v1/classrooms/{id}/students_pdf · students_xlsx · personal_details_pdf · posting_list_pdf · teachers_contact_pdf` · `classroom_custom_export` |
| Xuất file cả năm | `GET v1/students/pdf|xlsx?year=` · `v1/teachers/pdf|xlsx?year=` · `v1/classrooms/statistics_pdf?year=` |
| Tài khoản của mình | `PUT v1/auth/me {user}` · `GET v1/users?filters[person_id_eq]=` |
| Quản trị (admin) | `v1/academic_years` (CRUD, `/{id}/mark_current`, `locked`) · `v1/data_schemas` (+`/options`) · `v1/resource_types` CRUD · `v1/dashboard/{summary,attendance_by_week,enrollment_trends,new_students,orphan_people}` |

Test nhanh mọi endpoint GET (chỉ đọc, tự nhập mật khẩu, không in dữ liệu cá nhân): `python3 scripts/api_smoketest.py`

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
GET   v1/search?query=&year=   # trước đây ?q= ; giờ trả {students, teachers, orphans}
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

### Phát hành bản cập nhật (Android)
App gọi `GET https://api.github.com/repos/Blowes/diemdanh-app/releases/latest` **không token** → repo phải để **Public**. Tag `v<versionName>` (vd `v1.3`) được so với bản đang cài; app tải asset `.apk` đầu tiên (ưu tiên tên có `DiemDanh`).

**Quy trình:**
1. Sửa `android/app/build.gradle`: `versionCode` **+1** và `versionName` mới (vd `1.2` → `1.3`). iOS sửa `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` trong `ios/App/App.xcodeproj/project.pbxproj` cho khớp.
2. Commit & push lên GitHub. Lần đầu (repo `Blowes/diemdanh-app` còn trống, máy chưa có remote): `git remote add origin https://github.com/Blowes/diemdanh-app.git && git push -u origin <nhánh>` — repo trống thì GitHub không tạo được tag/release (`--check` sẽ báo lỗi). Tag `v<ver>` gắn vào commit HEAD đã push (chưa push thì gắn vào nhánh mặc định).
3. Chạy script (cần `android/keystore.properties` + `android/keystore/diemdanh.jks`):
   ```bash
   scripts/release-android.sh --check                         # kiểm tra trước, không build
   scripts/release-android.sh notes.md                        # build → dist/DiemDanh-v<ver>.apk + in các bước đăng tay
   GITHUB_TOKEN=github_pat_xxx scripts/release-android.sh notes.md   # build + tự tạo release, đính kèm APK
   ```
   `notes.md` (tuỳ chọn) = ghi chú bản cập nhật (Markdown). Script: `cap sync android` → `assembleRelease` → `apksigner` xác nhận ký đúng khoá release (SHA-256 `7d7e772c…103072`, chặn khoá debug / khoá lạ) → `aapt2` xác nhận package + versionCode/versionName khớp `build.gradle` → in dung lượng + SHA-256 → (có token) tạo bản nháp, tải APK lên rồi mới *Publish* làm **latest**. Dừng nếu tag/release đã có hoặc phiên bản không mới hơn bản đang phát hành; cảnh báo nếu còn code chưa commit/push.
   `GITHUB_TOKEN` = *fine-grained token* chỉ chọn repo `Blowes/diemdanh-app`, quyền **Contents: Read and write** (script không in token). Không có token → đăng tay: *Releases → Draft a new release* → tag `v<ver>` → tiêu đề `Điểm Danh v<ver>` → dán `dist/DiemDanh-v<ver>-notes.md` → đính kèm `dist/DiemDanh-v<ver>.apk` → **Publish release**.

**Quy tắc** (sai là người dùng không cập nhật được hoặc mất dữ liệu):
- Luôn ký bằng `android/keystore/diemdanh.jks`. **Không bao giờ** đăng APK debug — kể cả APK từ GitHub Actions.
- `versionCode` luôn tăng; tag = `v<versionName>`; asset là file `.apk` (giữ tên `DiemDanh-v<ver>.apk`).
- Publish làm **latest** — không *pre-release*, không để *draft* (app chỉ đọc `releases/latest`).

**Giữ dữ liệu:** cùng App ID `com.bglmautam.app` + cùng khoá ký + versionCode cao hơn ⇒ Android cài đè, giữ nguyên ảnh (localStorage của WebView), tài khoản đăng nhập / vân tay (Keystore), cookie, cài đặt. Máy đang cài **bản debug** không cập nhật đè được: *Tôi → Tiện ích → Sao lưu* → gỡ app → cài bản release → *Nhập dữ liệu* (chỉ một lần, sau đó cập nhật trong app). APK tải về nằm trong thư mục riêng của app, tự xoá ngay khi cập nhật xong (kể cả khi chưa mở app); tải lỗi / huỷ cũng xoá file dở.

> **CH Play:** quyền `REQUEST_INSTALL_PACKAGES` (tự cài APK) bị Google Play hạn chế, không được dùng nếu không có lý do hợp lệ theo chính sách. Bản lên CH Play phải bỏ tính năng này (xoá quyền trong `AndroidManifest.xml` + plugin `AppUpdate`, ẩn *Kiểm tra cập nhật*) — CH Play tự cập nhật app.

### iOS → IPA
Cần Mac có Xcode:
```bash
cd ios/App && pod install
npx cap open ios          # mở Xcode -> chọn team ký -> Product > Archive -> Export IPA
```
- Cài lên **iPhone thật** cần ký bằng tài khoản Apple (Developer 99$/năm, hoặc Apple ID free chỉ trụ 7 ngày).
- Bản **Simulator** (`.app`) không cần ký.

### iOS → App Store (bản phát hành)

Project đã cấu hình sẵn cho App Store, **chỉ cần máy có cert**:

| Thiết lập | Giá trị |
|---|---|
| Bundle ID | `com.bglmautam.app` |
| Tên hiển thị | Điểm Danh |
| Phiên bản | `1.2` (build `3`) — khớp Android |
| Thiết bị | iPhone (portrait) |
| Ký | Automatic · Release = *Apple Distribution* |
| Export compliance | `ITSAppUsesNonExemptEncryption = false` (chỉ dùng HTTPS → được miễn) |
| Privacy manifest | `ios/App/App/PrivacyInfo.xcprivacy` |

**Trên máy có cert:**
```bash
npm install
npx cap sync ios
cd ios/App && pod install
npx cap open ios
```
Trong Xcode: target **App** → *Signing & Capabilities* → chọn **Team** (Bundle ID phải trùng App ID đã tạo trên developer portal) → *Product ▸ Archive* → *Distribute App ▸ App Store Connect*.

**Cần chuẩn bị trên App Store Connect** (không nằm trong source, nhưng thiếu là bị từ chối):
1. **Tài khoản demo** cho reviewer — app bắt buộc đăng nhập, không có tài khoản thử thì reviewer reject ngay (Guideline 2.1). Điền ở *App Review Information*.
2. **URL chính sách bảo mật** — bắt buộc. App xử lý dữ liệu cá nhân **trẻ em** (tên, kết quả học, ảnh), nên chính sách phải nói rõ: ảnh chỉ lưu trên máy, dữ liệu điểm danh gửi về `api.bglmautam.com`, ai truy cập được.
3. **Nhãn quyền riêng tư** (App Privacy) — khai đúng: *User ID* và *Other Data*, đều **linked to user**, mục đích *App Functionality*, **không tracking**. Ảnh chụp **không** khai vì chỉ nằm trong máy (localStorage), không upload.
4. **Ảnh chụp màn hình** iPhone 6.9" (1290×2796 hoặc 1320×2868).
5. **Age rating** — chọn phù hợp; app dành cho giáo lý viên (người lớn), **không** đăng vào *Kids Category* (Kids Category có ràng buộc khắt khe hơn nhiều).

> **Rủi ro review cần lường trước:** app là Capacitor WebView bọc `www/`. Giao diện là app thật (bottom-nav, quẹt điểm danh, chuỗi học, xuất ảnh, Face ID, lưu Thư viện ảnh) chứ không phải nhúng website, nên thường qua được Guideline 4.2 — nhưng nếu bị hỏi, trả lời nhấn mạnh các tính năng native kể trên.

### Build cả 2 trên cloud (không cần Xcode ở máy)
Đã có sẵn `.github/workflows/build.yml`. Push code lên GitHub → tab **Actions** → chạy **Build App (APK + IPA)** → tải file ở mục **Artifacts**. Runner `macos-14` build IPA, `ubuntu` build APK. APK ở đây là bản **debug** — chỉ để thử, **không** đính kèm vào Releases (xem *Phát hành bản cập nhật*).

---

## 5. Cấu trúc

```
bglapp/
├─ www/                    # frontend (source chính bạn sửa)
│  ├─ index.html           # shell + theme CSS
│  └─ js/{api.js, app.js, unzip.js}  # API client + toàn bộ màn hình + đọc file .zip khi Nhập
├─ android/                # project Android (Capacitor tạo)
├─ ios/                    # project Xcode (Capacitor tạo)
├─ assets/                 # icon.png, splash.png nguồn
├─ scripts/                # release-android.sh (phát hành APK cập nhật), api_smoketest.py
├─ capacitor.config.json
└─ .github/workflows/build.yml
```
