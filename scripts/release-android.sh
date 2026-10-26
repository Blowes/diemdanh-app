#!/usr/bin/env bash
# Phát hành bản cập nhật Android cho "Kiểm tra cập nhật" trong app (Tôi → Tiện ích ứng dụng).
# Build APK release KÝ bằng android/keystore/diemdanh.jks → kiểm tra chữ ký + phiên bản → dist/DiemDanh-v<ver>.apk
# → có GITHUB_TOKEN thì tạo GitHub Release v<ver> trên Blowes/diemdanh-app và đính kèm APK (không có thì in hướng dẫn đăng tay).
#
# Dùng:
#   scripts/release-android.sh [notes.md]       build + kiểm tra (+ đăng release nếu có GITHUB_TOKEN); notes.md = ghi chú bản cập nhật
#   scripts/release-android.sh --check          chỉ kiểm tra phiên bản, khoá ký, git, release mới nhất — KHÔNG build
#   scripts/release-android.sh --print-version  in versionName / versionCode / tag / tên APK
# Biến môi trường (tuỳ chọn):
#   GITHUB_TOKEN         fine-grained token CHỈ repo này, quyền Contents: Read and write (không bao giờ in ra)
#   RELEASE_YES=1        đăng luôn, không hỏi lại (chạy không có terminal)
#   RELEASE_CERT_SHA256  SHA-256 chứng chỉ ký mong đợi (mặc định: chứng chỉ của bản release đã phát hành)
#   JAVA_HOME            mặc định JDK 17 (/usr/libexec/java_home -v 17)
#   ANDROID_HOME         mặc định $HOME/Library/Android/sdk
# Chạy được với bash 3.2 của macOS.
set -euo pipefail

REPO="Blowes/diemdanh-app"
APP_ID="com.bglmautam.app"
# SHA-256 chứng chỉ ký release (công khai, nằm trong mọi APK) — bản v1.1 đã phát hành ký bằng chứng chỉ này.
# Đổi khoá = máy đã cài KHÔNG cập nhật đè được (phải gỡ app → mất ảnh / đăng nhập / cài đặt) → script chặn.
PINNED_CERT="7d7e772c7a3180f007f2b8be0c2e5731cdf4a76f55c6ce3abb7f4c6793103072"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
GRADLE_FILE="$ROOT/android/app/build.gradle"
KS_PROPS="$ROOT/android/keystore.properties"
IOS_PBX="$ROOT/ios/App/App.xcodeproj/project.pbxproj"
APK_OUT_DIR="$ROOT/android/app/build/outputs/apk/release"

if [ -t 2 ]; then B=$'\033[1m'; Y=$'\033[1;33m'; R=$'\033[1;31m'; G=$'\033[1;32m'; C=$'\033[1;36m'; N=$'\033[0m'; else B=; Y=; R=; G=; C=; N=; fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▶ %s%s\n' "$C" "$*" "$N" >&2; }
ok()   { printf '%s✔ %s%s\n' "$G" "$*" "$N" >&2; }
warn() { printf '%s⚠ %s%s\n' "$Y" "$*" "$N" >&2; }
die()  { printf '%s✖ %s%s\n' "$R" "$*" "$N" >&2; exit 1; }
usage() { awk 'NR==1{next} /^#/{sub(/^# ?/,""); print; next} {exit}' "${BASH_SOURCE[0]}"; }

# ---------- tham số ----------
MODE=release; NOTES=""
while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help) usage; exit 0;;
    --check) MODE=check;;
    --print-version) MODE=version;;
    -*) die "Tham số lạ: $1 (xem --help)";;
    *) [ -z "$NOTES" ] || die "Chỉ nhận 1 file ghi chú"; NOTES="$1";;
  esac
  shift
done
if [ -n "$NOTES" ]; then
  [ -f "$NOTES" ] && [ -r "$NOTES" ] || die "Không đọc được file ghi chú: $NOTES"
  NOTES="$(cd "$(dirname "$NOTES")" && pwd)/$(basename "$NOTES")"
