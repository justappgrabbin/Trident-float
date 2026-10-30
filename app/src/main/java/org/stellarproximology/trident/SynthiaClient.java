package org.stellarproximology.trident;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.HashSet;
import java.util.Arrays;

/** Fixed local backend routes; Android Hands continues to own port 8787. */
final class SynthiaClient {
    private static final Set<String> GET = new HashSet<>(Arrays.asList("/api/audit", "/api/tools", "/api/state"));
    private static final Set<String> POST = new HashSet<>(Arrays.asList("/api/chat", "/api/tools/run"));
    static String request(String route, String payload) throws IOException {
        boolean post = POST.contains(route);
        if (!post && !GET.contains(route)) throw new IOException("Unsupported Synthia route");
        HttpURLConnection conn = (HttpURLConnection) new URL("http://127.0.0.1:8765" + route).openConnection();
        try {
            conn.setConnectTimeout(2500);
            conn.setReadTimeout(60000);
            conn.setRequestMethod(post ? "POST" : "GET");
            if (post) {
                byte[] body = payload.getBytes(StandardCharsets.UTF_8);
                if (body.length > 1_000_000) throw new IOException("Request exceeds 1 MB");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream out = conn.getOutputStream()) { out.write(body); }
            }
            int status = conn.getResponseCode();
            InputStream source = status < 400 ? conn.getInputStream() : conn.getErrorStream();
            if (source == null) throw new IOException("Synthia HTTP " + status);
            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            try (InputStream in = source) {
                byte[] buffer = new byte[4096]; int count;
                while ((count = in.read(buffer)) != -1) {
                    if (bytes.size() + count > 4_000_000) throw new IOException("Response exceeds 4 MB");
                    bytes.write(buffer, 0, count);
                }
            }
            String response = bytes.toString("UTF-8");
            if (status >= 400) throw new IOException("Synthia HTTP " + status + ": " + response);
            return response;
        } finally { conn.disconnect(); }
    }
}
