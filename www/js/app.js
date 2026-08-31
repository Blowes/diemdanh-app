// ============================================================
//  Ban Giáo Lý — app native (Android + iOS)
//  UX app-first: bottom nav, dashboard, điểm danh QUẸT (Tinder) + CỘT
// ============================================================
const root = document.getElementById("root");
const $ = (id) => document.getElementById(id);
const esc = (s) => (s == null ? "" : String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])));
// Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu ("tu" khớp "Tú")
const noAccent = (s) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase().trim();
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

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
// Tất cả Chúa Nhật trong niên khóa hiện tại
function academicSundays() {
  const y = S.year; if (!y || !y.start_date || !y.end_date) return [];
  const out = []; const d = new Date(y.start_date + "T00:00:00"), end = new Date(y.end_date + "T00:00:00");
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1); // Chúa Nhật đầu tiên
  while (d <= end) { out.push(toISO(d)); d.setDate(d.getDate() + 7); }
  return out;
}
// Chúa Nhật của tuần hiện tại, kẹp vào danh sách niên khóa (gần hôm nay nhất)
function defaultSunday() {
  const list = academicSundays();
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
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", dark ? "#0b1512" : "#17544a");
}
const themeMode = () => store.get("bgl-theme", "system");
applyTheme(themeMode());
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
function appbar({ title, sub, back, action } = {}) {
  return `<div class="appbar"><div class="appbar-in">
    ${back ? `<button class="back" onclick="${typeof back === "string" ? `go('${back}')` : "history.back()"}">${ic("back", 20)}</button>` : ""}
    <div style="flex:1;min-width:0">
      <h1 style="flex:none">${esc(title || "")}</h1>
      ${sub ? `<div class="muted trunc" style="font-size:12.5px;margin-top:1px">${esc(sub)}</div>` : ""}
    </div>
    ${action || ""}
  </div></div>`;
}
function bottomNav(active) {
  const items = [["home", "Trang chủ", "#/home", "home"], ["book", "Lớp học", "#/classes", "classes"], ["users", "Giáo lý viên", "#/teachers", "teachers"], ["user", "Tôi", "#/me", "me"]];
  return `<nav class="nav">${items.map(([i, l, h, k]) => `<a class="${active === k ? "on" : ""}" onclick="go('${h}')">${ic(i)}<span>${l}</span></a>`).join("")}</nav>`;
}
function paint(html, navKey) { root.innerHTML = html + (navKey !== false ? bottomNav(navKey) : ""); const m = root.querySelector("main"); if (m) m.classList.add("fade-in"); }
function screen(html, navKey) { paint(html, navKey); progDone(); }
function skelCard() { return `<div class="card pad"><div class="row"><div class="skel" style="width:46px;height:46px;border-radius:14px"></div><div class="grow"><div class="skel" style="height:11px;width:38%;margin-bottom:9px"></div><div class="skel" style="height:16px;width:66%"></div></div></div><div class="skel" style="height:58px;margin-top:14px"></div></div>`; }
function loading(navKey) { progStart(); paint(appbar({}) + `<main><div class="wrap stack">${skelCard()}${skelCard()}${skelCard()}</div></main>`, navKey); }
function haptic(ms = 12) { if (effectsOn() && navigator.vibrate) { try { navigator.vibrate(ms); } catch {} } }
function emptyBox(icon, msg, sub) { return `<div class="empty"><div class="big">${icon}</div><div style="font-weight:600;color:var(--ink)">${esc(msg)}</div>${sub ? `<div style="margin-top:6px">${esc(sub)}</div>` : ""}</div>`; }
function errBox(msg) { return `<div class="empty"><div class="big">⚠️</div><div>${esc(msg)}</div><div style="margin-top:16px"><button class="btn sm ghost" onclick="render()">Thử lại</button></div></div>`; }

