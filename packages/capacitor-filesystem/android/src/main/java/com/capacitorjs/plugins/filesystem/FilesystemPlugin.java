package com.capacitorjs.plugins.filesystem;

import android.Manifest;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaScannerConnection;
import android.media.ThumbnailUtils;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import com.capacitorjs.plugins.filesystem.exceptions.CopyFailedException;
import com.capacitorjs.plugins.filesystem.exceptions.DirectoryExistsException;
import com.capacitorjs.plugins.filesystem.exceptions.DirectoryNotFoundException;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Logger;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.plugin.util.HttpRequestHandler;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.Charset;
import java.nio.file.Files;
import java.nio.file.attribute.BasicFileAttributes;
import java.security.MessageDigest;
import java.net.URLDecoder;
import java.util.Locale;
import java.util.concurrent.atomic.AtomicBoolean;

import org.json.JSONException;

@CapacitorPlugin(
    name = "Filesystem",
    permissions = {
        @Permission(
            strings = { Manifest.permission.READ_EXTERNAL_STORAGE, Manifest.permission.WRITE_EXTERNAL_STORAGE },
            alias = "publicStorage"
        )
    }
)
public class FilesystemPlugin extends Plugin {

    static final String PUBLIC_STORAGE = "publicStorage";
    private Filesystem implementation;

    @Override
    public void load() {
        implementation = new Filesystem(getContext());
    }

    private static final String PERMISSION_DENIED_ERROR = "Unable to do file operation, user denied permission request";

    @PluginMethod
    public void readFile(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);
        String encoding = call.getString("encoding");

