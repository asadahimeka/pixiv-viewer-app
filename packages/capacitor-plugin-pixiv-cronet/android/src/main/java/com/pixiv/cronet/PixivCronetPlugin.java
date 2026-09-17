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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
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
     * 总超时调度器：仅用于到时取消未完成的请求，不做任何 IO。
     * 旧实现用 latch.await 阻塞桥线程最长 30s，会让直连模式 API 串行化；
     * 现改为回调里 resolve/reject（回调跑在 Cronet executor 上，桥线程只占调度开销）。
     */
    private static final ScheduledExecutorService TIMEOUT_SCHEDULER = Executors.newSingleThreadScheduledExecutor();

    /**
     * HTTP 请求方法
     *
     * 参数:
     * - url: 请求 URL (必需)
     * - method: HTTP 方法, 默认 GET
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

        try {
            // 获取 Cronet 引擎
            Log.d(TAG, "Getting Cronet engine...");
            CronetEngine engine = CronetManager.getEngine(getContext());
            Log.d(TAG, "Got Cronet engine: " + (engine != null ? "OK" : "NULL"));

            ExecutorService executor = CronetManager.getExecutor();
            Log.d(TAG, "Got executor");

            // 初始化响应数据（每个请求独立持有，Cronet 保证同一请求的回调串行执行）
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            AtomicReference<Throwable> error = new AtomicReference<>();
            AtomicBoolean settled = new AtomicBoolean(false);
            AtomicReference<ScheduledFuture<?>> timeoutRef = new AtomicReference<>();

            // 构建请求
            Log.d(TAG, "Building URL request...");
            UrlRequest.Builder builder = engine.newUrlRequestBuilder(url, new UrlRequest.Callback() {
                @Override
                public void onRedirectReceived(UrlRequest req, UrlResponseInfo info, String newUrl) {
                    Log.d(TAG, "  ↳ redirect → " + newUrl);
                    req.followRedirect();
                }

                @Override
                public void onResponseStarted(UrlRequest req, UrlResponseInfo info) {
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
                    if (!settled.compareAndSet(false, true)) {
                        return;
                    }
                    cancelTimeout(timeoutRef);
                    resolveResponse(call, info, bos, method, url);
                }

                @Override
                public void onFailed(UrlRequest req, UrlResponseInfo info, CronetException e) {
                    Log.e(TAG, "  ✗ failed: " + e.getMessage());
                    if (!settled.compareAndSet(false, true)) {
                        return;
                    }
                    cancelTimeout(timeoutRef);
                    call.reject(e.getMessage());
                }

                @Override
                public void onCanceled(UrlRequest req, UrlResponseInfo info) {
                    Log.w(TAG, "  ✗ cancelled");
                    if (!settled.compareAndSet(false, true)) {
                        return;
                    }
                    cancelTimeout(timeoutRef);
                    Throwable err = error.get();
                    call.reject(err != null ? err.getMessage() : "Request cancelled");
                }
            }, executor);

            // 添加请求头
            if (headersObj != null) {
                Log.d(TAG, "Adding headers: " + headersObj.toString());
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
            Log.d(TAG, "Starting request...");
            urlRequest.start();

            // 总超时：到时仍未结束则取消请求并回调失败
            timeoutRef.set(TIMEOUT_SCHEDULER.schedule(() -> {
                if (settled.compareAndSet(false, true)) {
                    Log.e(TAG, "Request timed out after " + REQUEST_TIMEOUT_SECONDS + " seconds");
                    urlRequest.cancel();
                    call.reject("Request timed out after " + REQUEST_TIMEOUT_SECONDS + " seconds");
                }
            }, REQUEST_TIMEOUT_SECONDS, TimeUnit.SECONDS));

        } catch (Exception e) {
            Log.e(TAG, "Exception: " + e.getMessage(), e);
            call.reject("Error: " + e.getMessage());
        }
    }

    private static void cancelTimeout(AtomicReference<ScheduledFuture<?>> timeoutRef) {
        ScheduledFuture<?> future = timeoutRef.get();
        if (future != null) {
            future.cancel(false);
        }
    }

    /**
     * 构建并回传响应对象（跑在 Cronet 回调线程，call.resolve 线程安全）
     */
    private void resolveResponse(PluginCall call, UrlResponseInfo info, ByteArrayOutputStream bos, String method, String url) {
        if (info == null) {
            Log.e(TAG, "No response info");
            call.reject("No response received");
            return;
        }

        // 构建响应对象
        JSObject response = new JSObject();
        response.put("status", info.getHttpStatusCode());
        response.put("protocol", info.getNegotiatedProtocol());

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
        response.put("data", new String(responseBody));

        long totalSize = responseBody.length;
        Log.d(TAG, "←── " + method + " " + url + " " + info.getHttpStatusCode()
                + " " + info.getNegotiatedProtocol() + " [" + totalSize + " bytes]");

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
