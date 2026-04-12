package com.pixiv.cronet;

import android.content.Context;
import android.util.Log;

import org.chromium.net.CronetEngine;
import org.chromium.net.ExperimentalCronetEngine;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Cronet 引擎管理器
 * 
 * 核心配置直接复用自 Pixiv-Shaft:
 * - HostResolverRules: 域名 → IP 直接映射
 * - QUIC/HTTP3: 启用 UDP 绕过 TCP RST 封锁
 */
public class CronetManager {
    
    private static final String TAG = "PixivCronet";
    
    // Cloudflare Anycast IPs for Pixiv API（来自 Pixiv-Shaft CronetInterceptor.java）
    public static final String CF_IP_PRIMARY = "104.18.42.239";
    public static final String CF_IP_SECONDARY = "172.64.145.17";
    
    private static CronetEngine sEngine;
    private static final ExecutorService sExecutor = Executors.newFixedThreadPool(4);
    
    /**
     * 获取 Cronet 引擎单例
     */
    public static CronetEngine getEngine(Context context) {
        if (sEngine == null) {
            synchronized (CronetManager.class) {
                if (sEngine == null) {
                    try {
                        sEngine = buildEngine(context);
                        Log.d(TAG, "Cronet engine initialized successfully");
                    } catch (Exception e) {
                        Log.e(TAG, "Failed to initialize Cronet engine: " + e.getMessage(), e);
                        throw e;
                    }
                }
            }
        }
        return sEngine;
    }
    
    /**
     * 获取执行器
     */
    public static ExecutorService getExecutor() {
        return sExecutor;
    }
    
    /**
     * 构建 Cronet 引擎
     * 
     * 配置要点:
     * 1. enableQuic(true) - 启用 QUIC/HTTP3，绕过 TCP RST 封锁
     * 2. HostResolverRules - 将 pixiv.net 域名映射到 Cloudflare IP
     */
    private static CronetEngine buildEngine(Context context) {
        // HostResolverRules: 域名 → IP 直接映射
        String rules = "MAP app-api.pixiv.net " + CF_IP_PRIMARY + ","
                     + " MAP oauth.secure.pixiv.net " + CF_IP_PRIMARY;
        String experimental = "{\"HostResolverRules\":{\"host_resolver_rules\":\"" + rules + "\"}}";
        
        // 创建 Cronet 缓存目录
        File cacheDir = new File(context.getCacheDir(), "pixiv-cronet");
        if (!cacheDir.exists()) {
            boolean created = cacheDir.mkdirs();
            Log.d(TAG, "Cache dir created: " + created + ", path: " + cacheDir.getAbsolutePath());
        }
        
        Log.d(TAG, "Cronet config - QUIC: true, HTTP2: true");
        Log.d(TAG, "Cronet config - QuicHints: app-api.pixiv.net:443, oauth.secure.pixiv.net:443");
        Log.d(TAG, "Cronet config - experimental: " + experimental);
        
        ExperimentalCronetEngine.Builder builder = new ExperimentalCronetEngine.Builder(context)
                .enableQuic(true)                    // 启用 QUIC/HTTP3
                .enableHttp2(true)                   // 启用 HTTP/2
                .setStoragePath(cacheDir.getAbsolutePath())
                .addQuicHint("app-api.pixiv.net", 443, 443)
                .addQuicHint("oauth.secure.pixiv.net", 443, 443)
                .setExperimentalOptions(experimental);
        
        Log.d(TAG, "Building Cronet engine...");
        CronetEngine engine = builder.build();
        Log.d(TAG, "Cronet engine built successfully");
        
        return engine;
    }
    
    /**
     * 关闭引擎
     */
    public static void shutdown() {
        if (sEngine != null) {
            sEngine.shutdown();
            sEngine = null;
        }
        sExecutor.shutdown();
    }
}