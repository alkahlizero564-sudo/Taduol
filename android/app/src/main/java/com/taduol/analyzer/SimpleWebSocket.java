package com.taduol.analyzer;

import java.io.ByteArrayOutputStream;
import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;

import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLParameters;
import javax.net.ssl.SSLSocket;
import javax.net.ssl.SSLSocketFactory;

/**
 * عميل WebSocket بسيط (RFC 6455) بلغة Java القياسية فقط — بدون مكتبات خارجية.
 * يُستخدم من التطبيق الأصلي لأن متصفح WebView يرسل ترويسة Origin التي ترفضها بعض الخدمات (مثل Tiingo).
 * يدعم wss:// و ws://، الرسائل النصية، ping/pong، والإغلاق.
 */
public class SimpleWebSocket {

    public interface Listener {
        void onOpen();
        void onMessage(String text);
        void onClose(int code, String reason);
        void onError(String message);
    }

    private static final String GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
    private final URI uri;
    private final Listener listener;
    private final SecureRandom random = new SecureRandom();
    private Socket socket;
    private OutputStream out;
    private volatile boolean closed = false;
    private volatile boolean closeNotified = false;

    public SimpleWebSocket(String url, Listener listener) {
        this.uri = URI.create(url);
        this.listener = listener;
    }

    /** يبدأ الاتصال في خيط منفصل */
    public void connect() {
        Thread t = new Thread(this::run, "SimpleWebSocket");
        t.setDaemon(true);
        t.start();
    }

    private void run() {
        try {
            boolean secure = "wss".equalsIgnoreCase(uri.getScheme());
            String host = uri.getHost();
            int port = uri.getPort() != -1 ? uri.getPort() : (secure ? 443 : 80);
            Socket s = new Socket();
            s.connect(new InetSocketAddress(host, port), 15000);
            if (secure) {
                SSLSocket ssl = (SSLSocket) ((SSLSocketFactory) SSLSocketFactory.getDefault()).createSocket(s, host, port, true);
                // التحقق من اسم الخادم داخل TLS نفسه (يعمل في Java وAndroid)
                SSLParameters params = ssl.getSSLParameters();
                params.setEndpointIdentificationAlgorithm("HTTPS");
                ssl.setSSLParameters(params);
                ssl.startHandshake();
                // وعلى Android نتحقق أيضاً بالمتحقق الافتراضي للنظام
                boolean android = String.valueOf(System.getProperty("java.vendor")).toLowerCase().contains("android");
                if (android && !HttpsURLConnection.getDefaultHostnameVerifier().verify(host, ssl.getSession())) {
                    ssl.close();
                    throw new IOException("TLS hostname mismatch for " + host);
                }
                s = ssl;
            }
            s.setSoTimeout(0);
            socket = s;
            out = s.getOutputStream();
            InputStream in = s.getInputStream();
            handshake(host, port, secure, in);
            listener.onOpen();
            readLoop(in);
        } catch (Exception e) {
            if (!closed) listener.onError(e.getClass().getSimpleName() + ": " + e.getMessage());
            notifyClose(1006, e.getMessage() == null ? "" : e.getMessage());
        } finally {
            closeQuietly();
        }
    }

    private void handshake(String host, int port, boolean secure, InputStream in) throws Exception {
        byte[] nonce = new byte[16];
        random.nextBytes(nonce);
        String key = b64(nonce);
        String path = (uri.getRawPath() == null || uri.getRawPath().isEmpty() ? "/" : uri.getRawPath())
                + (uri.getRawQuery() != null ? "?" + uri.getRawQuery() : "");
        boolean defaultPort = (secure && port == 443) || (!secure && port == 80);
        String req = "GET " + path + " HTTP/1.1\r\n"
                + "Host: " + host + (defaultPort ? "" : ":" + port) + "\r\n"
                + "Upgrade: websocket\r\n"
                + "Connection: Upgrade\r\n"
                + "Sec-WebSocket-Key: " + key + "\r\n"
                + "Sec-WebSocket-Version: 13\r\n"
                + "User-Agent: Taduol-Android\r\n\r\n";
        out.write(req.getBytes(StandardCharsets.US_ASCII));
        out.flush();

        String status = readLine(in);
        if (status == null || !status.startsWith("HTTP/1.1 101")) {
            String line;
            while ((line = readLine(in)) != null && !line.isEmpty()) { /* تجاهل الترويسات */ }
            throw new IOException("Handshake rejected: " + status);
        }
        String accept = null;
        String line;
        while ((line = readLine(in)) != null && !line.isEmpty()) {
            int i = line.indexOf(':');
            if (i > 0 && line.substring(0, i).trim().equalsIgnoreCase("Sec-WebSocket-Accept")) accept = line.substring(i + 1).trim();
        }
        String expected = b64(
                MessageDigest.getInstance("SHA-1").digest((key + GUID).getBytes(StandardCharsets.US_ASCII)));
        if (!expected.equals(accept)) throw new IOException("Bad Sec-WebSocket-Accept");
    }

