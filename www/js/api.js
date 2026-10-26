// ============================================================
//  BGL API client — gọi trực tiếp https://api.bglmautam.com
//  Auth: cookie HttpOnly (access_token ~15', refresh_token ~7d)
//  Header bắt buộc: X-Api-Client-Key
// ============================================================
const API_BASE = "https://api.bglmautam.com";
const CLIENT_KEY =
  "787ec34e0946e14880486a94ae8140ec7d2de0cfd1986228af62d01304837c13";

// ---- Debug logger (mặc định tắt) ----
const DBG = { enabled: false, logs: [], max: 300 };
try { DBG.enabled = localStorage.getItem("bgl-debug") === "1"; } catch {}
function dbgLog(e) { if (!DBG.enabled) return; DBG.logs.push(e); if (DBG.logs.length > DBG.max) DBG.logs.shift(); }
window.BGL_DBG = DBG;

// Build query string, hỗ trợ filters lồng: {filters:{a_eq:1}} -> filters[a_eq]=1
function qs(params) {
  if (!params) return "";
  const p = new URLSearchParams();
  const add = (k, v) => {
    if (v === undefined || v === null) return;
    if (typeof v === "object") {
      for (const kk in v) add(`${k}[${kk}]`, v[kk]);
    } else p.append(k, v);
  };
  for (const k in params) add(k, params[k]);
  const s = p.toString();
  return s ? `?${s}` : "";
}

// ---- Hết giờ chờ: 15s (ghi 30s). fetch bị CapacitorHttp vá: GET đi qua fetch thật (nhận signal),
//      POST/PUT/DELETE gọi native KHÔNG nhận signal -> đua với đồng hồ, kết quả về muộn bị bỏ qua ----
const API_TIMEOUT = 15000;
const apiNetErr = (msg, extra) => Object.assign(new Error(msg), { status: 0 }, extra);
function apiFetch(url, opts, ms) {
  let ac = null, tm; try { ac = new AbortController(); } catch {}
  const run = fetch(url, ac ? Object.assign({}, opts, { signal: ac.signal }) : opts).then((res) => res.text().then((text) => ({ res, text })));
  run.catch(() => {});   // về muộn sau khi đã hết giờ -> nuốt lỗi, không thành unhandled rejection
  const to = new Promise((_, rej) => { tm = setTimeout(() => { try { ac && ac.abort(); } catch {} rej(apiNetErr("Máy chủ không phản hồi — kiểm tra mạng rồi thử lại.", { timeout: true })); }, ms || API_TIMEOUT); });
  return Promise.race([run, to]).finally(() => clearTimeout(tm));
}
// Có phản hồi từ máy chủ (ok) / lỗi mạng -> app.js hiện chấm "mất kết nối"
function apiNetEv(ok) { try { window.dispatchEvent(new CustomEvent("bgl-net", { detail: { ok } })); } catch {} }

// ---- Phiên đăng nhập: 401 -> refresh token (MỘT lượt dùng chung cho mọi request 401 cùng lúc)
//      -> hỏng thì BGL.onAuthLost() (app.js: đăng nhập lại ngầm bằng tài khoản đã lưu) -> vẫn hỏng thì phát "bgl-session-expired"
//      true: đã gia hạn · false: hết phiên · null: lỗi mạng (chưa chắc hết phiên)
let _apiRefresh = null, _apiSessionGen = 0, _apiAuthLost = false;   // _apiSessionGen: tăng mỗi lần gia hạn phiên thành công
function apiRefreshSession() {
  if (_apiRefresh) return _apiRefresh;
  _apiRefresh = (async () => {
    try {
      const { res } = await apiFetch(`${API_BASE}/v1/auth/refresh`, { method: "POST", credentials: "include", headers: { "X-Api-Client-Key": CLIENT_KEY } });
      if (res.ok) return true;
    } catch { return null; }
    if (!_apiAuthLost && typeof BGL.onAuthLost === "function") {
      try { if (await BGL.onAuthLost()) return true; } catch (e) { if (e && e.status === 0) return null; }
    }
    _apiAuthLost = true;   // mật khẩu đã lưu không còn đúng -> thôi thử ngầm cho tới lần đăng nhập thành công kế tiếp
    try { window.dispatchEvent(new CustomEvent("bgl-session-expired")); } catch {}
    return false;
  })().then((ok) => { if (ok) _apiSessionGen++; return ok; }).finally(() => { _apiRefresh = null; });
  return _apiRefresh;
}

