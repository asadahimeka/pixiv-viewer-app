package com.pixiv.login;

import android.app.Activity;
import android.content.Intent;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import com.pixiv.login.network.DnsRefreshResult;
import com.pixiv.login.network.LocalLoginProxy;
import com.pixiv.login.network.PixivDnsUpdater;
import com.pixiv.login.network.PixivNetworkConfig;

import androidx.webkit.ProxyConfig;
import androidx.webkit.ProxyController;
import androidx.webkit.WebViewFeature;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Map;
import java.util.Scanner;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSocketFactory;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Pixiv 应用内官网登录插件
 *
 * - prepare: 启动本机 MITM 代理（IllustFerry LocalLoginProxy 移植）+ 动态 DoH IP 刷新
 *   + 通过 androidx.webkit ProxyController 把 WebView 的 pixiv 流量指到本机代理
 * - openLogin: 打开原生 WebView 登录页，截获 pixiv:// 回调中的授权 code
 * - request: 经本机代理发 HTTP（无 SNI 直连上游），作为 oauth.secure token 交换兜底通道
 *
 * 网络层移植自 IllustFerry（GPL-3.0），见 network/ 目录。
 */
@CapacitorPlugin(name = "PixivLoginProxy")
public class LoginProxyPlugin extends Plugin {

    private static final String TAG = "LoginProxyPlugin";
    private static final int PREFERRED_PORT = 7891;
    private static final int REQUEST_TIMEOUT_MS = 30_000;

    /** 代理单例：跨 bridge 重建保持生命周期，由 stop() 显式回收 */
    private static volatile LocalLoginProxy proxy;

    /** openLogin 的挂起调用：登录 Activity 结束时通过静态入口 resolve/reject */
    private static volatile PluginCall pendingLoginCall;

    @Override
    public void load() {
        PixivNetworkConfig.initPersistence(getContext());
    }

    static LocalLoginProxy currentProxy() {
        return proxy;
    }

    private LocalLoginProxy ensureProxy() {
        LocalLoginProxy p = proxy;
        if (p == null) {
            synchronized (LoginProxyPlugin.class) {
                p = proxy;
                if (p == null) {
                    p = new LocalLoginProxy(PREFERRED_PORT);
                    proxy = p;
                }
            }
        }
        if (!p.isRunning()) {
            p.start();
        }
        return p;
    }

