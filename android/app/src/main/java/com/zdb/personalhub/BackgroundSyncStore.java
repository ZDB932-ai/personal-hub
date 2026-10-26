package com.zdb.personalhub;

import android.content.Context;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.net.URL;
import javax.net.ssl.HttpsURLConnection;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONArray;
import org.json.JSONObject;

final class BackgroundSyncStore {
    static final ScheduledExecutorService EXECUTOR = Executors.newSingleThreadScheduledExecutor();
    static volatile boolean stopped = true;
    static final BackgroundSyncHealth HEALTH = new BackgroundSyncHealth();
    static volatile int cachedRecords;
    static volatile int cachedPages;
    static volatile int pendingRecords;
    static volatile long cachedCursor;
    static final int LIMIT = 12 * 1024 * 1024;
    private static final String ALIAS = "personal-hub-background-sync-v1";
    private static JSONObject state;

    static SecretKey key() throws Exception {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (!store.containsAlias(ALIAS)) {
            KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).setKeySize(256).build());
            generator.generateKey();
        }
        return (SecretKey) store.getKey(ALIAS, null);
    }

    static JSONObject load(Context context) throws Exception {
        if (state != null) return state;
        String saved = context.getSharedPreferences("background-sync", Context.MODE_PRIVATE).getString("sealed", null);
        if (saved == null) return state = new JSONObject();
        JSONObject sealed = new JSONObject(saved);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(), new GCMParameterSpec(128, Base64.decode(sealed.getString("iv"), Base64.NO_WRAP)));
        return state = new JSONObject(new String(cipher.doFinal(Base64.decode(sealed.getString("data"), Base64.NO_WRAP)), StandardCharsets.UTF_8));
    }

    static void save(Context context) throws Exception {
        byte[] bytes = state.toString().getBytes(StandardCharsets.UTF_8);
        if (bytes.length > LIMIT) throw new Exception("后台缓存已满，请打开并解锁应用");
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        JSONObject sealed = new JSONObject().put("iv", Base64.encodeToString(cipher.getIV(), Base64.NO_WRAP))
            .put("data", Base64.encodeToString(cipher.doFinal(bytes), Base64.NO_WRAP));
        if (!context.getSharedPreferences("background-sync", Context.MODE_PRIVATE).edit().putString("sealed", sealed.toString()).commit()) throw new Exception("后台同步保存失败");
        updateSummary();
    }

    static void updateSummary() throws Exception {
        JSONArray pages = state.optJSONArray("pages"), outbox = state.optJSONArray("outbox");
        int records = 0, pending = 0;
        if (pages != null) for (int i = 0; i < pages.length(); i++) records += pages.getJSONObject(i).getJSONObject("data").getJSONArray("records").length();
        if (outbox != null) for (int i = 0; i < outbox.length(); i++) if (!outbox.getJSONObject(i).has("receipt")) pending++;
        cachedRecords = records; cachedPages = pages == null ? 0 : pages.length();
        pendingRecords = pending; cachedCursor = state.optLong("cursor", 0);
    }

    static String scope(JSONObject config) throws Exception {
        return new JSONArray().put(config.getString("serverId")).put(config.getString("vaultId")).put(config.getString("keyId")).toString();
    }

    static JSONObject config(Context context, String expected) throws Exception {
        JSONObject config = load(context).getJSONObject("config");
        if (stopped || !load(context).optBoolean("enabled") || !scope(config).equals(expected)) throw new Exception("后台同步会话已暂停或变化");
        return config;
    }

    static void configure(Context context, JSONObject next) throws Exception {
        URL url = new URL(next.getString("url"));
        if (!url.getProtocol().equals("https") || !url.getPath().isEmpty() || url.getQuery() != null || url.getUserInfo() != null || url.getRef() != null) throw new Exception("后台同步要求 HTTPS 服务地址");
        if (!next.getString("token").matches("[A-Za-z0-9_-]{32,256}")) throw new Exception("同步凭据无效");
        JSONObject old = load(context).optJSONObject("config");
        if (old == null || !scope(old).equals(scope(next)) || !old.getString("url").equals(next.getString("url"))) {
            state = new JSONObject().put("outbox", new JSONArray()).put("pages", new JSONArray()).put("cursor", 0);
            HEALTH.reset();
        }
        state.put("config", next).put("enabled", true);
        save(context);
        stopped = false;
        HEALTH.waiting();
    }

    static JSONObject request(JSONObject config, String path, JSONObject body) throws Exception {
        HttpsURLConnection connection = (HttpsURLConnection) new URL(config.getString("url") + "/v1/" + path).openConnection();
        connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(15000);
        connection.setReadTimeout(15000);
        connection.setRequestMethod("POST");
        connection.setRequestProperty("Authorization", "Bearer " + config.getString("token"));
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setDoOutput(true);
        try {
            try (java.io.OutputStream output = connection.getOutputStream()) { output.write(body.toString().getBytes(StandardCharsets.UTF_8)); }
            int code = connection.getResponseCode();
            if (code == 401 || code == 403) { stopped = true; throw new Exception("同步凭据失效，请打开应用重新登录"); }
            if (code != 200) throw new Exception("同步服务暂不可用（" + code + "）");
            try (InputStream input = connection.getInputStream(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) {
                    if (output.size() + count > LIMIT / 2) throw new Exception("同步响应过大，请打开应用处理");
                    output.write(buffer, 0, count);
                }
                return new JSONObject(output.toString("UTF-8"));
            }
        } finally { connection.disconnect(); }
    }

    static JSONObject space(JSONObject config) throws Exception {
        return new JSONObject().put("vaultId", config.getString("vaultId")).put("keyId", config.getString("keyId"));
    }

    static void stage(Context context, String expected, JSONArray wires) throws Exception {
        JSONObject config = config(context, expected);
        JSONArray previous = state.getJSONArray("outbox"), next = new JSONArray();
        if (wires.length() > 1000) throw new Exception("待同步记录过多，请先完成前台同步");
        for (int i = 0; i < wires.length(); i++) {
            JSONObject wire = wires.getJSONObject(i);
            if (!wire.getString("vaultId").equals(config.getString("vaultId")) || !wire.getString("keyId").equals(config.getString("keyId"))) throw new Exception("同步数据空间不匹配");
            JSONObject item = new JSONObject().put("wire", wire);
            for (int j = 0; j < previous.length(); j++) {
                JSONObject existing = previous.getJSONObject(j);
                if (existing.getJSONObject("wire").getString("operationId").equals(wire.getString("operationId"))) { item = existing; break; }
            }
            next.put(item);
        }
        if (next.toString().length() > LIMIT / 3) throw new Exception("待上传密文过多，请先完成前台同步");
        state.put("outbox", next);
        save(context);
    }

    static JSONObject send(Context context, JSONObject config, JSONObject item) throws Exception {
        if (item.has("receipt")) return item.getJSONObject("receipt");
        JSONObject receipt = request(config, "push", new JSONObject().put("space", space(config)).put("wire", item.getJSONObject("wire")));
        if (stopped) throw new Exception("后台同步已暂停");
        if (!receipt.getString("operationId").equals(item.getJSONObject("wire").getString("operationId"))) throw new Exception("同步回执无效");
        item.put("receipt", receipt);
        save(context);
        return receipt;
    }

    static JSONObject prepare(Context context, String expected, JSONObject wire) throws Exception {
        JSONObject config = config(context, expected);
        if (!wire.getString("vaultId").equals(config.getString("vaultId")) || !wire.getString("keyId").equals(config.getString("keyId"))) throw new Exception("同步空间不匹配");
        JSONArray outbox = state.getJSONArray("outbox");
        for (int i = 0; i < outbox.length(); i++) {
            JSONObject item = outbox.getJSONObject(i);
            if (item.getJSONObject("wire").getString("operationId").equals(wire.getString("operationId"))) return item.getJSONObject("wire");
        }
        JSONObject item = new JSONObject().put("wire", wire);
        outbox.put(item); save(context);
        return wire;
    }

    static JSONObject push(Context context, String expected, JSONObject wire) throws Exception {
        JSONObject config = config(context, expected);
        prepare(context, expected, wire);
        JSONArray outbox = state.getJSONArray("outbox");
        for (int i = 0; i < outbox.length(); i++) {
            JSONObject item = outbox.getJSONObject(i);
            if (item.getJSONObject("wire").getString("operationId").equals(wire.getString("operationId"))) return send(context, config, item);
        }
        throw new Exception("待上传记录不存在");
    }

    static JSONObject fetch(Context context, JSONObject config, long cursor) throws Exception {
        JSONObject result = request(config, "pull", new JSONObject().put("space", space(config)).put("cursor", cursor));
        JSONArray records = result.getJSONArray("records");
        if (result.getLong("cursor") != cursor + records.length() || records.length() > 500 || (result.getBoolean("hasMore") && records.length() == 0)) throw new Exception("同步分页无效");
        return result;
    }

    static JSONObject pull(Context context, String expected, long cursor) throws Exception {
        JSONObject config = config(context, expected);
        if (cursor < 0) throw new Exception("同步游标无效");
        JSONArray pages = state.getJSONArray("pages"), kept = new JSONArray();
        JSONObject found = null;
        for (int i = 0; i < pages.length(); i++) {
            JSONObject page = pages.getJSONObject(i);
            if (page.getJSONObject("data").getLong("cursor") > cursor) kept.put(page);
            if (page.getLong("from") == cursor) found = page.getJSONObject("data");
        }
        state.put("pages", kept);
        if (cursor > state.getLong("cursor")) state.put("cursor", cursor);
        save(context);
        if (found != null) return found;
        return fetch(context, config, cursor);
    }

    static void tick(Context context) throws Exception {
        if (stopped) return;
        JSONObject data = load(context);
        if (!data.optBoolean("enabled")) return;
        HEALTH.begin(android.os.SystemClock.elapsedRealtime());
        JSONObject config = data.getJSONObject("config");
        JSONObject info = request(config, "connect", new JSONObject().put("space", space(config)));
        if (!info.getString("serverId").equals(config.getString("serverId"))) { stopped = true; throw new Exception("服务器身份变化，请重新连接"); }
        JSONArray outbox = data.getJSONArray("outbox");
        for (int i = 0; i < outbox.length() && !stopped; i++) {
            JSONObject item = outbox.getJSONObject(i);
            if (!item.has("receipt")) { send(context, config, item); break; }
        }
        if (stopped) return;
        JSONArray pages = data.getJSONArray("pages");
        if (pages.toString().length() > LIMIT / 3) { HEALTH.failure("缓存待合并，请打开并解锁应用"); return; }
        long cursor = data.getLong("cursor");
        JSONObject page = fetch(context, config, cursor);
        if (stopped) return;
        if (page.getJSONArray("records").length() > 0) {
            pages.put(new JSONObject().put("from", cursor).put("data", page));
            data.put("cursor", page.getLong("cursor"));
            save(context);
        }
        if ((context.getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            android.util.Log.i("PhubBackgroundLoop", "pull cursor=" + cursor + " next=" + page.getLong("cursor") + " count=" + page.getJSONArray("records").length());
            JSONArray received = page.getJSONArray("records");
            for (int i = 0; i < received.length(); i++) android.util.Log.i("PhubBackgroundLoop", "cached operation=" + received.getJSONObject(i).getJSONObject("wire").getString("operationId"));
        }
        HEALTH.success(android.os.SystemClock.elapsedRealtime(), System.currentTimeMillis());
    }

    static void stop(Context context) throws Exception {
        stopped = true;
        state = new JSONObject();
        if (!context.getSharedPreferences("background-sync", Context.MODE_PRIVATE).edit().clear().commit()) throw new Exception("后台凭据移除失败");
        updateSummary(); HEALTH.reset();
    }
}
