#!/usr/bin/env python3
"""Kiểm tra nhanh các endpoint API bglmautam.com mà app + web đang dùng — CHỈ ĐỌC (GET).

Chạy:  python3 scripts/api_smoketest.py [số_điện_thoại] [--schema file.json]
Script hỏi số điện thoại + mật khẩu (mật khẩu không hiện khi gõ), đăng nhập, gọi lần lượt
các endpoint GET rồi đăng xuất. Chỉ in mã trạng thái, thời gian, số phần tử và TÊN trường —
không in dữ liệu cá nhân. Không gửi POST/PUT/DELETE nào làm thay đổi dữ liệu.
--schema: ghi cấu trúc response (tên trường + kiểu, KHÔNG có giá trị) ra file để so với app.
"""
import getpass
import http.cookiejar
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta

API = "https://api.bglmautam.com"
CLIENT_KEY = "787ec34e0946e14880486a94ae8140ec7d2de0cfd1986228af62d01304837c13"

jar = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))


def qs(params):
    out = []
    def add(k, v):
        if v is None:
            return
        if isinstance(v, dict):
            for kk, vv in v.items():
                add(f"{k}[{kk}]", vv)
        else:
            out.append((k, str(v)))
    for k, v in (params or {}).items():
        add(k, v)
    return ("?" + urllib.parse.urlencode(out)) if out else ""


