package uk.co.afileonmotorsport.pitlane;

import android.Manifest;
import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.BluetoothSocket;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@SuppressLint("MissingPermission")
public final class PitlaneBluetooth {
    private static final int REQUEST_BLUETOOTH = 79;
    private static final UUID SPP = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");
    private static final UUID NUS = UUID.fromString("6e400001-b5a5-f393-b3ae-8c2b5e9f0ee4");
    private static final UUID FFE0 = UUID.fromString("0000ffe0-0000-1000-8000-00805f9b34fb");
    private static final UUID FFF0 = UUID.fromString("0000fff0-0000-1000-8000-00805f9b34fb");
    private static final UUID ELM_BLE = UUID.fromString("e7810a71-73ae-499d-8c15-faa9aef0c3f2");

    private final AppCompatActivity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final BluetoothAdapter adapter;
    private BluetoothLeScanner scanner;
    private boolean scanning;
    private final Set<String> seen = new HashSet<>();
    private final Map<String, Link> links = new HashMap<>();
    private Runnable afterPermission;

    PitlaneBluetooth(AppCompatActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        BluetoothManager manager = (BluetoothManager) activity.getSystemService(Context.BLUETOOTH_SERVICE);
        this.adapter = manager == null ? null : manager.getAdapter();
    }

    @JavascriptInterface
    public boolean isSupported() {
        return adapter != null;
    }

    @JavascriptInterface
    public void scan(String kind) {
        main.post(() -> withPermission(this::startScan));
    }

    @JavascriptInterface
    public void stopScan() {
        main.post(() -> stopScanInternal(true));
    }

    @JavascriptInterface
    public void connect(String kind, String address, String transport) {
        main.post(() -> withPermission(() -> open(kind, address, transport)));
    }

    @JavascriptInterface
    public void disconnect(String kind) {
        main.post(() -> {
            Link link = links.remove(kind);
            if (link != null) link.close();
            Map<String,Object> e = new HashMap<>();
            e.put("event","state"); e.put("kind",kind); e.put("state","disconnected");
            emit(e);
        });
    }

