package org.stellarproximology.trident;

import android.content.Context;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.*;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Repo Runner core: pulls a GitHub repo onto the phone (zip over HTTPS, no git needed),
 * unpacks it into app storage, and derives how to run it from the files it contains.
 * Running happens in three places: WebView preview (HTML/JS), Pyodide (Python in the
 * WebView), or Termux (native python/node/rust/anything) via TermuxRunner.
 */
public final class RepoRunner {
    private static final Pattern GH = Pattern.compile(
            "^(?:https?://github\\.com/)?([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+?)(?:\\.git)?(?:/tree/([^\\s?#]+))?/?$");
    private static final long MAX_DOWNLOAD = 200L * 1024 * 1024;

    private final File root;

    public RepoRunner(Context c) {
        root = new File(c.getFilesDir(), "repos");
        if (!root.exists()) root.mkdirs();
    }

    public File root() { return root; }

    /** Parse "owner/repo", "https://github.com/owner/repo(.git)" or ".../tree/branch". */
    public static String[] parse(String spec) {
        Matcher m = GH.matcher(spec == null ? "" : spec.trim());
        if (!m.matches()) return null;
        return new String[]{m.group(1), m.group(2), m.group(3)};
    }

    public static String folderName(String owner, String repo) {
        return (owner + "__" + repo).replaceAll("[^A-Za-z0-9_.-]", "_");
    }

    /** Download + unpack. Branch empty = repo default branch (codeload HEAD). */
    public JSONObject fetch(String spec, String branch) throws Exception {
        String[] p = parse(spec);
        if (p == null) throw new IllegalArgumentException("Use owner/repo or a github.com URL");
        if ((branch == null || branch.trim().isEmpty()) && p[2] != null) branch = p[2];
        String ref = (branch == null || branch.trim().isEmpty()) ? "HEAD" : branch.trim();
        String url = "https://codeload.github.com/" + p[0] + "/" + p[1] + "/zip/" + ref;

        String name = folderName(p[0], p[1]);
        File dest = new File(root, name);
        File tmp = new File(root, name + ".incoming");
        deleteTree(tmp);
        tmp.mkdirs();

        HttpURLConnection con = (HttpURLConnection) new URL(url).openConnection();
        con.setInstanceFollowRedirects(true);
        con.setConnectTimeout(20000);
        con.setReadTimeout(60000);
        con.setRequestProperty("User-Agent", "Trident-RepoRunner");
        int code = con.getResponseCode();
        if (code != 200) {
            deleteTree(tmp);
            throw new IOException("GitHub returned HTTP " + code + " for " + p[0] + "/" + p[1] + "@" + ref
                    + (code == 404 ? " (private repo, wrong name, or wrong branch)" : ""));
        }
        int files = 0;
        long total = 0;
        String canonTmp = tmp.getCanonicalPath() + File.separator;
        try (ZipInputStream zin = new ZipInputStream(new BufferedInputStream(con.getInputStream()))) {
            ZipEntry e;
            byte[] buf = new byte[64 * 1024];
            while ((e = zin.getNextEntry()) != null) {
                String n = e.getName();
                int slash = n.indexOf('/');              // strip "repo-branch/" top folder
                if (slash < 0) continue;
                n = n.substring(slash + 1);
                if (n.isEmpty()) continue;
                File out = new File(tmp, n);
                if (!out.getCanonicalPath().startsWith(canonTmp)) throw new IOException("Unsafe path in zip: " + n);
                if (e.isDirectory()) { out.mkdirs(); continue; }
                out.getParentFile().mkdirs();
                try (OutputStream os = new BufferedOutputStream(new FileOutputStream(out))) {
                    int r;
                    while ((r = zin.read(buf)) > 0) {
                        total += r;
                        if (total > MAX_DOWNLOAD) throw new IOException("Repo larger than 200 MB unpacked");
                        os.write(buf, 0, r);
                    }
                }
                files++;
            }
        } catch (Exception ex) {
            deleteTree(tmp);
            throw ex;
        } finally {
            con.disconnect();
        }
        // Keep the previous copy next to the new one instead of destroying it.
        if (dest.exists()) {
            File old = new File(root, name + ".previous");
            deleteTree(old);
            dest.renameTo(old);
        }
        if (!tmp.renameTo(dest)) throw new IOException("Could not move repo into place");

        JSONObject meta = new JSONObject()
                .put("owner", p[0]).put("repo", p[1]).put("ref", ref)
                .put("cloneUrl", "https://github.com/" + p[0] + "/" + p[1] + ".git")
                .put("fetchedAt", System.currentTimeMillis()).put("files", files).put("bytes", total);
        writeText(new File(dest, ".trident-repo.json"), meta.toString(2));
        return describe(name);
    }