fi

# ---------- phiên bản (android/app/build.gradle) ----------
[ -f "$GRADLE_FILE" ] || die "Không thấy $GRADLE_FILE"
VERSION_CODE="$(awk '$1=="versionCode" && !f {print $2; f=1}' "$GRADLE_FILE")"
VERSION_NAME="$(awk '$1=="versionName" && !f {v=$2; gsub(/"/,"",v); print v; f=1}' "$GRADLE_FILE")"
case "$VERSION_CODE" in ''|*[!0-9]*) die "Không đọc được versionCode (số nguyên) trong android/app/build.gradle";; esac
printf '%s' "$VERSION_NAME" | grep -Eq '^[0-9]+(\.[0-9]+){0,3}$' \
  || die "versionName \"$VERSION_NAME\" phải dạng số (1.2 / 1.2.3, tối đa 4 phần) để app so sánh được với tag"
TAG="v$VERSION_NAME"
ASSET="DiemDanh-v$VERSION_NAME.apk"
DIST_APK="$ROOT/dist/$ASSET"

if [ "$MODE" = version ]; then
  say "versionName=$VERSION_NAME"; say "versionCode=$VERSION_CODE"; say "tag=$TAG"; say "asset=$ASSET"
  exit 0
fi

TMPD="$(mktemp -d "${TMPDIR:-/tmp}/diemdanh-release.XXXXXX")"
trap 'rm -rf "$TMPD"' EXIT

# a > b theo từng phần số (1.10 > 1.9; 1.2 = 1.2.0)
ver_gt() { awk -v a="$1" -v b="$2" 'BEGIN{n=split(a,x,".");m=split(b,y,".");k=(n>m?n:m);for(i=1;i<=k;i++){p=(i<=n?x[i]+0:0);q=(i<=m?y[i]+0:0);if(p!=q)exit !(p>q)}exit 1}'; }
# đọc 1 trường JSON (a.b.c) từ file, rỗng nếu không có
json_get() { node -e 'const fs=require("fs");let v;try{v=JSON.parse(fs.readFileSync(process.argv[1],"utf8"))}catch(e){process.exit(0)}for(const k of process.argv[2].split("."))v=(v==null?undefined:v[k]);if(v!=null)process.stdout.write(String(v))' "$1" "$2"; }
# gh_curl <file lưu body> <tham số curl...> → in mã HTTP (000 = lỗi mạng). Token đưa qua stdin (-K -) nên không lộ trên dòng lệnh / ps.
gh_curl() {
  local out="$1"; shift
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    printf 'header = "Authorization: Bearer %s"\n' "$GITHUB_TOKEN" \
      | curl -sS -K - --connect-timeout 20 -o "$out" -w '%{http_code}' -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' -H 'User-Agent: diemdanh-release' "$@" || true
  else
    curl -sS --connect-timeout 20 -o "$out" -w '%{http_code}' -H 'Accept: application/vnd.github+json' -H 'X-GitHub-Api-Version: 2022-11-28' -H 'User-Agent: diemdanh-release' "$@" </dev/null || true
  fi
}
human_size() { awk -v b="$1" 'BEGIN{ if (b>=1048576) printf "%.1f MB", b/1048576; else printf "%.0f KB", b/1024 }'; }

say "${B}Điểm Danh — phát hành Android $TAG (versionCode $VERSION_CODE) → $ASSET${N}"

# iOS nên cùng phiên bản (không bắt buộc)
if [ -f "$IOS_PBX" ]; then
  IOS_VER="$(awk '/MARKETING_VERSION = / && !f {v=$0; gsub(/.*= |;.*|"/,"",v); print v; f=1}' "$IOS_PBX")"
  IOS_BUILD="$(awk '/CURRENT_PROJECT_VERSION = / && !f {v=$0; gsub(/.*= |;.*|"/,"",v); print v; f=1}' "$IOS_PBX")"
  { [ "$IOS_VER" = "$VERSION_NAME" ] && [ "$IOS_BUILD" = "$VERSION_CODE" ]; } \
    || warn "iOS đang $IOS_VER (build $IOS_BUILD) ≠ Android $VERSION_NAME ($VERSION_CODE) — nhớ sửa MARKETING_VERSION / CURRENT_PROJECT_VERSION"
