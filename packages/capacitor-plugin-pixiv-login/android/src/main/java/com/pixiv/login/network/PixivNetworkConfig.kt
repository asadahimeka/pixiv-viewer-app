/*
 * Ported from IllustFerry (https://github.com/peasoft/IllustFerry) — GPL-3.0
 * Original: app/src/main/java/JunZi/Pixiv/data/network/PixivNetworkConfig.kt
 * 移植改动：新增 SharedPreferences 持久化（替换原项目 TokenStore），
 * initPersistence(context) 由插件在 initialize 时调用。
 */
package com.pixiv.login.network

import android.content.Context
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

object PixivNetworkConfig {
    private const val PREFS_NAME = "pixiv_login_proxy"
    private const val PREF_KEY_IPS = "host_ips"

    private var appContext: Context? = null

    /**
     * `host -> 实时 IP 列表` 缓存。由 [PixivDnsUpdater] 拉取，启动时可从本地持久化缓存恢复。
     * 兼容路由开启时，调用方拿到空列表必须等待刷新或直接失败，不能回退系统 DNS。
     */
    private val hostToIps = ConcurrentHashMap<String, List<String>>()

    @Volatile
    var useHostIpRouting: Boolean = true

    @Volatile
    var isVpnActive: Boolean = false

    fun shouldUseCompatibilityClient(): Boolean = true

    /** 由插件在初始化时调用：恢复上次持久化的 IP 表 */
    @JvmStatic
    fun initPersistence(context: Context) {
        appContext = context.applicationContext
        loadPersisted()
    }

    private fun loadPersisted() {
        val ctx = appContext ?: return
        runCatching {
            val raw = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .getString(PREF_KEY_IPS, null) ?: return
            val json = JSONObject(raw)
            val map = linkedMapOf<String, List<String>>()
            json.keys().forEach { host ->
                val ips = mutableListOf<String>()
                val arr = json.optJSONArray(host) ?: return@forEach
                for (i in 0 until arr.length()) {
                    arr.optString(i).takeIf { it.isNotBlank() }?.let { ips.add(it) }
                }
                if (ips.isNotEmpty()) map[host] = ips
            }
            if (map.isNotEmpty()) replaceAll(map)
        }
    }

    @JvmStatic
    fun persist() {
        val ctx = appContext ?: return
        runCatching {
            val json = JSONObject()
            snapshotIps().forEach { (host, ips) -> json.put(host, org.json.JSONArray(ips)) }
            ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                .edit()
                .putString(PREF_KEY_IPS, json.toString())
                .apply()
        }
    }

    fun ipFor(host: String?): String? {
        if (!shouldUseCompatibilityClient()) return null
        return addressesFor(host).firstOrNull()
    }

    fun addressesFor(host: String?): List<String> {
        if (!shouldUseCompatibilityClient()) return emptyList()
        val normalized = host?.trim()?.lowercase()?.removeSuffix(".") ?: return emptyList()
        hostToIps[normalized]?.let { return it }
        // *.pximg.net / *.pixivision.net 这两类子域和主域共用同一组 IP，
        // 命中主域的运行时记录就直接复用；其它通配 host 在缓存里没值时返回空，
        // 由调用方等待动态路由就绪或对非 Pixiv 域名显式走普通网络路径。
        return when {
            normalized.endsWith(".pximg.net") -> hostToIps[PixivHost.Image.rawHost].orEmpty()
            normalized.endsWith(".pixivision.net") -> hostToIps[PixivHost.Pixivision.rawHost].orEmpty()
            else -> emptyList()
        }
    }

    fun update(host: PixivHost, ip: String) {
        update(host, listOf(ip))
    }

    fun update(host: PixivHost, ips: List<String>) {
        val cleaned = ips.map { it.trim() }
            .filter { isValidPublicIpv4(it) }
            .distinct()
        if (cleaned.isNotEmpty()) {
            hostToIps[host.rawHost] = cleaned
        }
    }

    fun replaceAll(hostIps: Map<String, List<String>>) {
        hostToIps.clear()
        hostIps.forEach { (host, ips) ->
            val normalized = host.trim().lowercase().removeSuffix(".")
            val cleaned = ips.map { it.trim() }
                .filter { isValidPublicIpv4(it) }
                .distinct()
            if (normalized.isNotBlank() && cleaned.isNotEmpty()) {
                hostToIps[normalized] = cleaned
            }
        }
    }

    fun hasAnyAddress(): Boolean = hostToIps.isNotEmpty()

    @JvmStatic
    fun hasAddressFor(host: String): Boolean = addressesFor(host).isNotEmpty()

    fun requiresDynamicRoute(host: String?): Boolean {
        val normalized = host?.trim()?.lowercase()?.removeSuffix(".") ?: return false
        return PixivHost.from(normalized) != null ||
            normalized.endsWith(".pximg.net") ||
            normalized.endsWith(".pixivision.net")
    }

    fun snapshot(): Map<String, String> = hostToIps
        .toSortedMap()
        .mapValues { (_, ips) -> ips.joinToString(",") }

    fun snapshotIps(): Map<String, List<String>> = hostToIps
        .toSortedMap()
        .mapValues { (_, ips) -> ips.toList() }

    private val IPV4_REGEX = Regex("""\d{1,3}(\.\d{1,3}){3}""")

    /**
     * 校验 IPv4 字面量且拒绝 bogon 段。DNS 源（api.sb6.me）偶尔会被 GFW 投毒返回
     * 127.0.0.1 / 0.0.0.0 这类地址，若原样进表，LocalLoginProxy 上游拨号就会拨到
     * 127.0.0.1:443 触发 ECONNREFUSED。pixiv 的 Tokyo 源站都是公网 IP，过滤 bogon
     * 不会误伤真实候选。
     */
    fun isValidPublicIpv4(ip: String): Boolean {
        if (!IPV4_REGEX.matches(ip)) return false
        val octets = ip.split('.')
        if (octets.size != 4 || octets.any { it.toIntOrNull() !in 0..255 }) return false
        val first = octets[0].toInt()
        val second = octets[1].toInt()
        return when {
            first == 0 -> false                       // 0.0.0.0/8
            first == 10 -> false                      // 10.0.0.0/8
            first == 127 -> false                     // 127.0.0.0/8 loopback
            first == 169 && second == 254 -> false    // 169.254.0.0/16 link-local
            first == 172 && second in 16..31 -> false // 172.16.0.0/12 private
            first == 192 && second == 168 -> false    // 192.168.0.0/16 private
            first in 224..239 -> false                // 224.0.0.0/4 multicast
            first in 240..255 -> false                // 240.0.0.0/4 reserved + 255.255.255.255
            else -> true
        }
    }
}
