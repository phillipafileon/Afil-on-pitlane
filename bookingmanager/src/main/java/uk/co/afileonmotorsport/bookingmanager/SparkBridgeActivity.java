package uk.co.afileonmotorsport.bookingmanager;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

/** Only a caller signed with the Pitlane identity can ask this app to prepare an action. */
public final class SparkBridgeActivity extends Activity {
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        String action=getIntent().getStringExtra("operation");
        String value=getIntent().getStringExtra("value");
        if(action==null||!(action.equals("open_jobs")||action.equals("prepare_job")
                ||action.equals("open_website"))||(value!=null&&value.length()>250)){
            finish();return;
        }
        Intent target=new Intent(this,MainActivity.class);
        target.setAction("uk.co.afileonmotorsport.bookingmanager.SPARK");
        target.putExtra("operation",action);
        target.putExtra("value",value==null?"":value);
        target.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(target);
        finish();
    }
}