        Charset charset = implementation.getEncoding(encoding);
        if (encoding != null && charset == null) {
            call.reject("Unsupported encoding provided: " + encoding);
            return;
        }

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            try {
                String dataStr = implementation.readFile(path, directory, charset);
                JSObject ret = new JSObject();
                ret.putOpt("data", dataStr);
                call.resolve(ret);
            } catch (FileNotFoundException ex) {
                call.reject("File does not exist", ex);
            } catch (IOException ex) {
                call.reject("Unable to read file", ex);
            } catch (JSONException ex) {
                call.reject("Unable to return value for reading file", ex);
            }
        }
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String path = call.getString("path");
        String data = call.getString("data");
        Boolean recursive = call.getBoolean("recursive", false);

        if (path == null) {
            Logger.error(getLogTag(), "No path or filename retrieved from call", null);
            call.reject("NO_PATH");
            return;
        }

        if (data == null) {
            Logger.error(getLogTag(), "No data retrieved from call", null);
            call.reject("NO_DATA");
            return;
        }

        String directory = getDirectoryParameter(call);
        if (directory != null) {
            if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
                requestAllPermissions(call, "permissionCallback");
            } else {
                // create directory because it might not exist
                File androidDir = implementation.getDirectory(directory);
                if (androidDir != null) {
                    if (androidDir.exists() || androidDir.mkdirs()) {
                        // path might include directories as well
                        File fileObject = new File(androidDir, path);
                        if (fileObject.getParentFile().exists() || (recursive && fileObject.getParentFile().mkdirs())) {
                            saveFile(call, fileObject, data);
                        } else {
                            call.reject("Parent folder doesn't exist");
                        }
                    } else {
                        Logger.error(getLogTag(), "Not able to create '" + directory + "'!", null);
                        call.reject("NOT_CREATED_DIR");
                    }
                } else {
                    Logger.error(getLogTag(), "Directory ID '" + directory + "' is not supported by plugin", null);
                    call.reject("INVALID_DIR");
                }
            }
        } else {
            // check file:// or no scheme uris
            Uri u = Uri.parse(path);
            if (u.getScheme() == null || u.getScheme().equals("file")) {
                File fileObject = new File(u.getPath());
                // do not know where the file is being store so checking the permission to be secure
                // TODO to prevent permission checking we need a property from the call
                if (!isStoragePermissionGranted()) {
                    requestAllPermissions(call, "permissionCallback");
                } else {
                    if (
                        fileObject.getParentFile() == null ||
                        fileObject.getParentFile().exists() ||
                        (recursive && fileObject.getParentFile().mkdirs())
                    ) {
                        saveFile(call, fileObject, data);
                    } else {
                        call.reject("Parent folder doesn't exist");
                    }
                }
            } else {
                call.reject(u.getScheme() + " scheme not supported");
            }
        }
    }

    private void saveFile(PluginCall call, File file, String data) {
        String encoding = call.getString("encoding");
        boolean append = call.getBoolean("append", false);

        Charset charset = implementation.getEncoding(encoding);
        if (encoding != null && charset == null) {
            call.reject("Unsupported encoding provided: " + encoding);
            return;
        }

        try {
            implementation.saveFile(file, data, charset, append);
            // update mediaStore index only if file was written to external storage
            if (isPublicDirectory(getDirectoryParameter(call))) {
                MediaScannerConnection.scanFile(getContext(), new String[] { file.getAbsolutePath() }, null, null);
            }
            Logger.debug(getLogTag(), "File '" + file.getAbsolutePath() + "' saved!");
            JSObject result = new JSObject();
            result.put("uri", Uri.fromFile(file).toString());
            call.resolve(result);
        } catch (IOException ex) {
            Logger.error(
                getLogTag(),
                "Creating file '" + file.getPath() + "' with charset '" + charset + "' failed. Error: " + ex.getMessage(),
                ex
            );
            call.reject("FILE_NOTCREATED");
        } catch (IllegalArgumentException ex) {
            call.reject("The supplied data is not valid base64 content.");
        }
    }

    @PluginMethod
    public void appendFile(PluginCall call) {
        try {
            call.getData().putOpt("append", true);
        } catch (JSONException ex) {}

        this.writeFile(call);
    }

    @PluginMethod
    public void deleteFile(PluginCall call) {
        String file = call.getString("path");
        String directory = getDirectoryParameter(call);
        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            try {
                boolean deleted = implementation.deleteFile(file, directory);
                if (!deleted) {
                    call.reject("Unable to delete file");
                } else {
                    call.resolve();
                }
            } catch (FileNotFoundException ex) {
                call.reject(ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void mkdir(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);
        boolean recursive = call.getBoolean("recursive", false).booleanValue();
        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            try {
                boolean created = implementation.mkdir(path, directory, recursive);
                if (!created) {
                    call.reject("Unable to create directory, unknown reason");
                } else {
                    call.resolve();
                }
            } catch (DirectoryExistsException ex) {
                call.reject(ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void rmdir(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);
        Boolean recursive = call.getBoolean("recursive", false);

        File fileObject = implementation.getFileObject(path, directory);

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            if (!fileObject.exists()) {
                call.reject("Directory does not exist");
                return;
            }

            if (fileObject.isDirectory() && fileObject.listFiles().length != 0 && !recursive) {
                call.reject("Directory is not empty");
                return;
            }

            boolean deleted = false;

            try {
                implementation.deleteRecursively(fileObject);
                deleted = true;
            } catch (IOException ignored) {}

            if (!deleted) {
                call.reject("Unable to delete directory, unknown reason");
            } else {
                call.resolve();
            }
        }
    }

    @PluginMethod
    public void readdir(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            try {
                File[] files = implementation.readdir(path, directory);
                JSArray filesArray = new JSArray();
                if (files != null) {
                    for (var i = 0; i < files.length; i++) {
                        File fileObject = files[i];
                        JSObject data = new JSObject();
                        data.put("name", fileObject.getName());
                        data.put("type", fileObject.isDirectory() ? "directory" : "file");
                        data.put("size", fileObject.length());
                        data.put("mtime", fileObject.lastModified());
                        data.put("uri", Uri.fromFile(fileObject).toString());

                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            try {
                                BasicFileAttributes attr = Files.readAttributes(fileObject.toPath(), BasicFileAttributes.class);

                                // use whichever is the oldest between creationTime and lastAccessTime
                                if (attr.creationTime().toMillis() < attr.lastAccessTime().toMillis()) {
                                    data.put("ctime", attr.creationTime().toMillis());
                                } else {
                                    data.put("ctime", attr.lastAccessTime().toMillis());
                                }
                            } catch (Exception ex) {}
                        } else {
                            data.put("ctime", null);
                        }
                        filesArray.put(data);
                    }

                    JSObject ret = new JSObject();
                    ret.put("files", filesArray);
                    call.resolve(ret);
                } else {
                    call.reject("Unable to read directory");
                }
            } catch (DirectoryNotFoundException ex) {
                call.reject(ex.getMessage());
            }
        }
    }

    @PluginMethod
    public void getUri(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);

        File fileObject = implementation.getFileObject(path, directory);

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            JSObject data = new JSObject();
            data.put("uri", Uri.fromFile(fileObject).toString());
            call.resolve(data);
        }
    }

    @PluginMethod
    public void stat(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);

        File fileObject = implementation.getFileObject(path, directory);

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            if (!fileObject.exists()) {
                call.reject("File does not exist");
                return;
            }

            JSObject data = new JSObject();
            data.put("type", fileObject.isDirectory() ? "directory" : "file");
            data.put("size", fileObject.length());
            data.put("mtime", fileObject.lastModified());
            data.put("uri", Uri.fromFile(fileObject).toString());

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                try {
                    BasicFileAttributes attr = Files.readAttributes(fileObject.toPath(), BasicFileAttributes.class);

                    // use whichever is the oldest between creationTime and lastAccessTime
                    if (attr.creationTime().toMillis() < attr.lastAccessTime().toMillis()) {
                        data.put("ctime", attr.creationTime().toMillis());
                    } else {
                        data.put("ctime", attr.lastAccessTime().toMillis());
                    }
                } catch (Exception ex) {}
            } else {
                data.put("ctime", null);
            }

            call.resolve(data);
        }
    }

    /**
     * Gets the size of the path.
     * If the path is a directory the size is the sum of the size of all the files in the
     * directory and sub-directories. If the path is a file, the size is the size of the
     * file.
     * @param path path
     * @return path size in bytes
     */
    private static JSObject _getFileSize(final File path) throws JSONException {
        long size = 0;
        long len = 0;
        if (path.isFile()) {
            size = path.length();
            len = 1;
        } else {
            File[] subFiles = path.listFiles();
            if (subFiles != null && subFiles.length != 0) {
                for (File file : subFiles) {
                    if (file.isFile()) {
                        size += file.length();
                        len += 1;
                    } else {
                        JSObject ret = _getFileSize(file);
                        size += ret.getLong("size");
                        len += ret.getLong("len");
                    }
                }
            }
        }

        JSObject res = new JSObject();
        res.put("size", size);
        res.put("len", len);
        return res;
    }

    @PluginMethod
    public void getFileSize(PluginCall call) {
        String path = call.getString("path");
        String directory = getDirectoryParameter(call);

        File fileObject = implementation.getFileObject(path, directory);

        if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
            requestAllPermissions(call, "permissionCallback");
        } else {
            if (!fileObject.exists()) {
                call.reject("File does not exist");
                return;
            }

            try {
                JSObject data = _getFileSize(fileObject);
                call.resolve(data);
            } catch (Exception ex) {
                call.reject("Error getting file size: " + ex.getLocalizedMessage(), ex);
            }
        }
    }

    @PluginMethod
    public void rename(PluginCall call) {
        this._copy(call, true);
    }

    @PluginMethod
    public void copy(PluginCall call) {
        this._copy(call, false);
    }

    @PluginMethod
    public void downloadFile(PluginCall call) {
        try {
            String directory = call.getString("directory", Environment.DIRECTORY_DOWNLOADS);

            if (isPublicDirectory(directory) && !isStoragePermissionGranted()) {
                requestAllPermissions(call, "permissionCallback");
                return;
            }

            HttpRequestHandler.ProgressEmitter emitter = (bytes, contentLength) -> {
                JSObject ret = new JSObject();
                ret.put("url", call.getString("url"));
                ret.put("bytes", bytes);
                ret.put("contentLength", contentLength);

                notifyListeners("progress", ret);
            };

            // 下载在插件实现内部的后台线程执行（同官方 3e64606 修复），
            // 插件方法本身立即返回，不再阻塞 CapacitorPlugins 桥线程
            implementation.downloadFile(call, bridge, emitter, new Filesystem.FilesystemDownloadCallback() {
                @Override
                public void onSuccess(JSObject response) {
                    String error = response.getString("error");
                    if (error != null) {
                        call.reject(error);
                        return;
                    }

                    // update mediaStore index only if file was written to external storage
                    if (isPublicDirectory(directory)) {
                        MediaScannerConnection.scanFile(getContext(), new String[] { response.getString("path") }, null, null);
                    }
                    call.resolve(response);
                }

                @Override
                public void onError(Exception error) {
                    String msg = error.getLocalizedMessage() != null ? error.getLocalizedMessage() : "";
                    // 用户取消:透传干净的 DOWNLOAD_CANCELLED 标记,JS 侧按取消处理,不留失败记录
                    if (msg.contains("DOWNLOAD_CANCELLED")) {
                        call.reject("DOWNLOAD_CANCELLED");
                        return;
                    }
                    call.reject("Error downloading file: " + msg, error);
                }
            });
        } catch (Exception ex) {
            String msg = ex.getLocalizedMessage();
            call.reject("Error downloading file: [" + ex.getClass().getSimpleName() + "] " + (msg != null ? msg : "no message"), ex);
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String taskId = call.getString("taskId");
        if (taskId == null || taskId.isEmpty()) {
            call.reject("taskId is required");
            return;
        }
        AtomicBoolean flag = Filesystem.CANCELLED_TASKS.get(taskId);
        // 任务尚未注册(排队中)时 JS 侧会在启动前检查取消标志,这里只处理已注册的任务
        if (flag != null) {
            flag.set(true);
        }
        call.resolve();
    }

    /**
     * 生成下载缩略图:图片按 maxSize 采样解码,视频取中间帧;
     * 产物写入 cacheDir/download_thumbs/<md5(path+mtime)>.jpg,同名命中直接复用。
     * 返回 { uri, mtime },供 JS 侧按 mtime 做缓存失效。
     */
    @PluginMethod
    public void generateThumbnail(PluginCall call) {
        String path = call.getString("path");
        Integer maxSize = call.getInt("maxSize", 320);
        if (path == null || path.isEmpty()) {
            call.reject("path is required");
            return;
        }
        String clean = path.startsWith("file://") ? path.substring("file://".length()) : path;
        File src = new File(clean);
        if (!src.exists() && clean.contains("%")) {
            // 记录里的路径可能被 URI 编码过(如 DownloadManager 的 COLUMN_LOCAL_URI
            // 对非 ASCII 文件名会编码),直接 File 匹配不到时先尝试解码
            try {
                File decoded = new File(URLDecoder.decode(clean, "UTF-8"));
                if (decoded.exists()) {
                    src = decoded;
                    clean = decoded.getAbsolutePath();
                }
            } catch (Exception ignored) {}
        }
        if (!src.exists()) {
            // 带上具体路径,便于在 logcat 中定位是哪条记录/哪个来源的路径解析问题
            Logger.debug(getLogTag(), "generateThumbnail FILE_NOT_FOUND: " + clean);
            call.reject("FILE_NOT_FOUND");
            return;
        }
        try {
            File outDir = new File(getContext().getCacheDir(), "download_thumbs");
            if (!outDir.exists()) {
                outDir.mkdirs();
            }
            long mtime = src.lastModified();
            File out = new File(outDir, md5(clean + "_" + mtime) + ".jpg");
            if (out.exists() && out.length() > 0) {
                resolveThumb(call, out, mtime);
                return;
            }

            Bitmap bitmap = null;
            String lower = clean.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".mp4") || lower.endsWith(".mov") || lower.endsWith(".3gp")) {
                // String 重载在全部 API 级别可用;File 重载 API 29+ 才有
                bitmap = ThumbnailUtils.createVideoThumbnail(src.getAbsolutePath(), MediaStore.Images.Thumbnails.MINI_KIND);
            } else {
                bitmap = decodeSampledBitmap(src, maxSize == null ? 320 : maxSize);
            }
            if (bitmap == null) {
                call.reject("THUMB_UNSUPPORTED");
                return;
            }

            FileOutputStream fos = new FileOutputStream(out);
            bitmap.compress(Bitmap.CompressFormat.JPEG, 82, fos);
            fos.close();
            resolveThumb(call, out, mtime);
        } catch (Exception ex) {
            call.reject("THUMB_ERROR: " + ex.getLocalizedMessage());
        }
    }

    private void resolveThumb(PluginCall call, File out, long mtime) {
        JSObject ret = new JSObject();
        ret.put("uri", Uri.fromFile(out).toString());
        ret.put("mtime", mtime);
        call.resolve(ret);
    }

    /** 两段式采样解码:先读边界算 inSampleSize,再解码;超出目标尺寸时二次缩放 */
    private Bitmap decodeSampledBitmap(File src, int maxSize) {
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeFile(src.getAbsolutePath(), bounds);
        if (bounds.outWidth <= 0 || bounds.outHeight <= 0) {
            return null;
        }
        BitmapFactory.Options opts = new BitmapFactory.Options();
        int sample = 1;
        while (bounds.outWidth / (sample * 2) >= maxSize && bounds.outHeight / (sample * 2) >= maxSize) {
            sample *= 2;
        }
        opts.inSampleSize = sample;
        Bitmap decoded = BitmapFactory.decodeFile(src.getAbsolutePath(), opts);
        if (decoded == null) {
            return null;
        }
        int maxDim = Math.max(decoded.getWidth(), decoded.getHeight());
        if (maxDim > maxSize * 1.5f) {
            float scale = maxSize / (float) maxDim;
            Bitmap scaled = Bitmap.createScaledBitmap(
                decoded,
                Math.max(1, Math.round(decoded.getWidth() * scale)),
                Math.max(1, Math.round(decoded.getHeight() * scale)),
                true
            );
            if (scaled != decoded) {
                decoded.recycle();
            }
            return scaled;
        }
        return decoded;
    }

    private static String md5(String input) {
        try {
            MessageDigest digest = MessageDigest.getInstance("MD5");
            byte[] bytes = digest.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : bytes) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception ex) {
            // MD5 在所有 Android 平台必然可用,这里仅兜底
            return Integer.toHexString(input.hashCode());
        }
    }

    private void _copy(PluginCall call, Boolean doRename) {
        String from = call.getString("from");
        String to = call.getString("to");
        String directory = call.getString("directory");
        String toDirectory = call.getString("toDirectory");

        if (from == null || from.isEmpty() || to == null || to.isEmpty()) {
            call.reject("Both to and from must be provided");
            return;
        }
        if (isPublicDirectory(directory) || isPublicDirectory(toDirectory)) {
            if (!isStoragePermissionGranted()) {
                requestAllPermissions(call, "permissionCallback");
                return;
            }
        }
        try {
            File file = implementation.copy(from, directory, to, toDirectory, doRename);
            if (!doRename) {
                JSObject result = new JSObject();
                result.put("uri", Uri.fromFile(file).toString());
                call.resolve(result);
            } else {
                call.resolve();
            }
        } catch (CopyFailedException ex) {
            call.reject(ex.getMessage());
        } catch (IOException ex) {
            call.reject("Unable to perform action: " + ex.getLocalizedMessage());
        }
    }

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        if (isStoragePermissionGranted()) {
            JSObject permissionsResultJSON = new JSObject();
            permissionsResultJSON.put(PUBLIC_STORAGE, "granted");
            call.resolve(permissionsResultJSON);
        } else {
            super.checkPermissions(call);
        }
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (isStoragePermissionGranted()) {
            JSObject permissionsResultJSON = new JSObject();
            permissionsResultJSON.put(PUBLIC_STORAGE, "granted");
            call.resolve(permissionsResultJSON);
        } else {
            requestPermissionForAlias(PUBLIC_STORAGE, call, "permissionCallback");
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (!isStoragePermissionGranted()) {
            Logger.debug(getLogTag(), "User denied storage permission");
            call.reject(PERMISSION_DENIED_ERROR);
            return;
        }

        switch (call.getMethodName()) {
            case "appendFile":
            case "writeFile":
                writeFile(call);
                break;
            case "deleteFile":
                deleteFile(call);
                break;
            case "mkdir":
                mkdir(call);
                break;
            case "rmdir":
                rmdir(call);
                break;
            case "rename":
                rename(call);
                break;
            case "copy":
                copy(call);
                break;
            case "readFile":
                readFile(call);
                break;
            case "readdir":
                readdir(call);
                break;
            case "getUri":
                getUri(call);
                break;
            case "stat":
                stat(call);
                break;
            case "downloadFile":
                downloadFile(call);
                break;
            case "getFileSize":
                getFileSize(call);
                break;
        }
    }

    /**
     * Checks the the given permission is granted or not
     * @return Returns true if the app is running on Android 30 or newer or if the permission is already granted
     * or false if it is denied.
     */
    private boolean isStoragePermissionGranted() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.R || getPermissionState(PUBLIC_STORAGE) == PermissionState.GRANTED;
    }

    /**
     * Reads the directory parameter from the plugin call
     * @param call the plugin call
     */
    private String getDirectoryParameter(PluginCall call) {
        return call.getString("directory");
    }

    /**
     * True if the given directory string is a public storage directory, which is accessible by the user or other apps.
     * @param directory the directory string.
     */
    private boolean isPublicDirectory(String directory) {
        return "DOCUMENTS".equals(directory) || "DOWNLOADS".equals(directory) || "PICTURES".equals(directory) || "EXTERNAL_STORAGE".equals(directory);
    }
}