    /** ترميز Base64 (بدون java.util.Base64 لدعم Android 7) */
    static String b64(byte[] d) {
        final String A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < d.length; i += 3) {
            int n = (d[i] & 0xFF) << 16 | (i + 1 < d.length ? (d[i + 1] & 0xFF) << 8 : 0) | (i + 2 < d.length ? d[i + 2] & 0xFF : 0);
            sb.append(A.charAt(n >> 18 & 63)).append(A.charAt(n >> 12 & 63));
            sb.append(i + 1 < d.length ? A.charAt(n >> 6 & 63) : '=').append(i + 2 < d.length ? A.charAt(n & 63) : '=');
        }
        return sb.toString();
    }

    private static String readLine(InputStream in) throws IOException {
        ByteArrayOutputStream b = new ByteArrayOutputStream();
        int c;
        while ((c = in.read()) != -1) {
            if (c == '\n') break;
            if (c != '\r') b.write(c);
        }
        if (c == -1 && b.size() == 0) return null;
        return b.toString("ISO-8859-1");
    }

    private void readLoop(InputStream in) throws IOException {
        ByteArrayOutputStream message = new ByteArrayOutputStream();
        while (!closed) {
            int b0 = in.read();
            if (b0 == -1) throw new EOFException("Connection closed by server");
            int b1 = readByte(in);
            boolean fin = (b0 & 0x80) != 0;
            int opcode = b0 & 0x0F;
            boolean masked = (b1 & 0x80) != 0;
            long len = b1 & 0x7F;
            if (len == 126) len = ((readByte(in) << 8) | readByte(in));
            else if (len == 127) { len = 0; for (int i = 0; i < 8; i++) len = (len << 8) | readByte(in); }
            if (len > 16 * 1024 * 1024) throw new IOException("Frame too large");
            byte[] mask = masked ? readFully(in, 4) : null;
            byte[] payload = readFully(in, (int) len);
            if (mask != null) for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];

            switch (opcode) {
                case 0x0: // continuation
                case 0x1: // text
                    message.write(payload);
                    if (fin) {
                        listener.onMessage(message.toString("UTF-8"));
                        message.reset();
                    }
                    break;
                case 0x2: // binary — غير مستخدم
                    break;
                case 0x8: { // close
                    int code = payload.length >= 2 ? ((payload[0] & 0xFF) << 8) | (payload[1] & 0xFF) : 1005;
                    String reason = payload.length > 2 ? new String(payload, 2, payload.length - 2, StandardCharsets.UTF_8) : "";
                    sendFrame(0x8, payload);
                    closed = true;
                    notifyClose(code, reason);
                    return;
                }
                case 0x9: // ping → pong
                    sendFrame(0xA, payload);
                    break;
                default: // pong وغيره
                    break;
            }
        }
    }

    private static int readByte(InputStream in) throws IOException {
        int b = in.read();
        if (b == -1) throw new EOFException("Unexpected end of stream");
        return b;
    }

    private static byte[] readFully(InputStream in, int n) throws IOException {
        byte[] buf = new byte[n];
        int off = 0;
        while (off < n) {
            int r = in.read(buf, off, n - off);
            if (r == -1) throw new EOFException("Unexpected end of stream");
            off += r;
        }
        return buf;
    }

    /** إرسال رسالة نصية */
    public void send(String text) {
        new Thread(() -> {
            try { sendFrame(0x1, text.getBytes(StandardCharsets.UTF_8)); }
            catch (IOException e) { listener.onError("send: " + e.getMessage()); }
        }, "SimpleWebSocket-send").start();
    }

    /** كل إطارات العميل يجب أن تكون مقنّعة (masked) */
    private synchronized void sendFrame(int opcode, byte[] payload) throws IOException {
        if (out == null) throw new IOException("Not connected");
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | opcode);
        int len = payload.length;
        if (len < 126) f.write(0x80 | len);
        else if (len <= 0xFFFF) { f.write(0x80 | 126); f.write(len >> 8); f.write(len & 0xFF); }
        else { f.write(0x80 | 127); for (int i = 7; i >= 0; i--) f.write((int) (((long) len >> (8 * i)) & 0xFF)); }
        byte[] mask = new byte[4];
        random.nextBytes(mask);
        f.write(mask);
        for (int i = 0; i < len; i++) f.write(payload[i] ^ mask[i % 4]);
        out.write(f.toByteArray());
        out.flush();
    }

    public void close() {
        if (closed) return;
        closed = true;
        new Thread(() -> {
            try { sendFrame(0x8, new byte[]{0x03, (byte) 0xE8}); } catch (IOException ignored) { }
            closeQuietly();
            notifyClose(1000, "client closed");
        }, "SimpleWebSocket-close").start();
    }

    private void notifyClose(int code, String reason) {
        if (closeNotified) return;
        closeNotified = true;
        listener.onClose(code, reason);
    }

    private void closeQuietly() {
        try { if (socket != null) socket.close(); } catch (IOException ignored) { }
    }
}
