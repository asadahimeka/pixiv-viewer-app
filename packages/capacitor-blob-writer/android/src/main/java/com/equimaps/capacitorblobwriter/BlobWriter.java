package com.equimaps.capacitorblobwriter;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.NativePlugin;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;

import java.io.File;
import java.io.IOException;
import java.util.Random;

@NativePlugin()
public class BlobWriter extends Plugin {
    private BlobWriterServer server = null;

    @Override
    public void load() {
        super.load();

        // listen on an open port
        int retriesLeft = 5;
        File tmpDir = this.getContext().getCacheDir();

        // range of private ports
        int startPort = 49151;
        int endPort = 65536;
        Random random = new Random();

        while (this.server == null && retriesLeft > 0) {
            // select a random private port
            int port = startPort + random.nextInt(endPort - startPort);

            BlobWriterServer server = new BlobWriterServer(port, getLogTag(), tmpDir);

            try {
                server.start();
                Log.d(getLogTag(), "Listening at http://localhost:" + port);
                this.server = server;
            } catch (IOException ex) {
                Log.e(getLogTag(), "Failed to start server on port " + port, ex);
            }

            retriesLeft--;
        }
    }

    @PluginMethod()
    public void get_config(PluginCall call) {
        if (this.server != null) {
            JSObject ret = new JSObject();
            ret.put("base_url", "http://localhost:" + this.server.getListeningPort());
            ret.put("auth_token", this.server.getAuthToken());
            call.resolve(ret);
        } else {
            call.reject("Server not running", "server_down");
        }
    }
}
