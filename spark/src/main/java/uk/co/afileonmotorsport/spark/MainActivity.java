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
 * SPARKY 2.0: offline conversational companion plus an independently
 * authorised deterministic command controller. No model-generated text can
 * silently execute a booking or device operation.
 */
public final class MainActivity extends Activity {
    private static final int MODEL_PICK = 905;
    private static final int KNOWLEDGE_PICK = 906;
    private final ExecutorService inference = Executors.newSingleThreadExecutor();
    private File gguf;
    private SparkyMind mind;
    private SparkyKnowledge knowledge;
    private SparkyFaceView face;
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
        mind = new SparkyMind(prefs, this);
        knowledge = new SparkyKnowledge(this);
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
        subtitle.setText("BALANCED AUTONOMY  •  FAST LOCAL MIND  •  OFFLINE");
        subtitle.setTextColor(Color.rgb(80,210,245));outer.addView(subtitle);
        face = new SparkyFaceView(this);
        int faceHeight = (int)(getResources().getDisplayMetrics().heightPixels * 0.38f);
        outer.addView(face, new LinearLayout.LayoutParams(-1, faceHeight));
        gguf=new File(getFilesDir(),"spark-instruct.gguf");
        modelStatus=new TextView(this);
        modelStatus.setTextColor(Color.LTGRAY);
        modelStatus.setText(gguf.isFile()?"Offline AI model installed":"Import a GGUF model once to enable offline conversation");
        outer.addView(modelStatus);
        TextView hint=new TextView(this);
        hint.setText("TAP SPARKY TO TALK  •  LONG-PRESS FOR A REACTION");
        hint.setTextSize(11);hint.setTextColor(Color.rgb(80,210,245));hint.setGravity(android.view.Gravity.CENTER);
        outer.addView(hint);
        ScrollView scrolling = new ScrollView(this);
        transcript = new TextView(this);
        transcript.setTextColor(Color.WHITE);transcript.setTextSize(16);
        transcript.setPadding(8,12,8,10);
        transcript.setText("SPARKY: There you are. Ask me about a car, a race, or absolutely anything else. If I don't have a reference, I'll tell you.");
        scrolling.addView(transcript);
        outer.addView(scrolling,new LinearLayout.LayoutParams(-1,0,1f));
        input = new EditText(this);
        input.setTextColor(Color.WHITE);input.setHintTextColor(Color.LTGRAY);
        input.setSingleLine(false);input.setMaxLines(3);
        input.setHint("Talk to Sparky…");
        outer.addView(input);
        offlineSpeech=new OfflineSpeech(this,
            heard->{input.setText(heard);runCommand(heard);},
            error->respond(error));
        face.setOnClickListener(v->offlineSpeech.start());
        face.setOnLongClickListener(v->{
            respond("I'm listening. Just don't ask me to rotate your tyres with these little hands.");
            return true;
        });
        LinearLayout actions=new LinearLayout(this);
        actions.setOrientation(LinearLayout.HORIZONTAL);
        outer.addView(actions);
        Button mic=button("TALK",actions);
        mic.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1f));
        mic.setOnClickListener(v->offlineSpeech.start());
        Button send=button("SEND",actions);
        send.setLayoutParams(new LinearLayout.LayoutParams(0,-2,1f));
        send.setOnClickListener(v->{
            String cmd=input.getText().toString().trim();
            input.setText("");runCommand(cmd);
        });
        Button tools=button("SETTINGS · MODELS · KNOWLEDGE",outer);
        tools.setOnClickListener(v->showToolsMenu());
        pending=new TextView(this);
        pending.setTextColor(Color.LTGRAY);
        pending.setTextSize(11);
        outer.addView(pending);
        setContentView(outer);
        renderPending();
        if(gguf.isFile() && LocalLlama.AVAILABLE){
            modelStatus.setText("SPARKY • preparing local AI in background…");
            inference.execute(()->{
                boolean ready=LocalLlama.preload(gguf.getAbsolutePath());
                runOnUiThread(()->modelStatus.setText(ready?
                    "SPARKY • local model preloaded and ready":
                    "Model could not be loaded. Import a compatible Qwen3 GGUF."));
            });
        }
        speech=new TextToSpeech(this,status->{
            if(status==TextToSpeech.SUCCESS){
                speech.setLanguage(Locale.UK);
                speech.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener(){
                    @Override public void onStart(String id){}
                    @Override public void onDone(String id){runOnUiThread(()->{if(face!=null)face.setTalking(false);});}
                    @Override public void onError(String id){runOnUiThread(()->{if(face!=null)face.setTalking(false);});}
                });
                // Only select an on-device voice. Never require a network TTS engine.
                if(speech.getVoices()!=null)for(android.speech.tts.Voice v:speech.getVoices()){
                    if(!v.isNetworkConnectionRequired() && v.getLocale().getLanguage().equals("en")){
                        speech.setVoice(v);voiceReady=true;break;
                    }
                }
            }
        });
    }
    private void showToolsMenu(){
        String[] options={
            "Import GGUF AI model",
            "Import offline knowledge pack (.json)",
            "View knowledge library ("+knowledge.size()+" entries)",
            "What do you remember?",
            "Show queued booking draft",
            "Discard first queued booking draft",
            "Good answer — learn from this",
            "Not quite right — reduce confidence",
            "How are you learning?",
            muted?"Turn voice ON":"Turn voice OFF"
        };
        new android.app.AlertDialog.Builder(this)
            .setTitle("SPARKY · SETTINGS AND KNOWLEDGE")
            .setItems(options,(dialog,which)->{
                switch(which){
                    case 0:selectModel();break;
                    case 1:selectKnowledgePack();break;
                    case 2:respond("I have "+knowledge.size()+
                        " offline reference entries. Ask me a question or type: sources for Porsche 924");break;
                    case 3:respond(mind.listMemories());break;
                    case 4:openNextProposal();break;
                    case 5:discardFirst();break;
                    case 6:mind.feedback(true);respond("Noted. I'll keep that in mind.");break;
                    case 7:mind.feedback(false);respond("Fair criticism. I'll be more careful; teach me the correction if needed.");break;
                    case 8:respond(mind.learningStatus());break;
                    case 9:muted=!muted;respond(muted?"Voice muted.":"Voice enabled.");break;
                }
            }).show();
    }
    private void selectKnowledgePack(){
        Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("application/json");
        startActivityForResult(i,KNOWLEDGE_PICK);
    }

    private Button button(String label,LinearLayout parent){
        Button b=new Button(this);b.setText(label);b.setTextColor(Color.BLACK);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(Color.rgb(255,229,0)));
        parent.addView(b);return b;
    }
    private void append(String value){transcript.append("\n\n"+value);}
    private void respond(String value){
        append("SPARKY: "+value);
        if(face != null){face.setThinking(false);face.setTalking(voiceReady && !muted);}
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
    private void sendBookingManager(String operation,String value){
        try{
            Intent i=new Intent();
            i.setComponent(new ComponentName("uk.co.afileonmotorsport.bookingmanager",
                    "uk.co.afileonmotorsport.bookingmanager.SparkBridgeActivity"));
            i.putExtra("operation",operation);
            i.putExtra("value",value);
            startActivity(i);
            respond("Opening Booking Manager. Review and save customer details there.");
        }catch(Exception e){respond("Install the compatible Afiléon Booking Manager APK before using this offline command.");}
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
        if(lower.equals("knowledge library") || lower.equals("knowledge status")){
            respond("There are "+knowledge.size()+" reference articles in my offline library.");
            return;
        }
        if(lower.startsWith("sources for ")){
            respond(knowledge.references(command.substring("sources for ".length())));return;
        }
        Matcher lesson=Pattern.compile("^teach me about\\s+(.{2,100}):\\s+(.{3,600})$",
                Pattern.CASE_INSENSITIVE).matcher(command);
        if(lesson.matches()){
            knowledge.teach(lesson.group(1),lesson.group(2));
            respond("I've added your explanation to my local library, marked as owner-taught and unverified.");
            return;
        }

        if(lower.startsWith("remember that ")){
            int n=mind.remember(command.substring("remember that ".length()));
            respond(n>0?"I have saved that as an owner-approved local memory.":"That memory was empty.");
            return;
        }
        if(lower.equals("my memories")||lower.equals("what do you remember")){
            respond(mind.listMemories());return;
        }
        Matcher forget=Pattern.compile("^forget memory ([0-9]{1,2})$",Pattern.CASE_INSENSITIVE).matcher(command);
        if(forget.matches()){
            boolean removed=mind.forget(Integer.parseInt(forget.group(1)));
            respond(removed?"That local memory has been erased.":"I couldn't find that memory number.");
            return;
        }
        if(lower.equals("booking manager")||lower.contains("open booking manager")){
            sendBookingManager("open_jobs","");return;
        }
        if(lower.startsWith("new job ")){
            String customer=command.substring(8).trim();
            if(customer.length()>140){respond("The draft customer description is too long.");return;}
            sendBookingManager("prepare_job",customer);return;
        }
        if(lower.equals("local jobs")||lower.equals("repair jobs")){sendBookingManager("open_jobs","");return;}
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
        if(status!=RESULT_OK || data==null || data.getData()==null)return;
        if(code==KNOWLEDGE_PICK){
            Uri chosen=data.getData();
            inference.execute(()->{
                String reply;
                try(InputStream in=getContentResolver().openInputStream(chosen)){
                    if(in==null)throw new IllegalStateException("Cannot open file");
                    int imported=knowledge.importPack(in);
                    reply="Imported "+imported+" offline knowledge entries. "+
                          "There are now "+knowledge.size()+" entries available.";
                }catch(Exception e){reply="Knowledge import failed: "+e.getMessage();}
                String out=reply;
                runOnUiThread(()->respond(out));
            });
            return;
        }
        if(code!=MODEL_PICK)return;
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
                // Validate new weights before touching the last known-working model.
                if(LocalLlama.AVAILABLE){
                    LocalLlama.unload();
                    if(!LocalLlama.preload(part.getAbsolutePath()))
                        throw new IllegalStateException("New GGUF is incompatible with this runtime");
                    LocalLlama.unload();
                }
                File backup=new File(getFilesDir(),"spark-instruct.gguf.previous");
                if(backup.exists()&&!backup.delete())throw new IllegalStateException("Cannot clear old backup");
                if(gguf.exists()&&!gguf.renameTo(backup))
                    throw new IllegalStateException("Cannot back up previous model");
                if(!part.renameTo(gguf)){
                    if(backup.exists())backup.renameTo(gguf);
                    throw new IllegalStateException("Cannot complete import");
                }
                if(LocalLlama.AVAILABLE&&!LocalLlama.preload(gguf.getAbsolutePath())){
                    gguf.delete();
                    if(backup.exists())backup.renameTo(gguf);
                    throw new IllegalStateException("New model failed to load; previous model restored");
                }
                if(backup.exists())backup.delete();
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
        if(busy){respond("Already thinking. My circuits do have limits.");return;}
        if(!LocalLlama.AVAILABLE){respond("The local AI runtime isn't installed in this build.");return;}
        busy=true;
        if(face!=null){face.setTalking(false);face.setThinking(true);}
        modelStatus.setText("SPARKY thinking • locally • model stays loaded");
        inference.execute(()->{
            String result;
            try{
                String prompt=mind.makePrompt(message,knowledge.contextFor(message));
                result=LocalLlama.generate(gguf.getAbsolutePath(),prompt,128);
                if(result==null||result.trim().isEmpty())result="No reply was generated.";
                result=result.replaceAll("(?s)<think>.*?</think>","").trim();
                if(result.length()>1800)result=result.substring(0,1800);
                if(!result.isEmpty() && !result.startsWith("Couldn't")
                        && !result.startsWith("Not enough") && !result.startsWith("Prompt too long")) {
                    mind.record(message,result);
                }
            }catch(Throwable e){result="The local model couldn't run: "+e.getMessage();}
            String answer=result;
            runOnUiThread(()->{
                busy=false;
                modelStatus.setText("SPARKY • local model ready");
                respond(answer);
            });
        });
    }

    @Override protected void onDestroy(){
        inference.shutdown();
        if(offlineSpeech!=null)offlineSpeech.close();
        if(speech!=null){speech.stop();speech.shutdown();}
        super.onDestroy();
    }
}
