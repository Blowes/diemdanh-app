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

async function req(method, path, { params, body, _retried } = {}) {
  const url =
    (path.startsWith("http") ? path : `${API_BASE}/${path.replace(/^\//, "")}`) +
    qs(params);
  const t0 = Date.now();
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: "include",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-Api-Client-Key": CLIENT_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (netErr) {
    dbgLog({ t: new Date().toISOString(), method, url, status: 0, ms: Date.now() - t0, req: body || null, res: null, err: "Network: " + netErr.message });
    throw netErr;
  }

  // access_token hết hạn -> refresh 1 lần rồi retry
  if (res.status === 401 && !_retried && !path.includes("auth/login")) {
    dbgLog({ t: new Date().toISOString(), method, url, status: 401, ms: Date.now() - t0, req: body || null, res: null, err: "401 -> thử refresh token" });
    const r = await fetch(`${API_BASE}/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: { "X-Api-Client-Key": CLIENT_KEY },
    });
    if (r.ok) return req(method, path, { params, body, _retried: true });
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  const errMsg = res.ok ? null : ((data && data.error) || `Lỗi ${res.status}`);
  dbgLog({ t: new Date().toISOString(), method, url, status: res.status, ms: Date.now() - t0, req: body || null, res: (text || "").slice(0, 1500), err: errMsg });
  if (!res.ok) { const e = new Error(errMsg); e.status = res.status; throw e; }
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
