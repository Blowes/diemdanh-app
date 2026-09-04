// ============================================================
//  Điểm Danh (Ban Giáo Lý) — app native (Android + iOS)
//  UX app-first: bottom nav, dashboard, điểm danh QUẸT (Tinder) + CỘT,
//  xuất bảng điểm danh (ảnh), chuỗi học, thông báo trong app
// ============================================================
const root = document.getElementById("root");
const $ = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu ("tu" khớp "Tú")
const noAccent = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } } };
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
function photoOf(pid) { try { return localStorage.getItem(photoKey(pid)) || ""; } catch { return ""; } }
const AV_NAMES = {};
function avatar(p, o = {}) {
  const id = p && p.id, ph = id ? photoOf(id) : "";
  if (id) AV_NAMES[id] = p.name || p.full_name || ("Học sinh #" + id);
  const size = o.size || 46, r = o.r || 14, fs = o.fs || 16;
  const tap = o.tappable && id ? `onclick="event.stopPropagation();pickPhoto(${id})"` : "";
  const hue = id ? hueOf(p.name || p.full_name || String(id)) : "#888";
  const bg = ph ? `background-image:url('${ph}');background-size:cover;background-position:center;color:transparent;border-color:transparent` : `background:linear-gradient(150deg,${hue}2e,${hue}14);color:${hue};border-color:${hue}3a`;
  const b = Math.round(size * 0.4);
  const badge = (o.tappable && !ph) ? `<span style="position:absolute;right:-2px;bottom:-2px;background:var(--brand);color:#fff;width:${b}px;height:${b}px;border-radius:50%;display:grid;place-items:center;border:2px solid var(--surface)">${ic("cam", Math.round(b * 0.6))}</span>` : "";
  return `<div class="ava ${o.cls || ""}" style="width:${size}px;height:${size}px;border-radius:${r}px;font-size:${fs}px;position:relative;overflow:visible;${bg}" ${tap}><span style="position:absolute;inset:0;display:grid;place-items:center;border-radius:inherit;overflow:hidden;${bg}">${ph ? "" : esc(initials(p.name || p.full_name))}</span>${badge}</div>`;
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
const CLASS_THEME_NAMES = { pink: "Khai Tâm", green: "Rước Lễ", blue: "Thêm Sức", gold: "Bao Đồng" };
function classThemeKey(c) {
  const t = noAccent((c && (c.family || c.name)) || "");
  if (t.includes("khai tam") || t.includes("chien con")) return "pink";
  if (t.includes("ruoc le")) return "green";
  if (t.includes("them suc")) return "blue";
  if (t.includes("bao dong")) return "gold";
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

// ---------- hiệu ứng động (mặc định BẬT) ----------
function effectsOn() { try { return localStorage.getItem("bgl-effects") !== "0"; } catch { return true; } }
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
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M6 3v16"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0"/><path d="M16 5.5a3 3 0 0 1 0 5.8"/><path d="M17.5 14.5A5.5 5.5 0 0 1 21 20"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
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
};
const ic = (n, w = 24) => `<svg width="${w}" height="${w}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${IC[n] || ""}</svg>`;

// ---------- top progress bar ----------
let _prog = { el: null, v: 0, t: null };
function progEl() { if (!_prog.el) { _prog.el = document.createElement("div"); _prog.el.className = "topbar"; document.body.appendChild(_prog.el); } return _prog.el; }
function progStart() { const e = progEl(); clearInterval(_prog.t); _prog.v = 8; e.classList.add("run"); e.style.width = "8%"; _prog.t = setInterval(() => { _prog.v = Math.min(_prog.v + (90 - _prog.v) * 0.18, 90); e.style.width = _prog.v + "%"; }, 180); }
function progDone() { const e = progEl(); clearInterval(_prog.t); e.style.width = "100%"; setTimeout(() => { e.classList.remove("run"); e.style.width = "0"; }, 260); }

// ---------- mở app ngoài (gọi / sms / zalo) ----------
function openExternal(url) { try { if (window.Capacitor?.Plugins?.App) { location.href = url; } else window.open(url, "_system") || (location.href = url); } catch { location.href = url; } }
function zaloNum(n) { const d = String(n).replace(/[^0-9]/g, ""); return d.startsWith("0") ? "84" + d.slice(1) : d; }
function phoneSheet(num, who) {
  const n = String(num).replace(/\s/g, "");
  openSheet(`<h3>${esc(who || "Liên hệ")} · ${esc(n)}</h3>
    <div class="pickgrid">
      <button class="pickbtn" onclick="closeSheet();openExternal('tel:${n}')"><span style="color:var(--present-t)">${ic("phone",20)}</span> Gọi điện</button>
      <button class="pickbtn" onclick="closeSheet();openExternal('sms:${n}')"><span style="color:var(--excused-t)">${ic("chat",20)}</span> Nhắn tin</button>
      <button class="pickbtn clear" style="color:var(--brand-2)" onclick="closeSheet();openExternal('https://zalo.me/${zaloNum(n)}')">Mở Zalo</button>
    </div>`);
}
function phoneChip(num, who) { if (!num || num === "—" || num === "-") return `<b>—</b>`; const n = esc(String(num)); return `<b class="phone" onclick="event.stopPropagation();phoneSheet('${esc(num)}','${esc(who || "")}')">${n}</b>`; }
window.openExternal = openExternal; window.phoneSheet = phoneSheet;

// ---------- chrome ----------
function appbar({ title, sub, back, action, bell } = {}) {
  return `<div class="appbar"><div class="appbar-in">
    ${back ? `<button class="back" onclick="${typeof back === "string" ? `go('${back}')` : "history.back()"}">${ic("back", 20)}</button>` : ""}
    <div style="flex:1;min-width:0">
      <h1 style="flex:none">${esc(title || "")}</h1>
      ${sub ? `<div class="muted trunc" style="font-size:12.5px;margin-top:1px">${esc(sub)}</div>` : ""}
    </div>
    ${bell ? bellBtn() : ""}
    ${action || ""}
  </div></div>`;
}
// Chuông thông báo (góc phải appbar) + badge số chưa đọc
function bellBtn() {
  const n = Notif.unread(); _bellLast = n;
  return `<button class="act bell ${n ? "has" : ""}" onclick="notifSheet()" aria-label="Thông báo">${ic("bell", 20)}<span class="badge" id="bellBadge" ${n ? "" : "hidden"}>${n > 99 ? "99+" : n}</span></button>`;
}
let _bellLast = -1;
function refreshBell() {
  const b = $("bellBadge"); if (!b) return;
  const n = Notif.unread(); b.hidden = !n; b.textContent = n > 99 ? "99+" : n;
  const btn = b.parentElement;
  if (btn) { btn.classList.toggle("has", n > 0); if (_bellLast >= 0 && n > _bellLast) { btn.classList.remove("ring"); void btn.offsetWidth; btn.classList.add("ring"); setTimeout(() => btn.classList.remove("ring"), 1300); } }
  _bellLast = n;
}
function bottomNav(active) {
  const items = [["home", "Trang chủ", "#/home", "home"], ["book", "Lớp học", "#/classes", "classes"], ["users", "Giáo lý viên", "#/teachers", "teachers"], ["user", "Tôi", "#/me", "me"]];
  return `<nav class="nav">${items.map(([i, l, h, k]) => `<a class="${active === k ? "on" : ""}" onclick="go('${h}')">${ic(i)}<span>${l}</span></a>`).join("")}</nav>`;
}
function paint(html, navKey) { root.innerHTML = html + (navKey !== false ? bottomNav(navKey) : ""); const m = root.querySelector("main"); if (m) m.classList.add("fade-in"); }
function hideBoot() { const b = $("boot"); if (!b) return; b.classList.add("out"); setTimeout(() => b.remove(), 420); }
setTimeout(hideBoot, 12000);  // phòng hờ: không để kẹt màn khởi động
function screen(html, navKey) { paint(html, navKey); progDone(); hideBoot(); }
function skelCard() { return `<div class="card pad"><div class="row"><div class="skel" style="width:46px;height:46px;border-radius:14px"></div><div class="grow"><div class="skel" style="height:11px;width:38%;margin-bottom:9px"></div><div class="skel" style="height:16px;width:66%"></div></div></div><div class="skel" style="height:58px;margin-top:14px"></div></div>`; }
function loading(navKey) { progStart(); paint(appbar({}) + `<main><div class="wrap stack">${skelCard()}${skelCard()}${skelCard()}</div></main>`, navKey); }
function haptic(ms = 12) { if (effectsOn() && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } }
function emptyBox(icon, msg, sub) { return `<div class="empty"><div class="big">${icon}</div><div style="font-weight:600;color:var(--ink)">${esc(msg)}</div>${sub ? `<div style="margin-top:6px">${esc(sub)}</div>` : ""}</div>`; }
function errBox(msg) { return `<div class="empty"><div class="big">⚠️</div><div>${esc(msg)}</div><div style="margin-top:16px"><button class="btn sm ghost" onclick="render()">Thử lại</button></div></div>`; }

// ---------- sheet ----------
let _sheetT = null;
function openSheet(html) { clearTimeout(_sheetT); $("sheetHost").innerHTML = `<div class="sheet" id="sheet"><div class="grip"></div>${html}</div>`; requestAnimationFrame(() => { const sh = $("sheet"); if (sh) sh.classList.add("on"); $("scrim").classList.add("on"); }); }
function closeSheet() { const s = $("sheet"); if (s) s.classList.remove("on"); $("scrim").classList.remove("on"); clearTimeout(_sheetT); _sheetT = setTimeout(() => { $("sheetHost").innerHTML = ""; }, 260); }
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
    <div class="card divlist" style="overflow:hidden;max-height:62vh;overflow-y:auto">${rows || `<div class="empty" style="padding:36px 20px"><div class="big">🔔</div><div style="font-weight:600;color:var(--ink)">Chưa có thông báo</div><div style="margin-top:6px;font-size:13.5px">Lưu điểm danh xong, đạt hoặc mất chuỗi học… sẽ báo ở đây.</div></div>`}</div>`);
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

function loginScreen(msg, msgType) {
  const cred = store.get("bgl-cred", null);
  paint(`<main class="fade-in login-bg"><div class="sparkles" id="sparkles"></div>
    <div class="wrap" style="max-width:420px;margin:0 auto;padding-top:6vh;position:relative;z-index:2">
    <div style="text-align:center;margin-bottom:22px">
      <div class="logo-glow"><img src="assets/logo.png" alt=""/></div>
      <div class="eyebrow" style="margin-top:6px">Ban Giáo Lý · Điểm Danh</div>
      <h1 class="disp" style="font-size:30px;margin:6px 0 0">Chào mừng trở lại</h1>
      <p class="muted" style="margin:6px 0 0">Đăng nhập để điểm danh &amp; quản lý lớp</p>
    </div>
    <div class="field" style="margin-bottom:14px"><label>Số điện thoại</label>
      <input id="u" class="input num" inputmode="tel" autocomplete="username" placeholder="0867007***" value="${esc(cred?.u || "")}"/></div>
    <div class="field"><label>Mật khẩu</label>
      <input id="p" class="input" type="password" autocomplete="current-password" placeholder="••••••" value="${esc(cred?.p || "")}"/></div>
    <label class="check"><input type="checkbox" id="remember" ${cred ? "checked" : ""}/><span class="box">${ic("check", 14)}</span><span>Lưu tài khoản trên máy này</span></label>
    <div id="authmsg"></div>
    <button class="btn" id="loginBtn" style="margin-top:18px">Đăng nhập</button>
    <button class="bio" id="bioBtn" hidden onclick="bioLogin()">${ic("finger", 20)} Đăng nhập bằng vân tay / FaceID</button>
  </div></main>`, false);
  progDone(); hideBoot();
  if (effectsOn()) makeSparkles($("sparkles"));
  if (msg) showAuth(msg, msgType);
  $("loginBtn").onclick = () => doLogin();
  $("p").addEventListener("keydown", (e) => { if (e.key === "Enter") doLogin(); });
  if (cred) bioAvailable().then((ok) => { const b = $("bioBtn"); if (ok && b) b.hidden = false; });
}
function showAuth(msg, type) { const a = $("authmsg"); if (!a) return; a.className = "authmsg " + (type === "ok" ? "ok" : "err"); a.innerHTML = (type === "ok" ? ic("check", 16) : "") + " " + esc(msg); }
async function doLogin() {
  const u = $("u").value.trim(), p = $("p").value, remember = $("remember")?.checked;
  if (!u || !p) return showAuth("Nhập đủ số điện thoại và mật khẩu.", "err");
  const b = $("loginBtn"); b.disabled = true; b.innerHTML = `<span class="btnspin"></span> Đang đăng nhập…`;
  progStart();
  try {
    S.user = await BGL.login(u, p);
    if (remember) store.set("bgl-cred", { u, p }); else { try { localStorage.removeItem("bgl-cred"); } catch {} }
    b.innerHTML = `${ic("check", 18)} Thành công`; showAuth("Đăng nhập thành công", "ok");
    await boot(); progDone(); setTimeout(() => go(landingHash()), 350);
  } catch (e) {
    progDone(); b.disabled = false; b.textContent = "Đăng nhập"; showAuth(trErr(e.message), "err");
    if (navigator.vibrate) navigator.vibrate(120);
  }
}
async function bioLogin() {
  const B = window.Capacitor?.Plugins?.NativeBiometric, cred = store.get("bgl-cred", null);
  if (!B || !cred) return;
  try { await B.verifyIdentity({ reason: "Đăng nhập Điểm Danh", title: "Xác thực", subtitle: "", description: "" }); $("u").value = cred.u; $("p").value = cred.p; doLogin(); }
  catch { showAuth("Xác thực sinh trắc học thất bại.", "err"); }
}
window.doLogin = doLogin; window.bioLogin = bioLogin;

async function doLogout() { closeSheet(); try { await BGL.logout(); } catch {} S.user = null; loginScreen(); }
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
  const hero = `<div class="hero" style="padding:16px 18px">
    <div class="row" style="align-items:flex-start">
      <div class="grow">
        <div class="eyebrow" style="font-size:10.5px">${esc(S.year ? S.year.long_year : "Niên khóa")}</div>
        <h2 style="font-size:21px;margin:4px 0 1px">${esc((u.person_name || "").split(" ").slice(-2).join(" ") || "Bạn")}</h2>
        <div style="opacity:.85;font-size:12.5px">${esc(u.person_christian_name || "")} · ${esc(role)}</div>
      </div>
      <div class="ava" style="background:rgba(255,255,255,.14);border-color:transparent;color:#fff">${esc(initials(u.person_name))}</div>
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
        <button class="btn press" onclick="go('#/classes')">${ic("book", 18)} Các lớp</button>
        <button class="btn ghost press" onclick="go('#/teachers')">${ic("users", 18)} GLV</button>
      </div>
      ${myBlock}
    </div></main>`, "home");
}
function classRowCard(c, position, primary) {
  if (!c) return "";
  const ov = c.enrollments_overview || {};
  const active = ov["Đang Học"] || 0;
  return `<div class="card pad press" onclick="go('#/class/${c.id}')">
    <div class="row">
      <div class="ava ${primary ? "g" : ""}">${esc(initials(c.name))}</div>
      <div class="grow">
        <div class="disp" style="font-size:18px">${esc(c.name)}</div>
        <div class="muted" style="font-size:12.5px">${esc(c.location || "—")}${position ? ` · ${esc(position)}` : ""}</div>
      </div>
      <div style="text-align:right"><div class="disp num" style="font-size:20px;color:var(--brand-2)">${active}</div><div class="faint" style="font-size:11px">thiếu nhi</div></div>
    </div>
    ${primary ? `<button class="btn gold sm press" style="width:100%;margin-top:12px" onclick="event.stopPropagation();go('#/class/${c.id}/diemdanh')">${ic("swipe", 17)} Điểm danh nhanh</button>` : ""}
  </div>`;
}

// ============================================================
//  CLASSES
// ============================================================
async function classesScreen() {
  loading("classes");
  try {
    const list = await BGL.classrooms(S.year && S.year.year);
    S._classes = list;
    screen(appbar({ title: "Lớp học", bell: true, action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
      `<main><div class="wrap">
        <input id="clsq" class="input" placeholder="Lọc theo tên lớp…" oninput="filterClasses(this.value)" style="margin:2px 0 14px"/>
        <div class="stack" id="clsList">${list.map((c) => classRowCard(c)).join("")}</div>
      </div></main>`, "classes");
  } catch (e) { screen(appbar({ title: "Lớp học" }) + `<main>${errBox(e.message)}</main>`, "classes"); }
}
function filterClasses(q) {
  const nq = noAccent(q);
  const list = (S._classes || []).filter((c) => noAccent(c.name).includes(nq) || noAccent(c.location).includes(nq));
  $("clsList").innerHTML = list.length ? list.map((c) => classRowCard(c)).join("") : emptyBox("🔍", "Không có lớp khớp");
}
window.filterClasses = filterClasses;

// ============================================================
//  CLASS DETAIL
// ============================================================
const CX = {};
async function classScreen(id, tab, extra) {
  tab = tab || "thieunhi";
  loading();
  let c;
  try { c = (CX[id] && CX[id].info) || (CX[id] = CX[id] || {}, CX[id].info = await BGL.classroom(id)); }
  catch (e) { screen(appbar({ title: "Lớp", back: "#/classes" }) + `<main>${errBox(e.message)}</main>`); return; }
  const segs = [["thieunhi", "Thiếu nhi"], ["diemdanh", "Điểm danh"], ["glv", "Giáo lý viên"]];
  // Niên khóa hiển thị = niên khóa CỦA LỚP (lớp năm cũ trong Hành trình không còn hiện năm hiện tại)
  const yr = classYearRange(c), longYear = c.long_year || (yr && yr.long) || "";
  const subInfo = [longYear, c.location].filter(Boolean).join(" · ");
  const oldYear = yr && !yr.current;
  screen(appbar({ title: c.name, sub: subInfo, back: "#/classes", bell: true }) +
    `<main><div class="wrap">
      ${oldYear ? `<div class="card pad" style="margin-bottom:14px;display:flex;align-items:center;gap:10px;padding:12px 14px;border-color:var(--gold)"><span style="color:var(--gold-2)">${ic("cal", 20)}</span><div><div class="faint" style="font-size:11.5px">Lớp năm cũ</div><div style="font-weight:600">Niên khóa ${esc(longYear)} · dữ liệu lịch sử</div></div></div>` : ""}
      ${c.location ? `<div class="card pad" style="margin-bottom:14px;display:flex;align-items:center;gap:10px;padding:12px 14px"><span style="color:var(--gold-2)">📍</span><div><div class="faint" style="font-size:11.5px">Địa điểm học</div><div style="font-weight:600">${esc(c.location)}</div></div></div>` : ""}
      <div class="seg" style="margin-bottom:16px">${segs.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" onclick="go('#/class/${id}/${k}')">${l}</button>`).join("")}</div>
      <div id="tabBody"><div class="spin"></div></div>
    </div></main>`, "classes");
  if (tab === "thieunhi") tabStudents(id, extra);
  else if (tab === "diemdanh") tabAttendance(id);
  else tabTeachers(id);
}

// ---------- Tab: Thiếu nhi ----------
async function tabStudents(id, focusEid) {
  try {
    const enr = CX[id].enr || (CX[id].enr = await BGL.classroomEnrollments(id));
    const counts = {}; enr.forEach((e) => (counts[e.result] = (counts[e.result] || 0) + 1));
    const summary = `<div class="statgrid" style="margin-bottom:16px">${["Đang Học", "Nghỉ Luôn", "Lên Lớp", "Học Lại", "Chuyển Xứ"].map((k) => statTile(counts[k] || 0, k, STONE[k])).join("")}</div>`;
    const body = $("tabBody"); if (!body) return;
    body.innerHTML = summary +
      `<input id="stuQ" class="input" placeholder="🔍 Tìm tên thiếu nhi…" oninput="filterStudents('${id}',this.value)" value="${esc(CX[id].studentQ || "")}" style="margin:2px 0 14px"/>
       <div class="stack" id="stuList"></div>`;
    renderStudentList(id);
    // Chuỗi học: tải điểm danh cả năm (nền) rồi điền vào ô
    loadClassAttendance(id).then(() => paintStreaks(id));
    // Đến từ thông báo -> cuộn tới & làm nổi thẻ thiếu nhi
    if (focusEid) setTimeout(() => { const el = $("stu-" + focusEid); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("hl"); setTimeout(() => el.classList.remove("hl"), 2500); } }, 60);
  } catch (e) { const b = $("tabBody"); if (b) b.innerHTML = errBox(e.message); }
}
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
      <button class="chip ${RESULT_CLS[e.result] || "st-quit"}" style="border:0" onclick="resultPicker('${cid}',${e.id},'${esc(e.result || "")}')"><span class="dot"></span>${esc(e.result || "")} ${ic("chev", 13)}</button>
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
      <span class="muted">🎂 ${fmtDate(p.birth_date)}</span>
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
  try { await BGL.updateEnrollment(eid, { result: r }); toast("Đã cập nhật: " + r); CX[cid].enr = null; await tabStudents(cid); }
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
      openSheet(`<h3>${esc(name)} · Chuỗi học</h3><div class="empty" style="padding:26px"><div class="big">⚠️</div><div style="font-weight:600;color:var(--ink)">Không tải được dữ liệu điểm danh</div><div style="margin-top:6px;font-size:13.5px">Kiểm tra mạng rồi thử lại.</div>
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
      : t.st ? `<span class="chip ${stCls(t.st)}"><span class="dot"></span>${t.st}</span>` : `<span class="chip st-none">Chưa điểm</span>`;
    const [lab, col] = isToday ? ["chưa điểm danh", "var(--ink-faint)"] : EFF[t.eff];
    return `<div class="tl-row"><div class="grow"><div style="font-weight:600;font-size:13.5px">${weekdayVN(t.d)}, ${fmtDate(t.d)}</div><div style="font-size:11.5px;color:${col}">${lab}</div></div>${chip}<button class="pick" onclick="streakDayMenu('${cid}',${eid},'${t.d}')" aria-label="Tuỳ chọn ngày">${ic("gear", 14)}</button></div>`;
  }).join("") || `<div class="empty" style="padding:24px;font-size:13.5px">Chưa có buổi học nào trong niên khóa.</div>`;
  const lastBreak = s.timeline.slice().reverse().find((t) => t.eff === "break");
  openSheet(`<h3>${esc(name)} · Chuỗi học</h3>
    <div class="streak-hero">${flameSVG(s.cur, 110)}
      <div class="cap">${s.cur ? `${s.cur} buổi học liên tiếp · <b style="color:var(--ink)">${streakTier(s.cur).name}</b>` : "Chưa có chuỗi — đi học buổi tới để nhen lửa"}</div>
      <div class="faint" style="font-size:12px">${(() => { const nx = nextTier(s.cur); return nx ? `Còn ${nx.min - s.cur} buổi nữa lên <b>${nx.name}</b>` : "Đã đạt cấp cao nhất — giữ lửa nhé!"; })()}</div>
      ${s.cur ? `<button class="btn gold" style="max-width:300px;margin-top:12px" onclick="streakCardSheet('${cid}',${eid})">${ic("sparkle", 18)} Khoe chuỗi · ảnh động chúc mừng</button>` : ""}
    </div>
    <div class="statgrid" style="margin-bottom:14px">${statTile(s.best, "Dài nhất", "amber")}${statTile(s.attended, "Buổi có mặt", "green")}${statTile(s.timeline.filter((t) => t.eff === "break").length, "Lần mất chuỗi", "red")}</div>
    ${lastBreak ? `<button class="btn ghost" style="margin-bottom:12px;color:var(--brand-2)" onclick="streakForgive('${cid}',${eid},'${lastBreak.d}')">${ic("sparkle", 17)} Khôi phục chuỗi (bỏ qua ${fmtDate(lastBreak.d).slice(0, 5)})</button>` : ""}
    ${s.truncated ? `<div class="authmsg err" style="margin:0 2px 12px">${ic("bug", 16)} Dữ liệu điểm danh quá lớn, chỉ tải được một phần — chuỗi có thể chưa chính xác.</div>` : ""}
    <p class="muted" style="margin:0 2px 10px;font-size:12.5px;line-height:1.45">Tuần cả lớp không điểm danh được xem là tuần nghỉ, không làm mất chuỗi. Bấm ${ic("gear", 12)} ở từng ngày để bỏ qua cho em này hoặc đánh dấu tuần nghỉ cả lớp.</p>
    <div class="card divlist" style="overflow:hidden;max-height:42vh;overflow-y:auto">${rows}</div>
    <button class="btn ghost" style="margin-top:12px" onclick="streakSettingsSheet('${cid}',${eid})">${ic("settings", 17)} Quy tắc tính chuỗi</button>`);
}
function streakDayMenu(cid, eid, d) {
  const adj = streakAdj(cid), isSkip = adj.skip.includes(d), isForg = (adj.forgive[String(eid)] || []).includes(d);
  openSheet(`<h3>${weekdayVN(d)}, ${fmtDate(d)}</h3>
    <div class="pickgrid">
      <button class="pickbtn ${isForg ? "on st-excused" : ""}" style="grid-column:span 2" onclick="streakToggle('${cid}',${eid},'${d}','forgive')"><span class="sw" style="background:var(--excused-t)"></span><span>${isForg ? "Bỏ bỏ-qua · tính lại ngày này" : "Bỏ qua ngày này cho em này"}<br><small class="muted">không cộng, không mất chuỗi</small></span></button>
      <button class="pickbtn ${isSkip ? "on st-late" : ""}" style="grid-column:span 2" onclick="streakToggle('${cid}',${eid},'${d}','skip')"><span class="sw" style="background:var(--late-t)"></span><span>${isSkip ? "Bỏ đánh dấu tuần nghỉ" : "Tuần nghỉ cả lớp"}<br><small class="muted">không tính cho tất cả thiếu nhi</small></span></button>
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
    <p class="muted" style="margin:0 2px 10px;font-size:12.5px;line-height:1.45">Quy tắc + tuần nghỉ / ngày bỏ qua đã đánh dấu (${streakAdjCount()} lớp). Xuất ra file để chuyển máy hoặc chia sẻ cho GLV cùng lớp, rồi Nhập ở máy kia.</p>
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
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
  inp.onchange = () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => { try { const n = applyStreakImport(JSON.parse(r.result)); toast(`Đã nhập quy tắc + điều chỉnh chuỗi của ${n} lớp ✓`); if (cid) { paintStreaks(cid); streakSheet(cid, eid); } else streakSettingsSheet(); } catch (e) { toast("File không hợp lệ: " + (e.message || e), 3000); } };
    r.readAsText(file);
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
  catch (e) { const b = $("scBody"); if (b) b.innerHTML = `<div class="empty" style="padding:26px"><div class="big">⚠️</div><div>Không tạo được thẻ: ${esc(e.message || e)}</div></div>`; return; }
  CX[cid]._card = A; CX[cid]._cardEid = eid;
  // xem trước động ngay trong app
  const cv = $("scCanvas"); if (!cv) return;
  const S = 0.5, x = cv.getContext("2d"), t0 = performance.now();
  const loop = () => { const el = $("scCanvas"); if (!el || el !== cv) return; if (!document.hidden) { const t = ((performance.now() - t0) / 1000) % CARD_DUR; x.setTransform(S, 0, 0, S, 0, 0); paintCard(x, A, t); } requestAnimationFrame(loop); };
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

// ---------- Tab: Giáo lý viên của lớp ----------
async function tabTeachers(id) {
  try {
    let list = CX[id].teachers;
    if (!list) { const info = CX[id].info || {}; list = (info.teaching_assignments_overview && info.teaching_assignments_overview.length) ? info.teaching_assignments_overview : await BGL.teachingByClass(id); CX[id].teachers = list; }
    $("tabBody").innerHTML = `<div class="stack">${list.map((t) => teacherCard(t)).join("") || emptyBox("🧑‍🏫", "Chưa có giáo lý viên")}</div>`;
  } catch (e) { $("tabBody").innerHTML = errBox(e.message); }
}
function teacherCard(t, classroomName) {
  const p = t.person || {};
  return `<div class="card pad press" onclick="go('#/person/${p.id}')">
    <div class="row">
      ${avatar(p, { cls: "g", tappable: true })}
      <div class="grow"><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}</div>
        <div class="nm" style="font-weight:700;font-size:${nmFs(p.name || p.full_name, 16)}px">${esc(p.name || p.full_name)}</div>
        <div class="muted" style="font-size:12.5px">${esc(t.position || "")}${classroomName ? ` · ${esc(classroomName)}` : ""} · ${phoneChip(p.phone, p.name || p.full_name)}</div></div>
      <span class="list-arrow">${ic("chev", 20)}</span>
    </div>
  </div>`;
}

// ============================================================
//  TEACHERS (year)
// ============================================================
async function teachersScreen() {
  loading("teachers");
  try {
    const list = await BGL.teachersByYear(S.year && S.year.year);
    S._teachers = list;
    screen(appbar({ title: "Giáo lý viên", bell: true, action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
      `<main><div class="wrap">
        <input id="tq" class="input" placeholder="Lọc theo tên…" oninput="filterTeachers(this.value)" style="margin:2px 0 14px"/>
        <div class="muted" style="margin:0 2px 12px;font-size:13px">${list.length} giáo lý viên · ${esc(S.year ? S.year.long_year : "")}</div>
        <div class="stack" id="tList">${list.map((t) => teacherCard(t, t.classroom && t.classroom.name)).join("")}</div>
      </div></main>`, "teachers");
  } catch (e) { screen(appbar({ title: "Giáo lý viên" }) + `<main>${errBox(e.message)}</main>`, "teachers"); }
}
function filterTeachers(q) {
  const nq = noAccent(q);
  const list = (S._teachers || []).filter((t) => noAccent((t.person && t.person.full_name) || "").includes(nq));
  $("tList").innerHTML = list.length ? list.map((t) => teacherCard(t, t.classroom && t.classroom.name)).join("") : emptyBox("🔍", "Không có kết quả");
}
window.filterTeachers = filterTeachers;

// ============================================================
//  PERSON
// ============================================================
async function personScreen(id, tab) {
  tab = tab || "info"; loading();
  let p;
  try { p = await BGL.person(id); } catch (e) { screen(appbar({ title: "Thông tin", back: true }) + `<main>${errBox(e.message)}</main>`); return; }
  screen(appbar({ title: p.full_name || p.name, back: true }) +
    `<main><div class="wrap">
      <div class="card pad" style="text-align:center;margin-bottom:16px">
        <div style="margin:0 auto 10px;width:72px">${avatar(p, { size: 72, r: 24, fs: 26, cls: "g", tappable: true })}</div>
        <div class="faint" style="font-size:13px">${esc(p.christian_name || "")}</div>
        <div class="disp" style="font-size:22px">${esc(p.name || p.full_name)}</div>
        <div class="muted" style="font-size:13px;margin-top:2px">${esc(p.gender || "")} · ${fmtDate(p.birth_date)}</div>
      </div>
      <div class="seg" style="margin-bottom:16px">
        <button class="${tab === "info" ? "on" : ""}" onclick="go('#/person/${id}/info')">Cá nhân</button>
        <button class="${tab === "journey" ? "on" : ""}" onclick="go('#/person/${id}/journey')">Hành trình</button>
      </div>
      <div id="pBody"><div class="spin"></div></div>
    </div></main>`, "teachers");
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
  try {
    const list = await BGL.teachingByPerson(id);
    list.sort((a, b) => ((b.classroom && b.classroom.year) || 0) - ((a.classroom && a.classroom.year) || 0));
    $("pBody").innerHTML = `<div class="stack">${list.map((t) => { const c = t.classroom || {}; return `<div class="card pad press" onclick="go('#/class/${c.id}')"><div class="row"><div class="grow"><div class="faint" style="font-size:12px">${esc(c.long_year || "")}</div><div style="font-weight:700;font-size:16px">${esc(c.name || "")}</div><div class="muted" style="font-size:12.5px">${esc(c.location || "")}</div></div><span class="chip st-excused">${esc(t.position || "")}</span></div></div>`; }).join("") || emptyBox("🗺️", "Chưa có hành trình")}</div>`;
  } catch (e) { $("pBody").innerHTML = errBox(e.message); }
}

// ============================================================
//  ME / PROFILE + SETTINGS
// ============================================================
function meScreen() {
  const u = S.user || {};
  const role = myRole();
  const tm = themeMode();
  screen(appbar({ title: "Tôi", bell: true }) + `<main><div class="wrap stack">
    <div class="card pad press" onclick="${u.person_id ? `go('#/person/${u.person_id}')` : ""}">
      <div class="row">${avatar({ id: u.person_id, name: u.person_name }, { size: 56, r: 18, fs: 20, cls: "g", tappable: true })}
        <div class="grow"><div class="disp" style="font-size:19px">${esc(u.person_name || "")}</div>
          <div class="muted" style="font-size:13px">${esc(role)} · ${esc(u.username || "")}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div>
    </div>

    <div class="sec-eyebrow"><span class="eyebrow">Ứng dụng</span></div>
    <button class="card pad press" style="width:100%;text-align:left" onclick="utilsSheet()">
      <div class="row"><span style="color:var(--brand-2)">${ic("gear", 22)}</span><div class="grow"><div style="font-weight:600">Tiện ích ứng dụng</div><div class="muted" style="font-size:12.5px">Cử chỉ quẹt · Chuỗi học · Sao lưu · Debug · Xoá dữ liệu</div></div><span class="list-arrow">${ic("chev", 20)}</span></div>
    </button>

    <div class="sec-eyebrow"><span class="eyebrow">Giao diện</span></div>
    <div class="seg">${[["system", "Hệ thống"], ["light", "Sáng"], ["dark", "Tối"]].map(([k, l]) => `<button class="${tm === k ? "on" : ""}" onclick="setTheme('${k}')">${l}</button>`).join("")}</div>

    <div class="sec-eyebrow"><span class="eyebrow">Tài khoản</span></div>
    <button class="card pad press" style="width:100%;text-align:left" onclick="loginInfoSheet()">
      <div class="row"><span style="color:var(--brand-2)">${ic("key", 22)}</span><div class="grow"><div style="font-weight:600">Thông tin đăng nhập</div><div class="muted" style="font-size:12.5px">Đổi tên đăng nhập / mật khẩu</div></div><span class="list-arrow">${ic("chev", 20)}</span></div>
    </button>
    <button class="card pad press" style="width:100%;text-align:left;color:var(--danger)" onclick="doLogout()">
      <div class="row">${ic("logout", 22)}<div class="grow" style="font-weight:600">Đăng xuất</div></div>
    </button>
    <div class="faint" style="text-align:center;font-size:11.5px;padding:8px">Điểm Danh · v1.1 · Ban Giáo Lý</div>
  </div></main>`, "me");
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
function utilRow(icon, title, sub, onclick, danger) {
  return `<button class="card pad press" style="width:100%;text-align:left;margin-bottom:10px" onclick="${onclick}">
    <div class="row"><span style="color:${danger ? "var(--danger)" : "var(--brand-2)"}">${ic(icon, 22)}</span><div class="grow"><div style="font-weight:600${danger ? ";color:var(--danger)" : ""}">${title}</div><div class="muted" style="font-size:12.5px">${sub}</div></div><span class="list-arrow">${ic("chev", 18)}</span></div>
  </button>`;
}
function utilsSheet() {
  const dbgOn = (() => { try { return localStorage.getItem("bgl-debug") === "1"; } catch { return false; } })();
  const fxOn = effectsOn();
  openSheet(`<h3>Tiện ích ứng dụng</h3>
    ${utilRow("swipe", "Cử chỉ quẹt", "Tùy chỉnh vuốt lên/xuống/trái/phải &amp; chạm đôi", "gestureSheet()")}
    ${utilRow("fire", "Chuỗi học", "Quy tắc cộng / giữ / mất chuỗi · Xuất / Nhập dữ liệu chuỗi", "streakSettingsSheet()")}
    ${utilRow("gear", "Hiệu năng &amp; hiệu ứng", `Bật/tắt hiệu ứng động · <b style="color:${fxOn ? "var(--present-t)" : "var(--ink-faint)"}">${fxOn ? "ĐANG BẬT" : "ĐANG TẮT"}</b>`, "perfSheet()")}
    ${utilRow("upload", "Sao lưu &amp; xuất dữ liệu", "Xuất ảnh + cài đặt ra 1 file để lưu / chuyển máy", "exportData()")}
    ${utilRow("download", "Nhập dữ liệu", "Khôi phục ảnh &amp; cài đặt từ file sao lưu", "importData()")}
    ${utilRow("bug", "Debug — log API", `Ghi endpoint · response · lỗi${dbgOn ? ' · <b style="color:var(--present-t)">ĐANG BẬT</b>' : ""}`, "debugSheet()")}
    ${utilRow("trash", "Xoá dữ liệu", "Ảnh, cache, tài khoản đã lưu…", "deleteSheet()", true)}`);
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
  const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json,.json";
  inp.onchange = () => {
    const file = inp.files && inp.files[0]; if (!file) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const d = JSON.parse(r.result);
        if (!d || !d.photos) return toast("File sao lưu không hợp lệ");
        let n = 0;
        Object.keys(d.photos || {}).forEach((k) => {
          const val = d.photos[k]; try { localStorage.setItem(k, val); } catch {}
          const m = k.match(/-(\d+)$/); if (m && S.user) { try { localStorage.setItem(photoKey(m[1]), val); } catch {} } n++;
        });
        if (d.names) { try { const cur = JSON.parse(localStorage.getItem("bgl-photo-names") || "{}"); localStorage.setItem("bgl-photo-names", JSON.stringify(Object.assign(cur, d.names))); } catch {} }
        if (d.settings) Object.keys(d.settings).forEach((k) => {
          if (d.settings[k] == null) return;
          try { localStorage.setItem(k, d.settings[k]); } catch {}
          const m = k.match(/^bgl-streak-adj-[^-]+-(\d+)$/); if (m && S.user) { try { localStorage.setItem(streakAdjKey(m[1]), d.settings[k]); } catch {} }   // gán cho tài khoản đang đăng nhập
        });
        applyTheme(themeMode()); document.documentElement.classList.toggle("no-fx", !effectsOn());
        closeSheet(); toast(`Đã nhập ${n} ảnh + cài đặt ✓`); render();
      } catch (e) { toast("File không đọc được: " + e.message); }
    };
    r.readAsText(file);
  };
  inp.click();
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
    const ph = localStorage.getItem(k);
    return `<div class="rev-row" style="align-items:center">
      <div class="ava" style="width:40px;height:40px;border-radius:12px;background-image:url('${ph}');background-size:cover;background-position:center;border-color:transparent"></div>
      <div class="grow" style="font-weight:600;font-size:14px">${esc(nm)}</div>
      <button class="pick" style="color:var(--danger);border-color:var(--danger)" onclick="delOnePhoto('${k}')">${ic("trash", 15)} Xoá</button>
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
    if (what === "cred" || what === "all") localStorage.removeItem("bgl-cred");
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

async function loginInfoSheet() {
  let user; try { user = await BGL.myUser(); } catch { user = null; }
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
  const yr = classYearRange(CX[id].info);
  const A = (CX[id].att = CX[id].att || { date: defaultSunday(yr), assign: {}, existing: {}, dirty: new Set(), idx: 0, loaded: false, undo: [], prompted: false, justSaved: false });
  loadClassAttendance(id);   // nền: dữ liệu cả năm cho Chuỗi học / thông báo sau khi Xác nhận
  $("tabBody").innerHTML = `
    <button class="card pad press" style="width:100%;text-align:left;margin-bottom:14px;background:var(--surface)" onclick="sundaySheet('${id}')">
      <div class="row"><span style="color:var(--brand-2)">${ic("cal", 20)}</span>
        <div class="grow"><div class="faint" style="font-size:12px">Ngày điểm danh (Chúa Nhật)</div>
          <div id="adateLbl" style="font-weight:700;font-size:16px">${weekdayVN(A.date)}, ${fmtDate(A.date)}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div>
    </button>
    <div class="seg" style="margin-bottom:16px">
      <button onclick="openSwipeFull('${id}')">${ic("swipe", 16)} Quẹt</button>
      <button class="on" onclick="renderColumn('${id}')">${ic("cols", 16)} Cột</button>
    </div>
    <div id="attArea"><div class="spin"></div></div>`;
  await loadAtt(id); renderColumn(id);
  if (!A.prompted && !isSundayToday() && yr && yr.current) { A.prompted = true; notSundayPrompt(id); }
}
window.tabAttendance = tabAttendance;

function setAttDate(id, date) {
  const A = CX[id].att; A.date = date; A.loaded = false; A.assign = {}; A.existing = {}; A.dirty = new Set(); A.idx = 0; A.undo = []; A.justSaved = false;
  const lbl = $("adateLbl"); if (lbl) lbl.innerHTML = `${weekdayVN(date)}, ${fmtDate(date)}`;
  const area = $("attArea"); if (area) area.innerHTML = `<div class="spin"></div>`;
  loadAtt(id).then(() => renderColumn(id));
}
function sundaySheet(id) {
  const A = CX[id].att, list = academicSundays(classYearRange(CX[id].info));
  if (!list.length) return toast("Chưa có dữ liệu niên khóa");
  let html = "", curM = "";
  list.forEach((sd) => {
    const m = sd.slice(0, 7);
    if (m !== curM) { curM = m; const [yy, mm] = m.split("-"); html += `<div class="eyebrow" style="margin:16px 2px 8px">Tháng ${mm} · ${yy}</div>`; }
    const sel = sd === A.date;
    html += `<button class="pickbtn ${sel ? "on st-present" : ""}" style="width:100%;margin-bottom:8px;justify-content:space-between" onclick="closeSheet();setAttDate('${id}','${sd}')"><span>${weekdayVN(sd)}, ${fmtDate(sd)}</span>${sel ? ic("check", 18) : `<span class="faint">${ic("chev", 16)}</span>`}</button>`;
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
  if (A.loaded) return;
  const enr = CX[id].enr || (CX[id].enr = await BGL.classroomEnrollments(id));
  A.enr = enr.filter((e) => e.result === "Đang Học" || !e.result || e.result === "Học Lại");
  if (!A.enr.length) A.enr = enr;
  try {
    const recs = await BGL.attendancesByClass(id, A.date);
    A.existing = {}; A.assign = {};
    recs.forEach((r) => { A.existing[r.attendable_id] = { id: r.id, status: r.status }; A.assign[r.attendable_id] = r.status; });
  } catch { A.existing = {}; }
  A.idx = 0; A.undo = []; A.dirty = new Set(); A.syncSnooze = 0; A.justSaved = false; A.loaded = true;
}
function changeCount(A) {
  let n = 0;
  for (const eid in A.assign) { const d = A.assign[eid], ex = A.existing[eid]; if ((d || "") !== (ex ? ex.status : "")) n++; }
  for (const eid in A.existing) { if (!(eid in A.assign) && A.existing[eid]) n++; }
  return n;
}

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
  if (!A.enr || !A.enr.length) { area.innerHTML = emptyBox("👶", "Lớp chưa có thiếu nhi đang học"); return; }
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
      <div class="meta">🎂 ${fmtDate(p.birth_date)}</div>
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
  if (status) { A.assign[e.id] = status; A.dirty.add(String(e.id)); haptic(14); toast(`${(e.person || {}).name || ""}: ${status}`, 850); }
  A.undo.push(A.idx); A.idx++;
  setTimeout(() => renderSwipe(id), 190);
}
function swipeUndo(id) { const A = CX[id].att; if (!A.undo.length) return; A.idx = A.undo.pop(); renderSwipe(id); }
window.swipeUndo = swipeUndo;
function swipeDone(id) {
  const b = $("swipeBody"); if (!b) return;
  b.innerHTML = `<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
    <div class="disp" style="font-size:56px;color:var(--brand-2)">✓</div>
    <div class="disp" style="font-size:22px;margin-top:4px">Đã quẹt xong</div>
    <p class="muted" style="margin:6px 0 22px;max-width:270px">Xem lại danh sách dạng cột rồi bấm Xác nhận để gửi lên hệ thống.</p>
    <button class="btn" style="max-width:290px" onclick="closeSwipeFull('${id}')">${ic("cols", 17)} Xem &amp; xác nhận</button>
    <button class="btn ghost" style="max-width:290px;margin-top:10px" onclick="attRestart('${id}')">Quẹt lại từ đầu</button>
  </div>`;
}
function attRestart(id) { const A = CX[id].att; A.idx = 0; A.undo = []; renderSwipe(id); }
window.attRestart = attRestart;

// ---------- COLUMN / REVIEW ----------
function renderColumn(id) {
  const A = CX[id].att, area = $("attArea");
  if (!area) return;
  if (!A.enr || !A.enr.length) { area.innerHTML = emptyBox("👶", "Lớp chưa có thiếu nhi đang học"); return; }
  const counts = {}; STATUSES.forEach((s) => (counts[s.v] = 0));
  A.enr.forEach((e) => { const v = A.assign[e.id]; if (v) counts[v]++; });
  const done = A.enr.filter((e) => A.assign[e.id]).length;
  const summary = `<div class="statgrid" style="margin-bottom:14px">
    ${statTile(done + "/" + A.enr.length, "Đã điểm", "gold")}
    ${STATUSES.slice(0, 5).map((s) => statTile(counts[s.v], s.v, STONE[s.v])).join("")}</div>`;
  // Bộ lọc theo trạng thái ("" = tất cả · "none" = chưa điểm · tên trạng thái)
  const F = A.filter || "", shown = A.enr.filter((e) => attMatches(A, e));
  const chip = (key, label, n, cls) => `<button class="pick ${F === key ? "on " + cls : ""}" onclick="setAttFilter('${id}','${key}')">${label} <b class="num">${n}</b></button>`;
  const filterBar = `<div class="rev-status filterbar">${chip("", "Tất cả", A.enr.length, "st-quit")}${chip("none", "Chưa điểm", A.enr.length - done, "st-quit")}${STATUSES.filter((s) => counts[s.v] || F === s.v || s.v !== "Nghỉ Luôn").map((s) => chip(s.v, s.v, counts[s.v] || 0, s.cls)).join("")}</div>
    <div class="row" style="margin:0 2px 10px;gap:10px"><span class="muted grow" style="font-size:12.5px">${F ? `Đang hiện ${shown.length}/${A.enr.length} em` : `${A.enr.length} em`}</span>
      <button class="btn ghost sm" style="padding:8px 12px" onclick="applyAllSheet('${id}')">${ic("check", 15)} Đặt tất cả${F ? " (đang hiện)" : ""}</button></div>`;
  const rows = shown.map((e) => {
    const p = e.person || {}, cur = A.assign[e.id] || "";
    return `<button class="rev-row" style="width:100%;text-align:left;background:none" onclick="statusPicker('${id}',${e.id})">
      ${avatar(p, { size: 42, r: 12, fs: 14, tappable: true })}
      <div class="grow"><div class="nm" style="font-weight:600;font-size:${nmFs(p.name || p.full_name, 15)}px">${esc(p.name || p.full_name)}</div><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}</div></div>
      <span class="chip ${cur ? stCls(cur) : "st-none"}">${cur ? '<span class="dot"></span>' : ""}${cur || "Chưa điểm"}</span>
      <span class="list-arrow">${ic("chev", 18)}</span>
    </button>`;
  }).join("") || `<div class="empty" style="padding:30px 20px;font-size:13.5px">Không có em nào ở trạng thái này</div>`;
  const swipeCta = `<button class="btn press" style="margin-bottom:14px" onclick="openSwipeFull('${id}')">${ic("swipe", 18)} Quẹt để điểm danh nhanh</button>`;
  // Đã điểm đủ cả lớp HOẶC vừa Xác nhận thành công -> hiện ô xuất bảng điểm danh (lấp lánh)
  const allDone = done === A.enr.length, pending = changeCount(A);
  const exportCta = (allDone || A.justSaved) ? `<button class="export-cta press" onclick="exportSheet('${id}')">
      <span class="ex-ic">${ic("image", 22)}</span>
      <div class="grow"><div class="ex-t">Xuất bảng điểm danh</div>
        <div class="ex-s">${allDone ? `Đã điểm đủ ${A.enr.length} em` : "Đã lưu lên hệ thống"} · tạo ảnh gửi phụ huynh${pending ? ` · còn ${pending} thay đổi chưa xác nhận` : ""}</div></div>
      <span class="ex-chev">${ic("chev", 18)}</span><i class="sp s1"></i><i class="sp s2"></i><i class="sp s3"></i></button>` : "";
  area.innerHTML = swipeCta + exportCta + summary + filterBar + `<div class="card divlist" style="overflow:hidden">${rows}</div><div style="height:84px"></div>` +
    `<div class="confirmbar"><button class="btn gold" id="confirmBtn" ${A.saving ? "disabled" : ""} onclick="attConfirm('${id}')">${A.saving ? `<span class="spin" style="width:18px;height:18px;margin:0;border-width:2px"></span> Đang gửi…` : `${ic("check", 18)} Xác nhận (${changeCount(A)})`}</button></div>`;
}
window.renderColumn = renderColumn;
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
  A.filter = ""; closeSheet(); haptic();
  toast(v ? `Đã đặt ${v} cho ${shown.length} em` : `Đã xóa trạng thái ${shown.length} em`);
  renderColumn(id);
}
window.setAttFilter = setAttFilter; window.applyAllSheet = applyAllSheet; window.applyAll = applyAll;

function statusPicker(id, eid) {
  const A = CX[id].att, e = A.enr.find((x) => x.id === eid) || {}, p = e.person || {}, cur = A.assign[eid] || "";
  const btns = STATUSES.map((s) => `<button class="pickbtn ${cur === s.v ? "on " + s.cls : ""}" onclick="pickStatus('${id}',${eid},'${s.v}')"><span class="sw" style="background:var(${stColorVar(s.v)})"></span>${s.v}</button>`).join("");
  openSheet(`<h3>${esc(p.name || p.full_name || "Điểm danh")}</h3><div class="pickgrid">${btns}<button class="pickbtn clear" onclick="pickStatus('${id}',${eid},'')">Xóa / Chưa điểm</button></div>`);
}
function pickStatus(id, eid, v) { const A = CX[id].att; A.dirty.add(String(eid)); haptic(); if (v) A.assign[eid] = v; else delete A.assign[eid]; closeSheet(); renderColumn(id); }
window.statusPicker = statusPicker; window.pickStatus = pickStatus;

async function attConfirm(id) {
  const A = CX[id].att, jobs = [];
  const ids = new Set([...Object.keys(A.assign), ...Object.keys(A.existing)]);
  ids.forEach((eid) => {
    const desired = A.assign[eid], ex = A.existing[eid];
    if (desired && !ex) jobs.push({ type: "create", eid, status: desired });
    else if (desired && ex && desired !== ex.status) jobs.push({ type: "update", eid, id: ex.id, status: desired });
    else if (!desired && ex) jobs.push({ type: "delete", eid, id: ex.id });
  });
  if (!jobs.length) return toast("Không có thay đổi để gửi");
  if (A.saving) return;
  A.saving = true;
  const btn = $("confirmBtn"); if (btn) btn.disabled = true;
  const before = streakMap(id);                     // chuỗi TRƯỚC khi lưu (từ cache, không chờ mạng)
  let ok = 0, fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]; if (btn) btn.innerHTML = `<span class="spin" style="width:18px;height:18px;margin:0;border-width:2px"></span> Đang gửi ${i + 1}/${jobs.length}`;
    try {
      if (j.type === "create") { const r = await BGL.createAttendance("Enrollment", +j.eid, A.date, j.status); A.existing[j.eid] = { id: (r && (r.id || (r.data && r.data.id))), status: j.status }; }
      else if (j.type === "update") { await BGL.updateAttendance(j.id, j.status); A.existing[j.eid] = { id: j.id, status: j.status }; }
      else if (j.type === "delete") { await BGL.deleteAttendance(j.id); delete A.existing[j.eid]; }
      ok++; A.dirty.delete(String(j.eid));   // đã lên web -> không còn là thay đổi chờ gửi
    } catch (e) { fail++; }
  }
  CX[id].enr = null;
  A.justSaved = fail === 0; A.saving = false;
  toast(fail ? `Gửi xong: ${ok} ok, ${fail} lỗi` : `Đã lưu điểm danh ${ok} thiếu nhi ✓`, 2600);
  renderColumn(id);
  // vá cache điểm danh cả năm cho ngày này (nếu đang tải thì chờ tối đa 4s / hoặc vá khi tải xong) -> chuỗi -> thông báo
  const day = {}; Object.keys(A.existing).forEach((eid) => { if (A.existing[eid]) day[eid] = A.existing[eid].status; });
  const C = CX[id]; C.attPatch = { date: A.date, day };
  try { if (C.attAllP) await Promise.race([C.attAllP, new Promise((r) => setTimeout(r, 4000))]); } catch {}
  if (C.attAll && C.attPatch) { C.attAll.by[A.date] = day; C.attPatch = null; }
  notifyConfirm(id, A, ok, fail, before, streakMap(id));
  if ($("stuList")) paintStreaks(id);
}
window.attConfirm = attConfirm;
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
  catch (e) { const b = $("exBody"); if (b) b.innerHTML = `<div class="empty" style="padding:26px"><div class="big">⚠️</div><div>Không tạo được ảnh: ${esc(e.message || e)}</div></div>`; return; }
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
    <input id="sq" class="input" placeholder="Tên thiếu nhi / giáo lý viên…" value="${esc(q || "")}" style="margin:2px 0 14px"/>
    <div id="sres">${q ? '<div class="spin"></div>' : emptyBox("🔎", "Nhập tên để tìm")}</div>
  </div></main>`, "home");
  const inp = $("sq"); inp.focus();
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter" && inp.value.trim()) go("#/search/" + encodeURIComponent(inp.value.trim())); });
  if (!q) return;
  try {
    const res = await BGL.search(q);
    let arr = (res && (res.people || res.persons)) || (Array.isArray(res) ? res : (res && res.data) || []);
    if (!Array.isArray(arr)) arr = [];
    $("sres").innerHTML = arr.length ? `<div class="stack">${arr.map((p) => `<div class="card pad press" onclick="go('#/person/${p.id}')"><div class="row">${avatar(p, { tappable: true })}<div class="grow"><div class="nm" style="font-weight:700;font-size:${nmFs(p.name || p.full_name, 15)}px">${esc(p.name || p.full_name)}</div><div class="muted" style="font-size:12.5px">${esc(p.christian_name || "")} · ${phoneChip(p.phone, p.name || p.full_name)}</div></div><span class="list-arrow">${ic("chev", 20)}</span></div></div>`).join("")}</div>` : emptyBox("🙁", `Không thấy "${q}"`);
  } catch (e) { $("sres").innerHTML = errBox(e.message); }
}

// ============================================================
//  ROUTER
// ============================================================
function render() {
  if (!S.user) return loginScreen();
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean).map(decodeURIComponent);
  const [r, a, b, c] = parts;
  if (!r || r === "home") return homeScreen();
  if (r === "classes") return classesScreen();
  if (r === "class") return classScreen(a, b, c);
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
const landingHash = () => (S.myClassId ? `#/class/${S.myClassId}/thieunhi` : "#/home");

