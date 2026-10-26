package com.bglmautam.app;

import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.content.pm.SigningInfo;
import android.os.Build;

import java.io.File;
import java.io.IOException;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * Dùng chung cho AppUpdatePlugin + UpdateCleanupReceiver: thư mục chứa APK cập nhật,
 * xác minh APK (đúng package, versionCode mới hơn, cùng chữ ký) và dọn file cho nhẹ máy.
 * Mọi file cập nhật CHỈ nằm trong thư mục updates — dọn ở đây không đụng ảnh/đăng nhập/cài đặt của app.
 */
final class UpdateFiles {
    static final String PREFS = "app_update";
    static final String K_PATH = "path", K_CODE = "versionCode", K_NAME = "versionName", K_SIZE = "size";

    private UpdateFiles() {}

    /** Lỗi có mã (code) để trả về JS qua call.reject(message, code) */
    static final class Bad extends Exception {
        private static final long serialVersionUID = 1L;
        final String code;
        Bad(String code, String msg) { super(msg); this.code = code; }
    }

    /** APK đang chờ cài: file + thông tin đã xác minh */
    static final class Pending {
        final File file; final PackageInfo info;
        Pending(File file, PackageInfo info) { this.file = file; this.info = info; }
    }

    /**
     * Luôn cache/updates (bộ nhớ riêng: app khác không ghi đè được APK sau khi đã xác minh).
     * SDK>=24 chia sẻ qua FileProvider; SDK<24 trình cài đọc file:// (install() mở quyền đọc file + đi qua thư mục).
     * Không dùng external files: Android 5/6 app có quyền bộ nhớ ghi được vào đó → tráo APK.
     */
    static File dir(Context ctx) {
        File d = new File(ctx.getCacheDir(), "updates");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /** Đường dẫn phải là file .apk nằm ngay trong thư mục updates (so canonical) — sai → null */
    static File inDir(Context ctx, String path) {
        if (path == null || path.isEmpty()) return null;
        if (path.startsWith("file://")) path = path.substring(7);
        try {
            File d = dir(ctx).getCanonicalFile(), f = new File(path).getCanonicalFile();
            if (!d.equals(f.getParentFile()) || !f.isFile() || !f.getName().toLowerCase(Locale.ROOT).endsWith(".apk")) return null;
            return f;
        } catch (IOException e) { return null; }
    }

    // ===== Thông tin gói =====

    @SuppressWarnings("deprecation")
    static long code(PackageInfo p) { return Build.VERSION.SDK_INT >= Build.VERSION_CODES.P ? p.getLongVersionCode() : p.versionCode; }

    @SuppressWarnings("deprecation")
    static PackageInfo installed(Context ctx, int flags) {
        PackageManager pm = ctx.getPackageManager();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return pm.getPackageInfo(ctx.getPackageName(), PackageManager.PackageInfoFlags.of(flags));
            return pm.getPackageInfo(ctx.getPackageName(), flags);
        } catch (Exception e) { return null; }
    }

