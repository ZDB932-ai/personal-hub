package com.zdb.personalhub;

import android.app.job.JobParameters;
import android.app.job.JobService;

public class BackgroundSyncJob extends JobService {
    @Override public boolean onStartJob(JobParameters params) {
        BackgroundSyncStore.EXECUTOR.execute(() -> {
            boolean retry = false;
            try {
                if (BackgroundSyncStore.load(this).optBoolean("enabled")) {
                    BackgroundSyncStore.stopped = false;
                    BackgroundSyncStore.tick(this);
                }
            } catch (Exception error) { retry = true; BackgroundSyncStore.HEALTH.failure("定期后台检查失败，等待系统重试"); }
            jobFinished(params, retry);
        });
        return true;
    }
    @Override public boolean onStopJob(JobParameters params) { return true; }
}
