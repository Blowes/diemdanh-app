// ============================================================
//  IN / XUẤT LỚP — menu ⋮ ở màn hình lớp, giống trang lớp trên web (bglmautam.com/classrooms/<id>)
//  Web mở PDF để IN; app tải PDF rồi lưu MỖI TRANG thành 1 ảnh vào Thư viện (album "Điểm Danh").
//  Excel không thành ảnh được → lưu .xlsx vào Tải xuống/Điểm Danh + nút chia sẻ.
//  Native: plugin Android PdfGallery (PdfGalleryPlugin.java). iOS / web: chỉ báo chưa hỗ trợ.
//  Dùng từ app.js: CX, S, $, openSheet, closeSheet, toast, ic, esc, slug, haptic, setRow, blobToBase64, classYearRange
//  index.html: nạp SAU api.js, TRƯỚC app.js (init() của app.js có thể vẽ màn hình lớp ngay) — file này chỉ dùng
//  biến của app.js khi được gọi, không dùng lúc nạp.
// ============================================================
(function () {
  "use strict";
  const ALBUM = "Điểm Danh";
  const ACC_PDF = "application/pdf", ACC_XLSX = "application/xlsx";   // web gửi đúng "application/xlsx" (không chuẩn) — giữ nguyên
  const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  const plugin = () => window.Capacitor?.Plugins?.PdfGallery;
  const platform = () => (window.Capacitor?.getPlatform && window.Capacitor.getPlatform()) || "web";
  const p2 = (n) => String(n).padStart(2, "0");
  const sid = (id) => String(id == null ? "" : id).replace(/[^\w-]/g, "");   // id lớp an toàn trong onclick / URL
  const info = (id) => (CX[id] && CX[id].info) || {};
  // [đường dẫn, nhãn, tiền tố tên ảnh, chỉ Ban Điều Hành]
  const PDFS = {
    students: ["students_pdf", "In Danh Sách", "danh-sach"],
    personal: ["personal_details_pdf", "In Sơ Yếu Lý Lịch", "so-yeu-ly-lich"],
    posting: ["posting_list_pdf", "In DS Dán Bảng", "ds-dan-bang", true],
    contacts: ["teachers_contact_pdf", "In SĐT GLV", "sdt-glv", true],
  };

  // ---------- quyền: giống web (Ban Điều Hành, hoặc GLV có trong phân công của lớp) ----------
  const isAdmin = (u) => !!(u && (u.admin || u.supervisor || u.super_admin));
  function canEdit(id) {
    const u = S.user, X = CX[id] || {}, c = X.info || {};
    if (!u) return false;
    if (isAdmin(u)) return true;
    if (X.limited || u.person_id == null) return false;   // lớp bị 403 chi tiết → không phải lớp mình
    const me = (p) => p != null && String(p) === String(u.person_id);
    const tas = [].concat(c.teaching_assignments_overview || [], X.teachers || []);
    if (tas.some((t) => t && me(t.person ? t.person.id : t.person_id))) return true;
    return (S.myAssignments || []).some((a) => a && String(a.classroom_id != null ? a.classroom_id : (a.classroom || {}).id) === String(id));
  }

  // ---------- GET nhị phân (PDF / xlsx) ----------
  // Giống req() của api.js: cùng API_BASE, X-Api-Client-Key, cookie đăng nhập (CapacitorHttp + CapacitorCookies);
  // 401 → POST v1/auth/refresh 1 lần rồi thử lại. Đọc Blob, KHÔNG đọc text/JSON (làm hỏng dữ liệu nhị phân).
  async function getBinary(path, accept, _retried) {
    const B = window.BGL || {}, url = /^https?:/.test(path) ? path : `${B.API_BASE}/${String(path).replace(/^\//, "")}`, t0 = Date.now();
    const log = (status, err, size) => { try { if (typeof window.dbgLog === "function") window.dbgLog({ t: new Date().toISOString(), method: "GET", url, status, ms: Date.now() - t0, req: null, res: size != null ? `<${accept} · ${size} byte>` : null, err }); } catch {} };
    let res;
    try { res = await fetch(url, { method: "GET", credentials: "include", headers: { Accept: accept, "X-Api-Client-Key": B.CLIENT_KEY } }); }
    catch (e) { log(0, "Network: " + ((e && e.message) || e)); const er = new Error("Failed to fetch"); er.status = 0; throw er; }
    if (res.status === 401 && !_retried) {
      log(401, "401 -> thử refresh token");
      let r = null;
      try { r = await fetch(`${B.API_BASE}/v1/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-Api-Client-Key": B.CLIENT_KEY } }); } catch {}
      if (r && r.ok) return getBinary(path, accept, true);
    }
    if (!res.ok) {
      let msg = "";
      try { const t = await res.text(); try { const j = JSON.parse(t); msg = j && typeof j.error === "string" ? j.error : ""; } catch {} } catch {}
      log(res.status, msg || `Lỗi ${res.status}`);
      const e = new Error(msg || `Lỗi ${res.status}`); e.status = res.status; throw e;
    }
    const blob = await res.blob(); log(res.status, null, blob.size);
    if (!blob.size) { const e = new Error("Máy chủ trả về file rỗng"); e.status = res.status; throw e; }
    return blob;
  }
  // "chữ ký" file từ đầu chuỗi base64 (không giải mã cả file)
  const b64head = (b64, n) => { try { return atob(String(b64 || "").slice(0, Math.ceil(n / 3) * 4)); } catch { return ""; } };
  const looksPdf = (b64) => b64head(b64, 1024).includes("%PDF");   // chuẩn PDF cho phép rác trước header
  const looksZip = (b64) => b64head(b64, 4).startsWith("PK");      // .xlsx = file zip
  function errText(e) {
    const s = e && e.status, m = (e && e.message) || "";
    if (s === 403 || m === "Forbidden") return "Tài khoản của bạn không có quyền in / xuất mục này của lớp.";
    if (s === 401) return "Phiên đăng nhập đã hết — đăng xuất rồi đăng nhập lại.";
    if (s === 404) return "Máy chủ không có bảng này cho lớp.";
    if (s === 0 || /Failed to fetch|Network/i.test(m)) return "Không kết nối được máy chủ — kiểm tra mạng.";
    if (s >= 500) return `Máy chủ đang lỗi (${s}) — thử lại sau.`;
    return m || "Lỗi không rõ";
  }

  // ---------- tháng / Chúa Nhật (giống hộp "In Bảng Điểm Danh" của web) ----------
  // 9 tháng của năm học: 9–12 năm của lớp + 1–5 năm sau
  function schoolMonths(year) { const Y = Number(year), out = []; for (let m = 8; m <= 11; m++) out.push({ y: Y, m }); for (let m = 0; m <= 4; m++) out.push({ y: Y + 1, m }); return out; }
  // mặc định: tháng cuối cùng đã bắt đầu (trước tháng 9 → tháng 9; sau tháng 5 → tháng 5)
  function defaultMonth(months, today) { const t = today || new Date(); let d = months[0]; for (const x of months) if (new Date(x.y, x.m, 1) <= t) d = x; return d; }
  function sundays(y, m) { const out = [], d = new Date(y, m, 1); d.setDate(1 + ((7 - d.getDay()) % 7)); while (d.getMonth() === m) { out.push(new Date(d)); d.setDate(d.getDate() + 7); } return out; }
  function schoolYear(c) { const y = Number(c && c.year); return Number.isFinite(y) && y > 1900 ? y : classYearRange(c).year; }
  function attendanceQuery(y, m) {
    const cols = sundays(y, m).flatMap((d) => [`Lễ ${p2(d.getDate())}.${p2(m + 1)}`, `Lớp ${p2(d.getDate())}.${p2(m + 1)}`]);
    return new URLSearchParams({ title: `Điểm Danh Tháng ${p2(m + 1)}.${y}`, page_layout: "portrait", columns: cols.join(","), current_students_only: true }).toString();
  }
  function customQuery(title, layout, cols) { return new URLSearchParams({ title, page_layout: layout === "landscape" ? "landscape" : "portrait", columns: cols.join(",") }).toString(); }
  // máy chủ nhận các cột nối bằng "," → "Ký tên, Ghi chú" là 2 cột
  const splitCols = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
  function stamp(d) { d = d || new Date(); return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`; }
  const fileBase = (kind, name, d) => `${kind}-${slug(name || "")}-${stamp(d)}`;

  // ---------- nền tảng ----------
  function supported() {
    if (plugin()) return true;
    toast(platform() === "ios" ? "Bản iPhone chưa hỗ trợ lưu bảng in thành ảnh — dùng app Android hoặc in trên web bglmautam.com" : "Chức năng này chỉ có trong app Android", 3800);
    return false;
  }

  // ---------- sheet tiến trình / kết quả ----------
  let busy = false, lastShare = null;
  function progSheet(title, msg) {
    openSheet(`<h3>${esc(title)}</h3><div id="cexBody">
      <div class="spin" style="margin:24px auto 14px"></div>
      <div class="progress" style="margin:4px 2px 10px"><i id="cexBar" style="width:6%"></i></div>
      <p class="muted" id="cexMsg" style="text-align:center;margin:0 0 10px;font-size:13.5px">${esc(msg)}</p>
      <p class="muted" style="text-align:center;margin:0 0 8px;font-size:12px">Giữ app mở trong lúc tạo.</p></div>`);
    return $("sheet");
  }
  const alive = (sh) => !!(sh && $("sheet") === sh && !sh.dataset.closing && $("cexBody"));
  function step(sh, msg, frac) { if (!alive(sh)) return; const m = $("cexMsg"), b = $("cexBar"); if (m) m.textContent = msg; if (b && frac != null) b.style.width = Math.max(6, Math.min(100, Math.round(frac * 100))) + "%"; }
  function result(sh, ok, title, sub, extra) {
    if (!alive(sh)) { toast(title + (sub ? " · " + sub : ""), 3600); return; }   // đã đóng sheet → chỉ báo toast
    $("cexBody").innerHTML = `<div class="empty" style="padding:10px 10px 20px"><div class="big" style="color:${ok ? "var(--present-t)" : "var(--unexcused-t)"}">${ic(ok ? "check" : "warn", 44)}</div>
      <div style="font-weight:600;color:var(--ink);font-size:15.5px;line-height:1.4">${esc(title)}</div>${sub ? `<div style="margin-top:8px;font-size:13.5px;line-height:1.55">${esc(sub)}</div>` : ""}</div>
      ${extra || ""}<button class="btn ghost" style="margin-top:${extra ? 10 : 0}px" onclick="closeSheet()">${ok ? "Xong" : "Đóng"}</button>`;
  }

  // ---------- PDF → ảnh trong Thư viện ----------
  async function savePdf(path, title, base) {
    if (!supported()) return;
    if (busy) return toast("Đang tạo bảng khác, vui lòng đợi…");
    busy = true;
    const P = plugin(), sh = progSheet(title, "Đang tải bảng từ máy chủ…");
    let h = null;
    try {
      const blob = await getBinary(path, ACC_PDF);
      step(sh, "Đang chuẩn bị ảnh…", 0.12);
      const base64 = await blobToBase64(blob);
      if (!looksPdf(base64)) throw new Error("Máy chủ không trả về file PDF");
      try { h = await Promise.resolve(P.addListener("progress", (e) => { if (e && e.total) step(sh, `Đang lưu ảnh trang ${e.page}/${e.total}…`, 0.15 + 0.85 * (e.page / e.total)); })); } catch {}
      const r = await P.pdfToGallery({ base64, baseName: base, album: ALBUM });
      const n = (r && r.pages) || 0; haptic();
      result(sh, true, `Đã lưu ${n} ảnh vào Thư viện`, `Album “${ALBUM}”${n > 1 ? " · mỗi trang 1 ảnh" : ""} — mở ứng dụng Ảnh để xem hoặc gửi.`);
    } catch (e) { result(sh, false, "Không lưu được", errText(e)); }
    finally { busy = false; try { if (h && h.remove) Promise.resolve(h.remove()).catch(() => {}); } catch {} }
  }
  function pdf(id, kind) {
    const k = PDFS[kind]; id = sid(id); if (!k || (k[3] && !isAdmin(S.user))) return;
    return savePdf(`v1/classrooms/${id}/${k[0]}`, k[1].replace(/^In /, ""), fileBase(k[2], info(id).name));
  }

  // ---------- Excel → Tải xuống + chia sẻ ----------
  async function saveXlsx(id) {
    id = sid(id); if (!supported()) return;
    if (busy) return toast("Đang tạo bảng khác, vui lòng đợi…");
    busy = true;
    const sh = progSheet("Xuất Excel", "Đang tải file từ máy chủ…");
    try {
      const blob = await getBinary(`v1/classrooms/${id}/students_xlsx`, ACC_XLSX);
      step(sh, "Đang lưu vào Tải xuống…", 0.6);
      const base64 = await blobToBase64(blob);
      if (!looksZip(base64)) throw new Error("Máy chủ không trả về file Excel");
      const r = await plugin().saveFile({ base64, fileName: fileBase("danh-sach", info(id).name) + ".xlsx", mime: XLSX_MIME, album: ALBUM });
      lastShare = (r && r.shareName) || null; haptic();
      result(sh, true, "Đã lưu file Excel", `Tải xuống › ${ALBUM} › ${(r && r.fileName) || ""}`, lastShare ? `<button class="btn" onclick="ClassExport.shareLast()">${ic("share", 18)} Chia sẻ / gửi file</button>` : "");
    } catch (e) { result(sh, false, "Không xuất được Excel", errText(e)); }
    finally { busy = false; }
  }
  async function shareLast() {
    const P = plugin(); if (!lastShare || !P) return toast("Chưa có file để chia sẻ");
    try { await P.shareFile({ fileName: lastShare, mime: XLSX_MIME, title: "Gửi file Excel" }); }
    catch (e) { toast("Không chia sẻ được: " + errText(e), 3000); }
  }

  // ---------- In Bảng Điểm Danh: chọn tháng ----------
  function monthSheet(id) {
    id = sid(id);
    const months = schoolMonths(schoolYear(info(id))), def = defaultMonth(months, new Date()), val = (x) => `${x.y}-${p2(x.m + 1)}`;
    openSheet(`<h3>In Bảng Điểm Danh</h3>
      <p class="muted" style="margin:-6px 2px 14px;font-size:13.5px;line-height:1.5">Bảng có cột Lễ &amp; Lớp cho mọi Chúa Nhật trong tháng, chỉ thiếu nhi đang học. Lưu thành ảnh vào Thư viện.</p>
      <div class="field"><label>Tháng</label><select class="input" id="cexMonth" onchange="ClassExport._monthHint()">${months.map((x) => `<option value="${val(x)}"${val(x) === val(def) ? " selected" : ""}>${p2(x.m + 1)}-${x.y}</option>`).join("")}</select></div>
      <div class="muted" id="cexSun" style="font-size:12.5px;margin:8px 8px 0;line-height:1.5"></div>
      <div class="row" style="gap:10px;margin-top:18px"><button class="btn ghost" style="flex:1" onclick="closeSheet()">Hủy</button><button class="btn" style="flex:1" onclick="ClassExport._monthGo('${id}')">${ic("image", 18)} Tạo ảnh</button></div>`);
    monthHint();
  }
  function pickedMonth() { const v = ($("cexMonth") || {}).value || "", m = v.match(/^(\d{4})-(\d{2})$/); return m ? { y: +m[1], m: +m[2] - 1 } : null; }
  function monthHint() { const el = $("cexSun"), x = pickedMonth(); if (!el || !x) return; const s = sundays(x.y, x.m); el.textContent = `${s.length} Chúa Nhật: ${s.map((d) => `${p2(d.getDate())}.${p2(x.m + 1)}`).join(" · ")}`; }
  function monthGo(id) {
    id = sid(id); const x = pickedMonth(); if (!x) return toast("Chọn tháng");
    return savePdf(`v1/classrooms/${id}/classroom_custom_export?${attendanceQuery(x.y, x.m)}`, `Điểm Danh Tháng ${p2(x.m + 1)}.${x.y}`, fileBase(`diem-danh-thang-${p2(x.m + 1)}-${x.y}`, info(id).name));
  }

  // ---------- In Bảng Tự Tạo: tiêu đề + cột tự đặt + chiều giấy ----------
  const CUS = { title: "", layout: "portrait", cols: [] };   // nhớ trong phiên cho đỡ gõ lại
  function customSheet(id) {
    id = sid(id);
    openSheet(`<h3>In Bảng Tự Tạo</h3>
      <p class="muted" style="margin:-6px 2px 14px;font-size:13.5px;line-height:1.5">Danh sách thiếu nhi của lớp kèm các cột trống bạn tự đặt tên (vd. Ký tên, Ghi chú). Lưu thành ảnh vào Thư viện.</p>
      <div class="field"><label>Tiêu Đề *</label><input class="input" id="cexTitle" maxlength="150" placeholder="VD: Danh sách nhận quà Giáng Sinh" value="${esc(CUS.title)}" oninput="ClassExport._cus('title',this.value)"/></div>
      <div class="field" style="margin-top:12px"><label>Thêm Cột</label>
        <div class="row" style="gap:8px"><input class="input" id="cexCol" maxlength="80" autocomplete="off" enterkeyhint="done" placeholder="Nhập tên cột rồi nhấn Enter" onkeydown="if(event.key==='Enter'||event.keyCode===13){event.preventDefault();ClassExport._colAdd()}" oninput="ClassExport._cusPaint()"/><button class="btn sm" id="cexAdd" style="flex:none" aria-label="Thêm cột" onclick="ClassExport._colAdd()">${ic("plus", 18)}</button></div></div>
      <div class="cex-chips" id="cexChips"></div>
      <div class="eyebrow" style="margin:16px 2px 8px">Chiều Giấy</div>
      <div class="pickgrid" id="cexLay"></div>
      <div class="row" style="gap:10px;margin-top:18px"><button class="btn ghost" style="flex:1" onclick="closeSheet()">Hủy</button><button class="btn" id="cexGo" style="flex:1" onclick="ClassExport._cusGo('${id}')">${ic("image", 18)} Tạo ảnh</button></div>`);
    cusPaint();
  }
  function cusPaint() {
    const chips = $("cexChips"), lay = $("cexLay"), go = $("cexGo"), add = $("cexAdd"), inp = $("cexCol"), typing = !!(inp && inp.value.trim());
    if (chips) chips.innerHTML = CUS.cols.length ? CUS.cols.map((c, i) => `<span class="chip cex-chip">${esc(c)}<button aria-label="Xoá cột" onclick="ClassExport._colDel(${i})">${ic("x", 14)}</button></span>`).join("") : `<span class="muted" style="font-size:12.5px;margin-left:4px">Chưa có cột nào</span>`;
    if (lay) lay.innerHTML = [["portrait", "Khổ Dọc"], ["landscape", "Khổ Ngang"]].map(([v, l]) => `<button class="pickbtn ${CUS.layout === v ? "on" : ""}" style="justify-content:center" onclick="ClassExport._cus('layout','${v}')">${l}</button>`).join("");
    if (add) add.disabled = !typing;
    if (go) go.disabled = !CUS.title.trim() || (!CUS.cols.length && !typing);
  }
  function setCus(k, v) { if (k === "title") CUS.title = String(v || ""); else if (k === "layout") CUS.layout = v === "landscape" ? "landscape" : "portrait"; cusPaint(); }
  function colAdd() { const inp = $("cexCol"); if (!inp) return; const add = splitCols(inp.value); if (!add.length) return; add.forEach((c) => { if (!CUS.cols.includes(c)) CUS.cols.push(c); }); inp.value = ""; cusPaint(); try { inp.focus(); } catch {} }
  function colDel(i) { CUS.cols.splice(i, 1); cusPaint(); }
  function cusGo(id) {
    id = sid(id);
    const inp = $("cexCol"); if (inp && inp.value.trim()) colAdd();   // cột đang gõ dở chưa nhấn Enter → thêm luôn
    const title = CUS.title.trim();
    if (!title) return toast("Nhập Tiêu Đề");
    if (!CUS.cols.length) return toast("Thêm ít nhất 1 cột");
    return savePdf(`v1/classrooms/${id}/classroom_custom_export?${customQuery(title, CUS.layout, CUS.cols)}`, title, fileBase(slug(title), info(id).name));
  }

  // ---------- menu ⋮ ----------
  const DOTS = `<svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`;
  // nút trên appbar màn hình lớp — chỉ hiện khi được in / xuất
  function menuBtn(id) { return canEdit(sid(id)) ? `<button class="act" aria-label="In / Xuất bảng" onclick="ClassExport.menu('${sid(id)}')">${DOTS}</button>` : ""; }
  function menu(id) {
    id = sid(id); if (!supported()) return;
    if (!canEdit(id)) return toast("Chỉ GLV phụ trách lớp hoặc Ban Điều Hành mới in / xuất bảng của lớp", 3200);
    const c = info(id), row = (icon, t, sub, fn) => setRow(icon, t, sub, `ClassExport.${fn}`, false, "10px");
    openSheet(`<h3>In / Xuất bảng</h3>
      <p class="muted" style="margin:-6px 2px 14px;font-size:13.5px;line-height:1.5">${c.name ? esc(c.name) + " · " : ""}Bảng in được lưu thành <b style="color:var(--ink)">ảnh</b> vào Thư viện (album ${ALBUM}), mỗi trang 1 ảnh.</p>
      ${row("users", "In Danh Sách", "Danh sách thiếu nhi của lớp", `pdf('${id}','students')`)}
      ${row("user", "In Sơ Yếu Lý Lịch", "Lý lịch từng thiếu nhi", `pdf('${id}','personal')`)}
      ${row("cal", "In Bảng Điểm Danh", "Chọn tháng · cột Lễ / Lớp mỗi Chúa Nhật", `monthSheet('${id}')`)}
      ${row("edit", "In Bảng Tự Tạo", "Tự đặt tiêu đề, cột &amp; chiều giấy", `customSheet('${id}')`)}
      ${row("download", "Xuất Excel", "File .xlsx vào Tải xuống · chia sẻ được", `xlsx('${id}')`)}
      ${isAdmin(S.user) ? `<div class="eyebrow" style="margin:16px 2px 10px">Ban Điều Hành</div>${row("pin", "In DS Dán Bảng", "Danh sách để dán bảng", `pdf('${id}','posting')`)}${row("phone", "In SĐT GLV", "Số điện thoại GLV của lớp", `pdf('${id}','contacts')`)}` : ""}`);
  }

  try {
    const st = document.createElement("style");
    st.textContent = ".cex-chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 2px 0}.cex-chip{background:var(--fill);color:var(--ink);padding:4px 4px 4px 12px;font-size:13px;white-space:normal;line-height:1.3}.cex-chip button{border:0;background:transparent;color:var(--ink-soft);width:26px;height:26px;border-radius:50%;display:grid;place-items:center;padding:0;cursor:pointer}.cex-chip button:active{background:var(--fill-2)}#cexAdd:disabled,#cexGo:disabled{opacity:.45}";
    document.head.appendChild(st);
  } catch {}

  window.ClassExport = {
    menu, menuBtn, canEdit, pdf, xlsx: saveXlsx, monthSheet, customSheet, shareLast,
    _monthHint: monthHint, _monthGo: monthGo, _cus: setCus, _cusPaint: cusPaint, _colAdd: colAdd, _colDel: colDel, _cusGo: cusGo,
    _t: { schoolMonths, defaultMonth, sundays, schoolYear, attendanceQuery, customQuery, splitCols, getBinary, looksPdf, looksZip, errText, isAdmin, fileBase, stamp, CUS, PDFS },
  };
})();
