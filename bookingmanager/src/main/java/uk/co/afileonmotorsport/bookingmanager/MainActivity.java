package uk.co.afileonmotorsport.bookingmanager;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;

public final class MainActivity extends Activity {
    private final int yellow=Color.rgb(255,229,0);
    private JobDatabase jobs;
    private LinearLayout main,listing;
    private EditText customer,vehicle,details;
    private TextView status;
    @Override protected void onCreate(Bundle state){
        super.onCreate(state);
        jobs=new JobDatabase(this);
        render();
        handleSpark(getIntent());
    }
    @Override protected void onNewIntent(Intent intent){
        super.onNewIntent(intent);
        setIntent(intent);
        handleSpark(intent);
    }
    private TextView label(String text,int size){
        TextView t=new TextView(this);t.setText(text);t.setTextSize(size);t.setTextColor(Color.WHITE);
        t.setPadding(0,8,0,8);return t;
    }
    private Button action(String text,LinearLayout target,Runnable click){
        Button b=new Button(this);b.setText(text);b.setTextColor(Color.BLACK);
        b.setBackgroundTintList(android.content.res.ColorStateList.valueOf(yellow));
        target.addView(b);b.setOnClickListener(v->click.run());return b;
    }
    private EditText field(String hint,LinearLayout target){
        EditText e=new EditText(this);e.setHint(hint);e.setTextColor(Color.WHITE);
        e.setHintTextColor(Color.LTGRAY);target.addView(e);return e;
    }
    private void render(){
        ScrollView scroll=new ScrollView(this);
        main=new LinearLayout(this);
        main.setOrientation(LinearLayout.VERTICAL);
        main.setPadding(22,30,22,24);
        main.setBackgroundColor(Color.rgb(2,7,17));
        scroll.addView(main);
        main.addView(label("AFILÉON // BOOKING MANAGER",22));
        main.addView(label("PRIVATE • OFFLINE REPAIR JOBS / SIGNATURES",12));
        status=label("Saved on this device • not yet synchronised to the website.",13);
        main.addView(status);
        action("OPEN WEBSITE BOOKINGS (INTERNET)",main,()->{
            try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse("https://afileonmotorsport.co.uk/admin.html")));}
            catch(Exception ex){status.setText("No app available to open website.");}
        });
        main.addView(label("NEW JOB CARD",18));
        customer=field("Customer name",main);
        vehicle=field("Vehicle / registration",main);
        details=field("Requested work / notes",main);
        action("SAVE NEW LOCAL JOB",main,()->{
            String c=customer.getText().toString().trim();
            String v=vehicle.getText().toString().trim();
            String d=details.getText().toString().trim();
            if(c.isEmpty()||v.isEmpty()||d.isEmpty()){status.setText("Enter customer, vehicle and work.");return;}
            if(c.length()>140||v.length()>140||d.length()>3000){status.setText("One or more fields are too long.");return;}
            long id=jobs.create(c,v,d);
            customer.setText("");vehicle.setText("");details.setText("");
            status.setText("Job #"+id+" saved offline. Customer signature can be recorded below.");
            reload();
        });
        main.addView(label("LOCAL JOB CARDS",18));
        listing=new LinearLayout(this);
        listing.setOrientation(LinearLayout.VERTICAL);
        main.addView(listing);
        setContentView(scroll);
        reload();
    }
    private void reload(){
        listing.removeAllViews();
        try(Cursor cursor=jobs.jobs()){
            while(cursor.moveToNext()){
                final long id=cursor.getLong(0);
                String cust=cursor.getString(1),reg=cursor.getString(2),d=cursor.getString(3);
                String signed=cursor.getString(5);
                listing.addView(label("#"+id+"  "+cust+"  //  "+reg+"\n"+d+"\n"+(signed==null?"Unsigned":"Signed "+signed),14));
                if(signed==null)action("CUSTOMER SIGN JOB #"+id,listing,()->captureSignature(id));
            }
        }
    }
    private void captureSignature(long jobId){
        LinearLayout content=new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(15,15,15,15);
        content.addView(label("Ask the customer to review the job card before signing.",13));
        SignaturePad pad=new SignaturePad(this);
        content.addView(pad,new LinearLayout.LayoutParams(-1,340));
        new AlertDialog.Builder(this).setTitle("Customer signature // Job #"+jobId)
          .setView(content).setNegativeButton("Cancel",null).setNeutralButton("Clear",(dialog,which)->captureSignature(jobId))
          .setPositiveButton("Save signature",(dialog,which)->{
              if(!pad.hasStroke()){status.setText("No signature captured.");return;}
              try{
                  File file=new File(getFilesDir(),"job-"+jobId+"-signature.png");
                  pad.save(file);
                  jobs.sign(jobId,file.getAbsolutePath());
                  status.setText("Signature saved offline for job #"+jobId+".");
                  reload();
              }catch(Exception e){status.setText("Signature could not be saved: "+e.getMessage());}
          }).show();
    }
    private void handleSpark(Intent i){
        if(i==null||!"uk.co.afileonmotorsport.bookingmanager.SPARK".equals(i.getAction()))return;
        String operation=i.getStringExtra("operation");
        String value=i.getStringExtra("value");
        if("prepare_job".equals(operation)){
            customer.setText(value==null?"":value.substring(0,Math.min(value.length(),140)));
            status.setText("SPARK has prepared a new job card. Review and save it yourself.");
        }else if("open_website".equals(operation)){
            status.setText("SPARK requested online booking access. Tap OPEN WEBSITE BOOKINGS to log in.");
        }else{
            status.setText("SPARK opened your locally stored jobs.");
        }
    }
    @Override protected void onDestroy(){
        if(jobs!=null)jobs.close();
        super.onDestroy();
    }
}