fi

# ---------- công cụ ----------
step "Kiểm tra công cụ"
if [ -z "${JAVA_HOME:-}" ] && [ -x /usr/libexec/java_home ]; then JAVA_HOME="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"; fi
[ -n "${JAVA_HOME:-}" ] && [ -x "$JAVA_HOME/bin/java" ] || die "Không thấy JDK 17 — cài Temurin 17 hoặc đặt JAVA_HOME"
ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
[ -d "$ANDROID_HOME" ] || die "Không thấy Android SDK ở $ANDROID_HOME — đặt ANDROID_HOME"
export JAVA_HOME ANDROID_HOME
export PATH="$JAVA_HOME/bin:$PATH"
KEYTOOL="$JAVA_HOME/bin/keytool"
BT_VER="$(ls "$ANDROID_HOME/build-tools" 2>/dev/null | grep -E '^[0-9]+\.[0-9]+\.[0-9]+$' | sort -t. -k1,1n -k2,2n -k3,3n | tail -n 1 || true)"
[ -n "$BT_VER" ] || die "Không thấy build-tools trong $ANDROID_HOME/build-tools (cài build-tools 34.0.0)"
APKSIGNER="$ANDROID_HOME/build-tools/$BT_VER/apksigner"
AAPT2="$ANDROID_HOME/build-tools/$BT_VER/aapt2"
[ -x "$APKSIGNER" ] && [ -x "$AAPT2" ] || die "Thiếu apksigner / aapt2 trong build-tools $BT_VER"
command -v node >/dev/null 2>&1 || die "Cần Node.js (npm install)"
command -v shasum >/dev/null 2>&1 || die "Cần lệnh shasum"
[ -x "$ROOT/node_modules/.bin/cap" ] || die "Chưa có node_modules — chạy npm install trước"
ok "JDK: $JAVA_HOME · build-tools $BT_VER"

# ---------- khoá ký release (bắt buộc) ----------
step "Kiểm tra khoá ký release"
NO_KEY_MSG="KHÔNG phát hành APK debug/unsigned: app tự cập nhật chỉ giữ được dữ liệu người dùng (ảnh, đăng nhập, cài đặt) khi APK ký CÙNG khoá release android/keystore/diemdanh.jks"
[ -f "$KS_PROPS" ] || die "Thiếu android/keystore.properties — $NO_KEY_MSG"
prop() { awk -v k="$1" '{ key=$0; sub(/[ \t]*[=:].*$/,"",key); gsub(/^[ \t]+/,"",key) } !f && key==k { v=$0; sub(/^[^=:]*[=:][ \t]*/,"",v); sub(/\r$/,"",v); print v; f=1 }' "$KS_PROPS"; }
KS_FILE_REL="$(prop storeFile)"; KS_ALIAS="$(prop keyAlias)"
[ -n "$KS_FILE_REL" ] && [ -n "$KS_ALIAS" ] && [ -n "$(prop storePassword)" ] && [ -n "$(prop keyPassword)" ] \
  || die "android/keystore.properties thiếu storeFile / storePassword / keyAlias / keyPassword — $NO_KEY_MSG"
