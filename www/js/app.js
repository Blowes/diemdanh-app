// ============================================================
//  Điểm Danh (Ban Giáo Lý) — app native (Android + iOS)
//  UX app-first: bottom nav, dashboard, điểm danh QUẸT (Tinder) + CỘT,
//  xuất bảng điểm danh (ảnh), chuỗi học, thông báo trong app
// ============================================================
const root = document.getElementById("root");
const $ = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])));
// Chuỗi đặt trong '…' của onclick="…": thoát \ ' xuống dòng cho JS TRƯỚC, rồi esc() cho thuộc tính HTML (chỉ esc() thì &#39; vẫn thành ' khi chạy)
const jsq = (s) => esc(String(s == null ? "" : s).replace(/[\\'\n\r\u2028\u2029]/g, (c) => ({ "\\": "\\\\", "'": "\\'", "\n": "\\n", "\r": "\\r", "\u2028": "\\u2028", "\u2029": "\\u2029" }[c])));
// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu ("tu" khớp "Tú")
const noAccent = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
// Che 3 số cuối SĐT khi HIỂN THỊ (0912345678 → 0912345***); tên đăng nhập không phải SĐT giữ nguyên
const maskPhone = (s) => { s = s == null ? "" : String(s); return /^\+?\d{6,}$/.test(s) ? s.slice(0, -3) + "***" : s; };
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };

// ---------- két bảo mật cho thông tin đăng nhập ----------
// Mật khẩu KHÔNG lưu plaintext: giữ trong iOS Keychain / Android Keystore qua NativeBiometric.
// localStorage chỉ giữ "bgl-cred" = { u } làm marker cho UI (prefill username + nút sinh trắc học).
const CRED_SERVER = "bglmautam.com";
if (window.Capacitor && window.Capacitor.getPlatform && window.Capacitor.getPlatform() === "ios") document.documentElement.classList.add("ios");
const _bio = () => window.Capacitor?.Plugins?.NativeBiometric;
const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
async function saveCred(u, p) {
  store.set("bgl-cred", { u });
  const B = _bio();
  if (B) { try { await B.setCredentials({ username: u, password: p, server: CRED_SERVER }); try { localStorage.removeItem("bgl-cred-fb"); } catch {} return; } catch {} }
  // Trên app native: Keychain/Keystore lỗi thì THÔI, không hạ cấp xuống localStorage plaintext.
  if (isNative()) { try { localStorage.removeItem("bgl-cred-fb"); } catch {} return; }
  store.set("bgl-cred-fb", { u, p });
}
async function loadCred() {
  const B = _bio();
  if (B) { try { const c = await B.getCredentials({ server: CRED_SERVER }); if (c && c.username) return { u: c.username, p: c.password }; } catch {} }
  return store.get("bgl-cred-fb", null);
}
async function clearCred() {
  try { localStorage.removeItem("bgl-cred"); } catch {}
  try { localStorage.removeItem("bgl-cred-fb"); } catch {}
  const B = _bio();
  if (B) { try { await B.deleteCredentials({ server: CRED_SERVER }); } catch {} }
}
const QUOTA_MSG = "Bộ nhớ máy đầy — không lưu được. Xoá bớt ảnh thiếu nhi trong Tôi → Tiện ích → Xoá dữ liệu.";

// ---------- trạng thái điểm danh ----------
const STATUSES = [
  { v: "Hiện Diện", cls: "st-present" },
  { v: "Vắng Lễ", cls: "st-absent" },
  { v: "Có Phép", cls: "st-excused" },
  { v: "Báo Trễ", cls: "st-late" },
  { v: "Không Phép", cls: "st-unexcused" },
  { v: "Nghỉ Luôn", cls: "st-quit" },
];
const stCls = (v) => (STATUSES.find((s) => s.v === v) || {}).cls || "st-none";
const stColorVar = (v) => ({ "Hiện Diện": "--present-t", "Vắng Lễ": "--absent-t", "Có Phép": "--excused-t", "Báo Trễ": "--late-t", "Không Phép": "--unexcused-t", "Nghỉ Luôn": "--quit-t" }[v] || "--ink-faint");
const RESULT_CLS = { "Đang Học": "st-present", "Nghỉ Luôn": "st-quit", "Lên Lớp": "st-excused", "Học Lại": "st-late", "Chuyển Xứ": "st-quit" };
const STONE = { "Hiện Diện": "green", "Vắng Lễ": "purple", "Có Phép": "blue", "Báo Trễ": "amber", "Không Phép": "red", "Nghỉ Luôn": "gray", "Đang Học": "green", "Lên Lớp": "blue", "Học Lại": "amber", "Chuyển Xứ": "gray" };
const statTile = (v, label, tone) => `<div class="stat tinted t-${tone || "gray"}"><div class="v num">${v}</div><div class="k">${label}</div></div>`;
// màu avatar theo tên (khi chưa có ảnh) — trẻ trung, nhiều màu
const HUES = ["#2c9d6c", "#2f7fd0", "#7a5bd0", "#d0663a", "#c99a3a", "#0fa88a", "#cf5d86", "#5566c9", "#0e9bb0", "#c0504d"];
function hueOf(name) { let h = 0; const t = name || "?"; for (let i = 0; i < t.length; i++) h = (h * 31 + t.charCodeAt(i)) >>> 0; return HUES[h % HUES.length]; }

// mapping cử chỉ mặc định
const GESTURE_DEF = { up: "Hiện Diện", down: "Vắng Lễ", left: "Có Phép", right: "Báo Trễ", double: "Không Phép" };
const gestures = () => Object.assign({}, GESTURE_DEF, store.get("bgl-gestures", {}));

// ---------- state ----------
const S = { user: null, year: null };

// ---------- helpers ----------
function toast(msg, ms = 2200) { const t = $("toast"); t.textContent = msg; t.classList.add("on"); clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("on"), ms); }
function go(h) { location.hash = h; }
function fmtDate(s) { if (!s) return "—"; const p = String(s).slice(0, 10).split("-"); return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : s; }
function nmFs(name, base) { const L = (name || "").length; return L > 22 ? base - 3 : L > 16 ? base - 2 : base; }
function initials(name) { if (!name) return "?"; const w = name.trim().split(/\s+/); return ((w[w.length - 2]?.[0] || "") + (w[w.length - 1]?.[0] || w[0]?.[0] || "")).toUpperCase(); }

// ---------- ảnh học sinh (lưu client theo tài khoản) ----------
function photoKey(pid) { return "bgl-photo-" + ((S.user && S.user.id) || "x") + "-" + pid; }
// Ảnh hợp lệ = data URL ảnh base64 (ảnh lạ từ file nhập cũ không được chèn vào style/HTML)
const PHOTO_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
function photoOf(pid) { try { const v = localStorage.getItem(photoKey(pid)) || ""; return PHOTO_RE.test(v) ? v : ""; } catch { return ""; } }
const AV_NAMES = {};
function avatar(p, o = {}) {
  const id = p && p.id, ph = id ? photoOf(id) : "";
  if (id) AV_NAMES[id] = p.name || p.full_name || ("Học sinh #" + id);
  const size = o.size || 46, fs = o.fs || 16;
  const tap = o.tappable && id ? `onclick="event.stopPropagation();pickPhoto(${id})"` : "";
  const hue = id ? hueOf(p.name || p.full_name || String(id)) : "#888";
  const bg = ph ? `background-image:url('${ph}');background-size:cover;background-position:center;color:transparent;border-color:transparent` : `background:linear-gradient(150deg,${hue}2e,${hue}14);color:${hue};border-color:${hue}3a`;
  const b = Math.round(size * 0.4);
  const badge = (o.tappable && !ph) ? `<span style="position:absolute;right:-2px;bottom:-2px;background:var(--brand);color:#fff;width:${b}px;height:${b}px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--surface)">${ic("cam", Math.round(b * 0.6))}</span>` : "";
  return `<div class="ava ${o.cls || ""}" style="width:${size}px;height:${size}px;border-radius:50%;font-size:${fs}px;position:relative;overflow:visible;${bg}" ${tap}><span style="position:absolute;inset:0;display:grid;place-items:center;border-radius:inherit;overflow:hidden;background:inherit">${ph ? "" : esc(initials(p.name || p.full_name))}</span>${badge}</div>`;
}
async function pickPhoto(personId) {
  const Cam = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Camera;
  if (!Cam) { toast("Chức năng ảnh chỉ hoạt động trên app điện thoại"); return; }
  try {
    const photo = await Cam.getPhoto({ quality: 55, allowEditing: true, resultType: "dataUrl", source: "PROMPT", width: 400, height: 400, promptLabelHeader: "Ảnh thiếu nhi", promptLabelPhoto: "Chọn từ thư viện", promptLabelPicture: "Chụp ảnh", promptLabelCancel: "Huỷ" });
    if (!photo || !photo.dataUrl) return;
    try { localStorage.setItem(photoKey(personId), photo.dataUrl); } catch { toast("Bộ nhớ đầy — không lưu được ảnh"); return; }
    try { const idx = JSON.parse(localStorage.getItem("bgl-photo-names") || "{}"); idx[personId] = AV_NAMES[personId] || ("Học sinh #" + personId); localStorage.setItem("bgl-photo-names", JSON.stringify(idx)); } catch {}
    toast("Đã lưu ảnh");
    if ($("sheet")) closeSheet();
    render();
  } catch (e) { /* người dùng huỷ */ }
}
window.pickPhoto = pickPhoto;
// Format YYYY-MM-DD theo GIỜ ĐỊA PHƯƠNG (tránh lệch ngày do toISOString đổi UTC)
function toISO(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function todaySunday() { const d = new Date(); const g = d.getDay(); if (g !== 0) d.setDate(d.getDate() - g); return toISO(d); }
const WD = ["Chúa Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
function weekdayVN(iso) { const d = iso ? new Date(iso + "T00:00:00") : new Date(); return WD[d.getDay()]; }
function isSundayToday() { return new Date().getDay() === 0; }
// Khoảng ngày niên khóa của MỘT LỚP: lớp năm cũ dùng năm của lớp (không lấy niên khóa hiện tại)
function classYearRange(c) {
  const cy = c && c.year != null && !isNaN(Number(c.year)) ? Number(c.year) : null, y = S.year;
  if (y && y.start_date && y.end_date && (cy == null || cy === Number(y.year))) return { start: y.start_date, end: y.end_date, long: y.long_year, year: Number(y.year), current: true };
  // năm học hiện tại suy từ hôm nay (bắt đầu ~tháng 8) — dùng khi API niên khóa lỗi
  const now = new Date(), Y = now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
  if (cy != null) return { start: `${cy}-08-20`, end: `${cy + 1}-06-20`, long: (c && c.long_year) || `${cy} - ${cy + 1}`, year: cy, current: !y && cy === Y };
  return { start: `${Y}-08-20`, end: `${Y + 1}-06-20`, long: `${Y} - ${Y + 1}`, year: Y, current: true };
}
// Tất cả Chúa Nhật trong 1 khoảng niên khóa (mặc định: niên khóa hiện tại)
function academicSundays(range) {
  const r = range || classYearRange(null); if (!r) return [];
  const out = []; const d = new Date(r.start + "T00:00:00"), end = new Date(r.end + "T00:00:00");
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1); // Chúa Nhật đầu tiên
  while (d <= end) { out.push(toISO(d)); d.setDate(d.getDate() + 7); }
  return out;
}
// Chúa Nhật gần hôm nay nhất trong niên khóa (lớp năm cũ -> Chúa Nhật cuối của năm đó)
function defaultSunday(range) {
  const list = academicSundays(range);
  if (!list.length) return todaySunday();
  const now = Date.now();
  let best = list[0], bd = Infinity;
  for (const s of list) { const diff = Math.abs(new Date(s + "T00:00:00").getTime() - now); if (diff < bd) { bd = diff; best = s; } }
  return best;
}

// ---------- theme ----------
function applyTheme(mode) {
  const r = document.documentElement;
  r.classList.remove("auto-dark"); r.removeAttribute("data-theme");
  if (mode === "light" || mode === "dark") r.setAttribute("data-theme", mode);
  else if (window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches) r.classList.add("auto-dark");
  const dark = mode === "dark" || (mode !== "light" && window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches);
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) { let col = ""; try { col = getComputedStyle(r).getPropertyValue(dark ? "--bg" : "--brand").trim(); } catch {} m.setAttribute("content", col || (dark ? "#20262D" : "#17544a")); }
}
const themeMode = () => store.get("bgl-theme", "system");
// ---------- màu chủ đạo theo LỚP ĐANG DẠY (màu khăn) ----------
function classThemeKey(c) {
  const t = noAccent((c && (c.family || c.name)) || "");
  if (t.includes("khai tam") || t.includes("chien con")) return "pink";
  if (t.includes("ruoc le")) return "green";
  if (t.includes("them suc")) return "blue";
  if (t.includes("bao dong")) return "gold";
  if (t.includes("vao doi")) return "brown";                               // Vào Đời: nâu
  if (t.includes("ho tro") || t.includes("vong ngoai")) return "black";     // Hỗ Trợ / Vòng Ngoài: đen
  return "";
}
function applyClassTheme(key, persist) {
  const r = document.documentElement;
  if (key) r.setAttribute("data-class", key); else r.removeAttribute("data-class");
  if (persist) store.set("bgl-class-theme", key || "");
  applyTheme(themeMode());
}
const currentClassTheme = () => document.documentElement.getAttribute("data-class") || "";
applyClassTheme(store.get("bgl-class-theme", ""), false);   // trước đăng nhập: dùng màu lớp lần trước
if (window.matchMedia) matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", () => applyTheme(themeMode()));

// ---------- hiệu ứng động (mặc định BẬT; máy yếu ≤4 GB RAM hoặc ≤4 nhân mà chưa tự chọn -> mặc định TẮT) ----------
function lowEndDevice() { const n = navigator; return (n.deviceMemory > 0 && n.deviceMemory <= 4) || (n.hardwareConcurrency > 0 && n.hardwareConcurrency <= 4); }
function effectsOn() { let v = null; try { v = localStorage.getItem("bgl-effects"); } catch {} return v != null ? v !== "0" : !lowEndDevice(); }
document.documentElement.classList.toggle("no-fx", !effectsOn());
function makeSparkles(host, n = 40) {
  if (!host) return;
  let h = "";
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 100).toFixed(2), y = (Math.random() * 100).toFixed(2);
    const sz = (Math.random() * 2.4 + 1.1).toFixed(1);
    const dl = (Math.random() * 4).toFixed(2), du = (Math.random() * 3 + 2.4).toFixed(2);
    const gold = Math.random() < 0.35 ? "background:radial-gradient(circle,#f0d488,rgba(240,212,136,0));" : "";
    h += `<i style="left:${x}%;top:${y}%;width:${sz}px;height:${sz}px;animation-delay:${dl}s;animation-duration:${du}s;${gold}"></i>`;
  }
  host.innerHTML = h;
}
function toggleEffects(on) { try { localStorage.setItem("bgl-effects", on ? "1" : "0"); } catch {} document.documentElement.classList.toggle("no-fx", !on); toast(on ? "Đã bật hiệu ứng" : "Đã tắt hiệu ứng"); }
function perfSheet() {
  const on = effectsOn();
  openSheet(`<h3>Hiệu năng &amp; hiệu ứng</h3>
    <p class="muted" style="margin:-6px 2px 16px;font-size:14px">Hiệu ứng động (lấp lánh nền đăng nhập, quầng sáng, chuyển cảnh mượt). Tắt nếu máy yếu hoặc muốn tiết kiệm pin.</p>
    <label class="check" style="margin:0 2px 4px"><input type="checkbox" ${on ? "checked" : ""} onchange="toggleEffects(this.checked)"><span class="box">${ic("check", 14)}</span><span>Bật hiệu ứng động</span></label>`);
}
window.toggleEffects = toggleEffects; window.perfSheet = perfSheet;

