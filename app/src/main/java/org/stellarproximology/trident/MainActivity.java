package org.stellarproximology.trident;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.content.*;
import android.net.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private WebView web;
    private TextToSpeech tts;
    private String pendingSpeech = "";
    private RepoRunner repos;
    private final ExecutorService work = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        tts = new TextToSpeech(this, this);
        repos = new RepoRunner(this);
        TermuxRunner.sink = (job, result) -> callback(job, result.toString());
        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        web.addJavascriptInterface(new Bridge(), "TridentAndroid");
        web.loadUrl("file:///android_asset/index.html");
        setContentView(web);
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(new Intent(this, BridgeForegroundService.class)); else startService(new Intent(this, BridgeForegroundService.class));
    }

    @Override public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            tts.setLanguage(Locale.getDefault());
            tts.setSpeechRate(0.96f);
            if (!pendingSpeech.isEmpty()) {
                speakNow(pendingSpeech);
                pendingSpeech = "";
            }
        }
    }

    private void speakNow(String text) {
        if (tts == null || text == null || text.trim().isEmpty()) return;
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "cynthia-talk");
    }

    /** Deliver an async result to JS: window.__tridentCb(id, jsonString). */
    private void callback(String id, String json) {
        final String js = "window.__tridentCb&&window.__tridentCb(" + JSONObject.quote(id) + "," + JSONObject.quote(json) + ")";
        runOnUiThread(() -> { if (web != null) web.evaluateJavascript(js, null); });
    }

    private interface Job { Object run() throws Exception; }

    private void async(String id, Job job) {
        work.submit(() -> {
            JSONObject o = new JSONObject();
            try { o.put("ok", true).put("data", job.run()); }
            catch (Exception e) { try { o.put("ok", false).put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { } }
            callback(id, o.toString());
        });
    }

    @Override protected void onDestroy() {
        TermuxRunner.sink = null;
        work.shutdownNow();
        if (tts != null) { tts.stop(); tts.shutdown(); }
        super.onDestroy();
    }

    @Override public void onBackPressed() {
        if (web.canGoBack()) web.goBack(); else super.onBackPressed();
    }

    public class Bridge {
        @JavascriptInterface public void attach() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.setType("*/*");
                i.addCategory(Intent.CATEGORY_OPENABLE);
                startActivityForResult(i, 7);
            });
        }
        @JavascriptInterface public void overlay() {
            runOnUiThread(() -> {
                if (!Settings.canDrawOverlays(MainActivity.this)) {
                    startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:" + getPackageName())));
                }
            });
        }
        @JavascriptInterface public void accessibilitySettings() { runOnUiThread(() -> startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS))); }
        @JavascriptInterface public void startHands() { runOnUiThread(() -> { if (Build.VERSION.SDK_INT >= 26) startForegroundService(new Intent(MainActivity.this, BridgeForegroundService.class)); else startService(new Intent(MainActivity.this, BridgeForegroundService.class)); }); }
        @JavascriptInterface public void speak(String text) {
            runOnUiThread(() -> {
                if (tts == null) pendingSpeech = text; else speakNow(text);
            });
        }
        // ---- Repo Runner ----
        @JavascriptInterface public void repoFetch(String id, String spec, String branch) { async(id, () -> repos.fetch(spec, branch)); }
        @JavascriptInterface public void repoList(String id) { async(id, () -> repos.list()); }
        @JavascriptInterface public void repoDescribe(String id, String name) { async(id, () -> repos.describe(name)); }
        @JavascriptInterface public void repoFiles(String id, String name) { async(id, () -> repos.files(name, 5000)); }
        @JavascriptInterface public void repoRead(String id, String name, String path) { async(id, () -> repos.read(name, path)); }
        @JavascriptInterface public String runnerStatus() {
            try {
                return new JSONObject()
                        .put("staticServer", "http://127.0.0.1:" + RepoStaticServer.PORT + "/")
                        .put("termuxInstalled", TermuxRunner.installed(MainActivity.this))
                        .put("termuxPermission", Build.VERSION.SDK_INT < 23 || checkSelfPermission(TermuxRunner.PERMISSION) == android.content.pm.PackageManager.PERMISSION_GRANTED)
                        .toString();
            } catch (Exception e) { return "{}"; }
        }
        @JavascriptInterface public void termuxPermission() {
            runOnUiThread(() -> { if (Build.VERSION.SDK_INT >= 23) requestPermissions(new String[]{TermuxRunner.PERMISSION}, 41); });
        }
        @JavascriptInterface public void termuxRun(String id, String name, String cloneUrl, String ref, String pkg, String install, String run, boolean background) {
            try {
                if (!TermuxRunner.installed(MainActivity.this)) throw new Exception("Termux is not installed");
                String folder = name.replaceAll("[^A-Za-z0-9_.-]", "_");
                TermuxRunner.run(MainActivity.this, id, TermuxRunner.script(folder, cloneUrl, ref, pkg, install, run), background);
            } catch (Exception e) {
                callback(id, "{\"ok\":false,\"error\":" + JSONObject.quote(String.valueOf(e.getMessage())) + "}");
            }
        }
        @JavascriptInterface public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }
    }
}