case "$KS_FILE_REL" in /*) KS_FILE="$KS_FILE_REL";; *) KS_FILE="$ROOT/android/$KS_FILE_REL";; esac
[ -f "$KS_FILE" ] || die "Không thấy file khoá $KS_FILE — $NO_KEY_MSG"
# mật khẩu đưa qua biến môi trường riêng của keytool (-storepass:env), không in, không nằm trên dòng lệnh
KT_OUT="$(KS_PASS="$(prop storePassword)" "$KEYTOOL" -J-Duser.language=en -J-Duser.country=US -list -v -keystore "$KS_FILE" -alias "$KS_ALIAS" -storepass:env KS_PASS 2>&1)" \
  || die "keytool không đọc được khoá (sai mật khẩu hoặc alias trong keystore.properties?): $(printf '%s\n' "$KT_OUT" | grep -i 'error' | tail -n 1)"
KS_CERT="$(printf '%s\n' "$KT_OUT" | awk '!f && /^[ \t]*SHA256:/ { v=$0; sub(/^[ \t]*SHA256:[ \t]*/,"",v); gsub(/[: \t\r]/,"",v); print tolower(v); f=1 }')"
[ -n "$KS_CERT" ] || die "Không đọc được SHA-256 chứng chỉ từ keystore"
EXPECTED_CERT="$(printf '%s' "${RELEASE_CERT_SHA256:-$PINNED_CERT}" | tr -d ': ' | tr 'A-F' 'a-f')"
[ "$KS_CERT" = "$EXPECTED_CERT" ] || die "Chứng chỉ trong $KS_FILE ($KS_CERT) KHÁC chứng chỉ đã phát hành ($EXPECTED_CERT) → máy đã cài không cập nhật đè được, người dùng phải gỡ app = MẤT dữ liệu. Dùng đúng file diemdanh.jks bản gốc. (Chỉ khi chắc chắn đổi khoá: RELEASE_CERT_SHA256=<sha256> …)"
ok "Khoá $KS_ALIAS · SHA-256 $KS_CERT"

# ---------- git (chỉ cảnh báo) ----------
step "Kiểm tra git"
HEAD_SHA=""; EMPTY_REPO=0
if git -C "$ROOT" rev-parse --git-dir >/dev/null 2>&1; then
  HEAD_SHA="$(git -C "$ROOT" rev-parse HEAD 2>/dev/null || true)"
  BRANCH="$(git -C "$ROOT" rev-parse --abbrev-ref HEAD 2>/dev/null || echo '?')"
  [ -z "$(git -C "$ROOT" status --porcelain 2>/dev/null)" ] \
    || warn "Còn thay đổi CHƯA commit — APK sẽ chứa code không có trên GitHub (nên commit & push trước khi phát hành)"
  if UPSTREAM="$(git -C "$ROOT" rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
    AHEAD="$(git -C "$ROOT" rev-list --count "$UPSTREAM..HEAD" 2>/dev/null || echo '?')"
    [ "$AHEAD" = "0" ] || warn "Nhánh $BRANCH có $AHEAD commit chưa push lên $UPSTREAM — git push trước khi phát hành"
  elif [ -z "$(git -C "$ROOT" remote 2>/dev/null)" ]; then
    warn "Chưa có git remote — git remote add origin https://github.com/$REPO.git && git push -u origin $BRANCH"
  else
    warn "Nhánh $BRANCH chưa có upstream (chưa push?) — tag $TAG sẽ gắn vào nhánh mặc định trên GitHub"
  fi
  ok "Nhánh $BRANCH · HEAD ${HEAD_SHA:0:7}"
else
  warn "Không phải git repo — không kiểm tra được code đã push chưa"
fi

