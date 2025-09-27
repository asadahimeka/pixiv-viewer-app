package com.whiteguru.capacitor.plugin.fileopener;

import android.content.ContentResolver;
import android.content.Intent;
import android.net.Uri;

import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

@CapacitorPlugin(name = "FileOpener")
public class FileOpenerPlugin extends Plugin {

    @PluginMethod
    public void open(PluginCall call) {
        String path = call.getString("path", "");
        String mime = call.getString("mime", "");

        Uri u = Uri.parse(path);
        Uri fileUri;
        if (u.getScheme() != null && u.getScheme().equals(ContentResolver.SCHEME_CONTENT)) {
            fileUri = u;
        } else if (u.getScheme() == null || u.getScheme().equals(ContentResolver.SCHEME_FILE)) {
            fileUri = FileProvider.getUriForFile(getActivity(), getContext().getPackageName() + ".fileprovider", new File(u.getPath()));
        } else {
            fileUri = FileProvider.getUriForFile(getActivity(), getContext().getPackageName() + ".fileprovider", new File(path));
        }

        Intent openFileIntent = new Intent(Intent.ACTION_VIEW);

        if (mime == null || mime.trim().equals("")) {
          openFileIntent.setDataAndNormalize(fileUri);
        } else {
          openFileIntent.setDataAndTypeAndNormalize(fileUri, mime);
        }

        openFileIntent.setFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        if (openFileIntent.resolveActivity(getContext().getPackageManager()) != null) {
            startActivityForResult(call, openFileIntent, "openFileResult");
        } else {
            call.reject("No default apps for open file");
        }
    }

    @ActivityCallback
    private void openFileResult(PluginCall call, ActivityResult result) {
        if (call == null) {
            return;
        }

        call.resolve();
    }
}
