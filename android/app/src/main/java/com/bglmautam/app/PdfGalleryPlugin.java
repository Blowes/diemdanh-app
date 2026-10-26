package com.bglmautam.app;

import android.Manifest;
import android.app.Activity;
import android.content.ClipData;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.graphics.pdf.PdfRenderer;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Bảng in của lớp (PDF từ máy chủ) → MỖI TRANG 1 ảnh PNG nền trắng trong Thư viện (album "Điểm Danh").
 * File không thành ảnh được (vd. Excel) → Tải xuống/Điểm Danh + chia sẻ qua FileProvider.
 * Android 10+ không cần quyền; Android 9 trở xuống xin WRITE_EXTERNAL_STORAGE (manifest: maxSdk 28).
 *
 * JS:  pdfToGallery({base64, baseName, album?, maxSide?}) → {pages, uris[], album}   · sự kiện "progress" {page,total}
 *      saveFile({base64, fileName, mime, album?})          → {uri, fileName, folder, shareName}
 *      shareFile({fileName (= shareName), mime, title?})    → mở bảng chia sẻ của máy
 */
@CapacitorPlugin(
    name = "PdfGallery",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class PdfGalleryPlugin extends Plugin {
    private static final int DEF_SIDE = 2000;          // cạnh dài của ảnh (px) — A4 ≈ 1414×2000, chữ nhỏ vẫn rõ
    private static final int MIN_SIDE = 800, MAX_SIDE = 3000;
    private static final int MAX_PAGES = 400;
    private static final String TMP_PREFIX = "bang-in-";
    private static final String SHARE_DIR = "exports"; // cacheDir/exports — file_paths.xml: cache-path "."

    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean busy = new AtomicBoolean(false);

    /** Lỗi có mã để JS hiện thông báo phù hợp */
    private static class Bad extends Exception {
        private static final long serialVersionUID = 1L;
        final String code;
        Bad(String msg, String code) { super(msg); this.code = code; }
    }

    @Override
    public void load() {
        // dọn PDF tạm còn sót (app bị tắt giữa chừng) + bản chia sẻ cũ
        try { worker.execute(() -> { try { cleanup(getContext()); } catch (Exception ignore) {} }); } catch (Exception ignore) {}
    }

    @Override
    protected void handleOnDestroy() {
        worker.shutdownNow();
    }

    private boolean needPermission() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED;
    }

    // ===== PDF → ảnh =====

    @PluginMethod
    public void pdfToGallery(PluginCall call) {
        if (needPermission()) { requestPermissionForAlias("storage", call, "pdfPermCallback"); return; }
        startPdf(call);
    }

    @PermissionCallback
    private void pdfPermCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) startPdf(call);
        else call.reject("Chưa cho phép lưu vào thư viện", "PERMISSION");
    }

    private void startPdf(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null || b64.isEmpty()) { call.reject("Thiếu dữ liệu", "NO_DATA"); return; }
        String base = safeName(call.getString("baseName", "bang-in"), "bang-in");
        String album = safeName(call.getString("album", "Điểm Danh"), "Điểm Danh");
        Integer ms = call.getInt("maxSide", DEF_SIDE);
        int maxSide = Math.max(MIN_SIDE, Math.min(MAX_SIDE, ms == null ? DEF_SIDE : ms));
        if (!busy.compareAndSet(false, true)) { call.reject("Đang lưu bảng khác, vui lòng đợi", "BUSY"); return; }
        try {
            worker.execute(() -> {
                try { renderPdf(call, b64, base, album, maxSide); }
                finally { busy.set(false); }
            });
        } catch (RejectedExecutionException e) {
            busy.set(false);
            call.reject("Không bắt đầu được, thử lại", "BUSY");
        }
    }

    /** Chạy trên worker. resolve/reject đúng 1 lần. */
    private void renderPdf(PluginCall call, String b64, String base, String album, int maxSide) {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        File tmp = null;
        ParcelFileDescriptor pfd = null;
        PdfRenderer renderer = null;
        JSArray uris = new JSArray();
        int total = 0;
        try {
            byte[] data;
            try { data = Base64.decode(b64, Base64.DEFAULT); }
            catch (IllegalArgumentException e) { throw new Bad("Dữ liệu PDF bị hỏng", "BAD_PDF"); }
            if (!looksPdf(data)) throw new Bad("Máy chủ không trả về file PDF", "NOT_PDF");
            tmp = new File(ctx.getCacheDir(), TMP_PREFIX + System.nanoTime() + ".pdf");
            try (FileOutputStream fo = new FileOutputStream(tmp)) { fo.write(data); }
            data = null;   // PdfRenderer đọc từ file — nhả bộ nhớ trước khi vẽ
            pfd = ParcelFileDescriptor.open(tmp, ParcelFileDescriptor.MODE_READ_ONLY);
            try { renderer = new PdfRenderer(pfd); }
            catch (SecurityException e) { throw new Bad("File PDF có mật khẩu, không mở được", "BAD_PDF"); }
            catch (IOException e) { throw new Bad("File PDF hỏng hoặc không đọc được", "BAD_PDF"); }
            total = renderer.getPageCount();
            if (total <= 0) throw new Bad("Bảng in không có trang nào", "EMPTY");
            if (total > MAX_PAGES) throw new Bad("Bảng in quá nhiều trang (" + total + ")", "TOO_MANY");
            int digits = String.valueOf(total).length() < 2 ? 2 : String.valueOf(total).length();
            for (int i = 0; i < total; i++) {
                String name = total == 1 ? base + ".png" : base + "-trang-" + pad(i + 1, digits) + ".png";
                Uri u = renderPage(renderer, i, cr, name, album, maxSide);
                uris.put(u.toString());
                JSObject p = new JSObject();
                p.put("page", i + 1);
                p.put("total", total);
                notifyListeners("progress", p);
            }
            JSObject r = new JSObject();
            r.put("pages", total);
            r.put("uris", uris);
            r.put("album", album);
            call.resolve(r);
        } catch (Bad b) {
            call.reject(partial(b.getMessage(), uris.length(), total), b.code);
        } catch (OutOfMemoryError e) {
            call.reject(partial("Máy không đủ bộ nhớ để tạo ảnh", uris.length(), total), "NO_MEMORY");
        } catch (Throwable e) {
            boolean full = isNoSpace(e);
            call.reject(partial(full ? "Máy không đủ dung lượng trống" : "Lưu thất bại: " + e.getMessage(), uris.length(), total), full ? "NO_SPACE" : "FAILED");
        } finally {
            if (renderer != null) { try { renderer.close(); } catch (Exception ignore) {} }
            if (pfd != null) { try { pfd.close(); } catch (Exception ignore) {} }
            if (tmp != null) { try { tmp.delete(); } catch (Exception ignore) {} }
        }
    }

    /** Vẽ 1 trang lên bitmap nền trắng → PNG thẳng vào MediaStore. Chỉ 1 bitmap tồn tại mỗi lúc. */
    private Uri renderPage(PdfRenderer renderer, int index, ContentResolver cr, String name, String album, int maxSide) throws Exception {
        Bitmap bmp = null;
        Uri uri = null;
        try {
            try (PdfRenderer.Page page = renderer.openPage(index)) {
                int pw = Math.max(1, page.getWidth()), ph = Math.max(1, page.getHeight());   // đơn vị điểm (1/72 inch)
                double scale = (double) maxSide / Math.max(pw, ph);
                // giới hạn theo RAM còn trống: 1 bitmap ARGB_8888 = w*h*4 byte, không quá 1/4 phần heap còn lại
                Runtime rt = Runtime.getRuntime();
                long free = rt.maxMemory() - (rt.totalMemory() - rt.freeMemory());
                long budget = Math.max(4L * 1024 * 1024, free / 4);
                double bytes = pw * scale * ph * scale * 4;
                if (bytes > budget) scale *= Math.sqrt(budget / bytes);
                int w = Math.max(1, (int) Math.round(pw * scale)), h = Math.max(1, (int) Math.round(ph * scale));
                bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
                bmp.eraseColor(Color.WHITE);   // PDF có nền trong suốt → ảnh nền trắng như giấy
                page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);
            }
            uri = SaveToGalleryPlugin.insertMedia(cr, name, "image/png", album);
            if (uri == null) throw new Bad("Không tạo được mục trong thư viện", "INSERT_FAILED");
            try (OutputStream out = cr.openOutputStream(uri)) {
                if (out == null || !bmp.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new IOException("không ghi được ảnh");
            }
            SaveToGalleryPlugin.publishMedia(cr, uri);
            return uri;
        } catch (Exception | OutOfMemoryError e) {
            if (uri != null) { try { cr.delete(uri, null, null); } catch (Exception ignore) {} }
            throw e;
        } finally {
            if (bmp != null) bmp.recycle();
        }
    }

    // ===== File thường (Excel) → Tải xuống =====

    @PluginMethod
    public void saveFile(PluginCall call) {
        if (needPermission()) { requestPermissionForAlias("storage", call, "filePermCallback"); return; }
        startFile(call);
    }

    @PermissionCallback
    private void filePermCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) startFile(call);
        else call.reject("Chưa cho phép lưu vào bộ nhớ máy", "PERMISSION");
    }

    private void startFile(PluginCall call) {
        String b64 = call.getString("base64");
        if (b64 == null || b64.isEmpty()) { call.reject("Thiếu dữ liệu", "NO_DATA"); return; }
        String name = safeName(call.getString("fileName", "tep"), "tep");
        String mime = call.getString("mime", "application/octet-stream");
        String album = safeName(call.getString("album", "Điểm Danh"), "Điểm Danh");
        try { worker.execute(() -> doSaveFile(call, b64, name, mime, album)); }
        catch (RejectedExecutionException e) { call.reject("Không bắt đầu được, thử lại", "BUSY"); }
    }

    /** Chạy trên worker. resolve/reject đúng 1 lần. */
    private void doSaveFile(PluginCall call, String b64, String name, String mime, String album) {
        Context ctx = getContext();
        ContentResolver cr = ctx.getContentResolver();
        Uri uri = null;
        try {
            byte[] data;
            try { data = Base64.decode(b64, Base64.DEFAULT); }
            catch (IllegalArgumentException e) { throw new Bad("Dữ liệu file bị hỏng", "BAD_DATA"); }
            // 1) bản trong cache để chia sẻ (FileProvider: cache-path ".")
            File shareDir = new File(ctx.getCacheDir(), SHARE_DIR);
            if (!shareDir.exists()) shareDir.mkdirs();
            File share = new File(shareDir, name);
            try (FileOutputStream fo = new FileOutputStream(share)) { fo.write(data); }
            // 2) Tải xuống/<album>
            String finalName;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/" + album);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                uri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new Bad("Không tạo được file trong Tải xuống", "INSERT_FAILED");
                try (OutputStream out = cr.openOutputStream(uri)) {
                    if (out == null) throw new IOException("không mở được tệp đích");
                    out.write(data);
                }
                SaveToGalleryPlugin.publishMedia(cr, uri);
                finalName = displayName(cr, uri, name);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), album);
                if (!dir.exists() && !dir.mkdirs()) throw new Bad("Không tạo được thư mục Tải xuống/" + album, "INSERT_FAILED");
                File f = SaveToGalleryPlugin.uniqueFile(dir, name);
                try (FileOutputStream fo = new FileOutputStream(f)) { fo.write(data); }
                MediaScannerConnection.scanFile(ctx, new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
                uri = Uri.fromFile(f);
                finalName = f.getName();
            }
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            r.put("fileName", finalName);
            r.put("folder", "Download/" + album);
            r.put("shareName", share.getName());
            call.resolve(r);
        } catch (Bad b) {
            call.reject(b.getMessage(), b.code);
        } catch (Throwable e) {
            if (uri != null && "content".equals(uri.getScheme())) { try { cr.delete(uri, null, null); } catch (Exception ignore) {} }
            boolean full = isNoSpace(e);
            call.reject(full ? "Máy không đủ dung lượng trống" : "Lưu thất bại: " + e.getMessage(), full ? "NO_SPACE" : "FAILED");
        }
    }

    @PluginMethod
    public void shareFile(PluginCall call) {
        String name = call.getString("fileName");
        if (name == null || name.isEmpty()) { call.reject("Thiếu tên file", "NO_DATA"); return; }
        String mime = call.getString("mime", "application/octet-stream");
        String title = call.getString("title", "Gửi file");
        Context ctx = getContext();
        File f = new File(new File(ctx.getCacheDir(), SHARE_DIR), safeName(name, "tep"));
        if (!f.isFile()) { call.reject("Không còn file để chia sẻ — hãy xuất lại", "NOT_FOUND"); return; }
        Activity act = getActivity();
        if (act == null) { call.reject("Không mở được bảng chia sẻ", "NO_ACTIVITY"); return; }
        try {
            Uri u = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, u);
            send.putExtra(Intent.EXTRA_SUBJECT, f.getName());
            send.setClipData(ClipData.newRawUri(f.getName(), u));
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, title);
            act.runOnUiThread(() -> {
                try { act.startActivity(chooser); call.resolve(); }
                catch (Exception e) { call.reject("Không có ứng dụng nào để chia sẻ file này", "NO_APP"); }
            });
        } catch (Exception e) {
            call.reject("Không chia sẻ được: " + e.getMessage(), "FAILED");
        }
    }

    // ===== tiện ích =====

    /** "%PDF" trong 1KB đầu (chuẩn PDF cho phép rác trước header) */
    static boolean looksPdf(byte[] d) {
        if (d == null) return false;
        int n = Math.min(d.length - 3, 1024);
        for (int i = 0; i < n; i++) if (d[i] == '%' && d[i + 1] == 'P' && d[i + 2] == 'D' && d[i + 3] == 'F') return true;
        return false;
    }

    /** Tên file an toàn: bỏ ký tự cấm/dấu phân cách thư mục, không bắt đầu bằng "." */
    static String safeName(String s, String def) {
        if (s == null) return def;
        String t = s.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        while (t.startsWith(".")) t = t.substring(1);
        if (t.length() > 120) t = t.substring(0, 120);
        return t.isEmpty() ? def : t;
    }

    private static String pad(int n, int digits) {
        StringBuilder s = new StringBuilder(String.valueOf(n));
        while (s.length() < digits) s.insert(0, '0');
        return s.toString();
    }

    private static String partial(String msg, int saved, int total) {
        return saved > 0 && total > 0 ? msg + " (đã lưu " + saved + "/" + total + " trang)" : msg;
    }

    private static boolean isNoSpace(Throwable e) {
        for (Throwable t = e; t != null; t = t.getCause()) {
            String m = t.getMessage();
            if (m != null && (m.contains("ENOSPC") || m.toLowerCase().contains("no space"))) return true;
        }
        return false;
    }

    private static String displayName(ContentResolver cr, Uri uri, String fallback) {
        try (Cursor c = cr.query(uri, new String[] { MediaStore.MediaColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst()) { String s = c.getString(0); if (s != null && !s.isEmpty()) return s; }
        } catch (Exception ignore) {}
        return fallback;
    }

    /** PDF tạm còn sót + bản chia sẻ cũ hơn 1 ngày */
    private static void cleanup(Context ctx) {
        File[] tmps = ctx.getCacheDir().listFiles((d, n) -> n.startsWith(TMP_PREFIX) && n.endsWith(".pdf"));
        if (tmps != null) for (File f : tmps) f.delete();
        File[] old = new File(ctx.getCacheDir(), SHARE_DIR).listFiles();
        long cut = System.currentTimeMillis() - 24L * 3600 * 1000;
        if (old != null) for (File f : old) if (f.isFile() && f.lastModified() < cut) f.delete();
    }
}
