package com.agorapulse.capacitor.mediastore;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@CapacitorPlugin(name = "Mediastore")
public class MediastorePlugin extends Plugin {

    private final Mediastore implementation = new Mediastore();

    @PluginMethod
    public void savePicture(PluginCall call) {
        String album = call.getString("album");
        String filename = call.getString("filename");
        if (filename == null) {
            call.reject("filename is required");
            return;
        }
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        } else if (path.startsWith("file:///")) {
            path = path.substring(8);
        }

        String uri;
        try {
            uri = implementation.savePicture(this.getActivity().getApplicationContext(), album, filename, path);
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }
        JSObject ret = new JSObject();
        ret.put("uri", uri);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveToDownloads(PluginCall call) {

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("method requires API 29+");
            return;
        }

        String fileName = call.getString("filename");
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        } else if (path.startsWith("file:///")) {
            path = path.substring(8);
        }

        String uri;
        try {
            uri = this.implementation.saveToDownloads(this.getActivity().getApplicationContext(), fileName, path);
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("uri", uri);
        call.resolve(ret);
    }

    @PluginMethod
    public void saveVideo(PluginCall call) {
        String album = call.getString("album");
        String filename = call.getString("filename");
        if (filename == null) {
            call.reject("filename is required");
            return;
        }
        String path = call.getString("path");
        if (path == null) {
            call.reject("path is required");
            return;
        } else if (path.startsWith("file:///")) {
            path = path.substring(8);
        }

        String uri;
        try {
            uri = implementation.saveVideo(this.getActivity().getApplicationContext(), album, filename, path);
        } catch (Exception e) {
            call.reject(e.getMessage());
            return;
        }
        JSObject ret =new JSObject();
        ret.put("uri", uri);
        call.resolve(ret);
    }
}
