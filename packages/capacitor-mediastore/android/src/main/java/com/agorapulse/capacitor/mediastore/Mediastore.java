package com.agorapulse.capacitor.mediastore;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

public class Mediastore {

    public String savePicture(Context context, String album, String filename, String path) throws Exception {
        ContentResolver resolver = context.getContentResolver();

        //Get collection
        Uri pictureCollection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            pictureCollection = MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        } else {
            pictureCollection = MediaStore.Images.Media.EXTERNAL_CONTENT_URI;
        }

        //Publish picture
        ContentValues newPictureDetails = new ContentValues();
        newPictureDetails.put(MediaStore.Images.Media.DISPLAY_NAME, filename);
        if (album != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newPictureDetails.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/" + album);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newPictureDetails.put(MediaStore.Images.Media.IS_PENDING, 1);
        }

        Uri pictureContentUri = resolver.insert(pictureCollection, newPictureDetails);
        this.copyFile(resolver, path, pictureContentUri);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newPictureDetails.clear();
            newPictureDetails.put(MediaStore.Images.Media.IS_PENDING, 0);
            resolver.update(pictureContentUri, newPictureDetails, null, null);
        }
        return pictureContentUri.toString();
    }

    public String saveToDownloads(Context context, String album, String filename, String path) throws Exception {
        ContentResolver resolver = context.getContentResolver();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            Path filePath = Paths.get(path);
            if (filename == null) {
                filename = filePath.getFileName().toString();
            }
            Long size = Files.size(filePath);
            String mimeType = Files.probeContentType(filePath);

            ContentValues contentValues = new ContentValues();
            contentValues.put(MediaStore.Downloads.DISPLAY_NAME, filename);
            if (mimeType != null) {
                contentValues.put(MediaStore.Downloads.MIME_TYPE, mimeType);
            }
            contentValues.put(MediaStore.Downloads.SIZE, size);
            if (album != null) {
                contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/" + album);
            }
            Uri targetUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);

            copyFile(resolver, path, targetUri);

            return targetUri.toString();
        }

        // API 29 以下没有 MediaStore.Downloads，直接写公共 Download 目录（需要已授予的写权限）
        File destDir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS), album == null ? "" : album);
        if (!destDir.exists() && !destDir.mkdirs()) {
            throw new Exception("Unable to write file - cannot create directory " + destDir.getAbsolutePath());
        }
        File destFile = new File(destDir, filename == null ? Paths.get(path).getFileName().toString() : filename);
        InputStream input = null;
        OutputStream output = null;
        try {
            input = new FileInputStream(path);
            output = new FileOutputStream(destFile);
            byte[] buffer = new byte[8192];
            int len;
            while ((len = input.read(buffer)) > 0) {
                output.write(buffer, 0, len);
            }
            output.flush();
        } catch (Exception e) {
            throw new Exception("Unable to write file - " + e.getMessage());
        } finally {
            try {
                if (input != null) input.close();
            } catch (IOException ignored) {}
            try {
                if (output != null) output.close();
            } catch (IOException ignored) {}
        }
        return Uri.fromFile(destFile).toString();
    }

    public String saveVideo(Context context, String album, String filename, String path) throws Exception {
        ContentResolver resolver = context.getContentResolver();

        //Get collection
        Uri videoCollection;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            videoCollection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
        } else {
            videoCollection = MediaStore.Video.Media.EXTERNAL_CONTENT_URI;
        }

        //Publish video
        ContentValues newVideoDetails = new ContentValues();
        newVideoDetails.put(MediaStore.Video.Media.DISPLAY_NAME, filename);
        if (album != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newVideoDetails.put(MediaStore.Video.Media.RELATIVE_PATH, "Movies/" + album);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newVideoDetails.put(MediaStore.Video.Media.IS_PENDING, 1);
        }

        Uri videoContentUri = resolver.insert(videoCollection, newVideoDetails);
        this.copyFile(resolver, path, videoContentUri);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            newVideoDetails.clear();
            newVideoDetails.put(MediaStore.Video.Media.IS_PENDING, 0);
            resolver.update(videoContentUri, newVideoDetails, null, null);
        }
        return videoContentUri.toString();
    }

    private void copyFile(ContentResolver resolver, String inputPath, Uri outputUri) throws Exception {
        File inputFile = new File(inputPath);
        if (!inputFile.exists()) {
            resolver.delete(outputUri, null, null);
            throw new Exception("Unable to read file from path " + inputPath + " - file does not exist");
        }

        // 持有 PFD 引用并在 finally 中确定性地关闭：原先的写法 fd 归 finalizer 管，
        // 在 copy 期间/之后被提前关闭会导致 EBADF，以及 MediaProvider 在
        // IS_PENDING=0 时做内部 rename 撞上 ETXTBSY
        ParcelFileDescriptor sourceFD = null;
        ParcelFileDescriptor targetFD = null;
        String phase = "read";
        try {
            sourceFD = resolver.openFileDescriptor(Uri.fromFile(inputFile), "r", null);
            if (sourceFD == null) {
                throw new Exception("open failed for " + inputPath);
            }
            InputStream input = new ParcelFileDescriptor.AutoCloseInputStream(sourceFD);

            phase = "write";
            targetFD = resolver.openFileDescriptor(outputUri, "w", null);
            if (targetFD == null) {
                throw new Exception("open failed: " + outputUri);
            }
            OutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(targetFD);

            byte[] buffer = new byte[8192];
            int len;
            while ((len = input.read(buffer)) > 0) {
                output.write(buffer, 0, len);
            }
            output.flush();
            input.close();
            output.close();
        } catch (Exception e) {
            resolver.delete(outputUri, null, null);
            throw new Exception("Unable to " + phase + " file - " + e.getMessage());
        } finally {
            try {
                if (sourceFD != null) sourceFD.close();
            } catch (IOException ignored) {}
            try {
                if (targetFD != null) targetFD.close();
            } catch (IOException ignored) {}
        }
    }
}
