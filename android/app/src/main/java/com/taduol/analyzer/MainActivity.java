package com.taduol.analyzer;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // WebSocket أصلي (لخدمات ترفض اتصالات المتصفح مثل بث Tiingo)
        registerPlugin(NativeSocketPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
