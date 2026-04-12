package com.pixiv.cronet;

import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.chromium.net.CronetEngine;
import org.chromium.net.CronetException;
import org.chromium.net.UrlRequest;
import org.chromium.net.UrlResponseInfo;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Pixiv Cronet 插件
 * 
 * 通过 Cronet (Chromium 网络栈) 发送 HTTP 请求
 * - QUIC/HTTP3 (UDP) 绕过 TCP RST 封锁
 * - HostResolverRules 绕过 DNS 污染
 */
@CapacitorPlugin(name = "PixivCronet")
public class PixivCronetPlugin extends Plugin {
    
    private static final String TAG = "PixivCronetPlugin";
    private static final int MAX_RESPONSE_BYTES = 10 * 1024 * 1024; // 10MB
    private static final int REQUEST_TIMEOUT_SECONDS = 30;
    
    /**
     * HTTP 请求方法
     * 
     * 参数:
     * - url: 请求 URL (必需)
     * - method: HTTP 方法，默认 GET
     * - headers: 请求头对象
     * - body: 请求体字符串
     * 
     * 返回:
     * - status: HTTP 状态码
     * - headers: 响应头对象
     * - data: 响应体字符串
     * - protocol: 协商的协议 (h3/h2/http/1.1)
     */
    @PluginMethod
    public void request(PluginCall call) {
        String url = call.getString("url");
        if (url == null) {
            call.reject("url is required");
            return;
        }
        
        String method = call.getString("method", "GET");
        JSObject headersObj = call.getObject("headers");
        String body = call.getString("body");
        
        Log.d(TAG, "──→ " + method + " " + url);
        
        // 获取 Cronet 引擎
        CronetEngine engine = CronetManager.getEngine(getContext());
        ExecutorService executor = CronetManager.getExecutor();
        
        // 准备响应数据
        CountDownLatch latch = new CountDownLatch(1);
        ByteArrayOutputStream bos = new ByteArrayOutputStream();
        AtomicReference<Throwable> error = new AtomicReference<>();
        AtomicReference<UrlResponseInfo> responseInfo = new AtomicReference<>();
        AtomicReference<String> negotiatedProtocol = new AtomicReference<>();
        
        // 构建请求
        UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, new UrlRequest.Callback() {
            @Override
            public void onRedirectReceived(UrlRequest req, UrlResponseInfo info, String newUrl) {
                Log.d(TAG, "  ↳ redirect → " + newUrl);
                req.followRedirect();
            }
            
            @Override
            public void onResponseStarted(UrlRequest req, UrlResponseInfo info) {
                responseInfo.set(info);
                negotiatedProtocol.set(info.getNegotiatedProtocol());
                Log.d(TAG, "  ↳ response started [" + info.getHttpStatusCode() + "] " + info.getNegotiatedProtocol());
                req.read(ByteBuffer.allocateDirect(32768));
            }
            
            @Override
            public void onReadCompleted(UrlRequest req, UrlResponseInfo info, ByteBuffer buf) {
                buf.flip();
                int remaining = buf.remaining();
                if (bos.size() + remaining > MAX_RESPONSE_BYTES) {
                    error.set(new RuntimeException("Response exceeds " + MAX_RESPONSE_BYTES + " bytes"));
                    req.cancel();
                    latch.countDown();
                    return;
                }
                byte[] tmp = new byte[remaining];
                buf.get(tmp);
                bos.write(tmp, 0, remaining);
                buf.clear();
                req.read(buf);
            }
            
            @Override
            public void onSucceeded(UrlRequest req, UrlResponseInfo info) {
                Log.d(TAG, "  ↳ succeeded");
                latch.countDown();
            }
            
            @Override
            public void onFailed(UrlRequest req, UrlResponseInfo info, CronetException e) {
                Log.e(TAG, "  ✗ failed: " + e.getMessage());
                error.set(e);
                latch.countDown();
            }
            
            @Override
            public void onCanceled(UrlRequest req, UrlResponseInfo info) {
                Log.w(TAG, "  ✗ cancelled");
                if (error.get() == null) {
                    error.set(new RuntimeException("Request cancelled"));
                }
                latch.countDown();
            }
        }, executor);
        
        // 添加请求头
        if (headersObj != null) {
            Iterator<String> keys = headersObj.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                builder.addHeader(key, headersObj.getString(key));
            }
        }
        
        // 设置请求方法和 body
        if (body != null && !body.isEmpty()) {
            builder.setHttpMethod(method);
            builder.setUploadDataProvider(
                org.chromium.net.UploadDataProviders.create(body.getBytes()),
                executor
            );
        } else if (!"GET".equals(method)) {
            builder.setHttpMethod(method);
        }
        
        // 启动请求
        UrlRequest urlRequest = builder.build();
        urlRequest.start();
        
        try {
            if (!latch.await(REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS)) {
                urlRequest.cancel();
                call.reject("Request timed out after " + REQUEST_TIMEOUT_SECONDS + " seconds");
                return;
            }
        } catch (InterruptedException e) {
            urlRequest.cancel();
            call.reject("Request interrupted: " + e.getMessage());
            return;
        }
        
        // 处理错误
        if (error.get() != null) {
            call.reject(error.get().getMessage());
            return;
        }
        
        // 处理响应
        UrlResponseInfo info = responseInfo.get();
        if (info == null) {
            call.reject("No response received");
            return;
        }
        
        // 构建响应对象
        JSObject response = new JSObject();
        response.put("status", info.getHttpStatusCode());
        response.put("protocol", negotiatedProtocol.get());
        
        // 转换响应头
        JSObject responseHeaders = new JSObject();
        for (Map.Entry<String, List<String>> entry : info.getAllHeaders().entrySet()) {
            String key = entry.getKey();
            // 跳过 content-encoding 和 content-length，因为 body 已经被解压
            if ("content-encoding".equalsIgnoreCase(key) || "content-length".equalsIgnoreCase(key)) {
                continue;
            }
            List<String> values = entry.getValue();
            if (values != null && !values.isEmpty()) {
                responseHeaders.put(key, values.get(0));
            }
        }
        response.put("headers", responseHeaders);
        
        // 响应体
        byte[] responseBody = bos.toByteArray();
        String contentType = "application/json";
        if (responseHeaders.has("content-type")) {
            contentType = responseHeaders.getString("content-type");
        }
        response.put("data", new String(responseBody));
        
        long totalSize = responseBody.length;
        Log.d(TAG, "←── " + method + " " + url + " " + info.getHttpStatusCode() 
                + " " + negotiatedProtocol.get() + " [" + totalSize + " bytes]");
        
        call.resolve(response);
    }
    
    /**
     * 检查 Cronet 是否可用
     */
    @PluginMethod
    public void isAvailable(PluginCall call) {
        try {
            CronetEngine engine = CronetManager.getEngine(getContext());
            call.resolve(new JSObject().put("available", engine != null));
        } catch (Exception e) {
            call.resolve(new JSObject().put("available", false));
        }
    }
    
    @Override
    protected void handleOnDestroy() {
        // 插件销毁时关闭引擎
        CronetManager.shutdown();
        super.handleOnDestroy();
    }
}