// ---------- icons ----------
const IC = {
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  pin: '<path d="M12 21s-7-6.3-7-11a7 7 0 0 1 14 0c0 4.7-7 11-7 11z"/><circle cx="12" cy="10" r="2.6"/>',
  cake: '<path d="M4 21h16"/><path d="M5 21v-7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7"/><path d="M4 15.6c1.6 0 1.6 1.2 3.2 1.2s1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2 1.6-1.2 3.2-1.2 1.6 1.2 3.2 1.2"/><path d="M12 8V5"/>',
  warn: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  frown: '<circle cx="12" cy="12" r="10"/><path d="M8 15.5c1-1.3 2.4-2 4-2s3 .7 4 2"/><path d="M9 9.5h.01"/><path d="M15 9.5h.01"/>',
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M6 3v16"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8"/><path d="M17.5 14.5A5.5 5.5 0 0 1 21 20"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  kids: '<circle cx="12" cy="13" r="8"/><path d="M11.2 5.1c.1-1.7 1.6-2.9 3.4-2.6"/><path d="M9 12h.01M15 12h.01"/><path d="M9.5 15.6c1.4 1.3 3.6 1.3 5 0"/>',   // mặt em nhỏ (chỏm tóc) — tab Học sinh
  back: '<path d="M15 5l-7 7 7 7"/>',
  check: '<path d="M4 12.5l5 5L20 6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4-4"/>',
  cal: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 2.5v4M16 2.5v4"/>',
  chev: '<path d="M9 6l6 6-6 6"/>',
  key: '<circle cx="8" cy="12" r="4"/><path d="M12 12h9M18 12v4M15 12v3"/>',
  logout: '<path d="M15 4h4v16h-4"/><path d="M11 8l-4 4 4 4M7 12h9"/>',
  swipe: '<rect x="7" y="3" width="10" height="16" rx="3"/><path d="M12 21v0"/><path d="M20 9l2 2-2 2"/>',
  cols: '<rect x="3" y="4" width="7" height="16" rx="1.5"/><rect x="14" y="4" width="7" height="16" rx="1.5"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  arrowU: '<path d="M12 19V5M6 11l6-6 6 6"/>', arrowD: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>', arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  tap: '<path d="M9 11V6.5a1.5 1.5 0 0 1 3 0V11"/><path d="M12 11V4.5a1.5 1.5 0 0 1 3 0V12"/><path d="M15 12V7.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-1.5a5 5 0 0 1-3.6-1.5L4 16.2s1.2-1.3 2.8-.6L9 17"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', edit: '<path d="M4 20h4L18.5 9.5a2 2 0 0 0-3-3L5 17z"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9a1.7 1.7 0 0 0 1.56 1.03H21a2 2 0 1 1 0 4h-.09A1.7 1.7 0 0 0 19.4 15z"/>',
  finger: '<path d="M12 11v5.5M8.5 12v2.5M15.5 11.5V15a5 5 0 0 1-.5 2.2"/><path d="M5.5 10a6.5 6.5 0 0 1 12.6-1.5"/><path d="M6 15c0 1.5.3 3 1 4"/>',
  phone: '<path d="M4 5c0-1 .8-2 2-2h1.6c.5 0 .9.3 1 .8l.7 3c.1.5-.1 1-.5 1.3l-1.3 1a12 12 0 0 0 5.4 5.4l1-1.3c.3-.4.8-.6 1.3-.5l3 .7c.5.1.8.5.8 1V19c0 1.2-1 2-2 2A16 16 0 0 1 4 5z"/>',
  chat: '<path d="M20 12a8 8 0 0 1-11.5 7.2L4 20l.8-4.5A8 8 0 1 1 20 12z"/>',
  cam: '<path d="M4 8a2 2 0 0 1 2-2h1.5l1-1.5h5l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="12" cy="12.5" r="3.2"/>',
  upload: '<path d="M12 15V4M7 9l5-5 5 5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
  trash: '<path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>',
  bug: '<path d="M8 8a4 4 0 0 1 8 0M6 12h12M12 8v10M6 12a6 6 0 0 0 12 0M4.5 8.5l2 1.5M19.5 8.5l-2 1.5M3.5 16l2.5-1M20.5 16l-2.5-1M4.5 20l2-2M19.5 20l-2-2"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/>',
  bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.6 2.2H4.4z"/><path d="M10 21a2 2 0 0 0 4 0"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16.5l-5.2-5.2L7 20"/>',
  share: '<path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M4 14v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  fire: '<path d="M12 22c4.4 0 7-2.8 7-6.6 0-3-1.7-5.2-3.4-7.1-.3 1.6-1.2 2.6-2.3 3.2.3-3.6-1.2-6.6-4.3-8.5.2 3.1-1.3 4.7-2.9 6.4C4.7 10.9 5 12.5 5 15.4 5 19.2 7.6 22 12 22z"/>',
  sparkle: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
  refresh: '<path d="M20 11.5A8 8 0 0 0 6.2 6.4L4 8.5"/><path d="M4 3.5v5h5"/><path d="M4 12.5a8 8 0 0 0 13.8 5.1l2.2-2.1"/><path d="M20 20.5v-5h-5"/>',
};
const ic = (n, w = 24) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ""}</svg>`;

// ---------- top progress bar ----------
// own: key tab đang "giữ" thanh (TabLoad vẽ % thật/ước lượng của tab đó) · null = progStart/progDone thường.
// progDone() thường không đụng thanh tab đang giữ: tab tự kết thúc (progEnd) hoặc bỏ khi rời tab (progDrop).
let _prog = { el: null, v: 0, t: null, h: null, own: null };
function progEl() { if (!_prog.el) { _prog.el = document.createElement("div"); _prog.el.className = "topbar"; document.body.appendChild(_prog.el); } return _prog.el; }
function progStart() { const e = progEl(); clearInterval(_prog.t); clearTimeout(_prog.h); _prog.own = null; _prog.v = 8; e.classList.add("run"); e.style.width = "8%"; _prog.t = setInterval(() => { _prog.v = Math.min(_prog.v + (90 - _prog.v) * 0.18, 90); e.style.width = _prog.v + "%"; }, 180); }
function progDone() { if (_prog.own) return; const e = progEl(); clearInterval(_prog.t); clearTimeout(_prog.h); e.style.width = "100%"; _prog.h = setTimeout(() => { e.classList.remove("run"); e.style.width = "0"; }, 260); }
function progSet(pct, own) { const e = progEl(); clearInterval(_prog.t); clearTimeout(_prog.h); _prog.own = own || null; _prog.v = Math.max(3, Math.min(100, pct)); e.classList.add("run"); e.style.width = _prog.v + "%"; }
function progEnd(own) { if (_prog.own !== own) return; _prog.own = null; progDone(); }   // tab đang giữ thanh tải xong -> chạy tới 100%
function progDrop(own) { if (_prog.own !== own) return; const e = progEl(); clearInterval(_prog.t); clearTimeout(_prog.h); _prog.own = null; e.classList.remove("run"); e.style.width = "0"; }   // rời tab -> thôi hiện

// ---------- mở app ngoài (gọi / sms / zalo) ----------
function openExternal(url) { try { if (window.Capacitor?.Plugins?.App) { location.href = url; } else window.open(url, "_system") || (location.href = url); } catch { location.href = url; } }
function zaloNum(n) { const d = String(n).replace(/[^0-9]/g, ""); return d.startsWith("0") ? "84" + d.slice(1) : d; }
function phoneSheet(num, who) {
  const n = String(num).replace(/\s/g, "");
  openSheet(`<h3>${esc(who || "Liên hệ")} · ${esc(n)}</h3>
    <div class="pickgrid">
      <button class="pickbtn" onclick="closeSheet();openExternal('tel:${jsq(n)}')"><span style="color:var(--present-t);display:inline-flex;align-items:center">${ic("phone",20)}</span> Gọi điện</button>
      <button class="pickbtn" onclick="closeSheet();openExternal('sms:${jsq(n)}')"><span style="color:var(--excused-t);display:inline-flex;align-items:center">${ic("chat",20)}</span> Nhắn tin</button>
      <button class="pickbtn clear" style="color:var(--brand-2)" onclick="closeSheet();openExternal('https://zalo.me/${zaloNum(n)}')">Mở Zalo</button>
    </div>`);
}
function phoneChip(num, who) { if (!num || num === "—" || num === "-") return `<b>—</b>`; const n = esc(String(num)); return `<b class="phone" onclick="event.stopPropagation();phoneSheet('${jsq(num)}','${jsq(who || "")}')">${n}</b>`; }
window.openExternal = openExternal; window.phoneSheet = phoneSheet;

// ---------- chrome (kiểu Liquid Glass) ----------
// Thanh trên: nút kính tròn (quay lại) · tiêu đề nhỏ hiện khi cuộn · cụm nút kính (chuông, tìm kiếm…)
// Tiêu đề LỚN nằm ngay dưới, cuộn theo nội dung.
function appbar({ title, sub, back, action, bell } = {}) {
  const backBtn = back ? `<button class="gbtn back" aria-label="Quay lại" onclick="${typeof back === "string" ? `go('${jsq(back)}')` : "history.back()"}">${ic("back", 20)}</button>` : `<span class="nb-sp"></span>`;
  const acts = (bell ? bellBtn() : "") + (action || "");
  return `<header class="nb"><div class="nb-in">${backBtn}<div class="nt">${esc(title || "")}</div>${acts ? `<div class="gcap">${acts}</div>` : `<span class="nb-sp"></span>`}</div></header>
    ${title ? `<div class="lt"><h1>${esc(title)}</h1>${sub ? `<div class="lt-sub">${esc(sub)}</div>` : ""}</div>` : ""}`;
}
// tiêu đề nhỏ + nền mờ mép trên chỉ hiện khi nội dung cuộn xuống dưới thanh
function syncScrollEdge() { document.documentElement.classList.toggle("scrolled", (window.scrollY || 0) > 30); }
window.addEventListener("scroll", syncScrollEdge, { passive: true });
// Segmented control: bong bóng trượt từ vị trí lần trước sang mục đang chọn (nhớ theo nhóm)
const SEGMEM = {};
function seg(group, items, active, style) {
  const from = SEGMEM[group] != null && SEGMEM[group] < items.length ? SEGMEM[group] : active; SEGMEM[group] = active;
  return `<div class="seg thumb" data-to="${active}" style="--n:${items.length};--i:${from};${style || ""}">${items.map(([, label, onclick], n) => `<button class="${n === active ? "on" : ""}" onclick="${onclick}">${label}</button>`).join("")}</div>`;
}
function animateSegs(host) {
  (host || document).querySelectorAll(".seg[data-to]").forEach((el) => {
    const to = el.dataset.to; el.removeAttribute("data-to");
    requestAnimationFrame(() => requestAnimationFrame(() => el.style.setProperty("--i", to)));
  });
}
// Biểu tượng lớp: viên kẹo bo tròn theo màu khăn của khối lớp
function classIcon(c) { const k = classThemeKey(c); return `<div class="cico ${k ? "t-" + k : ""}">${esc(initials((c && c.name) || ""))}</div>`; }
// Chuông thông báo (góc phải appbar) + badge số chưa đọc
function bellBtn() {
  const n = Notif.unread(); _bellLast = n;
  return `<button class="act bell ${n ? "has" : ""}" onclick="notifSheet()" aria-label="Thông báo">${ic("bell", 21)}<span class="badge" id="bellBadge" ${n ? "" : "hidden"}>${n > 99 ? "99+" : n}</span></button>`;
}
let _bellLast = -1;
function refreshBell() {
  const b = $("bellBadge"); if (!b) return;
  const n = Notif.unread(); b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  const btn = b.parentElement;
  if (btn) { btn.classList.toggle("has", n > 0); if (_bellLast >= 0 && n > _bellLast) { btn.classList.remove("ring"); void btn.offsetWidth; btn.classList.add("ring"); setTimeout(() => btn.classList.remove("ring"), 1300); } }
  _bellLast = n;
}
// ---------- thanh tab nổi: tạo 1 lần, bong bóng trượt giữa các tab, kéo ngang để chuyển ----------
const TABS = [["home", "Trang chủ", "#/home", "home"], ["book", "Lớp học", "#/classes", "classes"], ["kids", "Học sinh", "#/students", "students"], ["users", "Giáo lý viên", "#/teachers", "teachers"], ["user", "Tôi", "#/me", "me"]];
function tabbarEl() {
  let tb = $("tabbar"); if (tb) return tb;
  tb = document.createElement("nav"); tb.id = "tabbar"; tb.className = "tabbar"; tb.setAttribute("role", "tablist");
  tb.style.setProperty("--tabs", TABS.length);   // CSS chia cột + bề rộng bong bóng theo số tab
  tb.innerHTML = `<i class="tb-bubble"></i>` + TABS.map(([i, l, , k], n) => `<a role="tab" data-k="${k}" onclick="tabTo(${n})">${ic(i)}<span>${l}</span></a>`).join("");
  document.body.appendChild(tb); bindTabDrag(tb);
  return tb;
}
// key: tab đang mở · false: ẩn (đăng nhập) · undefined: giữ nguyên vị trí (màn đang tải)
function setTab(key) {
  const tb = tabbarEl(); tb.hidden = key === false;
  const n = TABS.findIndex((t) => t[3] === key); if (n < 0) return;
  tb._key = key; tb.style.setProperty("--ti", n);
  tb.querySelectorAll("a").forEach((a, i) => { a.classList.toggle("on", i === n); a.setAttribute("aria-selected", i === n ? "true" : "false"); });
}
function tabTo(n) {
  const t = TABS[n]; if (!t) return;
  haptic(8); setTab(t[3]);
  // tab có tải nền: bắt đầu tải NGAY lúc bấm — bấm liên tiếp thật nhanh thì các hashchange dồn lại, render() chỉ thấy hash cuối
  if ((location.hash !== t[2] || root.dataset.hash !== t[2]) && TabLoad.src[t[3]]) { TabLoad.focus(t[3]); TabLoad.load(t[3]); }
  if (location.hash !== t[2]) go(t[2]);
  else if (root.dataset.hash !== t[2]) render();                     // địa chỉ đúng mà màn đang hiện lại khác -> vẽ lại
  else window.scrollTo({ top: 0, behavior: "smooth" });              // bấm lại tab đang mở -> cuộn lên đầu
}
function bindTabDrag(tb) {
  let sx = null, moved = false, left = 0, w = 0, last = -1;
  const at = (x) => Math.max(0, Math.min(TABS.length - 1, Math.floor((x - left) / w)));
  // ô tab = (khung trong − padding 4px mỗi bên) / số tab — trừ cả viền 1px để khớp lưới CSS & bong bóng
  tb.addEventListener("pointerdown", (e) => { const r = tb.getBoundingClientRect(), bl = tb.clientLeft || 0, iw = tb.clientWidth || r.width - 2 * bl; left = r.left + bl + 4; w = (iw - 8) / TABS.length; sx = e.clientX; moved = false; last = -1; });
  tb.addEventListener("pointermove", (e) => {
    if (sx == null || (!moved && Math.abs(e.clientX - sx) < 10)) return;
    if (!moved) { moved = true; tb.classList.add("drag"); try { tb.setPointerCapture(e.pointerId); } catch {} }
    tb.style.setProperty("--dx", Math.max(0, Math.min(w * (TABS.length - 1), e.clientX - left - w / 2)) + "px");
    const n = at(e.clientX); if (n !== last) { last = n; haptic(6); tb.querySelectorAll("a").forEach((a, i) => a.classList.toggle("on", i === n)); }
  });
  const end = (e, cancel) => {
    if (sx == null) return; const was = moved; sx = null; moved = false; tb.classList.remove("drag");
    if (!was) return;
    tb._swallowUntil = Date.now() + 400;   // nuốt cú "click" trình duyệt bắn ra sau khi kéo
    if (cancel) { setTab(tb._key); return; }
    tabTo(at(e.clientX));
  };
  tb.addEventListener("pointerup", (e) => end(e, false));
  tb.addEventListener("pointercancel", (e) => end(e, true));
  tb.addEventListener("click", (e) => { if (Date.now() < (tb._swallowUntil || 0)) { e.stopPropagation(); e.preventDefault(); } }, true);
}
window.tabTo = tabTo;
// ---------- TẢI NỀN cho tab (Lớp học, Giáo lý viên, …) + badge % nhỏ trên icon tab ----------
// run(key, fn, o): fn(prog) trả Promise dữ liệu; gọi prog(%) hoặc prog(xong, tổng) để báo tiến độ THẬT
//   (tải nhiều request: gọi prog(0, n) ngay đầu rồi prog(i, n) sau mỗi request — % tự nhích dần trong từng bước).
//  · gọi lại khi đang chạy -> trả CHÍNH promise đó (không gọi API lần 2)
//  · xong là o.save(data) NGAY, dù người dùng đã sang tab khác (NAV/stale() chỉ chặn VẼ, không bỏ dữ liệu)
//  · không báo % thật -> % ước lượng: tiến dần tới ~90% theo thời gian đo lần trước (nhớ localStorage, mặc định 2s), xong nhảy 100%
// Badge chỉ hiện khi tab đang tải lần đầu (chưa có cache — làm mới cache thì im lặng) VÀ người dùng không đứng ở tab đó.
//  Xong lúc ở xa -> xanh ✓ ~0,7s rồi trượt xuống biến mất · lỗi -> đỏ "!" rồi ẩn (mở tab sẽ thấy hộp lỗi + Thử lại).
//  Đang đứng ở tab -> không badge, thanh tiến độ trên cùng chạy theo % của tab.
// Treo (mạng chết, không trả cũng không lỗi): IDLE_MS không có tiến độ -> coi là lỗi (hộp lỗi + Thử lại), kết quả về muộn bị bỏ.
const TabLoad = {
  st: {}, src: {}, cur: null, gen: 0,
  DEF_MS: 2000, CAP: 90, TICK: 120, OK_MS: 700, ERR_MS: 1300, OUT_MS: 300, FRESH_MS: 15000, IDLE_MS: 45000, MS_KEY: "bgl-tabload-ms",
  def(key, src) { this.src[key] = src; },                 // src: { data() -> cache hiện có | null, fetch(prog) -> Promise, save(data) }
  running(key) { const s = this.st[key]; return !!(s && s.running); },
  takeErr(key) { const s = this.st[key], e = s && s.err; if (s) s.err = null; return e || null; },   // lỗi chưa ai báo (lấy 1 lần)
  estMs(key) { const m = store.get(this.MS_KEY, {}), v = Number(m && m[key]); return v > 0 ? v : this.DEF_MS; },
  // dữ liệu vừa sửa trong app (vd. đổi kết quả 1 em) -> lần vào tab sau tải lại · đang tải dở -> xong cũng không tính là "vừa tải"
  invalidate(key) { const s = this.st[key]; if (s) { s.okAt = 0; if (s.running) s.redo = true; } },
  saveMs(key, ms) { let m = store.get(this.MS_KEY, {}); if (!m || typeof m !== "object") m = {}; m[key] = Math.round(Math.max(300, Math.min(60000, ms))); store.set(this.MS_KEY, m); },
  // Vào tab: đang tải -> dùng chung · lỗi lúc ở xa chưa báo (chưa có cache) -> null: màn hiện hộp lỗi + Thử lại trước, không tự tải lại
  // · có cache vừa tải (< FRESH_MS) -> null (khỏi tải) · có cache -> làm mới im lặng · chưa có -> tải lần đầu
  load(key) {
    const src = this.src[key], s = this.st[key]; if (!src) return null;
    if (s && s.running) return s.p;
    const has = src.data() != null;
    if (s && s.err && !has) return null;
    if (has && s && s.okAt && Date.now() - s.okAt < this.FRESH_MS) return null;
    return this.run(key, src.fetch, { silent: typeof src.silent === "function" ? !!src.silent() : has, save: src.save });   // tab tự quyết (vd Học sinh: còn thiếu -> hiện %)
  },
  run(key, fn, o = {}) {
    const old = this.st[key]; if (old && old.running) return old.p;
    if (old) this.unflash(key);
    const gen = this.gen, s = this.st[key] = { pct: 0, ceil: 0, running: true, err: null, startedAt: Date.now(), silent: !!o.silent, real: false, est: this.estMs(key), okAt: old ? old.okAt : 0, flash: null, t: null, ft: null, wd: null, redo: false };
    let rej; const tmo = new Promise((_, r) => { rej = r; });
    const arm = () => { clearTimeout(s.wd); s.wd = setTimeout(() => rej(new Error("Máy chủ không phản hồi — kiểm tra mạng rồi thử lại.")), this.IDLE_MS); };   // mỗi lần có tiến độ -> hẹn lại
    arm();
    const prog = (done, total) => {
      if (!s.running || gen !== this.gen) return;
      arm();
      const n = Number(total) > 0 ? Number(total) : 0, v = n ? (Number(done) / n) * 100 : Number(done); if (!isFinite(v)) return;
      s.real = true; s.pct = Math.max(s.pct, Math.min(99, Math.max(0, v)));
      s.ceil = n ? Math.max(s.pct, Math.min(99, ((Number(done) + 1) / n) * 100)) : s.pct;   // trần = hết bước đang chạy
      this.sync(key);
    };
    s.t = setInterval(() => this.tick(key, s), this.TICK);
    s.p = Promise.race([new Promise((res) => res(fn(prog))), tmo])
      .then((data) => { clearTimeout(s.wd); if (gen === this.gen) { if (o.save) o.save(data); this.end(key, s, null); } return data; })
      .catch((e) => { clearTimeout(s.wd); e = e || new Error("Lỗi tải dữ liệu"); if (gen === this.gen && s.running) this.end(key, s, e); throw e; });
    s.p.catch(() => {});                                   // người dùng đã đi, không ai chờ -> không báo "unhandled"
    this.sync(key);
    return s.p;
  },
  end(key, s, err) {
    clearInterval(s.t); s.running = false;
    if (err) s.err = err; else { s.err = null; s.pct = 100; s.okAt = s.redo ? 0 : Date.now(); s.redo = false; this.saveMs(key, Date.now() - s.startedAt); }
    if (this.cur === key) { progEnd(key); this.badge(key, null); }   // đang ở tab: chỉ thanh trên cùng chạy nốt
    else if (!s.silent) this.flash(key, err ? "err" : "ok");
    else this.badge(key, null);
  },
  // ước lượng: CAP·(1 − e^(−2,2·t/T)) — tới t = T (lần đo trước) ≈ 80%, không bao giờ vượt CAP; % thật: nhích dần tới trần của bước
  tick(key, s) {
    if (!s.running) return;
    const v = s.real ? s.pct + (s.ceil - s.pct) * 0.06 : this.CAP * (1 - Math.exp((-2.2 * (Date.now() - s.startedAt)) / s.est));
    if (v > s.pct + 0.05) { s.pct = Math.min(s.real ? 99 : this.CAP, v); this.sync(key); }
  },
  // render() báo tab (route gốc) đang đứng — rời tab đang tải thì thanh trên cùng thôi hiện % của nó, các tab khác hiện badge
  focus(k) {
    k = k || null; const prev = this.cur; if (prev === k) return; this.cur = k;
    if (prev) progDrop(prev);
    if (k) this.unflash(k);
    Object.keys(this.st).forEach((x) => this.sync(x));
  },
  sync(key) {
    const s = this.st[key]; if (!s) return;
    const here = this.cur === key;
    if (s.running && here) progSet(s.pct, key);
    if (s.flash) return;                                   // đang nháy ✓ / ! -> hẹn giờ tự ẩn
    this.badge(key, s.running && !s.silent && !here ? Math.floor(s.pct) + "%" : null, "");
  },
  flash(key, kind) {
    const s = this.st[key]; if (!s) return; this.unflash(key);
    const txt = kind === "ok" ? "✓" : "!";
    if (!this.badge(key, txt, kind)) return;               // chưa có thanh tab -> thôi
    s.flash = kind;
    s.ft = setTimeout(() => {
      if (!this.fx()) return this.unflash(key);            // tắt hiệu ứng: ẩn luôn, không trượt
      this.badge(key, txt, kind + " out");
      s.ft = setTimeout(() => this.unflash(key), this.OUT_MS);
    }, kind === "ok" ? this.OK_MS : this.ERR_MS);
  },
  unflash(key) { const s = this.st[key]; if (!s) return; clearTimeout(s.ft); s.ft = null; if (s.flash) { s.flash = null; this.badge(key, null); } },
  badge(key, text, cls) {
    const a = this.tabEl(key); if (!a) return null;
    let b = a.querySelector(".tb-pct");
    if (text == null) { if (b) b.remove(); return null; }
    if (!b) { b = document.createElement("b"); a.appendChild(b); }
    const c = "tb-pct" + (cls ? " " + cls : ""); if (b.className !== c) b.className = c;
    if (b.textContent !== text) b.textContent = text;
    return b;
  },
  tabEl(key) { try { const tb = document.getElementById("tabbar"); return (tb && tb.querySelector(`a[data-k="${key}"]`)) || null; } catch { return null; } },
  fx() { try { return !document.documentElement.classList.contains("no-fx"); } catch { return true; } },
  // đăng xuất: bỏ hết (lượt đang chạy của tài khoản cũ xong cũng không lưu)
  reset() {
    this.gen++;
    Object.keys(this.st).forEach((k) => { const s = this.st[k]; clearInterval(s.t); clearTimeout(s.ft); clearTimeout(s.wd); s.running = false; s.flash = null; this.badge(k, null); progDrop(k); });
    this.st = {}; this.cur = null;
    try { document.getElementById("tabbar").querySelectorAll(".tb-pct").forEach((b) => b.remove()); } catch {}   // phòng hờ: không còn badge nào của mọi tab (kể cả tab thêm sau)
  },
};
window.TabLoad = TabLoad;
// ---------- chống "màn cũ vẽ đè": mỗi lần điều hướng NAV tăng 1; màn nào tải API xong mà
// người dùng đã sang màn khác (NAV đổi) thì bỏ kết quả, không vẽ đè lên màn đang xem ----------
let NAV = 0;
const stale = (t) => t !== NAV;
function paint(html, navKey) {
  root.innerHTML = html; root.dataset.hash = location.hash; setTab(navKey);
  const m = root.querySelector("main"); if (m) m.classList.add("fade-in");
  animateSegs(root); syncScrollEdge();
}
function hideBoot() { const b = $("boot"); if (!b) return; b.classList.add("out"); setTimeout(() => b.remove(), 420); }
setTimeout(hideBoot, 12000);  // phòng hờ: không để kẹt màn khởi động
function screen(html, navKey) { paint(html, navKey); progDone(); hideBoot(); }
function skelCard() { return `<div class="card pad"><div class="row"><div class="skel" style="width:46px;height:46px;border-radius:50%"></div><div class="grow"><div class="skel" style="height:11px;width:38%;margin-bottom:9px"></div><div class="skel" style="height:16px;width:66%"></div></div></div><div class="skel" style="height:58px;margin-top:14px"></div></div>`; }
function skeleton(navKey) { paint(appbar({}) + `<main><div class="wrap stack">${skelCard()}${skelCard()}${skelCard()}</div></main>`, navKey); }   // khung xương, không tự chạy thanh tiến độ
function loading(navKey) { progStart(); skeleton(navKey); }
function haptic(ms = 12) { if (effectsOn() && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } }
function emptyBox(icon, msg, sub) { return `<div class="empty"><div class="big">${icon}</div><div style="font-weight:600;color:var(--ink)">${esc(msg)}</div>${sub ? `<div style="margin-top:6px">${esc(sub)}</div>` : ""}</div>`; }
const ERR_VN = { Forbidden: "Tài khoản của bạn không có quyền xem mục này.", "Not Found": "Không tìm thấy dữ liệu.", "Failed to fetch": "Không kết nối được máy chủ — kiểm tra mạng." };
function errBox(msg) {
  if (msg === "Forbidden") return emptyBox(ic("key", 44), ERR_VN.Forbidden, "Chỉ xem được dữ liệu của lớp / người mình được phân công.");
  return `<div class="empty"><div class="big">${ic("warn",44)}</div><div>${esc(ERR_VN[msg] || msg)}</div><div style="margin-top:16px"><button class="btn sm ghost" onclick="render()">Thử lại</button></div></div>`;
}
// Lớp đã có trong danh sách lớp / phân công (dùng khi API chi tiết lớp từ chối)
function knownClass(id) {
  const k = String(id), hit = (c) => c && String(c.id) === k;
  return (S._classes || []).find(hit) || ((S.myAssignments || []).map((t) => t.classroom).find(hit)) || ((S._teachers || []).map((t) => t.classroom).find(hit)) || null;
}

// ---------- sheet ----------
let _sheetT = null;
// sheet._onClose: chạy 1 lần khi sheet bị đóng / bị sheet khác thay (vd. huỷ tải bản cập nhật)
function sheetGone(s) { const f = s && s._onClose; if (!f) return; s._onClose = null; try { f(); } catch {} }
function openSheet(html) {
  clearTimeout(_sheetT); sheetGone($("sheet"));
  $("sheetHost").innerHTML = `<div class="sheet" id="sheet" role="dialog" aria-modal="true"><div class="sheet-drag"></div><div class="grip"></div><button class="sheet-x" aria-label="Đóng" onclick="closeSheet()">${ic("x", 18)}</button>${html}</div>`;
  const sh = $("sheet"); bindSheetDrag(sh);
  requestAnimationFrame(() => { if (sh.isConnected) sh.classList.add("on"); $("scrim").classList.add("on"); animateSegs(sh); });
}
// Vuốt mép trên của sheet xuống để đóng (giống sheet iOS)
function bindSheetDrag(sh) {
  const zone = sh.querySelector(".sheet-drag"); let sy = null, dy = 0, t0 = 0;
  zone.addEventListener("pointerdown", (e) => { if (sh.scrollTop > 0) return; sy = e.clientY; dy = 0; t0 = Date.now(); sh.style.transition = "none"; try { zone.setPointerCapture(e.pointerId); } catch {} });
  zone.addEventListener("pointermove", (e) => { if (sy == null) return; dy = Math.max(0, e.clientY - sy); sh.style.transform = `translateY(${dy}px)`; });
  const end = () => {
    if (sy == null) return; sy = null; sh.style.transition = ""; sh.style.transform = "";
    if (dy > 110 || dy / Math.max(1, Date.now() - t0) > 0.65) closeSheet();
  };
  zone.addEventListener("pointerup", end); zone.addEventListener("pointercancel", end);
}
function closeSheet() { const s = $("sheet"); if (s) { s.classList.remove("on"); s.dataset.closing = "1"; sheetGone(s); } $("scrim").classList.remove("on"); clearTimeout(_sheetT); _sheetT = setTimeout(() => { $("sheetHost").innerHTML = ""; }, 260); }
$("scrim").addEventListener("click", closeSheet);
window.closeSheet = closeSheet; window.go = go; window.render = render;

// ============================================================
//  THÔNG BÁO TRONG APP (lưu trên máy, theo tài khoản)
//  kind: confirm | error | streak | lost | info — href: nơi cần đến khi bấm
// ============================================================
const Notif = {
  key() { return "bgl-notifs-" + ((S.user && S.user.id) || "x"); },
  all() { const a = store.get(this.key(), []); return Array.isArray(a) ? a : []; },
  save(list) { if (!store.set(this.key(), list.slice(0, 100))) { if (!this._warned) { this._warned = true; toast(QUOTA_MSG, 3200); } } refreshBell(); },
  unread() { return this.all().filter((n) => !n.read).length; },
  add(n) {
    const list = this.all(), now = Date.now();
    // chống trùng: cùng loại + cùng tiêu đề + cùng đích trong 2 phút -> thay bản cũ
    const dup = list.findIndex((x) => x.kind === n.kind && x.href === n.href && x.title === n.title && now - x.t < 120000);
    if (dup >= 0) list.splice(dup, 1);
    list.unshift({ id: now.toString(36) + Math.random().toString(36).slice(2, 6), t: now, read: false, kind: n.kind || "info", title: n.title || "", body: n.body || "", href: n.href || "" });
    this.save(list);
  },
  markRead(id) { const l = this.all(), x = l.find((n) => n.id === id); if (x && !x.read) { x.read = true; this.save(l); } },
  readAll() { this.save(this.all().map((n) => Object.assign(n, { read: true }))); },
  clear() { this.save([]); },
};
const NK = { confirm: ["check", "var(--present-t)", "var(--present-b)"], error: ["bug", "var(--unexcused-t)", "var(--unexcused-b)"], streak: ["fire", "var(--gold-2)", "var(--gold-soft)"], lost: ["fire", "var(--unexcused-t)", "var(--unexcused-b)"], info: ["bell", "var(--ink-soft)", "var(--surface-2)"] };
function fmtWhen(t) {
  const d = new Date(t), now = new Date(), hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const day = toISO(d), y = new Date(now); y.setDate(y.getDate() - 1);
  return day === toISO(now) ? `Hôm nay · ${hm}` : day === toISO(y) ? `Hôm qua · ${hm}` : `${fmtDate(day)} · ${hm}`;
}
function notifSheet() {
  const list = Notif.all();
  const rows = list.map((n) => {
    const [icn, col, bg] = NK[n.kind] || NK.info;
    return `<button class="ntf ${n.read ? "" : "unread"}" onclick="openNotif('${n.id}')">
      <span class="ntf-ic" style="color:${col};background:${bg}">${ic(icn, 18)}</span>
      <div class="grow"><div class="ntf-t">${esc(n.title)}</div>${n.body ? `<div class="ntf-b">${esc(n.body)}</div>` : ""}<div class="ntf-w">${fmtWhen(n.t)}</div></div>
      ${n.href ? `<span class="list-arrow">${ic("chev", 16)}</span>` : ""}</button>`;
  }).join("");
  const unread = Notif.unread();
  openSheet(`<h3 style="margin-bottom:${list.length ? 10 : 14}px">Thông báo${unread ? ` <span class="chip st-late" style="vertical-align:3px;padding:3px 8px">${unread} mới</span>` : ""}</h3>
    ${list.length ? `<div class="ntf-actions">${unread ? `<button class="btn ghost sm" onclick="Notif.readAll();notifSheet()">${ic("check", 14)} Đã đọc hết</button>` : ""}
      <button class="btn ghost sm" id="ntfClear" style="color:var(--danger)" onclick="clearNotifs()">${ic("trash", 14)} Xoá tất cả</button></div>` : ""}
    <div class="card divlist" style="overflow:hidden;max-height:62vh;overflow-y:auto">${rows || `<div class="empty" style="padding:36px 20px"><div class="big">${ic("bell",44)}</div><div style="font-weight:600;color:var(--ink)">Chưa có thông báo</div><div style="margin-top:6px;font-size:13.5px">Lưu điểm danh xong, đạt hoặc mất chuỗi học… sẽ báo ở đây.</div></div>`}</div>`);
}
function clearNotifs() {
  const b = $("ntfClear");
  if (b && !b.dataset.arm) { b.dataset.arm = "1"; b.innerHTML = `${ic("trash", 14)} Chắc chắn xoá?`; b.style.background = "var(--danger)"; b.style.color = "#fff"; b.style.borderColor = "var(--danger)"; setTimeout(() => { const x = $("ntfClear"); if (x && x.dataset.arm) notifSheet(); }, 3000); return; }
  Notif.clear(); toast("Đã xoá tất cả thông báo"); notifSheet();
}
function openNotif(id) {
  const n = Notif.all().find((x) => x.id === id); Notif.markRead(id);
  if (!n || !n.href) { notifSheet(); return; }
  closeSheet();
  if (location.hash === n.href) render(); else go(n.href);
}
window.Notif = Notif; window.notifSheet = notifSheet; window.clearNotifs = clearNotifs; window.openNotif = openNotif;

// ============================================================
//  LOGIN
// ============================================================
const AUTH_ERR = { "Invalid username or password": "Sai số điện thoại hoặc mật khẩu.", "Forbidden": "Tài khoản không có quyền truy cập." };
const trErr = (m) => AUTH_ERR[m] || m || "Đăng nhập thất bại.";
async function bioAvailable() { const B = window.Capacitor?.Plugins?.NativeBiometric; if (!B) return false; try { const r = await B.isAvailable(); return !!(r && r.isAvailable); } catch { return false; } }

let LOGIN_SAVED_U = "";   // SĐT thật của tài khoản đã lưu — ô nhập chỉ hiện bản che
function loginScreen(msg, msgType) {
  const cred = store.get("bgl-cred", null);
  LOGIN_SAVED_U = cred?.u || "";
  paint(`<main class="fade-in login-bg"><div class="sparkles" id="sparkles"></div>
    <div class="wrap" style="max-width:420px;margin:0 auto;padding-top:6vh;position:relative;z-index:2">
    <div style="text-align:center;margin-bottom:22px">
      <div class="logo-glow"><img src="assets/logo.png" alt=""/></div>
      <div class="eyebrow" style="margin-top:6px">Ban Giáo Lý · Điểm Danh</div>
      <h1 class="disp" style="font-size:30px;margin:6px 0 0">Chào mừng trở lại</h1>
      <p class="muted" style="margin:6px 0 0">Đăng nhập để điểm danh &amp; quản lý lớp</p>
    </div>
    <div class="login-card">
    <div class="field" style="margin-bottom:14px"><label>Số điện thoại</label>
      <input id="u" class="input num" inputmode="tel" autocomplete="username" placeholder="0867007***" value="${esc(maskPhone(LOGIN_SAVED_U))}"/></div>
    <div class="field"><label>Mật khẩu</label>
      <input id="p" class="input" type="password" autocomplete="current-password" placeholder="••••••" value="${esc(cred?.p || "")}"/></div>
    <label class="check"><input type="checkbox" id="remember" ${cred ? "checked" : ""}/><span class="box">${ic("check", 14)}</span><span>Lưu tài khoản trên máy này</span></label>
    <div id="authmsg"></div>
    <button class="btn" id="loginBtn" style="margin-top:18px">Đăng nhập</button>
    <button class="bio" id="bioBtn" hidden onclick="bioLogin()">${ic("finger", 20)} Đăng nhập bằng vân tay / FaceID</button>
    </div>
  </div></main>`, false);
  progDone(); hideBoot();
  if (effectsOn()) makeSparkles($("sparkles"));
  if (msg) showAuth(msg, msgType);
  $("loginBtn").onclick = () => doLogin();
  $("u").addEventListener("focus", (e) => { if (LOGIN_SAVED_U && e.target.value === maskPhone(LOGIN_SAVED_U)) setTimeout(() => e.target.select(), 0); });   // gõ số khác thì thay luôn bản che
  $("p").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  if (cred) bioAvailable().then((ok) => { const b = $("bioBtn"); if (ok && b) b.hidden = false; });
}
function showAuth(msg, type) { const a = $("authmsg"); if (!a) return; a.className = "authmsg " + (type === "ok" ? "ok" : "err"); a.innerHTML = (type === "ok" ? ic("check", 16) : "") + " " + esc(msg); }
async function doLogin(uSaved) {
  let u = (uSaved || $("u").value).trim(); const p = $("p").value, remember = $("remember")?.checked;
  if (!uSaved && LOGIN_SAVED_U && u === maskPhone(LOGIN_SAVED_U)) u = LOGIN_SAVED_U;   // ô đang hiện bản che → dùng SĐT thật đã lưu
  if (!u || !p) return showAuth("Nhập đủ số điện thoại và mật khẩu.", "err");
  const b = $("loginBtn"); b.disabled = true; b.innerHTML = `<span class="btnspin"></span> Đang đăng nhập…`;
  progStart();
  try {
    const user = await BGL.login(u, p);
    resetAccountData(); S.user = user;   // phòng hờ: không mang gì của phiên trước sang tài khoản vừa đăng nhập
    if (remember) await saveCred(u, p); else await clearCred();
    b.innerHTML = `${ic("check", 18)} Thành công`; showAuth("Đăng nhập thành công", "ok");
    await boot(); progDone(); setTimeout(() => go(landingHash()), 350);
  } catch (e) {
    progDone(); b.disabled = false; b.textContent = "Đăng nhập"; showAuth(trErr(e.message), "err");
    if (navigator.vibrate) navigator.vibrate(120);
  }
}
async function bioLogin() {
  const B = window.Capacitor?.Plugins?.NativeBiometric; const cred = await loadCred();
  if (!B || !cred) return;
  try { await B.verifyIdentity({ reason: "Đăng nhập Điểm Danh", title: "Xác thực", subtitle: "", description: "" }); $("p").value = cred.p; doLogin(cred.u); }
  catch { showAuth("Xác thực sinh trắc học thất bại.", "err"); }
}
window.doLogin = doLogin; window.bioLogin = bioLogin;

// Bỏ hết dữ liệu của tài khoản cũ (đăng xuất / đăng nhập tài khoản khác): cache các tab, lượt tải nền + badge mọi tab,
// mục Học sinh (students.js tự dọn cache/observer/hẹn giờ), lớp & người đã nhớ — người đăng nhập sau không thấy gì của người trước
function resetAccountData() {
  S._classes = S._teachers = S._students = S._studentsMeta = null; S.myAssignments = []; S.myClassId = null;
  TF.g = "*"; TF.q = "";                                  // lọc tab GLV
  TabLoad.reset();
  try { if (typeof window.resetStudents === "function") window.resetStudents(); } catch {}
  for (const k in CX) delete CX[k]; for (const k in PEOPLE) delete PEOPLE[k];
  PERSON_NAV = null;
}
async function doLogout() {
  closeSheet(); try { await BGL.logout(); } catch {}
  S.user = null; resetAccountData();
  NAV++; loginScreen();
}
window.doLogout = doLogout;

// ============================================================
//  HOME
// ============================================================
function baseRole() { const u = S.user || {}; return u.super_admin ? "Super Admin" : u.admin ? "Ban Điều Hành" : u.supervisor ? "Giám Sát" : "Giáo Lý Viên"; }
function myPosition() { const a = S.myAssignments || []; const p = a.map((x) => x.position).filter(Boolean); return [...new Set(p)].join(" · "); }
function myRole() { const pos = myPosition(); return pos ? `${baseRole()} · ${pos}` : baseRole(); }

async function homeScreen() {
  const u = S.user || {};
  const role = myRole();
  const myAssign = S.myAssignments || [];
  const hero = `<div class="hero" style="padding:18px 20px">
    <div class="row" style="align-items:flex-start">
      <div class="grow">
        <div class="eyebrow" style="font-size:10.5px">${esc(S.year ? S.year.long_year : "Niên khóa")}</div>
        <h2 style="font-size:21px;margin:4px 0 1px">${esc((u.person_name || "").split(" ").slice(-2).join(" ") || "Bạn")}</h2>
        <div style="opacity:.85;font-size:12.5px">${esc(u.person_christian_name || "")} · ${esc(role)}</div>
      </div>
      <div class="ava" style="width:52px;height:52px;background:rgba(255,255,255,.18);border-color:rgba(255,255,255,.3);color:#fff;box-shadow:inset 0 1px 0 rgba(255,255,255,.45)">${esc(initials(u.person_name))}</div>
    </div>
  </div>`;
  const myBlock = myAssign.length
    ? `<div class="sec-eyebrow"><span class="eyebrow">Lớp tôi phụ trách</span></div>
       <div class="stack">${myAssign.map((t) => classRowCard(t.classroom, t.position, true)).join("")}</div>`
    : `<div class="sec-eyebrow"><span class="eyebrow">Bắt đầu</span></div>
       <div class="card pad"><div class="muted">Bạn chưa được phân công lớp trong niên khóa này. Mở <a class="link" onclick="go('#/classes')">Lớp học</a> để xem tất cả.</div></div>`;
  screen(appbar({ title: "Trang chủ", bell: true, action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
    `<main><div class="wrap stack">${hero}
      <div class="row" style="gap:10px">
        <button class="btn" onclick="go('#/classes')">${ic("book", 18)} Các lớp</button>
        <button class="btn ghost" onclick="go('#/teachers')">${ic("users", 18)} GLV</button>
      </div>
      ${myBlock}
      <div id="homeUpd">${homeUpdCard()}</div>
    </div></main>`, "home");
}
function classRowCard(c, position, primary) {
  if (!c) return "";
  const ov = c.enrollments_overview || {};
  const active = ov["Đang Học"] || 0;
  return `<div class="card pad press" onclick="go('#/class/${c.id}')">
    <div class="row">
      ${classIcon(c)}
      <div class="grow">
        <div class="disp" style="font-size:18px">${esc(c.name)}</div>
        <div class="muted" style="font-size:12.5px">${esc(c.location || "—")}${position ? ` · ${esc(position)}` : ""}</div>
      </div>
      <div style="text-align:right"><div class="disp num" style="font-size:20px;color:var(--brand-2)">${active}</div><div class="faint" style="font-size:11px">thiếu nhi</div></div>
    </div>
    ${primary ? `<button class="btn gold sm" style="width:100%;margin-top:14px" onclick="event.stopPropagation();go('#/class/${c.id}/diemdanh')">${ic("swipe", 17)} Điểm danh nhanh</button>` : ""}
  </div>`;
}

// ============================================================
//  CLASSES
// ============================================================
// Màn gốc của tab tải nền (TabLoad): có cache -> vẽ ngay + làm mới im lặng ở nền · đang tải dở (bấm lúc trước rồi đi)
// -> khung xương + thanh tiến độ của CHÍNH lượt đó, không gọi API lần 2 · chưa tải -> bắt đầu · lỗi lúc ở tab khác -> hộp lỗi (Thử lại)
// o: { title, what (cho toast lỗi làm mới), draw(data) vẽ cả màn, update(data) khi làm mới thấy dữ liệu đổi }
async function tabScreen(key, o) {
  const t = NAV, old = TabLoad.src[key].data(), err = TabLoad.takeErr(key);
  const fail = (e) => screen(appbar({ title: o.title }) + `<main>${errBox(e.message)}</main>`, key);
  if (old == null && err && !TabLoad.running(key)) return fail(err);
  if (old != null) o.draw(old); else skeleton(key);
  const ld = TabLoad.load(key); TabLoad.sync(key);
  if (!ld) return;                                       // vừa tải xong ở nền -> khỏi tải lại
  try {
    const data = await ld;
    if (stale(t)) return;                                // đã sang màn khác: dữ liệu vẫn được lưu (TabLoad), chỉ không vẽ
    if (old == null) o.draw(data);
    else if (data !== old && JSON.stringify(data) !== JSON.stringify(old)) o.update(data);
  } catch (e) {
    if (stale(t)) return;                                // lỗi lúc ở tab khác -> badge đỏ; mở tab lần sau thấy hộp lỗi
    TabLoad.takeErr(key);                                // báo ngay tại đây rồi
    if (old != null) toast(`Không tải lại được ${o.what}: ` + (ERR_VN[e.message] || e.message));
    else fail(e);
  }
}
TabLoad.def("classes", { data: () => S._classes, fetch: () => BGL.classrooms(S.year && S.year.year), save: (list) => { S._classes = list; } });
function classesScreen() {
  return tabScreen("classes", {
    title: "Lớp học", what: "danh sách lớp",
    draw: (list) => screen(appbar({ title: "Lớp học", bell: true, action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
      `<main><div class="wrap">
        <label class="searchbar">${ic("search", 18)}<input id="clsq" placeholder="Lọc theo tên lớp…" oninput="filterClasses(this.value)"/></label>
        <div class="stack" id="clsList">${list.map((c) => classRowCard(c)).join("")}</div>
      </div></main>`, "classes"),
    update: () => { if ($("clsList")) filterClasses(($("clsq") || {}).value || ""); },
  });
}
function filterClasses(q) {
  const nq = noAccent(q);
  const list = (S._classes || []).filter((c) => noAccent(c.name).includes(nq) || noAccent(c.location).includes(nq));
  $("clsList").innerHTML = list.length ? list.map((c) => classRowCard(c)).join("") : emptyBox(ic("search",44), "Không có lớp khớp");
}
window.filterClasses = filterClasses;

// ============================================================
//  CLASS DETAIL
// ============================================================
const CX = {};
async function classScreen(id, tab, extra) {
  tab = tab || "thieunhi";
  const t = NAV;
  loading();
  let c;
  try { c = (CX[id] && CX[id].info) || (CX[id] = CX[id] || {}, CX[id].info = await BGL.classroom(id)); if (stale(t)) return; }
  catch (e) {
    if (stale(t)) return;
    // lớp không được xem chi tiết (403) -> dùng thông tin chung đã có trong danh sách lớp / phân công
    const known = e.status === 403 && knownClass(id);
    if (!known) { screen(appbar({ title: "Lớp", back: "#/classes" }) + `<main>${errBox(e.message)}</main>`); return; }
    c = CX[id].info = known; CX[id].limited = true;
  }
  const segs = [["thieunhi", "Thiếu nhi"], ["diemdanh", "Điểm danh"], ["glv", "Giáo lý viên"]];
  // Niên khóa hiển thị = niên khóa CỦA LỚP (lớp năm cũ trong Hành trình không còn hiện năm hiện tại)
  const yr = classYearRange(c), longYear = c.long_year || (yr && yr.long) || "";
  const oldYear = yr && !yr.current, active = (c.enrollments_overview || {})["Đang Học"];
  const pills = [
    c.location ? `<span class="ipill">${ic("pin", 16)} ${esc(c.location)}</span>` : "",
    active != null ? `<span class="ipill">${ic("users", 16)} ${active} đang học</span>` : "",
    oldYear ? `<span class="ipill gold">${ic("cal", 16)} Lớp năm cũ · dữ liệu lịch sử</span>` : "",
  ].join("");
  // ⋮ In / Xuất bảng (www/js/exports.js) — chỉ hiện cho GLV phụ trách lớp / Ban Điều Hành
  screen(appbar({ title: c.name, sub: longYear ? `Niên khóa ${longYear}` : "", back: "#/classes", bell: true, action: window.ClassExport ? ClassExport.menuBtn(id) : "" }) +
    `<main><div class="wrap">
      ${pills ? `<div class="pills">${pills}</div>` : ""}
      ${CX[id].limited ? `<div class="note"><span class="note-ic">${ic("key", 18)}</span><div><b>Chỉ xem thông tin chung</b><div>Tài khoản của bạn không được xem chi tiết lớp này. Danh sách thiếu nhi và điểm danh chỉ mở cho GLV phụ trách lớp.</div></div></div>` : ""}
      ${seg("class", segs.map(([k, l]) => [k, l, `go('#/class/${id}/${k}')`]), Math.max(0, segs.findIndex((s) => s[0] === tab)), "margin-bottom:16px")}
      <div id="tabBody"><div class="spin"></div></div>
    </div></main>`, "classes");
  if (tab === "thieunhi") tabStudents(id, extra);
  else if (tab === "diemdanh") tabAttendance(id);
  else tabTeachers(id);
}

// ---------- Tab: Thiếu nhi ----------
async function tabStudents(id, focusEid) {
  const t = NAV;
  try {
    const enr = CX[id].enr || (CX[id].enr = await BGL.classroomEnrollments(id));
    if (stale(t)) return;
    enr.forEach((e) => rememberPerson(e.person));
    const counts = {}; enr.forEach((e) => (counts[e.result] = (counts[e.result] || 0) + 1));
    const summary = `<div class="statgrid" style="margin-bottom:16px">${["Đang Học", "Nghỉ Luôn", "Lên Lớp", "Học Lại", "Chuyển Xứ"].map((k) => statTile(counts[k] || 0, k, STONE[k])).join("")}</div>`;
    const body = $("tabBody"); if (!body) return;
    body.innerHTML = bdayStrip(enr) + summary +
      `<label class="searchbar">${ic("search", 18)}<input id="stuQ" placeholder="Tìm tên thiếu nhi…" oninput="filterStudents('${id}',this.value)" value="${esc(CX[id].studentQ || "")}"/></label>
       <div class="stack" id="stuList"></div>`;
    renderStudentList(id);
    // Chuỗi học: tải điểm danh cả năm (nền) rồi điền vào ô
    loadClassAttendance(id).then(() => paintStreaks(id));
    // Đến từ thông báo -> cuộn tới & làm nổi thẻ thiếu nhi
    if (focusEid) setTimeout(() => { const el = $("stu-" + focusEid); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2500); } }, 60);
  } catch (e) { if (stale(t)) return; const b = $("tabBody"); if (b) b.innerHTML = errBox(e.message); }
}
// ---------- Sinh nhật tuần này: 7 ngày tới (tính cả hôm nay), qua cả cuối tháng / cuối năm · 29/2 -> 28/2 năm không nhuận ----------
function birthdaysSoon(enr, now) {
  const base = now ? new Date(now) : new Date(); base.setHours(0, 0, 0, 0);
  const out = [];
  (enr || []).forEach((e) => {
    const p = e.person || {}, m = String(p.birth_date || "").match(/^(\d{4})-(\d{2})-(\d{2})/); if (!m) return;
    for (let k = 0; k < 7; k++) {
      const d = new Date(base); d.setDate(base.getDate() + k);
      const leap = new Date(d.getFullYear(), 1, 29).getDate() === 29, bd = +m[2] === 2 && +m[3] === 29 && !leap ? 28 : +m[3];
      if (d.getMonth() + 1 === +m[2] && d.getDate() === bd) { out.push({ e, k, d: toISO(d), age: d.getFullYear() - +m[1] }); break; }
    }
  });
  return out.sort((a, b) => a.k - b.k);
}
// Thu gọn mặc định (1 dòng: "Sinh nhật tuần này · N em"), bấm mới mở danh sách nhỏ — giống thẻ Cần hỏi thăm
let bdayOpen = false;
function bdayToggle(b) { bdayOpen = !bdayOpen; const c = b && b.closest(".bday"); if (c) c.classList.toggle("open", bdayOpen); haptic(); }
function bdayStrip(enr) {
  const list = birthdaysSoon((enr || []).filter((e) => e.result !== "Nghỉ Luôn" && e.result !== "Chuyển Xứ"));
  if (!list.length) return "";
  const when = (x) => (x.k === 0 ? "Hôm nay" : x.k === 1 ? "Ngày mai" : `${weekdayVN(x.d)} ${fmtDate(x.d).slice(0, 5)}`);
  const today = list.filter((x) => x.k === 0).length;
  return `<div class="card bday${bdayOpen ? " open" : ""}" style="margin-bottom:12px">
    <button class="ask-head" onclick="bdayToggle(this)"><span class="grow"><span class="eyebrow" style="display:flex;align-items:center;gap:6px">${ic("cake", 14)} Sinh nhật tuần này · ${list.length} em${today ? ` · hôm nay ${today}` : ""}</span></span><span class="ask-chev">${ic("chev", 16)}</span></button>
    <div class="bday-body">${list.map((x) => { const p = x.e.person || {}; return `<button class="bday-it${x.k === 0 ? " today" : ""}" onclick="go('#/person/${p.id}')">${avatar(p, { size: 30, fs: 11 })}<span class="bn">${esc(p.name || p.full_name)}</span><span class="bw">${when(x)}${x.age > 0 && x.age < 40 ? ` · ${x.age} tuổi` : ""}</span></button>`; }).join("")}</div></div>`;
}
window.bdayToggle = bdayToggle;
function renderStudentList(id) {
  const box = $("stuList"); if (!box) return;
  const q = noAccent(CX[id].studentQ || "");
  const list = (CX[id].enr || []).filter((e) => !q || noAccent((e.person && (e.person.name || e.person.full_name)) || "").includes(q));
  box.innerHTML = list.map((e) => studentCard(e, id)).join("") || `<div class="empty" style="padding:34px">${CX[id].studentQ ? "Không tìm thấy “" + esc(CX[id].studentQ) + "”" : "Chưa có thiếu nhi"}</div>`;
}
function filterStudents(id, q) { CX[id].studentQ = q; renderStudentList(id); }
window.filterStudents = filterStudents;
const RESVAR = { "Đang Học": "--present-t", "Nghỉ Luôn": "--quit-t", "Lên Lớp": "--excused-t", "Học Lại": "--late-t", "Chuyển Xứ": "--quit-t" };
function studentCard(e, cid) {
  const p = e.person || {}, pd = (p.data && p.data.parents_info) || {};
  const att = e.attendance_status_counts || {};
  const gv = (n) => { const g = (e.grades || []).find((x) => x.name === n); return g && g.value != null && g.value !== "" ? g.value : "—"; };
  const gradeCols = [["Giữa HK 1", "GK 1"], ["Cuối HK 1", "CK 1"], ["Giữa HK 2", "GK 2"], ["Cuối HK 2", "CK 2"]];
  const evalC = e.evaluation && e.evaluation.content;
  return `<div class="card pad" id="stu-${e.id}">
    <div class="row">
      ${avatar(p, { tappable: true })}
      <div class="grow"><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}</div>
        <div class="nm" style="font-weight:700;font-size:${nmFs(p.name || p.full_name, 16)}px"><span class="link" onclick="go('#/person/${p.id}')">${esc(p.name || p.full_name)}</span></div></div>
      <button class="chip ${RESULT_CLS[e.result] || "st-quit"}" style="border:0" onclick="resultPicker('${cid}',${e.id},'${jsq(e.result || "")}')"><span class="dot"></span>${esc(e.result || "")} ${ic("chev", 13)}</button>
    </div>
    <div class="row" style="justify-content:space-between;margin:14px 2px 8px">
      <span class="eyebrow">Điểm số</span>
      <button class="btn ghost sm" style="padding:6px 12px" onclick="academicSheet('${cid}',${e.id})">${ic("edit", 15)} Nhập điểm</button>
    </div>
    <div class="statgrid">
      ${gradeCols.map(([n, sh]) => statTile(gv(n), sh, "gold")).join("")}
      ${statTile(e.average_grade ?? 0, "TB năm", "gold")}
    </div>
    <div class="eyebrow" style="margin:14px 2px 8px">Chuyên cần</div>
    <div class="statgrid">
      ${["Hiện Diện", "Vắng Lễ", "Có Phép", "Báo Trễ", "Không Phép"].map((k) => statTile(att[k] || 0, k, STONE[k])).join("")}
      ${streakTile(cid, e.id)}
    </div>
    ${evalC ? `<div class="eyebrow" style="margin:14px 2px 6px">Nhận xét</div><div class="muted" style="font-size:13.5px;line-height:1.5">${esc(evalC)}</div>` : ""}
    <div class="row muted" style="margin-top:14px;font-size:12.5px;gap:16px">
      <span class="muted">${ic("cake",14)} ${fmtDate(p.birth_date)}</span>
      <span class="muted">Cha ${phoneChip(pd.father_phone || p.phone, p.name || p.full_name)}</span>
      <span class="muted">Mẹ ${phoneChip(pd.mother_phone, p.name || p.full_name)}</span>
    </div>
  </div>`;
}
function academicSheet(cid, eid) {
  const enr = (CX[cid].enr || []).find((x) => x.id === eid); if (!enr) return;
  const p = enr.person || {};
  const gv = (n) => { const g = (enr.grades || []).find((x) => x.name === n); return g && g.value != null ? g.value : ""; };
  const names = ["Giữa HK 1", "Cuối HK 1", "Giữa HK 2", "Cuối HK 2"];
  const inputs = names.map((n, i) => `<div class="field"><label>${n}</label><input class="input num" id="gr${i}" inputmode="decimal" value="${esc(gv(n))}" placeholder="—"/></div>`).join("");
  const evalC = (enr.evaluation && enr.evaluation.content) || "";
  openSheet(`<h3>${esc(p.name || p.full_name)}</h3>
    <div class="eyebrow" style="margin:2px 2px 10px">Điểm số</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">${inputs}</div>
    <div class="eyebrow" style="margin:18px 2px 8px">Nhận xét</div>
    <textarea id="evalC" class="input" rows="3" style="resize:none;line-height:1.5" placeholder="Nhận xét về thiếu nhi…">${esc(evalC)}</textarea>
    <button class="btn" id="acsave" style="margin-top:16px" onclick="saveAcademic('${cid}',${eid})">${ic("check", 18)} Lưu</button>`);
}
async function saveAcademic(cid, eid) {
  const enr = (CX[cid].enr || []).find((x) => x.id === eid); if (!enr) return;
  const names = ["Giữa HK 1", "Cuối HK 1", "Giữa HK 2", "Cuối HK 2"];
  const btn = $("acsave"); btn.disabled = true; btn.innerHTML = `<span class="btnspin"></span> Đang lưu…`;
  progStart();
  const jobs = [];
  names.forEach((n, i) => {
    const raw = ($("gr" + i).value || "").trim(); if (raw === "") return;
    const val = parseFloat(raw.replace(",", ".")); if (isNaN(val)) return;
    const ex = (enr.grades || []).find((x) => x.name === n);
    if (ex && ex.value != val) jobs.push(() => BGL.updateGrade(ex.id, n, val));
    else if (!ex) jobs.push(() => BGL.createGrade(n, val, eid));
  });
  const nv = ($("evalC").value || "").trim(), cv = (enr.evaluation && enr.evaluation.content) || "";
  if (nv !== cv && nv !== "") {
    if (enr.evaluation && enr.evaluation.id) jobs.push(() => BGL.updateEvaluation(enr.evaluation.id, nv));
    else jobs.push(() => BGL.createEvaluation(nv, "Enrollment", eid));
  }
  if (!jobs.length) { closeSheet(); progDone(); return toast("Không có thay đổi"); }
  let fail = 0;
  for (const j of jobs) { try { await j(); } catch { fail++; } }
  CX[cid].enr = null; closeSheet();
  toast(fail ? `Lưu xong, ${fail} lỗi` : "Đã lưu điểm & nhận xét ✓");
  await tabStudents(cid); progDone();
}
window.academicSheet = academicSheet; window.saveAcademic = saveAcademic;

function resultPicker(cid, eid, cur) {
  const btns = ["Đang Học", "Nghỉ Luôn", "Lên Lớp", "Học Lại", "Chuyển Xứ"].map((r) =>
    `<button class="pickbtn ${cur === r ? "on " + (RESULT_CLS[r] || "st-quit") : ""}" onclick="setResult('${cid}',${eid},'${r}')"><span class="sw" style="background:var(${RESVAR[r]})"></span>${r}</button>`).join("");
  openSheet(`<h3>Kết quả học</h3><div class="pickgrid">${btns}</div>`);
}
async function setResult(cid, eid, r) {
  closeSheet(); progStart(); haptic();
  try {
    await BGL.updateEnrollment(eid, { result: r }); toast("Đã cập nhật: " + r); CX[cid].enr = null;
    (S._students || []).forEach((x) => { if (String(x.id) === String(eid)) x.result = r; });   // tab Học sinh: sửa ngay em này + lần vào sau tải lại
    TabLoad.invalidate("students"); TabLoad.invalidate("classes");                            // số liệu thẻ lớp cũng đổi
    await tabStudents(cid);
  }
  catch (e) { toast("Lỗi: " + e.message); }
  progDone();
}
window.resultPicker = resultPicker; window.setResult = setResult;

// ============================================================
//  CHUỖI HỌC — số buổi học liên tiếp
//  - Tuần cả lớp KHÔNG có điểm danh = tuần nghỉ -> bỏ qua, không mất chuỗi
//  - Có thể đánh dấu tay: "Tuần nghỉ cả lớp" hoặc "Bỏ qua ngày này" cho 1 em (khôi phục chuỗi)
//  - Quy tắc theo trạng thái (cộng / giữ / mất) chỉnh trong Tiện ích
// ============================================================
const STREAK_DEF = { "Hiện Diện": "add", "Báo Trễ": "add", "Vắng Lễ": "hold", "Có Phép": "break", "Không Phép": "break", "Nghỉ Luôn": "break" };
const STREAK_EFF = [["add", "Cộng chuỗi (+1)"], ["hold", "Giữ chuỗi (không cộng)"], ["break", "Mất chuỗi"]];
const streakRules = () => Object.assign({}, STREAK_DEF, store.get("bgl-streak", {}) || {});
function streakAdjKey(cid) { return `bgl-streak-adj-${(S.user && S.user.id) || "x"}-${cid}`; }
function streakAdj(cid) { const a = store.get(streakAdjKey(cid), {}) || {}; return { skip: Array.isArray(a.skip) ? a.skip : [], forgive: a.forgive && typeof a.forgive === "object" ? a.forgive : {} }; }
function saveStreakAdj(cid, a) { return store.set(streakAdjKey(cid), a); }

// Tải toàn bộ điểm danh của lớp trong niên khóa CỦA LỚP (cache trong RAM)
function loadClassAttendance(id, force) {
  const C = (CX[id] = CX[id] || {});
  if (C.attAll && !force) return Promise.resolve(C.attAll);
  if (C.attAllP) return C.attAllP;
  const yr = classYearRange(C.info);
  C.attAllP = (async () => {
    try {
      const recs = await BGL.attendancesRange(id, yr.start, yr.end);
      const by = {};
      (recs || []).forEach((r) => { if (!r || !r.date) return; const d = String(r.date).slice(0, 10); (by[d] = by[d] || {})[r.attendable_id] = r.status; });
      if (C.attPatch) { by[C.attPatch.date] = C.attPatch.day; C.attPatch = null; }   // vừa Xác nhận trong lúc tải -> vá ngày đó
      C.attAll = { by, range: yr, truncated: !!(recs && recs.truncated) }; C.attErr = false;
    } catch (e) { C.attErr = true; }                                                     // giữ dữ liệu cũ (nếu có), không cache lỗi
    finally { C.attAllP = null; }
    return C.attAll || null;
  })();
  return C.attAllP;
}
// Tính chuỗi của 1 em: duyệt các ngày đã qua (Chúa Nhật niên khóa + ngày có điểm danh lẻ)
function computeStreak(cid, eid) {
  const C = CX[cid] || {}, all = C.attAll; if (!all) return null;
  const rules = streakRules(), adj = streakAdj(cid), today = toISO(new Date());
  const days = [...new Set([...academicSundays(all.range).filter((d) => d <= today), ...Object.keys(all.by)])].sort();
  const forg = adj.forgive[String(eid)] || [];
  let cur = 0, best = 0, attended = 0; const timeline = [];
  for (const d of days) {
    const day = all.by[d] || {}, classHas = Object.keys(day).length > 0, st = day[eid] || "";
    let eff;
    if (!classHas || adj.skip.includes(d)) eff = "off";          // tuần nghỉ (tự động hoặc đánh dấu tay)
    else if (forg.includes(d)) eff = "forgive";                     // bỏ qua cho riêng em này
    else if (!st) eff = "hold";                                     // lớp có điểm danh nhưng em này chưa được điểm
    else eff = rules[st] || "break";
    if (eff === "add") { cur++; attended++; if (cur > best) best = cur; }
    else if (eff === "break") cur = 0;
    timeline.push({ d, st, eff });
  }
  return { cur, best, attended, timeline, noData: !Object.keys(all.by).length, truncated: !!all.truncated };
}
// Cấp độ lửa theo chuỗi (Chúa Nhật): 1-2 nhen lửa · 3 Hiền lành (đỏ) · 5 Ngoan (xanh) · 7 Hy sinh (7 màu) · 10 Dấn thân (7 màu + quầng sáng, cao nhất)
// Tên cấp theo tinh thần Kinh Thánh: 3 Hiền lành · 5 Ngoan · 7 Hy sinh · 10 Dấn thân (cao nhất)
const TIERS = [
  { min: 0, cls: "off", name: "Chưa có lửa", scale: 1 },
  { min: 1, cls: "lit", name: "Nhen lửa", scale: 1 },
  { min: 3, cls: "hot", name: "Hiền lành", scale: 1.1 },
  { min: 5, cls: "blaze", name: "Ngoan", scale: 1.2 },
  { min: 7, cls: "rainbow", name: "Hy sinh", scale: 1.3 },
  { min: 10, cls: "rainbow peak", name: "Dấn thân", scale: 1.42 },
];
function streakTier(n) { let t = TIERS[0]; for (const x of TIERS) if (n >= x.min) t = x; return t; }
function nextTier(n) { return TIERS.find((x) => x.min > n) || null; }
const FLAME_OUT = "M32 2c3 11 15 17 18 33 3 16-7 31-18 43C21 66 10 54 12 37c1-9 8-14 10-22 3 6 6 8 9 8-3-6-2-14 1-21z";
const FLAME_IN = "M32 38c6 6 10 12 9 21-1 8-5 14-9 19-4-5-9-11-9-19 0-8 4-14 9-21z";
const RAINBOW = [["0", "#ef4444"], [".2", "#f97316"], [".4", "#facc15"], [".6", "#22c55e"], [".8", "#3b82f6"], ["1", "#a855f7"]];
let _fid = 0;
// Đốm lửa kiểu streak: kích cỡ + màu theo cấp, tàn lửa bay từ cấp 3, số buổi nằm trong ngọn lửa
function flameSVG(n, size, label) {
  const t = streakTier(n), sz = Math.round(size * t.scale), sm = size < 70, rb = t.min >= 7, id = "rb" + (++_fid);
  const fs = Math.round(sz * (String(label == null ? n : label).length > 2 ? 0.3 : 0.38));
  const embers = t.min >= 3 ? `<i class="em e1"></i><i class="em e2"></i>${sm ? "" : '<i class="em e3"></i><i class="em e4"></i>'}` : "";
  const grad = rb ? `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">${RAINBOW.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join("")}</linearGradient></defs>` : "";
  return `<span class="flame ${t.cls} ${sm ? "sm" : ""}" style="width:${Math.round(sz * 0.82)}px;height:${sz}px">${embers}
    <svg viewBox="0 0 64 80" aria-hidden="true">${grad}
      <path class="f-out"${rb ? ` style="fill:url(#${id})"` : ""} d="${FLAME_OUT}"/>
      <path class="f-in" d="${FLAME_IN}"/>
    </svg><b class="f-n" style="font-size:${fs}px">${label == null ? n : label}</b></span>`;
}
function streakTile(cid, eid) {
  const s = computeStreak(cid, eid), C = CX[cid] || {};
  let inner;
  if (!s && C.attErr) inner = flameSVG(0, 46, "!");
  else if (!s) inner = `<span class="skel" style="display:inline-block;width:34px;height:44px;border-radius:12px"></span>`;
  else if (s.noData) inner = flameSVG(0, 46, "—");
  else inner = flameSVG(s.cur, 46);
  return `<button class="stat tinted t-fire" id="streak-${eid}" onclick="streakSheet('${cid}',${eid})" title="Chuỗi học" style="padding:6px 10px 8px"><div class="v" style="display:flex;justify-content:center;line-height:0">${inner}</div><div class="k" style="margin-top:2px">Chuỗi học</div></button>`;
}
function paintStreaks(id) { ((CX[id] && CX[id].enr) || []).forEach((e) => { const el = $("streak-" + e.id); if (el) el.outerHTML = streakTile(id, e.id); }); }

