package org.stellarproximology.trident;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Capability allowlist, enforced at discovery AND dispatch. Never infer safety from model text. */
public final class ToolPolicy {
    private static final Set<String> READ_ONLY = new HashSet<>(Arrays.asList(
        "mobile_list_available_devices", "mobile_get_screen_size", "mobile_get_orientation",
        "mobile_get_foreground_app", "mobile_list_elements_on_screen"));
    public static boolean permitsMcp(String name) { return READ_ONLY.contains(name); }
    public static boolean validArtifactPath(String name) {
        if (name == null || name.isEmpty() || name.length() > 240 || name.startsWith("/") || name.contains("\\") || name.indexOf('\0') >= 0) return false;
        for (String part : name.split("/", -1)) if (part.isEmpty() || part.equals(".") || part.equals("..")) return false;
        return true;
    }
}
