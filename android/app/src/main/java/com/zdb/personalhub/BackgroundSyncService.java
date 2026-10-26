package com.zdb.personalhub;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.os.IBinder;
import android.os.PowerManager;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

public class BackgroundSyncService extends Service {
    private ScheduledFuture<?> timer;
    private final ScheduledExecutorService scheduler = Executors.newSingleThreadScheduledExecutor();
    private BackgroundSyncRunner runner;
    private PowerManager.WakeLock wake;
    private boolean timedOut;
    private static final int ID = 9241;
    private static final String CHANNEL = "personal-hub-background-sync";

    private Notification notification() {
        PendingIntent open = PendingIntent.getActivity(this, 0, new Intent(this, MainActivity.class), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent pause = PendingIntent.getService(this, 1, new Intent(this, BackgroundSyncService.class).setAction("pause"), PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification.Builder builder = android.os.Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(this, CHANNEL) : new Notification.Builder(this);
        long lastCheck = BackgroundSyncStore.HEALTH.lastSuccessWall();
        String detail = BackgroundSyncStore.HEALTH.message(android.os.SystemClock.elapsedRealtime());
        if (lastCheck > 0) detail += " · 最近成功 " + new java.text.SimpleDateFormat("HH:mm:ss", java.util.Locale.CHINA).format(new java.util.Date(lastCheck));
        String counts = "待合并 " + BackgroundSyncStore.cachedRecords + " 条 · 待上传 " + BackgroundSyncStore.pendingRecords + " 条";
        if (lastCheck > 0) builder.setWhen(lastCheck).setShowWhen(true).setUsesChronometer(true);
        else builder.setShowWhen(false);
        return builder.setSmallIcon(android.R.drawable.stat_notify_sync)
            .setContentTitle("Personal Hub 后台加密同步")
            .setContentText(detail + " · " + counts).setContentIntent(open)
            .setStyle(new Notification.BigTextStyle().bigText(detail + "\n" + counts + "\n计时表示距上次检查的时间，不代表持续在线；解锁后合并密文。"))
            .setSubText(lastCheck > 0 ? "距上次成功检查" : "尚未完成后台检查")
            .setOnlyAlertOnce(true).setOngoing(true)
            .addAction(new Notification.Action.Builder(null, "暂停到下次打开", pause).build()).build();
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (android.os.Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "后台加密同步", NotificationManager.IMPORTANCE_LOW));
        startForeground(ID, notification());
        if (intent != null && "pause".equals(intent.getAction())) {
            BackgroundSyncStore.stopped = true;
            BackgroundSyncStore.HEALTH.inactive("后台同步已暂停，打开应用后恢复");
            getSystemService(android.app.job.JobScheduler.class).cancel(9242);
            BackgroundSyncStore.EXECUTOR.execute(() -> {
                try { BackgroundSyncStore.load(this).put("enabled", false); BackgroundSyncStore.save(this); }
                catch (Exception ignored) { }
            });
            stopSelf();
            return START_NOT_STICKY;
        }
        if (timer == null || timer.isDone()) {
            if (runner != null) runner.close();
            if (wake != null && wake.isHeld()) wake.release();
            wake = getSystemService(PowerManager.class).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, getPackageName() + ":background-sync");
            wake.acquire(6 * 60 * 60 * 1000L);
            runner = new BackgroundSyncRunner(BackgroundSyncStore.EXECUTOR, () -> {
                if (BackgroundSyncStore.stopped) { stopSelf(); return; }
                BackgroundSyncStore.tick(getApplicationContext());
            }, error -> {
                android.util.Log.e("PhubBackgroundLoop", "transfer " + error.getClass().getSimpleName());
                if (BackgroundSyncStore.stopped) {
                    BackgroundSyncStore.HEALTH.inactive("同步会话已暂停，请打开应用检查连接");
                    stopSelf();
                } else BackgroundSyncStore.HEALTH.failure("本次后台检查失败，稍后自动重试");
            }, () -> {
                try { manager.notify(ID, notification()); }
                catch (RuntimeException error) { android.util.Log.e("PhubBackgroundLoop", "notification " + error.getClass().getSimpleName()); }
            }, android.os.SystemClock::elapsedRealtime);
            timer = scheduler.scheduleWithFixedDelay(() -> {
                try { runner.pulse(); }
                catch (RuntimeException error) { android.util.Log.e("PhubBackgroundLoop", "scheduler " + error.getClass().getSimpleName()); }
            }, 1, 4, TimeUnit.SECONDS);
        }
        return START_NOT_STICKY;
    }

    @Override public void onTimeout(int startId, int fgsType) {
        timedOut = true;
        BackgroundSyncStore.HEALTH.inactive("系统限制持续运行，转为定期同步；打开应用恢复");
        stopSelf();
    }

    @Override public void onDestroy() {
        if (runner != null) runner.close();
        if (timer != null) timer.cancel(false);
        scheduler.shutdown();
        if (!timedOut && !BackgroundSyncStore.stopped) BackgroundSyncStore.HEALTH.inactive("及时后台服务已停止，等待系统定期检查");
        if (wake != null && wake.isHeld()) wake.release();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