async function req(method, path, { params, body, _retried } = {}) {
  const url =
    (path.startsWith("http") ? path : `${API_BASE}/${path.replace(/^\//, "")}`) +
    qs(params);
  const t0 = Date.now(), gen = _apiSessionGen, authPath = /auth\/(login|logout|refresh)/.test(path);
  let res, text;
  try {
    ({ res, text } = await apiFetch(url, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Client-Key": CLIENT_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    }, method === "GET" ? API_TIMEOUT : API_TIMEOUT * 2));
  } catch (e) {
    dbgLog({ t: new Date().toISOString(), method, url, status: 0, ms: Date.now() - t0, req: body || null, res: null, err: (e && e.timeout ? "Timeout: " : "Network: ") + (e && e.message) });
    apiNetEv(false);
    if (e && typeof e === "object" && e.status == null) try { e.status = 0; } catch {}
    throw e;
  }
  apiNetEv(true);

  // access_token hết hạn -> gia hạn phiên (dùng chung 1 lượt) rồi retry 1 lần
  if (res.status === 401 && !_retried && !authPath) {
    dbgLog({ t: new Date().toISOString(), method, url, status: 401, ms: Date.now() - t0, req: body || null, res: null, err: "401 -> thử refresh token" });
    const ok = gen !== _apiSessionGen ? true : await apiRefreshSession();   // phiên đã được gia hạn sau khi request này gửi đi -> chỉ cần gửi lại
    if (ok) return req(method, path, { params, body, _retried: true });
    if (ok === null) throw apiNetErr("Mất kết nối khi gia hạn phiên đăng nhập — thử lại.");
  }
  if (res.ok && /auth\/login/.test(path)) _apiAuthLost = false;

  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const errMsg = res.ok ? null : ((data && data.error) || `Lỗi ${res.status}`);
  dbgLog({ t: new Date().toISOString(), method, url, status: res.status, ms: Date.now() - t0, req: body || null, res: (text || "").slice(0, 1500), err: errMsg });
  if (!res.ok) { const e = new Error(errMsg); e.status = res.status; throw e; }   // 401 -> e.status = 401: vòng lặp bên gọi tự dừng
  return data;
}

const GET = (p, params) => req("GET", p, { params });
const POST = (p, body) => req("POST", p, { body });
const PUT = (p, body) => req("PUT", p, { body });
const DEL = (p) => req("DELETE", p);
const d = (r) => (r && r.data !== undefined ? r.data : r); // unwrap {data,meta}

const BGL = {
  API_BASE, CLIENT_KEY, GET, POST, PUT, DEL,

  // ---------- Auth ----------
  login: (username, password) =>
    POST("v1/auth/login", { username, password }).then(d),
  logout: () => POST("v1/auth/logout").catch(() => {}),
  me: () => GET("v1/auth/me").then(d),

  // ---------- Niên khóa ----------
  currentYear: () => GET("v1/academic_years/current").then(d),

  // ---------- Lớp học ----------
  classrooms: (year) =>
    GET("v1/classrooms", { filters: year ? { year_eq: year } : undefined, per_page: 300 }).then(d),
  classroom: (id) => GET(`v1/classrooms/${id}`).then(d),
  classroomEnrollments: (id) => GET(`v1/classrooms/${id}/enrollments`).then(d),

  // ---------- Thiếu nhi (enrollment) ----------
  enrollments: (filters) => GET("v1/enrollments", { filters, per_page: 300 }).then(d),
  // Thiếu nhi CẢ NIÊN KHÓA, 1 trang — giữ meta phân trang (web gọi y hệt, per_page 1000, chỉ mở cho Ban Điều Hành)
  // -> { rows, total, totalPages, perPage, page } · meta thiếu thì total/totalPages = 0 (bên gọi tự dừng khi trang ngắn)
  enrollmentsPage: (year, page, perPage) =>
    GET("v1/enrollments", { filters: { classroom_year_eq: year }, per_page: perPage || 250, page: page || 1 }).then((r) => {
      const rows = d(r), m = (r && r.meta) || {}, n = (v) => (Number(v) > 0 ? Math.floor(Number(v)) : 0);
      return { rows: Array.isArray(rows) ? rows : [], total: n(m.total_count ?? m.total), totalPages: n(m.total_pages ?? m.pages), perPage: n(m.per_page), page: n(m.current_page ?? m.page) || page || 1 };
    }),
  updateEnrollment: (id, payload) => PUT(`v1/enrollments/${id}`, { enrollment: payload }).then(d),
  createEnrollment: (payload) => POST("v1/enrollments", { enrollment: payload }).then(d),

  // ---------- Điểm danh ----------
  // Lấy điểm danh 1 lớp trong khoảng ngày (attendable_type mặc định Enrollment)
  attendancesByClass: (classroomId, date) =>
    GET("v1/attendances", { classroom_id: classroomId, start_date: date, end_date: date, per_page: 500 }).then(d),
  // Toàn bộ điểm danh của lớp trong 1 khoảng ngày (tự lật trang theo meta) — dùng cho Chuỗi học
  attendancesRange: async (classroomId, start, end) => {
    const out = []; let page = 1;
    for (;;) {
      const r = await GET("v1/attendances", { classroom_id: classroomId, start_date: start, end_date: end, per_page: 1000, page });
      const arr = d(r); if (Array.isArray(arr)) out.push(...arr);
      const m = (r && r.meta) || {};
      const total = Number(m.total_count) || 0, pages = Number(m.total_pages) || 0;
      if (!Array.isArray(arr) || !arr.length || !pages || page >= pages || (total && out.length >= total)) break;
      if (page >= 60) { out.truncated = true; break; }   // an toàn: đánh dấu thiếu thay vì im lặng
      page++;
    }
    return out;
  },
  attendancesFor: (type, id, dateGteq, dateLteq) =>
    GET("v1/attendances", {
      filters: { attendable_type_eq: type, attendable_id_eq: id, date_gteq: dateGteq, date_lteq: dateLteq },
      per_page: 500,
    }).then(d),
  createAttendance: (attendableType, attendableId, date, status) =>
    POST("v1/attendances", { attendance: { attendable_type: attendableType, attendable_id: attendableId, date, status } }).then(d),
  updateAttendance: (id, status) =>
    PUT(`v1/attendances/${id}`, { attendance: { status } }).then(d),
  deleteAttendance: (id) => DEL(`v1/attendances/${id}`),

  // ---------- Giáo lý viên (teaching assignment) ----------
  teachersByYear: (year) =>
    GET("v1/teaching_assignments", { filters: { classroom_year_eq: year }, per_page: 500 }).then(d),
  teachingByPerson: (personId) =>
    GET("v1/teaching_assignments", { filters: { person_id_eq: personId }, per_page: 200 }).then(d),
  teachingByClass: (classroomId) =>
    GET("v1/teaching_assignments", { filters: { classroom_id_eq: classroomId }, per_page: 200 }).then(d),

  // ---------- Người (person) ----------
  person: (id) => GET(`v1/people/${id}`).then(d),
  updatePerson: (id, payload) => PUT(`v1/people/${id}`, { person: payload }).then(d),

  // ---------- Tài khoản đăng nhập ----------
  myUser: () => GET("v1/users", { per_page: 100 }).then((r) => (d(r) || [])[0]),
  updateUser: (id, payload) => PUT(`v1/users/${id}`, { user: payload }).then(d),

  // ---------- Điểm số ----------
  createGrade: (name, value, enrollmentId) =>
    POST("v1/grades", { grade: { name, value, enrollment_id: enrollmentId } }).then(d),
  updateGrade: (id, name, value) => PUT(`v1/grades/${id}`, { grade: { name, value } }).then(d),

  // ---------- Nhận xét ----------
  createEvaluation: (content, evaluableType, evaluableId) =>
    POST("v1/evaluations", { evaluation: { content, evaluable_type: evaluableType, evaluable_id: evaluableId } }).then(d),
  updateEvaluation: (id, content) => PUT(`v1/evaluations/${id}`, { evaluation: { content } }).then(d),

  // ---------- Enum ----------
  attendanceStatuses: () => GET("v1/resource_types/attendance_status").then(d),
  enrollmentResults: () => GET("v1/resource_types/enrollment_result").then(d),
  teacherPositions: () => GET("v1/resource_types/teaching_assignment_position").then(d),

  // ---------- Tìm kiếm ----------
  // Web (bản 25/10/2026) gửi {query, year} và nhận {students, teachers, orphans}; giữ thêm q cho máy chủ bản cũ
  search: (q, year) => GET("v1/search", { query: q, q, year }).then(d),
};

window.BGL = BGL;
