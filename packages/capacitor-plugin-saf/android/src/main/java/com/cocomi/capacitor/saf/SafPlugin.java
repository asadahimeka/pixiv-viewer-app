package com.cocomi.capacitor.saf;

import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.content.UriPermission;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.List;

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
    private void pickFolderResult(PluginCall call, Intent data) {
        if (call == null) {
            return;
        }
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

        try {
            Context context = getContext();
            ContentResolver resolver = context.getContentResolver();
            Uri treeUri = Uri.parse(treeUriStr);

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
            Uri fileUri = findChild(context, treeUri, current, fileName, false);
            if (fileUri == null) {
                fileUri = DocumentsContract.createDocument(resolver, current, mime, fileName);
            }
            if (fileUri == null) {
                throw new IOException("cannot create file: " + fileName);
            }

            InputStream input = null;
            OutputStream output = null;
            try {
                input = new FileInputStream(new File(srcPath));
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
            } finally {
                try {
                    if (input != null) input.close();
                } catch (IOException ignored) {}
                try {
                    if (output != null) output.close();
                } catch (IOException ignored) {}
            }

            JSObject ret = new JSObject();
            ret.put("uri", fileUri.toString());
            ret.put("name", queryName(context, fileUri));
            call.resolve(ret);
        } catch (Exception e) {
            String msg = e.getMessage();
            call.reject("SAF write failed: " + (msg != null ? msg : e.getClass().getSimpleName()));
        }
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
