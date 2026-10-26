package com.bglmautam.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * Hệ thống gửi MY_PACKAGE_REPLACED ngay sau khi cài đè bản cập nhật xong
 * → xoá APK đã tải trong thư mục updates cho nhẹ máy, kể cả khi người dùng chưa mở lại app.
 * Chỉ xoá file cập nhật — dữ liệu app (ảnh, đăng nhập, cài đặt) giữ nguyên.
 */
public class UpdateCleanupReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || !Intent.ACTION_MY_PACKAGE_REPLACED.equals(intent.getAction())) return;
        try { UpdateFiles.clear(context, null); } catch (Exception ignore) {}
    }
}
