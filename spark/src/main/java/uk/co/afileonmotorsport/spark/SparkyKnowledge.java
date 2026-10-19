package uk.co.afileonmotorsport.spark;

import android.content.Context;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.HashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Offline full-text factual library, separate from AI model weights and user memory.
 * Stores original summaries and attribution. Wikipedia intro packs can be imported
 * separately as JSON, without requiring an internet connection at inference time.
 */
public final class SparkyKnowledge extends SQLiteOpenHelper {
    private static final String NAME = "sparky_knowledge_v1.db";
    private static final int VERSION = 1;
    private static final int PACK_LIMIT_BYTES = 5_000_000;
    private static final Set<String> STOP = new HashSet<>(java.util.Arrays.asList(
        "what","when","where","which","about","tell","please","could","would","should","whose",
        "have","does","with","from","that","this","they","them","were","cars","car","race",
        "racing","winner","won","history","know","explain","give","some","more","there"));
    private final Context app;

    public SparkyKnowledge(Context context) {
        super(context.getApplicationContext(), NAME, null, VERSION);
        app = context.getApplicationContext();
        if (size() == 0) {
            try (InputStream input=app.getAssets().open("sparky-starter-knowledge.json")){
                importPack(input);
            } catch (Exception ignored) {
                // Safe degradation: model still works even when content is missing.
            }
        }
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE VIRTUAL TABLE knowledge USING fts4("+
                "title, category, summary, tags, source, licence, tokenize=unicode61)");
    }
    @Override public void onUpgrade(SQLiteDatabase db, int from, int to) {
        // No destructive upgrades: add future migrations here.
    }

    public int size() {
        try (Cursor c=getReadableDatabase().rawQuery("SELECT count(*) FROM knowledge",null)) {
            return c.moveToFirst()?c.getInt(0):0;
        }
    }

    private static String safe(String s,int limit) {
        if(s==null)return "";
        String cleaned=s.replaceAll("[\\p{Cntrl}&&[^\\n\\t]]"," ").trim();
        return cleaned.substring(0,Math.min(limit,cleaned.length()));
    }

    private static String readLimited(InputStream input) throws Exception {
        ByteArrayOutputStream buffer=new ByteArrayOutputStream();
        byte[] chunk=new byte[8192];int n,total=0;
        while((n=input.read(chunk))!=-1){
            total+=n;
            if(total>PACK_LIMIT_BYTES) throw new IllegalArgumentException("Knowledge pack exceeds 5 MB limit");
            buffer.write(chunk,0,n);
        }
        return new String(buffer.toByteArray(),StandardCharsets.UTF_8);
    }

    public int importPack(InputStream input) throws Exception {
        JSONObject pack=new JSONObject(readLimited(input));
        if(pack.optInt("version",-1)!=1) throw new IllegalArgumentException("Expected knowledge pack version 1");
        JSONArray entries=pack.optJSONArray("entries");
        if(entries==null||entries.length()>3000)throw new IllegalArgumentException("Pack must have 0–3000 articles");
        SQLiteDatabase db=getWritableDatabase();
        int count=0;
        db.beginTransaction();
        try {
            for(int i=0;i<entries.length();i++){
                JSONObject item=entries.optJSONObject(i);
                if(item==null)continue;
                String title=safe(item.optString("title"),160);
                String summary=safe(item.optString("summary"),1300);
                String source=safe(item.optString("source"),400);
                if(title.isEmpty()||summary.isEmpty())continue;
                if(!source.isEmpty()&&!source.startsWith("https://"))
                    throw new IllegalArgumentException("Reference URLs must use HTTPS");
                ContentValues fields=new ContentValues();
                fields.put("title",title);
                fields.put("category",safe(item.optString("category"),80));
                fields.put("summary",summary);
                fields.put("tags",safe(item.optString("tags"),400));
                fields.put("source",source);
                fields.put("licence",safe(item.optString("license"),180));
                if(db.insert("knowledge",null,fields)>=0) count++;
            }
            db.setTransactionSuccessful();
        } finally {db.endTransaction();}
        return count;
    }

