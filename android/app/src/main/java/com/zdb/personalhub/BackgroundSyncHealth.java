package com.zdb.personalhub;

final class BackgroundSyncHealth {
    private long lastSuccessElapsed = -1;
    private long lastSuccessWall;
    private long attemptElapsed = -1;
    private String detail = "后台同步未启动";
    private boolean enabled;
    private boolean failed;

    synchronized void waiting() { enabled = true; failed = false; detail = "等待完成后台检查"; }
    synchronized void begin(long elapsed) { attemptElapsed = elapsed; }
    synchronized void success(long elapsed, long wall) {
        enabled = true; failed = false; lastSuccessElapsed = elapsed; lastSuccessWall = wall;
        attemptElapsed = -1; detail = "上次后台检查已完成";
    }
    synchronized void failure(String reason) { failed = true; attemptElapsed = -1; detail = reason; }
    synchronized void inactive(String reason) { enabled = false; attemptElapsed = -1; detail = reason; }
    synchronized void reset() {
        lastSuccessElapsed = -1; lastSuccessWall = 0; attemptElapsed = -1;
        enabled = false; failed = false; detail = "后台同步已关闭";
    }
    synchronized long lastSuccessWall() { return lastSuccessWall; }
    synchronized String message(long elapsed) {
        if (!enabled || failed) return detail;
        if (lastSuccessElapsed >= 0 && elapsed - lastSuccessElapsed > 30000) return "超过 30 秒未完成后台检查，请查看系统后台限制";
        if (attemptElapsed >= 0 && elapsed - attemptElapsed > 30000) return "后台请求等待较久，尚未确认接收";
        return detail;
    }
}