// ---------- sheet ----------
function openSheet(html) { $("sheetHost").innerHTML = `<div class="sheet" id="sheet"><div class="grip"></div>${html}</div>`; requestAnimationFrame(() => { $("sheet").classList.add("on"); $("scrim").classList.add("on"); }); }
function closeSheet() { const s = $("sheet"); if (s) s.classList.remove("on"); $("scrim").classList.remove("on"); setTimeout(() => { $("sheetHost").innerHTML = ""; }, 260); }
$("scrim").addEventListener("click", closeSheet);
window.closeSheet = closeSheet; window.go = go; window.render = render;

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
      <div class="eyebrow" style="margin-top:6px">Giáo xứ · Ban Giáo Lý</div>
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
  progDone();
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
  try { await B.verifyIdentity({ reason: "Đăng nhập Ban Giáo Lý", title: "Xác thực", subtitle: "", description: "" }); $("u").value = cred.u; $("p").value = cred.p; doLogin(); }
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
  screen(appbar({ title: "Trang chủ", action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
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
    screen(appbar({ title: "Lớp học", action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
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
async function classScreen(id, tab) {
  tab = tab || "thieunhi";
  loading();
  let c;
  try { c = (CX[id] && CX[id].info) || (CX[id] = CX[id] || {}, CX[id].info = await BGL.classroom(id)); }
  catch (e) { screen(appbar({ title: "Lớp", back: "#/classes" }) + `<main>${errBox(e.message)}</main>`); return; }
  const segs = [["thieunhi", "Thiếu nhi"], ["diemdanh", "Điểm danh"], ["glv", "Giáo lý viên"]];
  const subInfo = [S.year && S.year.long_year, c.location].filter(Boolean).join(" · ");
  screen(appbar({ title: c.name, sub: subInfo, back: "#/classes" }) +
    `<main><div class="wrap">
      ${c.location ? `<div class="card pad" style="margin-bottom:14px;display:flex;align-items:center;gap:10px;padding:12px 14px"><span style="color:var(--gold-2)">📍</span><div><div class="faint" style="font-size:11.5px">Địa điểm học</div><div style="font-weight:600">${esc(c.location)}</div></div></div>` : ""}
      <div class="seg" style="margin-bottom:16px">${segs.map(([k, l]) => `<button class="${tab === k ? "on" : ""}" onclick="go('#/class/${id}/${k}')">${l}</button>`).join("")}</div>
      <div id="tabBody"><div class="spin"></div></div>
    </div></main>`, "classes");
  if (tab === "thieunhi") tabStudents(id);
  else if (tab === "diemdanh") tabAttendance(id);
  else tabTeachers(id);
}

// ---------- Tab: Thiếu nhi ----------
async function tabStudents(id) {
  try {
    const enr = CX[id].enr || (CX[id].enr = await BGL.classroomEnrollments(id));
    const counts = {}; enr.forEach((e) => (counts[e.result] = (counts[e.result] || 0) + 1));
    const summary = `<div class="statgrid" style="margin-bottom:16px">${["Đang Học", "Nghỉ Luôn", "Lên Lớp", "Học Lại", "Chuyển Xứ"].map((k) => statTile(counts[k] || 0, k, STONE[k])).join("")}</div>`;
    $("tabBody").innerHTML = summary +
      `<input id="stuQ" class="input" placeholder="🔍 Tìm tên thiếu nhi…" oninput="filterStudents('${id}',this.value)" value="${esc(CX[id].studentQ || "")}" style="margin:2px 0 14px"/>
       <div class="stack" id="stuList"></div>`;
    renderStudentList(id);
  } catch (e) { $("tabBody").innerHTML = errBox(e.message); }
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
  return `<div class="card pad">
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
    screen(appbar({ title: "Giáo lý viên", action: `<button class="act" onclick="go('#/search')">${ic("search", 20)}</button>` }) +
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
  screen(appbar({ title: "Tôi" }) + `<main><div class="wrap stack">
    <div class="card pad press" onclick="${u.person_id ? `go('#/person/${u.person_id}')` : ""}">
      <div class="row">${avatar({ id: u.person_id, name: u.person_name }, { size: 56, r: 18, fs: 20, cls: "g", tappable: true })}
        <div class="grow"><div class="disp" style="font-size:19px">${esc(u.person_name || "")}</div>
          <div class="muted" style="font-size:13px">${esc(role)} · ${esc(u.username || "")}</div></div>
        <span class="list-arrow">${ic("chev", 20)}</span></div>
    </div>

    <div class="sec-eyebrow"><span class="eyebrow">Ứng dụng</span></div>
    <button class="card pad press" style="width:100%;text-align:left" onclick="utilsSheet()">
      <div class="row"><span style="color:var(--brand-2)">${ic("gear", 22)}</span><div class="grow"><div style="font-weight:600">Tiện ích ứng dụng</div><div class="muted" style="font-size:12.5px">Cử chỉ quẹt · Sao lưu · Nhập · Debug · Xoá dữ liệu</div></div><span class="list-arrow">${ic("chev", 20)}</span></div>
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
    <div class="faint" style="text-align:center;font-size:11.5px;padding:8px">Ban Giáo Lý · v1.0</div>
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
  const d = { app: "BanGiaoLy", version: 1, exportedAt: new Date().toISOString(), userId: (S.user && S.user.id) || null, userName: (S.user && S.user.person_name) || null, photos: {}, names: {}, settings: {} };
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf("bgl-photo-") === 0 && k !== "bgl-photo-names") d.photos[k] = localStorage.getItem(k); } } catch {}
  try { d.names = JSON.parse(localStorage.getItem("bgl-photo-names") || "{}"); } catch {}
  ["bgl-gestures", "bgl-theme"].forEach((k) => { try { const v = localStorage.getItem(k); if (v != null) d.settings[k] = v; } catch {} });
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
      await Sh.share({ title: "Sao lưu Ban Giáo Lý", text: `Sao lưu ${nPhotos} ảnh + cài đặt`, url: w.uri, dialogTitle: "Lưu / gửi file sao lưu" });
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
        if (d.settings) Object.keys(d.settings).forEach((k) => { if (d.settings[k] != null) try { localStorage.setItem(k, d.settings[k]); } catch {} });
        applyTheme(themeMode());
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
        <div class="row"><span style="color:var(--brand-2)">${ic("gear", 20)}</span><div class="grow"><div style="font-weight:600">Cài đặt</div><div class="muted" style="font-size:12px">Cử chỉ quẹt + giao diện về mặc định</div></div></div>
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
  const label = { photos: "toàn bộ ẢNH học sinh", cache: "CACHE dữ liệu", cred: "TÀI KHOẢN đã lưu", settings: "CÀI ĐẶT (cử chỉ + giao diện)", all: "TẤT CẢ dữ liệu app" }[what];
  openSheet(`<h3>Xác nhận xoá</h3><p class="muted" style="margin:-6px 2px 16px;font-size:14px">Bạn chắc chắn muốn xoá <b style="color:var(--ink)">${label}</b>? Không thể hoàn tác.</p>
    <div class="pickgrid"><button class="pickbtn clear" onclick="deleteSheet()">Huỷ</button>
    <button class="pickbtn" style="grid-column:span 2;justify-content:center;color:#fff;background:var(--danger);border-color:var(--danger)" onclick="doDelete('${what}')">${ic("trash", 18)} Xoá</button></div>`);
}
function doDelete(what) {
  try {
    if (what === "photos" || what === "all") { photoKeys().forEach((k) => localStorage.removeItem(k)); localStorage.removeItem("bgl-photo-names"); }
    if (what === "cache") { /* CX là bộ nhớ tạm trong RAM */ }
    if (what === "cred" || what === "all") localStorage.removeItem("bgl-cred");
    if (what === "settings" || what === "all") { localStorage.removeItem("bgl-gestures"); localStorage.removeItem("bgl-theme"); }
    if (what === "all") { localStorage.removeItem("bgl-debug"); }
  } catch {}
  for (const k in CX) delete CX[k];   // xoá cache RAM
  if (what === "settings" || what === "all") applyTheme(themeMode());
  closeSheet(); toast("Đã xoá xong");
  if (what === "all") { S.user && meScreen(); }
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
  const A = (CX[id].att = CX[id].att || { date: defaultSunday(), assign: {}, existing: {}, dirty: new Set(), idx: 0, loaded: false, undo: [], prompted: false });
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
  if (!A.prompted && !isSundayToday()) { A.prompted = true; notSundayPrompt(id); }
}
window.tabAttendance = tabAttendance;

function setAttDate(id, date) {
  const A = CX[id].att; A.date = date; A.loaded = false; A.assign = {}; A.existing = {}; A.dirty = new Set(); A.idx = 0; A.undo = [];
  const lbl = $("adateLbl"); if (lbl) lbl.innerHTML = `${weekdayVN(date)}, ${fmtDate(date)}`;
  const area = $("attArea"); if (area) area.innerHTML = `<div class="spin"></div>`;
  loadAtt(id).then(() => renderColumn(id));
}
function sundaySheet(id) {
  const A = CX[id].att, list = academicSundays();
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
  A.idx = 0; A.undo = []; A.dirty = new Set(); A.syncSnooze = 0; A.loaded = true;
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
  const rows = A.enr.map((e) => {
    const p = e.person || {}, cur = A.assign[e.id] || "";
    return `<button class="rev-row" style="width:100%;text-align:left;background:none" onclick="statusPicker('${id}',${e.id})">
      ${avatar(p, { size: 42, r: 12, fs: 14, tappable: true })}
      <div class="grow"><div class="nm" style="font-weight:600;font-size:${nmFs(p.name || p.full_name, 15)}px">${esc(p.name || p.full_name)}</div><div class="faint" style="font-size:12px">${esc(p.christian_name || "")}</div></div>
      <span class="chip ${cur ? stCls(cur) : "st-none"}">${cur ? '<span class="dot"></span>' : ""}${cur || "Chưa điểm"}</span>
      <span class="list-arrow">${ic("chev", 18)}</span>
    </button>`;
  }).join("");
  const swipeCta = `<button class="btn press" style="margin-bottom:14px" onclick="openSwipeFull('${id}')">${ic("swipe", 18)} Quẹt để điểm danh nhanh</button>`;
  area.innerHTML = swipeCta + summary + `<div class="card divlist" style="overflow:hidden">${rows}</div><div style="height:84px"></div>` +
    `<div class="confirmbar"><button class="btn gold" id="confirmBtn" onclick="attConfirm('${id}')">${ic("check", 18)} Xác nhận (${changeCount(A)})</button></div>`;
}
window.renderColumn = renderColumn;

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
  const btn = $("confirmBtn"); btn.disabled = true;
  let ok = 0, fail = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i]; btn.innerHTML = `<span class="spin" style="width:18px;height:18px;margin:0;border-width:2px"></span> Đang gửi ${i + 1}/${jobs.length}`;
    try {
      if (j.type === "create") { const r = await BGL.createAttendance("Enrollment", +j.eid, A.date, j.status); A.existing[j.eid] = { id: (r && (r.id || (r.data && r.data.id))), status: j.status }; }
      else if (j.type === "update") { await BGL.updateAttendance(j.id, j.status); A.existing[j.eid] = { id: j.id, status: j.status }; }
      else if (j.type === "delete") { await BGL.deleteAttendance(j.id); delete A.existing[j.eid]; }
      ok++;
    } catch (e) { fail++; }
  }
  CX[id].enr = null;
  toast(fail ? `Gửi xong: ${ok} ok, ${fail} lỗi` : `Đã lưu điểm danh ${ok} thiếu nhi ✓`, 2600);
  renderColumn(id);
}
window.attConfirm = attConfirm;


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
  const [r, a, b] = parts;
  if (!r || r === "home") return homeScreen();
  if (r === "classes") return classesScreen();
  if (r === "class") return classScreen(a, b);
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
  try {
    const t = await BGL.teachingByPerson((S.user || {}).person_id);
    S.myAssignments = t.filter((x) => x.classroom && x.classroom.year === (S.year && S.year.year));
    S.myClassId = S.myAssignments[0] && S.myAssignments[0].classroom && S.myAssignments[0].classroom.id;
  } catch { S.myAssignments = []; S.myClassId = null; }
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
      if (JSON.stringify(fresh) !== JSON.stringify(CX[id].enr)) { CX[id].enr = fresh; if ($("tabBody")) tabStudents(id); }
    } else if (tab === "diemdanh") {
      const A = CX[id].att; if (!A || !A.loaded) return;
      const recs = await BGL.attendancesByClass(id, A.date);
      const freshEx = {}; recs.forEach((r) => { freshEx[r.attendable_id] = { id: r.id, status: r.status }; });
      if (JSON.stringify(freshEx) === JSON.stringify(A.existing)) return;   // không đổi
      const hadDirty = A.dirty.size > 0;
      mergeFromServer(A, freshEx);                    // luôn merge để Xác nhận không ghi đè web
      if (!hadDirty) { if ($("attArea")) renderColumn(id); }                // rảnh -> reload luôn
      else if (!(A.syncSnooze && Date.now() < A.syncSnooze)) syncPrompt(id); // đang làm dở -> hỏi
      else if ($("attArea")) renderColumn(id);
    }
  } catch {}
}
function syncPrompt(id) {
  openSheet(`<h3>Web vừa có thay đổi</h3>
    <p class="muted" style="margin:-6px 2px 16px;font-size:14px">Dữ liệu điểm danh trên web vừa được cập nhật. Bạn đang có thay đổi chưa lưu — tải lại để nhận thông tin mới nhất, hoặc để sau để tiếp tục.</p>
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