# ---------- release mới nhất trên GitHub (app đọc releases/latest) ----------
step "Release mới nhất trên GitHub ($REPO)"
CODE="$(gh_curl "$TMPD/latest.json" "https://api.github.com/repos/$REPO/releases/latest")"
case "$CODE" in
  200)
    LATEST_TAG="$(json_get "$TMPD/latest.json" tag_name)"; LATEST_VER="${LATEST_TAG#[vV]}"
    say "Đang phát hành: $LATEST_TAG"
    if printf '%s' "$LATEST_VER" | grep -Eq '^[0-9]+(\.[0-9]+){0,3}$'; then
      ver_gt "$VERSION_NAME" "$LATEST_VER" \
        || die "$TAG không mới hơn $LATEST_TAG trên GitHub → app sẽ không báo cập nhật. Tăng versionName (+ versionCode) trong android/app/build.gradle"
    else
      warn "Tag mới nhất \"$LATEST_TAG\" không đúng dạng v<số> — bỏ qua so sánh"
    fi
    LATEST_VC="$(json_get "$TMPD/latest.json" body | awk '!f && match($0,/versionCode[ :=]*[0-9]+/) { s=substr($0,RSTART,RLENGTH); gsub(/[^0-9]/,"",s); print s; f=1 }')"
    if [ -n "$LATEST_VC" ] && [ "$VERSION_CODE" -le "$LATEST_VC" ]; then
      die "versionCode $VERSION_CODE phải > $LATEST_VC (của $LATEST_TAG) — Android từ chối cài bản có versionCode không tăng"
    fi
    ok "$TAG mới hơn $LATEST_TAG";;
  404)
    CODE="$(gh_curl "$TMPD/repo_pub.json" "https://api.github.com/repos/$REPO")"
    if [ "$CODE" = "200" ] && [ "$(json_get "$TMPD/repo_pub.json" private)" = "false" ]; then
      # repo trống (chưa có commit) → GitHub không tạo được tag/release: báo TRƯỚC khi build
      if [ "$(gh_curl "$TMPD/commits.json" "https://api.github.com/repos/$REPO/commits?per_page=1")" = "409" ]; then
        EMPTY_REPO=1
        EMPTY_MSG="Repo $REPO đang trống (chưa có commit) → không tạo được tag/release $TAG. Push code trước: git remote add origin https://github.com/$REPO.git && git push -u origin ${BRANCH:-main}"
        if [ "$MODE" = release ] && [ -z "${GITHUB_TOKEN:-}" ]; then warn "$EMPTY_MSG (vẫn build APK, nhưng phải push xong mới đăng release được)"; else die "$EMPTY_MSG"; fi
      else say "Repo public, chưa có release nào → $TAG sẽ là bản đầu tiên"; fi
    else warn "Không thấy repo $REPO công khai (HTTP $CODE) — app chỉ đọc được release của repo PUBLIC"; fi;;
  403|429) warn "GitHub đang giới hạn lượt gọi API (HTTP $CODE) — bỏ qua so sánh";;
  *) warn "Không đọc được release mới nhất (HTTP $CODE) — bỏ qua so sánh";;
esac

if [ "$MODE" = check ]; then ok "Kiểm tra xong (chưa build). Chạy lại không có --check để build."; exit 0; fi

# ---------- build ----------
step "Đồng bộ web → Android (cap sync android)"
(cd "$ROOT" && ./node_modules/.bin/cap sync android)
step "Build APK release (gradlew assembleRelease)"
[ -x "$ROOT/android/gradlew" ] || chmod +x "$ROOT/android/gradlew"
rm -f "$APK_OUT_DIR/"*.apk
(cd "$ROOT/android" && ./gradlew assembleRelease)
APK="$APK_OUT_DIR/app-release.apk"
if [ ! -f "$APK" ]; then
  [ -f "$APK_OUT_DIR/app-release-unsigned.apk" ] && die "Gradle ra APK CHƯA KÝ — kiểm tra android/keystore.properties. $NO_KEY_MSG"
  die "Không thấy $APK sau khi build"
fi

# ---------- kiểm tra APK ----------
step "Kiểm tra chữ ký APK (apksigner)"
SIG_OUT="$("$APKSIGNER" verify --print-certs "$APK" 2>&1)" || die "apksigner: APK chưa ký hợp lệ — $(printf '%s\n' "$SIG_OUT" | grep -v '^WARNING' | tail -n 1)"
SIGNERS="$(printf '%s\n' "$SIG_OUT" | grep -c 'certificate SHA-256 digest:' || true)"
APK_CERT="$(printf '%s\n' "$SIG_OUT" | awk '!f && /^Signer #1 certificate SHA-256 digest:/ { v=$0; sub(/.*digest:[ \t]*/,"",v); gsub(/[: \t\r]/,"",v); print tolower(v); f=1 }')"
printf '%s\n' "$SIG_OUT" | grep -q 'CN=Android Debug' && die "APK đang ký bằng khoá DEBUG — $NO_KEY_MSG"
[ "$SIGNERS" = "1" ] || die "APK có $SIGNERS chứng chỉ ký (cần đúng 1)"
[ "$APK_CERT" = "$KS_CERT" ] || die "Chứng chỉ APK ($APK_CERT) khác keystore ($KS_CERT)"
ok "Ký đúng khoá release · SHA-256 $APK_CERT"

