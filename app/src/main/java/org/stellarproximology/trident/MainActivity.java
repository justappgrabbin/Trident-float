package org.stellarproximology.trident;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.content.*;
import android.net.*;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import java.util.Locale;

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
        @JavascriptInterface public void speak(String text) {
            runOnUiThread(() -> {
                if (tts == null) pendingSpeech = text; else speakNow(text);
            });
        }
        @JavascriptInterface public void stopSpeaking() {
            runOnUiThread(() -> { if (tts != null) tts.stop(); });
        }
    }
}
