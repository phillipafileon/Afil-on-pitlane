package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.app.*;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.*;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Foreground opt-in GNSS journal; never a guaranteed 10/25Hz source or a driving coach. */
public final class PitlaneRecorderService extends Service implements LocationListener {
    public static final String START="uk.co.afileonmotorsport.pitlane.RECORD_START";
    public static final String STOP="uk.co.afileonmotorsport.pitlane.RECORD_STOP";
    public static final String CHANNEL="pitlane-gps-recording";
    public static volatile boolean recording=false;
    public static volatile long samples=0;
    public static volatile String activeFile="";
    public static volatile String lastError="";
    public static volatile float lastAccuracy=Float.NaN;
    public static volatile long lastGpsUtcMs=0;

    private final ExecutorService writer=Executors.newSingleThreadExecutor();
    private FileOutputStream stream;
    private LocationManager location;
    private long lastSync=0;
    private long sessionStartUtc=0;

    public static File directory(Context c){
        File f=new File(c.getFilesDir(),"pitlane-session-journals");
        if(!f.exists())f.mkdirs();
        return f;
    }
    @Override public IBinder onBind(Intent intent){return null;}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        String action=intent==null?"":intent.getAction();
        if(STOP.equals(action)){stopSelf();return START_NOT_STICKY;}
        if(!START.equals(action))return START_NOT_STICKY;
        if(recording)return START_NOT_STICKY;
        if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){
            lastError="Precise location permission required";stopSelf();return START_NOT_STICKY;
        }
        try {
            NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            if(Build.VERSION.SDK_INT>=26&&nm!=null)nm.createNotificationChannel(
                new NotificationChannel(CHANNEL,"Pitlane GNSS recording",NotificationManager.IMPORTANCE_LOW));
            Intent open=new Intent(this,MainActivity.class);
            PendingIntent tap=PendingIntent.getActivity(this,1,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
            Notification notification=new NotificationCompat.Builder(this,CHANNEL)
                .setSmallIcon(R.drawable.afileon_icon)
                .setContentTitle("Pitlane recording GPS")
                .setContentText("Tap to return to Pitlane. Recording continues while screen is locked.")
                .setContentIntent(tap).setOngoing(true).setPriority(NotificationCompat.PRIORITY_LOW).build();
            if(Build.VERSION.SDK_INT>=29)
                startForeground(4491,notification,android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            else startForeground(4491,notification);
            String stamp=new SimpleDateFormat("yyyyMMdd-HHmmss-SSS",Locale.US).format(new Date());
            File file=new File(directory(this),"pitlane-gnss-"+stamp+".jsonl");
            stream=new FileOutputStream(file,true);
            activeFile=file.getName();lastError="";samples=0;lastGpsUtcMs=0;sessionStartUtc=System.currentTimeMillis();
            append("{\"type\":\"session_start\",\"utcMs\":"+sessionStartUtc+",\"version\":1}\n");
            location=(LocationManager)getSystemService(Context.LOCATION_SERVICE);
            if(location==null||!location.isProviderEnabled(LocationManager.GPS_PROVIDER))
                throw new IllegalStateException("GNSS provider disabled");
            // 0ms/0m = deliver every hardware fix, not fabricated positions or a promise of 25Hz.
            location.requestLocationUpdates(LocationManager.GPS_PROVIDER,0L,0f,this,Looper.getMainLooper());
            recording=true;
            return START_NOT_STICKY;
        }catch(Exception e){lastError=e.toString();stopSelf();return START_NOT_STICKY;}
    }
    private void append(String data){
        final byte[] bytes=data.getBytes(StandardCharsets.UTF_8);
        writer.execute(()->{
            if(stream==null)return;
            try{
                stream.write(bytes);
                long now=SystemClock.elapsedRealtime();
                if(now-lastSync>1000){stream.getFD().sync();lastSync=now;}
            }catch(Exception e){lastError="Write failed: "+e.getMessage();}
        });
    }
    @Override public void onLocationChanged(Location l){
        if(!recording||l==null||!l.hasAccuracy()||l.getAccuracy()>100f)return;
        final long utc=l.getTime();
        if(utc<=lastGpsUtcMs)return;
        lastGpsUtcMs=utc;
        lastAccuracy=l.getAccuracy();
        try{
            JSONObject row=new JSONObject();
            row.put("type","fix");
            row.put("utcMs",utc);
            row.put("monotonicNanos",l.getElapsedRealtimeNanos());
            row.put("receivedElapsedNanos",SystemClock.elapsedRealtimeNanos());
            row.put("lat",l.getLatitude());row.put("lon",l.getLongitude());
            row.put("accuracyM",l.getAccuracy());
            if(l.hasSpeed())row.put("speedMps",l.getSpeed());
            if(Build.VERSION.SDK_INT>=26&&l.hasSpeedAccuracy())row.put("speedAccuracyMps",l.getSpeedAccuracyMetersPerSecond());
            if(l.hasBearing())row.put("bearingDeg",l.getBearing());
            if(Build.VERSION.SDK_INT>=26&&l.hasBearingAccuracy())row.put("bearingAccuracyDeg",l.getBearingAccuracyDegrees());
            row.put("provider",l.getProvider());
            append(row.toString()+"\n");
            samples++;
        }catch(Exception e){lastError="GPS sample formatting error";}
    }
    @Override public void onProviderDisabled(String provider){lastError="GPS disabled mid-session";}
    @Override public void onDestroy(){
        recording=false;
        if(location!=null)try{location.removeUpdates(this);}catch(Exception ignored){}
        append("{\"type\":\"session_stop\",\"utcMs\":"+System.currentTimeMillis()+"}\n");
        writer.execute(()->{if(stream!=null)try{stream.getFD().sync();stream.close();}catch(Exception ignored){}stream=null;});
        writer.shutdown();
        super.onDestroy();
    }
}