    public JSONArray list() throws Exception {
        JSONArray a = new JSONArray();
        File[] kids = root.listFiles();
        if (kids == null) return a;
        for (File k : kids) {
            if (!k.isDirectory() || k.getName().endsWith(".incoming") || k.getName().endsWith(".previous")) continue;
            try { a.put(describe(k.getName())); } catch (Exception ignored) { }
        }
        return a;
    }

    /** Metadata + derived run plan for one unpacked repo. */
    public JSONObject describe(String name) throws Exception {
        File dir = repoDir(name);
        JSONObject meta = new JSONObject();
        File mf = new File(dir, ".trident-repo.json");
        if (mf.exists()) meta = new JSONObject(readText(mf, 1 << 16));
        meta.put("name", name);
        meta.put("plan", plan(dir));
        return meta;
    }

    /** Derive stacks and commands from the files present (rules, not a lookup of known repos). */
    static JSONObject plan(File dir) throws Exception {
        JSONObject plan = new JSONObject();
        JSONArray stacks = new JSONArray();

        // Web: first index.html in root or a conventional output folder.
        String web = null;
        for (String c : new String[]{"index.html", "public/index.html", "dist/index.html", "docs/index.html",
                "build/index.html", "www/index.html", "app/src/main/assets/index.html", "src/index.html"}) {
            if (new File(dir, c).isFile()) { web = c; break; }
        }
        if (web != null) {
            stacks.put("web");
            plan.put("webEntry", web);
        }

        // Node
        File pkg = new File(dir, "package.json");
        if (pkg.isFile()) {
            stacks.put("node");
            JSONObject pj = new JSONObject();
            try { pj = new JSONObject(readText(pkg, 1 << 20)); } catch (Exception ignored) { }
            JSONObject scripts = pj.optJSONObject("scripts");
            String run;
            if (scripts != null && scripts.has("start")) run = "npm start";
            else if (scripts != null && scripts.has("dev")) run = "npm run dev";
            else if (pj.has("main")) run = "node " + pj.optString("main");
            else if (new File(dir, "index.js").isFile()) run = "node index.js";
            else run = "npm test";
            String install = new File(dir, "package-lock.json").isFile() ? "npm ci" : "npm install";
            plan.put("node", new JSONObject().put("install", install).put("run", run).put("pkg", "nodejs"));
        }

        // Python
        boolean req = new File(dir, "requirements.txt").isFile();
        boolean pyproj = new File(dir, "pyproject.toml").isFile() || new File(dir, "setup.py").isFile();
        String pyEntry = null;
        for (String c : new String[]{"main.py", "app.py", "run.py", "__main__.py", "cli.py", "server.py", "manage.py"}) {
            if (new File(dir, c).isFile()) { pyEntry = c; break; }
        }
        if (pyEntry == null) {
            File[] top = dir.listFiles();
            if (top != null) for (File f : top) if (f.isFile() && f.getName().endsWith(".py")) { pyEntry = f.getName(); break; }
        }
        if (req || pyproj || pyEntry != null) {
            stacks.put("python");
            String install = req ? "pip install -r requirements.txt" : (pyproj ? "pip install ." : "");
            String run = pyEntry != null ? "python " + pyEntry : "python -m " + dir.getName();
            plan.put("python", new JSONObject().put("install", install).put("run", run)
                    .put("entry", pyEntry == null ? JSONObject.NULL : pyEntry)
                    .put("requirements", req ? readText(new File(dir, "requirements.txt"), 1 << 16) : "")
                    .put("pkg", "python"));
        }

        // Rust
        if (new File(dir, "Cargo.toml").isFile()) {
            stacks.put("rust");
            plan.put("rust", new JSONObject().put("install", "cargo build --release").put("run", "cargo run --release").put("pkg", "rust"));
        }

        // Android/Gradle: can be built on the phone only with a full SDK; flag honestly.
        if (new File(dir, "settings.gradle").isFile() || new File(dir, "settings.gradle.kts").isFile()) {
            stacks.put("android-gradle");
            plan.put("androidNote", "Gradle/Android project: build it with GitHub Actions; a phone has no Android SDK by default.");
        }

        // Shell
        for (String c : new String[]{"run.sh", "start.sh", "install.sh"}) {
            if (new File(dir, c).isFile()) {
                stacks.put("shell");
                plan.put("shell", new JSONObject().put("install", "").put("run", "bash " + c).put("pkg", ""));
                break;
            }
        }
        plan.put("stacks", stacks);
        return plan;
    }

