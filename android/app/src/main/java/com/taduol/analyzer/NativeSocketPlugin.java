package com.taduol.analyzer;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * WebSocket أصلي للصفحة: يفتح الاتصال من Android مباشرة (بدون ترويسة Origin الخاصة بالمتصفح)
 * ويرسل الأحداث للصفحة عبر الحدث "socket": { id, type: open|message|close|error, data, code, reason }
 */
@CapacitorPlugin(name = "NativeSocket")
public class NativeSocketPlugin extends Plugin {

    private final Map<String, SimpleWebSocket> sockets = new ConcurrentHashMap<>();

    @PluginMethod
    public void open(PluginCall call) {
        final String id = call.getString("id");
        final String url = call.getString("url");
        if (id == null || url == null || !(url.startsWith("wss://") || url.startsWith("ws://"))) {
            call.reject("id and a ws(s):// url are required");
            return;
        }
        SimpleWebSocket old = sockets.remove(id);
        if (old != null) old.close();
        SimpleWebSocket ws = new SimpleWebSocket(url, new SimpleWebSocket.Listener() {
            @Override public void onOpen() { emit(id, "open", null, 0, null); }
            @Override public void onMessage(String text) { emit(id, "message", text, 0, null); }
            @Override public void onClose(int code, String reason) { sockets.remove(id); emit(id, "close", null, code, reason); }
            @Override public void onError(String message) { emit(id, "error", message, 0, null); }
        });
        sockets.put(id, ws);
        ws.connect();
        call.resolve();
    }

    @PluginMethod
    public void send(PluginCall call) {
        SimpleWebSocket ws = sockets.get(call.getString("id", ""));
        if (ws == null) { call.reject("socket not open"); return; }
        ws.send(call.getString("data", ""));
        call.resolve();
    }

    @PluginMethod
    public void close(PluginCall call) {
        SimpleWebSocket ws = sockets.remove(call.getString("id", ""));
        if (ws != null) ws.close();
        call.resolve();
    }

    private void emit(String id, String type, String data, int code, String reason) {
        JSObject ev = new JSObject();
        ev.put("id", id);
        ev.put("type", type);
        if (data != null) ev.put("data", data);
        if (code != 0) ev.put("code", code);
        if (reason != null) ev.put("reason", reason);
        notifyListeners("socket", ev);
    }

    @Override
    protected void handleOnDestroy() {
        for (SimpleWebSocket ws : sockets.values()) ws.close();
        sockets.clear();
    }
}
