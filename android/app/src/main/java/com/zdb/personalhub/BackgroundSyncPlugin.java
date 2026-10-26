package com.zdb.personalhub;

import android.Manifest;
import android.app.job.JobInfo;
import android.app.job.JobScheduler;
import android.content.ComponentName;
import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import org.json.JSONObject;

@CapacitorPlugin(name = "BackgroundSync", permissions = @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS }))
public class BackgroundSyncPlugin extends Plugin {
    private interface Action { JSONObject run() throws Exception; }
    private void execute(PluginCall call, Action action) {
        BackgroundSyncStore.EXECUTOR.execute(() -> {
            try { call.resolve(JSObject.fromJSONObject(action.run())); }
            catch (Exception error) {
                android.util.Log.e("PhubBackground", call.getMethodName() + ": " + error.getClass().getSimpleName());
                for (StackTraceElement frame : error.getStackTrace()) if (frame.getClassName().startsWith("com.zdb.personalhub")) android.util.Log.e("PhubBackground", frame.toString());
                call.reject("后台同步操作失败，请检查连接并重试");
            }
        });
    }

    @PluginMethod public void configure(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("notifications", call, "notificationResult");
            return;
        }
        start(call);
    }

    @PermissionCallback private void notificationResult(PluginCall call) {
        if (getPermissionState("notifications") != PermissionState.GRANTED) { call.reject("请允许常驻通知后开启后台同步"); return; }
        start(call);
    }

    private void start(PluginCall call) {
        execute(call, () -> {
            JSONObject config = new JSONObject();
            for (String field : new String[] { "url", "token", "vaultId", "keyId", "serverId" }) config.put(field, call.getString(field));
            BackgroundSyncStore.configure(getContext(), config);
            JobInfo job = new JobInfo.Builder(9242, new ComponentName(getContext(), BackgroundSyncJob.class))
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY).setPeriodic(15 * 60 * 1000L).setPersisted(true).build();
            getContext().getSystemService(JobScheduler.class).schedule(job);
            try {
                Intent service = new Intent(getContext(), BackgroundSyncService.class);
                if (Build.VERSION.SDK_INT >= 26) getContext().startForegroundService(service);
                else getContext().startService(service);
            }
            catch (RuntimeException error) { BackgroundSyncStore.HEALTH.inactive("后台定期同步已启用；回到应用可恢复及时同步"); }
            return new JSONObject();
        });
    }

    @PluginMethod public void stage(PluginCall call) {
        execute(call, () -> { BackgroundSyncStore.stage(getContext(), call.getString("scope"), call.getArray("wires")); return new JSONObject(); });
    }
    @PluginMethod public void push(PluginCall call) {
        execute(call, () -> BackgroundSyncStore.push(getContext(), call.getString("scope"), call.getObject("wire")));
    }
    @PluginMethod public void prepare(PluginCall call) {
        execute(call, () -> BackgroundSyncStore.prepare(getContext(), call.getString("scope"), call.getObject("wire")));
    }
    @PluginMethod public void pull(PluginCall call) {
        execute(call, () -> BackgroundSyncStore.pull(getContext(), call.getString("scope"), call.getData().getLong("cursor")));
    }
    @PluginMethod public void stop(PluginCall call) {
        BackgroundSyncStore.stopped = true;
        getContext().stopService(new Intent(getContext(), BackgroundSyncService.class));
        getContext().getSystemService(JobScheduler.class).cancel(9242);
        execute(call, () -> { BackgroundSyncStore.stop(getContext()); return new JSONObject(); });
    }
    @PluginMethod public void status(PluginCall call) {
        JSObject result = new JSObject();
        result.put("message", BackgroundSyncStore.HEALTH.message(android.os.SystemClock.elapsedRealtime()));
        result.put("pending", BackgroundSyncStore.pendingRecords);
        result.put("cached", BackgroundSyncStore.cachedPages);
        result.put("cachedRecords", BackgroundSyncStore.cachedRecords);
        result.put("cursor", BackgroundSyncStore.cachedCursor);
        result.put("lastSuccessAt", BackgroundSyncStore.HEALTH.lastSuccessWall());
        result.put("batteryExempt", getContext().getSystemService(android.os.PowerManager.class).isIgnoringBatteryOptimizations(getContext().getPackageName()));
        call.resolve(result);
    }
    @PluginMethod public void openBackgroundSettings(PluginCall call) {
        try {
            Intent intent = new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                android.net.Uri.parse("package:" + getContext().getPackageName()));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            call.resolve();
        } catch (RuntimeException error) { call.reject("无法打开系统设置，请手动进入此应用的耗电管理"); }
    }
}