// ---------- Auto đồng bộ với web (~8s) — merge an toàn, không ghi đè ----------
let _poll = null;
function startPolling() { if (_poll) return; _poll = setInterval(pollTick, 8000); }
// Giữ các ô người dùng đang sửa (dirty), phần còn lại đồng bộ theo web
function mergeFromServer(A, freshEx) {
  Object.keys(A.assign).forEach((k) => { if (!A.dirty.has(k)) delete A.assign[k]; });
  Object.keys(freshEx).forEach((k) => { if (!A.dirty.has(k)) A.assign[k] = freshEx[k].status; });
  A.existing = freshEx;
}
async function pollTick() {
  try {
    if (!S.user || document.hidden) return;
    if ($("sheet") || $("fs")) return;               // đang thao tác -> bỏ qua
    const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    if (parts[0] !== "class" || !CX[parts[1]]) return;
    const id = parts[1], tab = parts[2] || "thieunhi";
    if (tab === "thieunhi") {
      const fresh = await BGL.classroomEnrollments(id);
      if (JSON.stringify(fresh) !== JSON.stringify(CX[id].enr)) { CX[id].enr = fresh; if ($("tabBody")) tabStudents(id); loadClassAttendance(id, true).then(() => paintStreaks(id)); }
    } else if (tab === "diemdanh") {
      const A = CX[id].att; if (!A || !A.loaded || A.saving) return;      // đang gửi -> không đồng bộ chen ngang
      const recs = await BGL.attendancesByClass(id, A.date);
      if (A.saving) return;
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
  } catch {}
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
function syncReload(id) { const A = CX[id].att; A.assign = {}; Object.keys(A.existing).forEach((k) => (A.assign[k] = A.existing[k].status)); A.dirty.clear(); A.syncSnooze = 0; closeSheet(); if ($("attArea")) renderColumn(id); toast("Đã tải lại dữ liệu mới nhất"); }
function syncLater(id) { const A = CX[id].att; A.syncSnooze = Date.now() + 120000; closeSheet(); if ($("attArea")) renderColumn(id); }
window.syncReload = syncReload; window.syncLater = syncLater;
async function init() {
  loading("home");
  try { S.user = await BGL.me(); await boot(); if (!location.hash || location.hash === "#/" || location.hash === "#/home") location.hash = landingHash(); render(); }
  catch { loginScreen(); }
  if (window.Capacitor?.Plugins?.App) {
    window.Capacitor.Plugins.App.addListener("backButton", () => {
      if ($("sheet")) return closeSheet();          // ưu tiên đóng sheet đang mở (kể cả khi đang quẹt)
      if ($("fs")) { const h = $("fsHost"); if (h) h.innerHTML = ""; if (S._swipeId) renderColumn(S._swipeId); S._swipeId = null; return; }
      if (location.hash && !["#/home", "#/", ""].includes(location.hash)) history.back();
      else window.Capacitor.Plugins.App.exitApp();
    });
  }
}
init();
