// ============================================================
//  HỌC SINH — tất cả thiếu nhi của niên khóa hiện tại (tab "Học sinh", route #/students)
//  Nạp SAU app.js, dùng thẳng biến toàn cục của app.js (S, BGL, TabLoad, tabScreen, screen, appbar, avatar…).
//  Bọc IIFE: tên hàm trong này không đụng app.js (app.js đã có filterStudents, studentCard, renderStudentList…).
//  Ra ngoài: window.studentsScreen · window.resetStudents · các onclick stuFilter / stuGroup / stuRetry.
// ============================================================
(function () {
  "use strict";
  // ---------- hằng số ----------
  const PER = 250, MAX_PAGES = 40;          // 1 trang 250 em · trần 40 trang (10.000 em) để vòng lật trang luôn dừng
  const CONC_PAGES = 3, CONC_CLASSES = 4;   // số request chạy song song (lật trang / tải từng lớp)
  const SHORT = 0.9;                        // ít hơn 90% số dự kiến (tổng enrollments_overview các lớp xem được) = thiếu -> tải theo lớp
  const FIRST = 150, CHUNK = 150;           // vẽ dần: 150 em đầu, cuộn gần cuối thì thêm 150
  const PREF_KEY = "bgl-stu-src", PREF_MS = 3 * 864e5;   // nhớ 3 ngày: tài khoản này phải tải theo lớp (khỏi thử lại API cả năm)
  // nhóm khối lớp (theo tên lớp, như màu khăn) · class khi chip đang chọn
  const GROUPS = [["pink", "st-pink"], ["green", "st-present"], ["blue", "st-excused"], ["gold", "st-late"], ["", "st-quit"]]
    .map(([k, cls]) => ({ k, cls, label: k ? CLASS_THEME_NAMES[k] : "Khác" }));
  const GORD = { pink: 0, green: 1, blue: 2, gold: 3, "": 4 };
  const KEEP_REASONS = { forbidden: 1, empty: 1, noperson: 1, short: 1 };   // lý do bền (quyền / dữ liệu) — lỗi mạng thì không nhớ
  const COLL = (() => { try { return new Intl.Collator("vi", { sensitivity: "base", numeric: true }); } catch { return null; } })();
  const cmp = (a, b) => (COLL ? COLL.compare(a || "", b || "") : String(a || "").localeCompare(String(b || "")));

  // ---------- niên khóa ----------
  const curYear = () => { const y = S.year && Number(S.year.year); return y > 0 ? y : classYearRange(null).year; };
  const longYearOf = (y) => (S.year && Number(S.year.year) === y && S.year.long_year) || `${y} - ${y + 1}`;

  // ---------- chuẩn hoá 2 kiểu dữ liệu về 1 dạng ----------
  // (a) GET v1/enrollments?filters[classroom_year_eq]=… : { id, result, person{…}, classroom{id,name,…} }
  // (b) GET v1/classrooms/:id/enrollments                 : { id, result, person{…}, (classroom) } — lớp lấy từ vòng tải
  // -> { id, pid, cid, name, cn, birth, gender, result, cname, g (nhóm khối), p (person gốc để rememberPerson) }
  const personOf = (e) => (e && e.person && typeof e.person === "object" ? e.person : null);
  const pidOf = (e, p) => (p && p.id != null ? p.id : p && p.person_id != null ? p.person_id : e && e.person_id != null ? e.person_id : null);
  const roomOf = (e) => (e && e.classroom && typeof e.classroom === "object" ? e.classroom : null);
  const cidOf = (e) => { const k = roomOf(e); return k && k.id != null ? k.id : e && e.classroom_id != null ? e.classroom_id : null; };
  // dòng của API cả năm dùng được: có person lồng (id + tên) và biết lớp
  const usable = (e) => { const p = personOf(e); return !!(p && pidOf(e, p) != null && (p.name || p.full_name) && cidOf(e) != null); };
  function norm(e, c) {
    if (!e || typeof e !== "object") return null;
    const p = personOf(e), pid = pidOf(e, p); if (pid == null) return null;
    const k = roomOf(e) || {}, cid = c && c.id != null ? c.id : cidOf(e);
    const cname = String((c && c.name) || k.name || ""), fam = (c && c.family) || k.family || "";
    return {
      id: e.id != null ? e.id : null, pid, cid: cid != null ? cid : null,
      name: String((p && (p.name || p.full_name)) || ""), cn: String((p && p.christian_name) || ""),
      birth: (p && p.birth_date) || "", gender: (p && p.gender) || "", result: String(e.result || ""),
      cname, g: classThemeKey({ family: fam, name: cname }),
      p: p && p.id != null ? p : Object.assign({}, p || {}, { id: pid }),
    };
  }
  const keyOf = (r) => (r.id != null ? "e" + r.id : "p" + r.pid + "c" + r.cid);   // trùng: cùng enrollment (hoặc cùng người + lớp)
  function collect(map, rows, c, look) {
    let added = 0;
    (Array.isArray(rows) ? rows : []).forEach((e) => { const r = norm(e, c || (look && look(e))); if (!r) return; const k = keyOf(r); if (!map.has(k)) { map.set(k, r); added++; } });
    return added;
  }
  // thứ tự: khối (Khai Tâm → Bao Đồng → khác) · tên lớp (số tự nhiên) · trong lớp theo TÊN (chữ cuối) rồi họ tên
  const given = (n) => { const w = String(n || "").trim().split(/\s+/); return w[w.length - 1] || ""; };
  function sortRows(rows) {
    const gk = new Map(rows.map((r) => [r, given(r.name)]));
    return rows.sort((a, b) => ((GORD[a.g] ?? 4) - (GORD[b.g] ?? 4)) || cmp(a.cname, b.cname) || String(a.cid).localeCompare(String(b.cid))
      || cmp(gk.get(a), gk.get(b)) || cmp(a.name, b.name) || keyOf(a).localeCompare(keyOf(b)));
  }
  // số em dự kiến = tổng enrollments_overview của các lớp được xem · null: lớp không kèm số liệu -> không đoán
  function expectedOf(classes) {
    if (!Array.isArray(classes)) return null;
    let n = 0, any = false;
    classes.forEach((c) => { if (!c || c.can_view === false) return; const ov = c.enrollments_overview; if (ov && typeof ov === "object") { any = true; for (const k in ov) n += Number(ov[k]) || 0; } });
    return any ? n : null;
  }
  async function pool(items, n, fn) {
    let i = 0;
    const worker = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  }
  const prefOn = (y) => { const v = store.get(PREF_KEY, null), u = S.user && S.user.id; return !!(v && u != null && v.u === u && v.y === y && Date.now() - (Number(v.at) || 0) < PREF_MS); };
  const prefSet = (y) => { const u = S.user && S.user.id; if (u != null) store.set(PREF_KEY, { u, y, at: Date.now() }); };

  // ---------- TẢI: 1 API cả năm (có phân trang) · không được thì TỰ tải từng lớp ----------
  // Tải theo lớp khi API cả năm: lỗi (403…) / rỗng mà lớp có em / thiếu person lồng / ít hẳn số dự kiến.
  // prog(xong, tổng) của TabLoad: % thật = số em đã tải / tổng (meta) — hoặc số lớp xong / tổng lớp.
  async function fetchStudents(prog) {
    const year = curYear(), g0 = TabLoad.gen;
    const chk = () => { if (TabLoad.gen !== g0) { const e = new Error("Đã huỷ"); e.cancelled = true; throw e; } };   // đăng xuất giữa chừng -> thôi gọi tiếp
    let at = 0;
    // frac: phần đã xong (0..1) · step: cỡ bước đang chạy (TabLoad cho % nhích dần trong bước) -> prog(frac/step, 1/step)
    const report = (frac, step) => { at = Math.max(at, Math.min(1, frac || 0)); step = Math.max(0.002, Math.min(1, step || 0.1)); if (typeof prog === "function") prog(at / step, 1 / step); };
    const meta = { source: "paged", reason: "", year, longYear: longYearOf(year), skippedClasses: 0, failedClasses: 0, classCount: 0, truncated: false, partial: false };
    const map = new Map();
    const cached = Array.isArray(S._classes) && S._classes.length && S._classes.every((c) => !c || c.year == null || Number(c.year) === year) ? S._classes : null;
    const clsP = (cached ? Promise.resolve(cached) : Promise.resolve().then(() => BGL.classrooms(year)))
      .then((v) => ({ list: Array.isArray(v) ? v : [], err: null }), (err) => ({ list: null, err }));
    const exp0 = expectedOf(cached);
    report(0, 1 / Math.max(3, exp0 ? Math.ceil(exp0 / PER) + 1 : 4));

    const finish = (classes) => {
      const rows = sortRows(Array.from(map.values()));
      if (Array.isArray(classes)) {
        meta.classCount = classes.filter((c) => c && c.id != null).length;
        if (meta.source === "paged") { const has = new Set(rows.map((r) => String(r.cid))); meta.skippedClasses = classes.filter((c) => c && c.can_view === false && !has.has(String(c.id))).length; }
      }
      return { rows, meta };
    };
    // tải từng lớp (song song CONC_CLASSES) · gộp với những em API cả năm đã trả (bỏ trùng)
    const viaClasses = async (reason, why) => {
      const cl = await clsP; chk();
      meta.reason = reason;
      if (!cl.list) { if (map.size && !full()) { meta.partial = true; return finish(null); } throw cl.err || why || new Error("Không tải được danh sách lớp"); }   // giữ các trang đã có, báo chưa đủ (đã có bản đủ -> giữ bản đó)
      const list = cl.list.filter((c) => c && c.id != null), view = list.filter((c) => c.can_view !== false);
      const pagedN = map.size, base = at, step = (1 - base) / Math.max(1, view.length);
      let skipped = list.length - view.length, failed = 0, n = 0, lastErr = null;
      report(base, step);
      await pool(view, CONC_CLASSES, async (c) => {
        chk();
        try { const enr = await BGL.classroomEnrollments(c.id); chk(); collect(map, enr, c); }
        catch (e) { if (e && e.cancelled) throw e; if (e && e.status === 403) skipped++; else { failed++; lastErr = e; } }
        n++; report(base + step * n, step);
      });
      if (failed && (!map.size || full())) throw lastErr;   // lỗi mà không có em nào -> hộp lỗi + Thử lại · đang có bản đủ -> giữ bản đó (toast), không thay bằng bản thiếu
      meta.source = pagedN ? "mixed" : "classes"; meta.skippedClasses = skipped; meta.failedClasses = failed; meta.truncated = false;
      if (KEEP_REASONS[reason]) prefSet(year);
      return finish(list);
    };
    if (prefOn(year)) return viaClasses("pref");

    // lỗi mạng / 5xx -> thử lại 1 lần (403/401 thì thôi)
    const getPage = async (pg) => {
      try { return await BGL.enrollmentsPage(year, pg, PER); }
      catch (e) { if (!e || e.status === 403 || e.status === 401) throw e; chk(); return BGL.enrollmentsPage(year, pg, PER); }
    };
    let p1;
    try { p1 = await getPage(1); } catch (e) { chk(); return viaClasses(e && e.status === 403 ? "forbidden" : "error", e); }
    chk();
    const rows1 = (p1 && Array.isArray(p1.rows)) ? p1.rows : [];
    if (rows1.length && rows1.filter(usable).length < rows1.length * SHORT) return viaClasses("noperson");
    const cl = await clsP; chk();
    const classes = cl.list, expected = expectedOf(classes);
    const byId = new Map((classes || []).filter((c) => c && c.id != null).map((c) => [String(c.id), c])), look = (e) => byId.get(String(cidOf(e)));
    if (!rows1.length) return expected ? viaClasses("empty") : finish(classes);
    collect(map, rows1, null, look);

    const total = p1.total || 0;
    const per = p1.perPage || (total > rows1.length && rows1.length < PER ? rows1.length : PER);   // máy chủ tự hạ per_page -> theo nó
    let pages = p1.totalPages || (total ? Math.ceil(total / Math.max(1, per)) : 0), truncated = false, pageErr = null;
    const rep = (more) => { const T = Math.max(1, total, expected || 0, map.size + (more ? per : 0)); report(map.size / T, Math.min(1, per / T)); };
    if (pages > 1) {                                       // có meta: biết tổng -> các trang còn lại tải song song
      if (pages > MAX_PAGES) { pages = MAX_PAGES; truncated = true; }
      const rest = []; for (let i = 2; i <= pages; i++) rest.push(i);
      let left = rest.length; rep(true);
      await pool(rest, CONC_PAGES, async (pg) => {
        if (pageErr) return; chk();
        let r; try { r = await getPage(pg); } catch (e) { if (e && e.cancelled) throw e; pageErr = e; return; }
        chk(); collect(map, r && r.rows, null, look); left--; rep(left > 0);
      });
    } else if (!pages) {                                   // không có meta: lật tới trang ngắn / rỗng / không có em mới (máy chủ bỏ qua page) / chạm trần
      let pg = 1, last = rows1.length;
      while (pg < MAX_PAGES && last > 0 && (last >= PER || (expected && map.size < expected))) {
        pg++; rep(true);
        let r; try { r = await getPage(pg); } catch (e) { if (e && e.cancelled) throw e; pageErr = e; break; }
        chk(); const rows = (r && Array.isArray(r.rows)) ? r.rows : [], added = collect(map, rows, null, look); last = rows.length;
        if (!added) break;
      }
      if (!pageErr && pg >= MAX_PAGES && last >= PER) truncated = true;
    }
    if (pageErr) return viaClasses("error", pageErr);      // hỏng giữa chừng -> tải theo lớp, giữ các trang đã có
    if (expected && map.size < expected * SHORT && expected - map.size >= 3) return viaClasses("short");
    meta.truncated = truncated;
    return finish(classes);
  }

  // cache: S._students (mảng đã chuẩn hoá, đã sắp) + S._studentsMeta — chỉ dùng khi đúng niên khóa đang xem
  const valid = () => Array.isArray(S._students) && !!S._studentsMeta && S._studentsMeta.year === curYear();
  const full = () => valid() && !S._studentsMeta.failedClasses && !S._studentsMeta.partial;   // cache đủ (lần trước không lớp nào lỗi)
  TabLoad.def("students", {
    data: () => (valid() ? { rows: S._students, meta: S._studentsMeta } : null),
    fetch: fetchStudents,
    save: (d) => { const rows = (d && Array.isArray(d.rows)) ? d.rows : []; rows.forEach((r) => rememberPerson(r.p)); S._students = rows; S._studentsMeta = (d && d.meta) || null; },
  });

  // ---------- lọc (tên thánh · họ tên · tên lớp, không dấu, mọi từ đều phải khớp) + nhóm khối ----------
  const V = { q: "", g: "*", data: null, meta: null, list: [], byG: {}, cnt: new Map(), shown: 0, lastBox: null, lastCid: null, io: null, sentinel: null, ft: 0, tick: 0, keep: null, keys: null, keysFor: null };
  function keysOf(data) {
    if (V.keysFor !== data) { V.keys = data.map((r) => noAccent(`${r.cn} ${r.name} ${r.cname}`)); V.keysFor = data; }
    return V.keys;
  }
  function filterRows(data, q, g) {
    const toks = noAccent(q).split(/\s+/).filter(Boolean), keys = keysOf(data), list = [], byG = { "*": 0 }, cnt = new Map();
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (toks.length && !toks.every((t) => keys[i].includes(t))) continue;
      byG["*"]++; byG[r.g] = (byG[r.g] || 0) + 1;
      if (g !== "*" && r.g !== g) continue;
      list.push(r); const c = String(r.cid); cnt.set(c, (cnt.get(c) || 0) + 1);
    }
    return { list, byG, cnt };
  }
  const groupsOf = (data) => { const s = new Set(); (data || []).forEach((r) => s.add(r.g)); return GROUPS.filter((x) => s.has(x.k)); };

  // ---------- vẽ ----------
  const noteHtml = (m) => {
    m = m || {}; const parts = [];
    if (m.skippedClasses) parts.push(`${m.skippedClasses} lớp bạn không được xem danh sách thiếu nhi nên không có ở đây.`);
    if (m.failedClasses) parts.push(`Không tải được ${m.failedClasses} lớp.`);
    if (m.partial) parts.push("Mạng chập chờn — chưa tải được hết danh sách.");
    if (m.truncated) parts.push("Danh sách quá dài — chỉ hiện một phần.");
    if (!parts.length) return "";
    const retry = m.failedClasses || m.partial;
    return `<div class="note"><span class="note-ic">${ic(m.failedClasses ? "warn" : "key", 18)}</span><div><b>Danh sách chưa đủ</b><div>${esc(parts.join(" "))}${retry ? ` <a class="link" onclick="stuRetry()">Thử lại</a>` : ""}</div></div></div>`;
  };
  const header = (r) => `<div class="sec-eyebrow stu-h"><span class="eyebrow">${esc(r.cname || "Chưa rõ lớp")} · ${V.cnt.get(String(r.cid)) || 0}</span>${r.cid != null ? `<a class="link stu-open" data-cid="${esc(String(r.cid))}">Mở lớp</a>` : ""}</div>`;
  const rowHtml = (r) => `<div class="stu-row" data-pid="${esc(String(r.pid))}" role="button" tabindex="0">${avatar({ id: r.pid, name: r.name }, { size: 40, fs: 14 })}
    <div class="grow">${r.cn ? `<div class="faint stu-cn">${esc(r.cn)}</div>` : ""}<div class="nm stu-nm">${esc(r.name || "—")}</div>
      <div class="muted stu-sub">${esc(r.cname || "")}${r.birth ? `<span class="stu-dob">${ic("cake", 12)} ${esc(fmtDate(r.birth))}</span>` : ""}</div></div>
    ${r.result ? `<span class="chip ${RESULT_CLS[r.result] || "st-quit"} stu-res">${esc(r.result)}</span>` : ""}</div>`;

  function draw(d) {
    stopIO();
    V.data = (d && d.rows) || []; V.meta = (d && d.meta) || {};
    const groups = groupsOf(V.data); if (V.g !== "*" && !groups.some((x) => x.k === V.g)) V.g = "*";
    const m = V.meta, bar = appbar({ title: "Học sinh", bell: true, action: `<button class="act" onclick="go('#/search')" aria-label="Tìm kiếm">${ic("search", 20)}</button>` });
    if (!V.data.length) {                                  // chưa có em nào: chỉ ghi chú + hộp trống
      const none = m.classCount > 0 && m.skippedClasses >= m.classCount;
      screen(bar + `<main><div class="wrap">${noteHtml(none ? Object.assign({}, m, { skippedClasses: 0 }) : m)}${none
        ? emptyBox(ic("key", 44), "Chưa xem được thiếu nhi lớp nào", "Tài khoản của bạn chỉ xem được thiếu nhi của lớp mình được phân công.")
        : emptyBox(ic(IC.kids ? "kids" : "users", 44), "Chưa có học sinh", `Niên khóa ${m.longYear || longYearOf(curYear())} chưa có thiếu nhi nào.`)}</div></main>`, "students");
      return;
    }
    screen(bar + `<main><div class="wrap">
        <label class="searchbar">${ic("search", 18)}<input id="stuq" placeholder="Lọc theo tên…" autocomplete="off" enterkeyhint="search" value="${esc(V.q)}" oninput="stuFilter(this.value)"/></label>
        <div class="rev-status filterbar" id="stuChips"></div>
        <div class="muted" id="stuCount" style="margin:0 6px 12px;font-size:13px"></div>
        <div id="stuNote">${noteHtml(m)}</div>
        <div class="stu-list" id="stuList"></div>
        <div class="stu-more" id="stuMore" aria-hidden="true"></div>
      </div></main>`, "students");
    bindList();
    const k = V.keep; V.keep = null;                       // quay lại từ hồ sơ: vẽ đủ số em lúc trước + cuộn về chỗ cũ
    const back = k && k.q === V.q && k.g === V.g && Date.now() - k.at < 30 * 60e3;
    refresh(back ? Math.max(FIRST, k.n) : FIRST);
    if (back && k.y > 0) { try { requestAnimationFrame(() => window.scrollTo(0, k.y)); } catch {} }
  }
  // làm mới ở nền thấy dữ liệu đổi: giữ ô lọc + số em đang hiện (không giật cuộn)
  function update(d) {
    const had = V.data && V.data.length;
    if (!had || !$("stuList") || !(d && d.rows && d.rows.length)) return draw(d);
    V.data = d.rows; V.meta = d.meta || {};
    if (V.g !== "*" && !groupsOf(V.data).some((x) => x.k === V.g)) V.g = "*";
    const n = $("stuNote"); if (n) n.innerHTML = noteHtml(V.meta);
    refresh(Math.max(FIRST, V.shown));
  }
  function refresh(n) {
    if (!V.data) return;
    const f = filterRows(V.data, V.q, V.g); V.list = f.list; V.byG = f.byG; V.cnt = f.cnt;
    paintChips(); paintCount(); renderList(n || FIRST);
  }
  function paintChips() {
    const el = $("stuChips"); if (!el) return;
    const gs = groupsOf(V.data), sl = el.scrollLeft || 0;
    el.style.display = gs.length < 2 ? "none" : "";       // chỉ 1 khối -> khỏi chip (.rev-status là flex nên không dùng hidden)
    const chip = (k, label, cls) => `<button class="pick ${V.g === k ? "on " + cls : ""}" data-g="${k}" onclick="stuGroup('${k}')">${esc(label)} <b class="num">${V.byG[k] || 0}</b></button>`;
    el.innerHTML = chip("*", "Tất cả", "st-quit") + gs.map((x) => chip(x.k, x.label, x.cls)).join("");
    el.scrollLeft = sl;
  }
  function paintCount() {
    const el = $("stuCount"); if (!el) return;
    const all = V.data.length, n = V.list.length, filtered = V.q.trim() || V.g !== "*";
    el.textContent = `${filtered ? `${n} / ${all}` : n} học sinh · ${(V.meta && V.meta.longYear) || longYearOf(curYear())}`;
  }
  // vẽ lại từ đầu (đổi lọc / dữ liệu): xoá danh sách, vẽ n em đầu, lắng nghe cuộn để vẽ tiếp
  function renderList(n) {
    const box = $("stuList"); if (!box) return;
    clearTimeout(V.tick); V.tick = 0;
    V.shown = 0; V.lastBox = null; V.lastCid = null;
    box.innerHTML = V.list.length ? "" : emptyBox(ic("search", 44), V.q.trim() ? `Không có học sinh khớp “${V.q.trim()}”` : "Không có học sinh trong nhóm này");
    appendRows(n || FIRST); watch();
  }
  // nối thêm tối đa n em TIẾP THEO (luôn tính từ V.shown -> không trùng, không sót): em cùng lớp với khối cuối thì chèn vào khối đó
  function appendRows(n) {
    const box = $("stuList"); if (!box) return 0;
    const from = V.shown, end = Math.min(V.list.length, from + n); if (end <= from) return 0;
    let html = "", tail = "", rows = "", open = false, cur = V.lastCid;
    for (let i = from; i < end; i++) {
      const r = V.list[i], cid = String(r.cid);
      if (cid !== cur) {
        if (open) html += rows + "</div>"; else tail = rows;
        rows = ""; open = true; cur = cid;
        html += header(r) + `<div class="card stu-grp" data-cid="${esc(cid)}">`;
      }
      rows += rowHtml(r);
    }
    if (open) html += rows + "</div>"; else tail = rows;
    if (tail && V.lastBox) V.lastBox.insertAdjacentHTML("beforeend", tail);
    if (html) { box.insertAdjacentHTML("beforeend", html); V.lastBox = box.lastElementChild; }
    V.lastCid = cur; V.shown = end;
    return end - from;
  }
  // mốc cuối danh sách: còn em chưa vẽ & mốc cách mép dưới < 900px -> vẽ thêm 1 đợt
  function watch() {
    const s = $("stuMore"); if (!s) return stopIO();
    const left = V.shown < V.list.length; s.style.display = left ? "" : "none";
    if (!left) return stopIO();
    if (typeof IntersectionObserver !== "function") {     // WebView quá cũ: vẽ dần theo hẹn giờ
      clearTimeout(V.tick); V.tick = setTimeout(() => { V.tick = 0; if (s.isConnected && $("stuList")) { appendRows(CHUNK); watch(); } }, 60);
      return;
    }
    if (!V.io || V.sentinel !== s) { stopIO(); V.sentinel = s; V.io = new IntersectionObserver(onIO, { rootMargin: "0px 0px 900px 0px" }); }
    V.io.unobserve(s); V.io.observe(s);                    // quan sát lại -> IO báo ngay trạng thái hiện tại (vẫn trong vùng thì vẽ tiếp)
  }
  function onIO(entries) {
    const s = V.sentinel;
    if (!s || !s.isConnected || !$("stuList")) return stopIO();   // đã rời màn -> thôi theo dõi
    if (!entries.some((e) => e.isIntersecting)) return;
    appendRows(CHUNK); watch();
  }
  function stopIO() { if (V.io) { try { V.io.disconnect(); } catch {} } V.io = null; V.sentinel = null; clearTimeout(V.tick); V.tick = 0; }
  // bấm 1 em -> hồ sơ (tab Học sinh vẫn sáng) · "Mở lớp" -> màn lớp
  function bindList() {
    const box = $("stuList"); if (!box) return;
    const pick = (ev) => {
      const t = ev.target; if (!t || !t.closest) return;
      const o = t.closest(".stu-open"); if (o) { remember(); go("#/class/" + encodeURIComponent(o.dataset.cid)); return; }
      const row = t.closest(".stu-row"); if (!row) return;
      remember();
      if (typeof window.openPerson === "function") window.openPerson(row.dataset.pid, "students"); else go("#/person/" + encodeURIComponent(row.dataset.pid));
    };
    box.addEventListener("click", pick);
    box.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(ev); } });
  }
  const remember = () => { V.keep = { y: window.scrollY || 0, n: V.shown, q: V.q, g: V.g, at: Date.now() }; };

  // ---------- onclick ----------
  function stuFilter(q) {
    V.q = String(q == null ? "" : q); clearTimeout(V.ft);
    V.ft = setTimeout(() => { V.ft = 0; if ($("stuList")) refresh(FIRST); }, 140);   // gõ liên tục -> lọc 1 lần khi ngừng tay
  }
  function stuGroup(g) { V.g = g == null ? "*" : String(g); try { haptic(6); } catch {} clearTimeout(V.ft); V.ft = 0; if ($("stuList")) refresh(FIRST); }
  // "Thử lại" trong ghi chú (vài lớp lỗi): tải lại ngay (bỏ qua 15 s vừa tải), màn vẽ lại khi xong
  function stuRetry() {
    const src = TabLoad.src.students; if (!src) return;
    if (!TabLoad.running("students")) TabLoad.run("students", src.fetch, { silent: src.data() != null, save: src.save });
    render();
  }
  window.studentsScreen = function studentsScreen() {
    stopIO();
    return tabScreen("students", { title: "Học sinh", what: "danh sách học sinh", draw, update });
  };
  // đăng xuất: bỏ cache + observer + hẹn giờ + bộ lọc (người đăng nhập sau không thấy gì của người trước)
  window.resetStudents = function resetStudents() {
    stopIO(); clearTimeout(V.ft);
    S._students = S._studentsMeta = null;
    Object.assign(V, { q: "", g: "*", data: null, meta: null, list: [], byG: {}, cnt: new Map(), shown: 0, lastBox: null, lastCid: null, ft: 0, keep: null, keys: null, keysFor: null });
  };
  window.stuFilter = stuFilter; window.stuGroup = stuGroup; window.stuRetry = stuRetry;
  // rời màn Học sinh -> ngắt observer ngay (onIO cũng tự ngắt khi mốc không còn trên trang)
  window.addEventListener("hashchange", () => { if (!/^#\/students(\/|$)/.test(location.hash)) { stopIO(); clearTimeout(V.ft); V.ft = 0; } });

  // ---------- CSS riêng (index.html không có) ----------
  try {
    if (!document.getElementById("stu-css")) {
      const st = document.createElement("style"); st.id = "stu-css";
      st.textContent = `.stu-list>.stu-h:first-child{margin-top:6px}
.stu-h{justify-content:space-between}.stu-h .eyebrow{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stu-open{font-size:12.5px;flex:none;padding:4px 2px}
.stu-grp{overflow:hidden}
.stu-row{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.stu-row+.stu-row{border-top:1px solid var(--line)}
.stu-row:active{background:var(--fill)}
.stu-row:focus-visible{outline:2px solid var(--brand-2);outline-offset:-2px}
.stu-cn{font-size:11.5px;line-height:1.25}
.stu-nm{font-weight:700;font-size:15px}
.stu-sub{font-size:12px;margin-top:1px;display:flex;flex-wrap:wrap;gap:0 8px;align-items:center}
.stu-dob{display:inline-flex;align-items:center;gap:3px}
.stu-res{padding:5px 9px;font-size:11.5px;flex:none}
.stu-more{height:1px}
.pick.on.st-pink{background:rgba(236,72,153,.15);color:#be185d}
:root[data-theme="dark"] .pick.on.st-pink,:root.auto-dark .pick.on.st-pink{background:rgba(244,114,182,.2);color:#f9a8d4}`;
      (document.head || document.documentElement).appendChild(st);
    }
  } catch {}

  // cho test (node:vm) — không dùng trong app
  window.__stu = { norm, usable, keyOf, collect, sortRows, expectedOf, filterRows, groupsOf, fetchStudents, appendRows, renderList, refresh, draw, update, watch, stopIO, V, PER, MAX_PAGES, FIRST, CHUNK };
})();
