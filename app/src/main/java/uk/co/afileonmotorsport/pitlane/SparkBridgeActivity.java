package uk.co.afileonmotorsport.pitlane;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

import java.util.Arrays;
import java.util.HashSet;
import java.util.Set;

/** Signed-app-only entry point. Never exported without the signature permission. */
public final class SparkBridgeActivity extends Activity {
    private static final Set<String> ALLOWED = new HashSet<>(Arrays.asList(
            "open_home", "open_track", "open_garage", "prepare_session", "add_note"));
    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        Intent from = getIntent();
        String op = from == null ? null : from.getStringExtra("operation");
        String value = from == null ? "" : from.getStringExtra("value");
        if (op == null || !ALLOWED.contains(op) || (value != null && value.length() > 250)) {
            finish();
            return;
        }
        MainActivity.enqueueSpark(op, value == null ? "" : value);
        Intent launch = new Intent(this, MainActivity.class);
        launch.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        startActivity(launch);
        finish();
    }
}
