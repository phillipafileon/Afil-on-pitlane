package uk.co.afileonmotorsport.spark;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.RectF;
import java.io.File;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.os.SystemClock;
import android.view.View;

/** Lightweight 2D expressive offline character, with no network or animation assets. */
public final class SparkyFaceView extends View {
    private final Paint p = new Paint(Paint.ANTI_ALIAS_FLAG);
    private boolean thinking;
    private boolean talking;
    private boolean listening;
    private Bitmap idlePose, jumpPose, drivePose, hurtPose;
    private String reaction="";
    private long reactionStarted;
    private static final long REACTION_MS=1200;

    public SparkyFaceView(Context context) {
        super(context);
        setContentDescription("Sparky. Tap to talk. Long press to open settings.");
        setImportantForAccessibility(View.IMPORTANT_FOR_ACCESSIBILITY_YES);
        loadOpenSourceSkin();
    }
    public void setThinking(boolean value) {
        thinking=value; if(value){talking=false;listening=false;} invalidate();
    }
    public void setTalking(boolean value) {
        talking=value; if(value){thinking=false;listening=false;} invalidate();
    }
    public void setListening(boolean value) {
        listening=value; if(value){thinking=false;talking=false;} invalidate();
    }
    public void loadOpenSourceSkin(){
        File root=SparkyOpenAssets.directory(getContext());
        idlePose=load(new File(root,"idle.png"));
        jumpPose=load(new File(root,"jump.png"));
        drivePose=load(new File(root,"drive.png"));
        hurtPose=load(new File(root,"hurt.png"));
        invalidate();
    }
    private Bitmap load(File file){
        if(!file.isFile() || file.length()>400000)return null;
        return BitmapFactory.decodeFile(file.getAbsolutePath());
    }
    public void react(String action){
        reaction=action;
        reactionStarted=SystemClock.uptimeMillis();
        invalidate();
    }
    public String currentSkinName(){
        return idlePose==null?"original expressive vector":"Kenney Robot Pack • CC0";
    }
    private void keepAnimating(){
        if(getWindowToken()!=null && hasWindowFocus() && getVisibility()==View.VISIBLE)
            postInvalidateDelayed(50);
    }
    private void circle(Canvas canvas,float x,float y,float r,int colour) {
        p.setColor(colour);p.setStyle(Paint.Style.FILL);
        canvas.drawCircle(x,y,r,p);
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float width=getWidth(),height=getHeight();
        if(width<=0 || height<=0)return;
        float x=width*0.5f,y=height*0.50f;
        float unit=Math.min(width*0.37f,height*0.42f);
        float secs=SystemClock.uptimeMillis()/1000f;
        float bob=(float)Math.sin(secs*2.0f)*unit*0.026f;
        int yellow=Color.rgb(255,229,0), cyan=Color.rgb(69,224,242);
        y+=bob;
        long age=SystemClock.uptimeMillis()-reactionStarted;
        boolean active=!reaction.isEmpty() && age<REACTION_MS;
        if(!active)reaction="";
        // Optional imported Kenney CC0 sprite. Fallback is our original vector.
        if(idlePose!=null){
            canvas.save();
            if(active&&reaction.equals("flip"))
                canvas.rotate(360f*age/REACTION_MS,x,y);
            else if(active&&reaction.equals("wave"))
                canvas.rotate(9f*(float)Math.sin(age/90f),x,y);
            else if(active&&reaction.equals("nod"))
                canvas.translate(0,unit*.1f*(float)Math.sin(age/80f));
            Bitmap pose=active&&reaction.equals("flip")&&jumpPose!=null?jumpPose:
                active&&reaction.equals("wave")&&drivePose!=null?drivePose:
                active&&reaction.equals("surprised")&&hurtPose!=null?hurtPose:idlePose;
            p.setStyle(Paint.Style.FILL);p.setColor(Color.WHITE);p.setFilterBitmap(true);
            RectF rect=new RectF(x-unit*1.38f,y-unit*1.05f,
                                 x+unit*1.38f,y+unit*1.05f);
            canvas.drawBitmap(pose,null,rect,p);
            if(listening){
                p.setColor(cyan);p.setStyle(Paint.Style.STROKE);
                p.setStrokeWidth(unit*.045f);
                canvas.drawCircle(x,y,unit*1.5f,p);
            }
            if(thinking)circle(canvas,x+unit,y-unit*.95f,unit*.11f,cyan);
            canvas.restore();
            keepAnimating();
            return;
        }
        if(active){
            canvas.save();
            if(reaction.equals("flip"))canvas.rotate(360f*age/REACTION_MS,x,y);
            else if(reaction.equals("wave"))canvas.rotate(9f*(float)Math.sin(age/90f),x,y);
            else if(reaction.equals("nod"))canvas.translate(0,unit*.1f*(float)Math.sin(age/80f));
        }
        // Glowing, jagged personality silhouette
        p.setColor(Color.rgb(24,35,46));p.setStyle(Paint.Style.FILL);
        canvas.drawRoundRect(x-unit*1.16f,y-unit*1.00f,
                x+unit*1.16f,y+unit*1.08f,unit*0.44f,unit*0.44f,p);
        Path head=new Path();
        head.moveTo(x-unit*0.82f,y-unit*0.88f);
        head.lineTo(x+unit*0.30f,y-unit*1.07f);
        head.lineTo(x+unit*0.98f,y-unit*0.34f);
        head.lineTo(x+unit*0.82f,y+unit*0.82f);
        head.lineTo(x-unit*0.62f,y+unit*0.94f);
        head.lineTo(x-unit*1.0f,y-unit*0.17f);
        head.close();
        p.setColor(yellow);canvas.drawPath(head,p);
        boolean blink=((int)(secs*10)%69)==0;
        float eye=blink?unit*0.055f:unit*0.19f;
        circle(canvas,x-unit*0.36f,y-unit*0.10f,eye,Color.BLACK);
        circle(canvas,x+unit*0.36f,y-unit*0.10f,eye,Color.BLACK);
        if(listening){
            p.setColor(cyan);p.setStyle(Paint.Style.STROKE);
            p.setStrokeWidth(unit*0.038f);
            float pulse=unit*(1.38f+0.025f*(float)Math.sin(secs*7));
            canvas.drawCircle(x,y,pulse,p);
            p.setStyle(Paint.Style.FILL);
        }
        // A subtly expressive mouth; talking state changes the shape.
        p.setColor(Color.BLACK);p.setStrokeWidth(unit*0.085f);
        p.setStrokeCap(Paint.Cap.ROUND);
        if(talking){
            p.setStyle(Paint.Style.FILL);
            float openness=0.13f+0.13f*(1f+(float)Math.sin(secs*15f))*0.5f;
            canvas.drawOval(x-unit*0.16f,y+unit*0.39f-openness*unit*0.5f,
                    x+unit*0.16f,y+unit*0.43f+openness*unit*0.5f,p);
        }else if(thinking){
            p.setStyle(Paint.Style.STROKE);
            canvas.drawLine(x-unit*0.14f,y+unit*0.48f,x+unit*0.24f,y+unit*0.43f,p);
        }else{
            p.setStyle(Paint.Style.STROKE);
            canvas.drawArc(x-unit*0.33f,y+unit*0.21f,
                    x+unit*0.32f,y+unit*0.58f,5,165,false,p);
        }
        // Two friendly hands, independent of the face.
        p.setColor(cyan);p.setStyle(Paint.Style.FILL);
        float handwave=(float)Math.sin(secs*3f)*unit*0.08f;
        canvas.drawCircle(x-unit*1.23f,y+unit*0.42f+handwave,unit*0.16f,p);
        canvas.drawCircle(x+unit*1.23f,y+unit*0.42f-handwave,unit*0.16f,p);
        // Small attention indicator when the model is generating.
        if(thinking){
            circle(canvas,x+unit*0.87f,y-unit*0.96f,unit*0.085f,cyan);
        }
        if(active)canvas.restore();
        keepAnimating();
    }
}
