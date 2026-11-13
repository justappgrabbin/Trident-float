package org.stellarproximology.trident;

import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Bundle;
import org.json.JSONObject;

/**
 * Native execution through Termux's documented RUN_COMMAND intent.
 * Termux clones the repo into its own home (~/trident-repos/<name>), installs the runtime
 * and deps, runs the command, and returns stdout/stderr/exit code through a PendingIntent.
 *
 * One-time setup on the phone (shown in the Runner sheet):
 *   1. Install Termux from F-Droid or GitHub (Play Store build is outdated).
 *   2. In Termux:  echo "allow-external-apps=true" >> ~/.termux/termux.properties && termux-reload-settings
 *   3. Grant Trident the "Run commands in Termux environment" permission.
 */
public final class TermuxRunner {
    public static final String PERMISSION = "com.termux.permission.RUN_COMMAND";
    private static final String BASH = "/data/data/com.termux/files/usr/bin/bash";
    private static final String HOME = "/data/data/com.termux/files/home";

    public interface ResultSink { void deliver(String jobId, JSONObject result); }
    static volatile ResultSink sink;

    public static boolean installed(Context c) {
        try { c.getPackageManager().getPackageInfo("com.termux", 0); return true; } catch (Exception e) { return false; }
    }

    static String q(String s) { return "'" + (s == null ? "" : s).replace("'", "'\\''") + "'"; }

    /** Build the script from the derived plan; every piece is quoted except user-typed commands. */
    public static String script(String name, String cloneUrl, String ref, String pkg, String install, String run) {
        StringBuilder b = new StringBuilder();
        b.append("set -e\n");
        b.append("command -v git >/dev/null 2>&1 || pkg install -y git\n");
        if (pkg != null && !pkg.isEmpty()) {
            String bin = pkg.equals("nodejs") ? "node" : pkg.equals("rust") ? "cargo" : pkg;
            b.append("command -v ").append(bin).append(" >/dev/null 2>&1 || pkg install -y ").append(pkg).append("\n");
        }
        b.append("mkdir -p ~/trident-repos && cd ~/trident-repos\n");
        b.append("if [ -d ").append(q(name)).append("/.git ]; then git -C ").append(q(name)).append(" pull --ff-only; else ");
        b.append("git clone --depth 1 ");
        if (ref != null && !ref.isEmpty() && !"HEAD".equals(ref)) b.append("-b ").append(q(ref)).append(" ");
        b.append(q(cloneUrl)).append(" ").append(q(name)).append("; fi\n");
        b.append("cd ").append(q(name)).append("\n");
        b.append("echo \"== $(pwd) @ $(git rev-parse --short HEAD)\"\n");
        if (install != null && !install.trim().isEmpty()) b.append("echo '== install: ").append(install.replace("'", "")).append("'\n").append(install).append("\n");
        if (run != null && !run.trim().isEmpty()) b.append("echo '== run: ").append(run.replace("'", "")).append("'\n").append(run).append("\n");
        return b.toString();
    }

    /** background=false opens a visible Termux session (use for servers / interactive programs). */
    public static void run(Context c, String jobId, String script, boolean background) {
        Intent i = new Intent();
        i.setClassName("com.termux", "com.termux.app.RunCommandService");
        i.setAction("com.termux.RUN_COMMAND");
        i.putExtra("com.termux.RUN_COMMAND_PATH", BASH);
        i.putExtra("com.termux.RUN_COMMAND_ARGUMENTS", new String[]{"-lc", script});
        i.putExtra("com.termux.RUN_COMMAND_WORKDIR", HOME);
        i.putExtra("com.termux.RUN_COMMAND_BACKGROUND", background);
        i.putExtra("com.termux.RUN_COMMAND_SESSION_ACTION", "0");
        i.putExtra("com.termux.RUN_COMMAND_COMMAND_LABEL", "Trident: " + jobId);

        Intent back = new Intent(c, Result.class).putExtra("jobId", jobId);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 31 ? PendingIntent.FLAG_MUTABLE : 0);
        PendingIntent pi = PendingIntent.getBroadcast(c, jobId.hashCode(), back, flags);
        i.putExtra("com.termux.RUN_COMMAND_PENDING_INTENT", pi);

        if (Build.VERSION.SDK_INT >= 26) c.startForegroundService(i); else c.startService(i);
    }

    /** Receives Termux's result bundle and hands it to the WebView. */
    public static final class Result extends BroadcastReceiver {
        @Override public void onReceive(Context c, Intent intent) {
            String job = intent.getStringExtra("jobId");
            Bundle r = intent.getBundleExtra("result");
            JSONObject o = new JSONObject();
            try {
                if (r == null) o.put("ok", false).put("error", "No result bundle from Termux");
                else {
                    int exit = r.getInt("exitCode", -1);
                    String errmsg = r.getString("errmsg", "");
                    o.put("ok", exit == 0 && r.getInt("err", -1) == -1)
                     .put("exitCode", exit)
                     .put("stdout", r.getString("stdout", ""))
                     .put("stderr", r.getString("stderr", ""))
                     .put("err", r.getInt("err", -1))
                     .put("errmsg", errmsg == null ? "" : errmsg)
                     .put("stdoutOriginalLength", r.getString("stdout_original_length", ""))
                     .put("stderrOriginalLength", r.getString("stderr_original_length", ""));
                }
            } catch (Exception ignored) { }
            ResultSink s = sink;
            if (s != null) s.deliver(job, o);
        }
    }
}