def call(method, path, params=None, body=None):
    req = urllib.request.Request(API + "/" + path + qs(params), method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Accept": "application/json", "Content-Type": "application/json", "X-Api-Client-Key": CLIENT_KEY})
    t0 = time.time()
    try:
        with opener.open(req, timeout=30) as r:
            raw, status, ctype = r.read(), r.status, r.headers.get("Content-Type", "")
    except urllib.error.HTTPError as e:
        raw, status, ctype = e.read(), e.code, e.headers.get("Content-Type", "")
    except Exception as e:  # mạng / TLS
        return 0, None, f"{type(e).__name__}: {e}", int((time.time() - t0) * 1000)
    ms = int((time.time() - t0) * 1000)
    if "json" in ctype:
        try:
            return status, json.loads(raw or b"null"), ctype, ms
        except ValueError:
            pass
    return status, None, f"{ctype} {len(raw)} bytes", ms


def shape(js):
    """Mô tả cấu trúc, không lộ giá trị."""
    if js is None:
        return ""
    d = js.get("data", js) if isinstance(js, dict) else js
    if isinstance(d, list):
        keys = sorted(d[0].keys())[:14] if d and isinstance(d[0], dict) else []
        meta = js.get("meta") if isinstance(js, dict) else None
        tot = f" total={meta.get('total_count')}" if isinstance(meta, dict) and meta.get("total_count") is not None else ""
        return f"list[{len(d)}]{tot}" + (f" keys: {', '.join(keys)}" if keys else "")
    if isinstance(d, dict):
        parts = []
        for k in sorted(d.keys())[:16]:
            v = d[k]
            parts.append(f"{k}[{len(v)}]" if isinstance(v, list) else k)
        return "{" + ", ".join(parts) + "}"
    return type(d).__name__


rows = []
schemas = {}


def schema_of(v, depth=0):
    """Cấu trúc trường + kiểu, không giữ giá trị (gộp các phần tử của list)."""
    if depth > 8:
        return "…"
    if isinstance(v, dict):
        return {k: schema_of(x, depth + 1) for k, x in v.items()}
    if isinstance(v, list):
        merged = None
        for x in v[:200]:
            merged = merge_schema(merged, schema_of(x, depth + 1))
        return [merged] if merged is not None else []
    return "null" if v is None else type(v).__name__


def merge_schema(a, b):
    if a is None:
        return b
    if isinstance(a, dict) and isinstance(b, dict):
        out = dict(a)
        for k, v in b.items():
            out[k] = merge_schema(out.get(k), v) if k in out else v
        return out
    if isinstance(a, list) and isinstance(b, list):
        return [merge_schema(a[0] if a else None, b[0] if b else None)] if (a or b) else []
    if a == b:
        return a
    ta = set(a.split("|")) if isinstance(a, str) else {"object" if isinstance(a, dict) else "array"}
    tb = set(b.split("|")) if isinstance(b, str) else {"object" if isinstance(b, dict) else "array"}
    if isinstance(a, (dict, list)):
        return a
    if isinstance(b, (dict, list)):
        return b
    return "|".join(sorted(ta | tb))


def check(label, path, params=None, expect=(200,)):
    st, js, info, ms = call("GET", path, params)
    ok = "OK " if st in expect else "!! "
    err = (js or {}).get("error") if isinstance(js, dict) else None
    desc = shape(js) if st == 200 and js is not None else (err or info or "")
    rows.append((ok, st, ms, label, desc))
    schemas[label] = {"path": path, "status": st, "schema": schema_of(js) if js is not None else None}
    print(f"{ok} {st:>3} {ms:>5}ms  {label:<46} {desc}")
    return st, js


def main():
    args = sys.argv[1:]
    out = None
    if "--schema" in args:
        i = args.index("--schema")
        out = args[i + 1]
        del args[i:i + 2]
    user = args[0] if args else input("Số điện thoại: ").strip()
    pw = getpass.getpass("Mật khẩu (không hiện khi gõ): ")
    st, js, info, ms = call("POST", "v1/auth/login", body={"username": user, "password": pw})
    pw = None
    print(f"\nĐăng nhập: {st} ({ms}ms)")
    if st != 200:
        print("Đăng nhập thất bại:", (js or {}).get("error") if isinstance(js, dict) else info)
        return 1

    _, me = check("auth/me", "v1/auth/me")
    me = (me or {}).get("data", me) or {}
    pid = me.get("person_id")
    _, yr = check("academic_years/current", "v1/academic_years/current")
    yr = (yr or {}).get("data", yr) or {}
    year = yr.get("year") or (date.today().year if date.today().month >= 8 else date.today().year - 1)
    check("academic_years (danh sách, web admin)", "v1/academic_years", {"per_page": 100}, expect=(200, 403))

    _, mine = check("teaching_assignments?person_id_eq=tôi", "v1/teaching_assignments", {"filters": {"person_id_eq": pid}, "per_page": 200})
    mine = [t for t in ((mine or {}).get("data") or []) if (t.get("classroom") or {}).get("year") == year]
    cid = (mine[0]["classroom"]["id"] if mine else None)

    _, cls = check("classrooms?year_eq", "v1/classrooms", {"filters": {"year_eq": year}, "per_page": 300})
    cls = (cls or {}).get("data") or []
    if not cid and cls:
        cid = cls[0]["id"]
    other = next((c["id"] for c in cls if c["id"] != cid and c.get("can_view") is False), None)

    if cid:
        check(f"classrooms/{cid} (lớp mình)", f"v1/classrooms/{cid}")
        check("classrooms/:id/enrollments", f"v1/classrooms/{cid}/enrollments")
        check("classrooms/:id/teaching_assignments (web mới)", f"v1/classrooms/{cid}/teaching_assignments")
        check("classrooms/:id/overview_card (web mới)", f"v1/classrooms/{cid}/overview_card")
        check("teaching_assignments?classroom_id_eq", "v1/teaching_assignments", {"filters": {"classroom_id_eq": cid}, "per_page": 200})
        sun = date.today() - timedelta(days=(date.today().weekday() + 1) % 7)
        check(f"attendances 1 ngày ({sun})", "v1/attendances", {"classroom_id": cid, "start_date": sun, "end_date": sun, "per_page": 500})
        check("attendances cả năm (trang 1)", "v1/attendances", {"classroom_id": cid, "start_date": yr.get("start_date"), "end_date": yr.get("end_date"), "per_page": 1000, "page": 1})
        check("attendances GLV (TeachingAssignment)", "v1/attendances", {"filters": {"attendable_type_eq": "TeachingAssignment", "date_eq": sun}, "per_page": 200}, expect=(200, 403))
        for f in ["students_pdf", "students_xlsx", "personal_details_pdf", "posting_list_pdf", "teachers_contact_pdf"]:
            check(f"classrooms/:id/{f} (web mới)", f"v1/classrooms/{cid}/{f}", expect=(200, 403))
    if other:
        check(f"classrooms/{other} (lớp không phụ trách)", f"v1/classrooms/{other}", expect=(200, 403))
        check("classrooms/:id/enrollments (không phụ trách)", f"v1/classrooms/{other}/enrollments", expect=(200, 403))
    check("classrooms/overview (web mới)", "v1/classrooms/overview", {"year": year}, expect=(200, 403))

    _, tch = check("teaching_assignments?classroom_year_eq", "v1/teaching_assignments", {"filters": {"classroom_year_eq": year}, "per_page": 500})
    tch = (tch or {}).get("data") or []
    blocked = next((t["person"]["id"] for t in tch if (t.get("person") or {}).get("can_view_profile") is False), None)
    allowed = next((t["person"]["id"] for t in tch if (t.get("person") or {}).get("can_view_profile") is True and t["person"]["id"] != pid), None)
    if pid:
        check("people/:id (chính mình)", f"v1/people/{pid}")
        check("people/:id/siblings (web mới)", f"v1/people/{pid}/siblings", expect=(200, 403))
        check("users?person_id_eq (web mới)", "v1/users", {"filters": {"person_id_eq": pid}}, expect=(200, 403))
    if blocked:
        check("people/:id  can_view_profile=false -> mong 403", f"v1/people/{blocked}", expect=(403,))
    if allowed:
        check("people/:id  can_view_profile=true", f"v1/people/{allowed}")
    check("users (app: lấy tài khoản mình)", "v1/users", {"per_page": 100})
    check("enrollments?classroom_year_eq", "v1/enrollments", {"filters": {"classroom_year_eq": year}, "per_page": 5})

    for rt in ["attendance_status", "enrollment_result", "teaching_assignment_position"]:
        check(f"resource_types/{rt}", f"v1/resource_types/{rt}")

    check("search?query=&year= (cách web mới)", "v1/search", {"query": "an", "year": year})
    check("search?q= (cách app cũ)", "v1/search", {"q": "an"})

    for p in ["summary", "attendance_by_week", "enrollment_trends", "orphan_people"]:
        check(f"dashboard/{p} (admin)", f"v1/dashboard/{p}", expect=(200, 403))
    check("dashboard/new_students (admin)", "v1/dashboard/new_students", {"year": year}, expect=(200, 403))
    for p, prm in [("students/pdf", {"year": year}), ("students/xlsx", {"year": year}), ("teachers/pdf", {"year": year}), ("teachers/xlsx", {"year": year}), ("classrooms/statistics_pdf", {"year": year})]:
        check(f"{p} (xuất file)", f"v1/{p}", prm, expect=(200, 403))
    check("data_schemas/options", "v1/data_schemas/options", expect=(200, 403))

    st, _, _, _ = call("POST", "v1/auth/refresh")
    print(f"\nauth/refresh: {st}")
    st, _, _, _ = call("POST", "v1/auth/logout")
    print(f"auth/logout: {st}")
    bad = [r for r in rows if r[0] != "OK "]
    print(f"\nTổng: {len(rows)} endpoint · {len(rows) - len(bad)} đúng kỳ vọng · {len(bad)} cần xem")
    for r in bad:
        print(f"  !! {r[1]} {r[3]} — {r[4]}")
    if out:
        with open(out, "w", encoding="utf-8") as f:
            json.dump(schemas, f, ensure_ascii=False, indent=1)
        print(f"\nĐã ghi cấu trúc response: {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
