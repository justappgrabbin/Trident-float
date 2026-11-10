package org.stellarproximology.trident;

import android.content.Context;
import android.util.AtomicFile;
import org.json.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

/** One atomic, app-private journal. No source document is opened for writing. */
final class AgentStore {
    private static AgentStore instance;
    static synchronized AgentStore get(Context c) {
        if (instance == null) instance = new AgentStore(c.getApplicationContext());
        return instance;
    }
    private final AtomicFile file;
    private JSONObject state;
    private AgentStore(Context c) {
        file = new AtomicFile(new File(c.getFilesDir(), "agent-state.json"));
        try { state = new JSONObject(new String(file.readFully(), StandardCharsets.UTF_8)); }
        catch (FileNotFoundException e) { state = new JSONObject(); }
        catch (Exception e) { throw new IllegalStateException("Cannot read saved jobs. Existing journal preserved.", e); }
        for (String key : new String[]{"messages", "jobs", "inbox", "attachments"}) {
            if (!state.has(key)) try { state.put(key, new JSONArray()); } catch (JSONException e) { throw new IllegalStateException(e); }
        }
    }
    static String id() { return UUID.randomUUID().toString(); }
    synchronized JSONArray items(String key) { return state.optJSONArray(key); }
    synchronized JSONObject copy() throws JSONException { return new JSONObject(state.toString()); }
    synchronized void save() {
        FileOutputStream out = null;
        try {
            out = file.startWrite(); out.write(state.toString().getBytes(StandardCharsets.UTF_8)); file.finishWrite(out);
        } catch (IOException e) { if (out != null) file.failWrite(out); throw new IllegalStateException("Could not persist job", e); }
    }
    synchronized void message(String role, String text, String job) throws JSONException {
        items("messages").put(new JSONObject().put("id", id()).put("role", role).put("text", text)
            .put("job", job).put("time", System.currentTimeMillis())); save();
    }
    synchronized String enqueue(String text) throws JSONException {
        if (text.trim().isEmpty() || text.length() > 32000) throw new IllegalArgumentException("Use a message between 1 and 32000 characters.");
        String id = id();
        items("jobs").put(new JSONObject().put("id", id).put("prompt", text).put("status", "queued")
            .put("round", 0).put("plan", "").put("history", new JSONArray()).put("time", System.currentTimeMillis()));
        message("user", text, id); return id;
    }
    synchronized JSONObject job(String id) {
        JSONArray jobs = items("jobs");
        for (int i = 0; i < jobs.length(); i++) if (jobs.optJSONObject(i).optString("id").equals(id)) return jobs.optJSONObject(i);
        return null;
    }
    synchronized JSONObject next() {
        JSONArray jobs = items("jobs");
        for (int i = 0; i < jobs.length(); i++) if (jobs.optJSONObject(i).optString("status").equals("queued")) return jobs.optJSONObject(i);
        return null;
    }
    synchronized void status(String id, String status) throws JSONException { JSONObject j = job(id); if (j != null) { j.put("status", status); save(); } }
    synchronized void recover() throws JSONException {
        for (int i = 0; i < items("jobs").length(); i++) {
            JSONObject j = items("jobs").getJSONObject(i);
            if (j.optString("status").equals("running")) {
                j.put("status", "interrupted");
                message("progress", "Android interrupted this job. Use Continue to queue its saved plan and request again.", j.getString("id"));
            }
        }
        save();
    }
    synchronized void importText(String name, String text) throws JSONException {
        if (items("attachments").length() >= 100) throw new IllegalStateException("100 imported files reached. Start a separate workspace before importing more.");
        items("attachments").put(new JSONObject().put("id", id()).put("name", name).put("content", text).put("time", System.currentTimeMillis()));
        message("progress", "Added read-only copy: " + name, "");
    }
    synchronized JSONObject artifact(String job, String path, String content) throws JSONException {
        if (!ToolPolicy.validArtifactPath(path)) throw new IllegalArgumentException("Use a relative file path without traversal.");
        if (content.length() > 400000) throw new IllegalArgumentException("Artifact exceeds 400 KB.");
        JSONObject a = new JSONObject().put("id", id()).put("job", job).put("name", path)
            .put("content", content).put("time", System.currentTimeMillis());
        items("inbox").put(a); save(); return a;
    }
}
