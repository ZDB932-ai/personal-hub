package com.zdb.personalhub;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.OutputStream;
import java.util.UUID;

@CapacitorPlugin(name = "DocumentSaver")
public class DocumentSaverPlugin extends Plugin {
    private boolean picking;
    private String session;
    private Uri target;
    private OutputStream output;
    private long size;
    private long written;

    @PluginMethod
    public synchronized void begin(PluginCall call) {
        if (picking || session != null) {
            call.reject("另一个文件正在保存");
            return;
        }
        long requestedSize = integer(call, "size");
        if (requestedSize < 0) {
            call.reject("无效的文件大小");
            return;
        }
        size = requestedSize;
        written = 0;
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(call.getString("mime", "application/octet-stream"));
        intent.putExtra(Intent.EXTRA_TITLE, call.getString("name", "personal-hub-export"));
        picking = true;
        try {
            startActivityForResult(call, intent, "selected");
        } catch (Exception error) {
            picking = false;
            call.reject("无法打开系统保存窗口", error);
        }
    }

    @ActivityCallback
    private synchronized void selected(PluginCall call, ActivityResult result) {
        picking = false;
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            call.resolve(new JSObject().put("cancelled", true));
            return;
        }
        target = result.getData().getData();
        try {
            output = getContext().getContentResolver().openOutputStream(target, "w");
            if (output == null) throw new java.io.IOException("无法打开文件");
            session = UUID.randomUUID().toString();
            call.resolve(new JSObject().put("cancelled", false).put("id", session));
        } catch (Exception error) {
            boolean removed = discard();
            call.reject(removed ? "无法创建保存文件" : "无法创建保存文件，请检查并删除所选位置的不完整文件", error);
        }
    }

    private boolean valid(PluginCall call) {
        if (session == null || !session.equals(call.getString("id"))) {
            call.reject("保存会话已失效");
            return false;
        }
        return true;
    }

    private long integer(PluginCall call, String name) {
        Object value = call.getData().opt(name);
        return value instanceof Integer || value instanceof Long ? ((Number) value).longValue() : -1;
    }

    @PluginMethod
    public synchronized void append(PluginCall call) {
        if (!valid(call)) return;
        long offset = integer(call, "offset");
        String encoded = call.getString("data");
        if (offset < 0 || offset != written || encoded == null || encoded.length() > 699052) {
            call.reject("无效的文件分块");
            return;
        }
        try {
            byte[] bytes = Base64.decode(encoded, Base64.NO_WRAP);
            if (bytes.length > 524288 || written + bytes.length > size) throw new java.io.IOException("文件大小不一致");
            output.write(bytes);
            written += bytes.length;
            call.resolve();
        } catch (Exception error) {
            call.reject("文件写入失败", error);
        }
    }

    @PluginMethod
    public synchronized void finish(PluginCall call) {
        if (!valid(call)) return;
        if (written != size) {
            call.reject("文件未完整写入");
            return;
        }
        try {
            output.flush();
            output.close();
            output = null;
            target = null;
            session = null;
            call.resolve();
        } catch (Exception error) {
            call.reject("文件保存失败", error);
        }
    }

    @PluginMethod
    public synchronized void abort(PluginCall call) {
        if (!valid(call)) return;
        if (discard()) call.resolve();
        else call.reject("无法清理未完成的文件");
    }

    private boolean discard() {
        try { if (output != null) output.close(); } catch (Exception ignored) {}
        boolean removed = target == null;
        try {
            if (target != null) removed = DocumentsContract.deleteDocument(getContext().getContentResolver(), target);
        } catch (Exception ignored) {}
        output = null;
        target = null;
        session = null;
        return removed;
    }

    @Override
    protected synchronized void handleOnDestroy() {
        discard();
        picking = false;
    }
}