    public JSONArray files(String name, int limit) throws Exception {
        File dir = repoDir(name);
        JSONArray a = new JSONArray();
        List<File> stack = new ArrayList<>();
        stack.add(dir);
        String base = dir.getCanonicalPath();
        while (!stack.isEmpty() && a.length() < limit) {
            File d = stack.remove(stack.size() - 1);
            File[] kids = d.listFiles();
            if (kids == null) continue;
            for (File k : kids) {
                String n = k.getName();
                if (n.equals(".git") || n.equals("node_modules") || n.equals("__pycache__")) continue;
                if (k.isDirectory()) stack.add(k);
                else {
                    a.put(new JSONObject().put("path", k.getCanonicalPath().substring(base.length() + 1)).put("size", k.length()));
                    if (a.length() >= limit) break;
                }
            }
        }
        return a;
    }

    public String read(String name, String path) throws Exception {
        File f = safe(repoDir(name), path);
        if (!f.isFile()) throw new FileNotFoundException(path);
        return readText(f, 512 * 1024);
    }

    public File repoDir(String name) throws IOException {
        if (name == null || !name.matches("[A-Za-z0-9_.-]+")) throw new IOException("Bad repo name");
        File d = new File(root, name);
        if (!d.isDirectory()) throw new FileNotFoundException("Repo not fetched: " + name);
        return d;
    }

    static File safe(File base, String rel) throws IOException {
        File f = new File(base, rel);
        if (!f.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator)) throw new IOException("Path escapes repo");
        return f;
    }

    static String readText(File f, int max) throws IOException {
        try (InputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] b = new byte[8192];
            int r, t = 0;
            while ((r = in.read(b)) > 0 && t < max) { bo.write(b, 0, Math.min(r, max - t)); t += r; }
            return new String(bo.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    static void writeText(File f, String s) throws IOException {
        try (OutputStream o = new FileOutputStream(f)) { o.write(s.getBytes(StandardCharsets.UTF_8)); }
    }

    static void deleteTree(File f) {
        if (f == null || !f.exists()) return;
        File[] k = f.listFiles();
        if (k != null) for (File c : k) deleteTree(c);
        f.delete();
    }

    static String mime(String n) {
        n = n.toLowerCase(Locale.ROOT);
        if (n.endsWith(".html") || n.endsWith(".htm")) return "text/html; charset=utf-8";
        if (n.endsWith(".js") || n.endsWith(".mjs")) return "text/javascript; charset=utf-8";
        if (n.endsWith(".css")) return "text/css; charset=utf-8";
        if (n.endsWith(".json") || n.endsWith(".map")) return "application/json; charset=utf-8";
        if (n.endsWith(".svg")) return "image/svg+xml";
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".wasm")) return "application/wasm";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".woff2")) return "font/woff2";
        if (n.endsWith(".py") || n.endsWith(".txt") || n.endsWith(".md") || n.endsWith(".toml") || n.endsWith(".rs")) return "text/plain; charset=utf-8";
        return "application/octet-stream";
    }
}
