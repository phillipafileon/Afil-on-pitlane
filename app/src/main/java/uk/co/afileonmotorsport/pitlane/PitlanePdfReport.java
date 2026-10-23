package uk.co.afileonmotorsport.pitlane;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Color;
import android.graphics.pdf.PdfDocument;
import android.net.Uri;
import androidx.core.content.FileProvider;
import org.json.JSONObject;
import org.json.JSONArray;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

/** Offline report PDF based on explicitly supplied user session measurements. */
public final class PitlanePdfReport {
    private PitlanePdfReport(){}
    private static String text(Object v){return v==null?"—":String.valueOf(v).replaceAll("[\\x00-\\x1F]"," ").substring(0,Math.min(150,String.valueOf(v).length()));}
    public static void share(Activity activity,String payload)throws Exception{
        if(payload==null||payload.length()>100_000)throw new IllegalArgumentException("Report exceeds 100 KB");
        JSONObject data=new JSONObject(payload);
        PdfDocument pdf=new PdfDocument();
        Paint paint=new Paint(3);paint.setTypeface(android.graphics.Typeface.create("sans-serif",android.graphics.Typeface.NORMAL));
        float y=0;int page=0;Canvas canvas=null;PdfDocument.Page current=null;
        List<String> lines=new ArrayList<>();
        lines.add("AFILEON MOTORSPORT / PITLANE");
        lines.add("TRACK-DAY SESSION REPORT");
        lines.add("");
        lines.add("Generated: "+text(data.optString("generatedAt")));
        lines.add("Circuit: "+text(data.optString("circuit")));
        lines.add("Vehicle: "+text(data.optString("vehicle")));
        JSONObject gps=data.optJSONObject("gpx");
        if(gps!=null){
            lines.add("");
            lines.add("GPS SUMMARY");
            lines.add("Imported samples: "+gps.optInt("samples",0));
            lines.add("Duration: "+text(gps.opt("durationSeconds"))+" seconds");
            lines.add("Maximum derived speed: "+text(gps.opt("maxSpeedMph"))+" mph");
        }
        lines.add("");lines.add("MEASUREMENT HISTORY");
        JSONArray m=data.optJSONArray("measurements");
        if(m==null||m.length()==0)lines.add("No measurements entered.");
        else for(int i=0;i<Math.min(m.length(),120);i++){
            JSONObject r=m.optJSONObject(i);if(r==null)continue;
            lines.add(text(r.opt("day"))+"  "+text(r.opt("car"))+"  "+text(r.opt("wheel"))+"  "+text(r.opt("stage")));
            lines.add("    Tyre psi "+text(r.opt("psi"))+"  Brake C "+text(r.opt("disc"))+"  Pad mm "+text(r.opt("pad")));
            lines.add("    Tread mm (I/C/O) "+text(r.opt("inner"))+"/"+text(r.opt("centre"))+"/"+text(r.opt("outer")));
        }
        lines.add("");lines.add("CORNER REVIEW");
        lines.add(text(data.optString("cornerReview","No corner analysis supplied.")));
        lines.add("");lines.add("Recorded values are not a vehicle inspection certificate.");
        lines.add("Possible braking from deceleration is not a measured brake-pedal signal.");
        lines.add("Circuit display maps are not verified timing references.");
        for(String line:lines){
            if(canvas==null||y>758){
                if(current!=null)pdf.finishPage(current);
                page++;
                PdfDocument.PageInfo info=new PdfDocument.PageInfo.Builder(595,842,page).create();
                current=pdf.startPage(info);canvas=current.getCanvas();y=52;
                canvas.drawColor(Color.WHITE);
                paint.setColor(Color.rgb(37,43,62));paint.setTextSize(11);
                canvas.drawText("PITLANE / AFILÉON MOTORSPORT",38,26,paint);
                paint.setColor(Color.rgb(225,190,0));paint.setStrokeWidth(3);
                canvas.drawLine(38,34,557,34,paint);paint.setColor(Color.BLACK);
            }
            paint.setTextSize(10);paint.setColor(Color.rgb(32,42,55));
            String row=line.length()>110?line.substring(0,110)+"…":line;
            canvas.drawText(row,40,y,paint);y+=16;
        }
        if(current!=null)pdf.finishPage(current);
        File dir=new File(activity.getCacheDir(),"pitlane-reports");if(!dir.exists())dir.mkdirs();
        File out=new File(dir,"pitlane-report-"+System.currentTimeMillis()+".pdf");
        try(FileOutputStream stream=new FileOutputStream(out)){pdf.writeTo(stream);}
        finally{pdf.close();}
        Uri uri=FileProvider.getUriForFile(activity,activity.getPackageName()+".fileprovider",out);
        Intent share=new Intent(Intent.ACTION_SEND);
        share.setType("application/pdf");share.putExtra(Intent.EXTRA_STREAM,uri);
        share.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        activity.startActivity(Intent.createChooser(share,"Share Pitlane report PDF"));
    }
}
