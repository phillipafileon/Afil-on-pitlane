package uk.co.afileonmotorsport.spark;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

/**
 * Optional open-asset importer for Kenney's CC0 Robot Pack:
 * https://kenney.nl/assets/robot-pack
 * 
 * Only the recognised yellow PNG character poses are read. App private files
 * prevent a ZIP from writing unexpected paths. The importer is not a code/plugin
 * loader. It handles no scripting or networking.
 */
public final class SparkyOpenAssets {
    private static final int MAX_ZIP_BYTES = 8_000_000;
    private static final int MAX_ENTRY_BYTES = 400_000;
    private static final int MAX_ENTRIES = 180;
    private static final String[] SOURCE = {
        "robot_yellowBody.png", "robot_yellowJump.png",
        "robot_yellowDrive1.png", "robot_yellowHurt.png"
    };
    private static final String[] DESTINATION = {
        "idle.png", "jump.png", "drive.png", "hurt.png"
    };

    private SparkyOpenAssets(){}

    public static File directory(Context context) {
        return new File(context.getFilesDir(), "sparky_kenney_robot_cc0");
    }

    public static boolean installed(Context context) {
        return new File(directory(context), "idle.png").isFile();
    }

    private static byte[] readLimited(ZipInputStream zin) throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] tmp = new byte[8192];int n;
        while ((n=zin.read(tmp))!=-1) {
            if(buf.size()+n>MAX_ENTRY_BYTES)throw new IOException("Image exceeds size limit");
            buf.write(tmp,0,n);
        }
        return buf.toByteArray();
    }

    private static void validatePng(byte[] content) throws IOException {
        if(content.length<30 || (content[0]&0xff)!=0x89 || content[1]!='P' ||
            content[2]!='N'||content[3]!='G')
            throw new IOException("Expected Kenney PNG image");
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(content,0,content.length,opts);
        if(opts.outWidth<=0||opts.outHeight<=0||opts.outWidth>1024||opts.outHeight>1024)
            throw new IOException("Invalid image dimensions");
    }

    public static int importKenneyRobotZip(Context context,InputStream source) throws IOException {
        Map<String,byte[]> images=new HashMap<>();
        int files=0,compressed=0;
        try(ZipInputStream zin=new ZipInputStream(source)){
            ZipEntry entry;
            while((entry=zin.getNextEntry())!=null) {
                if(++files>MAX_ENTRIES)throw new IOException("ZIP contains too many entries");
                if(entry.isDirectory())continue;
                String name=entry.getName().replace('\\','/');
                // The official pack includes "Side view" and "Top view".
                // Prefer side-view illustrated poses; never match a random top view.
                if(!name.toLowerCase(Locale.ROOT).contains("side view/"))continue;
                for(int i=0;i<SOURCE.length;i++){
                    if(name.endsWith("/"+SOURCE[i])){
                        byte[] png=readLimited(zin);compressed+=png.length;
                        if(compressed>MAX_ZIP_BYTES)throw new IOException("Pack too large");
                        validatePng(png);images.put(DESTINATION[i],png);
                        break;
                    }
                }
                zin.closeEntry();
            }
        }
        if(!images.containsKey("idle.png") || !images.containsKey("jump.png"))
            throw new IOException("Expected Kenney Robot Pack with yellow body and jump poses");
        File base=directory(context);
        if(!base.isDirectory()&&!base.mkdirs())throw new IOException("Unable to create avatar folder");
        int written=0;
        for(Map.Entry<String,byte[]> image:images.entrySet()){
            File part=new File(base,image.getKey()+".partial");
            try(FileOutputStream out=new FileOutputStream(part)){out.write(image.getValue());}
            File dest=new File(base,image.getKey());
            if(dest.exists()&&!dest.delete())throw new IOException("Unable to replace old pose");
            if(!part.renameTo(dest))throw new IOException("Unable to save avatar pose");
            written++;
        }
        return written;
    }
}
