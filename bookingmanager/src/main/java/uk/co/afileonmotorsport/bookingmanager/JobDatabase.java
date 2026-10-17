package uk.co.afileonmotorsport.bookingmanager;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;

public final class JobDatabase extends SQLiteOpenHelper {
    public JobDatabase(Context context){super(context,"afileon_jobs_local_v1.db",null,1);}
    @Override public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE jobs(id INTEGER PRIMARY KEY AUTOINCREMENT,customer TEXT NOT NULL,vehicle TEXT NOT NULL,details TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open',signed_at TEXT,signature_path TEXT,created_at TEXT NOT NULL)");
    }
    @Override public void onUpgrade(SQLiteDatabase db,int from,int to){}
    public long create(String customer,String vehicle,String details){
        android.content.ContentValues v=new android.content.ContentValues();
        v.put("customer",customer);v.put("vehicle",vehicle);v.put("details",details);
        v.put("created_at",java.time.Instant.now().toString());
        return getWritableDatabase().insertOrThrow("jobs",null,v);
    }
    public Cursor jobs(){
        return getReadableDatabase().rawQuery("SELECT id,customer,vehicle,details,status,signed_at FROM jobs ORDER BY id DESC LIMIT 200",null);
    }
    public void sign(long id,String file){
        android.content.ContentValues v=new android.content.ContentValues();
        v.put("signed_at",java.time.Instant.now().toString());
        v.put("signature_path",file);
        getWritableDatabase().update("jobs",v,"id=?",new String[]{String.valueOf(id)});
    }
}
