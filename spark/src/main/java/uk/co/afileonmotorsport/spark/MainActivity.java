package uk.co.afileonmotorsport.spark;

import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SPARK Balanced prototype: deterministic offline command controller.
 * Not yet an on-device generative AI or offline voice recognizer.
 */
public final class MainActivity extends Activity {
    private static final String ADMIN = "https://afileonmotorsport.co.uk/admin.html";
    private SharedPreferences prefs;
    private EditText input;
    private TextView transcript;
    private TextView pending;
    private TextToSpeech speech;
    private boolean voiceReady;
    private boolean muted = false;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        prefs = getSharedPreferences("spark_private_v1", MODE_PRIVATE);
        if (!prefs.contains("autonomy")) prefs.edit().putString("autonomy", "Balanced").apply();
        LinearLayout outer = new LinearLayout(this);
        outer.setOrientation(LinearLayout.VERTICAL);
        outer.setPadding(22, 38, 22, 26);
        outer.setBackgroundColor(Color.rgb(2, 7, 17));
        TextView title = new TextView(this);
        title.setText("SPARK // AFILÉON MOTORSPORT");
        title.setTextSize(22);title.setTextColor(Color.rgb(255,229,0));
        outer.addView(title);
        TextView subtitle = new TextView(this);
        subtitle.setText("BALANCED AUTONOMY  •  OFFLINE COMMANDS");
        subtitle.setTextColor(Color.rgb(80,210,245));outer.addView(subtitle);
        ScrollView scrolling = new ScrollView(this);
        transcript = new TextView(this);
        transcript.setTextColor(Color.WHITE);transcript.setTextSize(16);transcript.setPadding(0,18,0,10);
        transcript.setText("SPARK: Online or offline, boss. Give me a job. Try: open garage, prepare Brands Hatch | Indy, note Check the Porsche brakes, dashboard, block 2026-11-01.");
        scrolling.addView(transcript);
        outer.addView(scrolling,new LinearLayout.LayoutParams(-1,0,1f));
        input = new EditText(this);
        input.setTextColor(Color.WHITE);input.setHintTextColor(Color.LTGRAY);
        input.setSingleLine(false);input.setHint("Tell SPARK what to do…");
        outer.addView(input);
        Button send = button("RUN COMMAND", outer);
        send.setOnClickListener(v->{String cmd=input.getText().toString().trim();input.setText("");runCommand(cmd);});
        Button pendingButton = button("OPEN NEXT BOOKING PROPOSAL",outer);
        pendingButton.setOnClickListener(v->openNextProposal());
        Button clearButton = button("DISCARD NEXT PROPOSAL",outer);
        clearButton.setOnClickListener(v->discardFirst());
        pending = new TextView(this);
        pending.setTextColor(Color.LTGRAY);outer.addView(pending);
        Button mute = button("VOICE ON / OFF",outer);
        mute.setOnClickListener(v->{muted=!muted;append("SPARK: Voice "+(muted?"muted":"enabled")+".");});
        setContentView(outer);
        renderPending();
        speech=new TextToSpeech(this,status->{
            if(status==TextToSpeech.SUCCESS){
                speech.setLanguage(Locale.UK);
                // Only select an on-device voice. Never require a network TTS engine.
                if(speech.getVoices()!=null)for(android.speech.tts.Voice v:speech.getVoices()){
                    if(!v.isNetworkConnectionRequired() && v.getLocale().getLanguage().equals("en")){
                        speech.setVoice(v);voiceReady=true;break;
                    }
                }
            }
        });
    }
    private Button button(String label,LinearLayout parent){
        Button b=new Button(this);b.setText(label);b.setTextColor(Color.BLACK);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(255,229,0)));
        parent.addView(b);return b;
    }
    private void append(String value){transcript.append("\n\n"+value);}
    private void respond(String value){
        append("SPARK: "+value);
        if(voiceReady&&!muted)speech.speak(value,TextToSpeech.QUEUE_FLUSH,null,"sparkReply");
    }
    private void sendPitlane(String op,String value){
        try{
            Intent i=new Intent();
            i.setComponent(new ComponentName("uk.co.afileonmotorsport.pitlane",
                    "uk.co.afileonmotorsport.pitlane.SparkBridgeActivity"));
            i.putExtra("operation",op);i.putExtra("value",value);
            startActivity(i);
            respond("Command sent to Pitlane. Check its screen for confirmation.");
        }catch(Exception ex){respond("I couldn't reach a compatible signed Pitlane version. Install the matching Pitlane update first.");}
    }
    private JSONArray drafts(){
        try{return new JSONArray(prefs.getString("pendingProposals","[]"));}
        catch(Exception ignored){return new JSONArray();}
    }
    private void queue(JSONObject obj){
        JSONArray a=drafts();a.put(obj);
        prefs.edit().putString("pendingProposals",a.toString()).apply();
        renderPending();
        respond("Booking change saved as a draft. Nothing has changed on the live calendar. Open it for approval when connected.");
    }
    private void renderPending(){pending.setText("Booking proposals awaiting approval: "+drafts().length());}
    private void discardFirst(){
        JSONArray old=drafts(),next=new JSONArray();
        for(int i=1;i<old.length();i++)next.put(old.opt(i));
        prefs.edit().putString("pendingProposals",next.toString()).apply();
        renderPending();respond("The first draft was discarded. No website changes were made.");
    }
    private void openNextProposal(){
        JSONArray a=drafts();
        if(a.length()==0){respond("No queued booking changes, boss.");return;}
        openAdmin(a.optJSONObject(0));
        respond("Review it in the authenticated Booking Manager. I'll keep the draft until you discard it; opening isn't proof of completion.");
    }
    private void openAdmin(JSONObject obj){
        try{
            String url=ADMIN+(obj==null?"":"#spark="+Uri.encode(obj.toString()));
            startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url)));
        }catch(Exception ex){respond("No browser available to open the booking system.");}
    }
    private JSONObject proposal(String action){
        JSONObject j=new JSONObject();
        try{j.put("version",1).put("action",action);}catch(Exception ignored){}
        return j;
    }
    private void runCommand(String command){
        if(command.isEmpty())return;
        append("YOU: "+command);
        String lower=command.toLowerCase(Locale.UK);
        if(lower.equals("garage")||lower.contains("open garage")){sendPitlane("open_garage","");return;}
        if(lower.equals("pitlane")||lower.contains("open pitlane")){sendPitlane("open_home","");return;}
        if(lower.contains("track mode")){sendPitlane("open_track","");return;}
        if(lower.startsWith("prepare ")){
            String detail=command.substring(8).trim();
            if(detail.length()>200){respond("That session description is too long.");return;}
            sendPitlane("prepare_session",detail);return;
        }
        if(lower.startsWith("note ")){
            String note=command.substring(5).trim();
            if(note.isEmpty()||note.length()>250){respond("Notes must be 1 to 250 characters.");return;}
            sendPitlane("add_note",note);return;
        }
        if(lower.equals("dashboard")||lower.equals("bookings")){openAdmin(proposal("dashboard"));respond("Opening the secure Booking Manager.");return;}
        Matcher m=Pattern.compile("^block\\s+(\\d{4}-\\d{2}-\\d{2})(?:\\s+(.+))?$",Pattern.CASE_INSENSITIVE).matcher(command);
        if(m.matches()){
            try{
                java.time.LocalDate.parse(m.group(1));
                JSONObject j=proposal("block-date").put("date",m.group(1))
                        .put("label",m.group(2)==null?"SPARK / team unavailable":m.group(2).substring(0,Math.min(80,m.group(2).length())));
                queue(j);
            }catch(Exception ex){respond("That date is invalid. Use YYYY-MM-DD.");}
            return;
        }
        m=Pattern.compile("^booking\\s+([A-Za-z0-9_-]{3,64})$",Pattern.CASE_INSENSITIVE).matcher(command);
        if(m.matches()){
            try{openAdmin(proposal("view-booking").put("reference",m.group(1)));respond("Opening that booking record after secure login.");}
            catch(Exception ex){respond("Could not prepare booking lookup.");}return;
        }
        m=Pattern.compile("^job note\\s+([A-Za-z0-9_-]{3,64})\\s+(.+)$",Pattern.CASE_INSENSITIVE).matcher(command);
        if(m.matches()){
            if(m.group(2).length()>500){respond("Job note is too long.");return;}
            try{queue(proposal("record-note").put("reference",m.group(1)).put("note",m.group(2)));}
            catch(Exception ex){respond("Could not queue the note.");}
            return;
        }
        respond("I can control Pitlane and prepare Booking Manager actions. The local conversational AI model is still to be added. Try 'prepare Brands Hatch|Indy' or 'block 2026-11-01'.");
    }
    @Override protected void onDestroy(){
        if(speech!=null){speech.stop();speech.shutdown();}
        super.onDestroy();
    }
}
