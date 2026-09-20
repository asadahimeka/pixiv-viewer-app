package com.capacitor.filedownload;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@CapacitorPlugin(name = "FileDownload", permissions = {
        @Permission(
                alias = "publicStorage",
                strings = {
                        Manifest.permission.READ_EXTERNAL_STORAGE,
                        Manifest.permission.WRITE_EXTERNAL_STORAGE
                }
        )
})
public class FileDownloadPlugin extends Plugin {

    static final String PUBLIC_STORAGE = "publicStorage";
    private static final String PERMISSION_DENIED_ERROR = "Unable to do file operation, user denied permission request";

    //下载器
    private DownloadManager downloadManager;
    private Context mContext;

    /**
     * 每个下载任务独立持有 call 和预期路径，按 downloadId 索引。
     * 不能用单个实例字段保存，否则并发下载时后一个任务会覆盖前一个，
     * 导致先入队任务的完成回调丢失（对应的前端 Promise 永远挂起）。
     */
    private final Map<Long, PendingDownload> pendingDownloads = new ConcurrentHashMap<>();
    private boolean receiverRegistered = false;

    /** 单个下载任务的状态 */
    private static class PendingDownload {
        final PluginCall call;
        final String path;
        final String taskId;

        PendingDownload(PluginCall call, String path, String taskId) {
            this.call = call;
            this.path = path;
            this.taskId = taskId;
        }
    }

    @PluginMethod
    public void download(PluginCall call) {
        try {
            // 在 Android 10 及以下，需要该权限
            if (isStoragePermissionGranted()) {
                mContext = getContext();
                downloadFile(call);
            } else {
                requestAllPermissions(call, "permissionCallback");
            }
        } catch (Exception ex) {
            call.reject("Error initiating file download: " + ex.getLocalizedMessage(), ex);
        }
    }

