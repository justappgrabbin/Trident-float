package org.stellarproximology.trident;

import android.app.*;
import android.os.*;
import android.webkit.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.provider.*;
import android.database.Cursor;
import android.speech.tts.TextToSpeech;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.*;

public class MainActivity extends Activity implements TextToSpeech.OnInitListener {
    private WebView web;
    private TextToSpeech tts;
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private String exporting;
    private android.content.SharedPreferences prefs;
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);prefs=getSharedPreferences("agent-config",MODE_PRIVATE);
        getWindow().setStatusBarColor(0xff0b0913);getWindow().setNavigationBarColor(0xff0b0913);
        tts=new TextToSpeech(this,this);web=new WebView(this);
        WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);
        web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !"file:///android_asset/index.html".equals(r.getUrl().toString());}});
        web.addJavascriptInterface(new Bridge(),"TridentAndroid");web.loadUrl("file:///android_asset/index.html");setContentView(web);
    }
    @Override public void onInit(int status){if(status==TextToSpeech.SUCCESS)tts.setLanguage(Locale.getDefault());}
    @Override protected void onDestroy(){io.shutdownNow();if(tts!=null){tts.stop();tts.shutdown();}web.removeJavascriptInterface("TridentAndroid");web.destroy();super.onDestroy();}
    private void event(String text){runOnUiThread(()->web.evaluateJavascript("window.nativeNotice("+JSONObject.quote(text)+")",null));}
    private void service(String action,String id){Intent intent=new Intent(this,BridgeForegroundService.class).setAction(action);if(id!=null)intent.putExtra("job",id);startForegroundService(intent);}
    private void documentPicker(boolean folder) {
        Intent i=new Intent(folder?Intent.ACTION_OPEN_DOCUMENT_TREE:Intent.ACTION_OPEN_DOCUMENT);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        if(!folder){i.setType("*/*");i.addCategory(Intent.CATEGORY_OPENABLE);}
        startActivityForResult(i,folder?8:7);
    }
    private JSONObject artifact(String id) throws Exception {
        JSONObject state=AgentStore.get(this).copy();
        for(String group:new String[]{"inbox","attachments"}){JSONArray a=state.getJSONArray(group);for(int n=0;n<a.length();n++)if(a.getJSONObject(n).getString("id").equals(id))return a.getJSONObject(n);}
        throw new FileNotFoundException("Revision not found");
    }
    private void showPreview(String id) {
        try {
            JSONObject file=artifact(id);String name=file.getString("name"),text=file.getString("content");
            WebView preview=new WebView(this);WebSettings s=preview.getSettings();s.setAllowFileAccess(false);s.setAllowContentAccess(false);
            s.setBlockNetworkLoads(true);s.setJavaScriptEnabled(false); // No native bridge, scripts, file or network access in generated previews.
            preview.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return true;}});
            String html=name.toLowerCase(Locale.ROOT).endsWith(".html")?text:"<html><meta name='viewport' content='width=device-width, initial-scale=1'><body style='background:#100d1c;color:#e8e0f5'><pre style='white-space:pre-wrap;overflow-wrap:anywhere;font:14px monospace'>"+escape(text)+"</pre></body></html>";
            preview.loadDataWithBaseURL(null,html,"text/html","UTF-8",null);
            AlertDialog dialog=new AlertDialog.Builder(this).setTitle(name).setView(preview).setPositiveButton("Close",(d,w)->{}).create();
            dialog.setOnDismissListener(d->preview.destroy());dialog.show();dialog.getWindow().setLayout(-1,-1);
        } catch(Exception e){event(e.getMessage());}
    }
    private static String escape(String s){return s.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;");}
    @Override protected void onActivityResult(int request,int result,Intent data) {
        super.onActivityResult(request,result,data);if(result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri uri=data.getData();
        if(request==8) {
            try {getContentResolver().takePersistableUriPermission(uri,Intent.FLAG_GRANT_READ_URI_PERMISSION);prefs.edit().putString("folder",uri.toString()).apply();event("Folder connected read-only. Trident can grab copies from it.");}
            catch(Exception e){event("Folder connection failed: "+e.getMessage());}return;
        }
        if(request==7)io.execute(()->{
            try {
                String name="Imported file";
                try(Cursor cursor=getContentResolver().query(uri,new String[]{OpenableColumns.DISPLAY_NAME},null,null,null)){if(cursor!=null&&cursor.moveToFirst())name=cursor.getString(0);}
                String text=FolderWorkspace.readText(this,uri);AgentStore.get(this).importText(name,text);event("Copied "+name+" into Workspace. Ask Trident to fix it in chat.");
            }catch(Exception e){event("Import failed: "+e.getMessage());}
        });
        if(request==9){String id=exporting;exporting=null;io.execute(()->{
            try {String text=artifact(id).getString("content");try(OutputStream out=getContentResolver().openOutputStream(uri,"w")){if(out==null)throw new IOException("Cannot write new document");out.write(text.getBytes(StandardCharsets.UTF_8));}event("Exported your selected revision.");}
            catch(Exception e){event("Export failed: "+e.getMessage());}
        });}
    }
    public class Bridge {
        @JavascriptInterface public String snapshot() {
            try {
                JSONObject state=AgentStore.get(MainActivity.this).copy();
                state.put("config",new JSONObject().put("repository",prefs.getString("repository","")).put("screenEnabled",prefs.getBoolean("screenEnabled",false))
                    .put("computerUrl",prefs.getString("computerUrl","")).put("folderConnected",!prefs.getString("folder","").isEmpty())
                    .put("githubTokenSet",!prefs.getString("githubToken","").isEmpty()).put("mcpTokenSet",!prefs.getString("mcpToken","").isEmpty()).put("computerTokenSet",!prefs.getString("computerToken","").isEmpty()));
                return state.toString();
            }catch(Exception e){return "{\"error\":"+JSONObject.quote(e.getMessage())+"}";}
        }
        @JavascriptInterface public String send(String text){try {String id=AgentStore.get(MainActivity.this).enqueue(text);runOnUiThread(()->service(BridgeForegroundService.KICK,null));return id;}catch(Exception e){event("Could not queue: "+e.getMessage());return "";}}
        @JavascriptInterface public void stop(String id){runOnUiThread(()->service(BridgeForegroundService.STOP,id));}
        @JavascriptInterface public void attach(){runOnUiThread(()->documentPicker(false));}
        @JavascriptInterface public void folder(){runOnUiThread(()->documentPicker(true));}
        @JavascriptInterface public void preview(String id){runOnUiThread(()->showPreview(id));}
        @JavascriptInterface public void export(String id){runOnUiThread(()->{
            try {JSONObject a=artifact(id);exporting=id;Intent i=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("text/plain");String name=a.getString("name");i.putExtra(Intent.EXTRA_TITLE,name.substring(name.lastIndexOf('/')+1));startActivityForResult(i,9);}
            catch(Exception e){event(e.getMessage());}
        });}
        @JavascriptInterface public void saveConfig(String json){
            try {JSONObject c=new JSONObject(json);String repo=c.optString("repository").trim(),url=c.optString("computerUrl").trim();
                repo=repo.replaceFirst("^https://github.com/","").replaceAll("/+$","");
                if(!repo.isEmpty()&&!repo.matches("[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+"))throw new IllegalArgumentException("Repository must be owner/name.");
                if(!url.isEmpty())JsonHttp.endpoint(url);
                android.content.SharedPreferences.Editor edit=prefs.edit().putString("repository",repo).putString("computerUrl",url).putBoolean("screenEnabled",c.optBoolean("screenEnabled"));
                for(String key:new String[]{"githubToken","mcpToken","computerToken"})if(c.has(key)&&!c.getString(key).isEmpty())edit.putString(key,c.getString(key));
                edit.apply();event("Connections saved. Originals stay read-only.");
            }catch(Exception e){event("Settings not saved: "+e.getMessage());}
        }
        @JavascriptInterface public void notifications(){runOnUiThread(()->{if(Build.VERSION.SDK_INT>=33)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},10);else event("Notifications are managed in Android settings.");});}
        @JavascriptInterface public void accessibilitySettings(){runOnUiThread(()->startActivity(new Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS)));}
        @JavascriptInterface public void overlay(){runOnUiThread(()->{if(!Settings.canDrawOverlays(MainActivity.this))startActivity(new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,Uri.parse("package:"+getPackageName())));else startService(new Intent(MainActivity.this,OverlayService.class));});}
        @JavascriptInterface public void speak(String text){runOnUiThread(()->tts.speak(text,TextToSpeech.QUEUE_FLUSH,null,"trident"));}
        @JavascriptInterface public void stopSpeaking(){runOnUiThread(()->tts.stop());}
        @JavascriptInterface public void computerScreen(){io.execute(()->{
            try {McpClient client=new McpClient(prefs.getString("computerUrl",""),prefs.getString("computerToken",""),true);
                JSONArray content=client.call("computer_screenshot",new JSONObject()).getJSONArray("content");
                for(int i=0;i<content.length();i++){JSONObject p=content.getJSONObject(i);if("image".equals(p.optString("type"))&&"image/png".equals(p.optString("mimeType"))){String encoded=p.getString("data");runOnUiThread(()->web.evaluateJavascript("window.computerImage("+JSONObject.quote(encoded)+")",null));return;}}
                event("Computer returned no screenshot.");
            }catch(Exception e){event("Computer screen unavailable: "+e.getMessage());}
        });}
    }
}
