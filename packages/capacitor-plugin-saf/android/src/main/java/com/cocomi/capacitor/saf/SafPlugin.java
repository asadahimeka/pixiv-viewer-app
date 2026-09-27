package com.cocomi.capacitor.saf;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;
import android.provider.OpenableColumns;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;
import java.util.Locale;

@CapacitorPlugin(name = "Saf")
public class SafPlugin extends Plugin {

    private static final int PERSIST_FLAGS =
        Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;

    @PluginMethod
    public void pickFolder(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        startActivityForResult(call, intent, "pickFolderResult");
    }

    @ActivityCallback
    private void pickFolderResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }
        Intent data = result != null ? result.getData() : null;
        if (data == null || data.getData() == null) {
            call.reject("cancelled");
            return;
        }
        try {
            ContentResolver resolver = getContext().getContentResolver();
            // 应用只使用一个授权目录，重选时释放旧的持久化授权
            releasePersisted(resolver);
            Uri uri = data.getData();
            resolver.takePersistableUriPermission(uri, PERSIST_FLAGS);
            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (Exception e) {
            String msg = e.getMessage();
            call.reject("take permission failed: " + (msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    @PluginMethod
    public void getPersistedFolder(PluginCall call) {
        String found = null;
        List<UriPermission> permissions = getContext().getContentResolver().getPersistedUriPermissions();
        // 取最近一个带写权限的授权
        for (int i = permissions.size() - 1; i >= 0; i--) {
            UriPermission permission = permissions.get(i);
            if (permission.isWritePermission()) {
                found = permission.getUri().toString();
                break;
            }
        }
        JSObject ret = new JSObject();
        ret.put("uri", found);
        call.resolve(ret);
    }

    @PluginMethod
    public void writeFile(PluginCall call) {
        String treeUriStr = call.getString("treeUri");
        String relativeDir = call.getString("relativeDir", "");
        String fileName = call.getString("fileName");
        String srcPath = call.getString("srcPath");
        String mime = call.getString("mime", "application/octet-stream");

        if (treeUriStr == null || fileName == null || srcPath == null) {
            call.reject("treeUri, fileName and srcPath are required");
            return;
        }

        InputStream input = null;
        OutputStream output = null;
        Uri fileUri = null;
        boolean createdNewFile = false;
        boolean success = false;
        try {
            Context context = getContext();
            ContentResolver resolver = context.getContentResolver();
            Uri treeUri = Uri.parse(treeUriStr);

            // 先打开源文件：源文件不可读时直接失败，不在目标目录创建任何目录或文档
            // srcPath 由 JS 侧调用方（safSave）保证已解码一次：Filesystem.getUri() 的
            // 百分号编码 URI 在 JS 层还原、裸绝对路径原样传入，插件不再解码。
            // java.io.File 按字面路径打开，不解码 %XX——多解一次会把文件名里的字面 % 弄坏
            input = new FileInputStream(new File(srcPath));

            Uri current = DocumentsContract.buildDocumentUriUsingTree(
                treeUri, DocumentsContract.getTreeDocumentId(treeUri));

            String[] segments = relativeDir.split("/");
            for (String seg : segments) {
                if (seg.isEmpty() || ".".equals(seg) || "..".equals(seg)) {
                    continue;
                }
                Uri child = findChild(context, treeUri, current, seg, true);
                if (child == null) {
                    child = DocumentsContract.createDocument(resolver, current, DocumentsContract.Document.MIME_TYPE_DIR, seg);
                }
                if (child == null) {
                    throw new IOException("cannot create directory: " + seg);
                }
                current = child;
            }

            // 同名文件直接复用并截断重写；新建时若系统检测到重名会自动生成不重复的显示名
            fileUri = findChild(context, treeUri, current, fileName, false);
            if (fileUri == null) {
                fileUri = DocumentsContract.createDocument(resolver, current, mime, fileName);
                // 只有本次调用新建的文档才允许在失败时清理，避免误删用户已有的同名文件
                createdNewFile = fileUri != null;
            }
            if (fileUri == null) {
                throw new IOException("cannot create file: " + fileName);
            }

            output = resolver.openOutputStream(fileUri, "w");
            if (output == null) {
                throw new IOException("cannot open output stream");
            }
            byte[] buffer = new byte[8192];
            int len;
            while ((len = input.read(buffer)) > 0) {
                output.write(buffer, 0, len);
            }
            output.flush();
            success = true;

            JSObject ret = new JSObject();
            ret.put("uri", fileUri.toString());
            ret.put("name", queryName(context, fileUri));
            call.resolve(ret);
        } catch (Exception e) {
            String msg = e.getMessage();
            call.reject("SAF write failed: " + (msg != null ? msg : e.getClass().getSimpleName()));
        } finally {
            try {
                if (input != null) input.close();
            } catch (IOException ignored) {}
            try {
                if (output != null) output.close();
            } catch (IOException ignored) {}
            // 写入失败且目标是本次新建的文档时删除，避免在用户目录留下 0 字节孤儿文件
            if (createdNewFile && !success && fileUri != null) {
                try {
                    DocumentsContract.deleteDocument(getContext().getContentResolver(), fileUri);
                } catch (Exception ignored) {}
            }
        }
    }

    // 删除 SAF 目录树下的文件（仅限已持久化授权的目录树内）
    @PluginMethod
    public void delete(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) {
            call.reject("uri is required");
            return;
        }
        Uri fileUri = Uri.parse(uriStr);
        if (!ContentResolver.SCHEME_CONTENT.equals(fileUri.getScheme())) {
            call.reject("uri must be a content:// uri");
            return;
        }
        // 删除属破坏性操作：先校验目标位于某个已持久化授权（带写权限）的目录树之下
        if (!isInsidePersistedTree(fileUri)) {
            call.reject("uri is not inside a persisted SAF folder");
            return;
        }
        try {
            boolean deleted = DocumentsContract.deleteDocument(getContext().getContentResolver(), fileUri);
            JSObject ret = new JSObject();
            ret.put("deleted", deleted);
            call.resolve(ret);
        } catch (Exception e) {
            String msg = e.getMessage();
            call.reject("SAF delete failed: " + (msg != null ? msg : e.getClass().getSimpleName()));
        }
    }

    // 打开 SAF 目录树内的文档。不走"把树授权经 intent 传播给查看器"的路线——
    // 系统对 tree 后代 document URI 的传播校验会在部分栈上直接拒绝本应用 uid 并
    // 同步抛 SecurityException(足以崩掉进程)。改为用我们自己的持久授权读出内容、
    // 复制到应用缓存,再经 FileProvider 把"应用自有"的 URI 交给 ACTION_VIEW:
    // 我们是该 URI 的授权方,传播天然成立。
    @PluginMethod
    public void openDocument(PluginCall call) {
        // 整个方法体都在 try 内：任何路径要么 resolve、要么 reject，绝不抛出插件调用
        InputStream input = null;
        OutputStream output = null;
        try {
            String uriStr = call.getString("uri");
            if (uriStr == null || uriStr.trim().isEmpty()) {
                call.reject("SAF open failed: uri is required");
                return;
            }
            Uri src = Uri.parse(uriStr);
            if (!ContentResolver.SCHEME_CONTENT.equals(src.getScheme())) {
                call.reject("SAF open failed: uri must be a content:// uri");
                return;
            }
            // 与 delete 同一套校验:授权过期/被撤销时回稳定 token "SAF permission lost",
            // JS 侧据此提示重新选择下载目录
            if (!isInsidePersistedTree(src)) {
                call.reject("SAF permission lost: no persisted tree covers this uri");
                return;
            }

            Context context = getContext();
            ContentResolver resolver = context.getContentResolver();

            String name = queryDisplayName(resolver, src);
            if (name == null || name.trim().isEmpty()) {
                name = queryName(context, src);
            }
            if (name == null || name.trim().isEmpty()) {
                name = "shared-file";
            }
            name = name.replace('/', '_');
            if (name.isEmpty()) {
                name = "shared-file";
            }

            // 缓存中转目录:先尽力清掉上次打开留下的副本,避免无限堆积
            File dir = new File(context.getCacheDir(), "saf-open");
            if (!dir.exists()) {
                dir.mkdirs();
            }
            File[] stale = dir.listFiles();
            if (stale != null) {
                for (File old : stale) {
                    old.delete();
                }
            }
            File staged = new File(dir, name);

            input = resolver.openInputStream(src);
            if (input == null) {
                throw new IOException("cannot open input stream");
            }
            output = new FileOutputStream(staged);
            byte[] buffer = new byte[8192];
            int len;
            while ((len = input.read(buffer)) > 0) {
                output.write(buffer, 0, len);
            }
            output.flush();

            String mime = resolver.getType(src);
            if (mime == null || mime.trim().isEmpty()) {
                mime = mimeFromName(name);
            }

            Uri contentUri = FileProvider.getUriForFile(context,
                context.getPackageName() + ".fileprovider", staged);
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(contentUri, mime);
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (intent.resolveActivity(context.getPackageManager()) == null) {
                // 与 FileOpener 保持同一文案,JS 侧 /no[_-]?app/i 匹配零改动
                call.reject("No default apps for open file");
                return;
            }
            // 只唤起、不等结果:打开动作本身即目的
            getActivity().startActivity(intent);
            call.resolve(new JSObject().put("opened", true));
        } catch (Exception e) {
            // 本方法不允许有任何异常逃出插件调用
            String msg = e.getMessage();
            call.reject("SAF open failed: " + (msg != null ? msg : e.getClass().getSimpleName()));
        } finally {
            try {
                if (input != null) input.close();
            } catch (IOException ignored) {}
            try {
                if (output != null) output.close();
            } catch (IOException ignored) {}
        }
    }

    // OpenableColumns.DISPLAY_NAME 查询(本应用持有树授权,读得到)
    private String queryDisplayName(ContentResolver resolver, Uri fileUri) {
        Cursor cursor = null;
        try {
            cursor = resolver.query(fileUri,
                new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    return cursor.getString(idx);
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    // resolver.getType() 取不到时的小型扩展名兜底表
    private static String mimeFromName(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".bmp")) return "image/bmp";
        if (lower.endsWith(".mp4")) return "video/mp4";
        if (lower.endsWith(".webm")) return "video/webm";
        if (lower.endsWith(".txt")) return "text/plain";
        if (lower.endsWith(".pdf")) return "application/pdf";
        if (lower.endsWith(".epub")) return "application/epub+zip";
        return "application/octet-stream";
    }

    // 校验目标文档是否是某个已持久化授权（带写权限）目录树的后代；
    // 目录树本身（授权根目录）不允许删除
    private boolean isInsidePersistedTree(Uri target) {
        String targetId;
        try {
            targetId = DocumentsContract.getDocumentId(target);
        } catch (Exception e) {
            return false;
        }
        String authority = target.getAuthority();
        // 参照 getPersistedFolder：从持久化授权列表中读取写权限
        List<UriPermission> permissions = getContext().getContentResolver().getPersistedUriPermissions();
        for (UriPermission permission : permissions) {
            if (!permission.isWritePermission()) {
                continue;
            }
            Uri treeUri = permission.getUri();
            if (authority == null || !authority.equals(treeUri.getAuthority())) {
                continue;
            }
            String treeId;
            try {
                treeId = DocumentsContract.getTreeDocumentId(treeUri);
            } catch (Exception e) {
                continue;
            }
            if (treeId != null && targetId.startsWith(treeId + "/")) {
                return true;
            }
        }
        return false;
    }

    private void releasePersisted(ContentResolver resolver) {
        for (UriPermission permission : resolver.getPersistedUriPermissions()) {
            try {
                resolver.releasePersistableUriPermission(permission.getUri(), PERSIST_FLAGS);
            } catch (Exception ignored) {}
        }
    }

    private Uri findChild(Context context, Uri treeUri, Uri parentUri, String name, boolean isDir) {
        Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(
            treeUri, DocumentsContract.getDocumentId(parentUri));
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(childrenUri,
                new String[] {
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_MIME_TYPE,
                }, null, null, null);
            while (cursor != null && cursor.moveToNext()) {
                if (!name.equals(cursor.getString(1))) {
                    continue;
                }
                String mimeType = cursor.getString(2);
                boolean childIsDir = DocumentsContract.Document.MIME_TYPE_DIR.equals(mimeType);
                if (childIsDir == isDir) {
                    return DocumentsContract.buildDocumentUriUsingTree(treeUri, cursor.getString(0));
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }

    private String queryName(Context context, Uri fileUri) {
        Cursor cursor = null;
        try {
            cursor = context.getContentResolver().query(fileUri,
                new String[] { DocumentsContract.Document.COLUMN_DISPLAY_NAME }, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                return cursor.getString(0);
            }
        } catch (Exception ignored) {
        } finally {
            if (cursor != null) {
                cursor.close();
            }
        }
        return null;
    }
}