    private static boolean isProxyOverrideSupported() {
        return WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE);
    }

    private static void setProxyOverride(int port) {
        if (!isProxyOverrideSupported()) return;
        ProxyConfig config = new ProxyConfig.Builder()
            .addProxyRule("127.0.0.1:" + port)
            .addDirect()
            .build();
        ProxyController.getInstance().setProxyOverride(config, Runnable::run, () -> {
            android.util.Log.d(TAG, "webview proxy override set to 127.0.0.1:" + port);
        });
    }

    private static void clearProxyOverride() {
        if (!isProxyOverrideSupported()) return;
        ProxyController.getInstance().clearProxyOverride(Runnable::run, () -> {
            android.util.Log.d(TAG, "webview proxy override cleared");
        });
    }

    /**
     * 准备登录环境。
     * useProxy=false 时仅清理 WebView 代理覆盖（直连模式）；
     * useProxy=true 时启动代理 + 刷新 DNS（绝不回退系统 DNS，失败即 reject）+ 设置代理覆盖。
     */
    @PluginMethod
    public void prepare(PluginCall call) {
        boolean useProxy = Boolean.TRUE.equals(call.getBoolean("useProxy", true));
        boolean supported = isProxyOverrideSupported();

        if (!useProxy) {
            clearProxyOverride();
            JSObject ret = new JSObject();
            ret.put("mode", "direct");
            ret.put("port", 0);
            ret.put("proxySupported", supported);
            call.resolve(ret);
            return;
        }

        LocalLoginProxy p;
        try {
            p = ensureProxy();
        } catch (Exception e) {
            call.reject("start local proxy failed: " + e.getMessage());
            return;
        }

        if (!supported) {
            // WebView 不支持 PROXY_OVERRIDE：代理对登录页无效，直接按直连模式继续
            clearProxyOverride();
            JSObject ret = new JSObject();
            ret.put("mode", "direct");
            ret.put("port", p.getPort());
            ret.put("proxySupported", false);
            ret.put("dnsSummary", "");
            call.resolve(ret);
            return;
        }

        DnsRefreshResult dns;
        try {
            dns = new PixivDnsUpdater().refresh();
            dns.requireAnyUpdated();
            PixivNetworkConfig.persist();
        } catch (Exception e) {
            call.reject("dns refresh failed: " + e.getMessage());
            return;
        }

        setProxyOverride(p.getPort());
        JSObject ret = new JSObject();
        ret.put("mode", "proxy");
        ret.put("port", p.getPort());
        ret.put("proxySupported", true);
        ret.put("dnsSummary", dns.getSummary());
        call.resolve(ret);
    }

    /** 手动重新刷新动态 Host IP 表（prepare 失败后的重试入口） */
    @PluginMethod
    public void refreshDns(PluginCall call) {
        try {
            DnsRefreshResult dns = new PixivDnsUpdater().refresh();
            dns.requireAnyUpdated();
            PixivNetworkConfig.persist();
            JSObject ret = new JSObject();
            JSObject updated = new JSObject();
            for (Map.Entry<String, String> entry : dns.getUpdated().entrySet()) {
                updated.put(entry.getKey(), entry.getValue());
            }
            JSObject errors = new JSObject();
            for (Map.Entry<String, String> entry : dns.getErrors().entrySet()) {
                errors.put(entry.getKey(), entry.getValue());
            }
            ret.put("updated", updated);
            ret.put("errors", errors);
            ret.put("summary", dns.getSummary());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("dns refresh failed: " + e.getMessage());
        }
    }

    /** 打开应用内登录 WebView，截获回调 code */
    @PluginMethod
    public void openLogin(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url required");
            return;
        }
        Activity activity = getActivity();
        if (activity == null) {
            call.reject("no foreground activity");
            return;
        }
        PluginCall previous = pendingLoginCall;
        if (previous != null) {
            previous.reject("cancelled", "superseded by a new login request");
        }
        call.save();
        pendingLoginCall = call;

        Intent intent = new Intent(activity, LoginWebViewActivity.class);
        intent.putExtra(LoginWebViewActivity.EXTRA_URL, url);
        intent.putExtra(LoginWebViewActivity.EXTRA_USE_PROXY, Boolean.TRUE.equals(call.getBoolean("useProxy", false)));
        activity.startActivity(intent);
    }

    /** 停止本机代理并清理 WebView 代理覆盖 */
    @PluginMethod
    public void stop(PluginCall call) {
        PluginCall dangling = pendingLoginCall;
        pendingLoginCall = null;
        if (dangling != null) {
            dangling.reject("cancelled", "login proxy stopped");
        }
        clearProxyOverride();
        LocalLoginProxy p = proxy;
        proxy = null;
        if (p != null) {
            p.stop();
        }
        call.resolve();
    }

    /**
     * 经本机代理发一次 HTTP 请求（MITM 无 SNI 直连上游）。
     * 供 JS 层在常规通道（axios/Cronet）失败后兜底换 token。
     */
    @PluginMethod
    public void request(PluginCall call) {
        String urlStr = call.getString("url");
        if (urlStr == null || urlStr.isEmpty()) {
            call.reject("url required");
            return;
        }
        try {
            LocalLoginProxy p = ensureProxy();
            URL url = new URL(urlStr);
            String host = url.getHost();
            // 关键 host 没有动态 IP 时先尽力刷一次（代理上游只认 IP 表，绝不走系统 DNS）
            if (!PixivNetworkConfig.hasAddressFor(host)) {
                try {
                    DnsRefreshResult dns = new PixivDnsUpdater().refresh();
                    dns.requireAnyUpdated();
                    PixivNetworkConfig.persist();
                } catch (Exception ignore) {
                    // 表依旧为空则由后续拨号报错
                }
            }

            Proxy proxySetting = new Proxy(Proxy.Type.HTTP, new InetSocketAddress("127.0.0.1", p.getPort()));
            HttpURLConnection conn = (HttpURLConnection) url.openConnection(proxySetting);
            if (conn instanceof HttpsURLConnection) {
                HttpsURLConnection https = (HttpsURLConnection) conn;
                https.setSSLSocketFactory(buildPermissiveSslFactory());
                https.setHostnameVerifier(permissiveHostnameVerifier);
            }
            int timeout = call.getInt("timeout", REQUEST_TIMEOUT_MS) != null
                ? call.getInt("timeout", REQUEST_TIMEOUT_MS)
                : REQUEST_TIMEOUT_MS;
            conn.setConnectTimeout(timeout);
            conn.setReadTimeout(timeout);
            String method = call.getString("method", "GET");
            if (method == null || method.isEmpty()) method = "GET";
            conn.setRequestMethod(method);

            JSObject headers = call.getObject("headers");
            if (headers != null) {
                java.util.Iterator<String> keys = headers.keys();
                while (keys.hasNext()) {
                    String key = keys.next();
                    if ("Host".equalsIgnoreCase(key) || "Content-Length".equalsIgnoreCase(key)) continue;
                    conn.setRequestProperty(key, headers.optString(key, ""));
                }
            }

            String body = call.getString("body");
            if (body != null && !"GET".equalsIgnoreCase(method) && !"HEAD".equalsIgnoreCase(method)) {
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                conn.setDoOutput(true);
                conn.setFixedLengthStreamingMode(bytes.length);
                OutputStream os = conn.getOutputStream();
                os.write(bytes);
                os.flush();
                os.close();
            }

            int status = conn.getResponseCode();
            String payload = readStream(status >= 400 ? conn.getErrorStream() : conn.getInputStream());
            conn.disconnect();

            JSObject ret = new JSObject();
            ret.put("status", status);
            ret.put("body", payload);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("proxy request failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        call.resolve(ret);
    }

    /** 登录 Activity 截获 code 后回传（静态入口，供 Activity 调用） */
    static void resolveLogin(String code) {
        PluginCall call = pendingLoginCall;
        pendingLoginCall = null;
        if (call != null) {
            JSObject ret = new JSObject();
            ret.put("code", code);
            call.resolve(ret);
        }
        // WebView 已关闭：清掉全局代理覆盖（代理本体留给 request() 兜底用，由 JS stop() 决定停不停）
        clearProxyOverride();
    }

    /** 登录 Activity 被用户关闭/异常结束（静态入口，供 Activity 调用） */
    static void cancelLogin() {
        PluginCall call = pendingLoginCall;
        pendingLoginCall = null;
        if (call != null) {
            call.reject("cancelled", "user cancelled login");
        }
        clearProxyOverride();
    }

    private static String readStream(java.io.InputStream stream) {
        if (stream == null) return "";
        try (Scanner scanner = new Scanner(stream, "UTF-8").useDelimiter("\\A")) {
            return scanner.hasNext() ? scanner.next() : "";
        } catch (Exception e) {
            return "";
        }
    }

    private static final HostnameVerifier permissiveHostnameVerifier = (hostname, session) -> true;

    /**
     * 仅信任本机 MITM 证书链的 permissive 工厂。
     * 上游 TLS 由代理侧终止后无 SNI 重拨（目标 IP 来自自维护动态表），
     * 与 IllustFerry 的 PixivUnsafeTls + 内存 CA 是同一威胁模型。
     */
    private static SSLSocketFactory buildPermissiveSslFactory() throws Exception {
        TrustManager permissive = new X509TrustManager() {
            @Override
            public void checkClientTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public void checkServerTrusted(X509Certificate[] chain, String authType) {
            }

            @Override
            public X509Certificate[] getAcceptedIssuers() {
                return new X509Certificate[0];
            }
        };
        SSLContext context = SSLContext.getInstance("TLS");
        context.init(null, new TrustManager[]{permissive}, new SecureRandom());
        return context.getSocketFactory();
    }
}
