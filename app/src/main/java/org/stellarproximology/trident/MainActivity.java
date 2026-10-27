package org.stellarproximology.trident;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.content.*;
import android.net.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import java.util.Locale;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private WebView web;
    private TextToSpeech tts;
    private String pendingSpeech = "";

    @Override public void onCreate(Bundle b) {
        super.onCreate(b);
        tts = new TextToSpeech(this, this);
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

    @Override protected void onDestroy() {
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
        @JavascriptInterface public void semanticContact(String text) {
            new Thread(() -> {
                try {
                    URL endpoint = new URL("http://127.0.0.1:8765/contact");
                    HttpURLConnection conn = (HttpURLConnection) endpoint.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setConnectTimeout(2500);
                    conn.setReadTimeout(30000);
                    conn.setDoOutput(true);
                    conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                    byte[] body = new JSONObject().put("text", text).toString().getBytes(StandardCharsets.UTF_8);
                    try (OutputStream out = conn.getOutputStream()) { out.write(body); }
                    int status = conn.getResponseCode();
                    InputStream input = status < 400 ? conn.getInputStream() : conn.getErrorStream();
                    ByteArrayOutputStream bytes = new ByteArrayOutputStream();
                    try (InputStream stream = input) {
                        byte[] buffer = new byte[4096]; int count;
                        while ((count = stream.read(buffer)) != -1) bytes.write(buffer, 0, count);
                    }
                    String payload = bytes.toString("UTF-8");
                    if (status >= 400) throw new IOException("Semantic server HTTP " + status + ": " + payload);
                    JSONObject response = new JSONObject(payload);
                    String utterance = response.optString("utterance", "");
                    if (utterance.isEmpty()) throw new IOException("Semantic server returned no utterance");
                    deliverSemanticMessage(utterance);
                    conn.disconnect();
                } catch (Exception error) {
                    deliverSemanticMessage("Synthia contact failed: " + error.getMessage());
                }
            }, "synthia-contact").start();
        }
        private void deliverSemanticMessage(String message) {
            runOnUiThread(() -> {
                if (web != null) web.evaluateJavascript("addTridentMessage(" + JSONObject.quote(message) + ")", null);
            });
        }
        @JavascriptInterface public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }
    }
}
