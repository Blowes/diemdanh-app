package com.bglmautam.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SaveToGalleryPlugin.class);   // plugin nội bộ: lưu ảnh/GIF/video vào Thư viện
        super.onCreate(savedInstanceState);
    }
}
