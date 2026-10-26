package com.bglmautam.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.SystemClock;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.lifecycle.Lifecycle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Cập nhật app từ GitHub Releases (chỉ Android): tải APK về thư mục updates, xác minh
 * (đúng package + versionCode mới hơn + cùng chữ ký → cài đè giữ nguyên dữ liệu), rồi mở trình cài
 * hệ thống để NGƯỜI DÙNG tự bấm "Cài đặt". APK tự xoá sau khi cập nhật (UpdateCleanupReceiver) / khi dọn.
 */
@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {
    private static final long MARGIN = 20L * 1024 * 1024;   // chừa 20MB trống cho máy
    private static final String APK_MIME = "application/vnd.android.package-archive";

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);
    private volatile boolean cancelled = false;
    private volatile HttpURLConnection current;
    private final AtomicReference<File> deferred = new AtomicReference<>();   // APK chờ mở trình cài khi app quay lại

    @Override
    public void load() {
        // mở app → dọn file tải dở / APK cũ không còn mới hơn (giữ lại APK chờ cài hợp lệ)
        try { worker.execute(() -> { try { UpdateFiles.cleanup(getContext(), true); } catch (Exception ignore) {} }); } catch (Exception ignore) {}
    }

    @Override
    protected void handleOnDestroy() {
        cancelled = true;
        disconnectCurrent();
        worker.shutdownNow();
    }

    private boolean canInstall() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        try { return getContext().getPackageManager().canRequestPackageInstalls(); } catch (Exception e) { return false; }
    }

    private void disconnectCurrent() {
        HttpURLConnection c = current;
        if (c != null) { try { c.disconnect(); } catch (Exception ignore) {} }
    }

    // ===== getInfo =====

    @PluginMethod
    public void getInfo(PluginCall call) {
        PackageInfo p = UpdateFiles.installed(getContext(), 0);
        if (p == null) { call.reject("Không đọc được thông tin ứng dụng", "INFO_FAILED"); return; }
        JSObject r = new JSObject();
        r.put("versionName", p.versionName == null ? "" : p.versionName);
        r.put("versionCode", UpdateFiles.code(p));
        r.put("packageName", p.packageName);
        r.put("canInstall", canInstall());
        r.put("sdkInt", Build.VERSION.SDK_INT);
        call.resolve(r);
    }

    // ===== Quyền "Cài ứng dụng không rõ nguồn gốc" (Android 8+) =====

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { resolveCanInstall(call); return; }
        Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
        try { startActivityForResult(call, i, "installPermissionResult"); }
        catch (Exception e) {
            // vài máy không có màn riêng cho từng app → mở Cài đặt bảo mật chung
            try { startActivityForResult(call, new Intent(Settings.ACTION_SECURITY_SETTINGS), "installPermissionResult"); }
            catch (Exception e2) { getBridge().releaseCall(call); call.reject("Không mở được Cài đặt — hãy vào Cài đặt > Ứng dụng > Điểm Danh > Cài ứng dụng không rõ nguồn gốc", "NO_SETTINGS"); }
        }
    }

    @ActivityCallback
    private void installPermissionResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        getBridge().releaseCall(call);
        resolveCanInstall(call);
    }

    private void resolveCanInstall(PluginCall call) {
        JSObject r = new JSObject();
        r.put("canInstall", canInstall());
        call.resolve(r);
    }

    // ===== Tải APK =====

    @PluginMethod
    public void download(PluginCall call) {
        String url = call.getString("url");
        if (url == null || !url.toLowerCase(Locale.ROOT).startsWith("https://")) { call.reject("Liên kết tải bản cập nhật không hợp lệ", "BAD_URL"); return; }
        String name = safeName(call.getString("fileName"));
        long expected = call.getData().optLong("expectedSize", -1);
        if (!busy.compareAndSet(false, true)) { call.reject("Đang tải bản cập nhật, vui lòng đợi", "BUSY"); return; }
        cancelled = false;
        try {
            worker.execute(() -> {
                try { doDownload(call, url, name, expected); }
                finally { current = null; busy.set(false); }
            });
        } catch (RejectedExecutionException e) {
            busy.set(false);
            call.reject("Không bắt đầu tải được, thử lại sau", "BUSY");
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        if (busy.get()) { cancelled = true; disconnectCurrent(); }
        call.resolve();
    }

    /** Chỉ giữ [A-Za-z0-9._-], bắt buộc đuôi .apk; mặc định update.apk */
    private static String safeName(String n) {
        if (n == null) return "update.apk";
        n = n.replaceAll("[^A-Za-z0-9._-]", "_").replaceAll("^[.]+", "");
        if (!n.toLowerCase(Locale.ROOT).endsWith(".apk")) n = n + ".apk";
        if (n.length() > 120) n = n.substring(n.length() - 120);
        return n.length() <= 4 ? "update.apk" : n;
    }

    private void doDownload(PluginCall call, String url, String name, long expected) {
        Context ctx = getContext();
        File part = null, out = null;
        HttpURLConnection conn = null;
        try {
            UpdateFiles.clear(ctx, null);   // xoá APK/tệp tải dở cũ trước
            File dir = UpdateFiles.dir(ctx);
            part = new File(dir, name + ".part");
            out = new File(dir, name);
            if (expected > 0 && !enoughSpace(dir, expected)) throw noSpace();
            conn = open(url);
            long len = -1;
            try { String h = conn.getHeaderField("Content-Length"); if (h != null) len = Long.parseLong(h.trim()); } catch (NumberFormatException ignore) {}
            if (!enoughSpace(dir, Math.max(len, expected))) throw noSpace();
            long total = len > 0 ? len : (expected > 0 ? expected : -1);

            long loaded = 0, last = 0;
            emit(0, total);
            try (InputStream in = conn.getInputStream(); FileOutputStream os = new FileOutputStream(part)) {
                byte[] buf = new byte[65536];
                int n;
                while ((n = in.read(buf)) != -1) {
                    if (cancelled) throw cancelledErr();
                    os.write(buf, 0, n);
                    loaded += n;
                    long now = SystemClock.uptimeMillis();
                    if (now - last >= 200) { last = now; emit(loaded, total); }
                }
                if (cancelled) throw cancelledErr();
                os.flush();
                try { os.getFD().sync(); } catch (Exception ignore) {}
            }
            if (len > 0 && loaded != len) throw new UpdateFiles.Bad("NETWORK", "Tải chưa xong do mất kết nối — vui lòng thử lại");
            JSObject done = new JSObject();
            done.put("loaded", loaded); done.put("total", loaded); done.put("percent", 100);
            notifyListeners("downloadProgress", done);

            if (cancelled) throw cancelledErr();
            if (out.exists()) out.delete();
            if (!part.renameTo(out)) throw new UpdateFiles.Bad("IO_ERROR", "Không lưu được tệp cập nhật");
            PackageInfo info = UpdateFiles.verify(ctx, out);
            if (cancelled) throw cancelledErr();   // huỷ lúc đang xác minh → vẫn coi là huỷ
            UpdateFiles.remember(ctx, out, info);
            JSObject r = new JSObject();
            r.put("path", out.getAbsolutePath());
            r.put("size", out.length());
            r.put("versionName", info.versionName == null ? "" : info.versionName);
            r.put("versionCode", UpdateFiles.code(info));
            call.resolve(r);
        } catch (UpdateFiles.Bad b) {
            discard(ctx, part, out);
            call.reject(b.getMessage(), b.code);
        } catch (Exception e) {
            discard(ctx, part, out);
            if (cancelled) call.reject("Đã huỷ tải bản cập nhật", "CANCELLED");
            else if (isNoSpace(e)) call.reject("Máy không đủ dung lượng trống để tải bản cập nhật", "NO_SPACE");
            else call.reject("Lỗi mạng khi tải bản cập nhật — kiểm tra kết nối rồi thử lại", "NETWORK");
        } finally {
            if (conn != null) { try { conn.disconnect(); } catch (Exception ignore) {} }
        }
    }

    /** Mở kết nối, tự theo chuyển hướng (GitHub 302 → objects.githubusercontent.com) tối đa 5 lần, chỉ https */
    private HttpURLConnection open(String start) throws Exception {
        URL u = new URL(start);
        for (int hop = 0; hop <= 5; hop++) {
            if (!"https".equalsIgnoreCase(u.getProtocol())) throw new UpdateFiles.Bad("BAD_URL", "Liên kết tải không an toàn (không phải https)");
            if (cancelled) throw cancelledErr();
            HttpURLConnection c = (HttpURLConnection) u.openConnection();
            current = c;
            c.setInstanceFollowRedirects(false);
            c.setConnectTimeout(20000);
            c.setReadTimeout(30000);
            c.setRequestProperty("Accept", "application/octet-stream");
            c.setRequestProperty("Accept-Encoding", "identity");   // giữ đúng Content-Length để tính %
            c.setRequestProperty("User-Agent", "DiemDanh-Android");
            int code = c.getResponseCode();
            if (code >= 300 && code < 400 && code != 304) {
                String loc = c.getHeaderField("Location");
                c.disconnect();
                if (loc == null || loc.isEmpty()) throw new UpdateFiles.Bad("HTTP_" + code, "Máy chủ chuyển hướng không hợp lệ");
                u = new URL(u, loc);
                continue;
            }
            if (code < 200 || code >= 300) {
                c.disconnect();
                throw new UpdateFiles.Bad("HTTP_" + code, "Máy chủ trả lỗi " + code + " khi tải bản cập nhật");
            }
            return c;
        }
        throw new UpdateFiles.Bad("NETWORK", "Chuyển hướng quá nhiều lần khi tải bản cập nhật");
    }

    private void emit(long loaded, long total) {
        JSObject d = new JSObject();
        d.put("loaded", loaded);
        d.put("total", total > 0 ? total : -1);
        d.put("percent", total > 0 ? (int) Math.min(100, loaded * 100 / total) : -1);
        notifyListeners("downloadProgress", d);
    }

    private static boolean enoughSpace(File dir, long need) { return need <= 0 || dir.getUsableSpace() - MARGIN >= need; }

    private static UpdateFiles.Bad noSpace() { return new UpdateFiles.Bad("NO_SPACE", "Máy không đủ dung lượng trống để tải bản cập nhật"); }

    private static UpdateFiles.Bad cancelledErr() { return new UpdateFiles.Bad("CANCELLED", "Đã huỷ tải bản cập nhật"); }

    private static boolean isNoSpace(Exception e) {
        String m = e.getMessage();
        return m != null && (m.contains("ENOSPC") || m.toLowerCase(Locale.ROOT).contains("no space"));
    }

    private static void discard(Context ctx, File part, File out) {
        if (part != null) part.delete();
        if (out != null) out.delete();
        try { UpdateFiles.prefs(ctx).edit().clear().apply(); } catch (Exception ignore) {}
    }

    // ===== Mở trình cài đặt hệ thống (người dùng tự bấm "Cài đặt") =====

    @PluginMethod
    public void install(PluginCall call) {
        Context ctx = getContext();
        File f = UpdateFiles.inDir(ctx, call.getString("path"));
        if (f == null) { call.reject("Không tìm thấy tệp cập nhật — vui lòng tải lại", "NOT_FOUND"); return; }
        if (!canInstall()) { call.reject("Cần cho phép Điểm Danh cài bản cập nhật (Cài ứng dụng không rõ nguồn gốc)", "NEED_PERMISSION"); return; }
        try { UpdateFiles.verify(ctx, f); }   // chặn lần nữa: sai package / không mới hơn / khác chữ ký → không mở trình cài
        catch (UpdateFiles.Bad b) { f.delete(); try { UpdateFiles.prefs(ctx).edit().clear().apply(); } catch (Exception ignore) {} call.reject(b.getMessage(), b.code); return; }
        try {
            Intent i = installIntent(ctx, f);
            JSObject r = new JSObject();
            r.put("started", true);
            // Android 10+ lặng lẽ chặn mở activity khi app đang ở nền (tải xong lúc người dùng sang app khác)
            // → hoãn tới lúc quay lại app (handleOnResume) để hộp thoại cài đặt hiện đúng lúc
            if (!foreground()) {
                deferred.set(f);
                r.put("deferred", true);
                call.resolve(r);
                if (foreground()) launchDeferred();   // vừa quay lại app đúng lúc hoãn
                return;
            }
            deferred.set(null);
            ctx.startActivity(i);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Không mở được trình cài đặt của máy", "NO_INSTALLER");
        }
    }

    /** Intent mở trình cài hệ thống cho APK f */
    private static Intent installIntent(Context ctx, File f) {
        Intent i = new Intent(Intent.ACTION_VIEW);
        Uri uri;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } else {
            // Android 5–6: trình cài đọc thẳng file:// (APK trong cache riêng, app khác không ghi được) → cho phép đọc file + đi qua thư mục
            ctx.getCacheDir().setExecutable(true, false);
            File d = f.getParentFile();
            if (d != null) d.setExecutable(true, false);
            f.setReadable(true, false);
            uri = Uri.fromFile(f);
        }
        i.setDataAndType(uri, APK_MIME);
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return i;
    }

    /** Activity đang hiện (STARTED trở lên) — không xác định được → coi như đang hiện (mở luôn như cũ) */
    private boolean foreground() {
        try { return getActivity().getLifecycle().getCurrentState().isAtLeast(Lifecycle.State.STARTED); }
        catch (Exception e) { return true; }
    }

    @Override
    protected void handleOnResume() { launchDeferred(); }

    /** Mở trình cài cho APK đã hoãn — xác minh lại (file còn, đúng gói, mới hơn, cùng chữ ký), sai thì bỏ qua */
    private void launchDeferred() {
        File f = deferred.getAndSet(null);
        if (f == null) return;
        try {
            worker.execute(() -> {
                try {
                    Context ctx = getContext();
                    File c = UpdateFiles.inDir(ctx, f.getAbsolutePath());
                    if (c == null || !canInstall()) return;
                    UpdateFiles.verify(ctx, c);
                    ctx.startActivity(installIntent(ctx, c));
                } catch (Exception ignore) {}
            });
        } catch (Exception ignore) {}
    }

    // ===== APK chờ cài / dọn dẹp =====

    @PluginMethod
    public void getPending(PluginCall call) {
        UpdateFiles.Pending p = busy.get() ? null : UpdateFiles.pending(getContext());
        JSObject r = new JSObject();
        if (p != null) {
            r.put("path", p.file.getAbsolutePath());
            r.put("size", p.file.length());
            r.put("versionName", p.info.versionName == null ? "" : p.info.versionName);
            r.put("versionCode", UpdateFiles.code(p.info));
        }
        call.resolve(r);
    }

    @PluginMethod
    public void cleanup(PluginCall call) {
        long[] r = { 0, 0 };
        // đang tải thì bỏ qua (lượt tải tự xoá file cũ trước khi bắt đầu)
        if (!busy.get()) r = UpdateFiles.cleanup(getContext(), Boolean.TRUE.equals(call.getBoolean("keepPending", false)));
        JSObject o = new JSObject();
        o.put("deleted", r[0]);
        o.put("freedBytes", r[1]);
        call.resolve(o);
    }
}
