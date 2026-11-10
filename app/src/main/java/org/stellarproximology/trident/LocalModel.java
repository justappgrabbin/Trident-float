package org.stellarproximology.trident;

import android.content.Context;
import java.io.*;

/** In-process llama.cpp inference. No HTTP model server, no cloud key. */
final class LocalModel {
    static { System.loadLibrary("trident_model"); }
    static native void prepare();
    static native void cancel();
    static native String generate(String model, String prompt, int stage);
    static final String ASSET = "models/qwen-coder-q4.gguf";
    static File weights(Context context) throws IOException {
        File target = new File(context.getFilesDir(), "qwen-coder-q4.gguf");
        long expected;
        try (android.content.res.AssetFileDescriptor fd = context.getAssets().openFd(ASSET)) { expected = fd.getLength(); }
        if (target.isFile() && target.length() == expected) return target;
        // Assets are immutable; only app-owned staging data is replaced. User documents are never changed.
        if (target.getParentFile().getUsableSpace() < expected + 64L * 1024 * 1024) throw new IOException("Not enough free storage to initialize the bundled model.");
        try (InputStream in = context.getAssets().open(ASSET); OutputStream out = new FileOutputStream(target)) {
            byte[] buffer = new byte[1024 * 1024]; int n;
            while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
        }
        if (target.length() != expected) throw new IOException("Incomplete model initialization; try again.");
        return target;
    }
}
