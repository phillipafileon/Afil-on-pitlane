package uk.co.afileonmotorsport.spark;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONObject;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.KeyStore;
import java.security.SecureRandom;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * HTTPS-only client for SPARK's separate E2B gateway; contains no E2B API key.
 * Pairing secret encrypted with Android Keystore. Never polls in background.
 */
public final class HybridE2B {
    private static final String KEY_ALIAS = "afileon_spark_e2b_pairing_v1";
    private static final String TOKEN_KEY = "gateway_token_encrypted";
    private static final String URL_KEY = "gateway_base_url";
    private final SharedPreferences prefs;
    public HybridE2B(Context context) {
        prefs = context.getSharedPreferences("spark_hybrid_e2b_private", Context.MODE_PRIVATE);
    }
    public String gatewayUrl() { return prefs.getString(URL_KEY, ""); }
    public boolean isConfigured() { return !gatewayUrl().isEmpty() && !token().isEmpty(); }
    public void disconnect() { prefs.edit().remove(URL_KEY).remove(TOKEN_KEY).apply(); }

    private static String normalize(String value) throws Exception {
        URI uri = new URI(value.trim());
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null ||
                uri.getRawUserInfo() != null || uri.getRawQuery() != null || uri.getRawFragment() != null)
            throw new IllegalArgumentException("Use a secure HTTPS gateway address without a password or query.");
        String path = uri.getRawPath();
        if (path != null && !path.isEmpty() && !"/".equals(path))
            throw new IllegalArgumentException("Enter the gateway root URL without a page path.");
        String result = uri.toASCIIString();
        while (result.endsWith("/")) result = result.substring(0, result.length()-1);
        if (result.length() > 256) throw new IllegalArgumentException("Gateway address too long.");
        return result;
    }
    public void configure(String address, String pairingToken) throws Exception {
        String normalized = normalize(address);
        if (!pairingToken.trim().isEmpty()) {
            String token = pairingToken.trim();
            if (token.length() < 32 || token.length() > 200)
                throw new IllegalArgumentException("Pairing token must be a random secret at least 32 characters long.");
            prefs.edit().putString(TOKEN_KEY, encrypt(token)).apply();
        }
        if (token().isEmpty()) throw new IllegalArgumentException("Enter the pairing token the first time.");
        prefs.edit().putString(URL_KEY, normalized).apply();
    }
    private SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(KEY_ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(KEY_ALIAS, null);
    }
    private String encrypt(String plain) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(), new SecureRandom());
        String iv = Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP);
        String encrypted = Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)), Base64.NO_WRAP);
        return iv + ":" + encrypted;
    }
    private String token() {
        try {
            String[] parts = prefs.getString(TOKEN_KEY, "").split(":", -1);
            if (parts.length != 2) return "";
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)));
            return new String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), StandardCharsets.UTF_8);
        } catch (Exception e) { return ""; }
    }
    private JSONObject request(String route, JSONObject body) throws Exception {
        if (!isConfigured()) throw new IllegalStateException("Configure the E2B gateway first.");
        URL url = new URL(gatewayUrl() + route);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(10_000);
            conn.setReadTimeout(95_000);
            conn.setUseCaches(false);
            conn.setRequestMethod(body == null ? "GET" : "POST");
            conn.setRequestProperty("Authorization", "Bearer " + token());
            conn.setRequestProperty("Accept", "application/json");
            if (body != null) {
                byte[] raw = body.toString().getBytes(StandardCharsets.UTF_8);
                if (raw.length > 12_000) throw new IllegalArgumentException("Cloud request too long.");
                conn.setDoOutput(true);
                conn.setRequestProperty("Content-Type", "application/json; charset=utf-8");
                try (OutputStream stream = conn.getOutputStream()) { stream.write(raw); }
            }
            int status = conn.getResponseCode();
            if (status >= 300 && status < 400) throw new IllegalStateException("Gateway redirect refused.");
            InputStream response = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
            if (response == null) throw new IllegalStateException("No gateway response.");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            try (InputStream in = response) {
                byte[] buf = new byte[4096]; int n;
                while ((n = in.read(buf)) != -1) {
                    if (out.size() + n > 20_000) throw new IllegalStateException("Gateway response too large.");
                    out.write(buf, 0, n);
                }
            }
            JSONObject data = new JSONObject(out.toString("UTF-8"));
            if (status >= 400 || !data.optBoolean("ok", false)) {
                if (status == 401) throw new IllegalStateException("Pairing rejected. Check your secret.");
                throw new IllegalStateException("Gateway: " + data.optString("error", "HTTP " + status));
            }
            return data;
        } finally { conn.disconnect(); }
    }
    public JSONObject status() throws Exception { return request("/v1/status", null); }
    public JSONObject previewPython(String code) throws Exception {
        return request("/v1/preview", new JSONObject().put("action", "python").put("code", code));
    }
    public JSONObject execute(String approvalId) throws Exception {
        return request("/v1/execute", new JSONObject().put("approval_id", approvalId).put("confirm", true));
    }
}
