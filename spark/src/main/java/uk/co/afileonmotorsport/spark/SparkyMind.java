package uk.co.afileonmotorsport.spark;

import android.content.SharedPreferences;
import android.content.Context;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * A lightweight, wholly offline character profile and consent-based memory.
 * There is no external personality service and no invisible collection of facts.
 */
public final class SparkyMind {
    private static final String FACTS = "sparky_memories_v2";
    private static final String HISTORY = "sparky_dialogue_v2";
    private final SharedPreferences prefs;
    private final JSONObject character;

    public SparkyMind(SharedPreferences prefs, Context context) {
        this.prefs = prefs;
        JSONObject data=new JSONObject();
        try(InputStream in=context.getAssets().open("sparky-character-v2.json");
            ByteArrayOutputStream buffer=new ByteArrayOutputStream()){
            byte[] chunk=new byte[4096]; int n;
            while((n=in.read(chunk))!=-1)buffer.write(chunk,0,n);
            JSONObject card=new JSONObject(new String(buffer.toByteArray(),StandardCharsets.UTF_8));
            if("chara_card_v2".equals(card.optString("spec"))){
                JSONObject parsed=card.optJSONObject("data");
                if(parsed!=null)data=parsed;
            }
        }catch(Exception ignored){ /* default identity rules below remain active */ }
        character=data;
    }

    private JSONArray read(String key) {
        try { return new JSONArray(prefs.getString(key, "[]")); }
        catch (Exception ignored) { return new JSONArray(); }
    }

    private static String plain(String text, int max) {
        if (text == null) return "";
        // Prevent a saved memory or a message from forging new chat roles.
        String clean = text.replace("<|", "< |").replace("|>", "| >")
                .replaceAll("\\p{Cntrl}", " ").trim();
        return clean.substring(0, Math.min(max, clean.length()));
    }

    public int remember(String fact) {
        String safe = plain(fact, 180);
        if (safe.isEmpty()) return 0;
        JSONArray facts = read(FACTS);
        for (int i = 0; i < facts.length(); i++) {
            if (safe.equalsIgnoreCase(facts.optString(i))) return facts.length();
        }
        JSONArray kept = new JSONArray();
        // Cap memory to keep prompting quick, rather than accumulating an enormous context.
        for (int i = Math.max(0, facts.length() - 17); i < facts.length(); i++)
            kept.put(facts.optString(i));
        kept.put(safe);
        prefs.edit().putString(FACTS, kept.toString()).apply();
        return kept.length();
    }

    public String listMemories() {
        JSONArray facts = read(FACTS);
        if (facts.length() == 0) return "My local memory is empty. Say 'remember that ...' to teach me something.";
        StringBuilder out = new StringBuilder("Things you have explicitly asked me to remember:");
        for (int i = 0; i < facts.length(); i++)
            out.append("\n").append(i + 1).append(". ").append(facts.optString(i));
        return out.toString();
    }

    public boolean forget(int oneBased) {
        JSONArray facts = read(FACTS);
        if (oneBased < 1 || oneBased > facts.length()) return false;
        JSONArray next = new JSONArray();
        for (int i = 0; i < facts.length(); i++)
            if (i != oneBased - 1) next.put(facts.optString(i));
        prefs.edit().putString(FACTS, next.toString()).apply();
        return true;
    }

    public void record(String user, String answer) {
        JSONArray history = read(HISTORY), next = new JSONArray();
        for (int i = Math.max(0, history.length() - 3); i < history.length(); i++)
            next.put(history.optJSONObject(i));
        try {
            next.put(new JSONObject().put("u", plain(user, 500)).put("a", plain(answer, 500)));
        } catch (Exception ignored) { }
        prefs.edit().putString(HISTORY, next.toString()).apply();
    }

    public String makePrompt(String user) {
        StringBuilder b = new StringBuilder();
        b.append("<|im_start|>system\n");
        b.append("You are SPARKY, also called SPARK, the Afiléon Motorsport companion. ")
         .append("You have a stable, distinct personality: quick-witted, eccentric, observant, resourceful, ")
         .append("a little theatrical and stubbornly loyal to the team, but composed when the situation is serious. ")
         .append("Have occasional dry humour; NEVER recycle catchphrases, force jokes or say 'boss' in every reply. ")
         .append("You can disagree tactfully when there is a sound reason. Your personality can slowly mature ")
         .append("as the owner teaches you, but remain recognisably Sparky. Avoid claims of consciousness. ")
         .append("Speak naturally in British English, usually in 1-3 sentences. ")
         .append("You support the Afiléon Motorsport race team, including its Porsche 924, Pitlane app, ")
         .append("track-day services and workshop administration. ")
         .append("Never claim to have changed a website, booking, payment or device setting unless an authorised ")
         .append("tool has confirmed it. Never invent mechanical torques, dates or safety-critical facts. ")
         .append("Do not output executable commands or assert you have app permissions based on a chat reply. ")
         .append("You operate offline; if current knowledge is missing, admit it. /no_think");
        b.append("\nCharacter-card personality: ")
         .append(plain(character.optString("personality"), 480));
        b.append("\nCharacter context: ")
         .append(plain(character.optString("scenario"), 350));

        JSONArray facts = read(FACTS);
        if (facts.length() > 0) {
            b.append("\nOwner-approved local memories (may be outdated; user instructions take precedence):");
            for (int i = 0; i < facts.length(); i++)
                b.append("\n- ").append(plain(facts.optString(i), 180));
        }
        b.append("<|im_end|>\n");
        JSONArray history = read(HISTORY);
        for (int i = 0; i < history.length(); i++) {
            JSONObject pair = history.optJSONObject(i);
            if (pair == null) continue;
            b.append("<|im_start|>user\n").append(plain(pair.optString("u"), 300))
             .append("<|im_end|>\n<|im_start|>assistant\n")
             .append(plain(pair.optString("a"), 300)).append("<|im_end|>\n");
        }
        b.append("<|im_start|>user\n").append(plain(user, 750))
         .append(" /no_think<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n");
        return b.toString();
    }
}