    @SuppressWarnings("deprecation")
    private static PackageInfo archive(PackageManager pm, String path, int flags) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) return pm.getPackageArchiveInfo(path, PackageManager.PackageInfoFlags.of(flags));
            return pm.getPackageArchiveInfo(path, flags);
        } catch (Exception e) { return null; }
    }

    /** SHA-256 của từng chứng chỉ ký (SDK>=28 lấy cả lịch sử xoay khoá) — rỗng = không xác định được */
    @SuppressWarnings("deprecation")
    private static Set<String> certs(PackageInfo p) {
        Set<String> s = new HashSet<>();
        if (p == null) return s;
        Signature[] sigs = null;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && p.signingInfo != null) {
            SigningInfo si = p.signingInfo;
            sigs = si.hasMultipleSigners() ? si.getApkContentsSigners() : si.getSigningCertificateHistory();
        }
        if ((sigs == null || sigs.length == 0) && p.signatures != null) sigs = p.signatures;
        if (sigs == null) return s;
        try {
            for (Signature g : sigs) {
                if (g == null) continue;
                byte[] h = MessageDigest.getInstance("SHA-256").digest(g.toByteArray());
                StringBuilder b = new StringBuilder(h.length * 2);
                for (byte x : h) b.append(String.format(Locale.ROOT, "%02x", x));
                s.add(b.toString());
            }
        } catch (Exception e) { s.clear(); }
        return s;
    }

    @SuppressWarnings("deprecation")
    private static Set<String> installedCerts(Context ctx) {
        Set<String> s = new HashSet<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) s = certs(installed(ctx, PackageManager.GET_SIGNING_CERTIFICATES));
        if (s.isEmpty()) s = certs(installed(ctx, PackageManager.GET_SIGNATURES));
        return s;
    }

    /**
     * Xác minh APK trước khi cho cài: cùng packageName, versionCode lớn hơn bản đang cài, chứng chỉ ký không khác hẳn.
     * Chặn ở đây để người dùng không gặp "Không cài được ứng dụng" rồi gỡ app (mất dữ liệu).
     * Không đọc được chữ ký → cho qua (trình cài hệ thống vẫn kiểm tra).
     */
    @SuppressWarnings("deprecation")
    static PackageInfo verify(Context ctx, File apk) throws Bad {
        PackageManager pm = ctx.getPackageManager();
        String path = apk.getAbsolutePath();
        PackageInfo info = null;
        Set<String> a = new HashSet<>();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) { info = archive(pm, path, PackageManager.GET_SIGNING_CERTIFICATES); a = certs(info); }
        if (a.isEmpty()) {   // Android 9/10 có lỗi signingInfo = null với file APK → thử GET_SIGNATURES
            PackageInfo i2 = archive(pm, path, PackageManager.GET_SIGNATURES);
            if (i2 != null) { a = certs(i2); if (info == null) info = i2; }
        }
        if (info == null) info = archive(pm, path, 0);
        if (info == null || info.packageName == null) throw new Bad("INVALID_APK", "Tệp cập nhật bị lỗi hoặc không phải APK hợp lệ");
        if (!ctx.getPackageName().equals(info.packageName)) throw new Bad("WRONG_PACKAGE", "Tệp tải về không phải bản cập nhật của ứng dụng này");
        PackageInfo me = installed(ctx, 0);
        if (me != null && code(info) <= code(me)) throw new Bad("NOT_NEWER", "Bản tải về không mới hơn bản đang cài");
        Set<String> b = installedCerts(ctx);
        if (!a.isEmpty() && !b.isEmpty() && Collections.disjoint(a, b))
            throw new Bad("SIGNATURE_MISMATCH", "Bản cập nhật được ký khác với app đang cài nên không thể cài đè. Đừng gỡ app (sẽ mất dữ liệu) — hãy báo người quản trị");
        return info;
    }

    // ===== APK chờ cài + dọn dẹp =====

    /** APK đã tải trong thư mục updates mà vẫn hợp lệ & mới hơn bản đang cài (ưu tiên file ghi trong prefs) — không có → null */
    static Pending pending(Context ctx) {
        List<File> cands = new ArrayList<>();
        File saved = inDir(ctx, prefs(ctx).getString(K_PATH, null));
        if (saved != null) cands.add(saved);
        File[] fs = dir(ctx).listFiles();
        if (fs != null) {
            Arrays.sort(fs, (x, y) -> Long.compare(y.lastModified(), x.lastModified()));
            for (File f : fs) { File c = inDir(ctx, f.getPath()); if (c != null && !cands.contains(c)) cands.add(c); }
        }
        for (File f : cands) { try { return new Pending(f, verify(ctx, f)); } catch (Bad ignore) {} }
        return null;
    }

    /** Ghi nhớ APK chờ cài vào SharedPreferences "app_update" */
    static void remember(Context ctx, File f, PackageInfo info) {
        prefs(ctx).edit().putString(K_PATH, f.getAbsolutePath()).putLong(K_CODE, code(info))
            .putString(K_NAME, info.versionName == null ? "" : info.versionName).putLong(K_SIZE, f.length()).apply();
    }

    /** Xoá mọi file trong thư mục updates (trừ keep nếu khác null) + xoá prefs; trả về {số file đã xoá, số byte giải phóng} */
    static long[] clear(Context ctx, File keep) {
        long[] r = { 0, 0 };
        File keepC = null;
        try { if (keep != null) keepC = keep.getCanonicalFile(); } catch (IOException ignore) {}
        File[] fs = dir(ctx).listFiles();
        if (fs != null) for (File f : fs) {
            try { if (keepC != null && keepC.equals(f.getCanonicalFile())) continue; } catch (IOException ignore) {}
            delete(f, r);
        }
        // bản build thử cũ (SDK<24) để APK ở external files/updates → xoá luôn
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            try { File base = ctx.getExternalFilesDir(null); File old = base == null ? null : new File(base, "updates"); if (old != null && old.exists()) delete(old, r); } catch (Exception ignore) {}
        }
        prefs(ctx).edit().clear().apply();
        return r;
    }

    /** Dọn thư mục updates; keepPending → giữ lại APK chờ cài nếu vẫn mới hơn bản đang cài */
    static long[] cleanup(Context ctx, boolean keepPending) {
        Pending p = keepPending ? pending(ctx) : null;
        long[] r = clear(ctx, p == null ? null : p.file);
        if (p != null) remember(ctx, p.file, p.info);
        return r;
    }

    private static void delete(File f, long[] r) {
        if (f.isDirectory()) { File[] sub = f.listFiles(); if (sub != null) for (File s : sub) delete(s, r); f.delete(); return; }
        long len = f.length();
        if (f.delete()) { r[0]++; r[1] += len; }
    }
}
