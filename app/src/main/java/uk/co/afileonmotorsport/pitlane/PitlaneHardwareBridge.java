package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.app.Activity;
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
                while(obdRunning && !Thread.currentThread().isInterrupted()){
                    Integer rpm=decodeRpm(elm(in,out,"010C",2200));
                    Integer coolant=decodeCoolant(elm(in,out,"0105",2200));
                    JSONObject j=new JSONObject();j.put("kind","obd");
                    if(rpm!=null)j.put("rpm",rpm);
                    if(coolant!=null)j.put("coolantC",coolant);
                    if(rpm!=null||coolant!=null)emit(j);
                    Thread.sleep(400);
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
    @JavascriptInterface public void disconnectDevices(){
        obdRunning=false;gpsRunning=false;close(obdSocket);close(gpsSocket);status("Devices disconnected");
    }
    private static void close(BluetoothSocket s) { if(s!=null)try{s.close();}catch(Exception ignored){} }
    public void shutdown() {disconnectDevices();workers.shutdownNow();}
}
