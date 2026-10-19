package uk.co.afileonmotorsport.bookingmanager;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.view.MotionEvent;
import android.view.View;
import java.io.File;
import java.io.FileOutputStream;

public final class SignaturePad extends View {
    private final Paint pen=new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path stroke=new Path();
    private boolean touched=false;
    public SignaturePad(Context context){
        super(context);
        pen.setColor(Color.BLACK);pen.setStrokeWidth(4f);pen.setStyle(Paint.Style.STROKE);
        pen.setStrokeJoin(Paint.Join.ROUND);pen.setStrokeCap(Paint.Cap.ROUND);
        setBackgroundColor(Color.WHITE);
    }
    @Override protected void onDraw(Canvas canvas){
        super.onDraw(canvas);canvas.drawPath(stroke,pen);
    }
    @Override public boolean onTouchEvent(MotionEvent event){
        switch(event.getActionMasked()){
            case MotionEvent.ACTION_DOWN:stroke.moveTo(event.getX(),event.getY());touched=true;invalidate();return true;
            case MotionEvent.ACTION_MOVE:stroke.lineTo(event.getX(),event.getY());invalidate();return true;
            case MotionEvent.ACTION_UP:stroke.lineTo(event.getX(),event.getY());invalidate();return true;
            default:return false;
        }
    }
    public boolean hasStroke(){return touched;}
    public void clear(){stroke.reset();touched=false;invalidate();}
    public void save(File f)throws Exception{
        if(!touched)throw new IllegalStateException("Customer has not signed");
        Bitmap bitmap=Bitmap.createBitmap(Math.max(1,getWidth()),Math.max(1,getHeight()),Bitmap.Config.ARGB_8888);
        Canvas canvas=new Canvas(bitmap);canvas.drawColor(Color.WHITE);canvas.drawPath(stroke,pen);
        try(FileOutputStream out=new FileOutputStream(f)){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}
        bitmap.recycle();
    }
}
