package com.zdb.personalhub;

import org.junit.Test;
import static org.junit.Assert.*;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

public class BackgroundSyncTest {
    @Test public void staleSuccessDoesNotClaimHealthy() {
        BackgroundSyncHealth health = new BackgroundSyncHealth();
        health.waiting(); health.success(100, 2000);
        assertEquals(2000, health.lastSuccessWall());
        assertTrue(health.message(30101).contains("30"));
        health.failure("offline");
        assertEquals("offline", health.message(40000));
        health.success(50000, 52000);
        assertTrue(health.message(50001).contains("已完成"));
        health.reset();
        assertEquals(0, health.lastSuccessWall());
        assertTrue(health.message(60000).contains("关闭"));
    }
    @Test public void firstHungRequestHasNoSuccess() {
        BackgroundSyncHealth health = new BackgroundSyncHealth();
        health.waiting(); health.begin(10);
        assertTrue(health.message(30011).contains("尚未确认"));
        assertEquals(0, health.lastSuccessWall());
    }
    @Test public void notificationFailureCannotKillTransfers() {
        AtomicInteger calls = new AtomicInteger();
        BackgroundSyncRunner runner = new BackgroundSyncRunner(Runnable::run, calls::incrementAndGet,
            error -> { throw new IllegalStateException(); }, () -> { throw new IllegalStateException(); }, () -> 0L);
        runner.pulse(); runner.pulse();
        assertEquals(2, calls.get());
    }
    @Test public void failuresBackOffAndSuccessResetsDelay() {
        AtomicLong clock = new AtomicLong();
        AtomicInteger calls = new AtomicInteger();
        BackgroundSyncRunner runner = new BackgroundSyncRunner(Runnable::run, () -> {
            if (calls.incrementAndGet() <= 2) throw new Exception();
        }, error -> {}, () -> {}, clock::get);
        runner.pulse(); runner.pulse();
        assertEquals(1, calls.get());
        clock.set(2000); runner.pulse();
        clock.set(5999); runner.pulse(); assertEquals(2, calls.get());
        clock.set(6000); runner.pulse(); runner.pulse();
        assertEquals(4, calls.get());
    }
    @Test public void blockedWorkerHasAtMostOneQueuedTransferAndCloseCancelsIt() {
        List<Runnable> queue = new ArrayList<>();
        AtomicInteger calls = new AtomicInteger(), refresh = new AtomicInteger();
        BackgroundSyncRunner runner = new BackgroundSyncRunner(queue::add, calls::incrementAndGet,
            error -> {}, refresh::incrementAndGet, () -> 0L);
        runner.pulse(); runner.pulse(); runner.pulse();
        assertEquals(1, queue.size()); assertEquals(3, refresh.get());
        runner.close(); queue.get(0).run(); runner.pulse();
        assertEquals(0, calls.get()); assertEquals(3, refresh.get());
    }
    @Test public void rejectedQueueCanRetry() {
        AtomicLong clock = new AtomicLong();
        AtomicInteger queues = new AtomicInteger(), calls = new AtomicInteger();
        BackgroundSyncRunner runner = new BackgroundSyncRunner(task -> {
            if (queues.getAndIncrement() == 0) throw new java.util.concurrent.RejectedExecutionException();
            task.run();
        }, calls::incrementAndGet, error -> {}, () -> {}, clock::get);
        runner.pulse(); clock.set(2000); runner.pulse();
        assertEquals(1, calls.get());
    }
}