    public boolean onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQUEST_BLUETOOTH) return false;
        boolean ok = grantResults.length > 0;
        for (int r : grantResults) ok &= r == PackageManager.PERMISSION_GRANTED;
        Runnable next = afterPermission;
        afterPermission = null;
        if (ok && next != null) main.post(next);
        else {
            Map<String,Object> e = new HashMap<>();
            e.put("event","state"); e.put("state","error");
            e.put("message","Bluetooth permission was declined. Allow Nearby devices for Pitlane in Android settings.");
            emit(e);
        }
        return true;
    }

    public void shutdown() {
        stopScanInternal(false);
        for (Link l : new ArrayList<>(links.values())) l.close();
        links.clear();
    }

    private void withPermission(Runnable then) {
        String[] need = Build.VERSION.SDK_INT >= 31
                ? new String[]{Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT}
                : new String[]{Manifest.permission.ACCESS_FINE_LOCATION};
        List<String> missing = new ArrayList<>();
        for (String p : need) {
            if (ContextCompat.checkSelfPermission(activity, p) != PackageManager.PERMISSION_GRANTED) missing.add(p);
        }
        if (missing.isEmpty()) then.run();
        else {
            afterPermission = then;
            ActivityCompat.requestPermissions(activity, missing.toArray(new String[0]), REQUEST_BLUETOOTH);
        }
    }

    private void startScan() {
        if (adapter == null || !adapter.isEnabled()) {
            stateError(null, "Turn Bluetooth on, then try again.");
            return;
        }
        stopScanInternal(false);
        seen.clear();
        try {
            for (BluetoothDevice d : adapter.getBondedDevices()) {
                if (!seen.add(d.getAddress())) continue;
                Map<String,Object> e = new HashMap<>();
                e.put("event","device");
                e.put("name", d.getName() == null ? d.getAddress() : d.getName());
                e.put("address", d.getAddress());
                e.put("paired", true);
                e.put("transport", d.getType() == BluetoothDevice.DEVICE_TYPE_LE ? "ble" : "classic");
                emit(e);
            }
            scanner = adapter.getBluetoothLeScanner();
            if (scanner != null) {
                scanner.startScan(scanCallback);
                scanning = true;
                main.postDelayed(() -> stopScanInternal(true), 10_000L);
            } else {
                emitEvent("scanDone");
            }
        } catch (Exception e) {
            scanning = false;
            stateError(null, "Bluetooth scan could not start.");
        }
    }

    private void stopScanInternal(boolean announce) {
        if (scanning && scanner != null) {
            try { scanner.stopScan(scanCallback); } catch (Exception ignored) {}
        }
        scanning = false;
        if (announce) emitEvent("scanDone");
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice d = result.getDevice();
            String name = result.getScanRecord() != null ? result.getScanRecord().getDeviceName() : null;
            if (name == null) {
                try { name = d.getName(); } catch (Exception ignored) {}
            }
            if (name == null || !seen.add(d.getAddress())) return;
            Map<String,Object> e = new HashMap<>();
            e.put("event","device"); e.put("name",name); e.put("address",d.getAddress());
            e.put("paired",false); e.put("transport","ble"); e.put("rssi",result.getRssi());
            emit(e);
        }

        @Override
        public void onScanFailed(int errorCode) {
            scanning = false;
            stateError(null, "Bluetooth scan failed (code " + errorCode + ").");
        }
    };

    private void open(String kind, String address, String transport) {
        if (adapter == null) return;
        stopScanInternal(false);
        Link old = links.remove(kind);
        if (old != null) old.close();

        final BluetoothDevice device;
        try { device = adapter.getRemoteDevice(address); }
        catch (Exception e) { stateError(kind, "Invalid device address."); return; }

        String name;
        try { name = device.getName(); } catch (Exception e) { name = null; }
        if (name == null) name = address;

        Map<String,Object> connecting = new HashMap<>();
        connecting.put("event","state"); connecting.put("kind",kind); connecting.put("state","connecting"); connecting.put("name",name);
        emit(connecting);

        Link link = "ble".equalsIgnoreCase(transport) ? new BleLink(device) : new SppLink(device);
        links.put(kind, link);
        String finalName = name;
        link.onClose = msg -> main.post(() -> {
            if (links.get(kind) == link) links.remove(kind);
            if (msg != null && !msg.isEmpty()) stateError(kind, msg);
        });
        link.open(() -> {
            if ("obd".equals(kind)) startObd(link); else startGps(link);
            Map<String,Object> connected = new HashMap<>();
            connected.put("event","state"); connected.put("kind",kind); connected.put("state","connected"); connected.put("name",finalName);
            emit(connected);
        });
    }

    private void startGps(Link link) {
        StringBuilder buffer = new StringBuilder();
        AtomicBoolean sawNmea = new AtomicBoolean(false);
        link.onData = bytes -> {
            synchronized (buffer) {
                buffer.append(new String(bytes, StandardCharsets.ISO_8859_1));
                int i = buffer.lastIndexOf("\n");
                if (i >= 0) {
                    String chunk = buffer.substring(0, i + 1);
                    buffer.delete(0, i + 1);
                    if (chunk.contains("$G") || chunk.contains("$P")) sawNmea.set(true);
                    js("window.PitlaneSensors&&PitlaneSensors.feedNMEA(" + JSONObject.quote(chunk) + ")");
                }
                if (buffer.length() > 4096) buffer.setLength(0);
            }
        };
        main.postDelayed(() -> {
            if (!link.closed && !sawNmea.get()) {
                Map<String,Object> e = new HashMap<>();
                e.put("event","state"); e.put("kind","gps"); e.put("state","warn");
                e.put("message","Connected, but no NMEA data received. This receiver may use a proprietary protocol that Pitlane does not read yet.");
                emit(e);
            }
        }, 10_000L);
    }

    private void startObd(Link link) {
        LinkedBlockingQueue<String> queue = new LinkedBlockingQueue<>();
        StringBuilder acc = new StringBuilder();
        link.onData = bytes -> {
            synchronized (acc) {
                acc.append(new String(bytes, StandardCharsets.ISO_8859_1));
                int i;
                while ((i = acc.indexOf(">")) >= 0) {
                    queue.offer(acc.substring(0, i));
                    acc.delete(0, i + 1);
                }
            }
        };

        Thread t = new Thread(() -> {
            try {
                String[] init = {"ATZ","ATE0","ATL0","ATS0","ATH0","ATSP0"};
                for (String c : init) obdCmd(link, queue, c, 2500);
                obdCmd(link, queue, "0100", 8000);
                int fails = 0;
                Pattern rpmP = Pattern.compile("410C([0-9A-F]{4})");
                Pattern thrP = Pattern.compile("4111([0-9A-F]{2})");
                while (!link.closed) {
                    Double rpm = null, thr = null;
                    Matcher r = rpmP.matcher(obdCmd(link, queue, "010C", 1500));
                    if (r.find()) rpm = Integer.parseInt(r.group(1), 16) / 4.0;
                    Matcher h = thrP.matcher(obdCmd(link, queue, "0111", 1500));
                    if (h.find()) thr = Integer.parseInt(h.group(1), 16) * 100.0 / 255.0;
                    if (rpm != null || thr != null) {
                        fails = 0;
                        js("window.PitlaneSensors&&PitlaneSensors.feedObd(" + (rpm == null ? "null" : rpm) + "," + (thr == null ? "null" : thr) + ")");
                    } else if (++fails > 10) {
                        link.failWith("The OBD-II adapter stopped answering. Is the ignition on?");
                        return;
                    }
                }
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            } catch (Exception e) {
                link.failWith("The OBD-II connection stopped unexpectedly.");
            }
        }, "pitlane-obd");
        t.setDaemon(true);
        t.start();
    }

    private String obdCmd(Link link, LinkedBlockingQueue<String> queue, String cmd, long timeoutMs) throws InterruptedException {
        queue.clear();
        link.write((cmd + "\r").getBytes(StandardCharsets.US_ASCII));
        String r = queue.poll(timeoutMs, TimeUnit.MILLISECONDS);
        return r == null ? "" : r.replaceAll("\\s", "").toUpperCase();
    }

    private abstract class Link {
        final BluetoothDevice device;
        volatile Consumer<byte[]> onData = bytes -> {};
        volatile Consumer<String> onClose = msg -> {};
        volatile boolean closed;

        Link(BluetoothDevice device) { this.device = device; }
        abstract void open(Runnable onReady);
        abstract void write(byte[] bytes);
        abstract void release();

        void close() {
            closed = true;
            release();
        }

        void failWith(String msg) {
            if (closed) return;
            closed = true;
            release();
            onClose.accept(msg);
        }
    }

    private final class SppLink extends Link {
        BluetoothSocket socket;
        OutputStream out;

        SppLink(BluetoothDevice d) { super(d); }

        @Override
        void open(Runnable onReady) {
            Thread t = new Thread(() -> {
                try {
                    if (adapter != null) adapter.cancelDiscovery();
                    BluetoothSocket s = device.createRfcommSocketToServiceRecord(SPP);
                    socket = s;
                    try {
                        s.connect();
                    } catch (Exception first) {
                        try { s.close(); } catch (Exception ignored) {}
                        s = device.createInsecureRfcommSocketToServiceRecord(SPP);
                        socket = s;
                        s.connect();
                    }
                    out = s.getOutputStream();
                    onReady.run();
                    InputStream in = s.getInputStream();
                    byte[] buf = new byte[1024];
                    while (!closed) {
                        int n = in.read(buf);
                        if (n < 0) break;
                        onData.accept(Arrays.copyOf(buf, n));
                    }
                    failWith("Connection closed by the device.");
                } catch (Exception e) {
                    if (!closed) failWith("Could not connect. Make sure the device is on and paired in Android Bluetooth settings.");
                }
            }, "pitlane-spp");
            t.setDaemon(true);
            t.start();
        }

        @Override
        void write(byte[] bytes) {
            try {
                if (out != null) { out.write(bytes); out.flush(); }
            } catch (Exception ignored) {}
        }

        @Override
        void release() {
            try { if (socket != null) socket.close(); } catch (Exception ignored) {}
        }
    }

    private final class BleLink extends Link {
        BluetoothGatt gatt;
        BluetoothGattCharacteristic rx;
        BluetoothGattCharacteristic tx;
        Runnable ready;

        BleLink(BluetoothDevice d) { super(d); }

        @Override
        void open(Runnable onReady) {
            ready = onReady;
            main.post(() -> gatt = device.connectGatt(activity, false, callback, BluetoothDevice.TRANSPORT_LE));
            main.postDelayed(() -> {
                if (ready != null && !closed) failWith("Timed out connecting to the device.");
            }, 15_000L);
        }

        @Override
        void write(byte[] bytes) {
            BluetoothGatt g = gatt;
            BluetoothGattCharacteristic c = tx;
            if (g == null || c == null) return;
            boolean noResponse = (c.getProperties() & BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE) != 0;
            int type = noResponse ? BluetoothGattCharacteristic.WRITE_TYPE_NO_RESPONSE : BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT;
            for (int off = 0; off < bytes.length; off += 20) {
                byte[] part = Arrays.copyOfRange(bytes, off, Math.min(bytes.length, off + 20));
                if (Build.VERSION.SDK_INT >= 33) {
                    g.writeCharacteristic(c, part, type);
                } else {
                    c.setWriteType(type);
                    c.setValue(part);
                    g.writeCharacteristic(c);
                }
                if (!noResponse) {
                    try { Thread.sleep(25); } catch (InterruptedException e) { Thread.currentThread().interrupt(); return; }
                }
            }
        }

        @Override
        void release() {
            ready = null;
            try {
                if (gatt != null) { gatt.disconnect(); gatt.close(); }
            } catch (Exception ignored) {}
        }

        private boolean pickCharacteristics(BluetoothGatt g) {
            List<UUID> preferred = Arrays.asList(NUS, FFE0, FFF0, ELM_BLE);
            List<android.bluetooth.BluetoothGattService> services = new ArrayList<>(g.getServices());
            services.sort(Comparator.comparingInt(s -> {
                int i = preferred.indexOf(s.getUuid());
                return i < 0 ? 99 : i;
            }));
            for (android.bluetooth.BluetoothGattService s : services) {
                String u = s.getUuid().toString();
                if (u.startsWith("00001800") || u.startsWith("00001801") || u.startsWith("0000180a")) continue;
                BluetoothGattCharacteristic r = null, t = null;
                for (BluetoothGattCharacteristic c : s.getCharacteristics()) {
                    int p = c.getProperties();
                    if (r == null && (p & (BluetoothGattCharacteristic.PROPERTY_NOTIFY | BluetoothGattCharacteristic.PROPERTY_INDICATE)) != 0) r = c;
                    if (t == null && (p & (BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_WRITE_NO_RESPONSE)) != 0) t = c;
                }
                if (r != null) {
                    rx = r;
                    tx = t;
                    return true;
                }
            }
            return false;
        }

        private final BluetoothGattCallback callback = new BluetoothGattCallback() {
            @Override
            public void onConnectionStateChange(BluetoothGatt g, int status, int newState) {
                if (newState == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    g.discoverServices();
                } else if (newState == BluetoothProfile.STATE_DISCONNECTED && !closed) {
                    failWith(ready != null ? "Could not connect (status " + status + ")." : "Bluetooth device disconnected.");
                }
            }

            @Override
            public void onServicesDiscovered(BluetoothGatt g, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS || !pickCharacteristics(g)) {
                    failWith("This device has no serial-style Bluetooth service Pitlane can read.");
                    return;
                }
                BluetoothGattCharacteristic c = rx;
                g.setCharacteristicNotification(c, true);
                BluetoothGattDescriptor d = c.getDescriptor(CCCD);
                if (d == null) {
                    Runnable r = ready; ready = null; if (r != null) r.run();
                    return;
                }
                byte[] v = (c.getProperties() & BluetoothGattCharacteristic.PROPERTY_NOTIFY) != 0
                        ? BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE
                        : BluetoothGattDescriptor.ENABLE_INDICATION_VALUE;
                if (Build.VERSION.SDK_INT >= 33) g.writeDescriptor(d, v);
                else { d.setValue(v); g.writeDescriptor(d); }
            }

            @Override
            public void onDescriptorWrite(BluetoothGatt g, BluetoothGattDescriptor d, int status) {
                if (status != BluetoothGatt.GATT_SUCCESS) {
                    failWith("Could not subscribe to the device's data.");
                    return;
                }
                Runnable r = ready; ready = null; if (r != null) r.run();
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c, byte[] value) {
                onData.accept(value);
            }

            @Override
            public void onCharacteristicChanged(BluetoothGatt g, BluetoothGattCharacteristic c) {
                if (Build.VERSION.SDK_INT < 33 && c.getValue() != null) onData.accept(c.getValue());
            }
        };
    }

    private void emitEvent(String event) {
        Map<String,Object> e = new HashMap<>();
        e.put("event",event);
        emit(e);
    }

    private void stateError(String kind, String message) {
        Map<String,Object> e = new HashMap<>();
        e.put("event","state");
        if (kind != null) e.put("kind",kind);
        e.put("state","error");
        e.put("message",message);
        emit(e);
    }

    private void emit(Map<String,Object> map) {
        js("window.PitlaneBTEvent&&PitlaneBTEvent(" + new JSONObject(map).toString() + ")");
    }

    private void js(String code) {
        webView.post(() -> webView.evaluateJavascript(code, null));
    }
}
