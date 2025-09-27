package com.agorapulse.capacitor.mediastore;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
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

    public String saveToDownloads(Context context, String filename, String path) throws Exception {
        Path filePath = Paths.get(path);
        if (filename == null) {
            filename = filePath.getFileName().toString();
        }
        Long size = Files.size(filePath);
        String mimeType = Files.probeContentType(filePath);

        ContentResolver resolver = context.getContentResolver();
        ContentValues contentValues = new ContentValues();
        contentValues.put(MediaStore.Downloads.DISPLAY_NAME, filename);
        contentValues.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        contentValues.put(MediaStore.Downloads.SIZE, size);
        Uri targetUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);

        copyFile(resolver, path, targetUri);

        return targetUri.toString();
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
        FileInputStream input;
        try {
            ParcelFileDescriptor sourceFD = resolver.openFileDescriptor(Uri.fromFile(new File(inputPath)), "r", null);
            input = new FileInputStream(sourceFD.getFileDescriptor());
        } catch (Exception e) {
            resolver.delete(outputUri, null, null);
            throw new Exception("Unable to read file from path " + inputPath + " - " + e.getMessage());
        }

        try {
            ParcelFileDescriptor targetFD = resolver.openFileDescriptor(outputUri, "w", null);
            FileOutputStream output = new FileOutputStream(targetFD.getFileDescriptor());

            byte[] buffer = new byte[1024];
            int len;
            while ((len = input.read(buffer)) > 0) {
                output.write(buffer, 0, len);
            }
            output.flush();
            input.close();
            output.close();
        } catch (Exception e) {
            resolver.delete(outputUri, null, null);
            throw  new Exception("Unable to write file - " + e.getMessage());
        }
    }
}