    private boolean isStoragePermissionGranted() {
        // Android R (API 30) 及以上版本，分区存储是强制性的，不再需要运行时请求写入权限
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R || getPermissionState(PUBLIC_STORAGE) == PermissionState.GRANTED;
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!isStoragePermissionGranted()) {
            Logger.debug(getLogTag(), "User denied storage permission");
            call.reject(PERMISSION_DENIED_ERROR);
            return;
        }
        download(call);
    }

    //下载文件
    private void downloadFile(final PluginCall call) {
        String url = call.getString("uri", "");
        String fileName = call.getString("fileName", "");

        if (url == null || url.isEmpty() || fileName == null || fileName.isEmpty()) {
            call.reject("URL and fileName must be provided.");
            return;
        }

        //创建下载任务
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        //移动网络情况下是否允许漫游
        request.setAllowedOverRoaming(false);
        //在通知栏中显示，默认就是显示的
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        request.setTitle(fileName.substring(fileName.lastIndexOf("/") + 1));
        request.setDescription(url);
        request.setVisibleInDownloadsUi(true);
        request.allowScanningByMediaScanner();
        request.setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName);
        String targetPath = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS) + "/" + fileName;

        //获取DownloadManager
        if (downloadManager == null) {
            downloadManager = (DownloadManager) mContext.getSystemService(Context.DOWNLOAD_SERVICE);
        }
        if (downloadManager == null) {
            call.reject("DownloadManager service not available.");
            return;
        }

        //将下载请求加入下载队列，加入下载队列后会给该任务返回一个long型的id，通过该id可以取消任务，重启任务、获取下载的文件等等
        long downloadId = downloadManager.enqueue(request);
        pendingDownloads.put(downloadId, new PendingDownload(call, targetPath, call.getString("taskId")));

        //注册广播接收者，监听下载状态（只注册一次，任务全部结束后注销）
        if (!receiverRegistered) {
            receiverRegistered = true;
            mContext.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    //广播监听下载的各个状态
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            //广播里携带已完成任务的 id，只处理自己登记过的下载，多任务互不影响
            long downloadId = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
            if (downloadId == -1) {
                return;
            }
            PendingDownload pending = pendingDownloads.get(downloadId);
            if (pending != null) {
                checkStatus(downloadId, pending);
            }
        }
    };

    //检查下载状态
    private void checkStatus(long downloadId, PendingDownload pending) {
        DownloadManager.Query query = new DownloadManager.Query();
        //通过下载的id查找
        query.setFilterById(downloadId);
        try (Cursor cursor = downloadManager.query(query)) {
            if (cursor == null || !cursor.moveToFirst()) {
                //有完成广播但查不到记录：任务可能被用户取消或清除，直接结束回调避免挂起
                settle(downloadId, pending.call, null, "下载记录不存在（可能已被取消或清除）");
                return;
            }
            @SuppressLint("Range") int status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS));
            switch (status) {
                //下载完成
                case DownloadManager.STATUS_SUCCESSFUL:
                    settle(downloadId, pending.call, buildSuccessResult(cursor, pending.path), null);
                    break;
                //下载失败
                case DownloadManager.STATUS_FAILED:
                    @SuppressLint("Range") int reason = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_REASON));
                    String errorMessage = getErrorMessage(reason);
                    settle(downloadId, pending.call, null, "下载失败: " + errorMessage);
                    break;
                case DownloadManager.STATUS_PAUSED:
                case DownloadManager.STATUS_PENDING:
                case DownloadManager.STATUS_RUNNING:
                    // 可以在这里处理进度更新，但本插件未实现
                    break;
            }
        } catch (Exception e) {
            Logger.error(getLogTag(), "Error checking download status", e);
            settle(downloadId, pending.call, null, "查询下载状态时出错: " + e.getMessage());
        }
    }

    /**
     * 取消系统下载管理器中的任务:移除登记、从系统队列移除,
     * 并以 DOWNLOAD_CANCELLED reject 对应的 call,避免 JS 侧 Promise 挂起。
     */
    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String taskId = call.getString("taskId");
        if (taskId == null || taskId.isEmpty()) {
            call.reject("taskId is required.");
            return;
        }
        boolean removed = false;
        for (Map.Entry<Long, PendingDownload> entry : pendingDownloads.entrySet()) {
            if (taskId.equals(entry.getValue().taskId)) {
                long downloadId = entry.getKey();
                pendingDownloads.remove(downloadId);
                if (downloadManager != null) {
                    try {
                        downloadManager.remove(downloadId);
                    } catch (Exception ignored) {
                    }
                }
                entry.getValue().call.reject("DOWNLOAD_CANCELLED");
                removed = true;
                break;
            }
        }
        maybeUnregisterReceiver();
        JSObject ret = new JSObject();
        ret.put("canceled", removed);
        call.resolve(ret);
    }

    /**
     * 结束一个下载任务：移除登记、必要时注销广播，然后只回调属于该任务的 call。
     */
    private void settle(long downloadId, PluginCall call, JSObject result, String errorMessage) {
        pendingDownloads.remove(downloadId);
        maybeUnregisterReceiver();
        if (call == null) {
            return;
        }
        if (result != null) {
            call.resolve(result);
        } else {
            call.reject(errorMessage);
        }
    }

    private void maybeUnregisterReceiver() {
        if (receiverRegistered && pendingDownloads.isEmpty() && mContext != null) {
            try {
                mContext.unregisterReceiver(receiver);
            } catch (IllegalArgumentException ignored) {
                // 未注册时注销会抛异常，忽略即可
            }
            receiverRegistered = false;
        }
    }

    /**
     * 构建成功结果。优先取 DownloadManager 记录的实际落盘地址
     * （目标文件重名时系统会自动改名，预估路径可能不准），取不到再回退到预估路径。
     */
    private JSObject buildSuccessResult(Cursor cursor, String fallbackPath) {
        String path = fallbackPath;
        try {
            @SuppressLint("Range") String localUri = cursor.getString(cursor.getColumnIndex(DownloadManager.COLUMN_LOCAL_URI));
            if (localUri != null) {
                Uri uri = Uri.parse(localUri);
                if ("file".equals(uri.getScheme())) {
                    String decoded = uri.getPath();
                    if (decoded != null && !decoded.isEmpty()) {
                        path = decoded;
                    }
                }
            }
        } catch (Exception ignored) {
            // 列缺失或解析失败时沿用预估路径
        }
        JSObject ret = new JSObject();
        ret.put("path", "file://" + path);
        return ret;
    }

    /**
     * 将 DownloadManager 的错误代码转换为可读信息
     */
    private String getErrorMessage(int reason) {
        switch (reason) {
            case DownloadManager.ERROR_CANNOT_RESUME:
                return "无法恢复下载";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND:
                return "找不到存储设备";
            case DownloadManager.ERROR_FILE_ALREADY_EXISTS:
                return "文件已存在";
            case DownloadManager.ERROR_FILE_ERROR:
                return "文件操作错误 (可能是权限不足或路径无效)";
            case DownloadManager.ERROR_HTTP_DATA_ERROR:
                return "HTTP数据错误";
            case DownloadManager.ERROR_INSUFFICIENT_SPACE:
                return "存储空间不足";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS:
                return "重定向次数过多";
            case DownloadManager.ERROR_UNHANDLED_HTTP_CODE:
                return "未处理的HTTP代码 (如 404, 403 等)";
            case DownloadManager.ERROR_UNKNOWN:
                return "未知错误";
            default:
                return "错误代码: " + reason;
        }
    }
}