step "Kiểm tra gói / phiên bản APK (aapt2)"
BADGING="$("$AAPT2" dump badging "$APK" 2>/dev/null)" || die "aapt2 không đọc được APK"
PKG_LINE="$(printf '%s\n' "$BADGING" | awk '!f && /^package:/ {print; f=1}')"
APK_PKG="$(printf '%s\n' "$PKG_LINE" | sed -nE "s/.* name='([^']*)'.*/\1/p")"
APK_VC="$(printf '%s\n' "$PKG_LINE" | sed -nE "s/.* versionCode='([^']*)'.*/\1/p")"
APK_VN="$(printf '%s\n' "$PKG_LINE" | sed -nE "s/.* versionName='([^']*)'.*/\1/p")"
[ "$APK_PKG" = "$APP_ID" ] || die "APK có package \"$APK_PKG\" ≠ $APP_ID (khác app → không cập nhật được)"
[ "$APK_VC" = "$VERSION_CODE" ] && [ "$APK_VN" = "$VERSION_NAME" ] \
  || die "APK là $APK_VN ($APK_VC) nhưng build.gradle ghi $VERSION_NAME ($VERSION_CODE) — build lại sạch"
printf '%s\n' "$BADGING" | grep -q '^application-debuggable' && die "APK đang bật debuggable — không phát hành"
ok "$APK_PKG · versionName $APK_VN · versionCode $APK_VC"

# ---------- dist ----------
mkdir -p "$ROOT/dist"
cp -f "$APK" "$DIST_APK"
SIZE="$(wc -c < "$DIST_APK" | tr -d ' ')"
SHA="$(shasum -a 256 "$DIST_APK" | awk '{print $1}')"
step "APK sẵn sàng"
say "  File:    dist/$ASSET"
say "  Dung lượng: $(human_size "$SIZE") ($SIZE byte)"
say "  SHA-256: $SHA"

# ghi chú release (+ thông tin APK; dòng versionCode để lần sau script so sánh)
if [ -n "$NOTES" ]; then cp "$NOTES" "$TMPD/notes.md"; else printf 'Bản cập nhật Điểm Danh %s.\n' "$TAG" > "$TMPD/notes.md"; fi
printf '\n---\nAPK `%s` · versionCode %s · %s\nSHA-256 `%s`\n\nCập nhật trong app: **Tôi → Tiện ích ứng dụng → Kiểm tra cập nhật** (giữ nguyên ảnh, đăng nhập, cài đặt).\n' \
  "$ASSET" "$VERSION_CODE" "$(human_size "$SIZE")" "$SHA" >> "$TMPD/notes.md"
NOTES_OUT="dist/DiemDanh-v$VERSION_NAME-notes.md"
cp -f "$TMPD/notes.md" "$ROOT/$NOTES_OUT"
say "  Ghi chú: $NOTES_OUT"

