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
import android.webkit.JavascriptInterface;
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
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final int LOCATION_REQUEST = 77;

    private static final String[] UPDATE_MANIFEST_URLS = new String[] {
            "https://afileonmotorsport.co.uk/pitlane-update.json",
            "https://www.afileonmotorsport.co.uk/pitlane-update.json",
            "https://am.afileon-motorsport.workers.dev/pitlane-update.json",
            "https://www.afileon-motorsport.workers.dev/pitlane-update.json"
    };

    private static final String[] ALLOWED_UPDATE_HOSTS = new String[] {
            "afileonmotorsport.co.uk",
            "www.afileonmotorsport.co.uk",
            "am.afileon-motorsport.workers.dev",
            "www.afileon-motorsport.workers.dev"
    };

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

    private final class UpdateBridge {
        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> MainActivity.this.checkForUpdates(true, true));
        }
    }

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
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

        webView.addJavascriptInterface(new UpdateBridge(), "PitlaneNative");

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
                        "function loadVehicles044(){if(!document.getElementById('pitlane-vehicles-v044')){var n=document.createElement('script');n.id='pitlane-vehicles-v044';n.src='https://appassets.androidplatform.net/assets/vehicle_catalogue_v044.js';document.body.appendChild(n);}}" +
                        "if(!document.getElementById('pitlane-vehicles-v037')){var v=document.createElement('script');v.id='pitlane-vehicles-v037';v.src='https://appassets.androidplatform.net/assets/vehicle_catalogue_v037.js';v.onload=loadVehicles044;document.body.appendChild(v);}else{loadVehicles044();}" +
                        "function loadLb(){" +
                        "if(!document.getElementById('pitlane-lb-v034')){var l=document.createElement('script');l.id='pitlane-lb-v034';l.src='https://appassets.androidplatform.net/assets/leaderboards_v034.js';l.onload=function(){if(!document.getElementById('pitlane-lb-v035')){var p=document.createElement('script');p.id='pitlane-lb-v035';p.src='https://appassets.androidplatform.net/assets/leaderboards_v035_patch.js';document.body.appendChild(p);}};document.body.appendChild(l);}" +
                        "else if(!document.getElementById('pitlane-lb-v035')){var p=document.createElement('script');p.id='pitlane-lb-v035';p.src='https://appassets.androidplatform.net/assets/leaderboards_v035_patch.js';document.body.appendChild(p);}" +
                        "}" +
                        "if(!document.getElementById('pitlane-lb-v036-guard')){var g=document.createElement('script');g.id='pitlane-lb-v036-guard';g.src='https://appassets.androidplatform.net/assets/leaderboard_guard_v036.js';g.onload=loadLb;document.body.appendChild(g);}else{loadLb();}" +
                        "})()",
                        null);

                ensureUpdateStatusUi();
                checkForUpdates(true, false);
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
                    ActivityCompat.requestPermissions(
                            MainActivity.this,
                            new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION},
                            LOCATION_REQUEST);
                }
            }
        });

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    @Override
    protected void onResume() {
        super.onResume();

        if (waitingForUnknownSourcesPermission && pendingUpdateFile != null) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                waitingForUnknownSourcesPermission = false;
                File file = pendingUpdateFile;
                pendingUpdateFile = null;
                launchPackageInstaller(file);
                return;
            }
        }

        if (pendingUpdateInfo != null && !updateDownloadRunning && !updateDialogShowing) {
            maybePresentUpdate(pendingUpdateInfo);
        } else if (webView != null && System.currentTimeMillis() - lastUpdateCheckAt > UPDATE_RECHECK_MS) {
            checkForUpdates(false, false);
        }
    }

    private void ensureUpdateStatusUi() {
        if (webView == null) return;
        String installed = BuildConfig.VERSION_NAME;
        String js = "(function(){" +
                "var home=document.getElementById('home');if(!home)return;" +
                "var p=document.getElementById('pitlaneUpdatePanel');" +
                "if(!p){p=document.createElement('div');p.id='pitlaneUpdatePanel';p.className='panel';p.style.marginTop='10px';p.style.borderColor='#33495d';" +
                "p.innerHTML='<div class=\"eyebrow\">APP UPDATE</div><div style=\"display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap\"><div style=\"min-width:0;flex:1\"><b id=\"pitlaneUpdateTitle\">Checking for updates…</b><p id=\"pitlaneUpdateDetail\" class=\"tiny\" style=\"margin:5px 0 0\"></p></div><button id=\"pitlaneUpdateCheck\" class=\"btn alt\" type=\"button\">Check now</button></div>';" +
                "var hero=home.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',p);else home.prepend(p);" +
                "var b=document.getElementById('pitlaneUpdateCheck');if(b)b.onclick=function(){if(window.PitlaneNative&&PitlaneNative.checkForUpdates){PitlaneNative.checkForUpdates();}};" +
                "}" +
                "var d=document.getElementById('pitlaneUpdateDetail');if(d&&!d.textContent)d.textContent='Installed version: " + escapeJs(installed) + "';" +
                "})()";
        webView.evaluateJavascript(js, null);
    }

    private static String escapeJs(String value) {
        if (value == null) return "";
        return value.replace("\\", "\\\\")
                .replace("'", "\\'")
                .replace("\r", "\\r")
                .replace("\n", "\\n");
    }

    private void setUpdateUi(String state, String title, String detail) {
        if (webView == null) return;
        ensureUpdateStatusUi();
        String border;
        switch (state) {
            case "available":
                border = "#ffe500";
                break;
            case "ok":
                border = "#235944";
                break;
            case "error":
                border = "#6e2f39";
                break;
            case "downloading":
                border = "#3fcfff";
                break;
            default:
                border = "#33495d";
        }

        String js = "(function(){" +
                "var p=document.getElementById('pitlaneUpdatePanel'),t=document.getElementById('pitlaneUpdateTitle'),d=document.getElementById('pitlaneUpdateDetail');" +
                "if(p)p.style.borderColor='" + border + "';" +
                "if(t)t.textContent=" + JSONObject.quote(title) + ";" +
                "if(d)d.textContent=" + JSONObject.quote(detail) + ";" +
                "})()";
        webView.evaluateJavascript(js, null);
    }

    private void checkForUpdates(boolean force, boolean userInitiated) {
        long now = System.currentTimeMillis();
        if (updateDownloadRunning) return;

        if (updateCheckRunning) {
            if (userInitiated) {
                Toast.makeText(this, "Pitlane is already checking for updates.", Toast.LENGTH_SHORT).show();
            }
            return;
        }

        if (!force && now - lastUpdateCheckAt < UPDATE_RECHECK_MS) return;
        lastUpdateCheckAt = now;
        updateCheckRunning = true;

        setUpdateUi("checking", "Checking for updates…", "Installed version: " + BuildConfig.VERSION_NAME);

        updateExecutor.execute(() -> {
            JSONObject manifest = null;
            String manifestSource = null;
            Exception lastError = null;

            for (String manifestUrl : UPDATE_MANIFEST_URLS) {
                try {
                    manifest = fetchManifest(manifestUrl);
                    manifestSource = manifestUrl;
                    break;
                } catch (Exception e) {
                    lastError = e;
                }
            }

            if (manifest == null) {
                String reason = lastError != null ? lastError.getClass().getSimpleName() : "No update server response";
                String finalReason = reason;
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi(
                            "error",
                            "Could not reach the update server",
                            "Pitlane is still usable offline. Tap Check now to retry. (" + finalReason + ")");
                    if (userInitiated) {
                        Toast.makeText(this, "Update check failed. Check your internet connection and try again.", Toast.LENGTH_LONG).show();
                    }
                });
                return;
            }

            int latestCode = manifest.optInt("versionCode", 0);
            String latestName = manifest.optString("versionName", String.valueOf(latestCode));
            boolean mandatory = manifest.optBoolean("mandatory", false);
            String apkUrl = manifest.optString("apkUrl", "");
            String notes = manifest.optString("notes", "A newer version of Afiléon Pitlane is available.");
            String finalManifestSource = manifestSource;

            if (latestCode <= 0) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi("error", "Update manifest is invalid", "The server responded, but did not provide a valid version number.");
                });
                return;
            }

            if (latestCode <= BuildConfig.VERSION_CODE) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    pendingUpdateInfo = null;
                    setUpdateUi(
                            "ok",
                            "Pitlane is up to date",
                            "Installed: " + BuildConfig.VERSION_NAME + " • Latest: " + latestName);
                    if (userInitiated) {
                        Toast.makeText(this, "Afiléon Pitlane is up to date.", Toast.LENGTH_SHORT).show();
                    }
                });
                return;
            }

            if (!isAllowedApkUrl(apkUrl)) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi(
                            "error",
                            "Update found, but download address was rejected",
                            "Latest version " + latestName + " was found via " + finalManifestSource + ", but its APK address is not on an approved Afiléon host.");
                });
                return;
            }

            UpdateInfo info = new UpdateInfo(latestCode, latestName, mandatory, apkUrl, notes);
            runOnUiThread(() -> {
                updateCheckRunning = false;
                pendingUpdateInfo = info;
                setUpdateUi(
                        "available",
                        "Update available — " + info.versionName,
                        "Installed: " + BuildConfig.VERSION_NAME + ". Tap Update now when prompted, or use Check now to re-open the update.");
                maybePresentUpdate(info);
            });
        });
    }

    private JSONObject fetchManifest(String baseUrl) throws Exception {
        HttpURLConnection connection = null;
        try {
            URL url = new URL(baseUrl + (baseUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
            connection = (HttpURLConnection) url.openConnection();
            connection.setConnectTimeout(7_000);
            connection.setReadTimeout(7_000);
            connection.setUseCaches(false);
            connection.setInstanceFollowRedirects(true);
            connection.setRequestProperty("Cache-Control", "no-cache, no-store");
            connection.setRequestProperty("Pragma", "no-cache");
            connection.setRequestProperty("Accept", "application/json,text/plain,*/*");
            connection.setRequestProperty("User-Agent", "Afileon-Pitlane/" + BuildConfig.VERSION_NAME);

            int response = connection.getResponseCode();
            if (response != HttpURLConnection.HTTP_OK) {
                throw new IllegalStateException("Manifest HTTP " + response);
            }

            StringBuilder body = new StringBuilder();
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(connection.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) body.append(line);
            }

            JSONObject json = new JSONObject(body.toString());
            if (json.optInt("versionCode", 0) <= 0) {
                throw new IllegalStateException("Manifest missing versionCode");
            }
            return json;
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean isAllowedApkUrl(String apkUrl) {
        try {
            Uri uri = Uri.parse(apkUrl);
            String host = uri.getHost();
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || host == null
                    || uri.getPath() == null
                    || !uri.getPath().toLowerCase(Locale.ROOT).endsWith(".apk")) {
                return false;
            }

            for (String allowed : ALLOWED_UPDATE_HOSTS) {
                if (allowed.equalsIgnoreCase(host)) return true;
            }
            return false;
        } catch (Exception e) {
            return false;
        }
    }

    private void maybePresentUpdate(UpdateInfo info) {
        if (isFinishing() || isDestroyed()) return;
        pendingUpdateInfo = info;

        if (webView != null) {
            webView.evaluateJavascript(
                    "(function(){var g=document.getElementById('gps');var t=(g&&g.textContent||'').trim();return /gps\\s+(running|live|tracking)/i.test(t);})()",
                    value -> {
                        if ("true".equalsIgnoreCase(value)) {
                            setUpdateUi(
                                    "available",
                                    "Update available — " + info.versionName,
                                    "A track session appears to be active. Finish the session, then return to Pitlane to install the update.");
                            Toast.makeText(
                                    this,
                                    "Pitlane update found — it will be offered after your track session.",
                                    Toast.LENGTH_LONG).show();
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
            builder.setNegativeButton("Later", (dialog, which) -> {
                updateDialogShowing = false;
                setUpdateUi(
                        "available",
                        "Update available — " + info.versionName,
                        "Update postponed. Tap Check now whenever you are ready to install it.");
            });
        }

        AlertDialog dialog = builder.create();
        dialog.setOnCancelListener(d -> updateDialogShowing = false);
        dialog.show();
    }

    private void downloadAndInstallUpdate(UpdateInfo info) {
        if (updateDownloadRunning) return;
        updateDownloadRunning = true;
        setUpdateUi("downloading", "Downloading " + info.versionName + "…", "Keep Pitlane open while the APK is downloaded.");

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
                if (!directory.exists() && !directory.mkdirs()) {
                    throw new IllegalStateException("Cannot create update directory");
                }

                target = new File(directory, "Afileon-Pitlane-update.apk");
                if (target.exists() && !target.delete()) {
                    throw new IllegalStateException("Cannot replace old update file");
                }

                URL url = new URL(info.apkUrl + (info.apkUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(25_000);
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

                if (target.length() < 100_000) {
                    throw new IllegalStateException("Downloaded file is too small");
                }

                File readyFile = target;
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    setUpdateUi("available", "Update downloaded", "Android will now ask you to approve installation of " + info.versionName + ".");
                    requestPackageInstall(readyFile);
                });
            } catch (Exception e) {
                if (target != null && target.exists()) target.delete();
                String reason = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    setUpdateUi("error", "Update download failed", reason);
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
                .setMessage("Pitlane found the update but could not download the APK. Check your internet connection and try again.")
                .setCancelable(true)
                .setPositiveButton("Retry", (d, w) -> downloadAndInstallUpdate(info))
                .setNegativeButton("Later", null)
                .show();
    }

    private void requestPackageInstall(File apkFile) {
        pendingUpdateFile = apkFile;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !getPackageManager().canRequestPackageInstalls()) {
            waitingForUnknownSourcesPermission = true;
            Intent settingsIntent = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
            startActivity(settingsIntent);
            Toast.makeText(
                    this,
                    "Allow Afiléon Pitlane to install this update, then return to Pitlane.",
                    Toast.LENGTH_LONG).show();
            return;
        }

        File file = pendingUpdateFile;
        pendingUpdateFile = null;
        launchPackageInstaller(file);
    }

    private void launchPackageInstaller(File apkFile) {
        try {
            Uri apkUri = FileProvider.getUriForFile(
                    this,
                    getPackageName() + ".fileprovider",
                    apkFile);
            Intent installIntent = new Intent(Intent.ACTION_VIEW)
                    .setDataAndType(apkUri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(installIntent);
        } catch (Exception e) {
            if (pendingUpdateInfo != null) {
                showUpdateDownloadError(pendingUpdateInfo);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(
            int requestCode,
            @NonNull String[] permissions,
            @NonNull int[] grantResults) {
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
            webView.removeJavascriptInterface("PitlaneNative");
            webView.destroy();
        }
        super.onDestroy();
    }
}
