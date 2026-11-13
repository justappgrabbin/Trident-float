package org.stellarproximology.trident;

import java.io.*;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Serves fetched repos at http://127.0.0.1:8788/<repo-folder>/<path> so HTML/JS repos
 * run with real relative URLs, ES modules, fetch() and wasm (file:// breaks those).
 * Loopback only. Separate from LocalBridgeServer (8787), which stays as it was.
 */
public final class RepoStaticServer {
    public static final int PORT = 8788;
    private final File root;
    private volatile ServerSocket server;
    private final ExecutorService pool = Executors.newCachedThreadPool();

    public RepoStaticServer(File root) { this.root = root; }

    public void start() {
        if (server != null) return;
        pool.submit(() -> {
            try {
                server = new ServerSocket(PORT, 16, InetAddress.getByName("127.0.0.1"));
                while (!server.isClosed()) {
                    Socket s = server.accept();
                    pool.submit(() -> handle(s));
                }
            } catch (Exception ignored) { }
        });
    }

    public void stop() {
        try { if (server != null) server.close(); } catch (Exception ignored) { }
        server = null;
        pool.shutdownNow();
    }

    private void handle(Socket s) {
        try (Socket sock = s; InputStream in = sock.getInputStream(); OutputStream out = sock.getOutputStream()) {
            BufferedReader r = new BufferedReader(new InputStreamReader(in, StandardCharsets.UTF_8));
            String first = r.readLine();
            if (first == null) return;
            String l;
            while ((l = r.readLine()) != null && !l.isEmpty()) { /* drain headers */ }
            String[] parts = first.split(" ");
            if (parts.length < 2) return;
            boolean head = "HEAD".equals(parts[0]);
            if ("OPTIONS".equals(parts[0])) { send(out, 204, "text/plain", new byte[0], false); return; }
            String path = parts[1];
            int q = path.indexOf('?');
            if (q >= 0) path = path.substring(0, q);
            int h = path.indexOf('#');
            if (h >= 0) path = path.substring(0, h);
            path = URLDecoder.decode(path, "UTF-8");
            while (path.startsWith("/")) path = path.substring(1);
            if (path.isEmpty()) { send(out, 404, "text/plain", "No repo in path".getBytes(StandardCharsets.UTF_8), head); return; }

            File f;
            try { f = RepoRunner.safe(root, path); } catch (IOException e) {
                send(out, 403, "text/plain", "Forbidden".getBytes(StandardCharsets.UTF_8), head); return;
            }
            if (f.isDirectory()) f = new File(f, "index.html");
            if (!f.isFile()) { send(out, 404, "text/plain", ("Not found: " + path).getBytes(StandardCharsets.UTF_8), head); return; }

            String hdr = "HTTP/1.1 200 OK\r\nContent-Type: " + RepoRunner.mime(f.getName())
                    + "\r\nContent-Length: " + f.length()
                    + "\r\nAccess-Control-Allow-Origin: *\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n";
            out.write(hdr.getBytes(StandardCharsets.UTF_8));
            if (!head) {
                try (InputStream fin = new FileInputStream(f)) {
                    byte[] b = new byte[64 * 1024];
                    int n;
                    while ((n = fin.read(b)) > 0) out.write(b, 0, n);
                }
            }
            out.flush();
        } catch (Exception ignored) { }
    }

    private static void send(OutputStream out, int code, String type, byte[] body, boolean head) throws IOException {
        String hdr = "HTTP/1.1 " + code + " X\r\nContent-Type: " + type + "\r\nContent-Length: " + body.length
                + "\r\nAccess-Control-Allow-Origin: *\r\nAccess-Control-Allow-Methods: GET, HEAD, OPTIONS\r\nAccess-Control-Allow-Headers: *\r\nConnection: close\r\n\r\n";
        out.write(hdr.getBytes(StandardCharsets.UTF_8));
        if (!head) out.write(body);
        out.flush();
    }
}
