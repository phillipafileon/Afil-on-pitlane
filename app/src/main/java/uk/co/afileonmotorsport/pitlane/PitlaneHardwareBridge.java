package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.app.Activity;
import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.PackageManager;
import androidx.core.content.FileProvider;
import java.io.File;
import java.util.Arrays;
import java.util.Comparator;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothSocket;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Optional paired Bluetooth SPP hardware bridge. Not universal OBD or high accuracy timing. */
public final class PitlaneHardwareBridge {
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private final Activity activity;
    private final WebView web;
    private final ExecutorService workers = Executors.newFixedThreadPool(2);
    private volatile BluetoothSocket obdSocket, gpsSocket;
    private volatile boolean obdRunning, gpsRunning;

    public PitlaneHardwareBridge(Activity activity, WebView web) { this.activity=activity; this.web=web; }
    private void emit(JSONObject obj) {
        activity.runOnUiThread(() -> {
            if (web.getParent()!=null)
                web.evaluateJavascript("window.dispatchEvent(new CustomEvent('pitlane:native',{detail:"+obj.toString()+"}));", null);
        });
    }
    private void status(String msg) {
        try { JSONObject x=new JSONObject(); x.put("kind","status"); x.put("message",msg); emit(x); } catch(Exception ignored) { }
    }
    private boolean permission() {
        if (Build.VERSION.SDK_INT>=31 && ContextCompat.checkSelfPermission(activity,Manifest.permission.BLUETOOTH_CONNECT)!=PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> ActivityCompat.requestPermissions(activity,new String[]{Manifest.permission.BLUETOOTH_CONNECT},1102));
            status("Bluetooth permission requested; grant it and retry.");
            return false;
        }
        return true;
    }
    @JavascriptInterface public String getCapabilities() {
        return "{\"classicBluetoothSPP\":true,\"obdElm327\":true,\"nmeaRmcGps\":true,\"nativeReminders\":true,\"automaticVideoSync\":false,\"predictiveCoaching\":false}";
    }
    @JavascriptInterface public void requestNotifications() {
        if (Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(activity,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED) {
            activity.runOnUiThread(() -> ActivityCompat.requestPermissions(activity,new String[]{Manifest.permission.POST_NOTIFICATIONS},1103));
        } else status("Notification permission already granted or not required.");
    }
    @JavascriptInterface public void configureReminders(String json) {
        try {
            JSONArray items=new JSONArray(json);
            if(items.length()>60)throw new IllegalArgumentException("Too many events");
            PitlaneReminderReceiver.scheduleAll(activity,items);
            JSONObject x=new JSONObject(); x.put("kind","reminder");
            x.put("message","Track-day reminders scheduled approximately; Android power restrictions may delay delivery.");
            emit(x);
        } catch(Exception e) { status("Reminder scheduling failed: "+e.getMessage()); }
    }
    @JavascriptInterface public void listPairedDevices() {
        if(!permission())return;
        try {
            BluetoothAdapter a=BluetoothAdapter.getDefaultAdapter();
            if(a==null||!a.isEnabled()){status("Enable Bluetooth in Android settings.");return;}
            JSONArray list=new JSONArray();
            Set<BluetoothDevice> devices=a.getBondedDevices();
            for(BluetoothDevice d:devices){
                JSONObject entry=new JSONObject();entry.put("name",d.getName());entry.put("address",d.getAddress());list.put(entry);
            }
            JSONObject msg=new JSONObject();msg.put("kind","devices");msg.put("devices",list);emit(msg);
        } catch(Exception e){status("Paired devices unavailable: "+e.getMessage());}
    }
    private BluetoothSocket connect(String address)throws Exception {
        if(!address.matches("(?i)([0-9a-f]{2}:){5}[0-9a-f]{2}"))throw new IllegalArgumentException("Invalid device address");
        BluetoothAdapter a=BluetoothAdapter.getDefaultAdapter();
        if(a==null||!a.isEnabled())throw new IllegalStateException("Bluetooth is disabled");
        BluetoothDevice d=a.getRemoteDevice(address);
        if(d.getBondState()!=BluetoothDevice.BOND_BONDED)throw new IllegalStateException("Pair the device in Android settings first");
        BluetoothSocket socket=d.createRfcommSocketToServiceRecord(SPP);
        socket.connect();
        return socket;
    }
    @JavascriptInterface public void connectObd(String address) {
        if(!permission())return;
        obdRunning=false;close(obdSocket);
        workers.execute(() -> {
            try {
                obdSocket=connect(address);obdRunning=true;status("OBD adapter connected, initializing");
                InputStream in=obdSocket.getInputStream();OutputStream out=obdSocket.getOutputStream();
                for(String cmd:new String[]{"ATZ","ATE0","ATL0","ATS0","ATH0","ATSP0"})elm(in,out,cmd,4000);
                int cycle=0;
                while(obdRunning && !Thread.currentThread().isInterrupted()){
                    // Each sensor has its own acquisition time: do not pretend different PIDs are simultaneous.
                    Integer rpm=decodeRpm(elm(in,out,"010C",2200));
                    if(rpm!=null)emitObdReading("rpm",rpm);
                    Integer speedKmh=decodeSpeed(elm(in,out,"010D",2200));
                    if(speedKmh!=null)emitObdReading("speedMph",speedKmh*0.621371192);
                    Integer throttle=decodeThrottle(elm(in,out,"0111",2200));
                    if(throttle!=null)emitObdReading("throttlePct",throttle*100.0/255.0);
                    // Slow-changing temperature is queried less frequently.
                    if((cycle++ % 4)==0){
                        Integer coolant=decodeCoolant(elm(in,out,"0105",2200));
                        if(coolant!=null)emitObdReading("coolantC",coolant);
                    }
                    Thread.sleep(120);
                }
            } catch(Exception e){status("OBD stopped: "+e.getMessage());}
            finally{obdRunning=false;close(obdSocket);obdSocket=null;}
        });
    }
    private static String elm(InputStream in,OutputStream out,String cmd,long timeout)throws Exception {
        out.write((cmd+"\r").getBytes(StandardCharsets.US_ASCII));out.flush();
        StringBuilder b=new StringBuilder();long end=System.currentTimeMillis()+timeout;
        while(System.currentTimeMillis()<end){
            if(in.available()>0){
                int c=in.read();if(c<0)throw new IllegalStateException("Adapter disconnected");
                if(c=='>')break;if(b.length()<4096)b.append((char)c);
            } else Thread.sleep(15);
        }
        return b.toString().toUpperCase().replaceAll("[\\r\\n\\t]"," ");
    }
    private static Integer[] response(String raw,String pid){
        String hex=raw.replaceAll("[^0-9A-F]","");
        int pos=hex.indexOf("41"+pid);
        if(pos<0||pos+6>hex.length())return null;
        try {
            int a=Integer.parseInt(hex.substring(pos+4,pos+6),16);
            int b=pos+8<=hex.length()?Integer.parseInt(hex.substring(pos+6,pos+8),16):0;
            return new Integer[]{a,b};
        } catch(Exception e){return null;}
    }
    private static Integer decodeRpm(String raw){
        Integer[] d=response(raw,"0C");return d==null?null:(d[0]*256+d[1])/4;
    }
    private static Integer decodeCoolant(String raw){
        Integer[] d=response(raw,"05");return d==null?null:d[0]-40;
    }
        private static Integer decodeSpeed(String raw) {
        Integer[] d=response(raw,"0D");return d==null?null:d[0];
    }
    private static Integer decodeThrottle(String raw) {
        Integer[] d=response(raw,"11");return d==null?null:d[0];
    }
    private void emitObdReading(String channel,double reading) {
        try {
            JSONObject j=new JSONObject();
            j.put("kind","obd");
            j.put("timestampMs",System.currentTimeMillis());
            j.put(channel,reading);
            // No standard brake switch or brake-pressure measurement is claimed here.
            emit(j);
        }catch(Exception ignored){}
    }
    @JavascriptInterface public void connectGps(String address){
        if(!permission())return;
        gpsRunning=false;close(gpsSocket);
        workers.execute(() -> {
            try {
                gpsSocket=connect(address);gpsRunning=true;status("External NMEA GPS connected");
                InputStream in=gpsSocket.getInputStream();
                StringBuilder line=new StringBuilder();
                while(gpsRunning){
                    int c=in.read();if(c<0)throw new IllegalStateException("GPS disconnected");
                    if(c=='\n'){nmea(line.toString().trim());line.setLength(0);}
                    else if(line.length()<512)line.append((char)c);
                    else line.setLength(0);
                }
            } catch(Exception e){status("GPS stopped: "+e.getMessage());}
            finally{gpsRunning=false;close(gpsSocket);gpsSocket=null;}
        });
    }
    private static Double coordinate(String raw,String hemisphere,boolean latitude){
        try {
            int n=latitude?2:3;
            double result=Double.parseDouble(raw.substring(0,n))+Double.parseDouble(raw.substring(n))/60;
            return ("S".equals(hemisphere)||"W".equals(hemisphere))?-result:result;
        }catch(Exception e){return null;}
    }
    private void nmea(String sentence) {
        try {
            if(!sentence.startsWith("$")||!sentence.contains("*"))return;
            int idx=sentence.indexOf('*'),crc=0;
            for(int i=1;i<idx;i++)crc^=sentence.charAt(i);
            if(idx+3>sentence.length()||crc!=Integer.parseInt(sentence.substring(idx+1,idx+3),16))return;
            String[] p=sentence.substring(1,idx).split(",",-1);
            if(p.length<8||!p[0].endsWith("RMC")||!"A".equals(p[2]))return;
            Double lat=coordinate(p[3],p[4],true),lon=coordinate(p[5],p[6],false);
            if(lat==null||lon==null||p[7].isEmpty())return;
            double mph=Double.parseDouble(p[7])*1.150779448;
            if(mph<0||mph>300)return;
            JSONObject j=new JSONObject();j.put("kind","gps");j.put("valid",true);
            j.put("lat",lat);j.put("lon",lon);j.put("speedMph",mph);j.put("source","NMEA-RMC");emit(j);
        }catch(Exception ignored){}
    }
    @JavascriptInterface public void startGnssJournal(){
        activity.runOnUiThread(()->{
            if(ContextCompat.checkSelfPermission(activity,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
                ActivityCompat.requestPermissions(activity,new String[]{Manifest.permission.ACCESS_FINE_LOCATION},1105);
                status("Precise GPS location permission required. Grant and tap Start again.");
                return;
            }
            try{
                Intent intent=new Intent(activity,PitlaneRecorderService.class);
                intent.setAction(PitlaneRecorderService.START);
                ContextCompat.startForegroundService(activity,intent);
                status("Starting native GPS recording with ongoing system notification.");
            }catch(Exception e){status("Could not start recording: "+e.getMessage());}
        });
    }
    @JavascriptInterface public void stopGnssJournal(){
        activity.runOnUiThread(()->{
            Intent stop=new Intent(activity,PitlaneRecorderService.class);
            stop.setAction(PitlaneRecorderService.STOP);
            activity.startService(stop);
            status("Stopping recording and closing journal.");
        });
    }
    @JavascriptInterface public String getGnssJournalStatus(){
        try{
            JSONObject data=new JSONObject();
            data.put("recording",PitlaneRecorderService.recording);
            data.put("samples",PitlaneRecorderService.samples);
            data.put("activeFile",PitlaneRecorderService.activeFile);
            data.put("accuracyM",Float.isFinite(PitlaneRecorderService.lastAccuracy)?PitlaneRecorderService.lastAccuracy:JSONObject.NULL);
            data.put("lastGpsUtcMs",PitlaneRecorderService.lastGpsUtcMs);
            data.put("error",PitlaneRecorderService.lastError);
            File dir=PitlaneRecorderService.directory(activity);
            File[] files=dir.listFiles((d,n)->n.endsWith(".jsonl")&&n.startsWith("pitlane-gnss-"));
            JSONArray logs=new JSONArray();
            if(files!=null){
                Arrays.sort(files,Comparator.comparingLong(File::lastModified).reversed());
                for(int i=0;i<Math.min(files.length,50);i++){
                    JSONObject f=new JSONObject();
                    f.put("name",files[i].getName());
                    f.put("sizeBytes",files[i].length());
                    logs.put(f);
                }
            }
            data.put("logs",logs);return data.toString();
        }catch(Exception e){return "{\\"recording\\":false,\\"error\\":\\"Could not read recording status\\"}";}
    }
    @JavascriptInterface public void shareGnssJournal(String name){
        if(name==null||!name.matches("pitlane-gnss-[0-9-]{10,30}\\.jsonl")){status("Invalid journal name.");return;}
        File file=new File(PitlaneRecorderService.directory(activity),name);
        if(!file.isFile()||file.length()<5){status("Recording journal unavailable.");return;}
        activity.runOnUiThread(()->{
            try{
                Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",file);
                Intent share=new Intent(Intent.ACTION_SEND);
                share.setType("application/x-ndjson");
                share.putExtra(Intent.EXTRA_STREAM,uri);
                share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                activity.startActivity(Intent.createChooser(share,"Export Pitlane telemetry journal"));
            }catch(Exception e){status("Cannot export journal: "+e.getMessage());}
        });
    }
    @JavascriptInterface public void exportReportPdf(String reportJson){
        activity.runOnUiThread(()->{
            try{PitlanePdfReport.share(activity,reportJson);}
            catch(Exception e){status("PDF export failed: "+e.getMessage());}
        });
    }
    @JavascriptInterface public void disconnectDevices(){
        obdRunning=false;gpsRunning=false;close(obdSocket);close(gpsSocket);status("Devices disconnected");
    }
    private static void close(BluetoothSocket s) { if(s!=null)try{s.close();}catch(Exception ignored){} }
    public void shutdown() {disconnectDevices();workers.shutdownNow();}
}