manual_steps() {
  step "Đăng tay lên GitHub Releases"
  [ "$EMPTY_REPO" != 1 ] || say "  0. ${Y}Repo đang trống — push code trước:${N} git remote add origin https://github.com/$REPO.git && git push -u origin ${BRANCH:-main}"
  say "  1. Mở https://github.com/$REPO/releases/new"
  say "  2. Choose a tag: gõ $TAG → \"Create new tag: $TAG on publish\" (target: nhánh đã push code bản này)"
  say "  3. Release title: Điểm Danh $TAG"
  say "  4. Ghi chú: dán nội dung $NOTES_OUT (giữ dòng \"versionCode $VERSION_CODE\" để lần sau script so sánh)"
  say "  5. Kéo thả dist/$ASSET vào \"Attach binaries\" — GIỮ NGUYÊN tên file"
  say "  6. KHÔNG tick \"Set as a pre-release\", để \"Set as the latest release\" → bấm \"Publish release\" (không \"Save draft\")"
  say "     (app đọc releases/latest: bản nháp / pre-release sẽ không hiện cho người dùng)"
  say "  Kiểm tra: https://api.github.com/repos/$REPO/releases/latest phải trả tag_name \"$TAG\""
  say "  Hoặc chạy lại với GITHUB_TOKEN=<fine-grained token, Contents: Read and write, chỉ repo này> để script tự đăng."
}

if [ -z "${GITHUB_TOKEN:-}" ]; then manual_steps; exit 0; fi

# ---------- đăng GitHub Release ----------
case "$GITHUB_TOKEN" in *[!A-Za-z0-9_]*) die "GITHUB_TOKEN có ký tự lạ — kiểm tra lại (script không in token)";; esac
API="https://api.github.com/repos/$REPO"
step "Đăng GitHub Release $TAG"
CODE="$(gh_curl "$TMPD/repo.json" "$API")"
case "$CODE" in
  200) ;;
  401) die "GITHUB_TOKEN sai hoặc hết hạn (HTTP 401)";;
  403|404) die "Token không truy cập được $REPO (HTTP $CODE) — cấp quyền repo này cho token";;
  *) die "Không đọc được repo $REPO (HTTP $CODE)";;
esac
[ "$(json_get "$TMPD/repo.json" private)" = "false" ] \
  || warn "Repo $REPO đang PRIVATE — app không đọc được release khi không có token. Chuyển repo sang Public để app tự kiểm tra cập nhật."
DEFAULT_BRANCH="$(json_get "$TMPD/repo.json" default_branch)"; DEFAULT_BRANCH="${DEFAULT_BRANCH:-main}"

# tag / release đã có → dừng (không ghi đè bản người dùng có thể đang tải)
CODE="$(gh_curl "$TMPD/rel_tag.json" "$API/releases/tags/$TAG")"
case "$CODE" in
  404) ;;
  200) die "Release $TAG đã tồn tại: $(json_get "$TMPD/rel_tag.json" html_url) — tăng versionName/versionCode rồi chạy lại";;
  *) die "Không kiểm tra được release $TAG (HTTP $CODE)";;
esac
CODE="$(gh_curl "$TMPD/tag_ref.json" "$API/git/ref/tags/$TAG")"
case "$CODE" in
  404) ;;
  200) die "Tag $TAG đã có trên GitHub (chưa có release) — xoá tag đó hoặc tăng phiên bản";;
  409) die "Repo $REPO đang trống — push code lên trước";;
  *) die "Không kiểm tra được tag $TAG (HTTP $CODE)";;
esac
CODE="$(gh_curl "$TMPD/rels.json" "$API/releases?per_page=100")"
if [ "$CODE" = "200" ]; then
  DRAFT_URL="$(node -e 'try{const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));const d=(Array.isArray(r)?r:[]).find(x=>x.draft&&x.tag_name===process.argv[2]);if(d)process.stdout.write(d.html_url||"(bản nháp)")}catch(e){}' "$TMPD/rels.json" "$TAG")"
  [ -z "$DRAFT_URL" ] || die "Đã có bản NHÁP $TAG: $DRAFT_URL — xoá bản nháp đó trên GitHub rồi chạy lại"
fi

# tag gắn vào commit HEAD nếu đã push, không thì nhánh mặc định
TARGET="$DEFAULT_BRANCH"
if [ -n "$HEAD_SHA" ]; then
  CODE="$(gh_curl "$TMPD/commit.json" "$API/commits/$HEAD_SHA")"
  if [ "$CODE" = "200" ]; then TARGET="$HEAD_SHA"; else warn "Commit ${HEAD_SHA:0:7} chưa có trên GitHub → tag $TAG gắn vào nhánh \"$DEFAULT_BRANCH\""; fi