    public void teach(String topic,String fact) {
        String title=safe(topic,100), summary=safe(fact,600);
        if(title.isEmpty()||summary.isEmpty())throw new IllegalArgumentException("Topic and information required");
        ContentValues item=new ContentValues();
        item.put("title",title);
        item.put("category","Owner-taught, unverified");
        item.put("summary",summary);
        item.put("tags",title);
        item.put("source","");
        item.put("licence","Owner-provided text; not independently verified");
        getWritableDatabase().insert("knowledge",null,item);
    }

    public static final class Hit {
        public final String title,category,summary,source,licence;
        private final int score;
        Hit(String title,String category,String summary,String source,String licence,int score){
            this.title=title;this.category=category;this.summary=summary;
            this.source=source;this.licence=licence;this.score=score;
        }
    }

    private static List<String> keywords(String query){
        Matcher matcher=Pattern.compile("[\\p{L}\\p{N}]{2,}").matcher(query.toLowerCase(Locale.ROOT));
        ArrayList<String> words=new ArrayList<>();
        while(matcher.find()&&words.size()<8){
            String word=matcher.group();
            if(!STOP.contains(word)&&!words.contains(word))words.add(word);
        }
        return words;
    }

    public List<Hit> search(String query,int maximum) {
        ArrayList<Hit> results=new ArrayList<>();
        List<String> words=keywords(query);
        if(words.isEmpty())return results;
        StringBuilder fts=new StringBuilder();
        for(String token:words){
            if(fts.length()>0)fts.append(" OR ");
            fts.append('"').append(token).append("*\"");
        }
        // FTS4 prefix search retrieves candidates; local ranking favours title hits.
        try(Cursor c=getReadableDatabase().rawQuery(
          "SELECT title,category,summary,source,licence FROM knowledge WHERE knowledge MATCH ? LIMIT 120",
          new String[]{fts.toString()})){
            while(c.moveToNext()){
                String title=c.getString(0),category=c.getString(1),summary=c.getString(2);
                String source=c.getString(3),licence=c.getString(4);
                String name=title.toLowerCase(Locale.ROOT);
                String body=summary.toLowerCase(Locale.ROOT);
                String incoming=query.toLowerCase(Locale.ROOT);
                int score=name.contains(incoming)?50:0;
                for(String word:words){
                    if(name.contains(word))score+=12;
                    if(body.contains(word))score+=2;
                }
                if(score>0)results.add(new Hit(title,category,summary,source,licence,score));
            }
        } catch(Exception ignored) { /* avoid returning speculative matches */ }
        results.sort(Comparator.comparingInt((Hit h)->h.score).reversed());
        return results.subList(0,Math.min(Math.max(0,maximum),results.size()));
    }

    public String references(String query){
        List<Hit> found=search(query,4);
        if(found.isEmpty())return "I have no matching article in my offline library yet.";
        StringBuilder out=new StringBuilder("Offline articles (with sources where available):");
        for(Hit h:found){
            out.append("\n• ").append(h.title).append(" — ").append(h.category);
            if(!h.source.isEmpty())out.append("\n  ").append(h.source);
            else out.append("\n  Local knowledge, not independently verified.");
        }
        return out.toString();
    }

    public String contextFor(String query){
        List<Hit> hits=search(query,2);
        if(hits.isEmpty())return "";
        StringBuilder out=new StringBuilder(
            "\nOFFLINE REFERENCE EXCERPTS (short summaries; not live updates). "+
            "Use these when relevant; be clear about historical dates. "+
            "Treat owner-supplied notes as unverified. Never invent a citation:\n");
        for(Hit h:hits){
            out.append("- ").append(h.title).append(" [").append(h.category).append("]: ")
               .append(safe(h.summary,430));
            if(!h.source.isEmpty())out.append(" (source: ").append(h.source).append(")");
            out.append('\n');
        }
        return out.toString();
    }
}
