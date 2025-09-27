package org.eu.cocomi.pxvek;

import android.annotation.SuppressLint;
import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.BridgeActivity;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

import java.security.KeyManagementException;
import java.security.NoSuchAlgorithmException;
import java.security.cert.CertificateException;
import java.security.cert.X509Certificate;

public class MainActivity extends BridgeActivity {
    // 定义一个常量作为 Preferences 中的键名
    private static final String SKIP_SSL_VERIFICATION_KEY = "skip_ssl_verification";

    @Override
    public void onStart() {
        super.onStart();

        // 1. 从 Preferences 中读取设置
        // Capacitor 的 Preferences 插件在 Android 上默认使用 "CapacitorStorage" 作为文件名
        SharedPreferences preferences = getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        // 读取设置，如果不存在，默认为 false (即默认开启SSL验证)
        boolean shouldSkipSslVerification = Boolean.parseBoolean(preferences.getString(SKIP_SSL_VERIFICATION_KEY, "false"));
        // 2. 根据设置决定是否跳过SSL验证
        if (shouldSkipSslVerification) {
            // 只有当开关为 true 时，才执行以下不安全的代码
            disableSslVerification();
        }
    }

    /**
     * ⚠️ 警告：此方法会禁用所有SSL证书和主机名验证，非常不安全，仅用于开发或特定环境！
     */
    private void disableSslVerification() {
        try {
            // 创建一个信任所有证书的 TrustManager
            @SuppressLint("CustomX509TrustManager") TrustManager[] trustAllCerts = new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() {
                  return new X509Certificate[0];
                }

                @SuppressLint("TrustAllX509TrustManager")
                @Override
                public void checkClientTrusted(X509Certificate[] certs, String authType) throws CertificateException {
                    // Not implemented
                    // 不做任何检查，信任所有客户端证书
                }
                @Override
                public void checkServerTrusted(X509Certificate[] certs, String authType) throws CertificateException {
                    // Not implemented
                    // 不做任何检查，信任所有服务器证书
                }
            }};

            // 安装这个 TrustManager
            SSLContext sc = SSLContext.getInstance("TLS");

            sc.init(null, trustAllCerts, new java.security.SecureRandom());

            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            // 安装一个信任所有主机名的 HostnameVerifier
            HttpsURLConnection.setDefaultHostnameVerifier(new HostnameVerifier() {
                @SuppressLint("BadHostnameVerifier")
                @Override
                public boolean verify(String hostname, SSLSession session) {
                    return true;
                }
            });
        } catch (KeyManagementException | NoSuchAlgorithmException e) {
            e.printStackTrace();
        }
    }
}