function streakSheet(cid, eid) {
  const enr = ((CX[cid] || {}).enr || []).find((x) => x.id === eid); if (!enr) return;
  const p = enr.person || {}, name = p.name || p.full_name || "", s = computeStreak(cid, eid), C = CX[cid] || {};
  if (!s) {
    if (C.attErr && !C.attAllP) {   // tải lỗi -> báo + thử lại (không bịa "tuần nghỉ")
      openSheet(`<h3>${esc(name)} · Chuỗi học</h3><div class="empty" style="padding:26px"><div class="big">${ic("warn",44)}</div><div style="font-weight:600;color:var(--ink)">Không tải được dữ liệu điểm danh</div><div style="margin-top:6px;font-size:13.5px">Kiểm tra mạng rồi thử lại.</div>
        <button class="btn sm" style="margin-top:16px" onclick="retryStreak('${cid}',${eid})">${ic("check", 16)} Thử lại</button></div>`);
      return;
    }
    // đang tải: sheet chờ có đánh dấu riêng — chỉ mở lại nếu người dùng vẫn đang chờ đúng sheet này
    openSheet(`<h3>${esc(name)} · Chuỗi học</h3><div class="empty" id="streakLoading" data-eid="${eid}" style="padding:26px"><div class="spin" style="margin:0 auto 14px"></div>Đang tải dữ liệu điểm danh…</div>`);
    loadClassAttendance(cid).then(() => { const w = $("streakLoading"); if (w && w.dataset.eid === String(eid)) streakSheet(cid, eid); });
    return;
  }
  const adj = streakAdj(cid);
  const EFF = { add: ["+1 buổi", "var(--present-t)"], hold: ["giữ chuỗi", "var(--ink-faint)"], break: ["mất chuỗi", "var(--unexcused-t)"], off: ["tuần nghỉ · không tính", "var(--ink-faint)"], forgive: ["bỏ qua · không tính", "var(--excused-t)"] };
  const today = toISO(new Date());
  const rows = s.timeline.slice().reverse().map((t) => {
    const isToday = t.d === today && t.eff === "off" && !adj.skip.includes(t.d);
    const chip = isToday ? `<span class="chip st-none">Hôm nay</span>`
      : t.eff === "off" ? `<span class="chip st-none">${adj.skip.includes(t.d) ? "Tuần nghỉ ✓" : "Cả lớp nghỉ"}</span>`
      : t.st ? `<span class="chip ${stCls(t.st)}"><span class="dot"></span>${esc(t.st)}</span>` : `<span class="chip st-none">Chưa điểm</span>`;
    const [lab, col] = isToday ? ["chưa điểm danh", "var(--ink-faint)"] : EFF[t.eff];
    return `<div class="tl-row"><div class="grow"><div style="font-weight:600;font-size:13.5px">${weekdayVN(t.d)}, ${fmtDate(t.d)}</div><div style="font-size:11.5px;color:${col}">${lab}</div></div>${chip}<button class="pick" onclick="streakDayMenu('${cid}',${eid},'${jsq(t.d)}')" aria-label="Tuỳ chọn ngày">${ic("gear", 14)}</button></div>`;
  }).join("") || `<div class="empty" style="padding:24px;font-size:13.5px">Chưa có buổi học nào trong niên khóa.</div>`;
  const lastBreak = s.timeline.slice().reverse().find((t) => t.eff === "break");
  openSheet(`<h3>${esc(name)} · Chuỗi học</h3>
    <div class="streak-hero">${flameSVG(s.cur, 110)}
      <div class="cap">${s.cur ? `${s.cur} buổi học liên tiếp · <b style="color:var(--ink)">${streakTier(s.cur).name}</b>` : "Chưa có chuỗi — đi học buổi tới để nhen lửa"}</div>
      <div class="faint" style="font-size:12px">${(() => { const nx = nextTier(s.cur); return nx ? `Còn ${nx.min - s.cur} buổi nữa lên <b>${nx.name}</b>` : "Đã đạt cấp cao nhất — giữ lửa nhé!"; })()}</div>
      ${s.cur ? `<button class="btn gold" style="max-width:300px;margin-top:12px" onclick="streakCardSheet('${cid}',${eid})">${ic("sparkle", 18)} Khoe chuỗi · ảnh động chúc mừng</button>` : ""}
    </div>
    <div class="statgrid" style="margin-bottom:14px">${statTile(s.best, "Dài nhất", "amber")}${statTile(s.attended, "Buổi có mặt", "green")}${statTile(s.timeline.filter((t) => t.eff === "break").length, "Lần mất chuỗi", "red")}</div>
    ${lastBreak ? `<button class="btn ghost" style="margin-bottom:12px;color:var(--brand-2)" onclick="streakForgive('${cid}',${eid},'${jsq(lastBreak.d)}')">${ic("sparkle", 17)} Khôi phục chuỗi (bỏ qua ${fmtDate(lastBreak.d).slice(0, 5)})</button>` : ""}
    ${s.truncated ? `<div class="authmsg err" style="margin:0 2px 12px">${ic("bug", 16)} Dữ liệu điểm danh quá lớn, chỉ tải được một phần — chuỗi có thể chưa chính xác.</div>` : ""}
    <p class="muted" style="margin:0 2px 10px;font-size:12.5px;line-height:1.45">Tuần cả lớp không điểm danh được xem là tuần nghỉ, không làm mất chuỗi. Bấm ${ic("gear", 12)} ở từng ngày để bỏ qua cho em này hoặc đánh dấu tuần nghỉ cả lớp.</p>
    <div class="card divlist" style="overflow:hidden;max-height:42vh;overflow-y:auto">${rows}</div>
    <button class="btn ghost" style="margin-top:12px" onclick="streakSettingsSheet('${cid}',${eid})">${ic("settings", 17)} Quy tắc tính chuỗi</button>`);
}
function streakDayMenu(cid, eid, d) {
  const adj = streakAdj(cid), isSkip = adj.skip.includes(d), isForg = (adj.forgive[String(eid)] || []).includes(d);
  openSheet(`<h3>${weekdayVN(d)}, ${fmtDate(d)}</h3>
    <div class="pickgrid">
      <button class="pickbtn ${isForg ? "on st-excused" : ""}" style="grid-column:span 2" onclick="streakToggle('${cid}',${eid},'${jsq(d)}','forgive')"><span class="sw" style="background:var(--excused-t)"></span><span>${isForg ? "Bỏ bỏ-qua · tính lại ngày này" : "Bỏ qua ngày này cho em này"}<br><small class="muted">không cộng, không mất chuỗi</small></span></button>
      <button class="pickbtn ${isSkip ? "on st-late" : ""}" style="grid-column:span 2" onclick="streakToggle('${cid}',${eid},'${jsq(d)}','skip')"><span class="sw" style="background:var(--late-t)"></span><span>${isSkip ? "Bỏ đánh dấu tuần nghỉ" : "Tuần nghỉ cả lớp"}<br><small class="muted">không tính cho tất cả thiếu nhi</small></span></button>
      <button class="pickbtn clear" onclick="streakSheet('${cid}',${eid})">Quay lại</button>
    </div>`);
}
function retryStreak(cid, eid) { CX[cid].attErr = false; loadClassAttendance(cid, true).then(() => { paintStreaks(cid); if ($("sheet")) streakSheet(cid, eid); }); streakSheet(cid, eid); }
function streakToggle(cid, eid, d, what) {
  const adj = streakAdj(cid), k = String(eid);
  if (what === "skip") adj.skip = adj.skip.includes(d) ? adj.skip.filter((x) => x !== d) : [...adj.skip, d].sort();
  else { const f = adj.forgive[k] || []; const nf = f.includes(d) ? f.filter((x) => x !== d) : [...f, d].sort(); if (nf.length) adj.forgive[k] = nf; else delete adj.forgive[k]; }
  if (!saveStreakAdj(cid, adj)) return toast(QUOTA_MSG, 3200);
  haptic(); paintStreaks(cid); streakSheet(cid, eid);
}
function streakForgive(cid, eid, d) {
  const adj = streakAdj(cid), k = String(eid), f = adj.forgive[k] || [];
  if (!f.includes(d)) f.push(d); adj.forgive[k] = f.sort();
  if (!saveStreakAdj(cid, adj)) return toast(QUOTA_MSG, 3200);
  haptic(); paintStreaks(cid); toast("Đã khôi phục chuỗi ✓"); streakSheet(cid, eid);
}
function streakSettingsSheet(cid, eid) {
  const r = streakRules();
  const row = (st) => `<div class="field" style="margin-bottom:10px"><label><span class="chip ${stCls(st)}" style="padding:3px 9px">${st}</span></label><select class="input" data-st="${st}">${STREAK_EFF.map(([v, l]) => `<option value="${v}" ${r[st] === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>`;
  const back = cid ? `'${cid}',${eid}` : "";
  openSheet(`<h3>Quy tắc tính chuỗi</h3><p class="muted" style="margin:-8px 2px 14px;font-size:13px;line-height:1.45">Mỗi trạng thái điểm danh ảnh hưởng chuỗi học thế nào. Quy tắc lưu trên máy này.</p>
    ${STATUSES.map((x) => row(x.v)).join("")}
    <button class="btn" style="margin-top:6px" onclick="saveStreakRules(${back})">${ic("check", 18)} Lưu</button>
    <button class="btn ghost" style="margin-top:10px" onclick="resetStreakRules(${back})">Khôi phục mặc định</button>
    <div class="sec-eyebrow" style="margin:18px 2px 10px"><span class="eyebrow">Dữ liệu chuỗi học</span></div>
    <p class="muted" style="margin:0 2px 10px;font-size:12.5px;line-height:1.45">Quy tắc + tuần nghỉ / ngày bỏ qua đã đánh dấu (${streakAdjCount()} lớp). Xuất ra file để chuyển máy hoặc chia sẻ cho GLV cùng lớp, rồi Nhập ở máy kia — nhận được file .zip cũng nhập thẳng được.</p>
    <div class="row" style="gap:10px">
      <button class="btn ghost sm" style="flex:1" onclick="exportStreakData()">${ic("upload", 16)} Xuất dữ liệu chuỗi</button>
      <button class="btn ghost sm" style="flex:1" onclick="importStreakData(${back})">${ic("download", 16)} Nhập dữ liệu chuỗi</button>
    </div>`);
}
// ---- Xuất / Nhập dữ liệu chuỗi học (quy tắc + điều chỉnh theo lớp) ----
function streakAdjAll() {
  const out = {}, pre = `bgl-streak-adj-${(S.user && S.user.id) || "x"}-`;
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf(pre) === 0) { const cid = k.slice(pre.length); const a = store.get(k, null); if (a && ((a.skip && a.skip.length) || (a.forgive && Object.keys(a.forgive).length))) out[cid] = { skip: a.skip || [], forgive: a.forgive || {} }; } } } catch {}
  return out;
}
function streakAdjCount() { return Object.keys(streakAdjAll()).length; }
async function exportStreakData() {
  const data = { app: "DiemDanh", type: "streak", version: 1, exportedAt: new Date().toISOString(), userId: (S.user && S.user.id) || null, userName: (S.user && S.user.person_name) || null, rules: streakRules(), adj: streakAdjAll() };
  const json = JSON.stringify(data, null, 2), fname = `chuoi-hoc-${toISO(new Date())}.json`;
  const FS = window.Capacitor?.Plugins?.Filesystem, Sh = window.Capacitor?.Plugins?.Share;
  if (FS && Sh) {
    try { const w = await FS.writeFile({ path: fname, data: json, directory: "CACHE", encoding: "utf8" }); await Sh.share({ title: "Dữ liệu chuỗi học", text: `Quy tắc + điều chỉnh chuỗi học (${Object.keys(data.adj).length} lớp)`, files: [w.uri], dialogTitle: "Lưu / gửi dữ liệu chuỗi học" }); }
    catch (e) { if (!/cancel|abort|in progress/i.test(e.message || "")) toast("Lỗi xuất: " + (e.message || e)); }
  } else {
    try { const b = new Blob([json], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fname; a.click(); toast("Đã tạo file tải về"); } catch { toast("Không xuất được trên nền web"); }
  }
}
function importStreakData(cid, eid) {
  pickImportFile((docs) => {
    // file chuỗi học; không có thì lấy phần chuỗi học trong file sao lưu đầy đủ
    const d = (docs.find((x) => x.data && x.data.type === "streak") || {}).data || backupToStreak((docs.find((x) => x.data && x.data.photos) || {}).data);
    const n = applyStreakImport(d);
    toast(`Đã nhập quy tắc + điều chỉnh chuỗi của ${n} lớp ✓`);
    if (cid) { paintStreaks(cid); streakSheet(cid, eid); } else streakSettingsSheet();
  });
}
// Lấy quy tắc + điều chỉnh chuỗi từ file sao lưu đầy đủ (bgl-backup-*.json)
function backupToStreak(b) {
  if (!b || !b.settings) return null;
  const parse = (v) => { try { return JSON.parse(v); } catch { return null; } };
  const adj = {};
  Object.keys(b.settings).forEach((k) => { const m = k.match(/^bgl-streak-adj-[^-]+-(\d+)$/); if (m) { const a = parse(b.settings[k]); if (a) adj[m[1]] = a; } });
  return { type: "streak", rules: parse(b.settings["bgl-streak"]) || {}, adj };
}
// ---- Chọn file để Nhập: .json hoặc .zip (tự lấy file .json bên trong, khỏi giải nén tay) ----
const IMPORT_ACCEPT = ".json,.zip,application/json,application/zip,application/x-zip-compressed,application/octet-stream";
function fileBytes(file) {
  if (file.arrayBuffer) return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(new Uint8Array(r.result)); r.onerror = () => rej(new Error("không đọc được file")); r.readAsArrayBuffer(file); });
}
// -> [{ name, data }] ; .zip có thể chứa nhiều file .json (vd. sao lưu + chuỗi học)
async function readImportDocs(file) {
  const bytes = await fileBytes(file), parse = (t) => JSON.parse(String(t).replace(/^﻿/, ""));
  if (window.Unzip && Unzip.isZip(bytes)) {
    const files = await Unzip.jsonFiles(bytes);
    if (!files.length) throw new Error("trong file .zip không có file .json");
    const docs = []; files.forEach((f) => { try { docs.push({ name: f.name, data: parse(f.text) }); } catch {} });
    if (!docs.length) throw new Error("file .json trong .zip bị lỗi");
    return docs;
  }
  return [{ name: file.name, data: parse(new TextDecoder("utf-8").decode(bytes)) }];
}
function pickImportFile(onDocs) {
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = IMPORT_ACCEPT;
  inp.onchange = async () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    progStart();
    try { await onDocs(await readImportDocs(file)); }
    catch (e) { toast("File không hợp lệ: " + (e.message || e), 3200); }
    finally { progDone(); }
  };
  inp.click();
}
// Gộp dữ liệu nhập vào máy này (gán cho tài khoản đang đăng nhập); trả về số lớp đã nhập
function applyStreakImport(d) {
  if (!d || d.type !== "streak" || !d.rules) throw new Error("không phải file dữ liệu chuỗi học");
  const rules = {}; STATUSES.forEach((st) => { if (["add", "hold", "break"].includes(d.rules[st.v])) rules[st.v] = d.rules[st.v]; });
  if (!store.set("bgl-streak", rules)) throw new Error(QUOTA_MSG);
  let n = 0;
  Object.keys(d.adj || {}).forEach((cid) => {
    if (!/^\d+$/.test(cid)) return;
    const inA = d.adj[cid] || {}, cur = streakAdj(cid);
    const skip = [...new Set([...cur.skip, ...(Array.isArray(inA.skip) ? inA.skip : [])])].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).sort();
    const forgive = Object.assign({}, cur.forgive);
    Object.keys(inA.forgive || {}).forEach((eid) => { const arr = Array.isArray(inA.forgive[eid]) ? inA.forgive[eid].filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)) : []; if (arr.length) forgive[eid] = [...new Set([...(forgive[eid] || []), ...arr])].sort(); });
    if (!saveStreakAdj(cid, { skip, forgive })) throw new Error(QUOTA_MSG);
    if (CX[cid]) paintStreaks(cid);
    n++;
  });
  return n;
}
window.exportStreakData = exportStreakData; window.importStreakData = importStreakData; window.applyStreakImport = applyStreakImport;

// ============================================================
//  KHOE CHUỖI — ảnh chúc mừng (avatar · tên thánh · họ tên · ngọn lửa lớn · số buổi)
// ============================================================
const TIER_COL = { off: ["#9ca3af", "#e5e7eb"], lit: ["#f97316", "#fde047"], hot: ["#ef4444", "#fbbf24"], blaze: ["#2563eb", "#a5f3fc"], rainbow: [null, "#fff8d6"], peak: [null, "#fff8d6"] };
function drawFlame(x, cx, cy, size, tier, n, o) {
  o = o || {};
  // ngọn lửa theo path SVG (viewBox 64x80), tâm (cx, cy), cao = size; o.glowK nhân độ sáng, o.sy/o.sk nhấp nháy, o.noNum bỏ số
  const k = size / 80, out = new Path2D(FLAME_OUT), inn = new Path2D(FLAME_IN);
  x.save(); x.translate(cx, cy + 40 * k); x.transform(1, 0, o.sk || 0, o.sy || 1, 0, 0); x.translate(-32 * k, -80 * k); x.scale(k, k);
  const [co, ci] = TIER_COL[tier.cls.split(" ")[0]] || TIER_COL.lit;
  let fillOut = co;
  if (!fillOut) { const g = x.createLinearGradient(0, 80, 0, 0); RAINBOW.forEach(([off, c]) => g.addColorStop(+off, c)); fillOut = g; }
  x.shadowColor = tier.min >= 10 ? "rgba(253,224,71,.9)" : tier.min >= 7 ? "rgba(255,255,255,.7)" : tier.min >= 5 ? "rgba(59,130,246,.8)" : tier.min >= 3 ? "rgba(239,68,68,.7)" : "rgba(249,115,22,.55)";
  x.shadowBlur = ((tier.min >= 10 ? 46 : tier.min >= 5 ? 30 : 18) * (o.glowK || 1)) / k;
  x.fillStyle = fillOut; x.fill(out);
  x.shadowBlur = 0; x.fillStyle = ci; x.fill(inn);
  x.restore();
  if (o.noNum) return;
  drawFlameNumber(x, cx, cy, size, n, o.numScale || 1);
}
function drawFlameNumber(x, cx, cy, size, n, sc) {
  x.save(); x.textAlign = "center"; x.textBaseline = "middle"; x.translate(cx, cy + size * 0.22); x.scale(sc, sc);
  const fs = Math.round(size * (String(n).length > 2 ? 0.28 : 0.36));
  x.font = `800 ${fs}px "Bricolage Grotesque", "Be Vietnam Pro", system-ui, sans-serif`;
  x.lineWidth = Math.max(3, fs * 0.09); x.strokeStyle = "rgba(60,20,0,.7)"; x.lineJoin = "round";
  x.strokeText(String(n), 0, 0); x.fillStyle = "#fff"; x.fillText(String(n), 0, 0);
  x.restore();
}
// ---- Thẻ chúc mừng ĐỘNG (kiểu TikTok): 0-1.3s tia lửa bay vòng quanh & hội tụ · lửa bùng lên · 1.3s chớp sáng + NỔ confetti · số bật lên · 1.6s+ chữ hiện ----
const CARD_W = 1080, CARD_H = 1350, CARD_DUR = 3.2, CARD_FX = 540, CARD_FY = 820;
const CARD_TH = { "": ["#1c6155", "#0b3830"], green: ["#15803d", "#052e16"], pink: ["#be185d", "#4a0a24"], blue: ["#1e40af", "#0b1437"], gold: ["#a16207", "#2a1a04"] };
const CONF = ["#fde047", "#f97316", "#22c55e", "#3b82f6", "#ec4899", "#a855f7", "#ffffff", "#f43f5e"];
function prng(seed) { let z = (seed >>> 0) || 1; return () => ((z = (z * 1664525 + 1013904223) >>> 0) / 4294967296); }
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
async function cardAssets(cid, eid) {
  const enr = ((CX[cid] || {}).enr || []).find((e) => e.id === eid); if (!enr) throw new Error("Không tìm thấy thiếu nhi");
  const s = computeStreak(cid, eid); if (!s) throw new Error("Chưa có dữ liệu chuỗi");
  const p = enr.person || {}, c = CX[cid].info || {}, tier = streakTier(s.cur), key = classThemeKey(c) || currentClassTheme();
  const FAM = '"Be Vietnam Pro", "Segoe UI", Roboto, system-ui, sans-serif', DISP = '"Bricolage Grotesque", "Be Vietnam Pro", system-ui, sans-serif';
  try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load(`800 60px ${DISP}`), document.fonts.load(`600 30px ${FAM}`), document.fonts.load(`700 22px ${FAM}`)]), new Promise((r) => setTimeout(r, 1500))]); } catch {}
  const [bg, logo] = await Promise.all([loadImg("assets/bg-login.jpg").catch(() => null), loadImg("assets/logo.png").catch(() => null)]);
  const ph = photoOf(p.id), photo = ph ? await loadImg(ph).catch(() => null) : null;
  const rnd = prng(1000 + s.cur * 7 + eid);
  const orbit = Array.from({ length: 18 }, (_, i) => ({ a0: rnd() * Math.PI * 2, r0: 250 + rnd() * 140, spd: 3 + rnd() * 2, sz: 5 + rnd() * 6, col: CONF[i % CONF.length], dir: rnd() < .5 ? 1 : -1 }));
  const burst = Array.from({ length: 120 }, () => { const a = rnd() * Math.PI * 2, v = 360 + rnd() * 560; return { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260, rot: rnd() * Math.PI, rs: (rnd() - .5) * 12, w: 8 + rnd() * 12, h: 5 + rnd() * 6, col: CONF[(rnd() * CONF.length) | 0], round: rnd() < .3 }; });
  const embers = Array.from({ length: 12 }, () => ({ x0: (rnd() - .5) * 140, dly: rnd() * 1.6, sz: 3 + rnd() * 4, sw: 8 + rnd() * 14 }));
  const stars = Array.from({ length: 40 }, () => ({ x: rnd() * CARD_W, y: rnd() * CARD_H * .75, r: 1 + rnd() * 2.2, ph: rnd() * 6.28 }));
  return { p, c, s, tier, TH: CARD_TH[key] || CARD_TH[""], key, bg, photo, logo, FAM, DISP, orbit, burst, embers, stars, name: p.name || p.full_name || "" };
}
// Vẽ 1 khung hình của thẻ tại thời điểm t (giây), toạ độ 1080x1350
function paintCard(x, A, t) {
  const W = CARD_W, H = CARD_H, FX = CARD_FX, FY = CARD_FY, TH = A.TH, FAM = A.FAM, DISP = A.DISP;
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  x.save(); x.textBaseline = "middle"; x.textAlign = "center"; x.globalAlpha = 1;
  // ---- nền ----
  x.fillStyle = TH[1]; x.fillRect(0, 0, W, H);
  if (A.bg) { const k = Math.max(W / A.bg.width, H / A.bg.height), dw = A.bg.width * k, dh = A.bg.height * k; x.globalAlpha = .55; x.drawImage(A.bg, (W - dw) / 2, (H - dh) / 2, dw, dh); x.globalAlpha = 1; }
  if (A.key && A.key !== "green") { x.save(); x.globalCompositeOperation = "color"; x.fillStyle = TH[0]; x.globalAlpha = .75; x.fillRect(0, 0, W, H); x.restore(); }
  const g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "rgba(8,20,16,.55)"); g.addColorStop(.45, "rgba(8,20,16,.35)"); g.addColorStop(1, "rgba(6,16,13,.92)"); x.fillStyle = g; x.fillRect(0, 0, W, H);
  // sao lấp lánh
  A.stars.forEach((st) => { const a = .25 + .55 * (0.5 + 0.5 * Math.sin(t * 4 + st.ph)); x.globalAlpha = a; x.fillStyle = "#fff"; x.beginPath(); x.arc(st.x, st.y, st.r, 0, Math.PI * 2); x.fill(); }); x.globalAlpha = 1;
  // tia sáng xoay chậm, bùng khi nổ
  const boom = t >= 1.3 ? 1 + 0.35 * Math.max(0, 1 - (t - 1.3) / 0.5) : 0.75;
  x.save(); x.translate(FX, FY); x.rotate(t * 0.18); x.globalAlpha = .09 * boom; x.fillStyle = "#fff";
  for (let i = 0; i < 14; i++) { x.rotate(Math.PI / 7); x.beginPath(); x.moveTo(0, 0); x.lineTo(-44, -1000); x.lineTo(44, -1000); x.closePath(); x.fill(); }
  x.restore();
  // ---- đầu thẻ (hiện dần 0-0.5s) ----
  const fadeIn = clamp01(t / 0.5); x.globalAlpha = fadeIn;
  if (A.logo) { const b = 64, k = Math.min(b / A.logo.width, b / A.logo.height); x.fillStyle = "#fff"; x.beginPath(); x.arc(W / 2, 92, 42, 0, Math.PI * 2); x.fill(); x.drawImage(A.logo, W / 2 - A.logo.width * k / 2, 92 - A.logo.height * k / 2, A.logo.width * k, A.logo.height * k); }
  x.fillStyle = "#fde68a"; x.font = `700 22px ${FAM}`; try { x.letterSpacing = "6px"; } catch {} x.fillText("CHÚC MỪNG", W / 2, 168); try { x.letterSpacing = "0px"; } catch {}
  x.fillStyle = "rgba(255,255,255,.8)"; x.font = `500 26px ${FAM}`; x.fillText(`${A.c.name || "Lớp"} · ${A.c.long_year || ""}`, W / 2, 206);
  // avatar
  const AY = 330, AR = 96;
  x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 30; x.fillStyle = "#fff"; x.beginPath(); x.arc(W / 2, AY, AR + 6, 0, Math.PI * 2); x.fill(); x.restore();
  x.save(); x.beginPath(); x.arc(W / 2, AY, AR, 0, Math.PI * 2); x.clip();
  if (A.photo) { const k = Math.max(AR * 2 / A.photo.width, AR * 2 / A.photo.height); x.drawImage(A.photo, W / 2 - A.photo.width * k / 2, AY - A.photo.height * k / 2, A.photo.width * k, A.photo.height * k); }
  else { x.fillStyle = hueOf(A.name || String(A.p.id)); x.fillRect(W / 2 - AR, AY - AR, AR * 2, AR * 2); x.fillStyle = "#fff"; x.font = `800 72px ${DISP}`; x.fillText(initials(A.name), W / 2, AY + 4); }
  x.restore();
  x.fillStyle = "#fde68a"; x.font = `700 26px ${FAM}`; x.fillText((A.p.christian_name || "").toUpperCase(), W / 2, AY + AR + 44);
  let nf = 60; x.font = `800 ${nf}px ${DISP}`; while (x.measureText(A.name).width > W - 120 && nf > 34) { nf -= 4; x.font = `800 ${nf}px ${DISP}`; }
  x.save(); x.fillStyle = "#fff"; x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 14; x.fillText(A.name, W / 2, AY + AR + 100); x.restore();
  x.globalAlpha = 1;
  // ---- quầng sáng (cấp cao nhất) ----
  if (A.tier.min >= 10) { const R = 230 * (1 + 0.08 * Math.sin(t * 3)) * clamp01(t / 1); const hg = x.createRadialGradient(FX, FY, 10, FX, FY, R); hg.addColorStop(0, "rgba(253,224,71,.55)"); hg.addColorStop(.5, "rgba(253,224,71,.18)"); hg.addColorStop(1, "rgba(253,224,71,0)"); x.fillStyle = hg; x.beginPath(); x.arc(FX, FY, R, 0, Math.PI * 2); x.fill(); }
  // ---- tàn lửa bay lên (từ cấp 3) ----
  if (A.tier.min >= 3 && t > 0.6) A.embers.forEach((e) => { const u = ((t + e.dly) % 1.7) / 1.7; x.globalAlpha = (1 - u) * .9; x.fillStyle = A.tier.min >= 7 ? "#fff" : A.tier.min >= 5 ? "#bae6fd" : "#fde68a"; x.beginPath(); x.arc(FX + e.x0 + Math.sin(u * 7) * e.sw, FY + 20 - u * 260, e.sz * (1 - u * .5), 0, Math.PI * 2); x.fill(); }); x.globalAlpha = 1;
  // ---- ngọn lửa: bùng lên 0-1s (nảy), nhấp nháy, sáng theo nhịp ----
  const grow = t < 1 ? Math.max(0.05, easeOutBack(clamp01(t))) : 1;
  const size = 300 * (0.86 + A.tier.scale * 0.14) * grow;
  const pulse = 1 + 0.25 * Math.sin(t * 5) + (t >= 1.3 && t < 1.8 ? 0.6 * (1 - (t - 1.3) / 0.5) : 0);
  drawFlame(x, FX, FY, size, A.tier, A.s.cur, { glowK: pulse, sy: 1 + 0.045 * Math.sin(t * 14), sk: 0.035 * Math.sin(t * 9), noNum: true });
  // số: đếm lên + bật (0.9s -> 1.4s)
  if (t >= 0.9) { const q = clamp01((t - 0.9) / 0.5); const val = Math.max(1, Math.round(A.s.cur * easeOut(q))); drawFlameNumber(x, FX, FY, size, val, 0.6 + 0.4 * easeOutBack(q)); }
  // ---- tia lửa bay vòng quanh rồi hội tụ vào lửa (0-1.3s) ----
  if (t < 1.32) A.orbit.forEach((o) => { const q = t / 1.3, r = o.r0 * (1 - q * q); const ang = o.a0 + o.dir * t * o.spd;
    for (let k = 3; k >= 0; k--) { const tt = Math.max(0, t - k * 0.045), q2 = tt / 1.3, r2 = o.r0 * (1 - q2 * q2), a2 = o.a0 + o.dir * tt * o.spd; x.globalAlpha = (k === 0 ? .95 : .35 - k * .08) * clamp01(t / .3); x.fillStyle = o.col; x.beginPath(); x.arc(FX + Math.cos(a2) * r2, FY + Math.sin(a2) * r2 * .72, o.sz * (k === 0 ? 1 : .7) * (1 - q * .4), 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; });
  // ---- chớp sáng khi hội tụ (1.28-1.75s) ----
  if (t >= 1.28 && t < 1.75) { const a = t < 1.38 ? (t - 1.28) / 0.1 : 1 - (t - 1.38) / 0.37; const fg = x.createRadialGradient(FX, FY, 0, FX, FY, 700); fg.addColorStop(0, `rgba(255,255,255,${(0.75 * a).toFixed(3)})`); fg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = fg; x.fillRect(0, 0, W, H); }
  // ---- NỔ confetti (từ 1.32s) ----
  if (t >= 1.32) { const u = t - 1.32; A.burst.forEach((b) => { const alpha = 1 - clamp01((u - 0.9) / 0.8); if (alpha <= 0) return; const px = FX + b.vx * u * (1 - u * .18), py = FY + b.vy * u + 0.5 * 1500 * u * u; if (py > H + 40) return;
    x.save(); x.globalAlpha = alpha; x.translate(px, py); x.rotate(b.rot + b.rs * u); x.fillStyle = b.col; if (b.round) { x.beginPath(); x.arc(0, 0, b.h * .7, 0, Math.PI * 2); x.fill(); } else { rr(-b.w / 2, -b.h / 2, b.w, b.h, 2); x.fill(); } x.restore(); }); }
  // ---- chữ dưới (hiện từ 1.5s) ----
  const tf = clamp01((t - 1.5) / 0.45); x.globalAlpha = tf;
  if (tf > 0) {
    const pop = 0.9 + 0.1 * easeOutBack(tf);
    x.save(); x.translate(W / 2, 1035); x.scale(pop, pop); x.fillStyle = "#fff"; x.font = `800 44px ${DISP}`; x.fillText(`${A.s.cur} buổi học liên tiếp`, 0, 0); x.restore();
    const lab = A.tier.name.toUpperCase(); x.font = `700 22px ${FAM}`; const lw = x.measureText(lab).width + 60;
    x.fillStyle = "rgba(255,255,255,.16)"; rr(W / 2 - lw / 2, 1068, lw, 48, 24); x.fill(); x.strokeStyle = "rgba(255,255,255,.35)"; x.lineWidth = 1.5; x.stroke();
    x.fillStyle = "#fde68a"; x.fillText(lab, W / 2, 1093);
    x.fillStyle = "rgba(255,255,255,.72)"; x.font = `500 24px ${FAM}`; x.fillText(`Dài nhất ${A.s.best} buổi  ·  Có mặt ${A.s.attended} buổi`, W / 2, 1160);
  }
  x.globalAlpha = .45 * fadeIn; x.fillStyle = "#fff"; x.font = `400 20px ${FAM}`; x.fillText(`Điểm Danh · Ban Giáo Lý · ${fmtDate(toISO(new Date()))}`, W / 2, H - 52);
  x.restore();
}
function renderCardPng(A, t) {
  const K = 1.5, cv = document.createElement("canvas"); cv.width = CARD_W * K; cv.height = CARD_H * K;
  const x = cv.getContext("2d"); x.setTransform(K, 0, 0, K, 0, 0); paintCard(x, A, t == null ? 2.35 : t);
  const url = cv.toDataURL("image/png");
  if (!url || !url.startsWith("data:image/png;base64,") || url.length < 2000) throw new Error("Máy không đủ bộ nhớ để tạo ảnh");
  return url;
}
// GIF động: 10 fps × 3.2s, ~370×460 — bảng màu chung lấy từ khung "nổ" (đủ màu confetti) để mã hoá nhanh trên điện thoại
async function makeCardGif(A, onProgress) {
  if (!window.GIF) throw new Error("Thiếu bộ mã hoá GIF");
  const S = 0.34, w = Math.round(CARD_W * S), h = Math.round(CARD_H * S), fps = 10, frames = Math.round(CARD_DUR * fps), delay = Math.round(1000 / fps);
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
  const paint = (t) => { x.setTransform(S, 0, 0, S, 0, 0); paintCard(x, A, t); };
  const opts = { workers: 2, quality: 14, width: w, height: h, workerScript: "assets/js/gif.worker.js", repeat: 0, dither: false };
  // 1) bảng màu chung từ khung nhiều màu nhất (1.45s: lửa + confetti + chớp)
  const pal = await new Promise((res, rej) => { const g0 = new GIF(Object.assign({}, opts, { globalPalette: true })); paint(1.45); g0.addFrame(x, { copy: true, delay }); g0.on("finished", () => res(g0.options.globalPalette)); g0.on("abort", () => rej(new Error("Đã huỷ"))); try { g0.render(); } catch (e) { rej(e); } });
  if (onProgress) onProgress(0.08);
  // 2) mã hoá toàn bộ khung với bảng màu đó (không phải lượng tử hoá lại từng khung -> nhanh gấp nhiều lần)
  const gif = new GIF(Object.assign({}, opts, { globalPalette: Array.isArray(pal) && pal.length ? pal : true }));
  for (let i = 0; i < frames; i++) { paint(i / fps); gif.addFrame(x, { copy: true, delay }); if (onProgress) onProgress(0.08 + (i / frames) * 0.32); if (i % 4 === 3) await new Promise((r) => setTimeout(r, 0)); }
  return new Promise((res, rej) => { gif.on("progress", (p) => onProgress && onProgress(0.4 + p * 0.6)); gif.on("finished", (blob) => res(blob)); gif.on("abort", () => rej(new Error("Đã huỷ"))); try { gif.render(); } catch (e) { rej(e); } });
}
function videoMime() { try { if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null; return ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"].find((m) => MediaRecorder.isTypeSupported(m)) || null; } catch { return null; } }
// Video: ghi canvas 30fps trong 3.2s (MP4 nếu máy hỗ trợ, không thì WebM)
async function makeCardVideo(A, onProgress) {
  const mime = videoMime(); if (!mime) throw new Error("Máy không hỗ trợ ghi video");
  const S = 0.6, w = Math.round(CARD_W * S), h = Math.round(CARD_H * S); const cv = document.createElement("canvas"); cv.width = w; cv.height = h; const x = cv.getContext("2d");
  x.setTransform(S, 0, 0, S, 0, 0); paintCard(x, A, 0);
  const stream = cv.captureStream(30), rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 3500000 }), chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start(250); const t0 = performance.now();
  await new Promise((res) => { const tick = () => { const t = (performance.now() - t0) / 1000; x.setTransform(S, 0, 0, S, 0, 0); paintCard(x, A, Math.min(t, CARD_DUR)); if (onProgress) onProgress(clamp01(t / CARD_DUR)); if (t < CARD_DUR + 0.15) requestAnimationFrame(tick); else res(); }; tick(); });
  rec.stop(); await stopped; stream.getTracks().forEach((tr) => tr.stop());
  const type = mime.split(";")[0]; return { blob: new Blob(chunks, { type }), ext: type.includes("mp4") ? "mp4" : "webm", mime: type };
}
async function streakCardSheet(cid, eid) {
  const enr = ((CX[cid] || {}).enr || []).find((e) => e.id === eid); if (!enr) return;
  const p = enr.person || {}, vm = videoMime();
  openSheet(`<h3>Khoe chuỗi · ${esc(p.name || p.full_name || "")}</h3><div id="scBody">
    <div class="ex-prev dark" style="max-height:52vh"><canvas id="scCanvas" width="540" height="675"></canvas></div>
    <div class="row" style="gap:10px;margin-top:14px">
      <button class="btn gold" style="flex:1" onclick="cardSave('${cid}','gif',this)">${ic("sparkle", 18)} Lưu GIF động</button>
      <button class="btn" style="flex:1" onclick="cardSave('${cid}','png',this)">${ic("download", 18)} Lưu ảnh</button>
    </div>
    <div class="row" style="gap:10px;margin-top:10px">
      ${vm ? `<button class="btn ghost" style="flex:1" onclick="cardSave('${cid}','video',this)">${ic("image", 17)} Lưu video ${vm.includes("mp4") ? "MP4" : "WebM"}</button>` : ""}
      <button class="btn ghost" style="flex:1" onclick="cardShare('${cid}',this)">${ic("share", 17)} Gửi phụ huynh</button>
    </div>
    <div id="scProg" class="faint" style="text-align:center;font-size:12.5px;margin-top:10px;min-height:16px"></div>
    <button class="btn ghost" style="margin-top:8px" onclick="streakSheet('${cid}',${eid})">Quay lại</button></div>`);
  let A;
  try { A = await cardAssets(cid, eid); }
  catch (e) { const b = $("scBody"); if (b) b.innerHTML = `<div class="empty" style="padding:26px"><div class="big">${ic("warn",44)}</div><div>Không tạo được thẻ: ${esc(e.message || e)}</div></div>`; return; }
  CX[cid]._card = A; CX[cid]._cardEid = eid;
  // xem trước động ngay trong app
  const cv = $("scCanvas"); if (!cv) return;
  const S = 0.5, x = cv.getContext("2d"), t0 = performance.now();
  let _lp = 0; const loop = () => { const el = $("scCanvas"); if (!el || el !== cv) return; const now = performance.now(); if (!document.hidden && now - _lp >= 33) { _lp = now; const t = ((now - t0) / 1000) % CARD_DUR; x.setTransform(S, 0, 0, S, 0, 0); paintCard(x, A, t); } requestAnimationFrame(loop); };
  loop();
}
async function cardSave(cid, kind, btn) {
  const A = CX[cid]._card; if (!A) return toast("Thẻ chưa sẵn sàng, thử lại");
  if (btn && btn.classList.contains("busy")) return;
  const prog = (v) => { const el = $("scProg"); if (el) el.textContent = v == null ? "" : `Đang tạo ${kind === "gif" ? "GIF" : kind === "video" ? "video" : "ảnh"}… ${Math.round(v * 100)}%`; };
  if (btn) btn.classList.add("busy");
  try {
    const base = `chuoi-hoc-${slug(A.name)}-${A.s.cur}`; let blob, name, mime;
    if (kind === "png") { blob = await (await fetch(renderCardPng(A))).blob(); name = base + ".png"; mime = "image/png"; }
    else if (kind === "gif") { prog(0); blob = await makeCardGif(A, prog); name = base + ".gif"; mime = "image/gif"; }
    else { prog(0); const r = await makeCardVideo(A, prog); blob = r.blob; name = base + "." + r.ext; mime = r.mime; }
    prog(null);
    const el = $("scProg"); if (el) el.textContent = `${kind === "png" ? "Ảnh" : kind === "gif" ? "GIF" : "Video"} ${fmtBytes(blob.size)}`;
    await saveMedia(blob, name, mime);
  } catch (e) { prog(null); toast("Lỗi: " + (e.message || e), 3200); }
  finally { if (btn) btn.classList.remove("busy"); }
}
async function cardShare(cid, btn) {
  const A = CX[cid]._card; if (!A) return toast("Thẻ chưa sẵn sàng, thử lại");
  if (btn) btn.classList.add("busy");
  try { await shareDataUrl(renderCardPng(A), `chuoi-hoc-${slug(A.name)}-${A.s.cur}.png`, `🔥 ${A.name} · chuỗi ${A.s.cur} buổi học liên tiếp`); }
  catch (e) { toast("Lỗi: " + (e.message || e)); } finally { if (btn) btn.classList.remove("busy"); }
}
// ---- Lưu vào Thư viện máy (plugin SaveToGallery) · web: tải về ----
function blobToBase64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1]); r.onerror = () => rej(new Error("Không đọc được dữ liệu")); r.readAsDataURL(blob); }); }
async function saveMedia(blob, name, mime) {
  const P = window.Capacitor?.Plugins?.SaveToGallery;
  if (P) { const base64 = await blobToBase64(blob); await P.save({ base64, fileName: name, mime, album: "Điểm Danh" }); haptic(); toast(`Đã lưu vào Thư viện · album Điểm Danh`, 2600); return true; }
  try { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); toast("Đã tải về máy"); return true; }
  catch (e) { toast("Không lưu được: " + (e.message || e)); return false; }
}
async function saveDataUrl(url, name, mime) { const blob = await (await fetch(url)).blob(); return saveMedia(blob, name, mime || "image/png"); }
window.streakCardSheet = streakCardSheet; window.cardSave = cardSave; window.cardShare = cardShare; window.saveDataUrl = saveDataUrl;
// Chia sẻ ảnh (dataURL) qua share sheet trên app; web: navigator.share hoặc tải về
let _shareBusy = false;
async function shareDataUrl(url, fname, title) {
  if (_shareBusy) return;
  const FS = window.Capacitor?.Plugins?.Filesystem, Sh = window.Capacitor?.Plugins?.Share, native = !!(FS && Sh);
  _shareBusy = true;
  try {
    if (native) { const w = await FS.writeFile({ path: fname, data: url.split(",")[1], directory: "CACHE" }); await Sh.share({ title, text: title, files: [w.uri], dialogTitle: "Lưu ảnh / gửi" }); }
    else if (navigator.share) { const blob = await (await fetch(url)).blob(), file = new File([blob], fname, { type: "image/png" }); if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title, files: [file] }); else throw new Error("no-files"); }
    else throw new Error("no-share");
  } catch (e) {
    const msg = (e && (e.message || e.name)) || "";
    if (/cancel|abort|in progress/i.test(msg)) return;
    if (native) toast("Không chia sẻ được: " + (msg || "lỗi không rõ"), 3000);
    else { try { const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); toast("Đã tải ảnh về máy"); } catch { toast("Không chia sẻ được: " + msg); } }
  } finally { _shareBusy = false; }
}

function saveStreakRules(cid, eid) {
  const r = {}; document.querySelectorAll("#sheet [data-st]").forEach((x) => (r[x.dataset.st] = x.value));
  if (!store.set("bgl-streak", r)) return toast(QUOTA_MSG, 3200); toast("Đã lưu quy tắc chuỗi");
  if (cid) { paintStreaks(cid); streakSheet(cid, eid); } else closeSheet();
}
function resetStreakRules(cid, eid) { store.set("bgl-streak", {}); toast("Đã khôi phục mặc định"); if (cid) { paintStreaks(cid); streakSheet(cid, eid); } else closeSheet(); }
window.streakSheet = streakSheet; window.streakDayMenu = streakDayMenu; window.streakToggle = streakToggle; window.streakForgive = streakForgive;
window.streakSettingsSheet = streakSettingsSheet; window.saveStreakRules = saveStreakRules; window.resetStreakRules = resetStreakRules; window.retryStreak = retryStreak;

// ---------- Cấp GLV theo màu khăn (trên -> dưới): Tu Sĩ · Huynh Trưởng · Dự Trưởng · VĐ2 (chức vụ "Vào Đời 2") · Khác ----------
const T_RANKS = [["ts", "Tu Sĩ", /\btu si\b/], ["ht", "Huynh Trưởng", /\bhuynh truong\b/], ["dt", "Dự Trưởng", /\bdu truong\b/], ["vd2", "VĐ2", /\b(vao doi|vd) ?2\b/], ["khac", "Khác", null]]
  .map(([k, label, re], i) => ({ k, label, re, i }));
function teacherRank(pos) { const s = noAccent(pos || ""); return T_RANKS.find((r) => r.re && r.re.test(s)) || T_RANKS[T_RANKS.length - 1]; }
// pill màu khăn · "Khác" ghi đúng chức vụ (nếu có)
function rankBadge(pos, r) { r = r || teacherRank(pos); return `<span class="rk rk-${r.k}">${esc(r.k === "khac" && pos ? pos : r.label)}</span>`; }

// ---------- Tab: Giáo lý viên của lớp ----------
async function tabTeachers(id) {
  const t = NAV;
  try {
    let list = CX[id].teachers;
    if (!list) { const info = CX[id].info || {}; list = (info.teaching_assignments_overview && info.teaching_assignments_overview.length) ? info.teaching_assignments_overview : await BGL.teachingByClass(id); CX[id].teachers = list; }
    if (stale(t)) return;
    list.forEach((x) => rememberPerson(x.person));
    const rs = list.map((x, i) => [teacherRank(x.position).i, i, x]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((r) => r[2]);   // theo cấp, giữ thứ tự cũ trong cùng cấp
    const b = $("tabBody"); if (b) b.innerHTML = `<div class="stack">${rs.map((x) => teacherCard(x)).join("") || emptyBox(ic("user",44), "Chưa có giáo lý viên")}</div>`;
  } catch (e) { if (stale(t)) return; const b = $("tabBody"); if (b) b.innerHTML = errBox(e.message); }
}
// classes: tên lớp (nhiều lớp đã nối sẵn " · ") · r: cấp đã tính sẵn (khỏi dò lại)
function teacherCard(t, classes, r) {
  const p = t.person || {}, nm = p.name || p.full_name;
  return `<div class="card pad press" onclick="go('#/person/${p.id}')">
    <div class="row">
      ${avatar(p, { cls: "g", tappable: true })}
      <div class="grow"><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}</div>
        <div class="nm" style="font-weight:700;font-size:${nmFs(nm, 16)}px">${esc(nm)}</div>
        <div class="muted tr-sub">${rankBadge(t.position, r)}${classes ? `<span>${esc(classes)}</span>` : ""}<span>${phoneChip(p.phone, nm)}</span></div></div>
      <span class="list-arrow">${ic("chev", 20)}</span>
    </div>
  </div>`;
}

// ============================================================
//  TEACHERS (year)
// ============================================================
// API này chậm (~2s): có danh sách lần trước -> hiện ngay, tải mới ở nền (TabLoad) · S._teachers giữ nguyên các dòng phân công (hồ sơ người dùng)
TabLoad.def("teachers", { data: () => S._teachers, fetch: () => BGL.teachersByYear(S.year && S.year.year), save: (list) => { list.forEach((x) => rememberPerson(x.person)); S._teachers = list; } });
const T_COLL = (() => { try { return new Intl.Collator("vi", { sensitivity: "base", numeric: true }); } catch { return null; } })();
const viCmp = (a, b) => (T_COLL ? T_COLL.compare(a || "", b || "") : String(a || "").localeCompare(String(b || "")));
const givenOf = (n) => { const w = String(n || "").trim().split(/\s+/); return w[w.length - 1] || ""; };
// 1 dòng / 1 NGƯỜI: gộp mọi phân công (lớp nối " · ", thứ tự như máy chủ) · cấp = cấp CAO NHẤT · xếp theo cấp rồi tên (tên gọi trước, họ sau)
let _tpMemo = { src: null, out: [] };
function teacherPeople(list) {
  if (list && _tpMemo.src === list) return _tpMemo.out;
  const m = new Map();
  (list || []).forEach((t) => {
    const p = (t && t.person) || {}, nm = p.full_name || p.name || "", key = p.id != null ? "#" + p.id : nm ? "n:" + noAccent(nm) : ""; if (!key) return;
    const r = teacherRank(t.position), pos = t.position || "";
    let x = m.get(key); if (!x) m.set(key, (x = { p, nm, r, pos, cls: [], rows: [] }));
    if (r.i < x.r.i || (r.i === x.r.i && !x.pos && pos)) { x.r = r; x.pos = pos; }
    if (!x.p.phone && p.phone) x.p = p;                   // dòng sau đủ số điện thoại hơn
    const cn = t.classroom && t.classroom.name; if (cn && !x.cls.includes(cn)) x.cls.push(cn);
    x.rows.push(t);
  });
  const out = [...m.values()].sort((a, b) => a.r.i - b.r.i || viCmp(givenOf(a.nm), givenOf(b.nm)) || viCmp(a.nm, b.nm));
  _tpMemo = { src: list || null, out }; return out;
}
const TF = { g: "*", q: "" };                             // chip cấp đang chọn · chữ lọc tên (giữ khi vào hồ sơ rồi quay lại)
// lọc tên trước -> đếm theo cấp (số trên chip) -> lọc theo chip
function teacherView(list) {
  const all = teacherPeople(list), nq = noAccent(TF.q);
  const byName = nq ? all.filter((x) => noAccent(x.nm).includes(nq)) : all, cnt = {};
  byName.forEach((x) => (cnt[x.r.k] = (cnt[x.r.k] || 0) + 1));
  return { all, byName, cnt, shown: TF.g === "*" ? byName : byName.filter((x) => x.r.k === TF.g) };
}
function teacherChips(v) {
  const chip = (k, label, n, r) => `<button class="pick${TF.g === k ? " on " + (r ? "rk-on rk-" + k : "st-quit") : ""}" data-g="${k}" onclick="teacherGroup('${k}')">${r ? `<i class="rk-dot rk-${k}"></i>` : ""}${esc(label)} <b class="num">${n}</b></button>`;
  const khac = TF.g === "khac" || v.all.some((x) => x.r.k === "khac");   // "Khác" chỉ hiện khi có
  return chip("*", "Tất cả", v.byName.length) + T_RANKS.filter((r) => r.k !== "khac" || khac).map((r) => chip(r.k, r.label, v.cnt[r.k] || 0, r)).join("");
}
const teacherCount = (v) => `${v.shown.length !== v.all.length ? v.shown.length + " / " : ""}${v.all.length} giáo lý viên · ${esc(S.year ? S.year.long_year : "")}`;
// "Tất cả": tiêu đề từng cấp (pill + số người) theo thứ tự cấp · chọn 1 cấp: chỉ danh sách
function teacherListHtml(v) {
  if (!v.shown.length) return v.all.length ? emptyBox(ic("search", 44), "Không có kết quả") : emptyBox(ic("user", 44), "Chưa có giáo lý viên");
  return T_RANKS.map((r) => {
    const xs = v.shown.filter((x) => x.r.k === r.k); if (!xs.length) return "";
    return (TF.g === "*" ? `<div class="sec-eyebrow tr-h" data-g="${r.k}"><span class="rk rk-${r.k}">${esc(r.label)}</span><span class="eyebrow">${xs.length} người</span></div>` : "") +
      `<div class="stack">${xs.map((x) => teacherCard({ person: x.p, position: x.pos }, x.cls.join(" · "), x.r)).join("")}</div>`;
  }).join("");
}
function teachersScreen() {
  return tabScreen("teachers", {
    title: "Giáo lý viên", what: "danh sách GLV",
    draw: (list) => { const v = teacherView(list); screen(appbar({ title: "Giáo lý viên", bell: true, action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
      `<main><div class="wrap">
        <label class="searchbar">${ic("search", 18)}<input id="tq" placeholder="Lọc theo tên…" value="${esc(TF.q)}" oninput="filterTeachers(this.value)"/></label>
        <div class="rev-status filterbar" id="tChips">${teacherChips(v)}</div>
        <div class="muted" id="tCount" style="margin:0 6px 12px;font-size:13px">${teacherCount(v)}</div>
        <div id="tList" class="tr-list">${teacherListHtml(v)}</div>
      </div></main>`, "teachers"); },
    update: (list) => paintTeachers(list),
  });
}
// vẽ lại chip + số + danh sách (giữ chỗ cuộn ngang của hàng chip)
function paintTeachers(list) {
  const box = $("tList"); if (!box) return;
  const v = teacherView(list || S._teachers), ch = $("tChips"), sl = (ch && ch.scrollLeft) || 0;
  if (ch) { ch.innerHTML = teacherChips(v); ch.scrollLeft = sl; }
  const c = $("tCount"); if (c) c.innerHTML = teacherCount(v);
  box.innerHTML = teacherListHtml(v);
}
function filterTeachers(q) { TF.q = String(q == null ? "" : q); paintTeachers(); }
function teacherGroup(k) { TF.g = T_RANKS.some((r) => r.k === k) ? k : "*"; haptic(6); paintTeachers(); }
window.filterTeachers = filterTeachers; window.teacherGroup = teacherGroup;

// ============================================================
//  PERSON
// ============================================================
// Người đã có trong các danh sách đã tải (GLV năm, GLV lớp, thiếu nhi, tìm kiếm).
// API /people/:id chỉ cho xem khi can_view_profile = true (GLV thường mở hồ sơ GLV khác -> 403 Forbidden),
// nên khi bị chặn thì hiện hồ sơ rút gọn từ đây thay vì báo lỗi.
const PEOPLE = {};
function rememberPerson(p, extra) {
  if (!p || p.id == null) return;
  const k = String(p.id), clean = {};
  Object.keys(p).forEach((f) => { if (p[f] != null) clean[f] = p[f]; });   // bản rút gọn không ghi đè trường đã có bằng null
  PEOPLE[k] = Object.assign({}, PEOPLE[k] || {}, clean, extra || {});
}
const isMe = (id) => S.user && S.user.person_id != null && String(S.user.person_id) === String(id);
// Mở hồ sơ từ 1 danh sách thuộc tab khác (vd. Học sinh): nhớ tab cần sáng cho hồ sơ người đó (cả khi chuyển Cá nhân ⇄ Hành trình)
// — không gọi qua đây (thẻ GLV, tìm kiếm…) thì sáng "teachers" như cũ · về màn gốc của 1 tab là quên
let PERSON_NAV = null;   // { id, key }
function openPerson(id, navKey) {
  if (id == null || id === "") return;
  PERSON_NAV = navKey ? { id: String(id), key: String(navKey) } : null;
  const h = "#/person/" + id;
  if (location.hash === h) render(); else go(h);
}
window.openPerson = openPerson;
async function personScreen(id, tab) {
  tab = tab || "info"; loading();
  const t = NAV, known = PEOPLE[String(id)], navKey = (PERSON_NAV && PERSON_NAV.id === String(id) && PERSON_NAV.key) || "teachers";
  let p, limited = false;
  if (known && known.can_view_profile === false && !isMe(id)) { p = known; limited = true; }   // biết trước sẽ bị 403 -> khỏi gọi API
  else {
    try { p = await BGL.person(id); if (stale(t)) return; rememberPerson(p); }
    catch (e) {
      if (stale(t)) return;
      if (e.status === 403 && known) { p = known; limited = true; }
      else {
        screen(appbar({ title: "Thông tin", back: true }) + `<main>${e.status === 403 ? emptyBox(ic("key", 44), "Không có quyền xem hồ sơ này", "Tài khoản của bạn chỉ xem được hồ sơ của người mình được phân quyền.") : errBox(e.message)}</main>`);
        return;
      }
    }
  }
  screen(appbar({ title: p.full_name || p.name, back: true }) +
    `<main><div class="wrap">
      <div class="card pad profile-head">
        <div style="margin:0 auto 10px;width:76px">${avatar(p, { size: 76, fs: 26, cls: "g", tappable: true })}</div>
        <div class="faint" style="font-size:13px">${esc(p.christian_name || "")}</div>
        <div class="disp" style="font-size:22px">${esc(p.name || p.full_name)}</div>
        <div class="muted" style="font-size:13px;margin-top:2px">${[p.gender, p.birth_date ? fmtDate(p.birth_date) : ""].filter(Boolean).map(esc).join(" · ") || "&nbsp;"}</div>
      </div>
      ${limited ? `<div class="note"><span class="note-ic">${ic("key", 18)}</span><div><b>Hồ sơ rút gọn</b><div>Tài khoản của bạn không được xem hồ sơ đầy đủ của người này. Thông tin bên dưới lấy từ danh sách.</div></div></div>` : ""}
      ${seg("person", [["info", "Cá nhân", `go('#/person/${id}/info')`], ["journey", "Hành trình", `go('#/person/${id}/journey')`]], tab === "journey" ? 1 : 0)}
      <div id="pBody"><div class="spin"></div></div>
    </div></main>`, navKey);
  if (tab === "journey") personJourney(id); else personInfo(p);
}
function kv(k, v) { return `<div class="kv"><span class="k">${esc(k)}</span><span class="v">${esc(v || "—")}</span></div>`; }
function personInfo(p) {
  $("pBody").innerHTML = `
    <div class="sec-eyebrow"><span class="eyebrow">Liên hệ</span></div>
    <div class="card divlist"><div class="kv"><span class="k">Số điện thoại</span><span class="v">${phoneChip(p.phone, p.name || p.full_name)}</span></div>${kv("Email", p.email)}
      ${kv("Địa chỉ", [p.street_number, p.street_name].filter(Boolean).join(" "))}${kv("Phường/Xã", p.ward)}${kv("Quận/Huyện", p.district)}</div>
    <div class="sec-eyebrow"><span class="eyebrow">Bí tích</span></div>
    <div class="card divlist">${kv("Rửa tội", fmtDate(p.date_baptism))}${kv("Rước lễ", fmtDate(p.date_communion))}${kv("Thêm sức", fmtDate(p.date_confirmation))}${kv("Bao đồng", fmtDate(p.date_declaration))}</div>`;
}
async function personJourney(id) {
  const t0 = NAV; let list;
  try { list = await BGL.teachingByPerson(id); if (stale(t0)) return; }
  catch (e) {   // bị chặn -> dùng phân công năm nay đã có trong danh sách GLV
    if (stale(t0)) return;
    list = (S._teachers || []).filter((t) => t.person && String(t.person.id) === String(id));
    if (!list.length) { const b = $("pBody"); if (b) b.innerHTML = errBox(e.message); return; }
  }
  list.sort((a, b) => ((b.classroom && b.classroom.year) || 0) - ((a.classroom && a.classroom.year) || 0));
  const b = $("pBody"); if (!b) return;
  b.innerHTML = `<div class="stack">${list.map((t) => { const c = t.classroom || {}; return `<div class="card pad press" onclick="go('#/class/${c.id}')"><div class="row">${classIcon(c)}<div class="grow"><div class="faint" style="font-size:12px">${esc(c.long_year || "")}</div><div style="font-weight:700;font-size:16px">${esc(c.name || "")}</div><div class="muted" style="font-size:12.5px">${esc(c.location || "")}</div></div><span class="chip st-excused">${esc(t.position || "")}</span></div></div>`; }).join("") || emptyBox(ic("cal", 44), "Chưa có hành trình")}</div>`;
}

// ============================================================
//  ME / PROFILE + SETTINGS
// ============================================================
function meScreen() {
  const u = S.user || {};
  const role = myRole();
  const tm = themeMode();
  const THEMES = [["system", "Hệ thống"], ["light", "Sáng"], ["dark", "Tối"]];
  screen(appbar({ title: "Tôi", bell: true }) + `<main><div class="wrap stack">
    <div class="card pad press" onclick="${u.person_id ? `go('#/person/${u.person_id}')` : ""}">
      <div class="row">${avatar({ id: u.person_id, name: u.person_name }, { size: 58, fs: 20, cls: "g", tappable: true })}
        <div class="grow"><div class="disp" style="font-size:19px">${esc(u.person_name || "")}</div>
          <div class="muted" style="font-size:13px">${esc(role)} · ${esc(maskPhone(u.username || ""))}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div>
    </div>

    <div class="sec-eyebrow"><span class="eyebrow">Ứng dụng</span></div>
    ${setRow("gear", "Tiện ích ứng dụng", "Cử chỉ quẹt · Chuỗi học · Sao lưu · Debug · Cập nhật · Xoá dữ liệu", "utilsSheet()")}

    <div class="sec-eyebrow"><span class="eyebrow">Giao diện</span></div>
    ${seg("theme", THEMES.map(([k, l]) => [k, l, `setTheme('${k}')`]), Math.max(0, THEMES.findIndex((t) => t[0] === tm)))}

    <div class="sec-eyebrow"><span class="eyebrow">Tài khoản</span></div>
    ${setRow("key", "Thông tin đăng nhập", "Đổi tên đăng nhập / mật khẩu", "loginInfoSheet()")}
    ${setRow("logout", "Đăng xuất", "", "doLogout()", true)}
    <div class="faint" style="text-align:center;font-size:11.5px;padding:8px">Điểm Danh · <span id="appVer">v${esc((_ver || {}).name || APP_VERSION)}</span> · Ban Giáo Lý</div>
  </div></main>`, "me");
  // phiên bản thật lấy từ native (bất đồng bộ) -> chỉ vá chữ, không vẽ lại màn
  if (!_ver) appVersion().then((v) => { const e = $("appVer"); if (e) e.textContent = "v" + v.name; }).catch(() => {});
}
function setTheme(m) { store.set("bgl-theme", m); applyTheme(m); meScreen(); }
window.setTheme = setTheme; window.meScreen = meScreen;

function gestureSheet() {
  const g = gestures();
  const opts = (cur) => `<option value="">— Bỏ qua —</option>` + STATUSES.map((s) => `<option value="${s.v}" ${cur === s.v ? "selected" : ""}>${s.v}</option>`).join("");
  const row = (key, icon, label) => `<div class="field" style="margin-bottom:12px"><label style="display:flex;align-items:center;gap:8px"><span style="color:var(--brand-2)">${ic(icon, 18)}</span> ${label}</label><select class="input" data-g="${key}">${opts(g[key])}</select></div>`;
  openSheet(`<h3>Cử chỉ quẹt</h3><p class="muted" style="margin:-8px 2px 16px;font-size:13px">Chọn trạng thái cho mỗi hướng vuốt khi điểm danh nhanh.</p>
    ${row("up", "arrowU", "Vuốt lên")}${row("down", "arrowD", "Vuốt xuống")}${row("left", "arrowL", "Vuốt trái")}${row("right", "arrowR", "Vuốt phải")}${row("double", "tap", "Chạm đôi")}
    <button class="btn" style="margin-top:8px" onclick="saveGestures()">Lưu</button>
    <button class="btn ghost" style="margin-top:10px" onclick="resetGestures()">Khôi phục mặc định</button>`);
}
function saveGestures() { const g = {}; document.querySelectorAll("#sheet [data-g]").forEach((s) => (g[s.dataset.g] = s.value)); store.set("bgl-gestures", g); closeSheet(); toast("Đã lưu cử chỉ"); }
function resetGestures() { store.set("bgl-gestures", {}); closeSheet(); toast("Đã khôi phục mặc định"); }
window.gestureSheet = gestureSheet; window.saveGestures = saveGestures; window.resetGestures = resetGestures;

// ============================================================
//  TIỆN ÍCH: XUẤT / NHẬP / XOÁ / DEBUG
// ============================================================
// Hàng cài đặt kiểu iOS: biểu tượng trong viên kẹo màu + tiêu đề + mô tả + mũi tên
function setRow(icon, title, sub, onclick, danger, mb) {
  return `<button class="card pad press" style="width:100%;text-align:left${mb ? ";margin-bottom:" + mb : ""}" onclick="${onclick}">
    <div class="row"><span class="cico" style="width:38px;height:38px;border-radius:13px${danger ? ";background:linear-gradient(150deg,#f87171,#dc2626)" : ""}">${ic(icon, 19)}</span><div class="grow"><div style="font-weight:600${danger ? ";color:var(--danger)" : ""}">${title}</div>${sub ? `<div class="muted" style="font-size:12.5px">${sub}</div>` : ""}</div><span class="list-arrow">${ic("chev", 18)}</span></div>
  </button>`;
}
function utilRow(icon, title, sub, onclick, danger) { return setRow(icon, title, sub, onclick, danger, "10px"); }
function utilsSheet() {
  const dbgOn = (() => { try { return localStorage.getItem("bgl-debug") === "1"; } catch { return false; } })();
  const fxOn = effectsOn();
  openSheet(`<h3>Tiện ích ứng dụng</h3>
    ${utilRow("swipe", "Cử chỉ quẹt", "Tùy chỉnh vuốt lên/xuống/trái/phải &amp; chạm đôi", "gestureSheet()")}
    ${utilRow("fire", "Chuỗi học", "Quy tắc cộng / giữ / mất chuỗi · Xuất / Nhập dữ liệu chuỗi", "streakSettingsSheet()")}
    ${utilRow("gear", "Hiệu năng &amp; hiệu ứng", `Bật/tắt hiệu ứng động · <b style="color:${fxOn ? "var(--present-t)" : "var(--ink-faint)"}">${fxOn ? "ĐANG BẬT" : "ĐANG TẮT"}</b>`, "perfSheet()")}
    ${utilRow("upload", "Sao lưu &amp; xuất dữ liệu", "Xuất ảnh + cài đặt ra 1 file để lưu / chuyển máy", "exportData()")}
    ${utilRow("download", "Nhập dữ liệu", "Khôi phục ảnh &amp; cài đặt từ file sao lưu (.json hoặc .zip)", "importData()")}
    ${utilRow("bug", "Debug — log API", `Ghi endpoint · response · lỗi${dbgOn ? ' · <b style="color:var(--present-t)">ĐANG BẬT</b>' : ""}`, "debugSheet()")}
    ${utilRow("refresh", "Kiểm tra cập nhật", `Phiên bản hiện tại <span id="updVer">${esc(verText(_ver || { name: APP_VERSION }))}</span>`, "updateSheet()")}
    ${utilRow("trash", "Xoá dữ liệu", "Ảnh, cache, tài khoản đã lưu…", "deleteSheet()", true)}`);
  if (!_ver) appVersion().then((v) => { const e = $("updVer"); if (e) e.textContent = verText(v); }).catch(() => {});
}
window.utilsSheet = utilsSheet;
function copyText(t) {
  const done = () => toast("Đã copy");
  try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, () => fallbackCopy(t, done)); return; } } catch {}
  fallbackCopy(t, done);
}
function fallbackCopy(t, done) { try { const ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.focus(); ta.select(); document.execCommand("copy"); document.body.removeChild(ta); (done || (() => {}))(); } catch { toast("Không copy được"); } }

// ---- Sao lưu / Xuất ----
function collectBackup() {
  const d = { app: "DiemDanh", version: 2, exportedAt: new Date().toISOString(), userId: (S.user && S.user.id) || null, userName: (S.user && S.user.person_name) || null, photos: {}, names: {}, settings: {} };
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("bgl-photo-") === 0 && k !== "bgl-photo-names") d.photos[k] = localStorage.getItem(k); } } catch {}
  try { d.names = JSON.parse(localStorage.getItem("bgl-photo-names") || "{}"); } catch {}
  ["bgl-gestures", "bgl-theme", "bgl-streak", "bgl-effects"].forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) d.settings[k] = v; } catch {} });
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("bgl-streak-adj-") === 0) d.settings[k] = localStorage.getItem(k); } } catch {}
  return d;
}
async function exportData() {
  const json = JSON.stringify(collectBackup());
  const nPhotos = Object.keys(collectBackup().photos).length;
  const fname = `bgl-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const FS = window.Capacitor?.Plugins?.Filesystem, Sh = window.Capacitor?.Plugins?.Share;
  if (FS && Sh) {
    try {
      const w = await FS.writeFile({ path: fname, data: json, directory: "CACHE", encoding: "utf8" });
      await Sh.share({ title: "Sao lưu Điểm Danh", text: `Sao lưu ${nPhotos} ảnh + cài đặt`, url: w.uri, dialogTitle: "Lưu / gửi file sao lưu" });
      toast(`Đã xuất ${nPhotos} ảnh`);
    } catch (e) { if (!/cancel/i.test(e.message || "")) toast("Lỗi xuất: " + e.message); }
  } else {
    try { const b = new Blob([json], { type: "application/json" }); const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = fname; a.click(); toast("Đã tạo file tải về"); } catch { toast("Không xuất được trên nền web"); }
  }
}
window.exportData = exportData;

// ---- Nhập ----
function importData() {
  pickImportFile((docs) => {
    const backups = docs.filter((x) => x.data && x.data.photos), streaks = docs.filter((x) => x.data && x.data.type === "streak");
    if (!backups.length && !streaks.length) return toast("File sao lưu không hợp lệ");
    let n = 0, nc = 0, skip = 0, full = false;
    backups.forEach((x) => { const r = applyBackup(x.data); n += r.n; skip += r.skip; full = full || r.full; });
    streaks.forEach((x) => (nc += applyStreakImport(x.data)));   // .zip có kèm file chuỗi học -> gộp luôn
    applyTheme(themeMode()); document.documentElement.classList.toggle("no-fx", !effectsOn());
    const sk = skip ? ` · bỏ qua ${skip} mục ${full ? "(bộ nhớ đầy / không hợp lệ)" : "không hợp lệ"}` : "";
    closeSheet(); toast(backups.length ? `Đã nhập ${n} ảnh + cài đặt ✓${sk}` : `Đã nhập điều chỉnh chuỗi của ${nc} lớp ✓`, sk ? 4200 : 2200); render();
  });
}
// Ghi 1 file sao lưu vào máy (gán cho tài khoản đang đăng nhập) -> { n: số ảnh đã ghi, skip: số mục bỏ qua, full: có lần ghi lỗi do bộ nhớ }
// CHỈ nhận: ảnh bgl-photo-*-<id> (data URL ảnh base64) · điều chỉnh chuỗi bgl-streak-adj-*-<lớp> · vài cài đặt cố định — khoá lạ bị bỏ qua
const bkDate = (x) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x);
const bkObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const BACKUP_SETTINGS = {   // khoá -> hàm làm sạch giá trị (đã JSON.parse); undefined = bỏ qua
  "bgl-gestures": (v) => { if (!bkObj(v)) return; const g = {}; Object.keys(GESTURE_DEF).forEach((k) => { if (STATUSES.some((st) => st.v === v[k])) g[k] = v[k]; }); return g; },
  "bgl-theme": (v) => (["system", "light", "dark"].includes(v) ? v : undefined),
  "bgl-streak": (v) => { if (!bkObj(v)) return; const r = {}; STATUSES.forEach((st) => { if (["add", "hold", "break"].includes(v[st.v])) r[st.v] = v[st.v]; }); return r; },
};
function applyBackup(d) {
  let n = 0, skip = 0, full = false;
  const obj = (x) => (bkObj(x) ? x : {});
  const put = (k, v) => { try { localStorage.setItem(k, v); return true; } catch { full = true; skip++; return false; } };
  const parse = (v) => { try { return typeof v === "string" ? JSON.parse(v) : undefined; } catch { return undefined; } };
  const photos = obj(d && d.photos), settings = obj(d && d.settings), names = obj(d && d.names), got = {};
  Object.keys(photos).forEach((k) => {
    const m = k.match(/^bgl-photo-.*-(\d+)$/), val = photos[k];
    if (!m || typeof val !== "string" || !PHOTO_RE.test(val)) { skip++; return; }
    if (put(photoKey(m[1]), val)) { n++; got[m[1]] = 1; }
  });
  // tên kèm ảnh (hiện trong Xoá ảnh): chỉ id số + chuỗi ngắn, cho các ảnh vừa nhập
  try { const cur = obj(JSON.parse(localStorage.getItem("bgl-photo-names") || "{}")); let ch = 0; Object.keys(names).forEach((id) => { if (got[id] && typeof names[id] === "string") { cur[id] = names[id].slice(0, 120); ch++; } }); if (ch) localStorage.setItem("bgl-photo-names", JSON.stringify(cur)); } catch {}
  Object.keys(settings).forEach((k) => {
    const v = settings[k]; if (v == null) return;
    const m = k.match(/^bgl-streak-adj-[^-]+-(\d+)$/);
    if (m) {   // điều chỉnh chuỗi: chỉ giữ ngày YYYY-MM-DD (cùng dạng applyStreakImport)
      const a = parse(v); if (!bkObj(a)) { skip++; return; }
      const forgive = {}; Object.keys(obj(a.forgive)).forEach((eid) => { const arr = Array.isArray(a.forgive[eid]) ? a.forgive[eid].filter(bkDate) : []; if (/^\d+$/.test(eid) && arr.length) forgive[eid] = arr; });
      put(streakAdjKey(m[1]), JSON.stringify({ skip: (Array.isArray(a.skip) ? a.skip : []).filter(bkDate), forgive }));
      return;
    }
    if (k === "bgl-effects") { if (v === "0" || v === "1") put(k, v); else skip++; return; }
    const fix = BACKUP_SETTINGS[k], val = fix ? fix(parse(v)) : undefined;
    if (val === undefined) { skip++; return; }
    put(k, JSON.stringify(val));
  });
  return { n, skip, full };
}
window.importData = importData;

