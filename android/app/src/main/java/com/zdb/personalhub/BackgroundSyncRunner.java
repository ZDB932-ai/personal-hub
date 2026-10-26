package com.zdb.personalhub;

import java.util.concurrent.Executor;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

final class BackgroundSyncRunner {
    interface Work { void run() throws Exception; }
    private final Executor worker;
    private final Work work;
    private final Consumer<Exception> failure;
    private final Runnable refresh;
    private final LongSupplier clock;
    private boolean busy;
    private boolean closed;
    private int failures;
    private long retryAt;

    BackgroundSyncRunner(Executor worker, Work work, Consumer<Exception> failure, Runnable refresh, LongSupplier clock) {
        this.worker = worker; this.work = work; this.failure = failure; this.refresh = refresh; this.clock = clock;
    }
    private void refreshSafely() {
        synchronized (this) { if (closed) return; }
        try { refresh.run(); } catch (RuntimeException ignored) { }
    }
    private void failed(Exception error) {
        synchronized (this) {
            failures = Math.min(6, failures + 1);
            retryAt = clock.getAsLong() + Math.min(60000, 1000L << failures);
        }
        try { failure.accept(error); } catch (RuntimeException ignored) { }
    }
    void pulse() {
        synchronized (this) { if (closed) return; }
        refreshSafely();
        synchronized (this) {
            if (closed || busy || clock.getAsLong() < retryAt) return;
            busy = true;
        }
        try {
            worker.execute(() -> {
                try {
                    synchronized (this) { if (closed) return; }
                    work.run();
                    synchronized (this) { failures = 0; retryAt = 0; }
                } catch (Exception error) { failed(error); }
                finally {
                    synchronized (this) { busy = false; }
                    refreshSafely();
                }
            });
        } catch (RuntimeException error) {
            synchronized (this) { busy = false; }
            failed(error);
        }
    }
    synchronized void close() { closed = true; }
}
