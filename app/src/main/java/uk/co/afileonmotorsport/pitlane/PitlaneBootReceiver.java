package uk.co.afileonmotorsport.pitlane;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Restore pending reminders after reboot, timezone changes, or clock adjustment. */
public final class PitlaneBootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context,Intent intent) {
        if(intent==null)return;
        String action=intent.getAction();
        if(Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_TIMEZONE_CHANGED.equals(action)||Intent.ACTION_TIME_CHANGED.equals(action)){
            PitlaneReminderReceiver.restore(context);
        }
    }
}