// ---- Xoá dữ liệu ----
function photoKeys() { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("bgl-photo-") === 0 && k !== "bgl-photo-names") out.push(k); } } catch {} return out; }
function fmtBytes(n) { return n > 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.round(n / 1024) + " KB"; }
function usedBytes(keys) { let b = 0; keys.forEach((k) => { try { b += (localStorage.getItem(k) || "").length; } catch {} }); return b; }
function deleteSheet() {
  const pk = photoKeys();
  const hasCred = (() => { try { return !!localStorage.getItem("bgl-cred"); } catch { return false; } })();
  openSheet(`<h3>Xoá dữ liệu</h3>
    <div class="stack">
      <button class="card pad press" style="width:100%;text-align:left" onclick="deletePhotosSheet()">
        <div class="row"><span style="color:var(--brand-2)">${ic("cam", 20)}</span><div class="grow"><div style="font-weight:600">Ảnh học sinh</div><div class="muted" style="font-size:12px">${pk.length} ảnh · ${fmtBytes(usedBytes(pk))} — xoá tất cả hoặc từng ảnh</div></div><span class="list-arrow">${ic("chev", 18)}</span></div>
      </button>
      <button class="card pad press" style="width:100%;text-align:left" onclick="confirmDelete('cache')">
        <div class="row"><span style="color:var(--brand-2)">${ic("book", 20)}</span><div class="grow"><div style="font-weight:600">Cache dữ liệu</div><div class="muted" style="font-size:12px">Xoá dữ liệu tạm (lớp/danh sách) — tải lại từ web</div></div></div>
      </button>
      <button class="card pad press" style="width:100%;text-align:left" onclick="confirmDelete('cred')">
        <div class="row"><span style="color:var(--brand-2)">${ic("key", 20)}</span><div class="grow"><div style="font-weight:600">Tài khoản đã lưu</div><div class="muted" style="font-size:12px">${hasCred ? "Xoá SĐT/mật khẩu đã lưu trên máy" : "Chưa lưu tài khoản"}</div></div></div>
      </button>
      <button class="card pad press" style="width:100%;text-align:left" onclick="confirmDelete('settings')">
        <div class="row"><span style="color:var(--brand-2)">${ic("gear", 20)}</span><div class="grow"><div style="font-weight:600">Cài đặt</div><div class="muted" style="font-size:12px">Cử chỉ quẹt, quy tắc & điều chỉnh chuỗi, giao diện về mặc định</div></div></div>
      </button>
      <button class="card pad press" style="width:100%;text-align:left;border:1px solid var(--danger)" onclick="confirmDelete('all')">
        <div class="row"><span style="color:var(--danger)">${ic("trash", 20)}</span><div class="grow"><div style="font-weight:600;color:var(--danger)">Xoá tất cả</div><div class="muted" style="font-size:12px">Xoá toàn bộ dữ liệu app trên máy này</div></div></div>
      </button>
    </div>`);
}
function deletePhotosSheet() {
  const names = (() => { try { return JSON.parse(localStorage.getItem("bgl-photo-names") || "{}"); } catch { return {}; } })();
  const rows = photoKeys().map((k) => {
    const pid = (k.match(/-(\d+)$/) || [])[1] || "";
    const nm = names[pid] || AV_NAMES[pid] || ("Học sinh #" + pid);
    const raw = localStorage.getItem(k) || "", ph = PHOTO_RE.test(raw) ? raw : "";
    return `<div class="rev-row" style="align-items:center">
      <div class="ava" style="width:40px;height:40px;background-image:url('${ph}');background-size:cover;background-position:center;border-color:transparent"></div>
      <div class="grow" style="font-weight:600;font-size:14px">${esc(nm)}</div>
      <button class="pick" style="color:var(--danger);border-color:var(--danger)" onclick="delOnePhoto('${jsq(k)}')">${ic("trash", 15)} Xoá</button>
    </div>`;
  }).join("") || `<div class="empty" style="padding:24px">Chưa có ảnh nào</div>`;
  openSheet(`<h3>Ảnh học sinh</h3>
    ${photoKeys().length ? `<button class="btn" style="background:var(--danger);margin-bottom:12px" onclick="confirmDelete('photos')">${ic("trash", 18)} Xoá tất cả ảnh (${photoKeys().length})</button>` : ""}
    <div class="card divlist" style="overflow:hidden">${rows}</div>`);
}
function delOnePhoto(k) { try { localStorage.removeItem(k); } catch {} toast("Đã xoá ảnh"); deletePhotosSheet(); }
function confirmDelete(what) {
  const label = { photos: "toàn bộ ẢNH học sinh", cache: "CACHE dữ liệu", cred: "TÀI KHOẢN đã lưu", settings: "CÀI ĐẶT (cử chỉ, quy tắc & điều chỉnh chuỗi, giao diện)", all: "TẤT CẢ dữ liệu app" }[what];
  openSheet(`<h3>Xác nhận xoá</h3><p class="muted" style="margin:-6px 2px 16px;font-size:14px">Bạn chắc chắn muốn xoá <b style="color:var(--ink)">${label}</b>? Không thể hoàn tác.</p>
    <div class="pickgrid"><button class="pickbtn clear" onclick="deleteSheet()">Huỷ</button>
    <button class="pickbtn" style="grid-column:span 2;justify-content:center;color:#fff;background:var(--danger);border-color:var(--danger)" onclick="doDelete('${what}')">${ic("trash", 18)} Xoá</button></div>`);
}
function doDelete(what) {
  try {
    if (what === "photos" || what === "all") { photoKeys().forEach((k) => localStorage.removeItem(k)); localStorage.removeItem("bgl-photo-names"); }
    if (what === "cache") { /* CX là bộ nhớ tạm trong RAM */ }
    if (what === "cred" || what === "all") clearCred();
    if (what === "settings" || what === "all") {
      ["bgl-gestures", "bgl-theme", "bgl-streak", "bgl-class-theme"].forEach((k) => localStorage.removeItem(k));
      const ks = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && (k.indexOf("bgl-streak-adj-") === 0 || (what === "all" && k.indexOf("bgl-notifs-") === 0))) ks.push(k); }
      ks.forEach((k) => localStorage.removeItem(k));
    }
    if (what === "all") localStorage.removeItem("bgl-debug");
  } catch {}
  for (const k in CX) delete CX[k];   // xoá cache RAM
  if (what === "settings" || what === "all") { applyClassTheme(what === "all" ? "" : classThemeKey(S.myAssignments && S.myAssignments[0] && S.myAssignments[0].classroom), what !== "all"); applyTheme(themeMode()); }
  closeSheet(); toast("Đã xoá xong");
  if (what === "all") { refreshBell(); S.user && meScreen(); }
}
window.deleteSheet = deleteSheet; window.deletePhotosSheet = deletePhotosSheet; window.delOnePhoto = delOnePhoto; window.confirmDelete = confirmDelete; window.doDelete = doDelete;

