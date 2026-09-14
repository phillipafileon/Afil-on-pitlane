package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.activity.OnBackPressedCallback;
import androidx.annotation.NonNull;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.webkit.WebViewAssetLoader;

import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final int LOCATION_REQUEST = 77;
    private static final String UPDATE_MANIFEST_URL = "https://afileonmotorsport.co.uk/pitlane-update.json";
    private static final String ALLOWED_UPDATE_HOST = "afileonmotorsport.co.uk";
    private static final long UPDATE_RECHECK_MS = 30_000L;

    private WebView webView;
    private String pendingOrigin;
    private GeolocationPermissions.Callback pendingGeoCallback;

    private final ExecutorService updateExecutor = Executors.newSingleThreadExecutor();
    private volatile boolean updateCheckRunning = false;
    private volatile boolean updateDownloadRunning = false;
    private long lastUpdateCheckAt = 0L;
    private boolean updateDialogShowing = false;
    private boolean waitingForUnknownSourcesPermission = false;
    private File pendingUpdateFile;
    private UpdateInfo pendingUpdateInfo;
    private AlertDialog downloadDialog;

    private static final class UpdateInfo {
        final int versionCode;
        final String versionName;
        final boolean mandatory;
        final String apkUrl;
        final String notes;

        UpdateInfo(int versionCode, String versionName, boolean mandatory, String apkUrl, String notes) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.mandatory = mandatory;
            this.apkUrl = apkUrl;
            this.notes = notes;
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        View contentRoot = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(contentRoot, (view, windowInsets) -> {
            Insets bars = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars());
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            return windowInsets;
        });
        ViewCompat.requestApplyInsets(contentRoot);

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setGeolocationEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMediaPlaybackRequiresUserGesture(false);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                view.evaluateJavascript(
                        "(function(){" +
                        "if(!document.getElementById('pitlane-v031')){var s=document.createElement('script');s.id='pitlane-v031';s.src='https://appassets.androidplatform.net/assets/enhancements_v031.js';document.body.appendChild(s);}" +
                        "function loadHighlights(){if(!document.getElementById('pitlane-vehicles-highlight-v039')){var h=document.createElement('script');h.id='pitlane-vehicles-highlight-v039';h.src='https://appassets.androidplatform.net/assets/afileon_vehicle_highlights_v039.js';document.body.appendChild(h);}}" +
                        "function load924(){if(!document.getElementById('pitlane-vehicles-924-v038')){var p=document.createElement('script');p.id='pitlane-vehicles-924-v038';p.src='https://appassets.androidplatform.net/assets/vehicle_catalogue_924_v038.js';p.onload=loadHighlights;document.body.appendChild(p);}else{loadHighlights();}}" +
                        "if(!document.getElementById('pitlane-vehicles-v037')){var v=document.createElement('script');v.id='pitlane-vehicles-v037';v.src='https://appassets.androidplatform.net/assets/vehicle_catalogue_v037.js';v.onload=load924;document.body.appendChild(v);}else{load924();}" +
                        "function loadLb(){" +
                        "if(!document.getElementById('pitlane-lb-v034')){var l=document.createElement('script');l.id='pitlane-lb-v034';l.src='https://appassets.androidplatform.net/assets/leaderboards_v034.js';l.onload=function(){if(!document.getElementById('pitlane-lb-v035')){var p=document.createElement('script');p.id='pitlane-lb-v035';p.src='https://appassets.androidplatform.net/assets/leaderboards_v035_patch.js';document.body.appendChild(p);}};document.body.appendChild(l);}" +
                        "else if(!document.getElementById('pitlane-lb-v035')){var p=document.createElement('script');p.id='pitlane-lb-v035';p.src='https://appassets.androidplatform.net/assets/leaderboards_v035_patch.js';document.body.appendChild(p);}" +
                        "}" +
                        "if(!document.getElementById('pitlane-lb-v036-guard')){var g=document.createElement('script');g.id='pitlane-lb-v036-guard';g.src='https://appassets.androidplatform.net/assets/leaderboard_guard_v036.js';g.onload=loadLb;document.body.appendChild(g);}else{loadLb();}" +
                        "})()",
                        null);

                // Every fresh Pitlane load checks the website's tiny version manifest.
                // If there is no internet or the check fails, Pitlane remains usable offline.
                checkForUpdates(true);
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (ContextCompat.checkSelfPermission(MainActivity.this, Manifest.permission.ACCESS_FINE_LOCATION)
                        == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingOrigin = origin;
                    pendingGeoCallback = callback;
                    ActivityCompat.requestPermissions(MainActivity.this,
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                            LOCATION_REQUEST);
                }
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) webView.goBack();
                else finish();
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();

        // Returning from Android's "Install unknown apps" permission screen.
        if (waitingForUnknownSourcesPermission && pendingUpdateFile != null) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                waitingForUnknownSourcesPermission = false;
                File file = pendingUpdateFile;
                pendingUpdateFile = null;
                launchPackageInstaller(file);
                return;
            }
        }

        // Also re-check when the user comes back to Pitlane after a while.
        if (webView != null && System.currentTimeMillis() - lastUpdateCheckAt > UPDATE_RECHECK_MS) {
            checkForUpdates(false);
        }
    }

    private void checkForUpdates(boolean force) {
        long now = System.currentTimeMillis();
        if (updateCheckRunning || updateDownloadRunning) return;
        if (!force && now - lastUpdateCheckAt < UPDATE_RECHECK_MS) return;
        lastUpdateCheckAt = now;
        updateCheckRunning = true;

        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(UPDATE_MANIFEST_URL + "?t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(4500);
                connection.setReadTimeout(4500);
                connection.setUseCaches(false);
                connection.setRequestProperty("Cache-Control", "no-cache, no-store");
                connection.setRequestProperty("Pragma", "no-cache");
                connection.setRequestProperty("User-Agent", "Afileon-Pitlane/" + BuildConfig.VERSION_NAME);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) return;

                StringBuilder body = new StringBuilder();
                try (BufferedReader reader = new BufferedReader(new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                    String line;
                    while ((line = reader.readLine()) != null) body.append(line);
                }

                JSONObject json = new JSONObject(body.toString());
                int latestCode = json.optInt("versionCode", 0);
                if (latestCode <= BuildConfig.VERSION_CODE) return;

                String latestName = json.optString("versionName", String.valueOf(latestCode));
                boolean mandatory = json.optBoolean("mandatory", true);
                String apkUrl = json.optString("apkUrl", "");
                String notes = json.optString("notes", "A newer version of Afiléon Pitlane is available.");
                if (!isAllowedApkUrl(apkUrl)) return;

                UpdateInfo info = new UpdateInfo(latestCode, latestName, mandatory, apkUrl, notes);
                runOnUiThread(() -> maybePresentUpdate(info));
            } catch (Exception ignored) {
                // Offline / temporary network failures must never prevent Pitlane from opening.
            } finally {
                if (connection != null) connection.disconnect();
                updateCheckRunning = false;
            }
        });
    }

    private boolean isAllowedApkUrl(String apkUrl) {
        try {
            Uri uri = Uri.parse(apkUrl);
            return "https".equalsIgnoreCase(uri.getScheme())
                    && ALLOWED_UPDATE_HOST.equalsIgnoreCase(uri.getHost())
                    && uri.getPath() != null
                    && uri.getPath().toLowerCase().endsWith(".apk");
        } catch (Exception e) {
            return false;
        }
    }

    private void maybePresentUpdate(UpdateInfo info) {
        if (isFinishing() || isDestroyed()) return;
        pendingUpdateInfo = info;

        // Never interrupt an active GPS track session. The update is presented after
        // the session or the next time Pitlane is foregrounded/opened.
        if (webView != null) {
            webView.evaluateJavascript(
                    "(function(){var g=document.getElementById('gps');return !!(g&&/(running|live)/i.test(g.textContent||''));})()",
                    value -> {
                        if ("true".equalsIgnoreCase(value)) {
                            Toast.makeText(this, "Pitlane update found — it will be offered after your track session.", Toast.LENGTH_LONG).show();
                        } else {
                            showUpdateDialog(info);
                        }
                    });
        } else {
            showUpdateDialog(info);
        }
    }

    private void showUpdateDialog(UpdateInfo info) {
        if (updateDialogShowing || isFinishing() || isDestroyed()) return;
        updateDialogShowing = true;

        String message = "Installed: " + BuildConfig.VERSION_NAME
                + "\nAvailable: " + info.versionName
                + "\n\n" + info.notes
                + "\n\nPitlane will download the APK itself. Android will still ask you to approve the installation.";

        AlertDialog.Builder builder = new AlertDialog.Builder(this)
                .setTitle(info.mandatory ? "Pitlane update required" : "Pitlane update available")
                .setMessage(message)
                .setCancelable(!info.mandatory)
                .setPositiveButton("Update now", (dialog, which) -> {
                    updateDialogShowing = false;
                    downloadAndInstallUpdate(info);
                });

        if (info.mandatory) {
            builder.setNegativeButton("Exit", (dialog, which) -> {
                updateDialogShowing = false;
                finishAffinity();
            });
        } else {
            builder.setNegativeButton("Later", (dialog, which) -> updateDialogShowing = false);
        }

        AlertDialog dialog = builder.create();
        dialog.setOnCancelListener(d -> updateDialogShowing = false);
        dialog.show();
    }

    private void downloadAndInstallUpdate(UpdateInfo info) {
        if (updateDownloadRunning) return;
        updateDownloadRunning = true;

        downloadDialog = new AlertDialog.Builder(this)
                .setTitle("Downloading Pitlane update")
                .setMessage("Please keep Pitlane open. The Android installer will appear automatically when the download is ready.")
                .setCancelable(false)
                .create();
        downloadDialog.show();

        updateExecutor.execute(() -> {
            HttpURLConnection connection = null;
            File target = null;
            try {
                File directory = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
                if (directory == null) directory = getCacheDir();
                if (!directory.exists() && !directory.mkdirs()) throw new IllegalStateException("Cannot create update directory");

                target = new File(directory, "Afileon-Pitlane-update.apk");
                if (target.exists() && !target.delete()) throw new IllegalStateException("Cannot replace old update file");

                URL url = new URL(info.apkUrl + (info.apkUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(20_000);
                connection.setUseCaches(false);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("User-Agent", "Afileon-Pitlane-Updater/" + BuildConfig.VERSION_NAME);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("Download returned " + connection.getResponseCode());
                }

                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                    output.flush();
                }

                if (target.length() < 100_000) throw new IllegalStateException("Downloaded file is too small");

                File readyFile = target;
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    requestPackageInstall(readyFile);
                });
            } catch (Exception e) {
                if (target != null && target.exists()) target.delete();
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    showUpdateDownloadError(info);
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void showUpdateDownloadError(UpdateInfo info) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("Update could not be downloaded")
                .setMessage("Pitlane could not download the update. Check your internet connection and try again.")
                .setCancelable(false)
                .setPositiveButton("Retry", (d, w) -> downloadAndInstallUpdate(info))
                .setNegativeButton("Exit", (d, w) -> finishAffinity())
                .show();
    }

    private void requestPackageInstall(File apkFile) {
        pendingUpdateFile = apkFile;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            waitingForUnknownSourcesPermission = true;
            Intent settingsIntent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(settingsIntent);
            Toast.makeText(this, "Allow Afiléon Pitlane to install this update, then return to Pitlane.", Toast.LENGTH_LONG).show();
            return;
        }

        File file = pendingUpdateFile;
        pendingUpdateFile = null;
        launchPackageInstaller(file);
    }

    private void launchPackageInstaller(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(this,
                    getPackageName() + ".fileprovider", apkFile);
            Intent installIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apkUri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
        } catch (Exception e) {
            if (pendingUpdateInfo != null) showUpdateDownloadError(pendingUpdateInfo);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, @NonNull String[] permissions, @NonNull int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == LOCATION_REQUEST && pendingGeoCallback != null && pendingOrigin != null) {
            boolean granted = ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION)
                    == PackageManager.PERMISSION_GRANTED;
            pendingGeoCallback.invoke(pendingOrigin, granted, false);
            pendingGeoCallback = null;
            pendingOrigin = null;
        }
    }

    @Override
    protected void onDestroy() {
        if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
        updateExecutor.shutdownNow();
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.stopLoading();
            webView.setWebChromeClient(null);
            webView.setWebViewClient(null);
            webView.destroy();
        }
        super.onDestroy();
    }
}