fi

if [ "${RELEASE_YES:-}" != "1" ]; then
  [ -t 0 ] || die "Không có terminal để xác nhận — đặt RELEASE_YES=1 để đăng. APK vẫn ở dist/$ASSET"
  printf '%sĐăng %s (versionCode %s, target %s) lên https://github.com/%s/releases?\nMọi máy đang cài app sẽ thấy bản cập nhật. Gõ y để tiếp tục: %s' "$B" "$TAG" "$VERSION_CODE" "${TARGET:0:12}" "$REPO" "$N" >&2
  ANS=""; read -r ANS || true
  case "$ANS" in y|Y|yes|YES|c|C|co|có) ;; *) say "Đã huỷ đăng. APK vẫn ở dist/$ASSET"; exit 0;; esac
fi

# tạo bản NHÁP → tải APK lên → mới công bố (lỗi giữa chừng không để lộ release thiếu APK)
node -e 'const fs=require("fs");const [tag,target,name,notes,out]=process.argv.slice(1);fs.writeFileSync(out,JSON.stringify({tag_name:tag,target_commitish:target,name:name,body:fs.readFileSync(notes,"utf8"),draft:true,prerelease:false}))' \
  "$TAG" "$TARGET" "Điểm Danh $TAG" "$TMPD/notes.md" "$TMPD/create.json"
CODE="$(gh_curl "$TMPD/created.json" -X POST -H 'Content-Type: application/json' --data-binary @"$TMPD/create.json" "$API/releases")"
[ "$CODE" = "201" ] || die "Tạo release thất bại (HTTP $CODE): $(json_get "$TMPD/created.json" message)"
REL_ID="$(json_get "$TMPD/created.json" id)"
case "$REL_ID" in ''|*[!0-9]*) die "Không đọc được id release vừa tạo";; esac
ok "Đã tạo bản nháp (id $REL_ID)"

say "Đang tải $ASSET lên ($(human_size "$SIZE"))…"
CODE="$(gh_curl "$TMPD/asset.json" -X POST -H 'Content-Type: application/vnd.android.package-archive' --data-binary @"$DIST_APK" "https://uploads.github.com/repos/$REPO/releases/$REL_ID/assets?name=$ASSET")"
if [ "$CODE" != "201" ] || [ "$(json_get "$TMPD/asset.json" name)" != "$ASSET" ] || [ "$(json_get "$TMPD/asset.json" size)" != "$SIZE" ]; then
  MSG="$(json_get "$TMPD/asset.json" message)"
  gh_curl "$TMPD/del.json" -X DELETE "$API/releases/$REL_ID" >/dev/null
  die "Tải APK lên thất bại (HTTP $CODE${MSG:+: $MSG}) — đã xoá bản nháp, chưa phát hành gì"
fi
ok "Đã đính kèm $ASSET"

printf '{"draft":false,"prerelease":false,"make_latest":"true"}' > "$TMPD/publish.json"
CODE="$(gh_curl "$TMPD/published.json" -X PATCH -H 'Content-Type: application/json' --data-binary @"$TMPD/publish.json" "$API/releases/$REL_ID")"
[ "$CODE" = "200" ] || die "Không công bố được (HTTP $CODE) — vào https://github.com/$REPO/releases bấm Publish bản nháp $TAG"
ok "Đã phát hành: $(json_get "$TMPD/published.json" html_url)"

CODE="$(gh_curl "$TMPD/latest2.json" "$API/releases/latest")"
if [ "$CODE" = "200" ] && [ "$(json_get "$TMPD/latest2.json" tag_name)" = "$TAG" ]; then
  ok "releases/latest = $TAG — app sẽ báo cập nhật khi người dùng bấm Kiểm tra cập nhật"
else
  warn "releases/latest chưa trỏ tới $TAG (HTTP $CODE) — kiểm tra trang Releases (không được là pre-release / bản nháp)"
fi