// ---- Debug: log API ----
function debugSheet() {
  const DBG = window.BGL_DBG || { enabled: false, logs: [] };
  const shortUrl = (u) => (u || "").replace(/^https?:\/\/[^/]+\//, "");
  const rows = DBG.logs.slice().reverse().map((l) => {
    const col = l.err ? "var(--danger)" : (l.status >= 200 && l.status < 300 ? "var(--present-t)" : "var(--late-t)");
    return `<div class="card" style="padding:10px 12px;margin-bottom:8px">
      <div class="row" style="justify-content:space-between;gap:8px"><span class="nm" style="font-weight:700;font-size:12px">${esc(l.method)} ${esc(shortUrl(l.url))}</span><span style="color:${col};font-weight:700;font-size:12px;white-space:nowrap">${l.status || "ERR"} · ${l.ms}ms</span></div>
      <div class="faint" style="font-size:10.5px;margin-top:2px">${esc((l.t || "").slice(11, 19))}</div>
      ${l.err ? `<div style="color:var(--danger);font-size:11.5px;margin-top:4px;word-break:break-word">Lỗi: ${esc(l.err)}</div>` : ""}
      ${l.res ? `<div class="muted" style="font-size:10.5px;margin-top:4px;word-break:break-all;max-height:70px;overflow:auto;background:var(--surface-2);padding:6px;border-radius:8px">${esc(l.res)}</div>` : ""}
    </div>`;
  }).join("") || `<div class="empty" style="padding:24px">Chưa có log. Bật debug rồi dùng app để ghi.</div>`;
  openSheet(`<h3>Debug — log API</h3>
    <label class="check" style="margin:-4px 2px 14px"><input type="checkbox" id="dbgToggle" ${DBG.enabled ? "checked" : ""} onchange="toggleDebug(this.checked)"><span class="box">${ic("check", 14)}</span><span>Bật ghi log (endpoint · response · lỗi)</span></label>
    <div class="row" style="gap:10px;margin-bottom:12px">
      <button class="btn ghost sm" style="flex:1" onclick="copyDebug()">${ic("copy", 16)} Copy log</button>
      <button class="btn ghost sm" style="flex:1;color:var(--danger)" onclick="clearDebug()">${ic("trash", 16)} Xoá log</button>
    </div>
    <div style="max-height:50vh;overflow:auto;margin:0 -2px">${rows}</div>`);
}
function toggleDebug(on) { try { localStorage.setItem("bgl-debug", on ? "1" : "0"); } catch {} if (window.BGL_DBG) window.BGL_DBG.enabled = on; toast(on ? "Đã bật debug" : "Đã tắt debug"); }
function clearDebug() { if (window.BGL_DBG) window.BGL_DBG.logs.length = 0; toast("Đã xoá log"); debugSheet(); }
function copyDebug() { copyText(JSON.stringify((window.BGL_DBG && window.BGL_DBG.logs) || [], null, 2)); }
window.debugSheet = debugSheet; window.toggleDebug = toggleDebug; window.clearDebug = clearDebug; window.copyDebug = copyDebug;

// ============================================================
//  KIỂM TRA CẬP NHẬT — GitHub Releases (repo công khai)
//  Android: plugin native AppUpdate tải APK → kiểm tra gói / versionCode / chữ ký → mở trình cài đặt
//  hệ thống (người dùng tự bấm Cài đặt). Cùng appId + cùng khoá ký ⇒ Android cài đè, GIỮ dữ liệu
//  (ảnh trong localStorage, tài khoản trong Keystore, cookie, cài đặt). Cài xong APK tự xoá.
//  iOS / web: chỉ báo có bản mới + mở trang phát hành.
// ============================================================
const UPDATE_REPO = "Blowes/diemdanh-app", APP_VERSION = "1.8", UPD_KEY = "bgl-update-pending";
const _upd = () => window.Capacitor?.Plugins?.AppUpdate;
// Số thay đổi điểm danh chưa Xác nhận (chỉ nằm trong bộ nhớ) — cài bản mới sẽ đóng app làm mất chúng
const updUnsent = () => { try { return Object.values(CX).reduce((n, c) => { const A = c && c.att; return n + (A && A.loaded ? (A.saving ? Math.max(1, changeCount(A)) : changeCount(A)) : 0); }, 0); } catch { return 0; } };
// ==== UPDATE HELPERS ====
// So sánh phiên bản từng đoạn số: "1.10" > "1.9", "1.2" == "1.2.0"; bỏ "v" đầu & đuôi chữ ("-beta")
function verParts(v) { const m = String(v == null ? "" : v).trim().replace(/^[vV]/, "").match(/^\d+(?:\.\d+)*/); return m ? m[0].split(".").map(Number) : null; }
function cmpVer(a, b) { const x = verParts(a) || [0], y = verParts(b) || [0]; for (let i = 0; i < Math.max(x.length, y.length); i++) { const d = (x[i] || 0) - (y[i] || 0); if (d) return d > 0 ? 1 : -1; } return 0; }
// Tag GitHub "v1.2" / "V1.2.3" / "1.2-beta" -> "1.2" (1–4 đoạn số); sai định dạng -> null
function parseTag(tag) { const m = String(tag == null ? "" : tag).trim().match(/^[vV]?(\d+(?:\.\d+){0,3})(?:[-+][0-9A-Za-z.+-]*)?$/); return m ? m[1].split(".").map(Number).join(".") : null; }
// File .apk đầu tiên trong assets (ưu tiên tên có "DiemDanh"), chỉ nhận link https
function pickApk(assets) { const l = (Array.isArray(assets) ? assets : []).filter((a) => a && typeof a.name === "string" && /\.apk$/i.test(a.name) && /^https:\/\//i.test(a.browser_download_url || "") && (!a.state || a.state === "uploaded")); return l.find((a) => /diemdanh/i.test(a.name)) || l[0] || null; }
// Dòng "minVersionCode: N" trong ghi chú phát hành (có thể có "- ", `…`, **…**) -> N; không có / sai -> 0
const MIN_CODE_RE = /^[ \t>*-]*[`*]*minVersionCode[`*]*[ \t]*[:=][ \t`*]*(\d{1,9})(?!\d)[ \t`*]*$/im;
function parseMinCode(body) { const m = String(body == null ? "" : body).replace(/\r\n?/g, "\n").match(MIN_CODE_RE); return m ? Number(m[1]) : 0; }
// Ghi chú phát hành: esc() TRƯỚC rồi mới thêm thẻ (gạch đầu dòng, tiêu đề, **đậm**) -> không chèn được HTML · ẩn dòng minVersionCode
function relNotes(body, max = 2000) {
  let s = String(body == null ? "" : body).replace(/\r\n?/g, "\n").replace(/<!--[\s\S]*?-->/g, "").replace(new RegExp(MIN_CODE_RE.source + "\\n?", "gim"), "").replace(/\n{3,}/g, "\n\n").trim(); if (!s) return "";
  if (s.length > max) s = s.slice(0, max).replace(/\s+\S*$/, "") + " …";
  const md = (x) => x.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  return esc(s).split("\n").map((l) => { const t = l.trim(), b = t.match(/^[-*]\s+(.*)$/), h = t.match(/^#{1,6}\s+(.*)$/); return b ? `<div style="display:flex;gap:8px"><span>•</span><span>${md(b[1])}</span></div>` : h ? `<div style="font-weight:700;margin-top:4px">${md(h[1])}</div>` : t ? `<div>${md(t)}</div>` : "<br>"; }).join("");
}
// ==== /UPDATE HELPERS ====
window.__upd = { cmpVer, parseTag, pickApk, relNotes, parseMinCode };

// Phiên bản đang cài: Android -> AppUpdate.getInfo · iOS -> App.getInfo · web -> APP_VERSION
let _ver = null;
const verText = (v) => `v${(v && v.name) || APP_VERSION}${v && v.code ? ` (${v.code})` : ""}`;
async function appVersion() {
  if (_ver) return _ver;
  const P = _upd(), A = window.Capacitor?.Plugins?.App;
  try { if (P) { const i = await P.getInfo(); if (i && i.versionName) return (_ver = { name: String(i.versionName), code: Number(i.versionCode) || 0 }); } } catch {}
  try { if (A && A.getInfo) { const i = await A.getInfo(); if (i && i.version) return (_ver = { name: String(i.version), code: Number(i.build) || 0 }); } } catch {}
  return { name: APP_VERSION, code: 0 };
}

// Gọi GitHub bằng fetch THUẦN (không qua BGL api: không gửi X-Api-Client-Key / cookie app)
async function fetchLatestRelease() {
  if (navigator.onLine === false) throw Object.assign(new Error("offline"), { code: "OFFLINE" });
  const ac = typeof AbortController === "function" ? new AbortController() : null; let tm;
  const to = new Promise((_, rej) => { tm = setTimeout(() => { rej(Object.assign(new Error("timeout"), { code: "TIMEOUT" })); try { ac && ac.abort(); } catch {} }, 15000); });
  try {
    const res = await Promise.race([fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, { method: "GET", credentials: "omit", cache: "no-store", headers: { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" }, signal: ac ? ac.signal : undefined }), to]);
    if (res.status === 404) return { none: true };
    if (res.status === 403 || res.status === 429) { const r = Number(res.headers.get("x-ratelimit-reset")) * 1000; throw Object.assign(new Error("rate"), { code: "RATE", mins: r > Date.now() ? Math.ceil((r - Date.now()) / 60000) : 0 }); }
    if (!res.ok) throw Object.assign(new Error("HTTP " + res.status), { code: "HTTP", status: res.status });
    const j = await Promise.race([res.json(), to]);
    if (!j || typeof j !== "object") throw Object.assign(new Error("bad json"), { code: "HTTP", status: res.status });
    return j;
  } catch (e) { if (!e || !e.code) throw Object.assign(new Error((e && e.message) || "network"), { code: e && e.name === "AbortError" ? "TIMEOUT" : e instanceof SyntaxError ? "HTTP" : navigator.onLine === false ? "OFFLINE" : "NET" }); throw e; }
  finally { clearTimeout(tm); }
}

let _updRel = null, _updFile = null, _updBusy = false, _updTok = 0, _updInstT = 0, _updResumeT = 0, _updNagAt = 0, _updDoneT = 0;
// Bảng cập nhật đang hiện (không tính lúc đang trượt đóng)
const updAlive = () => { const s = $("sheet"), b = $("upd"); return !!(s && b && !s.dataset.closing && s.contains(b)); };
function updPaint(html) { if (!updAlive()) return false; $("upd").innerHTML = html; const s = $("sheet"); if (s) s.scrollTop = 0; return true; }
const updMsg = (icon, title, sub, btns, head) => `<h3>${head || "Kiểm tra cập nhật"}</h3><div class="empty" style="padding:12px 10px 22px"><div class="big">${ic(icon, 44)}</div><div style="font-weight:600;color:var(--ink);font-size:15.5px;line-height:1.4">${title}</div>${sub ? `<div style="margin-top:8px;font-size:13.5px;line-height:1.55">${sub}</div>` : ""}</div>${btns || ""}`;
const updBtns = (fn, label) => (fn ? `<button class="btn" onclick="${fn}">${label}</button>` : "") + `<button class="btn ghost" style="margin-top:${fn ? 10 : 0}px" onclick="closeSheet()">Đóng</button>`;
const updNote = (icon, title, body) => `<div class="note"><span class="note-ic">${ic(icon, 18)}</span><div><b>${title}</b><div>${body}</div></div></div>`;

function updateSheet() { openSheet(`<div id="upd"></div>`); updCheck(); }
async function updCheck() {
  const t = ++_updTok; _updRel = null;
  updPaint(`<h3>Kiểm tra cập nhật</h3><div class="empty" style="padding:22px 10px 30px"><div class="spin" style="margin:0 auto 14px"></div>Đang kiểm tra…</div>`);
  const cur = await appVersion(), P = _upd(), plat = (window.Capacitor?.getPlatform && window.Capacitor.getPlatform()) || "web";
  let rel;
  try { rel = await fetchLatestRelease(); }
  catch (e) {
    if (t !== _updTok) return; const c = e && e.code, retry = updBtns("updCheck()", `${ic("refresh", 18)} Thử lại`);
    if (c === "RATE") return updPaint(updMsg("cal", "GitHub tạm giới hạn lượt kiểm tra, thử lại sau ít phút", e.mins ? `Có thể kiểm tra lại sau khoảng ${e.mins} phút.` : "", retry));
    if (c === "OFFLINE") return updPaint(updMsg("warn", "Không có kết nối mạng", "Bật Wi-Fi / 4G rồi thử lại.", retry));
    if (c === "TIMEOUT") return updPaint(updMsg("warn", "Kiểm tra quá lâu không phản hồi", "Mạng đang chậm — thử lại sau.", retry));
    if (c === "HTTP") return updPaint(updMsg("warn", "Không kiểm tra được bản mới", `GitHub trả lỗi ${esc(e.status || "")} — thử lại sau.`, retry));
    return updPaint(updMsg("warn", "Không kết nối được GitHub", "Kiểm tra mạng rồi thử lại.", retry));
  }
  if (t !== _updTok) return;
  if (rel.none) return updPaint(updMsg("book", "Chưa có bản phát hành nào trên GitHub", `Bạn đang dùng ${esc(verText(cur))}.`, updBtns()));
  const ver = parseTag(rel.tag_name);
  if (!ver) return updPaint(updMsg("warn", "Không đọc được số phiên bản mới", `Bản phát hành có tag "${esc(rel.tag_name || "")}" không đúng dạng v1.2 — báo admin kiểm tra lại.`, updBtns()));
  const d = rel.published_at ? new Date(rel.published_at) : null, date = d && !isNaN(d) ? fmtDate(toISO(d)) : "";
  if (cmpVer(ver, cur.name) <= 0) return updPaint(updMsg("check", `Bạn đang dùng bản mới nhất (v${esc(cur.name)})`, `Bản mới nhất trên GitHub: v${esc(ver)}${date ? " · phát hành " + date : ""}`, updBtns()));
  const asset = pickApk(rel.assets);
  _updRel = { ver, asset, rel, url: /^https:\/\/github\.com\//i.test(rel.html_url || "") ? rel.html_url : `https://github.com/${UPDATE_REPO}/releases/latest` };
  const meta = [date && "Phát hành " + date, asset && asset.size > 0 ? "APK " + fmtBytes(asset.size) : "", "Đang dùng " + esc(verText(cur))].filter(Boolean).join(" · "), notes = relNotes(rel.body);
  const later = `<button class="btn ghost" style="margin-top:10px" onclick="closeSheet()">Để sau</button>`, page = (cls) => `<button class="btn ${cls}" onclick="updOpenPage()">Mở trang phát hành</button>`;
  let act;
  if (P && plat === "android") act = asset
    ? updNote("check", "Giữ nguyên dữ liệu", "Ảnh, tài khoản đăng nhập và cài đặt được giữ nguyên. Tải xong, bạn bấm <b>Cài đặt</b> trong hộp thoại hệ thống để xác nhận.") + `<button class="btn" onclick="updStart(this)">${ic("download", 18)} Cập nhật ngay</button>` + later
    : updNote("warn", "Chưa có file cài đặt", `Bản v${esc(ver)} trên GitHub chưa đính kèm file .apk nên chưa thể tự cập nhật. Thử lại sau ít phút hoặc báo admin.`) + page("ghost") + later;
  else if (plat === "ios") act = updNote("sparkle", "Bản iPhone cài riêng", "Trang phát hành GitHub chỉ có file cài đặt cho Android. Trên iPhone, bản mới được cài riêng (TestFlight / admin gửi) — liên hệ admin nếu cần.") + page("") + later;
  else act = updNote("sparkle", "Tải bản cài đặt", "Bản này không tự cập nhật được. Mở trang phát hành để tải file .apk cho điện thoại Android.") + page("") + later;
  updPaint(`<h3>Có bản mới v${esc(ver)}</h3><div class="muted" style="margin:-8px 4px 14px;font-size:12.5px;line-height:1.5">${meta}</div>
    ${notes ? `<div class="card pad" style="max-height:34vh;overflow:auto;font-size:13.5px;line-height:1.55;margin-bottom:12px;word-break:break-word">${notes}</div>` : ""}${act}`);
}
function updOpenPage() { openExternal((_updRel && _updRel.url) || `https://github.com/${UPDATE_REPO}/releases/latest`); }

// Bấm "Cập nhật ngay": quyền cài -> dùng lại APK đã tải (nếu đúng bản) -> tải -> cài
async function updStart(btn) {
  const P = _upd(), R = _updRel; if (!P || !R || !R.asset) return;
  if (_updBusy) return toast(UPD_ERR.BUSY[1], 2600);   // lượt tải trước (đã huỷ) chưa dừng hẳn
  if (btn) btn.disabled = true; _updBusy = true;
  try {
    let info; try { info = await P.getInfo(); } catch (e) { return updFail(e); }
    if (!updAlive()) return;
    if (info && info.canInstall === false) return updPermSheet();
    try { const p = await P.getPending(); if (p && p.path && cmpVer(p.versionName, R.ver) === 0 && !(R.asset.size > 0 && p.size > 0 && p.size !== R.asset.size)) return await updInstall(p); } catch {}
    await updDownload();
  } finally { _updBusy = false; }
}
async function updDownload() {
  const P = _upd(), R = _updRel, a = R && R.asset; if (!P || !a) return;
  if (!updPaint(`<h3>Đang tải bản v${esc(R.ver)}</h3>
    <div class="progress" style="height:10px;margin:6px 2px 10px"><i id="updBar" style="width:0%"></i></div>
    <div class="row" style="justify-content:space-between;margin:0 4px 14px;font-size:13px"><b id="updPct" class="num">0%</b><span id="updSz" class="muted num">0 KB${a.size > 0 ? " / " + fmtBytes(a.size) : ""}</span></div>
    <p class="muted" style="margin:0 4px 16px;font-size:13px;line-height:1.5">Giữ app mở trong lúc tải. Đóng bảng này hoặc bấm Huỷ sẽ dừng tải.</p>
    <button class="btn ghost" id="updCancelBtn" onclick="updCancel()">Huỷ</button>`)) return;
  const sh = $("sheet"), cancel = () => { try { Promise.resolve(P.cancelDownload()).catch(() => {}); } catch {} };
  sh._onClose = cancel;   // đóng sheet / vuốt xuống / nút Back -> huỷ tải
  let h = null; try { h = await Promise.resolve(P.addListener("downloadProgress", (e) => updProg(e, a.size))); } catch {}
  try {
    const r = await P.download(Object.assign({ url: a.browser_download_url, fileName: a.name }, a.size > 0 ? { expectedSize: a.size } : {}));
    sh._onClose = null;
    if (!r || !r.path || !updAlive() || $("sheet") !== sh) { try { Promise.resolve(P.cleanup({})).catch(() => {}); } catch {} return; }   // người dùng đã đóng bảng = huỷ
    await updInstall(r);
  } catch (e) { sh._onClose = null; updFail(e, sh); }
  finally { try { if (h && h.remove) Promise.resolve(h.remove()).catch(() => {}); } catch {} }
}
function updProg(e, size) {
  const b = $("updBar"); if (!b || !e) return;
  const tot = e.total > 0 ? e.total : size > 0 ? size : 0, p = e.percent >= 0 ? Math.min(100, Math.round(e.percent)) : tot ? Math.min(100, Math.floor(((e.loaded || 0) / tot) * 100)) : -1;
  b.style.width = (p >= 0 ? p : 100) + "%"; b.style.opacity = p >= 0 ? "" : ".4";
  const pc = $("updPct"), sz = $("updSz"); if (pc) pc.textContent = p >= 0 ? p + "%" : "Đang tải…"; if (sz) sz.textContent = fmtBytes(e.loaded || 0) + (tot ? " / " + fmtBytes(tot) : "");
}
function updCancel() { const b = $("updCancelBtn"); if (b) { b.disabled = true; b.textContent = "Đang huỷ…"; } const P = _upd(); try { P && Promise.resolve(P.cancelDownload()).catch(() => {}); } catch {} }

// Mở trình cài đặt hệ thống — người dùng tự bấm "Cài đặt" để xác nhận
async function updInstall(p, force) {
  const P = _upd(); if (!P || !p || !p.path) return;
  const n = updUnsent();   // còn điểm danh chưa Xác nhận -> cảnh báo trước (cài đặt đóng app = mất thay đổi)
  if (n && !force) { _updFile = p; updPaint(updMsg("warn", `Còn ${n} thay đổi điểm danh chưa Xác nhận`, "Cài đặt sẽ đóng app — các thay đổi chưa Xác nhận sẽ mất. Hãy bấm <b>Xác nhận</b> ở màn Điểm danh trước, rồi vào lại Tôi → Tiện ích → Kiểm tra cập nhật.", `<button class="btn" onclick="updReinstall(true)">Vẫn cài đặt</button><button class="btn ghost" style="margin-top:10px" onclick="closeSheet()">Để sau</button>`, "Cập nhật ứng dụng")); return; }
  if (Date.now() - _updInstT < 1500) return; _updInstT = Date.now();   // chống bấm đúp mở 2 hộp thoại
  _updFile = p;
  if (!updPaint(`<h3>Cài đặt bản v${esc(p.versionName || "")}</h3>
    ${updNote("download", `Đã tải xong${p.size > 0 ? " (" + fmtBytes(p.size) + ")" : ""}`, "Bấm <b>Cài đặt</b> trong hộp thoại hệ thống để hoàn tất. Dữ liệu được giữ nguyên.")}
    <p class="muted" style="margin:0 4px 16px;font-size:13px;line-height:1.5">Không thấy hộp thoại? Bấm <b>Cài đặt lại</b>. Cài xong, file tải về sẽ tự xoá cho nhẹ máy.</p>
    <button class="btn" onclick="updReinstall()">${ic("refresh", 18)} Cài đặt lại</button>
    <button class="btn ghost" style="margin-top:10px;color:var(--danger)" onclick="updDiscard()">${ic("trash", 18)} Huỷ &amp; xoá file tải về</button>`)) return;
  store.set(UPD_KEY, { v: p.versionName, c: p.versionCode, at: new Date().toISOString() });
  try { await P.install({ path: p.path }); }
  catch (e) { if (e && e.code === "NOT_FOUND") { _updFile = null; try { localStorage.removeItem(UPD_KEY); } catch {} } updFail(e); }
}
function updReinstall(force) { if (_updFile) updInstall(_updFile, force); else updInstallPending(force); }
// Từ lời nhắc: lấy lại APK đã tải (getPending) rồi cài
async function updInstallPending(force) {
  const P = _upd(); if (!P) return; let p = null;
  try { p = await P.getPending(); } catch {}
  if (p && p.path) return updInstall(p, force);
  _updFile = null; try { localStorage.removeItem(UPD_KEY); } catch {}
  updPaint(updMsg("warn", "Không tìm thấy file cập nhật", "File tải về đã bị xoá. Kiểm tra cập nhật để tải lại.", updBtns("updCheck()", `${ic("refresh", 18)} Kiểm tra cập nhật`), "Cập nhật ứng dụng"));
}
async function updDiscard() {
  const P = _upd(); _updFile = null; try { localStorage.removeItem(UPD_KEY); } catch {}
  let r = null; try { r = P && (await P.cleanup({})); } catch {}
  closeSheet(); toast(r && r.freedBytes > 0 ? `Đã xoá file cập nhật (${fmtBytes(r.freedBytes)})` : "Đã xoá file cập nhật");
}

// Quyền "Cài ứng dụng không rõ nguồn" (Android 8+)
function updPermSheet() {
  updPaint(`<h3>Cho phép cài ứng dụng từ nguồn này</h3>
    <p class="muted" style="margin:-6px 4px 14px;font-size:14px;line-height:1.5">Để tự cài bản cập nhật, Android cần bạn cho phép <b style="color:var(--ink)">Điểm Danh</b> cài ứng dụng:</p>
    <div class="card pad" style="font-size:13.5px;line-height:1.7;margin-bottom:12px">1. Bấm <b>Mở cài đặt</b><br>2. Bật <b>Cho phép từ nguồn này</b><br>3. Quay lại app</div>
    <p class="faint" style="margin:0 4px 14px;font-size:12px;line-height:1.5">Một số máy tự mở lại app sau khi bật quyền — khi đó vào lại Tôi → Tiện ích → Kiểm tra cập nhật.</p>
    <button class="btn" onclick="updGrant()">${ic("settings", 18)} Mở cài đặt</button>
    <button class="btn ghost" style="margin-top:10px" onclick="closeSheet()">Để sau</button>`);
}
async function updGrant() {
  const P = _upd(); if (!P) return; let ok = false;
  try { const r = await P.openInstallPermissionSettings(); ok = !!(r && r.canInstall); } catch {}
  if (!ok) { try { ok = !!(await P.getInfo()).canInstall; } catch {} }
  if (!updAlive()) return;
  if (ok) return _updRel && _updRel.asset ? updStart() : updInstallPending();   // từ lời nhắc / APK chờ cài: chưa có _updRel
  updPaint(updMsg("key", "Chưa được cấp quyền cài đặt", "Không thể cài bản cập nhật khi chưa bật <b>Cho phép từ nguồn này</b> cho Điểm Danh.", updBtns("updGrant()", `${ic("settings", 18)} Mở lại cài đặt`), "Cập nhật ứng dụng"));
}

// Mã lỗi native -> lời nhắn dễ hiểu
const UPD_ERR = {
  NO_SPACE: ["Bộ nhớ máy không đủ", "Cần trống khoảng {size} để tải bản cập nhật. Xoá bớt ứng dụng / ảnh / video trong máy rồi thử lại."],
  NETWORK: ["Mất kết nối khi tải", "Kiểm tra Wi-Fi / 4G rồi thử lại."],
  HTTP: ["Không tải được file cập nhật", "Máy chủ GitHub trả lỗi {code} — thử lại sau ít phút."],
  INVALID_APK: ["File tải về bị lỗi", "File cài đặt không hợp lệ hoặc tải chưa trọn vẹn nên đã bị xoá. Hãy thử tải lại."],
  WRONG_PACKAGE: ["File không phải ứng dụng này", "File trên trang phát hành không phải ứng dụng Điểm Danh đang cài nên đã bị chặn và xoá. Báo admin kiểm tra lại bản phát hành."],
  NOT_NEWER: ["Không phải bản mới hơn", "File tải về có phiên bản không mới hơn bản đang cài nên đã bỏ qua và xoá. Báo admin kiểm tra lại bản phát hành."],
  SIGNATURE_MISMATCH: ["Chữ ký ứng dụng không khớp", "File cập nhật được ký bằng khoá khác với ứng dụng đang cài nên Android sẽ không cho cài đè (file đã bị xoá).<br><b style=\"color:var(--danger)\">Đừng gỡ ứng dụng để cài lại</b> — gỡ ứng dụng sẽ mất toàn bộ ảnh, tài khoản đã lưu và cài đặt. Hãy liên hệ admin."],
  NO_INSTALLER: ["Không mở được trình cài đặt", "Máy không có trình cài đặt ứng dụng khả dụng. Khởi động lại máy rồi thử lại."],
  BUSY: ["Đang có lượt tải khác", "Lượt tải trước chưa dừng hẳn — chờ vài giây rồi thử lại."],
  NOT_FOUND: ["Không tìm thấy file cập nhật", "File tải về đã bị xoá. Hãy tải lại."],
};
// sh: sheet đã bắt đầu lượt tải — sheet đó đã đóng / bị thay thì chỉ báo toast, không đụng sheet đang mở
function updFail(e, sh) {
  const code = String((e && e.code) || ""), mine = updAlive() && (!sh || $("sheet") === sh);
  if (code === "CANCELLED") { if (mine) closeSheet(); return toast("Đã huỷ tải bản cập nhật"); }
  const k = /^HTTP_\d+$/.test(code) ? "HTTP" : code, m = UPD_ERR[k], a = _updRel && _updRel.asset;
  if (!mine) return toast(m ? m[0] : code === "NEED_PERMISSION" ? "Chưa được cấp quyền cài đặt" : "Cập nhật không thành công", 3000);
  if (code === "NEED_PERMISSION") return updPermSheet();
  const sub = m ? m[1].replace("{code}", esc(code.slice(5))).replace("{size}", a && a.size > 0 ? fmtBytes(a.size + 20971520) : "vài chục MB") : esc((e && e.message) || "Lỗi không xác định") + " — thử lại sau.";
  const again = ["WRONG_PACKAGE", "NOT_NEWER", "SIGNATURE_MISMATCH"].includes(k) ? updBtns() : updBtns(_updRel ? "updStart()" : "updCheck()", `${ic("refresh", 18)} Thử lại`);
  updPaint(updMsg(k === "SIGNATURE_MISMATCH" ? "key" : "warn", m ? m[0] : "Cập nhật không thành công", sub, again, "Cập nhật ứng dụng"));
}

// Quay lại app mà bản đã tải chưa cài (vd. bấm Huỷ ở trình cài đặt) -> nhắc 1 lần
async function updOnResume() {
  try {
    const P = _upd(); if (!P || _updBusy) return;
    const now = Date.now(); if (now - _updResumeT < 1500) return; _updResumeT = now;   // resume + appStateChange cùng lúc -> 1 lần
    const pend = store.get(UPD_KEY, null); if (!pend || !(Number(pend.c) > 0)) return;
    await new Promise((r) => setTimeout(r, 700));                                      // chờ app / plugin khác xử lý xong lúc quay lại
    if ($("sheet") || $("fs") || updUnsent() || now - _updNagAt < 600000) return;     // đang mở bảng khác / đang điểm danh dở / vừa nhắc
    const info = await P.getInfo();
    if (Number(info && info.versionCode) >= Number(pend.c)) return updDone(info, pend);
    const p = await P.getPending();
    if (!p || !p.path) { try { localStorage.removeItem(UPD_KEY); } catch {} return; }
    if ($("sheet") || $("fs")) return;
    _updNagAt = Date.now(); _updFile = p;
    openSheet(`<div id="upd"><h3>Chưa cài bản cập nhật v${esc(p.versionName || pend.v || "")}</h3>
      <p class="muted" style="margin:-6px 4px 14px;font-size:14px;line-height:1.5">Bản cập nhật đã tải về${p.size > 0 ? ` (${fmtBytes(p.size)})` : ""} nhưng chưa được cài. Ảnh, tài khoản đăng nhập và cài đặt được giữ nguyên.</p>
      <button class="btn" onclick="updInstallPending()">${ic("download", 18)} Cài đặt</button>
      <button class="btn ghost" style="margin-top:10px" onclick="updDiscard()">Để sau</button>
      <p class="faint" style="margin:10px 4px 0;font-size:12px;line-height:1.5;text-align:center">"Để sau" sẽ xoá file tải về cho nhẹ máy — cập nhật lại bất cứ lúc nào trong Tôi → Tiện ích → Kiểm tra cập nhật.</p></div>`);
  } catch {}
}
// Đã lên bản mới: báo 1 lần + xoá dấu chờ cài & APK
function updDone(info, pend) {
  try { localStorage.removeItem(UPD_KEY); } catch {}
  if (!_updDoneT) { _updDoneT = Date.now(); toast(`Đã cập nhật lên v${(info && info.versionName) || (pend && pend.v) || ""} ✓`, 3200); }
  const P = _upd(); if (P && !_updBusy && !updAlive()) return Promise.resolve(P.cleanup({})).catch(() => {});
}
// Khởi động: đã lên bản mới -> báo + xoá APK · bỏ dở quá 1 ngày -> xoá · không có gì -> dọn sạch thư mục tải
async function updStartup() {
  try {
    const P = _upd(); if (!P) return;
    const idle = () => !_updBusy && !updAlive();   // đừng xoá file khi người dùng đang tải
    let pend = store.get(UPD_KEY, null);
    if (pend && !(Number(pend.c) > 0)) { try { localStorage.removeItem(UPD_KEY); } catch {} pend = null; }
    const info = await P.getInfo(), code = Number(info && info.versionCode) || 0;
    if (info && info.versionName && !_ver) _ver = { name: String(info.versionName), code };
    if (!idle()) return;
    if (pend) {
      if (code >= Number(pend.c)) return await updDone(info, pend);
      const t = Date.parse(pend.at || "");
      if (!(t > 0) || Date.now() - t > 864e5) { try { localStorage.removeItem(UPD_KEY); } catch {} await P.cleanup({}); return; }
      await P.cleanup({ keepPending: true });     // còn mới: giữ APK chờ cài, nhắc 1 lần
      setTimeout(updOnResume, 1500); return;
    }
    await P.cleanup({});
  } catch {}
}

// ---- Tự kiểm tra ngầm (Android): lúc mở / quay lại app, có mạng, tối đa 1 lần / 24 giờ -> có bản mới thì hiện thanh nhỏ
//      "Có bản mới vX — Cập nhật" (bấm mở bảng cập nhật). Bản đang cài có versionCode < minVersionCode của bản mới nhất
//      -> màn chặn chỉ cho Cập nhật (vẫn do người dùng bấm tải / cài, không ép cài). Nhớ kết quả để mở app offline vẫn chặn.
const UPD_AUTO_KEY = "bgl-update-auto";   // { at: lần kiểm tra cuối (ms), v: bản mới nhất, min: minVersionCode, n: tóm tắt ghi chú }
const UPD_AUTO_EVERY = 6 * 36e5;          // tự kiểm tra tối đa 6 giờ / lần
let _updAutoBusy = false;
async function updAuto() {
  const P = _upd(), plat = window.Capacitor?.getPlatform && window.Capacitor.getPlatform();
  if (!P || plat !== "android" || _updAutoBusy) return;
  _updAutoBusy = true;
  try {
    const cur = await appVersion(), last = store.get(UPD_AUTO_KEY, null) || {};
    const must = (r) => !!r && Number(r.min) > 0 && cur.code > 0 && cur.code < Number(r.min) && cmpVer(r.v, cur.name) > 0;
    // còn điểm danh chưa Xác nhận -> chưa chặn (để người dùng còn vào Xác nhận), chỉ báo; lần mở app sau sẽ chặn
    const block = (v) => (updUnsent() ? updBanner(v) : updBlock(v));
    if (must(last)) block(last.v);
    const age = Date.now() - (Number(last.at) || 0);
    if (!must(last) && age >= 0 && age < UPD_AUTO_EVERY) return paintHomeUpd();    // đã kiểm tra trong 24 giờ (đang bị chặn thì luôn kiểm tra lại: admin có thể đã hạ mức)
    if (navigator.onLine === false) return;
    let rel;
    try { rel = await fetchLatestRelease(); }
    catch (e) { if (e && e.code === "RATE") store.set(UPD_AUTO_KEY, Object.assign({}, last, { at: Date.now() })); return; }   // mất mạng -> lần sau thử lại
    const ver = rel && !rel.none ? parseTag(rel.tag_name) : null, rec = { at: Date.now(), v: ver || "", min: ver ? parseMinCode(rel.body) : 0, n: ver ? updShortNotes(rel.body) : [] };
    store.set(UPD_AUTO_KEY, rec);
    if (must(rec)) return block(rec.v);
    updUnblock();
    paintHomeUpd();
  } catch {} finally { _updAutoBusy = false; }
}
// 2 dòng đầu của ghi chú phát hành (bỏ markdown) cho thẻ Trang chủ
function updShortNotes(body) {
  return String(body || "").split(/\r?\n/).filter((l) => /^\s*[-*]\s+/.test(l)).slice(0, 2)
    .map((l) => l.replace(/^\s*[-*]\s+/, "").replace(/\*\*|`/g, "").replace(/\s+/g, " ").trim().slice(0, 110));
}
// Thẻ cập nhật ở Trang chủ (dưới "Lớp tôi phụ trách") — tự động; Tôi → Tiện ích → Kiểm tra cập nhật là thủ công
function homeUpdCard() {
  const rec = store.get(UPD_AUTO_KEY, null), cur = (_ver && _ver.name) || APP_VERSION;
  if (!rec || !rec.v || !_upd()) return "";
  if (cmpVer(rec.v, cur) > 0) {
    const n = Array.isArray(rec.n) ? rec.n : [];
    return `<div class="card pad upd-home press" onclick="updateSheet()">
      <div class="row" style="gap:12px"><span class="cico" style="width:40px;height:40px;border-radius:13px">${ic("sparkle", 20)}</span>
        <div class="grow"><div style="font-weight:700">Có bản mới v${esc(rec.v)}</div><div class="faint" style="font-size:12.5px">Đang dùng v${esc(cur)} · giữ nguyên ảnh, đăng nhập, cài đặt</div></div></div>
      ${n.length ? `<ul class="upd-home-n">${n.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>` : ""}
      <button class="btn sm" style="margin-top:10px" onclick="event.stopPropagation();updateSheet()">${ic("download", 17)} Cập nhật</button></div>`;
  }
  return `<div class="faint upd-home-ok">${ic("check", 13)} Đang dùng bản mới nhất v${esc(cur)}</div>`;
}
function paintHomeUpd() { const b = $("homeUpd"); if (b) b.innerHTML = homeUpdCard(); }
// Thanh nhỏ phía trên, không chặn thao tác; tự ẩn sau 15 giây
function updBanner(ver) {
  if (typeof document === "undefined" || !document.body || $("updBanner") || $("updBlock")) return;
  document.body.insertAdjacentHTML("beforeend", `<div class="toast on" id="updBanner" role="status" style="pointer-events:auto;z-index:45;top:calc(env(safe-area-inset-top) + 10px);bottom:auto;display:flex;align-items:center;gap:6px;padding:4px 4px 4px 14px;white-space:nowrap">
    <button style="all:unset;cursor:pointer;display:inline-flex;align-items:center;gap:8px;padding:6px 0" onclick="updBannerGo()">${ic("sparkle", 16)}<span>Có bản mới v${esc(ver)} — <b style="color:var(--brand)">Cập nhật</b></span></button>
    <button aria-label="Đóng" style="all:unset;cursor:pointer;display:grid;place-items:center;width:30px;height:30px;border-radius:50%;color:var(--ink-faint)" onclick="updBannerClose()">${ic("x", 14)}</button></div>`);
  const b = $("updBanner"); setTimeout(() => { if (b && $("updBanner") === b) b.remove(); }, 15000);
}
function updBannerClose() { const b = $("updBanner"); if (b) b.remove(); }
function updBannerGo() { updBannerClose(); updateSheet(); }
// Màn chặn: phủ cả app (dưới bảng cập nhật), chỉ có nút Cập nhật; nút Back = thoát app
function updBlock(ver) {
  updBannerClose();
  if (typeof document === "undefined" || !document.body || $("updBlock")) return;
  document.body.insertAdjacentHTML("beforeend", `<div id="updBlock" role="alertdialog" aria-modal="true" aria-labelledby="updBlockT" style="position:fixed;inset:0;z-index:82;background:var(--bg);color:var(--ink);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:calc(env(safe-area-inset-top) + 24px) 24px calc(env(safe-area-inset-bottom) + 24px);text-align:center">
    <div style="color:var(--brand)">${ic("download", 52)}</div>
    <h2 class="disp" id="updBlockT" style="margin:0;font-size:23px">Cần cập nhật ứng dụng</h2>
    <p class="muted" style="margin:0;max-width:360px;font-size:14.5px;line-height:1.55">Phiên bản đang cài đã cũ, không còn được hỗ trợ. Hãy cập nhật lên <b style="color:var(--ink)">v${esc(ver)}</b> để tiếp tục dùng — ảnh, tài khoản đăng nhập và cài đặt được giữ nguyên.</p>
    <button class="btn" style="max-width:360px;margin-top:8px" onclick="updateSheet()">${ic("download", 18)} Cập nhật</button></div>`);
}
function updUnblock() { const b = $("updBlock"); if (b) b.remove(); }
window.updBannerGo = updBannerGo; window.updBannerClose = updBannerClose;
window.updateSheet = updateSheet; window.updCheck = updCheck; window.updStart = updStart; window.updCancel = updCancel; window.updOpenPage = updOpenPage;
window.updReinstall = updReinstall; window.updInstallPending = updInstallPending; window.updDiscard = updDiscard; window.updGrant = updGrant;

async function loginInfoSheet() {
  const t = NAV;
  let user; try { user = await BGL.myUser(); } catch { user = null; }
  if (stale(t)) return;
  if (!user) return toast("Không lấy được tài khoản");
  openSheet(`<h3>Thông tin đăng nhập</h3>
    <div class="field" style="margin-bottom:12px"><label>Tên đăng nhập</label><input id="lu" class="input" value="${esc(user.username || "")}"/></div>
    <div class="field" style="margin-bottom:12px"><label>Mật khẩu mới (để trống nếu không đổi)</label><input id="lp" class="input" type="password" placeholder="••••••"/></div>
    <div class="field"><label>Nhập lại mật khẩu</label><input id="lp2" class="input" type="password" placeholder="••••••"/></div>
    <p id="lerr" style="color:var(--danger);font-size:13px;margin:10px 2px 0"></p>
    <button class="btn" style="margin-top:14px" id="lsave">Lưu thay đổi</button>`);
  $("lsave").onclick = async () => {
    const username = $("lu").value.trim(), pw = $("lp").value, pw2 = $("lp2").value;
    if (!username) return ($("lerr").textContent = "Tên đăng nhập bắt buộc.");
    if (pw && pw !== pw2) return ($("lerr").textContent = "Mật khẩu nhập lại không khớp.");
    const payload = { username }; if (pw) { payload.password = pw; payload.password_confirmation = pw2; }
    const b = $("lsave"); b.disabled = true; b.textContent = "Đang lưu…";
    try { await BGL.updateUser(user.id, payload); closeSheet(); toast("Đã cập nhật thông tin đăng nhập"); }
    catch (e) { $("lerr").textContent = e.message; b.disabled = false; b.textContent = "Lưu thay đổi"; }
  };
}
window.loginInfoSheet = loginInfoSheet;

// ============================================================
//  ĐIỂM DANH  (SWIPE + COLUMN + CONFIRM)  — signature feature
// ============================================================
async function tabAttendance(id) {
  const t = NAV, yr = classYearRange(CX[id].info);
  const A = (CX[id].att = CX[id].att || { date: defaultSunday(yr), assign: {}, existing: {}, dirty: new Set(), idx: 0, loaded: false, undo: [], prompted: false, justSaved: false });
  loadClassAttendance(id).then(() => { if (!stale(t)) paintAskCard(id); });   // nền: dữ liệu cả năm cho Chuỗi học / Cần hỏi thăm / thông báo sau khi Xác nhận
  const mode = attModeGet();
  $("tabBody").innerHTML = `<div id="askCard"></div>
    <button class="card pad press" style="width:100%;text-align:left;margin-bottom:14px" onclick="sundaySheet('${id}')">
      <div class="row"><span class="cico" style="width:40px;height:40px;border-radius:14px">${ic("cal", 19)}</span>
        <div class="grow"><div class="faint" style="font-size:13px">Ngày điểm danh (Chúa Nhật)</div>
          <div id="adateLbl" style="font-weight:700;font-size:16px">${weekdayVN(A.date)}, ${fmtDate(A.date)}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div>
    </button>
    <div id="attSeg">${seg("attmode", [["swipe", `${ic("swipe", 16)} Quẹt`, `attMode('${id}','swipe')`], ["cols", `${ic("cols", 16)} Cột`, `attMode('${id}','cols')`]], mode === "swipe" ? 0 : 1, "margin-bottom:16px")}</div>
    <div id="attArea"><div class="spin"></div></div>`;
  animateSegs($("tabBody"));
  let restored = 0;
  try { restored = await loadAtt(id); }
  catch (e) { if (!stale(t)) { const a = $("attArea"); if (a) a.innerHTML = errBox(e.message); } return; }
  if (stale(t)) return;
  renderColumn(id); paintAskCard(id);
  if (restored) toast(`Đã khôi phục ${restored} thay đổi chưa gửi`, 2800);
  if (!A.prompted && !isSundayToday() && yr && yr.current) { A.prompted = true; notSundayPrompt(id); }
  else if (mode === "swipe" && A.enr && A.enr.some((e) => !A.assign[e.id]) && !$("sheet")) {   // lần trước dùng Quẹt -> mở lại Quẹt, từ em chưa điểm đầu tiên
    if (!A.undo.length) A.idx = Math.max(0, A.enr.findIndex((e) => !A.assign[e.id]));
    openSwipeFull(id);
  }
}
window.tabAttendance = tabAttendance;
// Chế độ điểm danh nhớ lần trước (Quẹt / Cột)
const attModeGet = () => (store.get("bgl-attmode", "cols") === "swipe" ? "swipe" : "cols");
function attMode(id, m) {
  store.set("bgl-attmode", m); const i = m === "swipe" ? 0 : 1; SEGMEM.attmode = i;
  const sg = $("attSeg") && $("attSeg").querySelector(".seg");
  if (sg) { sg.style.setProperty("--i", i); sg.querySelectorAll("button").forEach((b, n) => b.classList.toggle("on", n === i)); }
  if (m === "swipe") openSwipeFull(id); else renderColumn(id);
}
window.attMode = attMode;

function setAttDate(id, date) {
  attDraftFlush(id);   // nháp của ngày đang xem ghi ngay trước khi đổi ngày
  const A = CX[id].att; A.date = date; A.loaded = false; A.assign = {}; A.existing = {}; A.dirty = new Set(); A.idx = 0; A.undo = []; A.justSaved = false;
  const lbl = $("adateLbl"); if (lbl) lbl.innerHTML = `${weekdayVN(date)}, ${fmtDate(date)}`;
  const area = $("attArea"); if (area) area.innerHTML = `<div class="spin"></div>`;
  const t = NAV;
  loadAtt(id).then((n) => { if (stale(t)) return; renderColumn(id); if (n) toast(`Đã khôi phục ${n} thay đổi chưa gửi`, 2800); }, (e) => { const a = !stale(t) && $("attArea"); if (a) a.innerHTML = errBox(e.message); });
}
function sundaySheet(id) {
  const A = CX[id].att, list = academicSundays(classYearRange(CX[id].info));
  if (!list.length) return toast("Chưa có dữ liệu niên khóa");
  let html = "", curM = "";
  list.forEach((sd) => {
    const m = sd.slice(0, 7);
    if (m !== curM) { curM = m; const [yy, mm] = m.split("-"); html += `<div class="eyebrow" style="margin:16px 2px 8px">Tháng ${mm} · ${yy}</div>`; }
    const sel = sd === A.date;
    html += `<button class="pickbtn ${sel ? "on st-present" : ""}" style="width:100%;margin-bottom:8px;justify-content:space-between" onclick="closeSheet();setAttDate('${id}','${sd}')"><span>${weekdayVN(sd)}, ${fmtDate(sd)}</span>${sel ? ic("check", 18) : `<span class="faint" style="display:inline-flex;align-items:center">${ic("chev", 16)}</span>`}</button>`;
  });
  openSheet(`<h3>Chọn ngày điểm danh</h3><div style="max-height:62vh;overflow:auto;margin:0 -2px">${html}</div>`);
}
function notSundayPrompt(id) {
  const A = CX[id].att;
  openSheet(`<h3>Hôm nay không phải Chúa Nhật</h3>
    <p class="muted" style="margin:-6px 2px 16px;font-size:14px">Hôm nay là <b style="color:var(--ink)">${weekdayVN()}</b>. App đang chọn sẵn <b style="color:var(--ink)">${weekdayVN(A.date)}, ${fmtDate(A.date)}</b>. Bạn có muốn chọn ngày điểm danh khác không?</p>
    <div class="pickgrid">
      <button class="pickbtn clear" onclick="closeSheet()">Không, giữ ngày này</button>
      <button class="pickbtn" style="grid-column:span 2;justify-content:center;color:var(--brand-2)" onclick="sundaySheet('${id}')">${ic("cal", 18)} Chọn ngày khác</button>
    </div>`);
}
window.setAttDate = setAttDate; window.sundaySheet = sundaySheet; window.notSundayPrompt = notSundayPrompt;

async function loadAtt(id) {
  const A = CX[id].att;
  if (A.loaded) return 0;
  const enr = CX[id].enr || (CX[id].enr = await BGL.classroomEnrollments(id));
  A.enr = enr.filter((e) => e.result === "Đang Học" || !e.result || e.result === "Học Lại");
  if (!A.enr.length) A.enr = enr;
  try {
    const recs = await BGL.attendancesByClass(id, A.date);
    A.existing = {}; A.assign = {};
    recs.forEach((r) => { A.existing[r.attendable_id] = { id: r.id, status: r.status }; A.assign[r.attendable_id] = r.status; });
  } catch { A.existing = {}; }
  A.idx = 0; A.undo = []; A.dirty = new Set(); A.syncSnooze = 0; A.justSaved = false; A.loaded = true;
  return attDraftRestore(id);   // nháp chưa gửi (tắt app / mất mạng) -> đè lên dữ liệu web
}
function changeCount(A) {
  let n = 0;
  for (const eid in A.assign) { const d = A.assign[eid], ex = A.existing[eid]; if ((d || "") !== (ex ? ex.status : "")) n++; }
  for (const eid in A.existing) { if (!(eid in A.assign) && A.existing[eid]) n++; }
  return n;
}

// ---------- BẢN NHÁP điểm danh chưa gửi — lưu máy theo tài khoản · lớp · ngày (tắt app / mất mạng không mất) ----------
// { assign: {eid: trạng thái | ""}, dirty: [eid…], t } · ghi trễ ~300ms sau mỗi lần đổi · gửi hết thành công -> xoá · quá 14 ngày -> dọn lúc mở app
const DRAFT_PFX = "bgl-att-draft-", DRAFT_TTL = 14 * 864e5, _draftT = {};
const draftKey = (id, date) => `${DRAFT_PFX}${(S.user && S.user.id) || "x"}-${id}-${date}`;
function attDraftWrite(id, date) {
  const A = CX[id] && CX[id].att; if (!A || (date && A.date !== date)) return;
  const k = draftKey(id, A.date), dirty = [...A.dirty];
  if (!dirty.length) { try { localStorage.removeItem(k); } catch {} return; }
  const assign = {}; dirty.forEach((e) => { assign[e] = A.assign[e] || ""; });
  store.set(k, { assign, dirty, t: Date.now() });
}
function attDraftSave(id) { const A = CX[id] && CX[id].att; if (!A) return; askRepaint(id); const d = A.date; clearTimeout(_draftT[id]); _draftT[id] = setTimeout(() => { delete _draftT[id]; attDraftWrite(id, d); }, 300); }
function attDraftFlush(id) { if (!_draftT[id]) return; clearTimeout(_draftT[id]); delete _draftT[id]; attDraftWrite(id); }
// Mở lại lớp/ngày: áp nháp lên dữ liệu web, bỏ mục web đã đúng như nháp / em không còn trong danh sách -> số mục khôi phục
function attDraftRestore(id) {
  const A = CX[id].att, k = draftKey(id, A.date), d = store.get(k, null);
  if (!d || !Array.isArray(d.dirty)) return 0;
  if (!(d.t > 0) || Date.now() - d.t > DRAFT_TTL) { try { localStorage.removeItem(k); } catch {} return 0; }
  const known = new Set((A.enr || []).map((e) => String(e.id)));
  let n = 0;
  d.dirty.forEach((eid) => {
    eid = String(eid); const v = (d.assign && d.assign[eid]) || "", sv = A.existing[eid] ? A.existing[eid].status : "";
    if (v === sv || !known.has(eid)) return;
    if (v) A.assign[eid] = v; else delete A.assign[eid];
    A.dirty.add(eid); n++;
  });
  if (!n) { try { localStorage.removeItem(k); } catch {} }
  return n;
}
function attDraftPurge(now) {
  now = now || Date.now();
  try {
    const dead = [];
    for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (!k || k.indexOf(DRAFT_PFX) !== 0) continue; const d = store.get(k, null); if (!d || !(d.t > 0) || now - d.t > DRAFT_TTL) dead.push(k); }
    dead.forEach((k) => localStorage.removeItem(k));
  } catch {}
}
attDraftPurge();
document.addEventListener("visibilitychange", () => { if (document.hidden) Object.keys(_draftT).forEach(attDraftFlush); });   // ra nền -> ghi nháp ngay

// ---------- FULL-SCREEN SWIPE ----------
function openSwipeFull(id) {
  S._swipeId = id;
  let host = $("fsHost");
  if (!host) { host = document.createElement("div"); host.id = "fsHost"; document.body.appendChild(host); }
  const c = CX[id].info || {};
  host.innerHTML = `<div class="fs" id="fs">
    <div class="fs-head">
      <button class="x" onclick="closeSwipeFull('${id}')">${ic("back", 20)}</button>
      <div class="t"><div class="cls">${esc(c.name || "Điểm danh")}</div><div class="dt">${fmtDate(CX[id].att.date)} · vuốt để điểm danh</div></div>
      <button class="x" onclick="gestureSheet()">${ic("gear", 20)}</button>
    </div>
    <div class="fs-body" id="swipeBody"></div>
  </div>`;
  renderSwipe(id);
}
function closeSwipeFull(id) { const h = $("fsHost"); if (h) h.innerHTML = ""; S._swipeId = null; renderColumn(id); }
window.openSwipeFull = openSwipeFull; window.closeSwipeFull = closeSwipeFull;

function renderSwipe(id) {
  const A = CX[id].att, area = $("swipeBody");
  if (!area) return;
  if (!A.enr || !A.enr.length) { area.innerHTML = emptyBox(ic("users",44), "Lớp chưa có thiếu nhi đang học"); return; }
  if (A.idx >= A.enr.length) return swipeDone(id);
  const g = gestures();
  const dirRow = (icn, key) => { const st = g[key]; return `<div class="lg"><span class="dir">${ic(icn, 18)}</span><span class="chip ${st ? stCls(st) : "st-none"}" style="padding:3px 9px">${st || "Bỏ qua"}</span></div>`; };
  area.innerHTML = `
    <div class="deckhud"><span class="count num">${A.idx + 1} / ${A.enr.length}</span>
      <button class="btn ghost sm" ${A.undo.length ? "" : "disabled"} onclick="swipeUndo('${id}')">${ic("back", 15)} Hoàn tác</button></div>
    <div class="progress"><i style="width:${(A.idx / A.enr.length) * 100}%"></i></div>
    <div class="deck" id="deck"></div>
    <div class="legend">${dirRow("arrowU", "up")}${dirRow("arrowD", "down")}${dirRow("arrowL", "left")}${dirRow("arrowR", "right")}
      <div class="lg" style="grid-column:span 2;justify-content:center"><span class="dir">${ic("tap", 18)}</span><span class="faint">Chạm đôi</span> <span class="chip ${g.double ? stCls(g.double) : "st-none"}" style="padding:3px 9px">${g.double || "Bỏ qua"}</span></div>
    </div>`;
  mountDeck(id);
}
function cardHTML(e, top) {
  const p = e.person || {}, pd = (p.data && p.data.parents_info) || {};
  return `<div class="swcard" data-eid="${e.id}" style="${top ? "" : "transform:scale(.94) translateY(14px);opacity:.6"}">
    <div class="tint" id="tint"></div>
    <div class="flash"><span class="lab" id="flash"></span></div>
    <div class="body">
      ${(() => { const ph = photoOf(p.id); return `<div class="bigava" style="${ph ? `background-image:url('${ph}');background-size:cover;background-position:center;color:transparent;border-color:transparent` : ""}">${ph ? "" : esc(initials(p.name || p.full_name))}</div>`; })()}
      <div class="cn">${esc(p.christian_name || "")}</div>
      <div class="fn" style="font-size:${nmFs(p.name || p.full_name, 26)}px">${esc(p.name || p.full_name)}</div>
      <div class="meta">${ic("cake",14)} ${fmtDate(p.birth_date)}</div>
    </div>
    <div class="foot">
      <div>Cha<b>${esc(pd.father_phone || p.phone || "—")}</b></div>
      <div>Mẹ<b>${esc(pd.mother_phone || "—")}</b></div>
    </div>
  </div>`;
}
function mountDeck(id) {
  const A = CX[id].att, deck = $("deck");
  const cur = A.enr[A.idx], next = A.enr[A.idx + 1];
  deck.innerHTML = (next ? cardHTML(next, false) : "") + cardHTML(cur, true);
  bindSwipe(id, deck.lastElementChild);
}
function dirFor(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"); }
function bindSwipe(id, card) {
  const A = CX[id].att, g = gestures();
  const flash = card.querySelector("#flash"), tint = card.querySelector("#tint");
  let sx = 0, sy = 0, dragging = false, lastTap = 0;
  const TH = 92;
  card.addEventListener("pointerdown", (e) => { dragging = true; sx = e.clientX; sy = e.clientY; card.style.transition = "none"; card.setPointerCapture?.(e.pointerId); });
  card.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    card.style.transform = `translate(${dx}px,${dy}px) rotate(${dx * 0.05}deg)`;
    const dir = dirFor(dx, dy), st = g[dir], dist = Math.max(Math.abs(dx), Math.abs(dy)), k = Math.min(dist / TH, 1);
    if (st) { const col = getComputedStyle(document.documentElement).getPropertyValue(stColorVar(st)); flash.textContent = st; flash.style.color = col; flash.style.opacity = k; flash.style.transform = `scale(${0.85 + k * 0.15})`; tint.style.background = col; tint.style.opacity = k * 0.15; }
    else { flash.style.opacity = 0; tint.style.opacity = 0; }
  });
  const end = (e) => {
    if (!dragging) return; dragging = false;
    const dx = e.clientX - sx, dy = e.clientY - sy, dist = Math.max(Math.abs(dx), Math.abs(dy));
    card.style.transition = "transform .28s ease, opacity .28s ease";
    if (dist < 8) { const now = Date.now(); if (now - lastTap < 320) { lastTap = 0; return commitSwipe(id, card, "double", g.double); } lastTap = now; card.style.transform = ""; flash.style.opacity = 0; tint.style.opacity = 0; return; }
    if (dist >= TH) { const dir = dirFor(dx, dy); return commitSwipe(id, card, dir, g[dir]); }
    card.style.transform = ""; flash.style.opacity = 0; tint.style.opacity = 0;
  };
  card.addEventListener("pointerup", end);
  card.addEventListener("pointercancel", () => { dragging = false; card.style.transform = ""; flash.style.opacity = 0; tint.style.opacity = 0; });
}
function commitSwipe(id, card, dir, status) {
  const A = CX[id].att, e = A.enr[A.idx];
  const off = { up: [0, -800], down: [0, 800], left: [-800, 0], right: [800, 0], double: [0, -800] }[dir] || [0, -800];
  card.style.transform = `translate(${off[0]}px,${off[1]}px) rotate(${off[0] * 0.04}deg)`; card.style.opacity = "0";
  if (status) { A.assign[e.id] = status; A.dirty.add(String(e.id)); attDraftSave(id); haptic(14); toast(`${(e.person || {}).name || ""}: ${status}`, 850); }
  A.undo.push(A.idx); A.idx++;
  setTimeout(() => renderSwipe(id), 190);
}
function swipeUndo(id) { const A = CX[id].att; if (!A.undo.length) return; A.idx = A.undo.pop(); attDraftSave(id); renderSwipe(id); }
window.swipeUndo = swipeUndo;
function swipeDone(id) {
  const b = $("swipeBody"); if (!b) return;
  b.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div class="disp" style="font-size:56px;color:var(--brand-2)">${ic("check",56)}</div>
    <div class="disp" style="font-size:22px;margin-top:4px">Đã quẹt xong</div>
    <p class="muted" style="margin:6px 0 22px;max-width:270px">Xem lại danh sách dạng cột rồi bấm Xác nhận để gửi lên hệ thống.</p>
    <button class="btn" style="max-width:290px" onclick="closeSwipeFull('${id}')">${ic("cols", 17)} Xem &amp; xác nhận</button>
    <button class="btn ghost" style="max-width:290px;margin-top:10px" onclick="attRestart('${id}')">Quẹt lại từ đầu</button>
  </div>`;
}
function attRestart(id) { const A = CX[id].att; A.idx = 0; A.undo = []; renderSwipe(id); }
window.attRestart = attRestart;

// ---------- COLUMN / REVIEW ----------
// Các phần đầu (nhẹ): nút nhanh · thống kê · bộ lọc · nút Xác nhận — vẽ lại riêng khi đổi 1 em (không vẽ lại cả danh sách)
function attHead(id) {
  const A = CX[id].att, n = A.enr.length;
  const counts = {}; STATUSES.forEach((s) => (counts[s.v] = 0));
  A.enr.forEach((e) => { const v = A.assign[e.id]; if (v) counts[v]++; });
  const done = A.enr.filter((e) => A.assign[e.id]).length, pending = changeCount(A);
  const stats = `<div class="statgrid" style="margin-bottom:14px">
    ${statTile(done + "/" + n, "Đã điểm", "gold")}
    ${STATUSES.slice(0, 5).map((s) => statTile(counts[s.v], s.v, STONE[s.v])).join("")}</div>`;
  // Bộ lọc theo trạng thái ("" = tất cả · "none" = chưa điểm · tên trạng thái)
  const F = A.filter || "", shown = A.enr.filter((e) => attMatches(A, e)), open = shown.filter((e) => !A.assign[e.id]).length;
  const chip = (key, label, k, cls) => `<button class="pick ${F === key ? "on " + cls : ""}" onclick="setAttFilter('${id}','${key}')">${label} <b class="num">${k}</b></button>`;
  const filter = `<div class="rev-status filterbar">${chip("", "Tất cả", n, "st-quit")}${chip("none", "Chưa điểm", n - done, "st-quit")}${STATUSES.filter((s) => counts[s.v] || F === s.v || s.v !== "Nghỉ Luôn").map((s) => chip(s.v, s.v, counts[s.v] || 0, s.cls)).join("")}</div>
    <div class="row" style="margin:0 2px 10px;gap:10px"><span class="muted grow" style="font-size:13px">${F ? `Đang hiện ${shown.length}/${n} em` : `${n} em`}</span>
      <button class="btn ghost sm" style="padding:8px 12px" onclick="applyAllSheet('${id}')">${ic("check", 15)} Đặt tất cả${F ? " (đang hiện)" : ""}</button></div>`;
  // Còn em chưa điểm -> nút chính "Tất cả có mặt" lên đầu (chỉ đặt cho em CHƯA điểm đang hiện)
  const allIn = open ? `<button class="btn press allin" onclick="applyAllPresent('${id}')">${ic("check", 19)} Tất cả có mặt <span class="allin-n">· ${open} em chưa điểm</span></button>` : "";
  const swipeCta = `<button class="btn ${open ? "ghost " : ""}press" style="margin-bottom:14px" onclick="openSwipeFull('${id}')">${ic("swipe", 18)} Quẹt để điểm danh nhanh</button>`;
  // Đã điểm đủ cả lớp HOẶC vừa Xác nhận thành công -> hiện ô xuất bảng điểm danh (lấp lánh)
  const allDone = done === n;
  const exportCta = (allDone || A.justSaved) ? `<button class="export-cta press" onclick="exportSheet('${id}')">
      <span class="ex-ic">${ic("image", 22)}</span>
      <div class="grow"><div class="ex-t">Xuất bảng điểm danh</div>
        <div class="ex-s">${allDone ? `Đã điểm đủ ${n} em` : "Đã lưu lên hệ thống"} · tạo ảnh gửi phụ huynh${pending ? ` · còn ${pending} thay đổi chưa xác nhận` : ""}</div></div>
      <span class="ex-chev">${ic("chev", 18)}</span><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i></button>` : "";
  const confirm = `<button class="btn gold" id="confirmBtn" ${A.saving ? "disabled" : ""} onclick="attConfirm('${id}')">${A.saving ? `<span class="spin" style="width:18px;height:18px;margin:0;border-width:2px"></span> Đang gửi…` : `${ic("check", 18)} Xác nhận (${pending})`}</button>`;
  return { top: allIn + swipeCta + exportCta, stats, filter, confirm };
}
function attChip(id, eid, cur) { return `<span class="chip ${cur ? stCls(cur) : "st-none"}" id="achip-${eid}" onclick="event.stopPropagation();attTap('${id}',${eid},1)">${cur ? '<span class="dot"></span>' : ""}${cur || "Chưa điểm"}</span>`; }
// Chạm 1 lần (em chưa điểm) = Hiện Diện · chạm lại / chạm ô trạng thái / giữ lâu = bảng chọn
function attRowHTML(id, e) {
  const A = CX[id].att, p = e.person || {}, cur = A.assign[e.id] || "";
  return `<button class="rev-row" id="arow-${e.id}" style="width:100%;text-align:left;background:none" onclick="attTap('${id}',${e.id})" onpointerdown="attPress(event,'${id}',${e.id})" onpointermove="attPressMove(event)" onpointerup="attPressEnd()" onpointercancel="attPressEnd()" oncontextmenu="return false">
      ${avatar(p, { size: 42, r: 12, fs: 14, tappable: true })}
      <div class="grow"><div class="nm" style="font-weight:600;font-size:${nmFs(p.name || p.full_name, 15)}px">${esc(p.name || p.full_name)}</div><div class="faint" style="font-size:13px">${esc(p.christian_name || "")}</div></div>
      ${attChip(id, e.id, cur)}
      <span class="list-arrow">${ic("chev", 18)}</span>
    </button>`;
}
function renderColumn(id) {
  const A = CX[id].att, area = $("attArea");
  if (!area) return;
  if (!A.enr || !A.enr.length) { area.innerHTML = emptyBox(ic("users",44), "Lớp chưa có thiếu nhi đang học"); return; }
  const h = attHead(id), shown = A.enr.filter((e) => attMatches(A, e));
  const rows = shown.map((e) => attRowHTML(id, e)).join("") || `<div class="empty" style="padding:30px 20px;font-size:13.5px">Không có em nào ở trạng thái này</div>`;
  area.innerHTML = `<div id="attTop">${h.top}</div><div id="attStats">${h.stats}</div><div id="attFilter">${h.filter}</div><div class="card divlist" id="attRows" style="overflow:hidden">${rows}</div><div style="height:84px"></div>` +
    `<div class="confirmbar" id="confirmBar">${h.confirm}</div>`;
}
window.renderColumn = renderColumn;
// Đổi 1 em: chỉ thay ô trạng thái của dòng đó + phần đầu (phần nào không đổi thì giữ nguyên). Dòng vẫn đứng yên dù không còn khớp bộ lọc
// (tránh danh sách nhảy dưới ngón tay) — lọc lại khi bấm bộ lọc / vẽ lại cả bảng.
function attPaint(id, eid) {
  const A = CX[id].att, ch = $("achip-" + eid);
  if (!ch || !$("attRows")) return renderColumn(id);
  ch.outerHTML = attChip(id, eid, A.assign[eid] || "");
  const h = attHead(id);
  [["attTop", h.top], ["attStats", h.stats], ["attFilter", h.filter], ["confirmBar", h.confirm]].forEach(([k, html]) => { const el = $(k); if (el && el._h !== html) { el.innerHTML = html; el._h = html; } });
}
function attMatches(A, e) { const F = A.filter || "", v = A.assign[e.id] || ""; return F === "" ? true : F === "none" ? !v : v === F; }
function setAttFilter(id, key) { const A = CX[id].att; A.filter = A.filter === key ? "" : key; haptic(8); renderColumn(id); }
// Đặt 1 trạng thái cho tất cả em đang hiển thị (theo bộ lọc) — chưa gửi, vẫn cần Xác nhận
function applyAllSheet(id) {
  const A = CX[id].att, F = A.filter || "", shown = A.enr.filter((e) => attMatches(A, e));
  if (!shown.length) return toast("Không có em nào để áp dụng");
  const scope = F === "" ? "tất cả" : F === "none" ? "chưa điểm" : `đang ${F}`;
  const btns = STATUSES.map((s) => `<button class="pickbtn" onclick="applyAll('${id}','${s.v}')"><span class="sw" style="background:var(${stColorVar(s.v)})"></span>${s.v}</button>`).join("");
  openSheet(`<h3>Đặt trạng thái cho ${shown.length} em</h3>
    <p class="muted" style="margin:-6px 2px 14px;font-size:13.5px;line-height:1.45">Áp dụng cho <b style="color:var(--ink)">${shown.length} em ${scope}</b> đang hiển thị. Chưa gửi lên hệ thống — soát lại rồi bấm Xác nhận.</p>
    <div class="pickgrid">${btns}<button class="pickbtn clear" onclick="applyAll('${id}','')">Xóa trạng thái (Chưa điểm)</button></div>`);
}
function applyAll(id, v) {
  const A = CX[id].att, shown = A.enr.filter((e) => attMatches(A, e));
  shown.forEach((e) => { A.dirty.add(String(e.id)); if (v) A.assign[e.id] = v; else delete A.assign[e.id]; });
  A.filter = ""; closeSheet(); haptic(); attDraftSave(id);
  toast(v ? `Đã đặt ${v} cho ${shown.length} em` : `Đã xóa trạng thái ${shown.length} em`);
  renderColumn(id);
}
// "Tất cả có mặt": Hiện Diện cho các em CHƯA điểm đang hiện (em đã điểm giữ nguyên)
function applyAllPresent(id) {
  const A = CX[id].att, list = A.enr.filter((e) => attMatches(A, e) && !A.assign[e.id]);
  if (!list.length) return;
  list.forEach((e) => { A.dirty.add(String(e.id)); A.assign[e.id] = "Hiện Diện"; });
  A.filter = ""; haptic(); attDraftSave(id);
  toast(`Đã đặt Hiện Diện cho ${list.length} em — bấm Xác nhận để gửi`);
  renderColumn(id);
}
window.setAttFilter = setAttFilter; window.applyAllSheet = applyAllSheet; window.applyAll = applyAll; window.applyAllPresent = applyAllPresent;

function statusPicker(id, eid) {
  const A = CX[id].att, e = A.enr.find((x) => x.id === eid) || {}, p = e.person || {}, cur = A.assign[eid] || "";
  const btns = STATUSES.map((s) => `<button class="pickbtn ${cur === s.v ? "on " + s.cls : ""}" onclick="pickStatus('${id}',${eid},'${s.v}')"><span class="sw" style="background:var(${stColorVar(s.v)})"></span>${s.v}</button>`).join("");
  openSheet(`<h3>${esc(p.name || p.full_name || "Điểm danh")}</h3><div class="pickgrid">${btns}<button class="pickbtn clear" onclick="pickStatus('${id}',${eid},'')">Xóa / Chưa điểm</button></div>`);
}
function attSet(id, eid, v) { const A = CX[id].att; A.dirty.add(String(eid)); if (v) A.assign[eid] = v; else delete A.assign[eid]; attDraftSave(id); attPaint(id, eid); }
function pickStatus(id, eid, v) { haptic(); closeSheet(); attSet(id, eid, v); }
let _lp = null;   // giữ lâu 1 dòng (~0.5s) -> mở bảng chọn; click ngay sau đó bị bỏ qua
function attPress(ev, id, eid) { attPressEnd(); const lp = { x: ev.clientX, y: ev.clientY, fired: false }; lp.t = setTimeout(() => { lp.fired = true; haptic(18); statusPicker(id, eid); }, 480); _lp = lp; }
function attPressMove(ev) { if (_lp && !_lp.fired && (Math.abs(ev.clientX - _lp.x) > 10 || Math.abs(ev.clientY - _lp.y) > 10)) { clearTimeout(_lp.t); _lp = null; } }
function attPressEnd() { if (_lp && !_lp.fired) clearTimeout(_lp.t); }
function attTap(id, eid, pick) {
  const lp = _lp; _lp = null; if (lp) clearTimeout(lp.t);
  if (lp && lp.fired) return;
  if (pick || CX[id].att.assign[eid]) return statusPicker(id, eid);
  haptic(); attSet(id, eid, "Hiện Diện");
}
window.statusPicker = statusPicker; window.pickStatus = pickStatus; window.attTap = attTap; window.attPress = attPress; window.attPressMove = attPressMove; window.attPressEnd = attPressEnd;

function attJobs(A) {
  const jobs = [], ids = new Set([...Object.keys(A.assign), ...Object.keys(A.existing)]);
  ids.forEach((eid) => {
    const desired = A.assign[eid], ex = A.existing[eid];
    if (desired && !ex) jobs.push({ type: "create", eid, status: desired });
    else if (desired && ex && desired !== ex.status) jobs.push({ type: "update", eid, id: ex.id, status: desired });
    else if (!desired && ex) jobs.push({ type: "delete", eid, id: ex.id });
  });
  return jobs;
}
// Chạy song song tối đa n việc (việc đầu chạy riêng: token hết hạn chỉ refresh 1 lần). run(j) === false -> không lấy thêm việc mới
async function attPool(jobs, n, run) {
  let i = 0, stop = false;
  const next = async () => { while (!stop && i < jobs.length) { const j = jobs[i++]; if ((await run(j)) === false) stop = true; } };
  if (jobs.length) { i = 1; if ((await run(jobs[0])) === false) return; }
  await Promise.all(Array.from({ length: Math.min(n, jobs.length - 1) }, next));
}
const attErrText = (e) => { const m = (e && e.message) || ""; return ERR_VN[m] || m || "Lỗi không rõ"; };
async function attConfirm(id) {
  const A = CX[id].att;
  let jobs = attJobs(A);
  if (!jobs.length) return toast("Không có thay đổi để gửi");
  if (A.saving) return;
  A.saving = true;
  const spin = `<span class="spin" style="width:18px;height:18px;margin:0;border-width:2px"></span>`;
  const setBtn = (html) => { const b = $("confirmBtn"); if (b) { b.disabled = true; b.innerHTML = html; } };
  setBtn(`${spin} Đang gửi…`);
  const before = streakMap(id);                     // chuỗi TRƯỚC khi lưu (từ cache, không chờ mạng)
  let ok = 0, done = 0, expired = false; const failed = [];
  // Có em cần TẠO MỚI -> tải lại điểm danh ngày này trước: lần gửi trước (mất mạng giữa chừng) có thể đã lên web
  // -> không POST trùng: đã có bản ghi thì đổi sang sửa (PUT) hoặc bỏ nếu đã đúng
  if (jobs.some((j) => j.type === "create")) {
    try { const recs = await BGL.attendancesByClass(id, A.date); const fx = {}; (recs || []).forEach((r) => { fx[r.attendable_id] = { id: r.id, status: r.status }; }); mergeFromServer(A, fx); jobs = attJobs(A); }
    catch (e) { if (e && e.status === 401) expired = true; }
  }
  if (!expired) await attPool(jobs, 4, async (j) => {
    if (expired) return false;
    try {
      if (j.type === "create") { const r = await BGL.createAttendance("Enrollment", +j.eid, A.date, j.status); A.existing[j.eid] = { id: (r && (r.id || (r.data && r.data.id))), status: j.status }; }
      else if (j.type === "update") { await BGL.updateAttendance(j.id, j.status); A.existing[j.eid] = { id: j.id, status: j.status }; }
      else if (j.type === "delete") { await BGL.deleteAttendance(j.id); delete A.existing[j.eid]; }
      ok++;
      if ((A.assign[j.eid] || "") === (j.type === "delete" ? "" : j.status)) A.dirty.delete(String(j.eid));   // đã lên web (trừ khi vừa đổi tiếp trong lúc gửi)
    } catch (e) {
      if (e && e.status === 401) { expired = true; return false; }   // hết phiên -> dừng ngay, phần còn lại giữ chờ gửi
      failed.push({ eid: String(j.eid), why: attErrText(e) });
    } finally { done++; if (!expired) setBtn(`${spin} Đang gửi ${done}/${jobs.length}`); }
  });
  A.dirty.forEach((k) => { if ((A.assign[k] || "") === (A.existing[k] ? A.existing[k].status : "")) A.dirty.delete(k); });   // khớp web -> hết chờ gửi
  const fail = failed.length, left = Math.max(0, jobs.length - ok - fail);
  CX[id].enr = null;
  A.justSaved = !fail && !expired; A.saving = false; A.failed = fail ? failed : null; A.unsent = !!(fail || expired);
  clearTimeout(_draftT[id]); delete _draftT[id]; attDraftWrite(id);   // gửi hết -> xoá nháp · còn lỗi / hết phiên -> nháp giữ phần chưa gửi
  if (expired) toast("Phiên đăng nhập hết hạn — đăng nhập lại để gửi tiếp", 3600);   // sheet đăng nhập lại do sự kiện bgl-session-expired lo
  else if (!fail) toast(ok ? `Đã lưu điểm danh ${ok} thiếu nhi ✓` : "Điểm danh đã có sẵn trên web ✓", 2600);
  renderColumn(id);
  if (fail && !expired) attFailSheet(id);
  // vá cache điểm danh cả năm cho ngày này (nếu đang tải thì chờ tối đa 4s / hoặc vá khi tải xong) -> chuỗi -> thông báo
  const day = {}; Object.keys(A.existing).forEach((eid) => { if (A.existing[eid]) day[eid] = A.existing[eid].status; });
  const C = CX[id]; C.attPatch = { date: A.date, day };
  try { if (C.attAllP) await Promise.race([C.attAllP, new Promise((r) => setTimeout(r, 4000))]); } catch {}
  if (C.attAll && C.attPatch) { C.attAll.by[A.date] = day; C.attPatch = null; }
  notifyConfirm(id, A, ok, fail + left, before, streakMap(id));
  paintAskCard(id);
  if ($("stuList")) paintStreaks(id);
}
// Gửi lỗi một phần: liệt kê em chưa gửi được (tên + lý do) + Gửi lại
function attFailSheet(id) {
  const A = CX[id].att, list = A.failed || []; if (!list.length) return;
  const nm = (eid) => { const e = (A.enr || []).find((x) => String(x.id) === String(eid)), p = (e && e.person) || {}; return p.name || p.full_name || `Thiếu nhi #${eid}`; };
  openSheet(`<h3>Chưa gửi được ${list.length} em</h3>
    <p class="muted" style="margin:-6px 2px 14px;font-size:14px;line-height:1.45">Các em dưới đây vẫn được giữ là thay đổi chưa gửi (đã lưu trên máy). Kiểm tra mạng rồi bấm Gửi lại.</p>
    <div class="card divlist" style="max-height:40vh;overflow:auto;margin-bottom:14px">${list.map((f) => `<div class="kv"><span class="k" style="color:var(--ink);font-weight:600">${esc(nm(f.eid))}</span><span class="v faint" style="font-weight:500;font-size:13px">${esc(f.why)}</span></div>`).join("")}</div>
    <button class="btn" onclick="closeSheet();attConfirm('${id}')">${ic("refresh", 18)} Gửi lại</button>`);
}
// Có mạng lại / quay lại app mà còn thay đổi gửi lỗi -> mời gửi ngay (tối đa 1 lần / phút / lớp)
function attOfferPending() {
  if (!S.user || $("sheet") || $("fs")) return;
  const ids = Object.keys(CX).filter((k) => { const A = CX[k] && CX[k].att; return A && A.loaded && A.unsent && !A.saving && changeCount(A) > 0; });
  if (!ids.length) return;
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  const id = parts[0] === "class" && ids.includes(parts[1]) ? parts[1] : ids[0], A = CX[id].att, n = changeCount(A), c = CX[id].info || {};
  if (A.offerAt && Date.now() - A.offerAt < 60000) return;
  A.offerAt = Date.now();
  openSheet(`<h3>Còn ${n} thay đổi chưa gửi</h3>
    <p class="muted" style="margin:-6px 2px 16px;font-size:14px;line-height:1.45">Điểm danh <b style="color:var(--ink)">${esc(c.name || "lớp")}</b> · ${weekdayVN(A.date)}, ${fmtDate(A.date)} chưa lên hệ thống.</p>
    <div class="pickgrid">
      <button class="pickbtn clear" onclick="closeSheet()">Để sau</button>
      <button class="pickbtn" style="grid-column:span 2;justify-content:center;color:var(--brand-2)" onclick="closeSheet();attConfirm('${id}')">${ic("upload", 18)} Gửi ngay</button>
    </div>`);
}
window.addEventListener("online", () => setTimeout(attOfferPending, 800));
try { const P = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App; if (P) { const h = P.addListener("resume", () => setTimeout(attOfferPending, 600)); if (h && h.catch) h.catch(() => {}); } } catch {}
window.attConfirm = attConfirm; window.attFailSheet = attFailSheet;

// ---------- CẦN HỎI THĂM: em vắng (Vắng Lễ / Không Phép) ở ≥2 Chúa Nhật có điểm gần nhất — từ cache cả năm ----------
const ASK_ST = ["Vắng Lễ", "Không Phép"];
function askList(id) {
  const C = CX[id] || {}, all = C.attAll, A = C.att, enr = A && A.enr;
  if (!all || !enr) return [];
  // mọi Chúa Nhật ĐÃ CÓ điểm danh (kể cả CN sau hôm nay đã điểm trước) + trạng thái đang chọn chưa gửi của ngày đang mở
  const by = Object.assign({}, all.by), sun = (d) => new Date(d + "T00:00:00").getDay() === 0;
  if (A.date && sun(A.date) && A.assign) { const cur = Object.assign({}, by[A.date] || {}); Object.keys(A.assign).forEach((k) => { if (A.assign[k]) cur[k] = A.assign[k]; }); by[A.date] = cur; }
  const days = Object.keys(by).filter(sun).sort().reverse();
  const out = [];
  enr.forEach((e) => {
    let n = 0, last = "";
    for (const d of days) { const st = (by[d] || {})[e.id]; if (!st) continue; if (!ASK_ST.includes(st)) break; n++; if (!last) last = d; }
    if (n >= 2) out.push({ e, n, last });
  });
  return out.sort((a, b) => b.n - a.n);
}
// "Đã liên hệ" nhớ theo tuần (Chúa Nhật đầu tuần) trên máy
const askKey = (id) => `bgl-asked-${(S.user && S.user.id) || "x"}-${id}`;
function askDone(id) { const a = store.get(askKey(id), null); return a && a.w === todaySunday() && Array.isArray(a.ids) ? a.ids.map(String) : []; }
function askToggle(id, eid, on) {
  const ids = new Set(askDone(id)); if (on) ids.add(String(eid)); else ids.delete(String(eid));
  store.set(askKey(id), { w: todaySunday(), ids: [...ids] });
  paintAskCard(id);
}
// thẻ thu gọn mặc định (chỉ tiêu đề) — bấm mới mở; nhóm "Đã liên hệ" cũng thu gọn
const askOpen = {};
function askOpenToggle(id, k) { const key = id + (k || ""); askOpen[key] = !askOpen[key]; haptic(); paintAskCard(id); }
let _askT = null;
const askRepaint = (id) => { clearTimeout(_askT); _askT = setTimeout(() => paintAskCard(id), 350); };
function paintAskCard(id) {
  const box = $("askCard"); if (!box) return;
  const list = askList(id); if (!list.length) { box.innerHTML = ""; return; }
  const done = askDone(id), isDone = (x) => done.includes(String(x.e.id)), todo = list.filter((x) => !isDone(x)), did = list.filter(isDone);
  const open = !!askOpen[id], openDid = !!askOpen[id + ":did"];
  const row = ({ e, n, last }, on) => {
    const p = e.person || {}, pd = (p.data && p.data.parents_info) || {}, nm = p.name || p.full_name || "";
    const ph = [["Cha", pd.father_phone || p.phone], ["Mẹ", pd.mother_phone]].filter((x) => x[1] && x[1] !== "—" && x[1] !== "-").map(([k, v]) => `<span>${k} ${phoneChip(v, nm)}</span>`).join("");
    return `<div class="ask-row${on ? " done" : ""}"><div class="grow"><div class="nm">${esc(nm)}</div>
      <div class="ask-meta">Vắng ${n} CN liên tiếp · gần nhất ${fmtDate(last).slice(0, 5)}</div>${ph ? `<div class="ask-ph">${ph}</div>` : ""}</div>
      <label class="check ask-ok" aria-label="Đã liên hệ"><input type="checkbox" ${on ? "checked" : ""} onchange="askToggle('${id}',${e.id},this.checked)"><span class="box">${ic("check", 12)}</span></label></div>`;
  };
  box.innerHTML = `<div class="card askcard${open ? " open" : ""}">
    <button class="ask-head" onclick="askOpenToggle('${id}')"><span class="grow">
      <span class="eyebrow" style="display:flex;align-items:center;gap:6px">${ic(todo.length ? "phone" : "check", 14)} ${todo.length ? `Cần hỏi thăm · ${todo.length} em` : `Đã liên hệ hết ${list.length} em`}</span>
      <span class="faint ask-sub">Vắng Lễ / Không Phép từ 2 Chúa Nhật gần nhất</span></span><span class="ask-chev">${ic("chev", 16)}</span></button>
    ${open ? `<div class="ask-body">${todo.map((x) => row(x, false)).join("")}
      ${did.length ? `<button class="ask-did" onclick="askOpenToggle('${id}',':did')">Đã liên hệ ${did.length} em ${openDid ? "▴" : "▾"}</button>${openDid ? did.map((x) => row(x, true)).join("") : ""}` : ""}</div>` : ""}
  </div>`;
}
window.askToggle = askToggle; window.askOpenToggle = askOpenToggle;
// Chuỗi hiện tại của từng em trong lớp từ cache (null nếu chưa có dữ liệu cả năm)
function streakMap(id) {
  if (!CX[id] || !CX[id].attAll) return null;
  const m = {}; (((CX[id].att || {}).enr) || []).forEach((e) => { const s = computeStreak(id, e.id); m[e.id] = s ? s.cur : 0; });
  return m;
}
function notifyConfirm(id, A, ok, fail, before, after) {
  const c = CX[id].info || {}, name = c.name || "Lớp", when = `${weekdayVN(A.date)} ${fmtDate(A.date)}`;
  const counts = {}; A.enr.forEach((e) => { const v = A.assign[e.id]; if (v) counts[v] = (counts[v] || 0) + 1; });
  const sum = STATUSES.map((st) => (counts[st.v] ? `${counts[st.v]} ${st.v}` : "")).filter(Boolean).join(" · ");
  if (fail) Notif.add({ kind: "error", title: `Điểm danh ${name}: ${fail} mục chưa lưu được`, body: `${when} · ${ok} thành công, ${fail} lỗi — kiểm tra mạng rồi bấm Xác nhận lại`, href: `#/class/${id}/diemdanh` });
  else Notif.add({ kind: "confirm", title: `Đã lưu điểm danh ${name}`, body: `${when} · ${sum || ok + " em"}`, href: `#/class/${id}/diemdanh` });
  if (!before || !after) return;
  const hit = [], lost = [];
  A.enr.forEach((e) => {
    const b = before[e.id] || 0, a = after[e.id] || 0, p = e.person || {}, nm = p.name || p.full_name || "Thiếu nhi";
    if (a > b && (a === 3 || a === 5 || a === 7 || (a >= 10 && a % 5 === 0))) hit.push({ e, nm, n: a });
    else if (b >= 3 && a < b) lost.push({ e, nm, b, a });
  });
  const names = (arr) => arr.slice(0, 4).map((x) => x.nm).join(", ") + (arr.length > 4 ? ` và ${arr.length - 4} em khác` : "");
  // 1 em -> báo riêng (bấm nhảy tới em) · nhiều em -> gộp 1 thông báo (bấm về tab Thiếu nhi)
  if (hit.length === 1) Notif.add({ kind: "streak", title: `🔥 ${hit[0].nm} đạt chuỗi ${hit[0].n} buổi`, body: `${name} · học liên tục ${hit[0].n} buổi`, href: `#/class/${id}/thieunhi/${hit[0].e.id}` });
  else if (hit.length > 1) { const ms = [...new Set(hit.map((x) => x.n))].sort((x, y) => x - y).join(" / "); Notif.add({ kind: "streak", title: `🔥 ${hit.length} em đạt chuỗi ${ms} buổi`, body: `${name} · ${names(hit)}`, href: `#/class/${id}/thieunhi` }); }
  if (lost.length === 1) Notif.add({ kind: "lost", title: `${lost[0].nm} mất chuỗi ${lost[0].b} buổi`, body: `${name} · ${fmtDate(A.date)}${lost[0].a ? ` · chuỗi mới: ${lost[0].a}` : ""} — có thể khôi phục trong ô Chuỗi học`, href: `#/class/${id}/thieunhi/${lost[0].e.id}` });
  else if (lost.length > 1) Notif.add({ kind: "lost", title: `${lost.length} em mất chuỗi`, body: `${name} · ${fmtDate(A.date)} · ${lost.map((x) => `${x.nm} (${x.b})`).slice(0, 4).join(", ")}${lost.length > 4 ? ` và ${lost.length - 4} em khác` : ""} — có thể khôi phục trong ô Chuỗi học`, href: `#/class/${id}/thieunhi` });
}

// ============================================================
//  XUẤT BẢNG ĐIỂM DANH (ảnh PNG) — lưu / gửi phụ huynh
// ============================================================
const EXPAL = { "Hiện Diện": ["#d8efe0", "#1c8a58"], "Vắng Lễ": ["#e8e2f5", "#6a54a6"], "Có Phép": ["#dcebf8", "#2c6cae"], "Báo Trễ": ["#f6ecca", "#9a7622"], "Không Phép": ["#f7e0dd", "#c04d47"], "Nghỉ Luôn": ["#e6ebe8", "#5f6f68"], "": ["#f3f7f4", "#93a099"] };
const EXTHEME = { "": ["#1c6155", "#0b3830", "#e6c877"], green: ["#15803d", "#14532d", "#e6c877"], pink: ["#be185d", "#701a3a", "#fbcfe8"], blue: ["#1e40af", "#172554", "#bfdbfe"], gold: ["#a16207", "#5a2e0a", "#fef3c7"] };
const EXEMO = { "Hiện Diện": "✅", "Báo Trễ": "🕒", "Có Phép": "📝", "Vắng Lễ": "🟣", "Không Phép": "❌", "Nghỉ Luôn": "⛔", "": "⚪" };
const slug = (t) => noAccent(t).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "lop";
function loadImg(src) { return new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = src; }); }
function exportRows(id) {
  const A = CX[id].att;
  return A.enr.map((e) => { const p = e.person || {}; return { cn: p.christian_name || "", name: p.name || p.full_name || "", st: A.assign[e.id] || "" }; });
}
async function renderAttendanceImage(id, noLogo) {
  const A = CX[id].att, c = CX[id].info || {}, yr = classYearRange(c), rows = exportRows(id);
  const FAM = '"Be Vietnam Pro", "Segoe UI", Roboto, system-ui, -apple-system, sans-serif', DISP = '"Bricolage Grotesque", "Be Vietnam Pro", system-ui, sans-serif';
  try { if (document.fonts && document.fonts.load) await Promise.race([Promise.all([document.fonts.load(`600 25px ${FAM}`), document.fonts.load(`400 22px ${FAM}`), document.fonts.load(`800 44px ${DISP}`)]), new Promise((r) => setTimeout(r, 1500))]); } catch {}
  const logo = noLogo ? null : await loadImg("assets/logo.png").catch(() => null);
  const W = 1080, PAD = 48, K = rows.length > 40 ? 1 : 1.5, IW = W - PAD * 2;   // lớp rất đông -> giảm độ phân giải để nhẹ máy
  const counts = {}; rows.forEach((r) => (counts[r.st] = (counts[r.st] || 0) + 1));
  const pills = [{ t: `Sĩ số ${rows.length}`, bg: "#132420", fg: "#ffffff" }].concat(STATUSES.filter((st) => counts[st.v]).map((st) => ({ t: `${counts[st.v]} ${st.v}`, bg: EXPAL[st.v][0], fg: EXPAL[st.v][1] })));
  if (counts[""]) pills.push({ t: `${counts[""]} Chưa điểm`, bg: EXPAL[""][0], fg: EXPAL[""][1] });
  // đo pill để xếp dòng
  const mc = document.createElement("canvas").getContext("2d"); mc.font = `600 22px ${FAM}`;
  let px = PAD, lines = 1; pills.forEach((pl) => { pl.w = Math.ceil(mc.measureText(pl.t).width) + 36; if (px + pl.w > W - PAD) { px = PAD; lines++; } pl.x = px; pl.line = lines; px += pl.w + 10; });
  const HEAD = 236, SUMH = lines * 54, TH = 54, RH = 62, FOOT = 92;
  const H = HEAD + 24 + SUMH + 12 + TH + rows.length * RH + 28 + FOOT;
  const cv = document.createElement("canvas"); cv.width = Math.round(W * K); cv.height = Math.round(H * K);
  const x = cv.getContext("2d"); x.scale(K, K); x.textBaseline = "middle";
  const rr = (X, Y, w, h, r) => { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); };
  const ell = (t, max) => { if (x.measureText(t).width <= max) return t; let z = t; while (z.length > 1 && x.measureText(z + "…").width > max) z = z.slice(0, -1); return z + "…"; };
  const ls = (v) => { try { if ("letterSpacing" in x) x.letterSpacing = v; } catch {} };
  // nền trắng
  x.fillStyle = "#ffffff"; x.fillRect(0, 0, W, H);
  // dải đầu: xanh rêu + quầng vàng
  const TH3 = EXTHEME[classThemeKey(c) || currentClassTheme()] || EXTHEME[""];
  const g = x.createLinearGradient(0, 0, W, HEAD); g.addColorStop(0, TH3[0]); g.addColorStop(1, TH3[1]); x.fillStyle = g; x.fillRect(0, 0, W, HEAD);
  const rg = x.createRadialGradient(W - 110, 10, 10, W - 110, 10, 300); rg.addColorStop(0, "rgba(255,255,255,.22)"); rg.addColorStop(1, "rgba(255,255,255,0)"); x.fillStyle = rg; x.fillRect(0, 0, W, HEAD);
  // logo trong vòng tròn trắng
  const LS = 132, LX = PAD, LY = (HEAD - LS) / 2;
  x.fillStyle = "#ffffff"; x.beginPath(); x.arc(LX + LS / 2, LY + LS / 2, LS / 2, 0, Math.PI * 2); x.fill();
  if (logo) { const box = LS - 26, k = Math.min(box / logo.width, box / logo.height), dw = logo.width * k, dh = logo.height * k; x.drawImage(logo, LX + (LS - dw) / 2, LY + (LS - dh) / 2, dw, dh); }
  // chữ đầu
  const TX = LX + LS + 28, TW = W - PAD - TX;
  x.textAlign = "left"; x.fillStyle = TH3[2]; x.font = `700 15px ${FAM}`; ls("3px"); x.fillText("BẢNG ĐIỂM DANH", TX, 66); ls("0px");
  x.fillStyle = "#ffffff"; x.font = `800 46px ${DISP}`; x.fillText(ell(c.name || "Lớp", TW), TX, 112);
  x.fillStyle = "rgba(255,255,255,.86)"; x.font = `500 24px ${FAM}`; x.fillText(ell(`${weekdayVN(A.date)}, ${fmtDate(A.date)} · Niên khóa ${c.long_year || (yr && yr.long) || ""}`, TW), TX, 158);
  x.fillStyle = "rgba(255,255,255,.7)"; x.font = `400 21px ${FAM}`; x.fillText(ell([c.location, `Sĩ số ${rows.length} thiếu nhi`].filter(Boolean).join("  ·  "), TW), TX, 194);
  // tóm tắt (pill)
  let y = HEAD + 24;
  x.font = `600 22px ${FAM}`; x.textAlign = "left";
  pills.forEach((pl) => { const py = y + (pl.line - 1) * 54; x.fillStyle = pl.bg; rr(pl.x, py, pl.w, 44, 22); x.fill(); x.fillStyle = pl.fg; x.fillText(pl.t, pl.x + 18, py + 23); });
  y += SUMH + 12;
  // bảng
  const cols = [
    { k: "stt", t: "STT", x: PAD, w: 56, al: "center" },
    { k: "cn", t: "TÊN THÁNH", x: PAD + 68, w: 206, al: "left" },
    { k: "name", t: "HỌ VÀ TÊN", x: PAD + 286, w: 344, al: "left" },
    { k: "date", t: "NGÀY", x: PAD + 642, w: 130, al: "center" },
    { k: "st", t: "TRẠNG THÁI", x: PAD + 784, w: 200, al: "center" },
  ];
  x.fillStyle = "#f3f7f4"; rr(PAD, y, IW, TH, 12); x.fill();
  x.fillStyle = "#5f6f68"; x.font = `700 13px ${FAM}`; ls("1.5px");
  cols.forEach((cl) => { x.textAlign = cl.al; x.fillText(cl.t, cl.al === "center" ? cl.x + cl.w / 2 : cl.x + 12, y + TH / 2); });
  ls("0px"); y += TH;
  const dateTxt = fmtDate(A.date);
  rows.forEach((r, i) => {
    if (i % 2) { x.fillStyle = "#fafcfb"; x.fillRect(PAD, y, IW, RH); }
    x.fillStyle = "#e9eeeb"; x.fillRect(PAD, y + RH - 1, IW, 1);
    const cy = y + RH / 2;
    x.textAlign = "center"; x.fillStyle = "#93a099"; x.font = `500 21px ${FAM}`; x.fillText(String(i + 1), cols[0].x + cols[0].w / 2, cy);
    x.textAlign = "left"; x.fillStyle = "#3b4a45"; x.font = `500 22px ${FAM}`; x.fillText(ell(r.cn || "—", cols[1].w - 20), cols[1].x + 12, cy);
    x.fillStyle = "#132420"; x.font = `600 25px ${FAM}`; if (x.measureText(r.name).width > cols[2].w - 20) x.font = `600 21px ${FAM}`; x.fillText(ell(r.name, cols[2].w - 20), cols[2].x + 12, cy);
    x.textAlign = "center"; x.fillStyle = "#5f6f68"; x.font = `400 21px ${FAM}`; x.fillText(dateTxt, cols[3].x + cols[3].w / 2, cy);
    const [bg, fg] = EXPAL[r.st] || EXPAL[""], lab = r.st || "Chưa điểm";
    x.font = `700 20px ${FAM}`; const pw = Math.min(cols[4].w - 8, Math.ceil(x.measureText(lab).width) + 44), pxx = cols[4].x + (cols[4].w - pw) / 2;
    x.fillStyle = bg; rr(pxx, cy - 19, pw, 38, 19); x.fill();
    x.fillStyle = fg; x.beginPath(); x.arc(pxx + 17, cy, 4.5, 0, Math.PI * 2); x.fill();
    x.textAlign = "left"; x.fillText(ell(lab, pw - 40), pxx + 28, cy + 1);
    y += RH;
  });
  // chân trang
  y += 28; x.fillStyle = "#e2e8e4"; x.fillRect(PAD, y, IW, 1);
  const now = new Date(), hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  x.textAlign = "left"; x.fillStyle = "#5f6f68"; x.font = `400 18px ${FAM}`; x.fillText(ell("Hiện Diện / Báo Trễ: có mặt · Có Phép: nghỉ có xin phép · Không Phép: nghỉ không phép · Vắng Lễ: vắng Thánh lễ", IW), PAD, y + 38);
  x.textAlign = "right"; x.fillStyle = "#93a099"; x.font = `400 17px ${FAM}`; x.fillText(`Điểm Danh · Ban Giáo Lý · xuất ${hm} ${fmtDate(toISO(now))}`, W - PAD, y + 70);
  let url;
  try { url = cv.toDataURL("image/png"); }
  catch (e) { if (!noLogo) return renderAttendanceImage(id, true); throw e; }   // canvas bị "taint" (mở từ file://) -> vẽ lại không logo
  if (!url || !url.startsWith("data:image/png;base64,") || url.length < 2000) throw new Error("Máy không đủ bộ nhớ để tạo ảnh — thử lại hoặc lọc bớt danh sách");
  return url;
}
async function exportSheet(id) {
  const A = CX[id].att; if (!A || !A.enr || !A.enr.length) return toast("Chưa có danh sách để xuất");
  openSheet(`<h3>Xuất bảng điểm danh</h3><div id="exBody"><div class="spin" style="margin:34px auto 10px"></div><p class="muted" style="text-align:center;margin:0 0 20px;font-size:13.5px">Đang tạo ảnh…</p></div>`);
  let url;
  try { url = await renderAttendanceImage(id); }
  catch (e) { const b = $("exBody"); if (b) b.innerHTML = `<div class="empty" style="padding:26px"><div class="big">${ic("warn",44)}</div><div>Không tạo được ảnh: ${esc(e.message || e)}</div></div>`; return; }
  CX[id]._exportUrl = url;
  const b = $("exBody"); if (!b) return;
  const pending = changeCount(A);
  b.innerHTML = `<div class="ex-prev"><img src="${url}" alt="Bảng điểm danh"/></div>
    ${pending ? `<div class="authmsg err" style="margin:12px 2px 0">${ic("bug", 16)} Còn ${pending} thay đổi chưa Xác nhận — ảnh dùng trạng thái đang hiển thị.</div>` : ""}
    <div class="row" style="gap:10px;margin-top:14px">
      <button class="btn gold" style="flex:1" onclick="saveExportImage('${id}',this)">${ic("download", 18)} Lưu vào máy</button>
      <button class="btn" style="flex:1" onclick="shareExport('${id}')">${ic("share", 18)} Gửi phụ huynh</button>
    </div>
    <button class="btn ghost" style="margin-top:10px" onclick="copyExportText('${id}')">${ic("copy", 17)} Sao chép dạng văn bản (Zalo)</button>`;
}
let _sharing = false;
async function shareExport(id) {
  const url = CX[id]._exportUrl; if (!url) return toast("Chưa có ảnh, thử lại");
  if (_sharing) return;
  const c = CX[id].info || {}, A = CX[id].att;
  const fname = `diem-danh-${slug(c.name || "")}-${A.date}.png`, title = `Điểm danh ${c.name || ""} · ${fmtDate(A.date)}`;
  const FS = window.Capacitor?.Plugins?.Filesystem, Sh = window.Capacitor?.Plugins?.Share, native = !!(FS && Sh);
  _sharing = true;
  try {
    if (native) {
      const w = await FS.writeFile({ path: fname, data: url.split(",")[1], directory: "CACHE" });
      await Sh.share({ title, text: title, files: [w.uri], dialogTitle: "Lưu ảnh / gửi phụ huynh" });
    } else if (navigator.share) {
      const blob = await (await fetch(url)).blob(), file = new File([blob], fname, { type: "image/png" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) await navigator.share({ title, files: [file] }); else throw new Error("no-files");
    } else throw new Error("no-share");
  } catch (e) {
    const msg = (e && (e.message || e.name)) || "";
    if (/cancel|abort|in progress/i.test(msg)) return;
    if (native) toast("Không chia sẻ được: " + (msg || "lỗi không rõ"), 3000);   // trên app: KHÔNG giả vờ tải về
    else { try { const a = document.createElement("a"); a.href = url; a.download = fname; document.body.appendChild(a); a.click(); a.remove(); toast("Đã tải ảnh về máy"); } catch { toast("Không chia sẻ được: " + msg); } }
  } finally { _sharing = false; }
}
function copyExportText(id) {
  const A = CX[id].att, c = CX[id].info || {}, yr = classYearRange(c), rows = exportRows(id);
  const counts = {}; rows.forEach((r) => (counts[r.st] = (counts[r.st] || 0) + 1));
  const sum = STATUSES.map((st) => (counts[st.v] ? `${EXEMO[st.v]} ${counts[st.v]} ${st.v}` : "")).filter(Boolean).join(" · ");
  const lines = [`📋 ĐIỂM DANH — ${c.name || ""}`, `${weekdayVN(A.date)}, ${fmtDate(A.date)} · Niên khóa ${c.long_year || (yr && yr.long) || ""}`, `Sĩ số ${rows.length}${sum ? " · " + sum : ""}`, "————————"];
  rows.forEach((r, i) => lines.push(`${i + 1}. ${EXEMO[r.st] || "⚪"} ${[r.cn, r.name].filter(Boolean).join(" ")} — ${r.st || "Chưa điểm"}`));
  copyText(lines.join("\n"));
}
async function saveExportImage(id, btn) {
  const url = CX[id]._exportUrl; if (!url) return toast("Chưa có ảnh, thử lại");
  if (btn) btn.classList.add("busy");
  try { const c = CX[id].info || {}, A = CX[id].att; await saveDataUrl(url, `diem-danh-${slug(c.name || "")}-${A.date}.png`, "image/png"); }
  catch (e) { toast("Không lưu được: " + (e.message || e), 3000); } finally { if (btn) btn.classList.remove("busy"); }
}
window.exportSheet = exportSheet; window.shareExport = shareExport; window.copyExportText = copyExportText; window.saveExportImage = saveExportImage;


// ============================================================
//  SEARCH
// ============================================================
async function searchScreen(q) {
  screen(appbar({ title: "Tìm kiếm", back: true }) + `<main><div class="wrap">
    <label class="searchbar">${ic("search", 18)}<input id="sq" enterkeyhint="search" placeholder="Tên thiếu nhi / giáo lý viên…" value="${esc(q || "")}"/></label>
    <div id="sres">${q ? '<div class="spin"></div>' : emptyBox(ic("search",44), "Nhập tên để tìm")}</div>
  </div></main>`, "home");
  const inp = $("sq"); inp.focus();
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && inp.value.trim()) go("#/search/" + encodeURIComponent(inp.value.trim())); });
  if (!q) return;
  if (q.trim().length < 2) { $("sres").innerHTML = emptyBox(ic("search", 44), "Nhập ít nhất 2 ký tự để tìm"); return; }
  const t = NAV;
  try {
    const res = await BGL.search(q, S.year && S.year.year);
    if (stale(t)) return;
    // máy chủ mới: {students, teachers, orphans} (mỗi người kèm enrollment / teaching_assignment) · bản cũ: mảng người
    const arr = (v) => (Array.isArray(v) ? v : []);
    const groups = res && !Array.isArray(res) && (res.students || res.teachers || res.orphans)
      ? [["Thiếu nhi", arr(res.students), "enrollment"], ["Giáo lý viên", arr(res.teachers), "teaching_assignment"], ["Không có lớp", arr(res.orphans), ""]]
      : [["", arr((res && (res.people || res.persons)) || (Array.isArray(res) ? res : res && res.data)), ""]];
    const card = (p, rel) => {
      rememberPerson(p);
      const r = (rel && p[rel]) || {}, c = r.classroom || {}, tag = r.result || r.position || "";
      const pi = (p.data && p.data.parents_info) || {}, phone = rel === "enrollment" ? pi.father_phone || pi.mother_phone || p.phone : p.phone;
      return `<div class="card pad press" onclick="go('#/person/${p.id}')"><div class="row">${avatar(p, { tappable: true })}
        <div class="grow"><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}${tag ? ` · ${esc(tag)}` : ""}</div>
          <div class="nm" style="font-weight:700;font-size:${nmFs(p.name || p.full_name, 15)}px">${esc(p.name || p.full_name)}</div>
          <div class="muted" style="font-size:12.5px">${c.name ? `${esc(c.name)} · ` : ""}${phoneChip(phone, p.name || p.full_name)}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div></div>`;
    };
    const html = groups.filter((g) => g[1].length).map(([label, list, rel]) =>
      (label ? `<div class="sec-eyebrow"><span class="eyebrow">${label} · ${list.length}</span></div>` : "") + `<div class="stack">${list.map((p) => card(p, rel)).join("")}</div>`).join("");
    $("sres").innerHTML = html || emptyBox(ic("frown", 44), `Không thấy "${q}"`);
  } catch (e) { if (!stale(t) && $("sres")) $("sres").innerHTML = errBox(e.message); }
}

// ============================================================
//  HỌC SINH — màn nằm ở js/students.js (nạp sau app.js). File đó lỗi / chưa nạp được -> báo nhẹ, app vẫn chạy.
// ============================================================
function studentsRoute() {
  const t = NAV, title = "Học sinh";
  const fail = (e) => { try { console.error(e); } catch {} if (!stale(t)) screen(appbar({ title, bell: true }) + `<main>${errBox((e && e.message) || "Không mở được mục Học sinh")}</main>`, "students"); };
  // trang còn đang nạp (students.js chưa chạy tới) -> chờ nạp xong rồi mở
  if (typeof window.studentsScreen !== "function" && document.readyState === "loading") { skeleton("students"); document.addEventListener("DOMContentLoaded", () => { if (!stale(t)) studentsRoute(); }, { once: true }); return; }
  if (typeof window.studentsScreen !== "function") return screen(appbar({ title, bell: true }) + `<main>${emptyBox(ic("kids", 44), "Chưa mở được mục Học sinh", "Khởi động lại ứng dụng hoặc cập nhật lên bản mới nhất.")}</main>`, "students");
  try { return Promise.resolve(window.studentsScreen()).catch(fail); } catch (e) { fail(e); }
}

// ============================================================
//  ROUTER
// ============================================================
function render() {
  NAV++;   // màn nào còn đang tải của lần điều hướng trước sẽ tự bỏ kết quả
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [r, a, b, c] = parts;
  TabLoad.focus(S.user ? r || "home" : null);   // đang đứng ở tab nào: tab khác đang tải nền -> hiện badge %
  if (!r || r === "search" || TABS.some((x) => x[3] === r)) PERSON_NAV = null;   // về màn gốc của tab -> quên tab của hồ sơ đã mở
  if (!S.user) return loginScreen();
  if (!r || r === "home") return homeScreen();
  if (r === "classes") return classesScreen();
  if (r === "class") return classScreen(a, b, c);
  if (r === "students") return studentsRoute();
  if (r === "teachers") return teachersScreen();
  if (r === "person") return personScreen(a, b);
  if (r === "me") return meScreen();
  if (r === "search") return searchScreen(a);
  return homeScreen();
}
window.addEventListener("hashchange", render);

// ============================================================
//  BOOT
// ============================================================
async function boot() {
  try { S.year = await BGL.currentYear(); } catch { S.year = null; }
  let assignOk = false;
  try {
    const t = await BGL.teachingByPerson((S.user || {}).person_id);
    t.forEach((x) => { rememberPerson(x.person); ((x.classroom || {}).teaching_assignments_overview || []).forEach((o) => rememberPerson(o.person)); });
    const cur = S.year ? Number(S.year.year) : classYearRange(null).year;
    S.myAssignments = t.filter((x) => x.classroom && Number(x.classroom.year) === cur);
    S.myClassId = S.myAssignments[0] && S.myAssignments[0].classroom && S.myAssignments[0].classroom.id;
    assignOk = true;
  } catch { S.myAssignments = []; S.myClassId = null; }
  // màu lớp: chỉ ghi nhớ khi tải phân công thành công (lỗi mạng tạm thời không làm mất màu đã lưu)
  if (assignOk) applyClassTheme(classThemeKey(S.myAssignments[0] && S.myAssignments[0].classroom), true);
  else applyClassTheme(store.get("bgl-class-theme", ""), false);
  startPolling();
}
// Sau đăng nhập vào thẳng lớp mình dạy (nếu có)
// Chúa Nhật -> vào thẳng tab Điểm danh của lớp mình
const landingHash = () => "#/home";   // mở app luôn vào Trang chủ (lớp mình + nút Điểm danh nhanh ở đó)

// ---------- Auto đồng bộ với web (~8s) — merge an toàn, không ghi đè ----------
let _poll = null;
// 8s khi đang mở tab Điểm danh · 30s ở tab khác · app ở nền -> dừng · máy báo mất mạng -> bỏ lượt
// lỗi liên tiếp -> giãn 16 → 32 → 60s · 401 (hết phiên) -> dừng hẳn tới khi đăng nhập lại
let _pollOn = false, _pollBusy = false, _pollFails = 0, _appBg = false;
function pollDelay() {
  const p = location.hash.replace(/^#\/?/, "").split("/"), base = p[0] === "class" && p[2] === "diemdanh" ? 8000 : 30000;
  return _pollFails ? Math.max(base, Math.min(60000, 8000 * 2 ** _pollFails)) : base;
}
function pollNext(ms) { clearTimeout(_poll); _poll = null; if (_pollOn && !_appBg && !_pollBusy) _poll = setTimeout(pollRun, ms == null ? pollDelay() : ms); }
async function pollRun() {
  _poll = null; if (!_pollOn || _appBg) return;
  _pollBusy = true; try { await pollTick(); } finally { _pollBusy = false; }
  pollNext();
}
function startPolling() { if (_pollOn) return; _pollOn = true; _pollFails = 0; pollNext(); }
function stopPolling() { _pollOn = false; clearTimeout(_poll); _poll = null; }
// quay lại app -> đồng bộ ngay (đã dừng vì 401 mà không có bảng đăng nhập lại -> chạy lại) + kiểm tra cập nhật ngầm
function pollBg(bg) {
  if (_appBg === !!bg) return; _appBg = !!bg;
  if (_appBg) { clearTimeout(_poll); _poll = null; return; }
  if (!_pollOn && S.user && !$("relogin")) startPolling();
  pollNext(1200); updAuto();
}
document.addEventListener("visibilitychange", () => pollBg(document.hidden));
window.addEventListener("hashchange", () => { if (_pollOn) pollNext(); });   // vào / rời tab Điểm danh -> đổi nhịp ngay
window.addEventListener("online", () => { netDot(); pollNext(800); updAuto(); });
window.addEventListener("offline", () => netDot());
// Chấm "Mất kết nối" trên thanh tiêu đề: >= 2 request lỗi mạng liên tiếp (api.js phát "bgl-net") hoặc máy báo offline; có phản hồi là tắt
let _netFails = 0, _netShown = false, _netT = null;
// viên kính nhỏ trượt xuống ~4 giây rồi tự ẩn; chỉ báo lại sau khi đã có mạng trở lại (không dính cứng trên màn hình)
function netDot() {
  const on = _netFails >= 2 || navigator.onLine === false; let el = $("netDot");
  if (!on) { _netShown = false; clearTimeout(_netT); if (el) { el.classList.remove("on"); setTimeout(() => { const e = $("netDot"); if (e && !e.classList.contains("on")) e.remove(); }, 400); } return; }
  if (_netShown) return;
  _netShown = true;
  if (!el) { document.body.insertAdjacentHTML("beforeend", `<div id="netDot" class="net-pill" role="status"><span class="dot"></span>Mất kết nối · đang thử lại</div>`); el = $("netDot"); }
  (typeof requestAnimationFrame === "function" ? requestAnimationFrame : (f) => setTimeout(f, 16))(() => { if (el) el.classList.add("on"); });
  clearTimeout(_netT); _netT = setTimeout(() => { const e = $("netDot"); if (e) e.classList.remove("on"); }, 4000);
}
window.addEventListener("bgl-net", (e) => { _netFails = e && e.detail && e.detail.ok ? 0 : _netFails + 1; netDot(); });
// Giữ các ô người dùng đang sửa (dirty), phần còn lại đồng bộ theo web
function mergeFromServer(A, freshEx) {
  Object.keys(A.assign).forEach((k) => { if (!A.dirty.has(k)) delete A.assign[k]; });
  Object.keys(freshEx).forEach((k) => { if (!A.dirty.has(k)) A.assign[k] = freshEx[k].status; });
  A.existing = freshEx;
}
async function pollTick() {
  try {
    if (!S.user || document.hidden || navigator.onLine === false) return;
    if ($("sheet") || $("fs")) return;               // đang thao tác -> bỏ qua
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] !== "class" || !CX[parts[1]]) return;
    const id = parts[1], tab = parts[2] || "thieunhi", t = NAV;
    if (tab === "thieunhi") {
      const fresh = await BGL.classroomEnrollments(id); _pollFails = 0;
      if (stale(t)) return;                                  // người dùng đã sang màn khác trong lúc tải
      if (JSON.stringify(fresh) !== JSON.stringify(CX[id].enr)) { CX[id].enr = fresh; if ($("tabBody")) tabStudents(id); loadClassAttendance(id, true).then(() => paintStreaks(id)); }
    } else if (tab === "diemdanh") {
      const A = CX[id].att; if (!A || !A.loaded || A.saving) return;      // đang gửi -> không đồng bộ chen ngang
      const recs = await BGL.attendancesByClass(id, A.date); _pollFails = 0;
      if (A.saving || stale(t)) return;
      const freshEx = {}; recs.forEach((r) => { freshEx[r.attendable_id] = { id: r.id, status: r.status }; });
      const same = Object.keys(freshEx).length === Object.keys(A.existing).length && Object.keys(freshEx).every((k) => A.existing[k] && A.existing[k].status === freshEx[k].status && A.existing[k].id === freshEx[k].id);
      if (same) return;                                                     // không đổi
      // Xung đột thật = em mình đang sửa (dirty) mà web vừa đổi sang giá trị KHÁC cái mình chọn
      const conflicts = [];
      A.dirty.forEach((k) => {
        const sv = freshEx[k] ? freshEx[k].status : "", mine = A.assign[k] || "", old = A.existing[k] ? A.existing[k].status : "";
        if (sv === mine) A.dirty.delete(k);                                  // web đã có đúng giá trị mình chọn -> hết chờ gửi
        else if (sv !== old) conflicts.push(k);
      });
      let changed = 0; Object.keys(Object.assign({}, freshEx, A.existing)).forEach((k) => { const a = freshEx[k] && freshEx[k].status, b = A.existing[k] && A.existing[k].status; if (a !== b && !A.dirty.has(k)) changed++; });
      mergeFromServer(A, freshEx);                                          // luôn merge để Xác nhận không ghi đè web
      if ($("attArea")) renderColumn(id);
      if (!conflicts.length) { if (changed) toast(`Đã đồng bộ ${changed} thay đổi từ web`, 1800); return; }   // êm, không hỏi
      if (!(A.syncSnooze && Date.now() < A.syncSnooze)) syncPrompt(id, conflicts);
    }
  } catch (e) {
    if (e && e.status === 401) stopPolling();                 // hết phiên: dừng, đăng nhập lại sẽ chạy lại
    else if (e && typeof e.status === "number") _pollFails = Math.min(_pollFails + 1, 3);   // lỗi mạng / máy chủ -> giãn nhịp
  }
}
function syncPrompt(id, conflicts) {
  const A = CX[id].att, names = (conflicts || []).map((k) => { const e = (A.enr || []).find((x) => String(x.id) === String(k)); const p = (e && e.person) || {}; return p.name || p.full_name || ""; }).filter(Boolean);
  const list = names.slice(0, 3).join(", ") + (names.length > 3 ? ` và ${names.length - 3} em khác` : "");
  openSheet(`<h3>Web vừa sửa em bạn đang điểm</h3>
    <p class="muted" style="margin:-6px 2px 16px;font-size:14px;line-height:1.5">Trên web vừa đổi trạng thái của <b style="color:var(--ink)">${esc(list || "một số em")}</b> khác với lựa chọn của bạn. Các em khác đã được đồng bộ. <b style="color:var(--ink)">Tải lại</b> để lấy theo web, hoặc <b style="color:var(--ink)">Để sau</b> để giữ lựa chọn của bạn rồi Xác nhận.</p>
    <div class="pickgrid">
      <button class="pickbtn clear" onclick="syncLater('${id}')">Để sau</button>
      <button class="pickbtn" style="grid-column:span 2;justify-content:center;color:var(--brand-2)" onclick="syncReload('${id}')">${ic("check", 18)} Tải lại ngay</button>
    </div>`);
}
function syncReload(id) { const A = CX[id].att; A.assign = {}; Object.keys(A.existing).forEach((k) => (A.assign[k] = A.existing[k].status)); A.dirty.clear(); A.syncSnooze = 0; attDraftSave(id); closeSheet(); if ($("attArea")) renderColumn(id); toast("Đã tải lại dữ liệu mới nhất"); }
function syncLater(id) { const A = CX[id].att; A.syncSnooze = Date.now() + 120000; closeSheet(); if ($("attArea")) renderColumn(id); }
window.syncReload = syncReload; window.syncLater = syncLater;

// ---------- Phiên đăng nhập hết hạn giữa chừng ----------
// api.js: refresh token hỏng -> BGL.onAuthLost: đăng nhập lại NGẦM bằng tài khoản đã lưu (chỉ khi đang trong phiên,
// không tự đăng nhập lúc mở app / sau khi bấm Đăng xuất) -> vẫn hỏng thì phát "bgl-session-expired" -> bảng đăng nhập lại
BGL.onAuthLost = async () => {
  if (!S.user) return false;
  const c = await loadCred(); if (!c || !c.u || !c.p) return false;
  let user; try { user = await BGL.login(c.u, c.p); } catch (e) { if (e && e.status === 0) throw e; return false; }   // mất mạng -> ném lại (chưa chắc hết phiên)
  if (user && user.id != null && S.user && S.user.id != null && String(user.id) !== String(S.user.id)) { try { await BGL.logout(); } catch {} return false; }   // tài khoản đã lưu là người khác
  return true;
};
// Bảng đăng nhập lại: GIỮ nguyên mọi thứ đang có trong bộ nhớ (điểm danh chưa Xác nhận, tab đã tải…)
window.addEventListener("bgl-session-expired", () => { if (!S.user) return; stopPolling(); reloginSheet(); });
function reloginSheet() {
  if ($("relogin")) return;
  const cred = store.get("bgl-cred", null);
  LOGIN_SAVED_U = (cred && cred.u) || (S.user && S.user.username) || LOGIN_SAVED_U || "";
  openSheet(`<div id="relogin"><h3>Phiên đăng nhập đã hết hạn</h3>
    <p class="muted" style="margin:-6px 2px 14px;font-size:13.5px;line-height:1.5">Đăng nhập lại để tiếp tục. Những gì đang làm dở (điểm danh chưa Xác nhận…) vẫn được giữ nguyên.</p>
    <div class="field" style="margin-bottom:14px"><label>Số điện thoại</label>
      <input id="ru" class="input num" inputmode="tel" autocomplete="username" placeholder="0867007***" value="${esc(maskPhone(LOGIN_SAVED_U))}"/></div>
    <div class="field"><label>Mật khẩu</label>
      <input id="rp" class="input" type="password" autocomplete="current-password" placeholder="••••••"/></div>
    <div id="rmsg"></div>
    <button class="btn" id="rBtn" style="margin-top:16px" onclick="reloginGo()">Đăng nhập lại</button>
    <button class="btn ghost" style="margin-top:10px" onclick="doLogout()">Đăng xuất</button></div>`);
  const u = $("ru"), p = $("rp");
  if (u) u.addEventListener("focus", (e) => { if (LOGIN_SAVED_U && e.target.value === maskPhone(LOGIN_SAVED_U)) setTimeout(() => e.target.select(), 0); });
  if (p) p.addEventListener("keydown", (e) => { if (e.key === "Enter") reloginGo(); });
}
async function reloginGo() {
  const b = $("rBtn"), err = (m) => { const a = $("rmsg"); if (a) { a.className = "authmsg err"; a.style.marginTop = "12px"; a.textContent = m; } };
  let u = (($("ru") || {}).value || "").trim(); const p = ($("rp") || {}).value || "";
  if (LOGIN_SAVED_U && u === maskPhone(LOGIN_SAVED_U)) u = LOGIN_SAVED_U;   // ô đang hiện bản che -> dùng SĐT thật
  if (!u || !p) return err("Nhập đủ số điện thoại và mật khẩu.");
  if (!b || b.disabled) return; b.disabled = true; b.innerHTML = `<span class="btnspin"></span> Đang đăng nhập…`;
  try {
    const user = await BGL.login(u, p);
    if (store.get("bgl-cred", null)) await saveCred(u, p);   // đã chọn lưu tài khoản -> cập nhật mật khẩu mới
    closeSheet();
    if (user && user.id != null && S.user && String(user.id) !== String(S.user.id)) {   // đăng nhập tài khoản KHÁC -> bỏ dữ liệu của tài khoản cũ
      resetAccountData(); S.user = user; await boot();
      const want = landingHash(); if (location.hash !== want) go(want); else render();
      return;
    }
    toast("Đã đăng nhập lại ✓"); startPolling();
  } catch (e) {
    if (b.isConnected) { b.disabled = false; b.textContent = "Đăng nhập lại"; }
    err(e && e.status === 0 ? (e.message || "Không kết nối được máy chủ") : trErr(e && e.message));
  }
}
window.reloginGo = reloginGo;
async function init() {
  loading("home");
  try {
    S.user = await BGL.me(); await boot();
    // đổi hash -> sự kiện hashchange tự render; gọi render() thêm sẽ tải mọi thứ 2 lần
    const want = landingHash();
    if ((!location.hash || location.hash === "#/" || location.hash === "#/home") && location.hash !== want) location.hash = want; else render();
  }
  catch { loginScreen(); }
  if (window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      if ($("sheet")) return closeSheet();          // ưu tiên đóng sheet đang mở (kể cả khi đang quẹt)
      if ($("updBlock")) return window.Capacitor.Plugins.App.exitApp();   // màn bắt buộc cập nhật: Back = thoát app
      if ($("fs")) { const h = $("fsHost"); if (h) h.innerHTML = ""; if (S._swipeId) renderColumn(S._swipeId); S._swipeId = null; return; }
      if (location.hash && !["#/home", "#/", ""].includes(location.hash)) history.back();
      else window.Capacitor.Plugins.App.exitApp();
    });
    // app ở nền -> dừng đồng bộ; quay lại -> chạy ngay + tự kiểm tra cập nhật (tối đa 1 lần / 24 giờ)
    try { const h = window.Capacitor.Plugins.App.addListener("appStateChange", (s) => pollBg(!(s && s.isActive))); if (h && h.catch) h.catch(() => {}); } catch {}
    // quay lại app (vd. bấm Huỷ ở trình cài đặt) -> nhắc cài bản cập nhật đã tải
    if (_upd()) try { const A = window.Capacitor.Plugins.App; [A.addListener("resume", () => updOnResume()), A.addListener("appStateChange", (s) => { if (s && s.isActive) updOnResume(); })].forEach((h) => { if (h && h.catch) h.catch(() => {}); }); } catch {}
  }
  netDot();
  setTimeout(() => { updStartup().catch(() => {}).then(() => updAuto()); }, 1200);   // báo đã cập nhật · dọn APK cũ · kiểm tra bản mới ngầm (không chặn app)
}
init();

