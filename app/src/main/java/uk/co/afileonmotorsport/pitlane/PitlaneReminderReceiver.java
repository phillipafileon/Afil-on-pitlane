package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.content.ContextCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;

/** Inexact local reminders. Not guaranteed to fire at the exact requested minute. */
public final class PitlaneReminderReceiver extends BroadcastReceiver {
    private static final String PREFS="pitlane-reminders-v1";
    private static final String CHANNEL="pitlane-trackday-reminders";
    private static PendingIntent pending(Context ctx,String key,boolean update) {
        Intent intent=new Intent(ctx,PitlaneReminderReceiver.class);
        intent.setAction("uk.co.afileonmotorsport.pitlane.REMINDER");
        intent.putExtra("key",key);
        return PendingIntent.getBroadcast(ctx,key.hashCode(),intent,PendingIntent.FLAG_IMMUTABLE|(update?PendingIntent.FLAG_UPDATE_CURRENT:PendingIntent.FLAG_NO_CREATE));
    }
    public static void scheduleAll(Context ctx,JSONArray events)throws Exception {
        if(events.length()>60)throw new IllegalArgumentException("Maximum 60 events");
        String old=ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("schedule","[]");
        cancel(ctx,new JSONArray(old));
        ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE).edit().putString("schedule",events.toString()).apply();
        schedule(ctx,events);
    }
    public static void restore(Context ctx) {
        try {schedule(ctx,new JSONArray(ctx.getSharedPreferences(PREFS,Context.MODE_PRIVATE).getString("schedule","[]")));}
        catch(Exception ignored){}
    }
    private static void cancel(Context ctx,JSONArray events) {
        AlarmManager am=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
        if(am==null)return;
        for(int i=0;i<events.length();i++){
            JSONObject e=events.optJSONObject(i);if(e==null)continue;
            for(String slot:new String[]{"night","morning"}){
                PendingIntent p=pending(ctx,e.optString("id")+"-"+slot,false);
                if(p!=null){am.cancel(p);p.cancel();}
            }
        }
    }
    private static void schedule(Context ctx,JSONArray events) {
        AlarmManager am=(AlarmManager)ctx.getSystemService(Context.ALARM_SERVICE);
        if(am==null)return;
        long now=System.currentTimeMillis();
        for(int i=0;i<events.length();i++){
            JSONObject e=events.optJSONObject(i);if(e==null)continue;
            String id=e.optString("id","");if(id.isEmpty()||id.length()>120)continue;
            LocalDate day;
            try{day=LocalDate.parse(e.optString("day"));}catch(Exception invalid){continue;}
            for(String slot:new String[]{"night","morning"}){
                try {
                    LocalTime time=LocalTime.parse(e.optString(slot,slot.equals("night")?"19:30":"06:30"));
                    long due=(slot.equals("night")?day.minusDays(1):day).atTime(time).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                    if(due<=now)continue;
                    String key=id+"-"+slot;
                    Intent intent=new Intent(ctx,PitlaneReminderReceiver.class);
                    intent.setAction("uk.co.afileonmotorsport.pitlane.REMINDER");
                    intent.putExtra("key",key);
                    intent.putExtra("stage",slot);
                    String venue=e.optString("venue","Track day");
                    intent.putExtra("venue",venue.substring(0,Math.min(90,venue.length())));
                    JSONArray items=e.optJSONArray("remaining");
                    StringBuilder list=new StringBuilder();
                    if(items!=null)for(int k=0;k<Math.min(7,items.length());k++){
                        String item=items.optString(k).replace("\n"," ").replace("\r"," ");
                        if(list.length()>0)list.append(" · ");
                        list.append(item.substring(0,Math.min(70,item.length())));
                    }
                    intent.putExtra("items",list.toString());
                    PendingIntent p=PendingIntent.getBroadcast(ctx,key.hashCode(),intent,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
                    if(Build.VERSION.SDK_INT>=23)am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,due,p);
                    else am.set(AlarmManager.RTC_WAKEUP,due,p);
                }catch(Exception ignored){}
            }
        }
    }
    @Override public void onReceive(Context ctx,Intent intent) {
        if(intent==null||!"uk.co.afileonmotorsport.pitlane.REMINDER".equals(intent.getAction()))return;
        if(Build.VERSION.SDK_INT>=33 && ContextCompat.checkSelfPermission(ctx,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        NotificationManager manager=(NotificationManager)ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if(manager==null)return;
        if(Build.VERSION.SDK_INT>=26){
            NotificationChannel channel=new NotificationChannel(CHANNEL,"Track day reminders",NotificationManager.IMPORTANCE_DEFAULT);
            channel.setDescription("Packing and morning departure reminders");
            manager.createNotificationChannel(channel);
        }
        boolean evening="night".equals(intent.getStringExtra("stage"));
        String venue=intent.getStringExtra("venue");if(venue==null)venue="Track day";
        String items=intent.getStringExtra("items");if(items==null||items.isEmpty())items="Your packing checklist is complete.";
        Intent open=new Intent(ctx,MainActivity.class);
        open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent tap=PendingIntent.getActivity(ctx,0,open,PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        NotificationCompat.Builder notification=new NotificationCompat.Builder(ctx,CHANNEL)
            .setSmallIcon(R.drawable.afileon_icon)
            .setContentTitle((evening?"Pack tonight: ":"Morning check: ")+venue)
            .setContentText(items)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(items))
            .setContentIntent(tap)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT);
        manager.notify(intent.getStringExtra("key")==null?0:intent.getStringExtra("key").hashCode(),notification.build());
    }
}
