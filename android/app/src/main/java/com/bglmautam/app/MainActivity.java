package com.bglmautam.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveToGalleryPlugin.class);   // plugin nội bộ: lưu ảnh/GIF/video vào Thư viện
        registerPlugin(AppUpdatePlugin.class);       // plugin nội bộ: kiểm tra/tải/cài bản cập nhật từ GitHub
        registerPlugin(PdfGalleryPlugin.class);      // plugin nội bộ: bảng in PDF → ảnh trong Thư viện, Excel → Tải xuống
        super.onCreate(savedInstanceState);
    }
}
