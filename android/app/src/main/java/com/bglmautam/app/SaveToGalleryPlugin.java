package com.bglmautam.app;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;

/**
 * Lưu ảnh / GIF / video vào Thư viện của máy (album "Điểm Danh") qua MediaStore.
 * Android 10+ không cần quyền; Android 9 trở xuống xin WRITE_EXTERNAL_STORAGE.
 */
@CapacitorPlugin(
    name = "SaveToGallery",
    permissions = { @Permission(alias = "storage", strings = { Manifest.permission.WRITE_EXTERNAL_STORAGE }) }
)
public class SaveToGalleryPlugin extends Plugin {

    @PluginMethod
    public void save(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && getPermissionState("storage") != PermissionState.GRANTED) {
            requestPermissionForAlias("storage", call, "storageCallback");
            return;
        }
        doSave(call);
    }

    @PermissionCallback
    private void storageCallback(PluginCall call) {
        if (getPermissionState("storage") == PermissionState.GRANTED) doSave(call);
        else call.reject("Chưa cho phép lưu vào thư viện");
    }

    private void doSave(PluginCall call) {
        String base64 = call.getString("base64");
        String path = call.getString("path");
        String name = call.getString("fileName", "diem-danh.png");
        String mime = call.getString("mime", "image/png");
        String album = call.getString("album", "Điểm Danh");
        if (base64 == null && path == null) { call.reject("Thiếu dữ liệu"); return; }
        boolean video = mime.startsWith("video/");
        ContentResolver cr = getContext().getContentResolver();
        Uri uri = null;
        try (InputStream in = base64 != null
                ? new ByteArrayInputStream(Base64.decode(base64, Base64.DEFAULT))
                : cr.openInputStream(Uri.parse(path))) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            Uri collection;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, (video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES) + "/" + album);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                collection = video ? MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
                                   : MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            } else {
                File dir = new File(Environment.getExternalStoragePublicDirectory(video ? Environment.DIRECTORY_MOVIES : Environment.DIRECTORY_PICTURES), album);
                if (!dir.exists()) dir.mkdirs();
                v.put(MediaStore.MediaColumns.DATA, new File(dir, name).getAbsolutePath());
                collection = video ? MediaStore.Video.Media.EXTERNAL_CONTENT_URI : MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
            }
            uri = cr.insert(collection, v);
            if (uri == null) { call.reject("Không tạo được mục trong thư viện"); return; }
            try (OutputStream out = cr.openOutputStream(uri)) {
                byte[] buf = new byte[65536]; int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                cr.update(uri, done, null, null);
            }
            JSObject r = new JSObject();
            r.put("uri", uri.toString());
            call.resolve(r);
        } catch (Exception e) {
            if (uri != null) { try { cr.delete(uri, null, null); } catch (Exception ignore) {} }
            call.reject("Lưu thất bại: " + e.getMessage());
        }
    }
}
