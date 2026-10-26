// ============================================================
//  HỌC SINH — TOÀN BỘ thiếu nhi của niên khóa hiện tại (tab "Học sinh", route #/students)
//  Nạp SAU app.js, dùng thẳng biến toàn cục của app.js (S, BGL, TabLoad, tabScreen, screen, appbar, avatar…).
//  Bọc IIFE: tên hàm trong này không đụng app.js (app.js đã có filterStudents, studentCard, renderStudentList…).
//  GLV thường KHÔNG được xem danh sách lớp khác (403) -> lấy phần xem được như cũ, phần còn lại DÒ qua ô tìm kiếm
//  (v1/search: khớp chuỗi con của họ tên, mỗi lần tối đa 20 em) cho tới khi đủ số em của các lớp. Lưu máy 12 giờ.
//  Mặc định: chip ngành + LƯỚI THẺ LỚP ("Khai Tâm A · 10/26" — số nhảy theo thời gian thực khi đang dò) · bấm thẻ -> #/students/<id lớp>
//  (danh sách em của lớp đó, Back về lưới) · có từ khoá -> danh sách xếp hạng khắp các lớp.
//  Ra ngoài: window.studentsScreen · window.resetStudents · onclick stuFilter / stuGroup / stuRetry / stuGo / stuReload / stuClass / stuBack / stuOpenCls.
// ============================================================
(function () {
  "use strict";
  // ---------- hằng số ----------
  const PER = 250, MAX_PAGES = 40;          // 1 trang 250 em · trần 40 trang (10.000 em) để vòng lật trang luôn dừng
  const CONC_PAGES = 3, CONC_CLASSES = 4;   // số request chạy song song (lật trang / tải từng lớp)
  const SHORT = 0.9;                        // ít hơn 90% số dự kiến (tổng enrollments_overview các lớp xem được) = thiếu -> tải theo lớp
  const FIRST = 150, CHUNK = 150;           // vẽ dần: 150 em đầu, cuộn gần cuối thì thêm 150
  const LIVE_MS = 350;                      // đang dò: cập nhật số trên thẻ lớp tối đa ~3 lần / giây
  const PREF_KEY = "bgl-stu-src", PREF_MS = 3 * 864e5;   // nhớ 3 ngày: tài khoản này phải tải theo lớp (khỏi thử lại API cả năm)
  const DENY_KEY = "bgl-stu-deny", DENY_MS = 864e5;      // lớp trả 403 (nhớ 1 ngày) -> lần sau khỏi gọi lại
  const ALL_KEY = "bgl-stu-all", STALE_MS = 72 * 36e5;   // danh sách đủ lưu máy (theo tài khoản + niên khóa) · cũ hơn 3 ngày -> làm mới ngầm (đỡ tải máy chủ)
  const CAP_KEY = "bgl-stu-cap", CAP_MS = 7 * 864e5;     // kết quả thăm dò ô tìm kiếm (trần / phân trang / bỏ dấu), nhớ 7 ngày
  const SCAP = 20, BUDGET = 700, CONC_Q = 2;             // trần mặc định 1 lần tìm · tối đa số lần tìm 1 lượt dò · số lần tìm song song
  const BIG = { per_page: 1000, limit: 1000, items: 1000, page_size: 1000, size: 1000 };   // thử xin nhiều hơn 20 em / lần
  const SEEDS = "nguyễn,trần,lê,phạm,hoàng,huỳnh,phan,võ,vũ,đặng,bùi,đỗ,hồ,ngô,dương,thị,văn,ngọc,minh,gia,bảo,anh,khánh,thanh,phương,quốc,đức,thiên,vy,linh,nhi,hân,thư,khang,huy,nam,phúc,khôi,quân,long".split(",");
  const BROAD = "ng,an,nh,th,in,en,uy,on,ai,oa,ha,tr,ch,ph,kh,gi,qu,ie,am,ao".split(",");   // máy chủ cho xin nhiều / phân trang: vài chuỗi rộng là đủ
  // ngành (theo Khối của lớp, không có thì theo tên lớp) · class khi chip đang chọn
  const GROUPS = [["pink", "Chiên", "st-pink"], ["green", "Ấu", "st-present"], ["blue", "Thiếu", "st-excused"], ["gold", "Nghĩa", "st-late"], ["brown", "Vào Đời", "st-brown"], ["", "Khác", "st-quit"]]
    .map(([k, label, cls]) => ({ k, label, cls }));
  const GORD = { pink: 0, green: 1, blue: 2, gold: 3, brown: 4, "": 5 };
  const NG_RE = [["pink", /\b(khai tam|chien con|chien)\b/], ["green", /\b(ruoc le|au nhi|au)\b/], ["blue", /\b(them suc|thieu nhi|thieu)\b/], ["gold", /\b(bao dong|nghia si|nghia)\b/], ["brown", /\b(vao doi)\b/]];
  const KEEP_REASONS = { forbidden: 1, empty: 1, noperson: 1, short: 1 };   // lý do bền (quyền / dữ liệu) — lỗi mạng thì không nhớ
  const COLL = (() => { try { return new Intl.Collator("vi", { sensitivity: "base", numeric: true }); } catch { return null; } })();
  const cmp = (a, b) => (COLL ? COLL.compare(a || "", b || "") : String(a || "").localeCompare(String(b || "")));
  const PH0 = ["", "", ""];

  // ---------- tiện ích ----------
  const curYear = () => { const y = S.year && Number(S.year.year); return y > 0 ? y : classYearRange(null).year; };
  const longYearOf = (y) => (S.year && Number(S.year.year) === y && S.year.long_year) || `${y} - ${y + 1}`;
  const ukey = () => (S.user && S.user.id != null ? String(S.user.id) : "");
  // bỏ dấu nhưng GIỮ "đ" (máy chủ có thể không gộp đ/d -> truy vấn "đ…" luôn đúng) · chữ thường giữ dấu (máy chủ phân biệt dấu)
  const fold = (s) => String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const low = (s) => String(s == null ? "" : s).normalize("NFC").toLowerCase().replace(/\s+/g, " ").trim();
  const abortErr = () => Object.assign(new Error("Đã huỷ"), { aborted: true, cancelled: true, status: 0 });
  const mkAC = () => { try { return new AbortController(); } catch { const sig = { aborted: false, fs: [], addEventListener(t, f) { this.fs.push(f); }, removeEventListener() {} }; return { signal: sig, abort() { if (!sig.aborted) { sig.aborted = true; sig.fs.forEach((f) => { try { f(); } catch {} }); } } }; } };
  const sleep = (ms, sig) => new Promise((res, rej) => {
    if (sig && sig.aborted) return rej(abortErr());
    const t = setTimeout(res, ms);
    if (sig && sig.addEventListener) sig.addEventListener("abort", () => { clearTimeout(t); rej(abortErr()); }, { once: true });
  });
  const hash = () => (typeof location !== "undefined" && location.hash) || "";
  const onStudents = () => /^#\/students(\/[^/]+)?\/?$/.test(hash());             // lưới thẻ #/students · 1 lớp #/students/<id>
  const routeCid = () => { const m = /^#\/students\/([^/?#]+)/.exec(hash()); if (!m) return null; try { return decodeURIComponent(m[1]); } catch { return m[1]; } };
  const phoneNorm = (d) => { d = String(d || "").replace(/\D/g, ""); return d.length >= 11 && d.slice(0, 2) === "84" ? "0" + d.slice(2) : d; };
  function nganhOf(fam, name) {
    for (const t of [fam, name]) { const s = noAccent(t || ""); if (!s) continue; for (const [k, re] of NG_RE) if (re.test(s)) return k; }
    return "";
  }
  const grp = (k) => GROUPS.find((x) => x.k === (k || "")) || GROUPS[GROUPS.length - 1];

  // ---------- chuẩn hoá 3 kiểu dữ liệu về 1 dạng ----------
  // (a) GET v1/enrollments?filters[classroom_year_eq]=… : { id, result, person{…}, classroom{id,name,…} }
  // (b) GET v1/classrooms/:id/enrollments                 : { id, result, person{…}, (classroom) } — lớp lấy từ vòng tải
  // (c) GET v1/search → students[]                        : person{…, enrollment{ id?, result, classroom{…} }}
  // -> { id, pid, cid, name, cn, birth, gender, result, cname, g (ngành), ph [SĐT cha, mẹ, riêng], cvp, p (person gốc để rememberPerson) }
  const personOf = (e) => (e && e.person && typeof e.person === "object" ? e.person : null);
  const pidOf = (e, p) => (p && p.id != null ? p.id : p && p.person_id != null ? p.person_id : e && e.person_id != null ? e.person_id : null);
  const roomOf = (e) => (e && e.classroom && typeof e.classroom === "object" ? e.classroom : null);
  const cidOf = (e) => { const k = roomOf(e); return k && k.id != null ? k.id : e && e.classroom_id != null ? e.classroom_id : null; };
  // dòng của API cả năm dùng được: có person lồng (id + tên) và biết lớp
  const usable = (e) => { const p = personOf(e); return !!(p && pidOf(e, p) != null && (p.name || p.full_name) && cidOf(e) != null); };
  function phonesOf(p) {
    const pi = (p && p.data && p.data.parents_info) || {}, v = (x) => { x = x == null ? "" : String(x).trim(); return x === "—" || x === "-" ? "" : x; };
    return [v(pi.father_phone), v(pi.mother_phone), v(p && p.phone)];
  }
  function norm(e, c) {
    if (!e || typeof e !== "object") return null;
    const p = personOf(e), pid = pidOf(e, p); if (pid == null) return null;
    const k = roomOf(e) || {}, cid = c && c.id != null ? c.id : cidOf(e);
    const cname = String((c && c.name) || k.name || ""), fam = (c && c.family) || k.family || "";
    return {
      id: e.id != null ? e.id : null, pid, cid: cid != null ? cid : null,
      name: String((p && (p.name || p.full_name)) || ""), cn: String((p && p.christian_name) || ""),
      birth: (p && p.birth_date) || "", gender: (p && p.gender) || "", result: String(e.result || ""),
      cname, g: nganhOf(fam, cname), ph: phonesOf(p), cvp: p && p.can_view_profile === false ? 0 : 1,
      p: p && p.id != null ? p : Object.assign({}, p || {}, { id: pid }),
    };
  }
  // 1 em từ kết quả tìm kiếm (bỏ enrollment lồng khỏi person trước khi nhớ) · y: niên khóa của lớp (để loại năm khác)
  function fromSearch(p) {
    if (!p || typeof p !== "object") return null;
    const en = p.enrollment && typeof p.enrollment === "object" ? p.enrollment : {}, per = Object.assign({}, p);
    delete per.enrollment; delete per.teaching_assignment;
    const r = norm({ id: en.id, result: en.result, person: per, classroom: en.classroom, classroom_id: en.classroom_id }, null);
    if (r && en.classroom && en.classroom.year != null) r.y = Number(en.classroom.year);
    return r;
  }
  // trùng: cùng người + cùng lớp (enrollment của API lớp và của ô tìm kiếm khớp nhau dù thiếu id)
  const keyOf = (r) => (r.cid != null ? "p" + r.pid + "c" + r.cid : r.id != null ? "e" + r.id : "p" + r.pid);
  // gộp b vào a (a ưu tiên — dữ liệu lớp xem được đầy đủ hơn): chỉ lấp chỗ trống
  function absorb(a, b) {
    if (!a || !b || a === b) return a;
    ["id", "cn", "birth", "gender", "result", "cname"].forEach((f) => { if ((a[f] == null || a[f] === "") && b[f] != null && b[f] !== "") a[f] = b[f]; });
    if (b.ph) a.ph = (a.ph || PH0).map((x, i) => x || b.ph[i] || "");
    if (!a.g && b.g) a.g = b.g;
    if (a.p && b.p && a.p !== b.p) { const p = Object.assign({}, a.p); Object.keys(b.p).forEach((f) => { if (p[f] == null && b.p[f] != null) p[f] = b.p[f]; }); a.p = p; }
    return a;
  }
  const put = (map, r) => { const k = keyOf(r), a = map.get(k); if (a) { absorb(a, r); return false; } map.set(k, r); return true; };
  function collect(map, rows, c, look) {
    let added = 0;
    (Array.isArray(rows) ? rows : []).forEach((e) => { const r = norm(e, c || (look && look(e))); if (r && put(map, r)) added++; });
    return added;
  }
  // thứ tự: ngành (Chiên → Nghĩa → khác) · tên lớp (số tự nhiên) · trong lớp theo TÊN (chữ cuối) rồi họ tên
  const given = (n) => { const w = String(n || "").trim().split(/\s+/); return w[w.length - 1] || ""; };
  function sortRows(rows) {
    const gk = new Map(rows.map((r) => [r, given(r.name)]));
    return rows.sort((a, b) => ((GORD[a.g] ?? 5) - (GORD[b.g] ?? 5)) || cmp(a.cname, b.cname) || String(a.cid).localeCompare(String(b.cid))
      || cmp(gk.get(a), gk.get(b)) || cmp(a.name, b.name) || keyOf(a).localeCompare(keyOf(b)));
  }
  // số em dự kiến = tổng enrollments_overview của các lớp được xem · null: lớp không kèm số liệu -> không đoán
  function expectedOf(classes) {
    if (!Array.isArray(classes)) return null;
    let n = 0, any = false;
    classes.forEach((c) => { if (!c || c.can_view === false) return; const ov = c.enrollments_overview; if (ov && typeof ov === "object") { any = true; for (const k in ov) n += Number(ov[k]) || 0; } });
    return any ? n : null;
  }
  // cả niên khóa (mọi lớp, kể cả lớp không được xem) — theo từng kết quả (Đang Học, Nghỉ Luôn…)
  function totalsOf(classes) {
    const by = {}; let all = 0, n = 0;
    (Array.isArray(classes) ? classes : []).forEach((c) => { if (!c || c.id == null) return; n++; const ov = c.enrollments_overview; if (ov && typeof ov === "object") for (const k in ov) { const v = Number(ov[k]) || 0; by[k] = (by[k] || 0) + v; all += v; } });
    return { all, by, n };
  }
  async function pool(items, n, fn) {
    let i = 0;
    const worker = async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  }
  const prefOn = (y) => { const v = store.get(PREF_KEY, null), u = S.user && S.user.id; return !!(v && u != null && v.u === u && v.y === y && Date.now() - (Number(v.at) || 0) < PREF_MS); };
  const prefSet = (y) => { const u = S.user && S.user.id; if (u != null) store.set(PREF_KEY, { u, y, at: Date.now() }); };
  // lớp đã trả 403 (trừ lớp mình được phân công) — để lần sau khỏi gọi lại
  const myCids = () => new Set((S.myAssignments || []).map((t) => t && t.classroom && t.classroom.id).filter((x) => x != null).map(String));
  const denyGet = (y) => { const v = store.get(DENY_KEY, null), u = ukey(); return v && u && v.u === u && v.y === y && Date.now() - (Number(v.at) || 0) < DENY_MS && Array.isArray(v.ids) ? new Set(v.ids.map(String)) : new Set(); };
  const denySet = (y, ids) => { const u = ukey(); if (u) store.set(DENY_KEY, { u, y, at: Date.now(), ids: Array.from(ids) }); };
  // danh sách lớp (kèm enrollments_overview = số em từng lớp) của lượt tải gần nhất -> lưới thẻ lớp (cả lớp chưa tải được em nào)
  let CLS = null;
  const sameYear = (list, y) => Array.isArray(list) && list.length > 0 && list.every((c) => !c || c.year == null || Number(c.year) === y);
  const keepCls = (y, list) => { if (sameYear(list, y)) CLS = { y, list }; };
  const classList = () => { const y = curYear(); return sameYear(S._classes, y) ? S._classes : CLS && CLS.y === y ? CLS.list : null; };   // tab Lớp học đã tải -> dùng bản đó (mới hơn)

  // ---------- TẢI phần XEM ĐƯỢC: 1 API cả năm (có phân trang) · không được thì TỰ tải từng lớp ----------
  // Tải theo lớp khi API cả năm: lỗi (403…) / rỗng mà lớp có em / thiếu person lồng / ít hẳn số dự kiến.
  // report(phần xong, cỡ bước) — % thật = số em đã tải / tổng (meta) — hoặc số lớp xong / tổng lớp. -> { rows, meta, classes }
  async function fetchOwn(year, chk, report) {
    let at = 0;
    const rep = (f, s) => { at = Math.max(at, Math.min(1, f || 0)); report(at, s); };
    const meta = { source: "paged", reason: "", year, longYear: longYearOf(year), skippedClasses: 0, failedClasses: 0, classCount: 0, truncated: false, partial: false, viewed: [] };
    const map = new Map();
    const cached = Array.isArray(S._classes) && S._classes.length && S._classes.every((c) => !c || c.year == null || Number(c.year) === year) ? S._classes : null;
    const clsP = (cached ? Promise.resolve(cached) : Promise.resolve().then(() => BGL.classrooms(year)))
      .then((v) => { const list = Array.isArray(v) ? v : []; keepCls(year, list); return { list, err: null }; }, (err) => ({ list: null, err }));
    const exp0 = expectedOf(cached);
    rep(0, 1 / Math.max(3, exp0 ? Math.ceil(exp0 / PER) + 1 : 4));

    const finish = (classes) => {
      const rows = sortRows(Array.from(map.values()));
      if (Array.isArray(classes)) {
        meta.classCount = classes.filter((c) => c && c.id != null).length;
        if (meta.source === "paged") { const has = new Set(rows.map((r) => String(r.cid))); meta.skippedClasses = classes.filter((c) => c && c.can_view === false && !has.has(String(c.id))).length; meta.viewed = classes.filter((c) => c && c.id != null && c.can_view !== false).map((c) => String(c.id)); }
      }
      return { rows, meta, classes: Array.isArray(classes) ? classes : null };
    };
    // tải từng lớp (song song CONC_CLASSES) · gộp với những em API cả năm đã trả (bỏ trùng) · lớp đã biết 403 thì bỏ qua
    const viaClasses = async (reason, why) => {
      const cl = await clsP; chk();
      meta.reason = reason;
      if (!cl.list) { if (map.size && !full()) { meta.partial = true; return finish(null); } throw cl.err || why || new Error("Không tải được danh sách lớp"); }   // giữ các trang đã có, báo chưa đủ (đã có bản đủ -> giữ bản đó)
      const list = cl.list.filter((c) => c && c.id != null), mine = myCids(), deny = denyGet(year);
      const view = list.filter((c) => c.can_view !== false && (!deny.has(String(c.id)) || mine.has(String(c.id))));
      const pagedN = map.size, base = at, step = (1 - base) / Math.max(1, view.length), denied = new Set();
      let skipped = list.length - view.length, failed = 0, n = 0, lastErr = null;
      rep(base, step);
      await pool(view, CONC_CLASSES, async (c) => {
        chk();
        try { const enr = await BGL.classroomEnrollments(c.id); chk(); collect(map, enr, c); meta.viewed.push(String(c.id)); }
        catch (e) { if (e && e.cancelled) throw e; if (e && e.status === 403) { skipped++; denied.add(String(c.id)); } else { failed++; lastErr = e; } }
        n++; rep(base + step * n, step);
      });
      if (denied.size) { deny.forEach((x) => denied.add(x)); denySet(year, denied); }
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
    const rp = (more) => { const T = Math.max(1, total, expected || 0, map.size + (more ? per : 0)); rep(map.size / T, Math.min(1, per / T)); };
    if (pages > 1) {                                       // có meta: biết tổng -> các trang còn lại tải song song
      if (pages > MAX_PAGES) { pages = MAX_PAGES; truncated = true; }
      const rest = []; for (let i = 2; i <= pages; i++) rest.push(i);
      let left = rest.length; rp(true);
      await pool(rest, CONC_PAGES, async (pg) => {
        if (pageErr) return; chk();
        let r; try { r = await getPage(pg); } catch (e) { if (e && e.cancelled) throw e; pageErr = e; return; }
        chk(); collect(map, r && r.rows, null, look); left--; rp(left > 0);
      });
    } else if (!pages) {                                   // không có meta: lật tới trang ngắn / rỗng / không có em mới (máy chủ bỏ qua page) / chạm trần
      let pg = 1, last = rows1.length;
      while (pg < MAX_PAGES && last > 0 && (last >= PER || (expected && map.size < expected))) {
        pg++; rp(true);
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

  // ---------- DÒ DANH SÁCH qua ô tìm kiếm (mỗi truy vấn trả tối đa CAP em, khớp chuỗi con của họ tên) ----------
  // Mỗi tên có các "ranh giới" giữa 2 chữ (vd. "thị|anh"). Một truy vấn KHÔNG bão hoà (< CAP) có chứa ranh giới đó (vd. "hi a")
  // trả ĐỦ mọi em có đoạn ấy -> em chưa thấy mà "giống" em đã thấy ở ranh giới đó cũng lộ ra.
  //  B0 hạt giống (họ / tên phổ biến) -> B1 "chứng nhận" mọi ranh giới của mọi tên đã biết bằng nhóm LỚN nhất còn < CAP
  //  -> B2 mỗi ranh giới thêm nhóm tổng quát nhất chưa hỏi, xen kẽ B3 cặp "chữ cuối·chữ đầu" chưa từng thấy
  //  -> B4 thêm 1 chữ sau chữ đầu của cặp đã bão hoà (theo luật ghép vần). Dừng: đủ số em · hết ứng viên · hết ngân sách · huỷ.
  const FIN = "aceghimnoptuy", INI = "abcdđeghiklmnopqrstuvxy";          // chữ cuối / chữ đầu âm tiết (không dấu)
  const NXT = { b: "aeiouy", c: "haou", d: "aeiouy", "đ": "aeiouy", g: "haeiou", h: "aeiouy", k: "heiy", l: "aeiouy", m: "aeiouy", n: "aeghiouy", p: "h", q: "u", r: "aeiou", s: "aeiou", t: "haeiouyr", v: "aeiouy", x: "aeiou", a: "cimnoupy", e: "mnotucp", i: "aecmnptu", o: "aicmnpt", u: "aiyeonmct", y: "e" };
  const CTX = 4, RK = [0, 1, 2, 2, 3];                                  // ngữ cảnh tối đa 4 chữ cái mỗi bên · B2 và B3 cùng hạng (xen kẽ)
  function makeEnum(o) {
    const cap = o.cap || SCAP, K = o.K, names = new Map(), cnt = new Map(), done = new Map(), nonSat = [], cov = new Map(), wc = new Map(), finC = {}, iniC = {};
    const st = { q: 0, seed: 0, p1: 0, p2: 0, p3: 0, p4: 0, sat: 0, err: 0, stop: "" };
    let plan = [], dirty = 99, nFound = 0, seeds = (o.seeds || []).map(K).filter((k, i, a) => k.length >= 2 && a.indexOf(k) === i);
    const lens = (w) => { const L = []; for (let a = 1; a <= Math.min(CTX, w.length); a++) L.push(a); if (w.length > CTX) L.push(w.length); return L; };
    function gens(w) {                                            // [chuỗi, ranh giới đầu, ranh giới cuối] — qua 1 hoặc 2 ranh giới
      const out = [];
      for (let j = 0; j < w.length - 1; j++) for (let sp = 0; sp < 2 && j + sp < w.length - 1; sp++) {
        const mid = sp ? " " + w[j + 1] : "", last = w[j + sp + 1];
        for (const a of lens(w[j])) for (const b of lens(last)) out.push([w[j].slice(-a) + mid + " " + last.slice(0, b), j, j + sp]);
      }
      return out;
    }
    // q KHÔNG bão hoà khớp x: có dấu cách -> ranh giới nằm trong chỗ khớp · nằm trong 1 chữ -> 2 ranh giới kề chữ đó
    function certify(x, q) {
      let i = x.k.indexOf(q); if (i < 0) return;
      if (x.one) { x.cert[0] = true; return; }
      const sp = q.indexOf(" ") >= 0;
      for (; i >= 0; i = x.k.indexOf(q, i + 1)) {
        const a = i, b = i + q.length; let pos = 0;
        for (let j = 0; j < x.w.length; j++) {
          const s = pos, e = pos + x.w[j].length;
          if (sp) { if (j < x.w.length - 1 && a <= e && e < b) x.cert[j] = true; }
          else if (a < e && b > s) { if (j > 0) x.cert[j - 1] = true; if (j < x.w.length - 1) x.cert[j] = true; }
          pos = e + 1;
        }
      }
    }
    // thêm 1 tên (found: đã thấy trong kết quả · không: tên của danh sách lưu lần trước, chỉ để gợi ý)
    function add(name, found) {
      const k = K(name); if (!k) return;
      let x = names.get(k);
      if (!x) {
        const w = k.split(" ").filter(Boolean);
        x = { k, w, g: gens(w), cert: new Array(Math.max(1, w.length - 1)).fill(false), one: w.length < 2, f: false };
        names.set(k, x);
        const seen = new Set(); x.g.forEach(([s]) => { if (!seen.has(s)) { seen.add(s); cnt.set(s, (cnt.get(s) || 0) + 1); } });
        for (let j = 0; j < w.length - 1; j++) { const l = w[j].slice(-1), c = w[j + 1][0]; finC[l] = (finC[l] || 0) + 1; iniC[c] = (iniC[c] || 0) + 1; }
        nonSat.forEach((q) => certify(x, q));
        wc.forEach((n, wd) => { if (k.indexOf(wd) >= 0) wc.set(wd, n + 1); });
        dirty = Math.max(dirty, 3);
      }
      if (found && !x.f) { x.f = true; nFound++; }
    }
    (o.hints || []).forEach((n) => add(n, false));
    (o.found || []).forEach((n) => add(n, true));
    if (names.size >= 60) seeds = seeds.slice(0, 8);             // có sẵn nhiều tên làm gợi ý -> khỏi dò nhiều hạt giống
    const subCount = (s) => { let n = wc.get(s); if (n == null) { n = 0; for (const x of names.values()) if (x.k.indexOf(s) >= 0) n++; wc.set(s, n); } return n; };
    const est = (k) => k * Math.min(1.25, Math.max(1, (o.target() || 0) / Math.max(1, nFound)));
    const covered = (s) => { let c = cov.get(s) || 0; for (; c < nonSat.length; c++) if (s.indexOf(nonSat[c]) >= 0) { done.set(s, false); return true; } cov.set(s, c); return false; };
    // ứng viên cho ranh giới j của x: chuỗi 1 ranh giới có k lớn nhất mà ước lượng < cap (hết mới xét chuỗi 2 ranh giới)
    function bestAt(x, j, skipDone) {
      let b = null, bk = -1;
      for (const sp of [0, 1]) {
        for (const [s, j0, j1] of x.g) {
          if (j1 - j0 !== sp || j < j0 || j > j1 || (skipDone && done.has(s))) continue;
          const k = cnt.get(s) || 0; if (est(k) >= cap) continue;
          if (k > bk || (k === bk && s.length < b.length)) { b = s; bk = k; }
        }
        if (b || !skipDone) break;
      }
      return b ? [b, bk] : null;
    }
    function mkPlan() {
      const out = new Map(), add1 = (s, k, ph) => { if (s && !done.has(s) && !out.has(s) && !covered(s)) out.set(s, [k, ph]); };
      const fr = (l, c) => (finC[l] || 0) * (iniC[c] || 0) + 1;
      // B1: ranh giới chưa chứng nhận (+ cả chữ, nếu chữ đó ít người có)
      const words = new Set();
      for (const x of names.values()) {
        if (x.cert.every(Boolean)) continue;
        if (x.one) { words.add(x.w[0]); continue; }
        x.w.forEach((wd, j) => { if (wd.length >= 2 && ((j > 0 && !x.cert[j - 1]) || (j < x.w.length - 1 && !x.cert[j]))) words.add(wd); });
        for (let j = 0; j < x.cert.length; j++) if (!x.cert[j]) { const b = bestAt(x, j, true); if (b) add1(b[0], b[1], 1); }
      }
      words.forEach((wd) => { if (wd.length >= 2 && !done.has(wd)) { const k = subCount(wd); if (est(k) < cap) add1(wd, k, 1); } });
      if (!out.size) {                                            // B2 xen kẽ B3
        const b2 = new Map(), b3 = [];
        for (const x of names.values()) { if (!x.one) for (let j = 0; j < x.cert.length; j++) { const b = bestAt(x, j, false); if (b && !done.has(b[0]) && !b2.has(b[0]) && !covered(b[0])) b2.set(b[0], b[1]); } }
        for (const l of FIN) for (const c of INI) { const s = l + " " + c; if (!cnt.has(s) && !done.has(s) && !covered(s)) b3.push([s, fr(l, c)]); }
        const l2 = Array.from(b2).sort((a, b) => b[1] - a[1]); b3.sort((a, b) => b[1] - a[1]);
        for (let i = 0; i < Math.max(l2.length, b3.length); i++) { if (l2[i]) add1(l2[i][0], -i * 2, 2); if (b3[i]) add1(b3[i][0], -i * 2 - 1, 3); }
      }
      if (!out.size) {                                            // B4
        for (const l of FIN) for (const c of INI) {
          const s = l + " " + c; if (done.get(s) !== true && !(cnt.has(s) && est(cnt.get(s)) >= cap)) continue;
          for (const c2 of NXT[c] || "") { const s2 = s + c2; if (!cnt.has(s2)) add1(s2, fr(l, c), 4); }
        }
      }
      plan = Array.from(out, ([s, v]) => [s, v[0], v[1]]).sort((a, b) => (RK[a[2]] - RK[b[2]]) || (b[1] - a[1]) || (a[0].length - b[0].length));
      dirty = 0;
    }
    function pick() {
      while (seeds.length) { const s = seeds.shift(); if (!done.has(s) && !covered(s)) { st.seed++; return s; } }
      if (dirty >= 3 || !plan.length) mkPlan();
      for (;;) {
        while (plan.length) { const [s, , ph] = plan.shift(); if (done.has(s) || covered(s)) continue; st["p" + ph]++; dirty++; return s; }
        if (!dirty) return null;                                  // vừa lập kế hoạch mà rỗng -> hết ứng viên
        mkPlan();
      }
    }
    // kết quả 1 truy vấn: r = { names:[họ tên trả về], sat: chạm trần? }
    function result(q, r) {
      done.set(q, !!(r && r.sat)); st.q++; if (r && r.sat) st.sat++;
      ((r && r.names) || []).forEach((n) => add(n, true));
      if (r && !r.sat) { nonSat.push(q); names.forEach((x) => certify(x, q)); }
    }
    return { pick, result, add, st, names, done, K, mark: (q) => done.set(q, null), fail: (q) => { done.set(q, true); st.err++; } };
  }
  // vòng chạy song song: o = { E, Q(q) -> {names, sat}, conc, budget, need() -> còn thiếu?, signal }
  // -> st (+ stop: full / exhausted / budget / abort / errors / fatal, used: số truy vấn)
  function runEnum(o) {
    const E = o.E; let live = 0, used = 0, errRun = 0, stopped = "", ended = false;
    const spent = () => (o.used ? o.used() : used);               // đã tiêu: số request thật (nếu bên gọi đếm) / số truy vấn
    return new Promise((resolve) => {
      const fin = () => { if (!live && !ended) { ended = true; resolve(Object.assign(E.st, { stop: stopped || "exhausted", used: spent() })); } };
      const pump = () => {
        while (!stopped && live < (o.conc || CONC_Q)) {
          if (o.signal && o.signal.aborted) { stopped = "abort"; break; }
          if (!o.need()) { stopped = "full"; break; }
          if (spent() >= (o.budget || BUDGET)) { stopped = "budget"; break; }
          const q = E.pick(); if (!q) { if (!live) stopped = "exhausted"; break; }
          E.mark(q); used++; live++;
          Promise.resolve().then(() => o.Q(q)).then((r) => { errRun = 0; E.result(q, r); },
            (e) => {
              if (e && (e.aborted || e.cancelled)) { stopped = stopped || "abort"; return; }
              E.fail(q); if (e && e.fatal) stopped = stopped || "fatal"; else if (++errRun >= 6) stopped = stopped || "errors";
              if (!o.err) o.err = e;
            })
            .then(() => { live--; pump(); });
        }
        fin();
      };
      pump();
    });
  }

  // ---------- gọi ô tìm kiếm: thử lại khi lỗi mạng / 5xx / 429 (chờ lâu dần) · 401/403 -> thôi hẳn ----------
  const stuOf = (r) => { const d = r && r.data !== undefined ? r.data : r; return Array.isArray(d) ? d : d && typeof d === "object" ? (Array.isArray(d.students) ? d.students : []) : []; };
  const allOf = (r) => { const d = r && r.data !== undefined ? r.data : r; if (Array.isArray(d)) return d.length; if (!d || typeof d !== "object") return 0; return ["students", "teachers", "orphans"].reduce((n, k) => n + (Array.isArray(d[k]) ? d[k].length : 0), 0); };
  const sidOf = (p) => (p ? (p.id != null ? p.id : "") + ":" + ((p.enrollment && (p.enrollment.id != null ? p.enrollment.id : p.enrollment.classroom && p.enrollment.classroom.id)) || "") : "");
  async function callSearch(q, year, extra, sig, run) {
    for (let i = 0; ; i++) {
      if (sig && sig.aborted) throw abortErr();
      if (run) run.req = (run.req || 0) + 1;              // đếm request thật (cả lần thử lại / lật trang) cho ngân sách
      try { return await BGL.searchRaw(q, year, extra, { signal: sig }); }
      catch (e) {
        if ((e && (e.aborted || e.cancelled)) || (sig && sig.aborted)) throw abortErr();
        const s = (e && e.status) || 0;
        if (s === 401 || s === 403) { try { e.fatal = true; } catch {} throw e; }
        if ((s >= 400 && s < 500 && s !== 408 && s !== 429) || i >= 2) throw e;
        await sleep(s === 429 ? 1500 * (i + 1) + Math.random() * 1000 : 500 * (i + 1), sig);
      }
    }
  }
  // thăm dò 1 lần / 7 ngày: máy chủ có bỏ dấu không · có cho xin nhiều hơn 20 em (per_page…) · có phân trang (page / offset) không
  const ROUND = [25, 30, 40, 50, 60, 75, 100, 120, 150, 200, 250, 300, 400, 500];
  const capsGet = () => { const v = store.get(CAP_KEY, null), u = ukey(); return v && u && v.u === u && v.mode && Date.now() - (Number(v.at) || 0) < CAP_MS ? v : null; };
  async function probe(year, sig, chk, run) {
    const old = capsGet(); if (old) return { caps: old, base: null, r1: null };
    let base = "nguyen", r1 = await callSearch(base, year, null, sig, run); chk();
    let a1 = stuOf(r1);
    const ai = a1.some((p) => { const n = (p && (p.name || p.full_name)) || ""; return low(n).indexOf("nguyen") < 0 && fold(n).indexOf("nguyen") >= 0; });
    if (!a1.length) { base = "nguyễn"; r1 = await callSearch(base, year, null, sig, run); chk(); a1 = stuOf(r1); }
    const caps = { u: ukey(), at: Date.now(), ai, mode: "cap", cap: Math.max(SCAP, a1.length), per: a1.length || SCAP, pg: false };
    if (a1.length >= SCAP) {
      const ids = new Set(a1.map(sidOf)), fresh = (r) => stuOf(r).some((p) => !ids.has(sidOf(p)));
      const r2 = await callSearch(base, year, BIG, sig, run); chk(); const n2 = stuOf(r2).length;
      if (n2 > a1.length) { caps.mode = "big"; caps.cap = ROUND.indexOf(n2) >= 0 ? n2 : Math.max(1000, n2); }
      else if (fresh(await callSearch(base, year, { page: 2 }, sig, run))) caps.mode = "page";
      else { chk(); if (fresh(await callSearch(base, year, { offset: a1.length }, sig, run))) caps.mode = "offset"; }
      chk();
    }
    store.set(CAP_KEY, caps);
    return { caps, base, r1 };
  }

  // ---------- lưu máy: danh sách gọn theo tài khoản + niên khóa ----------
  function saveAll(rows, meta) {
    const u = ukey(); if (!u || !meta || meta.live || !Array.isArray(rows)) return false;
    const pack = rows.map((r) => [r.id, r.pid, r.cid, r.name, r.cn, r.birth || "", r.gender || "", r.result || "", r.cname || "", r.g || "", (r.ph || PH0).join("|"), r.cvp === 0 ? 0 : 1]);
    const cl = meta.year === curYear() ? classList() : null;   // lớp gọn [id, tên, khối, số em theo kết quả, xem được] -> mở app là có đủ thẻ lớp
    return store.set(ALL_KEY, { v: 1, u, y: meta.year, at: meta.at || 0, done: !!meta.done, ab: meta.aborted ? 1 : 0, n: meta.target || 0, miss: meta.missing || 0, src: meta.source || "", sk: meta.skippedClasses || 0, dr: meta.drop || [], rows: pack,
      cl: cl ? cl.filter((c) => c && c.id != null).map((c) => [c.id, c.name || "", c.family || "", c.enrollments_overview || null, c.can_view === false ? 0 : 1]) : null });
  }
  function unpack(a) {
    if (!Array.isArray(a) || a[1] == null) return null;
    const ph = String(a[10] || "").split("|"); while (ph.length < 3) ph.push("");
    const p = { id: a[1], name: a[3] || "", christian_name: a[4] || "", birth_date: a[5] || null, gender: a[6] || null, phone: ph[2] || null, data: { parents_info: { father_phone: ph[0] || null, mother_phone: ph[1] || null } } };
    if (a[11] === 0) p.can_view_profile = false;
    return { id: a[0], pid: a[1], cid: a[2], name: a[3] || "", cn: a[4] || "", birth: a[5] || "", gender: a[6] || "", result: a[7] || "", cname: a[8] || "", g: a[9] || "", ph: ph.slice(0, 3), cvp: a[11] === 0 ? 0 : 1, p };
  }
  function loadAll(year) {
    const v = store.get(ALL_KEY, null), u = ukey();
    if (!v || v.v !== 1 || !u || v.u !== u || v.y !== year || !Array.isArray(v.rows)) return null;
    const rows = sortRows(v.rows.map(unpack).filter(Boolean));
    if (Array.isArray(v.cl) && !(CLS && CLS.y === year)) keepCls(year, v.cl.filter(Array.isArray).map((a) => ({ id: a[0], name: a[1] || "", family: a[2] || "", enrollments_overview: a[3] && typeof a[3] === "object" ? a[3] : null, can_view: a[4] !== 0, year })));
    return { rows, meta: { year, longYear: longYearOf(year), source: v.src || "cache", at: Number(v.at) || 0, done: !!v.done, aborted: !!v.ab, target: v.n || 0, missing: v.miss || 0, cached: true, skippedClasses: v.sk || 0, failedClasses: 0, partial: !v.done, truncated: false, drop: Array.isArray(v.dr) ? v.dr : [] } };
  }
  const dropAll = () => { try { localStorage.removeItem(ALL_KEY); localStorage.removeItem(CAP_KEY); } catch {} };

  // ---------- TẢI cả niên khóa: phần xem được (như cũ) + dò phần còn lại qua tìm kiếm ----------
  let RUN = null, FORCE = false;                 // lượt tải đang chạy { ac, found, target(), year } · bấm "Tải lại" -> bỏ qua danh sách lưu còn mới
  const EXTRA = new Map();                       // em tìm thấy bằng "Bắt đầu tìm" (gộp vào mọi danh sách sau đó)
  async function fetchStudents(prog) {
    const year = curYear(), g0 = TabLoad.gen, run = RUN = { ac: mkAC(), year, found: null, target: () => 0, live: liveTick, req: 0 };
    const chk = () => { if (TabLoad.gen !== g0) { const e = new Error("Đã huỷ"); e.cancelled = true; throw e; } };   // đăng xuất giữa chừng -> thôi gọi tiếp
    let at = 0;
    // frac: phần đã xong (0..1) · step: cỡ bước đang chạy (TabLoad cho % nhích dần trong bước) -> prog(frac/step, 1/step)
    const report = (frac, step) => { at = Math.max(at, Math.min(1, frac || 0)); step = Math.max(0.002, Math.min(1, step || 0.1)); if (typeof prog === "function") prog(at / step, 1 / step); };
    const force = FORCE; FORCE = false;
    try { return await loadYear(run, year, chk, report, () => at, force); }
    finally { if (RUN === run) RUN = null; if (onStudents()) try { paintLive(); } catch {} }
  }
  async function loadYear(run, year, chk, report, atNow, force) {
    const canSearch = typeof BGL.searchRaw === "function" && !!ukey();
    const old = valid() ? { rows: S._students, meta: S._studentsMeta } : loadAll(year);   // danh sách trước (bộ nhớ / máy)
    const m0 = old && old.meta, ts = TabLoad.st && TabLoad.st.students;
    const fresh = !!(m0 && m0.done && m0.at && Date.now() - m0.at < STALE_MS);
    if (fresh && !force && ts && ts.okAt) { const d = dataOf(); if (d) return d; }        // đã tải trong phiên này, còn mới, không ai sửa -> khỏi gọi mạng
    // 1) phần xem được (API cả năm / từng lớp) — dữ liệu đầy đủ nhất
    const scale = canSearch && (prefOn(year) || (m0 && m0.source === "search")) ? 0.12 : 1;
    let own = null, ownErr = null;
    try { own = await fetchOwn(year, chk, (f, s) => report(f * scale, s * scale)); }
    catch (e) { if (e && e.cancelled) throw e; if (!canSearch) throw e; ownErr = e; }
    chk();
    const om = own && own.meta, whole = !!(om && !om.skippedClasses && !om.failedClasses && !om.partial && !om.truncated);
    if (own && (whole || !canSearch)) {                    // xem được cả niên khóa (Ban Điều Hành…) / máy chủ không có tìm kiếm -> như trước
      if (whole) Object.assign(om, { done: true, at: Date.now() });
      return { rows: own.rows, meta: om };
    }
    // 2) danh sách lưu còn mới (< 12 giờ): chỉ thay các lớp vừa xem được bằng dữ liệu mới
    if (fresh && !force) {
      const seen = new Set((om && om.viewed) || []), map = new Map();
      if (own) own.rows.forEach((r) => put(map, r));
      old.rows.forEach((r) => { if (!seen.has(String(r.cid))) put(map, r); });
      return { rows: sortRows(Array.from(map.values())), meta: Object.assign({}, m0, { cached: false, live: false }) };
    }
    // 3) dò cả niên khóa qua tìm kiếm
    return viaSearch(run, year, chk, report, atNow, own, ownErr, old);
  }
  async function viaSearch(run, year, chk, report, atNow, own, ownErr, old) {
    const sig = run.ac.signal, found = run.found = new Map(), fromQ = new Set(), seenSt = new Set();
    if (own) own.rows.forEach((r) => put(found, r));
    EXTRA.forEach((r) => { if (r.y == null || r.y === year) put(found, r); });
    let classes = own && own.classes;
    if (!classes) { try { const v = sameYear(S._classes, year) ? S._classes : await BGL.classrooms(year); classes = Array.isArray(v) ? v : null; } catch (e) { if (e && e.cancelled) throw e; } chk(); }
    keepCls(year, classes);
    const T = totalsOf(classes);
    // số em cần tìm: tổng các lớp — bỏ kết quả (vd. Nghỉ Luôn) mà ô tìm kiếm có vẻ không trả (đã thấy ≥ nửa mà chưa gặp em nào)
    // drop(): các kết quả bị trừ — thẻ lớp trừ y như vậy cho "đã tải / tổng" khớp số cần tìm
    const drop = () => { const out = []; if (T.all && fromQ.size >= T.all * 0.5) for (const s in T.by) if (!seenSt.has(s) && T.by[s] >= 3) out.push(s); return out; };
    const tgt = () => (T.all ? drop().reduce((n, s) => n - T.by[s], T.all) : 0);
    const need = () => { const t = tgt(); return !t || found.size < t; };
    run.target = tgt; run.drop = drop;
    const a0 = Math.min(0.15, atNow());
    let E = null;
    const rep = () => { const t = tgt(), f = t ? Math.min(1, found.size / t) : Math.min(0.95, (E ? E.st.q : 0) / 450); report(a0 + (1 - a0) * f, (1 - a0) / Math.max(20, t || 450)); if (run.live) run.live(); };
    const finish = (stop, err) => {
      const aborted = stop === "abort", bad = stop === "errors" || stop === "fatal" || stop === "probe";
      if (bad && !fromQ.size) {                            // tìm kiếm hỏng ngay từ đầu
        if (old || !found.size) throw err || ownErr || new Error("Không tải được danh sách học sinh");
      }
      const map = new Map(found);
      if ((aborted || bad) && old) old.rows.forEach((r) => put(map, r));   // dừng giữa chừng: giữ danh sách cũ, thêm em vừa dò được
      const t = tgt(), done = !aborted && !bad;
      const meta = { year, longYear: longYearOf(year), source: "search", done, aborted, partial: !done, at: done ? Date.now() : (old && old.meta.at) || 0,
        target: t, missing: done && t ? Math.max(0, t - found.size) : 0, queries: E ? E.st.q : 0, stop, classCount: T.n, skippedClasses: 0, failedClasses: 0, truncated: false, drop: drop() };
      return { rows: sortRows(Array.from(map.values())), meta };
    };
    rep();
    let pr;
    try { pr = await probe(year, sig, chk, run); }
    catch (e) { if (e && e.cancelled && !e.aborted) throw e; return finish(e && e.aborted ? "abort" : "probe", e); }
    const caps = pr.caps, K = caps.ai ? fold : low;
    const absorbRes = (r, names) => {
      let added = 0;
      stuOf(r).forEach((p) => { const x = fromSearch(p); if (!x || (x.y != null && x.y !== year)) return; names.push(x.name); fromQ.add(keyOf(x)); if (x.result) seenSt.add(x.result); if (put(found, x)) added++; });
      return added;
    };
    const Q = async (q) => {
      const names = []; let page = 1, sat = false, nz = 0;
      for (;;) {
        await sleep(15 + Math.random() * 60, sig);           // rải nhẹ, đỡ dồn máy chủ
        const extra = caps.mode === "big" ? BIG : page > 1 ? (caps.mode === "page" ? { page } : { offset: (page - 1) * caps.per }) : null;
        const r = await callSearch(q, year, extra, sig, run); chk();
        const n = stuOf(r).length, added = absorbRes(r, names), tot = r && r.meta ? Number(r.meta.total_count != null ? r.meta.total_count : r.meta.total) || 0 : 0;
        if (allOf(r) > caps.cap) caps.pg = true;             // trần tính riêng từng nhóm (thiếu nhi / GLV…)
        let full = n >= caps.cap || (!caps.pg && allOf(r) >= caps.cap);
        if (tot > 0 && caps.mode !== "page" && caps.mode !== "offset") full = tot > n;
        if (!full) break;
        if (caps.mode !== "page" && caps.mode !== "offset") { sat = true; break; }
        // lật trang: đủ số em -> thôi ngay (trước đây lật tiếp tới hết truy vấn dù lượt dò đã xong)
        // · 2 trang LIỀN không có em mới mới coi là bão hoà: 1 trang trùng hay gặp khi 2 truy vấn rộng chạy song song,
        //   dừng ở đó làm sót em ở các trang sau -> cuối lượt phải dò bù hàng trăm truy vấn nhỏ (rõ nhất khi CONC_Q = 2)
        nz = added ? 0 : nz + 1;
        if (!need() || (page > 1 && nz >= 2) || page >= 40 || run.req >= BUDGET) { sat = true; break; }
        page++;
      }
      rep();
      return { names, sat };
    };
    E = makeEnum({ K, cap: caps.cap, seeds: (caps.cap >= 500 || caps.mode === "page" || caps.mode === "offset" ? BROAD : []).concat(SEEDS),
      hints: old ? old.rows.map((r) => r.name) : [], found: Array.from(found.values(), (r) => r.name), target: tgt });
    if (pr.r1) { const names = [], n1 = stuOf(pr.r1).length; absorbRes(pr.r1, names); E.result(K(pr.base), { names, sat: n1 >= SCAP || caps.mode !== "cap" }); }   // trang mặc định: chưa xin nhiều / chưa lật trang
    rep();
    const ro = { E, Q, conc: CONC_Q, budget: BUDGET, used: () => run.req, signal: sig, need };
    const st = await runEnum(ro);
    chk();
    return finish(st.stop, ro.err);
  }

  // cache: S._students (mảng đã chuẩn hoá, đã sắp) + S._studentsMeta — chỉ dùng khi đúng niên khóa đang xem
  const valid = () => Array.isArray(S._students) && !!S._studentsMeta && S._studentsMeta.year === curYear();
  const full = () => valid() && !S._studentsMeta.failedClasses && !S._studentsMeta.partial;   // cache đủ (lần trước không lớp nào lỗi)
  let memo = null;
  // dữ liệu cho TabLoad: bộ nhớ -> không có thì lấy bản lưu máy (mở tab là thấy ngay) · cùng dữ liệu -> cùng 1 object (khỏi vẽ lại)
  function dataOf() {
    if (!valid()) { const c = loadAll(curYear()); if (c) { c.rows.forEach((r) => rememberPerson(r.p)); S._students = c.rows; S._studentsMeta = c.meta; } }
    if (!valid()) return null;
    if (!memo || memo.rows !== S._students || memo.meta !== S._studentsMeta) memo = { rows: S._students, meta: S._studentsMeta };
    return memo;
  }
  // em tìm thấy bằng "Bắt đầu tìm" mà danh sách chưa có -> thêm vào (không mất khi lượt tải dở ghi đè)
  function withExtra(rows) {
    if (!EXTRA.size) return rows;
    const map = new Map(rows.map((r) => [keyOf(r), r])); let add = 0;
    EXTRA.forEach((r, k) => { if (r.y != null && r.y !== curYear()) return; if (map.has(k)) absorb(map.get(k), r); else { map.set(k, r); add++; } });
    return add ? sortRows(Array.from(map.values())) : rows;
  }
  TabLoad.def("students", {
    data: dataOf,
    // chỉ "im lặng" (không % ở icon) khi danh sách đã đủ và còn mới; còn thiếu / cũ -> lượt dò dài -> hiện %
    silent: () => { const m = S._studentsMeta; return !!(dataOf() && m && m.done && !m.partial && !m.aborted && !(m.missing > 0) && m.at && Date.now() - m.at < STALE_MS); },
    fetch: fetchStudents,
    save: (d) => {
      if (d && d === memo) return;
      let rows = (d && Array.isArray(d.rows)) ? d.rows : [];
      rows = withExtra(rows); rows.forEach((r) => rememberPerson(r.p));
      S._students = rows; S._studentsMeta = (d && d.meta) || null;
      if (S._studentsMeta) saveAll(rows, S._studentsMeta);
    },
  });

  // ---------- lọc: từ khoá (tên / tên thánh / lớp, không dấu; chữ số = SĐT) + ngành ----------
  // cls: lớp đang mở (#/students/<id>) · cc: số em đã tải theo lớp · ck: chỗ cuộn của lưới thẻ lúc bấm vào lớp · pv: màn vừa vẽ (thẻ / lớp / tìm)
  const V0 = () => ({ q: "", g: "*", data: null, meta: null, list: [], byG: {}, cnt: new Map(), sc: new Map(), n: 0, shown: 0, lastBox: null, lastCid: null, ft: 0, keep: null, keys: null, keysFor: null, sq: null, live: false, lt: 0,
    cls: null, cc: new Map(), cvN: 0, ck: null, pv: null, csig: null, cst: null, pushed: false });
  const V = Object.assign(V0(), { io: null, sentinel: null, tick: 0 });
  // "Ngọc 0908, an" -> { name: ["ngoc","an"], raw: ["Ngọc","an"], phone: ["0908"] } · chữ số ≥ 3 = SĐT
  function parseKw(q) {
    const out = { name: [], raw: [], phone: [] };
    String(q || "").split(/[\s,;]+/).forEach((t) => {
      t = t.trim(); if (!t) return;
      const d = t.replace(/[+().\-]/g, "");
      if (/^\d{3,}$/.test(d)) { const p = phoneNorm(d); if (out.phone.indexOf(p) < 0) out.phone.push(p); return; }
      const n = noAccent(t); if (n && out.name.indexOf(n) < 0) { out.name.push(n); out.raw.push(t); }
    });
    return out;
  }
  function keysOf(data) {
    if (V.keysFor !== data) {
      V.keys = data.map((r) => { const n = noAccent(r.name); return { n, sp: " " + n + " ", c: noAccent(r.cn), k: noAccent(r.cname), gv: noAccent(given(r.name)), ph: (r.ph || PH0).map((x) => [x, phoneNorm(x)]).filter((x) => x[1]) }; });
      V.keysFor = data;
    }
    return V.keys;
  }
  // khớp ÍT NHẤT 1 từ khoá; xếp: khớp đủ mọi từ khoá -> số từ khớp -> trùng đúng TÊN -> trùng cả chữ -> tên -> họ tên
  function filterRows(data, q, g) {
    const kw = parseKw(q), n = kw.name.length + kw.phone.length, keys = n ? keysOf(data) : null, list = [], byG = { "*": 0 }, cnt = new Map(), sc = new Map();   // không từ khoá -> khỏi tính khoá tìm
    for (let i = 0; i < data.length; i++) {
      const r = data[i], k = keys ? keys[i] : null;
      let s = null;
      if (n) {
        let m = 0, ex = 0, w = 0, phm = "";
        const lab = new Set();
        for (const t of kw.name) {
          if (k.n.indexOf(t) >= 0) { m++; lab.add("Tên"); if (k.gv === t) ex = 1; if (k.sp.indexOf(" " + t + " ") >= 0) w++; }
          else if (k.c.indexOf(t) >= 0) { m++; lab.add("Tên thánh"); }
          else if (k.k.indexOf(t) >= 0) { m++; lab.add("Lớp"); }
        }
        for (const t of kw.phone) { const hit = k.ph.find((x) => x[1].indexOf(t) >= 0); if (hit) { m++; lab.add("SĐT"); if (!phm) phm = hit[0]; } }
        if (!m) continue;
        s = { m, all: m === n ? 1 : 0, ex, w, lab: Array.from(lab), phm };
      }
      byG["*"]++; byG[r.g] = (byG[r.g] || 0) + 1;
      if (g !== "*" && r.g !== g) continue;
      list.push(r); if (s) sc.set(r, s);
      const c = String(r.cid); cnt.set(c, (cnt.get(c) || 0) + 1);
    }
    if (n) {
      const gk = new Map(list.map((r) => [r, given(r.name)]));
      list.sort((a, b) => { const x = sc.get(a), y = sc.get(b); return (y.all - x.all) || (y.m - x.m) || (y.ex - x.ex) || (y.w - x.w) || cmp(gk.get(a), gk.get(b)) || cmp(a.name, b.name) || keyOf(a).localeCompare(keyOf(b)); });
    }
    return { list, byG, cnt, sc, n, kw };
  }
  const groupsOf = (data) => { const s = new Set(); (data || []).forEach((r) => s.add(r.g)); return GROUPS.filter((x) => x.k !== "" || s.has("")); };

  // ---------- vẽ ----------
  const noteHtml = (m) => {
    m = m || {}; if (m.live) return "";
    const parts = [], mini = []; let retry = false, warn = false;
    if (m.source !== "search" && m.skippedClasses) { parts.push(`${m.skippedClasses} lớp bạn không được xem danh sách thiếu nhi nên không có ở đây.`); mini.push(`${m.skippedClasses} lớp không xem được`); }
    if (m.failedClasses) { parts.push(`Không tải được ${m.failedClasses} lớp.`); mini.push(`lỗi ${m.failedClasses} lớp`); retry = warn = true; }
    if (m.aborted) { parts.push("Đã dừng tải để tìm nhanh — mở lại tab Học sinh để tải tiếp."); mini.push("đã dừng để tìm nhanh"); retry = true; }
    else if (m.partial) { parts.push("Mạng chập chờn — chưa tải được hết danh sách."); mini.push("chưa tải hết (mạng chập chờn)"); retry = warn = true; }
    if (m.done && m.missing > 0) { parts.push(`Còn khoảng ${m.missing} em chưa dò ra (máy chủ chỉ cho tìm theo tên) — gõ tên rồi bấm Bắt đầu tìm.`); mini.push(`~${m.missing} em chưa dò ra — gõ tên để tìm`); }
    if (m.truncated) { parts.push("Danh sách quá dài — chỉ hiện một phần."); mini.push("chỉ hiện một phần"); }
    if (!parts.length) return "";
    // 1 dòng nhỏ (bấm "i" xem đủ lý do) — không chiếm cả khung như thẻ note
    return `<div class="stu-mini${warn ? " warn" : ""}" title="${esc(parts.join(" "))}">${ic(warn ? "warn" : "key", 14)}<span class="grow">${esc(mini.join(" · ") || "Danh sách chưa đủ")}</span>${retry ? `<a class="link" onclick="stuRetry()">${m.aborted ? "Tải tiếp" : "Thử lại"}</a>` : ""}</div>`;
  };
  // 3 màn trong tab: "k" lưới thẻ lớp (mặc định) · "s" kết quả tìm (có từ khoá) · "c:<id>" danh sách 1 lớp
  const kwN = (q) => { const k = parseKw(q); return k.name.length + k.phone.length; };
  const viewKey = () => (V.cls != null ? "c:" + V.cls : kwN(V.q) ? "s" : "k");
  const cview = () => V.cls == null && !V.n;
  const gid = (r) => (V.n ? (V.sc.get(r) && V.sc.get(r).all ? "A" : "B") : "C");
  const header = (r) => {
    if (!V.n) return "";                                   // trong 1 lớp, không từ khoá: 1 khối (đầu lớp nằm ở #stuHead)
    const all = gid(r) === "A", k = V.list.filter((x) => (V.sc.get(x) || {}).all === (all ? 1 : 0)).length;
    return `<div class="sec-eyebrow stu-h"><span class="eyebrow">${all ? "Khớp đủ từ khoá" : "Khớp một phần"} · ${k}</span></div>`;
  };
  const rowHtml = (r) => {
    const s = V.n ? V.sc.get(r) : null, G = grp(r.g);
    const extra = s ? `<span class="stu-ng ${G.cls}">${esc(G.label)}</span>${s.lab.map((l) => `<span class="stu-lab">${esc(l)}</span>`).join("")}${s.phm ? phoneChip(s.phm, r.name) : ""}` : "";
    return `<div class="stu-row" data-pid="${esc(String(r.pid))}" role="button" tabindex="0">${avatar({ id: r.pid, name: r.name }, { size: 40, fs: 14 })}
    <div class="grow">${r.cn ? `<div class="faint stu-cn">${esc(r.cn)}</div>` : ""}<div class="nm stu-nm">${esc(r.name || "—")}</div>
      <div class="muted stu-sub">${V.cls == null ? esc(r.cname || "") : ""}${extra}${r.birth ? `<span class="stu-dob">${ic("cake", 12)} ${esc(fmtDate(r.birth))}</span>` : ""}</div></div>
    ${r.result ? `<span class="chip ${RESULT_CLS[r.result] || "st-quit"} stu-res">${esc(r.result)}</span>` : ""}</div>`;
  };
  const canSearchUI = () => typeof BGL.searchRaw === "function";

  // ---------- LƯỚI THẺ LỚP: "Khai Tâm A · 10/26" = đã tải 10 / lớp có 26 em — đang dò thì số nhảy dần ----------
  const countBy = (rows) => { const m = new Map(); rows.forEach((r) => { if (r.cid == null) return; const c = String(r.cid); m.set(c, (m.get(c) || 0) + 1); }); return m; };
  const dropNow = () => new Set((RUN && RUN.drop ? RUN.drop() : V.meta && V.meta.drop) || []);
  // tổng 1 lớp = tổng enrollments_overview (như số cần tìm của bộ dò: trừ kết quả ô tìm kiếm không trả, vd. Nghỉ Luôn) · null: không rõ
  const ovSum = (c, drop) => { const ov = c && c.enrollments_overview; if (!ov || typeof ov !== "object") return null; let n = 0; for (const k in ov) if (!drop.has(k)) n += Number(ov[k]) || 0; return n; };
  const ini = (n) => { const w = String(n || "").trim().split(/\s+/).filter(Boolean); return w.length ? (((w.length > 1 && w[w.length - 2][0]) || "") + w[w.length - 1][0]).toUpperCase() : "?"; };   // như initials() của app.js
  const clsIco = (x) => { const k = (typeof classThemeKey === "function" && classThemeKey({ name: x.name })) || x.g; return `<div class="cico${k ? " t-" + k : ""}">${esc(ini(x.name))}</div>`; };   // Hỗ Trợ: đen dù thuộc nhóm Khác
  // mọi lớp của niên khóa (cả lớp chưa tải được em nào) + lớp chỉ thấy qua dữ liệu em · lớp mình trước, rồi Chiên -> Ấu -> Thiếu -> Nghĩa -> Khác, tên lớp
  function cardsOf() {
    const cl = classList(), mine = myCids(), drop = dropNow(), seen = new Set(), out = [];
    (cl || []).forEach((c) => { if (!c || c.id == null) return; const id = String(c.id); if (seen.has(id)) return; seen.add(id); out.push({ id, name: String(c.name || ""), g: nganhOf(c.family, c.name), t: ovSum(c, drop) }); });
    (V.data || []).forEach((r) => { if (r.cid == null) return; const id = String(r.cid); if (seen.has(id)) return; seen.add(id); out.push({ id, name: r.cname || "", g: r.g || "", t: null }); });
    out.forEach((x) => { x.n = V.cc.get(x.id) || 0; x.mine = mine.has(x.id) ? 1 : 0; });
    return out.sort((a, b) => (b.mine - a.mine) || ((GORD[a.g] ?? 5) - (GORD[b.g] ?? 5)) || cmp(a.name, b.name) || a.id.localeCompare(b.id));
  }
  // ok: đủ em (đã tải ≥ tổng) hoặc lượt dò đã xong (không tìm thêm được nữa -> chỉ ghi số em, khỏi "25/26" gây hiểu lầm)
  function cardSt(x) {
    const done = !!(V.meta && V.meta.done) && !V.live && !TabLoad.running("students");
    const ok = (x.t != null && x.n >= x.t) || done, pct = ok ? 100 : x.t ? Math.min(100, Math.round((x.n / x.t) * 100)) : 0;
    const kn = ok || x.t == null ? `${x.n} em${ok ? " " + ic("check", 13) : ""}` : `<b>${x.n}</b>/${x.t}`;
    return { ok, pct, kn, key: kn + "|" + pct };
  }
  const cardHtml = (x, s) => `<div class="stu-card${x.g ? " t-" + x.g : ""}${x.mine ? " mine" : ""}" data-cid="${esc(x.id)}" role="button" tabindex="0">${clsIco(x)}
    <div class="grow"><div class="stu-cname">${esc(x.name || "Chưa rõ lớp")}</div><div class="stu-kn num${s.ok ? " ok" : ""}" id="stuK-${esc(x.id)}">${s.kn}</div></div>
    <div class="stu-bar"><i id="stuB-${esc(x.id)}"${s.ok ? ' class="ok"' : ""} style="width:${s.pct}%"></i></div></div>`;
  // full: vẽ lại cả lưới · không: chỉ sửa chữ + thanh của thẻ ĐỔI số (bộ lớp đổi -> tự vẽ lại cả lưới)
  function paintCards(full) {
    const box = $("stuList"); if (!box) return;
    const cs = cardsOf().filter((x) => V.g === "*" || (x.g || "") === V.g), st = cs.map(cardSt);
    const sig = V.g + "|" + cs.map((x) => x.id + (x.mine ? "*" : "")).join(",");
    if (full || V.csig !== sig || !cs.length || !$("stuK-" + cs[0].id)) {
      V.csig = sig; V.cst = new Map(cs.map((x, i) => [x.id, st[i].key]));
      if (!cs.length) { box.innerHTML = emptyBox(ic(IC.kids ? "kids" : "users", 44), V.data && V.data.length ? "Không có lớp trong nhóm này" : "Chưa có học sinh", TabLoad.running("students") ? "Danh sách đang tải…" : ""); return; }
      let html = "", sec;
      cs.forEach((x, i) => {
        const k = V.g === "*" ? (x.mine ? "*" : x.g || "") : null;   // "Tất cả": tiêu đề nhỏ theo ngành (lớp mình đứng đầu)
        if (k !== null && k !== sec) { sec = k; const n = cs.filter((y) => (y.mine ? "*" : y.g || "") === k).length; html += `<div class="sec-eyebrow stu-h stu-gh"><span class="eyebrow">${k === "*" ? "Lớp của bạn" : esc(grp(k).label)} · ${n} lớp</span></div>`; }
        html += cardHtml(x, st[i]);
      });
      box.innerHTML = `<div class="stu-cards">${html}</div>`;
      return;
    }
    cs.forEach((x, i) => {
      const s = st[i]; if (V.cst.get(x.id) === s.key) return; V.cst.set(x.id, s.key);
      const k = $("stuK-" + x.id), b = $("stuB-" + x.id);
      if (k) { k.innerHTML = s.kn; k.className = "stu-kn num" + (s.ok ? " ok" : ""); }
      if (b) { b.style.width = s.pct + "%"; b.className = s.ok ? "ok" : ""; }
    });
  }
  // đầu màn 1 lớp: ‹ + tên lớp + "25/26" (đang dò thì nhảy số) + Mở lớp
  function paintHead() {
    const el = $("stuHead"); if (!el) return;
    if (V.cls == null) { if (el.innerHTML) el.innerHTML = ""; return; }
    const x = cardsOf().find((c) => c.id === V.cls) || { id: V.cls, name: "Lớp", g: "", t: null, n: 0 }, s = cardSt(x), k = $("stuCK"), b = $("stuCB");
    if (k && el.dataset.cid === V.cls) { if (k.innerHTML !== s.kn) { k.innerHTML = s.kn; k.className = "stu-kn num" + (s.ok ? " ok" : ""); } if (b) { b.style.width = s.pct + "%"; b.className = s.ok ? "ok" : ""; } return; }
    el.dataset.cid = V.cls;
    el.innerHTML = `<div class="stu-ch${x.g ? " t-" + x.g : ""}"><button class="stu-back" onclick="stuBack()" aria-label="Về danh sách lớp">${ic("back", 20)}</button>${clsIco(x)}
      <div class="grow"><div class="stu-ctn">${esc(x.name || "Lớp")}</div><div class="stu-kn num${s.ok ? " ok" : ""}" id="stuCK">${s.kn}</div></div>
      <a class="link stu-open" data-cid="${esc(V.cls)}" onclick="stuOpenCls(this.dataset.cid)">Mở lớp</a>
      <div class="stu-bar"><i id="stuCB"${s.ok ? ' class="ok"' : ""} style="width:${s.pct}%"></i></div></div>`;
  }
  // đang dò: gộp em vừa tìm thấy (RUN.found) vào danh sách đang hiện -> số em từng lớp chỉ tăng, không tụt khi vẽ lại
  function withLive(rows) {
    const R = RUN; if (!R || !R.found || !R.found.size || R.year !== curYear()) return rows;
    const have = new Set(rows.map(keyOf)), add = [];
    R.found.forEach((r, k) => { if (!have.has(k)) add.push(r); });
    return add.length ? sortRows(rows.concat(add)) : rows;
  }

  function draw(d) {
    if (V.live && $("stuList") && d && d.rows && d.rows.length && !(d.meta && d.meta.live)) { V.live = false; return update(d); }   // đang hiện phần dò dở -> nối tiếp, không vẽ lại cả màn
    stopIO();
    V.live = !!(d && d.meta && d.meta.live);
    V.data = withLive(withExtra((d && d.rows) || [])); V.meta = (d && d.meta) || {};
    const pc = V.cls; V.cls = routeCid(); if (pc !== V.cls) V.q = "";   // vào / ra 1 lớp: bỏ từ khoá (tìm trong lớp chỉ dùng trong lớp đó)
    if (V.g !== "*" && !groupsOf(V.data).some((x) => x.k === V.g)) V.g = "*";
    const m = V.meta, bar = appbar({ title: "Học sinh", bell: true, action: `<button class="act" id="stuReloadBtn" onclick="stuReload()" aria-label="Tải lại danh sách">${ic("refresh", 20)}</button><button class="act" onclick="go('#/search')" aria-label="Tìm kiếm">${ic("search", 20)}</button>` });
    if (!V.data.length && !canSearchUI()) {                // máy chủ không có tìm kiếm & chưa có em nào: chỉ ghi chú + hộp trống (như trước)
      const none = m.classCount > 0 && m.skippedClasses >= m.classCount;
      screen(bar + `<main><div class="wrap">${noteHtml(none ? Object.assign({}, m, { skippedClasses: 0 }) : m)}${none
        ? emptyBox(ic("key", 44), "Chưa xem được thiếu nhi lớp nào", "Tài khoản của bạn chỉ xem được thiếu nhi của lớp mình được phân công.")
        : emptyBox(ic(IC.kids ? "kids" : "users", 44), "Chưa có học sinh", `Niên khóa ${m.longYear || longYearOf(curYear())} chưa có thiếu nhi nào.`)}</div></main>`, "students");
      return;
    }
    screen(bar + `<main><div class="wrap">
        <div class="stu-sbar"><label class="searchbar">${ic("search", 18)}<input id="stuq" placeholder="${V.cls != null ? "Tìm trong lớp này…" : "Tên, SĐT phụ huynh…"}" autocomplete="off" enterkeyhint="search" value="${esc(V.q)}" oninput="stuFilter(this.value)" onkeydown="if(event.key==='Enter'){event.preventDefault();stuGo()}"/></label>
          <button class="btn sm stu-go" onclick="stuGo()">Bắt đầu tìm</button></div>
        <div class="rev-status filterbar" id="stuChips"></div>
        <div class="muted stu-count"><span id="stuCount"></span><a class="link" id="stuReload" onclick="stuReload()">Tải lại danh sách</a></div>
        <div id="stuNote">${noteHtml(m)}</div>
        <div id="stuHead"></div>
        <div class="stu-list" id="stuList"></div>
        <div class="stu-more" id="stuMore" aria-hidden="true"></div>
      </div></main>`, "students");
    bindList();
    const vk = viewKey(), moved = V.pv !== vk; V.pv = vk;
    const k = V.keep; V.keep = null;                       // quay lại từ hồ sơ: vẽ đủ số em lúc trước + cuộn về chỗ cũ
    const back = k && k.v === vk && k.q === V.q && k.g === V.g && Date.now() - k.at < 30 * 60e3;
    refresh(back ? Math.max(FIRST, k.n) : FIRST);
    let y = back ? k.y : -1;
    if (!back && moved) { if (vk === "k") { const c = V.ck; V.ck = null; y = c && c.g === V.g ? c.y : 0; } else y = 0; }   // thẻ -> lớp: lên đầu · lớp -> thẻ: về đúng chỗ cũ của lưới
    if (y >= 0) { try { requestAnimationFrame(() => window.scrollTo(0, y)); } catch {} }
  }
  // làm mới ở nền thấy dữ liệu đổi: giữ ô lọc + số em đang hiện (không giật cuộn)
  function update(d) {
    const had = V.data && V.data.length;
    if (!had || !$("stuList") || !(d && d.rows && d.rows.length)) return draw(d);
    V.live = !!(d.meta && d.meta.live);
    V.data = withLive(withExtra(d.rows)); V.meta = d.meta || {};
    if (V.g !== "*" && !groupsOf(V.data).some((x) => x.k === V.g)) V.g = "*";
    const n = $("stuNote"); if (n) n.innerHTML = noteHtml(V.meta);
    refresh(Math.max(FIRST, V.shown));
  }
  // vẽ lại màn hiện tại theo dữ liệu + lọc: lưới thẻ / kết quả tìm (khắp các lớp, theo chip ngành) / 1 lớp (lọc trong lớp)
  function refresh(n) {
    if (!V.data) return;
    V.cc = countBy(V.data);
    const cv = V.cls != null, f = filterRows(cv ? V.data.filter((r) => String(r.cid) === V.cls) : V.data, V.q, cv ? "*" : V.g);
    V.list = f.list; V.sc = f.sc; V.n = f.n;
    if (cv) V.cvN = V.cc.get(V.cls) || 0; else { V.byG = f.byG; V.cnt = f.cnt; }
    paintChips(); paintCount(); paintHead();
    if (cview()) { stopIO(); V.shown = 0; const s = $("stuMore"); if (s) s.style.display = "none"; return paintCards(true); }
    renderList(n || FIRST);
  }
  function paintChips() {
    const el = $("stuChips"); if (!el) return;
    const gs = groupsOf(V.data), sl = el.scrollLeft || 0;
    el.style.display = V.cls == null && V.data && V.data.length ? "" : "none";   // .rev-status là flex nên không dùng hidden · trong 1 lớp: ẩn
    const chip = (k, label, cls) => `<button class="pick ${V.g === k ? "on " + cls : ""}" data-g="${k}" onclick="stuGroup('${k}')">${esc(label)} <b class="num">${V.byG[k] || 0}</b></button>`;
    el.innerHTML = chip("*", "Tất cả", "st-quit") + gs.map((x) => chip(x.k, x.label, x.cls)).join("");
    el.scrollLeft = sl;
  }
  function paintCount() {
    const el = $("stuCount"); if (!el || !V.data) return;
    const all = V.data.length, n = V.list.length, filtered = V.n > 0 || V.g !== "*", loading = TabLoad.running("students");
    let s = V.cls != null ? (V.n ? `${n} / ${V.cc.get(V.cls) || 0} em trong lớp` : `${all} học sinh · ${(V.meta && V.meta.longYear) || longYearOf(curYear())}`)
      : `${filtered ? `${n} / ${all}` : all} học sinh · ${(V.meta && V.meta.longYear) || longYearOf(curYear())}`;
    if (loading) { const R = RUN, t = R && R.target ? R.target() : 0; s += R && R.found && t ? ` · đang tải ${Math.min(Math.max(R.found.size, all), t)}/${t}` : " · đang tải…"; }   // tải lại: không tụt số đã có
    if (V.sq) s += " · đang tìm trên máy chủ…";
    el.textContent = s;
    const a = $("stuReload"); if (a) a.style.display = loading ? "none" : "";
    const rb = $("stuReloadBtn"); if (rb) rb.classList.toggle("stu-spin", !!loading);   // nút tải lại trên thanh: xoay khi đang tải
  }
  const paintLive = () => { paintCount(); if (cview()) paintCards(false); else if (V.cls != null) paintHead(); };
  // vẽ lại từ đầu (đổi lọc / dữ liệu): xoá danh sách, vẽ n em đầu, lắng nghe cuộn để vẽ tiếp
  function renderList(n) {
    const box = $("stuList"); if (!box) return;
    clearTimeout(V.tick); V.tick = 0;
    V.shown = 0; V.lastBox = null; V.lastCid = null;
    const q = V.q.trim(), loading = TabLoad.running("students");
    box.innerHTML = V.list.length ? "" : emptyBox(ic("search", 44), q ? `Không có học sinh khớp “${q}”` : V.cls != null ? (loading ? "Chưa tải được em nào của lớp này" : "Lớp chưa có học sinh") : V.data && V.data.length ? "Không có học sinh trong nhóm này" : "Chưa có học sinh",
      q && V.sq ? "Đang tìm thêm trên máy chủ…" : q && loading && V.cls == null ? "Danh sách còn đang tải — bấm Bắt đầu tìm để tìm ngay trên máy chủ." : V.cls != null && loading ? "Danh sách đang tải — em nào tải xong sẽ hiện ngay." : "");
    appendRows(n || FIRST); watch();
  }
  // nối thêm tối đa n em TIẾP THEO (luôn tính từ V.shown -> không trùng, không sót): em cùng nhóm với khối cuối thì chèn vào khối đó
  function appendRows(n) {
    const box = $("stuList"); if (!box) return 0;
    const from = V.shown, end = Math.min(V.list.length, from + n); if (end <= from) return 0;
    let html = "", tail = "", rows = "", open = false, cur = V.lastCid;
    for (let i = from; i < end; i++) {
      const r = V.list[i], cid = gid(r);
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
    const left = !cview() && V.shown < V.list.length; s.style.display = left ? "" : "none";
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
    if (!s || !s.isConnected || !$("stuList") || cview()) return stopIO();   // đã rời màn / đang ở lưới thẻ -> thôi theo dõi
    if (!entries.some((e) => e.isIntersecting)) return;
    appendRows(CHUNK); watch();
  }
  function stopIO() { if (V.io) { try { V.io.disconnect(); } catch {} } V.io = null; V.sentinel = null; clearTimeout(V.tick); V.tick = 0; }
  // bấm thẻ lớp -> danh sách lớp · bấm 1 em -> hồ sơ (tab Học sinh vẫn sáng; hồ sơ rút gọn nhờ rememberPerson) · "Mở lớp" -> màn lớp
  function bindList() {
    const box = $("stuList"); if (!box) return;
    const pick = (ev) => {
      const t = ev.target; if (!t || !t.closest) return;
      if (t.closest(".phone")) return;                     // bấm SĐT -> bảng gọi / Zalo (phoneChip tự xử lý)
      const cd = t.closest(".stu-card"); if (cd) { stuClass(cd.dataset.cid); return; }
      const o = t.closest(".stu-open"); if (o) { stuOpenCls(o.dataset.cid); return; }
      const row = t.closest(".stu-row"); if (!row) return;
      remember();
      if (typeof window.openPerson === "function") window.openPerson(row.dataset.pid, "students"); else go("#/person/" + encodeURIComponent(row.dataset.pid));
    };
    box.addEventListener("click", pick);
    box.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); pick(ev); } });
  }
  const remember = () => { V.keep = { y: window.scrollY || 0, n: V.shown, q: V.q, g: V.g, v: viewKey(), at: Date.now() }; };

  // ---------- đang dò: số trên thẻ lớp / đầu lớp nhảy theo thời gian thực (~LIVE_MS) · chưa có gì -> vẽ phần đã tìm thấy ----------
  function liveApply() {
    V.lt = 0;
    const R = RUN; if (!R || !R.found || !onStudents()) return;
    if (!$("stuList")) {                                   // màn đang khung xương (lần đầu, chưa có danh sách) -> vẽ phần đã dò
      if (R.found.size) draw({ rows: sortRows(Array.from(R.found.values())), meta: { year: R.year, longYear: longYearOf(R.year), source: "search", live: true } });
      return;
    }
    if (!V.data) return;
    const nd = withLive(V.data);
    if (nd === V.data) return paintLive();                 // không có em mới: chỉ cập nhật số / trạng thái
    V.data = nd; V.cc = countBy(nd);
    if (V.cls != null) {                                   // đang mở 1 lớp: em mới của lớp -> nối vào cuối (không xếp lại dưới tay)
      const c = V.cc.get(V.cls) || 0;
      if (c !== V.cvN) {
        if (V.n || !V.list.length) refresh(Math.max(FIRST, V.shown));
        else {
          const have = new Set(V.list.map(keyOf)), add = nd.filter((r) => String(r.cid) === V.cls && !have.has(keyOf(r)));
          V.cvN = c; if (add.length) { V.list = V.list.concat(add); appendRows(V.list.length - V.shown); watch(); }
        }
      }
      return paintLive();
    }
    if (V.n) return paintCount();                          // đang xem kết quả tìm: không xếp lại dưới tay
    const f = filterRows(nd, V.q, V.g); V.list = f.list; V.byG = f.byG; V.cnt = f.cnt;
    paintChips(); paintLive();
  }
  const liveTick = () => { if (!V.lt) V.lt = setTimeout(liveApply, LIVE_MS); };

  // ---------- "Bắt đầu tìm": danh sách đủ -> lọc tại máy · đang tải / chưa đủ -> DỪNG lượt tải, hỏi máy chủ theo từng từ khoá ----------
  function stopLoad() {
    const R = RUN; if (!R || !R.ac) return false;
    try { TabLoad.invalidate("students"); } catch {}      // xong (dở) -> lần vào tab sau tải lại từ đầu
    try { R.ac.abort(); } catch {}
    return true;
  }
  async function serverSearch(kw) {
    if (V.sq) { try { V.sq.ac.abort(); } catch {} }      // giết lượt tìm trước
    const ac = mkAC(), me = V.sq = { ac }, year = curYear(), caps = capsGet();
    const qs = []; kw.raw.forEach((t, i) => { if (kw.name[i].length >= 2) qs.push(t); }); if (kw.raw.length > 1) qs.push(kw.raw.join(" "));
    if (!qs.length) { V.sq = null; return 0; }
    paintCount();
    const res = await Promise.all(qs.map((q) => callSearch(q, year, caps && caps.mode === "big" ? BIG : null, ac.signal).then((r) => ({ r }), (e) => ({ e }))));
    if (V.sq !== me) return 0;                             // đã có lượt tìm mới hơn
    V.sq = null;
    const rows = []; let bad = 0;
    res.forEach((x) => { if (x.e) { if (!(x.e.aborted || x.e.cancelled)) bad++; return; } stuOf(x.r).forEach((p) => { const r = fromSearch(p); if (r && (r.y == null || r.y === year)) rows.push(r); }); });
    const added = addRows(rows, year);
    if (bad && bad === res.length) { try { toast("Không tìm được trên máy chủ — kiểm tra mạng rồi thử lại."); } catch {} }
    if (onStudents() && $("stuList")) { if (added) V.data = withExtra(V.data || []); refresh(Math.max(FIRST, V.shown)); }
    return added;
  }
  // gộp kết quả tìm vào danh sách đang có (bộ nhớ + bản lưu máy) và EXTRA
  function addRows(rows, year) {
    if (!rows.length) return 0;
    rows.forEach((r) => { rememberPerson(r.p); const k = keyOf(r); if (EXTRA.has(k)) absorb(EXTRA.get(k), r); else EXTRA.set(k, r); });
    let added = 0;
    if (valid()) {
      const map = new Map(S._students.map((r) => [keyOf(r), r]));
      rows.forEach((r) => { if (put(map, r)) added++; });
      if (added) { S._students = sortRows(Array.from(map.values())); saveAll(S._students, S._studentsMeta); }
    } else added = rows.length;
    if (RUN && RUN.found && RUN.year === year) rows.forEach((r) => put(RUN.found, r));
    return added;
  }

  // ---------- onclick ----------
  function stuFilter(q) {
    V.q = String(q == null ? "" : q); clearTimeout(V.ft);
    V.ft = setTimeout(() => { V.ft = 0; if ($("stuList")) refresh(FIRST); }, 140);   // gõ liên tục -> lọc 1 lần khi ngừng tay
  }
  function stuGo() {
    const inp = $("stuq"); if (inp) { V.q = String(inp.value || ""); try { inp.blur(); } catch {} }   // ẩn bàn phím
    clearTimeout(V.ft); V.ft = 0;
    const kw = parseKw(V.q), m = V.meta || {}, loading = TabLoad.running("students");
    if (V.cls == null) {                                   // trong 1 lớp: chỉ lọc tại máy (không dừng lượt tải các lớp đang chờ)
      if (loading && (kw.name.length || kw.phone.length)) stopLoad();   // "kill cái cũ": dừng dò cả danh sách, tìm ngay
      if (kw.name.length && canSearchUI() && (loading || !m.done || m.missing > 0)) serverSearch(kw);
    }
    if ($("stuList")) refresh(FIRST);
    try { window.scrollTo(0, 0); } catch {}
  }
  function stuGroup(g) { V.g = g == null ? "*" : String(g); try { haptic(6); } catch {} clearTimeout(V.ft); V.ft = 0; if ($("stuList")) refresh(FIRST); }
  // bấm thẻ lớp -> #/students/<id> (nhớ chỗ cuộn của lưới để Back về đúng chỗ) · lớp xong trước thì xem trước, lớp khác vẫn tải ngầm
  function stuClass(cid) {
    if (cid == null || cid === "") return;
    V.ck = { y: window.scrollY || 0, g: V.g, at: Date.now() }; V.pushed = true;
    try { haptic(6); } catch {}
    go("#/students/" + encodeURIComponent(cid));
  }
  // ‹ về lưới thẻ: vào lớp từ lưới -> history.back() (y như nút Back Android / vuốt) · mở thẳng link lớp -> về #/students
  function stuBack() {
    try { haptic(6); } catch {}
    if (V.pushed && routeCid() != null) { V.pushed = false; try { if (typeof history !== "undefined" && history.length > 1) { history.back(); return; } } catch {} }
    go("#/students");
  }
  function stuOpenCls(cid) { if (cid == null || cid === "") return; remember(); go("#/class/" + encodeURIComponent(cid)); }
  // "Thử lại" / "Tải tiếp" trong ghi chú: tải lại ngay (bỏ qua 15 s vừa tải), màn vẽ lại khi xong
  function stuRetry() {
    const src = TabLoad.src.students; if (!src) return;
    if (!TabLoad.running("students")) TabLoad.run("students", src.fetch, { silent: false, save: src.save });   // người dùng bấm tải lại / thử lại -> có % ở icon khi rời tab
    render();
  }
  // "Tải lại danh sách": bỏ qua bản lưu còn mới, dò lại cả niên khóa
  function stuReload() {
    if (TabLoad.running("students")) return toast("Đang tải danh sách…");
    FORCE = true; stuRetry();
  }
  // #/students (lưới thẻ) · #/students/<id lớp> (1 lớp) — render() của app.js gọi lại mỗi lần đổi hash
  window.studentsScreen = function studentsScreen() {
    // chuyển thẻ ⇄ lớp ngay trong tab, không có lượt tải nào đang chạy -> vẽ tại chỗ (khỏi gọi TabLoad.load = khỏi tải lại máy chủ)
    if ($("stuList") && V.data && !TabLoad.running("students") && V.cls !== routeCid()) { draw(dataOf() || { rows: V.data, meta: V.meta }); return; }
    stopIO(); V.live = false;
    const p = tabScreen("students", { title: "Học sinh", what: "danh sách học sinh", draw, update });
    if (!$("stuList") && RUN && RUN.found && RUN.found.size) liveApply();   // lần đầu đang dò (khung xương): vẽ ngay phần đã có, khỏi chờ nhịp sau
    return p;
  };
  // đăng xuất: dừng lượt tải / tìm, bỏ cache (bộ nhớ + máy) + observer + hẹn giờ + bộ lọc (người đăng nhập sau không thấy gì của người trước)
  window.resetStudents = function resetStudents() {
    stopIO(); clearTimeout(V.ft); clearTimeout(V.lt);
    if (RUN) { try { RUN.ac.abort(); } catch {} RUN = null; }
    if (V.sq) { try { V.sq.ac.abort(); } catch {} }
    FORCE = false; EXTRA.clear(); memo = null; CLS = null; dropAll();
    S._students = S._studentsMeta = null;
    Object.assign(V, V0());
  };
  window.stuFilter = stuFilter; window.stuGroup = stuGroup; window.stuRetry = stuRetry; window.stuGo = stuGo; window.stuReload = stuReload;
  window.stuClass = stuClass; window.stuBack = stuBack; window.stuOpenCls = stuOpenCls;
  // rời màn Học sinh -> ngắt observer ngay (onIO cũng tự ngắt khi mốc không còn trên trang)
  window.addEventListener("hashchange", () => { if (!/^#\/students(\/|$)/.test(location.hash)) { stopIO(); clearTimeout(V.ft); V.ft = 0; V.live = false; V.pv = null; } });

  // ---------- CSS riêng (index.html không có) ----------
  try {
    if (!document.getElementById("stu-css")) {
      const st = document.createElement("style"); st.id = "stu-css";
      st.textContent = `.stu-list>.stu-h:first-child{margin-top:6px}
.stu-mini{display:flex;align-items:center;gap:7px;margin:0 4px 10px;font-size:12.5px;color:var(--ink-faint);line-height:1.3}.stu-mini svg{flex:none}.stu-mini.warn svg{color:var(--late-t)}.stu-mini .link{flex:none;font-weight:700}
.act.stu-spin svg{animation:stuSpin .9s linear infinite}@keyframes stuSpin{to{transform:rotate(360deg)}}
.stu-h{justify-content:space-between}.stu-h .eyebrow{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.stu-open{font-size:12.5px;flex:none;padding:4px 2px}
.stu-grp{overflow:hidden}
.stu-row{display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
.stu-row+.stu-row{border-top:1px solid var(--line)}
.stu-row:active{background:var(--fill)}
.stu-row:focus-visible{outline:2px solid var(--brand-2);outline-offset:-2px}
.stu-cn{font-size:11.5px;line-height:1.25}
.stu-nm{font-weight:700;font-size:15px}
.stu-sub{font-size:12px;margin-top:1px;display:flex;flex-wrap:wrap;gap:2px 8px;align-items:center}
.stu-dob{display:inline-flex;align-items:center;gap:3px}
.stu-res{padding:5px 9px;font-size:11.5px;flex:none}
.stu-more{height:1px}
.stu-sbar{display:flex;gap:8px;align-items:center;margin:2px 0 12px}
.stu-sbar .searchbar{flex:1;min-width:0;margin:0}
.stu-sbar .stu-go{flex:none;min-height:46px;padding:8px 14px}
.stu-count{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 6px 12px;font-size:13px}
.stu-count .link{font-size:12.5px;flex:none;white-space:nowrap}
.stu-ng,.stu-lab{display:inline-flex;align-items:center;padding:1px 7px;border-radius:999px;font-size:10.5px;font-weight:700;line-height:1.5}
.stu-lab{background:var(--fill);color:var(--ink-soft);box-shadow:inset 0 0 0 1px var(--line)}
.stu-sub .phone{font-size:12px}
.stu-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:6px}
.stu-cards>.stu-gh{grid-column:1/-1;margin:14px 6px 0}.stu-cards>.stu-gh:first-child{margin-top:2px}
.stu-card{position:relative;display:flex;align-items:center;gap:9px;min-width:0;padding:10px 10px 14px;border-radius:var(--r-m);background:var(--bubble);border:1px solid var(--bubble-line);box-shadow:var(--bubble-hi),var(--bubble-shadow);cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:transform .3s;--k:var(--brand-2)}
.stu-card:active{transform:scale(.96);transition-duration:.1s}
.stu-card:focus-visible{outline:2px solid var(--brand-2);outline-offset:2px}
.stu-card.t-pink,.stu-ch.t-pink{--k:#db2777}.stu-card.t-green,.stu-ch.t-green{--k:#16a34a}.stu-card.t-blue,.stu-ch.t-blue{--k:#2563eb}.stu-card.t-gold,.stu-ch.t-gold{--k:#d97706}
.stu-card.mine{border-color:var(--k);box-shadow:0 0 0 1.5px var(--k),var(--bubble-shadow)}
.stu-card .cico,.stu-ch .cico{width:34px;height:34px;border-radius:12px;font-size:12.5px}
.stu-card .grow,.stu-ch .grow{min-width:0}
.stu-cname{font-weight:700;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stu-kn{display:flex;align-items:center;gap:3px;margin-top:2px;font-size:12.5px;color:var(--ink-soft);white-space:nowrap}
.stu-kn b{color:var(--ink);font-weight:800;font-size:13.5px}
.stu-kn.ok{color:var(--present-t);font-weight:700}
.stu-bar{position:absolute;left:10px;right:10px;bottom:6px;height:3px;border-radius:99px;background:var(--fill-2);overflow:hidden}
.stu-bar i{display:block;height:100%;width:0;border-radius:99px;background:var(--k);transition:width .35s ease}
.stu-bar i.ok{background:var(--present-t)}
.stu-ch{position:relative;display:flex;align-items:center;gap:10px;margin:0 2px 12px;padding:2px 2px 12px}
.stu-ch .stu-bar{left:2px;right:2px;bottom:2px}
.stu-back{flex:none;width:38px;height:38px;border:0;border-radius:50%;display:grid;place-items:center;padding:0;background:var(--fill);color:var(--ink);box-shadow:inset 0 0 0 1px var(--line);cursor:pointer;-webkit-tap-highlight-color:transparent}
.stu-back:active{transform:scale(.9)}
.stu-ctn{font-weight:800;font-size:16.5px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.st-pink{background:rgba(236,72,153,.15);color:#be185d}
.st-brown{background:rgba(139,90,43,.16);color:#8b5a2b}
:root[data-theme="dark"] .st-brown,:root.auto-dark .st-brown{background:rgba(192,133,82,.22);color:#e2b48a}
.pick.on.st-brown{background:rgba(139,90,43,.16);color:#8b5a2b}
:root[data-theme="dark"] .pick.on.st-brown,:root.auto-dark .pick.on.st-brown{background:rgba(192,133,82,.22);color:#e2b48a}
:root[data-theme="dark"] .st-pink,:root.auto-dark .st-pink{background:rgba(244,114,182,.2);color:#f9a8d4}
.pick.on.st-pink{background:rgba(236,72,153,.15);color:#be185d}
:root[data-theme="dark"] .pick.on.st-pink,:root.auto-dark .pick.on.st-pink{background:rgba(244,114,182,.2);color:#f9a8d4}`;
      (document.head || document.documentElement).appendChild(st);
    }
  } catch {}

  // cho test (node:vm) — không dùng trong app
  window.__stu = { norm, fromSearch, usable, keyOf, collect, absorb, sortRows, expectedOf, totalsOf, filterRows, parseKw, nganhOf, groupsOf, fetchStudents, fetchOwn, makeEnum, runEnum, probe, saveAll, loadAll, dataOf,
    appendRows, renderList, refresh, draw, update, watch, stopIO, stopLoad, serverSearch, addRows, stuGo, liveApply, cardsOf, paintCards, paintHead, withLive, routeCid, classList, cls: () => CLS,
    V, EXTRA, run: () => RUN, PER, MAX_PAGES, FIRST, CHUNK, LIVE_MS, BUDGET, SEEDS, ALL_KEY, CAP_KEY, DENY_KEY };
})();
