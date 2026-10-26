package com.bglmautam.app;

import android.os.Bundle;
import android.webkit.WebView;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveToGalleryPlugin.class);   // plugin nội bộ: lưu ảnh/GIF/video vào Thư viện
        registerPlugin(AppUpdatePlugin.class);       // plugin nội bộ: kiểm tra/tải/cài bản cập nhật từ GitHub
        registerPlugin(PdfGalleryPlugin.class);      // plugin nội bộ: bảng in PDF → ảnh trong Thư viện, Excel → Tải xuống
        super.onCreate(savedInstanceState);
        applyFontScale();
    }

    // Cỡ chữ hệ thống (Cài đặt → Hiển thị → Cỡ chữ) -> cỡ chữ trong WebView (mặc định WebView luôn 100%).
    // Giới hạn 85–130% để bố cục không vỡ. Đổi cỡ chữ hệ thống thì Activity được tạo lại -> chạy lại ở onCreate.
    private void applyFontScale() {
        try {
            WebView wv = bridge != null ? bridge.getWebView() : null;
            if (wv == null) return;
            float scale = getResources().getConfiguration().fontScale;
            int zoom = Math.round(scale * 100f);
            if (zoom < 85) zoom = 85;
            if (zoom > 130) zoom = 130;
            wv.getSettings().setTextZoom(zoom);
        } catch (Exception ignored) {
            // không chỉnh được cỡ chữ thì giữ mặc định 100%
        }
    }
}
