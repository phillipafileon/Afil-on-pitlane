package uk.co.afileonmotorsport.spark;

import android.app.Activity;
import android.os.ParcelFileDescriptor;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
    private static final int MODEL_PICK = 905;
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private File gguf;
    private TextView modelStatus;
    private boolean busy = false;
    private static final String ADMIN = "https://afileonmotorsport.co.uk/admin.html";
    private SharedPreferences prefs;
    private EditText input;
    private TextView transcript;
    private TextView pending;
    private OfflineSpeech offlineSpeech;
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
        gguf=new File(getFilesDir(),"spark-instruct.gguf");
        modelStatus=new TextView(this);
        modelStatus.setTextColor(Color.LTGRAY);
        modelStatus.setText(gguf.isFile()?"Offline AI model installed":"Import a GGUF model once to enable offline conversation");
        outer.addView(modelStatus);
        Button modelButton=button("IMPORT OFFLINE AI MODEL (GGUF)",outer);
        modelButton.setOnClickListener(v->selectModel());
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
        offlineSpeech=new OfflineSpeech(this,
            heard->{input.setText(heard);runCommand(heard);},
            error->respond(error));
        Button mic=button("MICROPHONE / OFFLINE LISTEN",outer);
        mic.setOnClickListener(v->offlineSpeech.start());
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
        if(gguf.isFile())chatOffline(command);
        else respond("I can execute offline Pitlane commands now. Import a small instruction-tuned GGUF model to chat with me offline, boss.");
    }
    @Override public void onRequestPermissionsResult(int requestCode,String[] permissions,int[] results){
        super.onRequestPermissionsResult(requestCode,permissions,results);
        if(requestCode==904 && results.length>0 && results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED
                && offlineSpeech!=null)offlineSpeech.start();
    }

    private void selectModel(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("*/*");
        startActivityForResult(i,MODEL_PICK);
    }
    @Override protected void onActivityResult(int code,int status,Intent data){
        super.onActivityResult(code,status,data);
        if(code!=MODEL_PICK || status!=RESULT_OK || data==null || data.getData()==null)return;
        android.net.Uri uri=data.getData();
        modelStatus.setText("Importing GGUF model into offline phone storage…");
        inference.execute(()->{
            File part=new File(getFilesDir(),"spark-instruct.gguf.partial");
            try{
                long size=-1;
                try(ParcelFileDescriptor d=getContentResolver().openFileDescriptor(uri,"r")){
                    if(d!=null)size=d.getStatSize();
                }
                if(size>0 && size>getFilesDir().getUsableSpace()-100000000L)
                    throw new IllegalStateException("Not enough free phone storage");
                try(InputStream in=getContentResolver().openInputStream(uri);
                    OutputStream out=new FileOutputStream(part)){
                    if(in==null)throw new IllegalStateException("Cannot read model");
                    byte[] buffer=new byte[1024*1024];int n;
                    while((n=in.read(buffer))!=-1)out.write(buffer,0,n);
                }
                if(part.length()<1024*1024)throw new IllegalStateException("File is too small");
                try(FileInputStream in=new FileInputStream(part)){
                    byte[] magic=new byte[4];
                    if(in.read(magic)!=4 || magic[0]!='G'||magic[1]!='G'||magic[2]!='U'||magic[3]!='F')
                        throw new IllegalStateException("File is not a GGUF model");
                }
                if(gguf.exists()&&!gguf.delete())throw new IllegalStateException("Cannot replace existing model");
                if(!part.renameTo(gguf))throw new IllegalStateException("Cannot complete import");
                runOnUiThread(()->{
                    modelStatus.setText("Offline AI model installed • "+(gguf.length()/1000000)+" MB");
                    respond("Model imported. I can now converse without Wi-Fi or mobile data.");
                });
            }catch(Exception e){
                part.delete();
                runOnUiThread(()->{modelStatus.setText("GGUF import failed");respond("Import failed: "+e.getMessage());});
            }
        });
    }
    private void chatOffline(String message){
        if(busy){respond("Already thinking, boss. This isn't a server farm.");return;}
        if(!LocalLlama.AVAILABLE){respond("The local AI runtime isn't installed in this build.");return;}
        busy=true;
        modelStatus.setText("SPARK thinking • entirely on phone");
        inference.execute(()->{
            String result;
            try{
                String system="You are SPARK, a sarcastic but reliable racing-team companion for Afiléon Motorsport. "
                  +"The team races a Porsche 924. Be brief, energetic and helpful. Never falsely claim you performed "
                  +"any booking, payment or app action. Do not invent mechanical torque figures. Safety matters.";
                String prompt="<|im_start|>system\n"+system+"\n<|im_end|>\n<|im_start|>user\n"+
                    message.substring(0,Math.min(message.length(),1500))+"\n<|im_end|>\n<|im_start|>assistant\n";
                result=LocalLlama.generate(gguf.getAbsolutePath(),prompt,140);
                if(result==null||result.trim().isEmpty())result="No reply was generated.";
            }catch(Throwable e){result="The local model couldn't run: "+e.getMessage();}
            String answer=result;
            runOnUiThread(()->{busy=false;modelStatus.setText("SPARK • local model ready");respond(answer);});
        });
    }

    @Override protected void onDestroy(){
        inference.shutdown();
        if(offlineSpeech!=null)offlineSpeech.close();
        if(speech!=null){speech.stop();speech.shutdown();}
        super.onDestroy();
    }
}
