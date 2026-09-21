package com.pixiv.login;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Bitmap;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.SslErrorHandler;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import com.pixiv.login.network.LocalLoginProxy;

/**
 * 应用内 Pixiv 登录 WebView。
 *
 * 行为对齐 IllustFerry WebLoginScreen：
 * - JS + DOMStorage 开启
 * - shouldOverrideUrlLoading / onPageStarted 双重拦截 pixiv:// / pixiv-inner:// /
 *   app-api.pixiv.net/web/v1/users/auth/pixiv/callback 回调，从 query 或 fragment 提取 code
 * - 命中 code 后 return true 不再加载，回传插件并结束
 * - MITM 模式下 onReceivedSslError 一律 proceed（本机内存 CA 不受信，威胁模型同 IllustFerry）；
 *   直连模式 cancel，保持严格校验
 */
public class LoginWebViewActivity extends Activity {

    public static final String EXTRA_URL = "url";
    public static final String EXTRA_USE_PROXY = "useProxy";

    private static final String CALLBACK_HOST = "app-api.pixiv.net";
    private static final String CALLBACK_PATH = "/web/v1/users/auth/pixiv/callback";

    private WebView webView;
    private boolean useProxy = false;
    private boolean codeHandled = false;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        useProxy = getIntent().getBooleanExtra(EXTRA_USE_PROXY, false);
        String url = getIntent().getStringExtra(EXTRA_URL);

        webView = new WebView(this);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        // 登录流程涉及 accounts.pixiv.net <-> app-api.pixiv.net 的会话 cookie，按浏览器惯例放开
        try {
            CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);
        } catch (Exception ignore) {
            // 低版本 CookieManager 无此 API 时忽略
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return handleUrl(request.getUrl().toString());
            }

            // API < 24 的兼容重载（minSdk 22）
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageStarted(WebView view, String url, Bitmap favicon) {
                // 某些跳转不触发 shouldOverrideUrlLoading，onPageStarted 兜底
                handleUrl(url);
                super.onPageStarted(view, url, favicon);
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                String host = "";
                try {
                    host = Uri.parse(error.getUrl()).getHost();
                } catch (Exception ignore) {
                }
                if (useProxy) {
                    // 本机内存 CA 签发的叶子证书不被 WebView 信任，proceed 放行。
                    // 与 IllustFerry 相同的威胁模型声明：登录会话期间 TLS 不做端到端校验。
                    LocalLoginProxy p = LoginProxyPlugin.currentProxy();
                    if (p != null) {
                        p.noteWebViewEvent("ssl proceed host=" + host
                            + " primary=" + error.getPrimaryError() + " trust-all");
                    }
                    handler.proceed();
                } else {
                    LocalLoginProxy p = LoginProxyPlugin.currentProxy();
                    if (p != null) {
                        p.noteWebViewEvent("ssl cancel host=" + host
                            + " primary=" + error.getPrimaryError() + " direct-mode-strict");
                    }
                    handler.cancel();
                    toast("SSL error: " + host);
                }
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // 只关心主框架失败：子资源（广告域 502、被 proceed 的旧失败）与页面可用性无关
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && request != null && request.isForMainFrame()) {
                    CharSequence desc = error != null ? error.getDescription() : "";
                    toast("Load failed: " + desc);
                }
                super.onReceivedError(view, request, error);
            }

            @Override
            public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                // 广告/统计域被代理 502 短路属预期，不提示
                super.onReceivedHttpError(view, request, response);
            }
        });

        setContentView(webView);
        if (url != null && !url.isEmpty()) {
            webView.loadUrl(url);
        }
    }

    private boolean handleUrl(String url) {
        if (url == null || codeHandled) return codeHandled;
        Uri uri;
        try {
            uri = Uri.parse(url);
        } catch (Exception e) {
            return false;
        }
        String code = extractCode(uri);
        if (code != null) {
            codeHandled = true;
            LocalLoginProxy p = LoginProxyPlugin.currentProxy();
            if (p != null) {
                p.noteWebViewEvent("login code captured, finishing activity");
            }
            LoginProxyPlugin.resolveLogin(code);
            finish();
            return true;
        }
        return false;
    }

    /**
     * 移植自 IllustFerry CommonComponents.extractPixivCode：
     * 匹配 pixiv:// / pixiv-inner:// scheme，或官方 callback 域名+路径，
     * 优先取 query 中的 code，回退到 fragment。
     */
    private static String extractCode(Uri uri) {
        String scheme = uri.getScheme();
        boolean isCallback = "pixiv".equals(scheme)
            || "pixiv-inner".equals(scheme)
            || (CALLBACK_HOST.equals(uri.getHost()) && CALLBACK_PATH.equals(uri.getPath()));
        if (!isCallback) return null;
        String code = uri.getQueryParameter("code");
        if (code != null && !code.isEmpty()) return code;
        String fragment = uri.getFragment();
        if (fragment == null || fragment.isEmpty()) return null;
        try {
            return Uri.parse("https://local.pixiv.login/?" + fragment).getQueryParameter("code");
        } catch (Exception e) {
            return null;
        }
    }

    private void toast(String message) {
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show();
    }

    @Override
    protected void onDestroy() {
        if (!codeHandled) {
            LoginProxyPlugin.cancelLogin();
        }
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
