// ============================================================
//  Đọc file .zip — lấy các file .json bên trong để Nhập dữ liệu
//  (file sao lưu gửi qua Zalo / Drive… hay bị nén thành .zip)
//  Hỗ trợ nén "stored" (0) và "deflate" (8). Giải nén bằng DecompressionStream
//  nếu WebView có, không thì dùng bộ inflate JS (RFC 1951) bên dưới.
// ============================================================
(function () {
  // ---------- inflate thuần JS (kiểu puff.c) ----------
  const LBASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
  const LEXT = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
  const DBASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
  const DEXT = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
  const CLORD = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  function huff(lengths, n) {
    const count = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n);
    for (let i = 0; i < n; i++) count[lengths[i]]++;
    count[0] = 0;
    for (let i = 1; i < 15; i++) offs[i + 1] = offs[i] + count[i];
    for (let i = 0; i < n; i++) if (lengths[i]) sym[offs[lengths[i]]++] = i;
    return { count, sym };
  }
  let FIXED = null;
  function fixedTables() {
    if (FIXED) return FIXED;
    const l = new Uint8Array(288);
    for (let i = 0; i < 288; i++) l[i] = i < 144 ? 8 : i < 256 ? 9 : i < 280 ? 7 : 8;
    const d = new Uint8Array(30).fill(5);
    return (FIXED = { lc: huff(l, 288), dc: huff(d, 30) });
  }

  function inflateJS(src, sizeHint) {
    let pos = 0, bitbuf = 0, bitcnt = 0;
    let out = new Uint8Array(Math.max(1024, sizeHint || src.length * 4)), op = 0;
    const need = (n) => { if (op + n <= out.length) return; let len = out.length * 2; while (len < op + n) len *= 2; const o = new Uint8Array(len); o.set(out.subarray(0, op)); out = o; };
    const bits = (n) => {
      let v = bitbuf;
      while (bitcnt < n) { if (pos >= src.length) throw new Error("dữ liệu nén bị thiếu"); v |= src[pos++] << bitcnt; bitcnt += 8; }
      bitbuf = v >>> n; bitcnt -= n;
      return v & ((1 << n) - 1);
    };
    const decode = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) {
        code |= bits(1);
        const c = h.count[len];
        if (code - c < first) return h.sym[index + (code - first)];
        index += c; first = (first + c) << 1; code <<= 1;
      }
      throw new Error("mã Huffman không hợp lệ");
    };
    const codes = (lc, dc) => {
      for (;;) {
        let s = decode(lc);
        if (s < 256) { need(1); out[op++] = s; continue; }
        if (s === 256) return;
        s -= 257; if (s >= 29) throw new Error("độ dài không hợp lệ");
        const len = LBASE[s] + bits(LEXT[s]);
        const ds = decode(dc); if (ds >= 30) throw new Error("khoảng cách không hợp lệ");
        const dist = DBASE[ds] + bits(DEXT[ds]);
        if (dist > op) throw new Error("khoảng cách vượt dữ liệu");
        need(len);
        for (let i = 0; i < len; i++, op++) out[op] = out[op - dist];
      }
    };
    let last;
    do {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bitbuf = 0; bitcnt = 0;
        if (pos + 4 > src.length) throw new Error("dữ liệu nén bị thiếu");
        const len = src[pos] | (src[pos + 1] << 8), nlen = src[pos + 2] | (src[pos + 3] << 8); pos += 4;
        if (len !== (~nlen & 0xffff)) throw new Error("khối stored lỗi");
        if (pos + len > src.length) throw new Error("dữ liệu nén bị thiếu");
        need(len); out.set(src.subarray(pos, pos + len), op); op += len; pos += len;
      } else if (type === 1) {
        const f = fixedTables(); codes(f.lc, f.dc);
      } else if (type === 2) {
        const nlen = bits(5) + 257, ndist = bits(5) + 1, ncode = bits(4) + 4;
        if (nlen > 286 || ndist > 30) throw new Error("bảng mã lỗi");
        const lengths = new Uint8Array(320);
        for (let i = 0; i < ncode; i++) lengths[CLORD[i]] = bits(3);
        const clc = huff(lengths, 19);
        lengths.fill(0);
        let i = 0;
        while (i < nlen + ndist) {
          const s = decode(clc);
          if (s < 16) { lengths[i++] = s; continue; }
          let rep, val = 0;
          if (s === 16) { if (!i) throw new Error("bảng mã lỗi"); val = lengths[i - 1]; rep = 3 + bits(2); }
          else if (s === 17) rep = 3 + bits(3);
          else rep = 11 + bits(7);
          if (i + rep > nlen + ndist) throw new Error("bảng mã lỗi");
          while (rep--) lengths[i++] = val;
        }
        codes(huff(lengths, nlen), huff(lengths.subarray(nlen), ndist));
      } else throw new Error("kiểu khối nén không hợp lệ");
    } while (!last);
    return out.subarray(0, op);
  }

  async function inflate(data, size) {
    if (typeof DecompressionStream === "function") {
      try {
        const ds = new DecompressionStream("deflate-raw");
        const buf = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(buf);
      } catch (e) { /* WebView cũ không có "deflate-raw" -> dùng bản JS */ }
    }
    return inflateJS(data, size);
  }

  // ---------- cấu trúc zip ----------
  const u16 = (b, o) => b[o] | (b[o + 1] << 8);
  const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const isZip = (b) => !!b && b.length >= 22 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4;
  const utf8 = (b) => new TextDecoder("utf-8").decode(b);

  function entries(b) {
    const out = [];
    let eocd = -1;
    for (let i = b.length - 22, stop = Math.max(0, b.length - 65557); i >= stop; i--) if (u32(b, i) === 0x06054b50) { eocd = i; break; }
    if (eocd >= 0) {
      const n = u16(b, eocd + 10);
      let p = u32(b, eocd + 16);
      for (let k = 0; k < n && p + 46 <= b.length && u32(b, p) === 0x02014b50; k++) {
        const nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32);
        out.push({ flags: u16(b, p + 8), method: u16(b, p + 10), csize: u32(b, p + 20), usize: u32(b, p + 24), lho: u32(b, p + 42), name: utf8(b.subarray(p + 46, p + 46 + nl)) });
        p += 46 + nl + el + cl;
      }
    }
    if (!out.length) {   // không có mục lục cuối file (zip bị cắt) -> đọc lần lượt các header
      let p = 0;
      while (p + 30 <= b.length && u32(b, p) === 0x04034b50) {
        const flags = u16(b, p + 6), cs = u32(b, p + 18), nl = u16(b, p + 26), el = u16(b, p + 28);
        if ((flags & 8) && !cs) break;
        out.push({ flags, method: u16(b, p + 8), csize: cs, usize: u32(b, p + 22), lho: p, name: utf8(b.subarray(p + 30, p + 30 + nl)) });
        p += 30 + nl + el + cs;
      }
    }
    return out;
  }

  async function extract(b, e) {
    if (e.flags & 1) throw new Error("file zip có mật khẩu — hãy giải nén trước");
    if (e.csize === 0xffffffff || e.lho === 0xffffffff) throw new Error("file zip quá lớn (ZIP64) — hãy giải nén trước");
    const h = e.lho;
    if (u32(b, h) !== 0x04034b50) throw new Error("file zip bị hỏng");
    const start = h + 30 + u16(b, h + 26) + u16(b, h + 28), data = b.subarray(start, start + e.csize);
    if (e.method === 0) return data;
    if (e.method === 8) return inflate(data, e.usize);
    throw new Error("kiểu nén zip không hỗ trợ (" + e.method + ")");
  }

  // Trả về [{ name, text }] của các file .json trong zip (bỏ rác __MACOSX/ và ._*)
  async function jsonFiles(b) {
    const all = entries(b).filter((e) => !/\/$/.test(e.name) && !/^__MACOSX\//.test(e.name) && !/(^|\/)\._/.test(e.name));
    const js = all.filter((e) => /\.json$/i.test(e.name));
    const pick = js.length ? js : all.filter((e) => e.usize < 200 * 1024 * 1024);   // không có đuôi .json -> thử các file còn lại
    const out = [];
    for (const e of pick) {
      const text = utf8(await extract(b, e));
      if (js.length || /^\s*[{[]/.test(text.replace(/^﻿/, ""))) out.push({ name: e.name, text });
    }
    return out;
  }

  window.Unzip = { isZip, entries, jsonFiles, _inflateJS: inflateJS };
})();
