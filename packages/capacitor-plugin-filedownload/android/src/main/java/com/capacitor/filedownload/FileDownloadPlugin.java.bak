package com.capacitor.filedownload;

import java.io.File;

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

    private FileDownload implementation = new FileDownload();

    //下载器
    private DownloadManager downloadManager;
    private Context mContext;
    //下载的ID
    private long downloadId;
    private String pathstr;

    PluginCall _call;

    @PluginMethod
    public void download(PluginCall call) {
        try {
            if (isStoragePermissionGranted()) {
                _call = call;
                mContext = getContext();
                downloadFile(call);
            } else {
                requestAllPermissions(call, "permissionCallback");
            }
        } catch (Exception ex) {
            call.reject("Error downloading file: " + ex.getLocalizedMessage(), ex);
        }
    }

    private boolean isStoragePermissionGranted() {
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

        //创建下载任务
        DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url));
        //移动网络情况下是否允许漫游
        request.setAllowedOverRoaming(false);
        //在通知栏中显示，默认就是显示的
        request.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
        assert fileName != null;
        request.setTitle(fileName.substring(fileName.lastIndexOf("/") + 1));
        request.setDescription(url);
        request.setVisibleInDownloadsUi(true);
        request.allowScanningByMediaScanner();

        //设置下载的路径
        // File file = new File(mContext.getExternalFilesDir(""), fileName);
        File file = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), fileName);

        request.setDestinationUri(Uri.fromFile(file));
        pathstr = file.getAbsolutePath();

        //获取DownloadManager
        if (downloadManager == null)
            downloadManager = (DownloadManager) mContext.getSystemService(Context.DOWNLOAD_SERVICE);
        //将下载请求加入下载队列，加入下载队列后会给该任务返回一个long型的id，通过该id可以取消任务，重启任务、获取下载的文件等等
        if (downloadManager != null) {
            downloadId = downloadManager.enqueue(request);
        }

        //注册广播接收者，监听下载状态
        mContext.registerReceiver(receiver, new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
    }

    //广播监听下载的各个状态
    private final BroadcastReceiver receiver = new BroadcastReceiver() {
        @Override
        public void onReceive(Context context, Intent intent) {
            checkStatus();
        }
    };

    //检查下载状态
    private void checkStatus() {
        DownloadManager.Query query = new DownloadManager.Query();
        //通过下载的id查找
        query.setFilterById(downloadId);
        Cursor cursor = downloadManager.query(query);
        if (cursor.moveToFirst()) {
            @SuppressLint("Range") int status = cursor.getInt(cursor.getColumnIndex(DownloadManager.COLUMN_STATUS));
            switch (status) {
                //下载暂停
                case DownloadManager.STATUS_PAUSED:
                    break;
                //下载延迟
                case DownloadManager.STATUS_PENDING:
                    break;
                //正在下载
                case DownloadManager.STATUS_RUNNING:
                    break;
                //下载完成
                case DownloadManager.STATUS_SUCCESSFUL:
                    //下载完成
                    cursor.close();
                    JSObject ret = new JSObject();
                    ret.put("path", "file://" + pathstr);
                    _call.resolve(ret);
                    break;
                //下载失败
                case DownloadManager.STATUS_FAILED:
                    cursor.close();
                    mContext.unregisterReceiver(receiver);
                    _call.reject("下载失败,请检查URL是否正确");
                    break;
            }
        }
    }
}
