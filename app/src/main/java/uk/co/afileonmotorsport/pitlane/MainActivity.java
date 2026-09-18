package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.annotation.SuppressLint;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
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
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends AppCompatActivity {
    private static final int LOCATION_REQUEST = 77;

    private static final String RAW_UPDATE_MANIFEST =
            "https://raw.githubusercontent.com/phillipafileon/Afil-on-pitlane/main/dist/pitlane-update.json";

    private static final String[] UPDATE_MANIFEST_URLS = new String[] {
            "https://afileonmotorsport.co.uk/pitlane-update.json",
            "https://www.afileonmotorsport.co.uk/pitlane-update.json",
            RAW_UPDATE_MANIFEST,
            "https://am.afileon-motorsport.workers.dev/pitlane-update.json",
            "https://www.afileon-motorsport.workers.dev/pitlane-update.json"
    };

    private static final String[] ALLOWED_UPDATE_HOSTS = new String[] {
            "raw.githubusercontent.com",
            "afileonmotorsport.co.uk",
            "www.afileonmotorsport.co.uk",
            "am.afileon-motorsport.workers.dev",
            "www.afileon-motorsport.workers.dev"
    };

    private static final String RAW_APK_PATH =
            "/phillipafileon/Afil-on-pitlane/main/dist/Afileon-Pitlane.apk";
    private static final long UPDATE_RECHECK_MS = 60_000L;

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
        final String sha256;

        UpdateInfo(int versionCode, String versionName, boolean mandatory,
                   String apkUrl, String notes, String sha256) {
            this.versionCode = versionCode;
            this.versionName = versionName;
            this.mandatory = mandatory;
            this.apkUrl = apkUrl;
            this.notes = notes;
            this.sha256 = sha256 == null ? "" : sha256.trim();
        }
    }

    private final class UpdateBridge {
        @JavascriptInterface
        public void checkForUpdates() {
            runOnUiThread(() -> MainActivity.this.checkForUpdates(true, true));
        }

        @JavascriptInterface
        public void installPendingUpdate() {
            runOnUiThread(() -> {
                if (pendingUpdateFile != null && pendingUpdateFile.exists()) {
                    requestPackageInstall(pendingUpdateFile);
                } else if (pendingUpdateInfo != null) {
                    downloadAndInstallUpdate(pendingUpdateInfo);
                } else {
                    MainActivity.this.checkForUpdates(true, true);
                }
            });
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
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleExternalUri(request.getUrl());
            }

            @Override
            @SuppressWarnings("deprecation")
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                try {
                    return handleExternalUri(Uri.parse(url));
                } catch (Exception ignored) {
                    return false;
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);

                view.evaluateJavascript(
                        "(function(){" +
                        "if(!document.getElementById('pitlane-v031')){var s=document.createElement('script');s.id='pitlane-v031';s.src='https://appassets.androidplatform.net/assets/enhancements_v031.js';document.body.appendChild(s);}" +
                        "function loadFinish045(){if(!document.getElementById('pitlane-finish-v045')){var f=document.createElement('script');f.id='pitlane-finish-v045';f.src='https://appassets.androidplatform.net/assets/pitlane_finish_v045.js';document.body.appendChild(f);}}" +
                        "function loadVehicles044(){if(!document.getElementById('pitlane-vehicles-v044')){var n=document.createElement('script');n.id='pitlane-vehicles-v044';n.src='https://appassets.androidplatform.net/assets/vehicle_catalogue_v044.js';n.onload=loadFinish045;document.body.appendChild(n);}else{loadFinish045();}}" +
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
                handleSmartBack();
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/index.html");
    }

    private boolean handleExternalUri(Uri uri) {
        if (uri == null) return false;
        String host = uri.getHost();
        String scheme = uri.getScheme();
        if ("appassets.androidplatform.net".equalsIgnoreCase(host)) return false;
        if (scheme == null) return false;

        if ("http".equalsIgnoreCase(scheme)
                || "https".equalsIgnoreCase(scheme)
                || "mailto".equalsIgnoreCase(scheme)
                || "tel".equalsIgnoreCase(scheme)) {
            try {
                startActivity(new Intent(Intent.ACTION_VIEW, uri));
                return true;
            } catch (Exception e) {
                Toast.makeText(this, "No app is available to open that link.", Toast.LENGTH_SHORT).show();
                return true;
            }
        }
        return false;
    }

    private void handleSmartBack() {
        if (webView == null) {
            finish();
            return;
        }
        webView.evaluateJavascript(
                "(function(){try{return !!(window.AfileonPitlaneHandleBack&&window.AfileonPitlaneHandleBack());}catch(e){return false;}})()",
                value -> {
                    if ("true".equalsIgnoreCase(value)) return;
                    if (webView.canGoBack()) webView.goBack();
                    else finish();
                });
    }

    @Override
    protected void onResume() {
        super.onResume();

        if (waitingForUnknownSourcesPermission && pendingUpdateFile != null) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getPackageManager().canRequestPackageInstalls()) {
                waitingForUnknownSourcesPermission = false;
                File file = pendingUpdateFile;
                launchPackageInstaller(file);
                return;
            } else {
                setUpdateUi(
                        "available",
                        "Installation permission is still needed",
                        "Tap Install update to open Android's permission screen again.");
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
                "p.innerHTML='<div class=\"eyebrow\">APP UPDATE</div><div style=\"display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap\"><div style=\"min-width:0;flex:1\"><b id=\"pitlaneUpdateTitle\">Checking for updates…</b><p id=\"pitlaneUpdateDetail\" class=\"tiny\" style=\"margin:5px 0 0\"></p></div><div class=\"actions\" style=\"margin-top:0\"><button id=\"pitlaneUpdateInstall\" class=\"btn\" type=\"button\" style=\"display:none\">Install update</button><button id=\"pitlaneUpdateCheck\" class=\"btn alt\" type=\"button\">Check now</button></div></div>';" +
                "var hero=home.querySelector('.hero');if(hero)hero.insertAdjacentElement('afterend',p);else home.prepend(p);" +
                "var c=document.getElementById('pitlaneUpdateCheck');if(c)c.onclick=function(){if(window.PitlaneNative&&PitlaneNative.checkForUpdates){PitlaneNative.checkForUpdates();}};" +
                "var i=document.getElementById('pitlaneUpdateInstall');if(i)i.onclick=function(){if(window.PitlaneNative&&PitlaneNative.installPendingUpdate){PitlaneNative.installPendingUpdate();}};" +
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
        boolean showInstall = "available".equals(state)
                && ((pendingUpdateInfo != null) || (pendingUpdateFile != null && pendingUpdateFile.exists()));

        String js = "(function(){" +
                "var p=document.getElementById('pitlaneUpdatePanel'),t=document.getElementById('pitlaneUpdateTitle'),d=document.getElementById('pitlaneUpdateDetail'),i=document.getElementById('pitlaneUpdateInstall');" +
                "if(p)p.style.borderColor='" + border + "';" +
                "if(t)t.textContent=" + JSONObject.quote(title) + ";" +
                "if(d)d.textContent=" + JSONObject.quote(detail) + ";" +
                "if(i)i.style.display='" + (showInstall ? "inline-block" : "none") + "';" +
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
                String reason = lastError != null ? lastError.getClass().getSimpleName() : "No server response";
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi(
                            "error",
                            "Could not reach the update server",
                            "Pitlane still works offline. Tap Check now to retry. (" + reason + ")");
                    if (userInitiated) {
                        Toast.makeText(this, "Update check failed. Check your internet connection and retry.", Toast.LENGTH_LONG).show();
                    }
                });
                return;
            }

            int latestCode = manifest.optInt("versionCode", 0);
            String latestName = manifest.optString("versionName", String.valueOf(latestCode));
            boolean mandatory = manifest.optBoolean("mandatory", false);
            String apkUrl = manifest.optString("apkUrl", "");
            String notes = manifest.optString("notes", "A newer version of Afiléon Pitlane is available.");
            String sha256 = manifest.optString("sha256", "");
            String finalManifestSource = manifestSource;

            if (latestCode <= 0) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi("error", "Update manifest is invalid", "The update server did not provide a valid version number.");
                });
                return;
            }

            if (latestCode <= BuildConfig.VERSION_CODE) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    pendingUpdateInfo = null;
                    pendingUpdateFile = null;
                    setUpdateUi(
                            "ok",
                            "Pitlane is up to date",
                            "Installed: " + BuildConfig.VERSION_NAME + " • Latest: " + latestName);
                    if (userInitiated) Toast.makeText(this, "Afiléon Pitlane is up to date.", Toast.LENGTH_SHORT).show();
                });
                return;
            }

            if (!isAllowedApkUrl(apkUrl)) {
                runOnUiThread(() -> {
                    updateCheckRunning = false;
                    setUpdateUi(
                            "error",
                            "Update found, but its download address was rejected",
                            "Latest " + latestName + " was found via " + finalManifestSource + ", but the APK is not on an approved Afiléon update path.");
                });
                return;
            }

            UpdateInfo info = new UpdateInfo(latestCode, latestName, mandatory, apkUrl, notes, sha256);
            runOnUiThread(() -> {
                updateCheckRunning = false;
                pendingUpdateInfo = info;
                setUpdateUi(
                        "available",
                        "Update available — " + info.versionName,
                        "Installed: " + BuildConfig.VERSION_NAME + ". Tap Install update or use the update prompt.");
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
            String path = uri.getPath();
            if (!"https".equalsIgnoreCase(uri.getScheme())
                    || host == null
                    || path == null
                    || !path.toLowerCase(Locale.ROOT).endsWith(".apk")) {
                return false;
            }

            boolean hostAllowed = false;
            for (String allowed : ALLOWED_UPDATE_HOSTS) {
                if (allowed.equalsIgnoreCase(host)) {
                    hostAllowed = true;
                    break;
                }
            }
            if (!hostAllowed) return false;

            if ("raw.githubusercontent.com".equalsIgnoreCase(host)) {
                return RAW_APK_PATH.equals(path);
            }
            return true;
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
                                    "A track session appears active. Finish it first, then tap Install update.");
                            Toast.makeText(this, "Pitlane update found — install it after your track session.", Toast.LENGTH_LONG).show();
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
                + "\n\nPitlane will verify the downloaded APK before handing it to Android. Android will still ask you to approve installation.";

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
                        "Update postponed. Tap Install update whenever you are ready.");
            });
        }

        AlertDialog dialog = builder.create();
        dialog.setOnCancelListener(d -> updateDialogShowing = false);
        dialog.show();
    }

    private void downloadAndInstallUpdate(UpdateInfo info) {
        if (updateDownloadRunning) return;
        updateDownloadRunning = true;
        setUpdateUi("downloading", "Downloading " + info.versionName + "…", "Pitlane will verify the APK before installation.");

        downloadDialog = new AlertDialog.Builder(this)
                .setTitle("Downloading Pitlane update")
                .setMessage("Please keep Pitlane open. The Android installer will appear automatically when the verified download is ready.")
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
                    throw new IllegalStateException("Cannot replace the previous update file");
                }

                URL url = new URL(info.apkUrl + (info.apkUrl.contains("?") ? "&" : "?") + "t=" + System.currentTimeMillis());
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(10_000);
                connection.setReadTimeout(30_000);
                connection.setUseCaches(false);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Cache-Control", "no-cache");
                connection.setRequestProperty("User-Agent", "Afileon-Pitlane-Updater/" + BuildConfig.VERSION_NAME);

                if (connection.getResponseCode() != HttpURLConnection.HTTP_OK) {
                    throw new IllegalStateException("Download returned HTTP " + connection.getResponseCode());
                }

                try (InputStream input = new BufferedInputStream(connection.getInputStream());
                     FileOutputStream output = new FileOutputStream(target)) {
                    byte[] buffer = new byte[32 * 1024];
                    int read;
                    while ((read = input.read(buffer)) != -1) output.write(buffer, 0, read);
                    output.flush();
                }

                if (target.length() < 100_000) {
                    throw new IllegalStateException("Downloaded APK is unexpectedly small");
                }

                validateDownloadedApk(target, info);

                File readyFile = target;
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    pendingUpdateFile = readyFile;
                    setUpdateUi(
                            "available",
                            "Update verified and ready",
                            "Android will now ask you to approve installation of " + info.versionName + ".");
                    requestPackageInstall(readyFile);
                });
            } catch (Exception e) {
                if (target != null && target.exists()) target.delete();
                String reason = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
                runOnUiThread(() -> {
                    if (downloadDialog != null && downloadDialog.isShowing()) downloadDialog.dismiss();
                    updateDownloadRunning = false;
                    pendingUpdateFile = null;
                    setUpdateUi("error", "Update download or verification failed", reason);
                    showUpdateDownloadError(info, reason);
                });
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }

    private void validateDownloadedApk(File apkFile, UpdateInfo info) throws Exception {
        if (!info.sha256.isEmpty()) {
            String actualSha = sha256(apkFile);
            if (!actualSha.equalsIgnoreCase(info.sha256)) {
                throw new SecurityException("APK checksum does not match the update manifest");
            }
        }

        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? PackageManager.GET_SIGNING_CERTIFICATES
                : PackageManager.GET_SIGNATURES;

        PackageManager pm = getPackageManager();
        PackageInfo archive = pm.getPackageArchiveInfo(apkFile.getAbsolutePath(), flags);
        if (archive == null) throw new SecurityException("Downloaded file is not a valid Android package");
        if (!getPackageName().equals(archive.packageName)) {
            throw new SecurityException("Downloaded package name does not match Afiléon Pitlane");
        }

        long archiveCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P
                ? archive.getLongVersionCode()
                : archive.versionCode;
        if (archiveCode != info.versionCode || archiveCode <= BuildConfig.VERSION_CODE) {
            throw new SecurityException("Downloaded APK version does not match the advertised update");
        }

        PackageInfo installed = pm.getPackageInfo(getPackageName(), flags);
        String installedSigner = signerSha256(installed);
        String archiveSigner = signerSha256(archive);
        if (installedSigner.isEmpty() || archiveSigner.isEmpty() || !installedSigner.equalsIgnoreCase(archiveSigner)) {
            throw new SecurityException("Update signing identity does not match the installed Pitlane app");
        }
    }

    private static String signerSha256(PackageInfo info) throws Exception {
        Signature[] signatures;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && info.signingInfo != null) {
            signatures = info.signingInfo.getApkContentsSigners();
        } else {
            signatures = info.signatures;
        }
        if (signatures == null || signatures.length == 0) return "";
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return toHex(digest.digest(signatures[0].toByteArray()));
    }

    private static String sha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[32 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) digest.update(buffer, 0, read);
        }
        return toHex(digest.digest());
    }

    private static String toHex(byte[] bytes) {
        StringBuilder out = new StringBuilder(bytes.length * 2);
        for (byte b : bytes) out.append(String.format(Locale.ROOT, "%02x", b & 0xff));
        return out.toString();
    }

    private void showUpdateDownloadError(UpdateInfo info, String reason) {
        if (isFinishing() || isDestroyed()) return;
        new AlertDialog.Builder(this)
                .setTitle("Update could not be installed")
                .setMessage("Pitlane stopped the update before installation.\n\n" + reason + "\n\nCheck your connection and try again. If the message mentions signing identity, install the stable-signed Pitlane build manually once.")
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
                    "Allow Afiléon Pitlane to install updates, then return to Pitlane.",
                    Toast.LENGTH_LONG).show();
            return;
        }

        waitingForUnknownSourcesPermission = false;
        launchPackageInstaller(apkFile);
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
            String reason = e.getMessage() != null ? e.getMessage() : "Android could not open the package installer";
            setUpdateUi("error", "Could not open Android installer", reason);
            if (pendingUpdateInfo != null) showUpdateDownloadError(pendingUpdateInfo, reason);
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
            if (!granted) {
                Toast.makeText(this, "Precise location is required for GPS lap timing.", Toast.LENGTH_LONG).show();
            }
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
