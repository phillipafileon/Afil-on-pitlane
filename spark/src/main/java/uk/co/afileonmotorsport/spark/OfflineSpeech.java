package uk.co.afileonmotorsport.spark;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import java.util.ArrayList;

/** Strictly on-device recognition: no network recognizer fallback. */
public final class OfflineSpeech {
    private final Activity activity;
    private final java.util.function.Consumer<String> onResult;
    private final java.util.function.Consumer<String> onError;
    private SpeechRecognizer recognizer;
    public OfflineSpeech(Activity activity, java.util.function.Consumer<String> onResult,
                         java.util.function.Consumer<String> onError) {
        this.activity=activity;this.onResult=onResult;this.onError=onError;
    }
    public void start(){
        if(Build.VERSION.SDK_INT<31||!SpeechRecognizer.isOnDeviceRecognitionAvailable(activity)){
            onError.accept("On-device speech recognition is unavailable. Install an offline English language pack, or type instead.");return;
        }
        if(activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){
            activity.requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},904);return;
        }
        if(recognizer!=null){recognizer.destroy();recognizer=null;}
        recognizer=SpeechRecognizer.createOnDeviceSpeechRecognizer(activity);
        recognizer.setRecognitionListener(new RecognitionListener(){
            public void onReadyForSpeech(Bundle p){}
            public void onBeginningOfSpeech(){}
            public void onRmsChanged(float v){}
            public void onBufferReceived(byte[] b){}
            public void onEndOfSpeech(){}
            public void onError(int error){onError.accept("Offline recognizer error "+error+". Check offline language packs.");}
            public void onResults(Bundle b){
                ArrayList<String> list=b.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                if(list!=null&&!list.isEmpty())onResult.accept(list.get(0));
            }
            public void onPartialResults(Bundle b){}
            public void onEvent(int i,Bundle b){}
        });
        Intent intent=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"en-GB");
        intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE,true);
        recognizer.startListening(intent);
    }
    public void close(){if(recognizer!=null){recognizer.destroy();recognizer=null;}}
}
