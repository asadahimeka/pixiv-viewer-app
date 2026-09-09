package com.equimaps.capacitorblobwriter;

import android.os.StrictMode;
import android.util.Log;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.channels.FileChannel;
import java.util.List;
import java.util.UUID;

import fi.iki.elonen.NanoHTTPD;

public class BlobWriterServer extends NanoHTTPD {
    private String logTag = null;
    private File tmpDir = null;
    private String authToken = UUID.randomUUID().toString();

    public BlobWriterServer(int port, String logTag, File tmpDir) {
        super(port);

        this.tmpDir = tmpDir;
        this.logTag = logTag;
    }

    public String getAuthToken() {
        return authToken;
    }

    public Response newCorsResponse(Response.IStatus status, IHTTPSession session) {
        String origin = session.getHeaders().get("origin");
        Response response = newFixedLengthResponse(status, "text/plain", null, 0);

        // disables Gzip and thereby fixes weird timing-based broken pipe exceptions
        response.addHeader("Content-Length", "0");

        if (origin != null) {
            response.addHeader("Access-Control-Allow-Origin", origin);
            response.addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, HEAD, OPTIONS");

            String requestHeaders = session.getHeaders().get("access-control-request-headers");
            if (requestHeaders != null) {
                response.addHeader("Access-Control-Allow-Headers", requestHeaders);
            }
        }

        return response;
    }

    @Override
    public Response serve(IHTTPSession session) {
        Log.d(logTag, session.getMethod().toString() + " " + session.getUri());

        if (session.getMethod() == Method.PUT) {
            // ensure request is coming from the app
            String auth = session.getHeaders().get("authorization");
            if (!auth.equals(this.authToken)) {
                return newCorsResponse(Response.Status.UNAUTHORIZED, session);
            }

            long contentLength;

            try {
                contentLength = Long.parseLong(
                        session.getHeaders().get("content-length")
                );
            } catch (NumberFormatException ex) {
                Log.e(logTag, "bad content-length", ex);
                return newCorsResponse(Response.Status.BAD_REQUEST, session);
            }

            String destPath = session.getUri();
            File destFile = new File(destPath);

            try {
                // write input stream to temp file
                String tmpName = UUID.randomUUID().toString();
                File tmpFile = File.createTempFile(tmpName, null, tmpDir);
                tmpFile.deleteOnExit();

                // any smaller than this and performance suffers noticeably on my Samsung A5
                int chunkSize = 512 * 1024;
                byte[] buf = new byte[chunkSize];
                int bytesRead;
                long totalBytesRead = 0;
                InputStream in = session.getInputStream();
                OutputStream out = new FileOutputStream(tmpFile);
                try {
                    // reading from a finished input stream causes a socket timeout error
                    while (totalBytesRead < contentLength && (bytesRead = in.read(buf)) > 0) {
                        out.write(buf, 0, bytesRead);
                        totalBytesRead += bytesRead;
                    }
                } finally {
                    out.close();
                }

                List<String> recursiveParam = session.getParameters().get("recursive");

                if (recursiveParam != null && recursiveParam.contains("true")) {
                    destFile.getParentFile().mkdirs();
                }

                // Move the file into place.
                // Note: java.io.File.renameTo never throws checked exceptions on Android - it
                // simply returns false on any failure (cross-device, ETXTBSY, EXDEV...), so the
                // copy fallback below covers every rename failure mode.
                if (!tmpFile.renameTo(destFile)) {
                    // If 'tmpFile' and 'destFile' exist on different mount points, 'renameTo' will
                    // fail. Let's try an alternative strategy.

                    // The simpler approach, using the 'move' method, requires Android Q (API level
                    // 26). For backwards compatibility, we create some "channels" and use the
                    // 'transferTo' method instead.

                    // Files.move(tmpFile.toPath(), destFile.toPath(), null);

                    FileChannel tmpChannel = new FileInputStream(tmpFile).getChannel();
                    FileChannel destChannel = new FileOutputStream(destFile).getChannel();
                    try {
                        tmpChannel.transferTo(0, tmpChannel.size(), destChannel);
                    } finally {
                        tmpChannel.close();
                        destChannel.close();
                        tmpFile.delete();
                    }
                }
            } catch (Exception ex) {
                Log.e(logTag, "failed to write file", ex);
                return newCorsResponse(Response.Status.INTERNAL_ERROR, session);
            }

            // 204 response
            return newCorsResponse(Response.Status.NO_CONTENT, session);
        } else if (session.getMethod() == Method.OPTIONS) {
            return newCorsResponse(Response.Status.OK, session);
        }

        return newCorsResponse(Response.Status.METHOD_NOT_ALLOWED, session);
    }
}
