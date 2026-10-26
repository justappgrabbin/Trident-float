package org.stellarproximology.trident;

import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Offline, bounded LCM observation layer for the trial APK.
 * This is deterministic semantic analysis, NOT neural TRIDENT inference.
 * Never pretends to have run tools or trained a model.
 */
public final class SemanticTrialEngine {
    private static final Pattern TOKEN = Pattern.compile("[\\p{L}\\p{N}]+(?:['’-][\\p{L}\\p{N}]+)*");
    private static final Pattern RELATION = Pattern.compile("\\b(is|are|was|were|means|becomes|causes|relates|has|have|needs|wants)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern GATE = Pattern.compile("\\bgate\\s+(\\d{1,2})\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern LINE = Pattern.compile("\\bline\\s+([1-6])\\b", Pattern.CASE_INSENSITIVE);

    public static JSONObject observe(String input) throws Exception {
        if (input == null || input.trim().isEmpty() || input.length() > 4096)
            throw new IllegalArgumentException("Message must contain 1–4096 characters");
        String lower = input.toLowerCase(Locale.ROOT);
        JSONArray tokens = new JSONArray(), relations = new JSONArray(), markers = new JSONArray();
        Matcher t = TOKEN.matcher(input);
        int count = 0;
        while (t.find() && count++ < 128) tokens.put(t.group());
        Matcher r = RELATION.matcher(input);
        while (r.find()) relations.put(new JSONObject().put("predicate", r.group()).put("offset", r.start()));
        for (String marker : new String[]{"not","never","maybe","perhaps","might","could","why","who","when","where","what","how","before","after"}) {
            if (Pattern.compile("\\b"+marker+"\\b").matcher(lower).find()) markers.put(marker);
        }
        JSONObject address = new JSONObject();
        Matcher g = GATE.matcher(input), l = LINE.matcher(input);
        if (g.find()) { int value = Integer.parseInt(g.group(1)); if (value >= 1 && value <= 64) address.put("gate",value); }
        if (l.find()) address.put("line",Integer.parseInt(l.group(1)));
        return new JSONObject().put("input",input).put("tokens",tokens)
            .put("relations",relations).put("markers",markers)
            .put("symbolicAddress",address).put("verified",false)
            .put("model","lcm-offline-trial").put("neuralInference",false);
    }

    public static String reply(String input) throws Exception {
        JSONObject evidence = observe(input);
        String lower = input.toLowerCase(Locale.ROOT);
        if (lower.matches("(?s).*\\b(hello|hey|hi)\\b.*"))
            return "Hey! I'm running the offline LCM trial inside Trident Float. I can inspect meaning and structure, but neural TRIDENT generation is not connected yet. What are we exploring?";
        if (lower.contains("code") || lower.contains("function") || lower.contains("python") || lower.contains("java"))
            return "Code request recognized. I can preserve its linguistic structure, but I won't pretend a code model ran. Neural TRIDENT's code head still needs an on-device inference runtime and trained weights.";
        if (lower.contains("human design") || lower.contains("iching") || lower.contains("i ching") || evidence.getJSONObject("symbolicAddress").length()>0)
            return "Symbolic framework detected. Address: "+evidence.getJSONObject("symbolicAddress").toString()+". I won't invent gate/line meanings; those need your canonical mappings. This trial records the address as evidence.";
        JSONArray relations = evidence.getJSONArray("relations");
        JSONArray markers = evidence.getJSONArray("markers");
        return "LCM observation: "+evidence.getJSONArray("tokens").length()+" tokens, "
            +relations.length()+" explicit relation markers, "+markers.length()
            +" context markers. This is structural analysis, not yet learned conversational inference. You can ask me to inspect a gate, line, relation, or code task.";
    }
    private SemanticTrialEngine() {}
}
