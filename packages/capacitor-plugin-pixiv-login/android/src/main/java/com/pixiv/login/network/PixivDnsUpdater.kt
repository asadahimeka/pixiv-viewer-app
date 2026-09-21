/*
 * Ported from IllustFerry (https://github.com/peasoft/IllustFerry) — GPL-3.0
 * Original: app/src/main/java/JunZi/Pixiv/data/network/PixivDnsUpdater.kt
 * 移植改动：去掉 OkHttp / Gson / kotlinx.coroutines 依赖，
 * 改为 HttpURLConnection + org.json，方法直接在调用线程执行（Capacitor 桥自带线程池）。
 * 与上游的行为差异：查询目标从"public-api 一查全族复用"改为逐 host 各自解析——
 * pixiv 源站已对无 SNI 一律 403，登录链路必须按 host 拿到各自的 Cloudflare anycast IP
 * 后带 SNI 直拨（见 LocalLoginProxy.createUpstreamTlsSocket）；刷新并行化以缩短 prepare 耗时。
 */
package com.pixiv.login.network

import org.json.JSONArray
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.util.concurrent.Executors

data class DnsRefreshResult(
    val updated: Map<String, String>,
    val errors: Map<String, String>,
) {
    val summary: String
        get() = buildString {
            append("更新 ${updated.size} 个 host")
            if (errors.isNotEmpty()) append("，失败 ${errors.size} 个")
        }

    fun requireAnyUpdated(): DnsRefreshResult {
        if (updated.isNotEmpty()) return this
        val detail = errors.entries.joinToString("; ") { (host, error) -> "$host: $error" }
        throw IOException("动态 Host IP 获取失败${detail.takeIf { it.isNotBlank() }?.let { "：$it" }.orEmpty()}")
    }
}

class PixivDnsUpdater {

    fun refresh(): DnsRefreshResult {
        val updated = linkedMapOf<String, String>()
        val errors = linkedMapOf<String, String>()
        val lock = Any()
        val pool = Executors.newFixedThreadPool(minOf(6, QUERY_TARGETS.size))
        try {
            val futures = QUERY_TARGETS.map { target ->
                pool.submit {
                    val result = runCatching { resolve(target.queryHost) }
                    val ips = result.getOrNull()
                    synchronized(lock) {
                        if (!ips.isNullOrEmpty()) {
                            target.apply(ips)
                            target.affectedHosts.forEach { updated[it.rawHost] = ips.joinToString(",") }
                        } else {
                            errors[target.queryHost] = result.exceptionOrNull()?.message.orEmpty().ifBlank { "解析失败" }
                        }
                    }
                }
            }
            futures.forEach { runCatching { it.get() } }
        } finally {
            pool.shutdown()
        }

        return DnsRefreshResult(updated = updated, errors = errors)
    }

    private fun resolve(host: String): List<String> {
        val answers = request(host)
            .filter { it.isIpAddress() }
            .distinct()
        if (answers.isNotEmpty()) return answers
        throw IOException("No DNS answer")
    }

    private fun request(host: String): List<String> {
        val url = DNS_ENDPOINT +
            "?host=" + URLEncoder.encode(host, "UTF-8") +
            "&isCN=0"
        var conn: HttpURLConnection? = null
        try {
            conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 8_000
            conn.readTimeout = 12_000
            conn.requestMethod = "GET"
            val code = conn.responseCode
            val payload = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (code !in 200..299) {
                throw IOException("HTTP $code: ${payload.take(120)}")
            }
            val arr = JSONArray(payload)
            return (0 until arr.length()).mapNotNull { arr.optString(it).takeIf(String::isNotBlank) }
        } finally {
            conn?.disconnect()
        }
    }

    private fun String.isIpAddress(): Boolean {
        return matches(IPV4_REGEX)
    }

    private data class DnsTarget(
        val queryHost: String,
        val affectedHosts: List<PixivHost>,
    ) {
        fun apply(ips: List<String>) {
            affectedHosts.forEach { PixivNetworkConfig.update(it, ips) }
        }
    }

    private companion object {
        const val DNS_ENDPOINT = "https://api.sb6.me/getdnsipv4"
        val IPV4_REGEX = Regex("""\d{1,3}(\.\d{1,3}){3}""")

        // 逐 host 各自查询。登录链路涉及的 app-api / oauth / accounts / www / source 均为
        // Cloudflare anycast（104.18.42.239 / 172.64.145.17 一族），必须配 SNI 路由；
        // public-api 单查（无 SNI 场景下源站 default vhost 只服它）。图片域照旧。
        val QUERY_TARGETS = listOf(
            DnsTarget(PixivHost.AppApi.rawHost, listOf(PixivHost.AppApi)),
            DnsTarget(PixivHost.OAuth.rawHost, listOf(PixivHost.OAuth)),
            DnsTarget(PixivHost.Accounts.rawHost, listOf(PixivHost.Accounts)),
            DnsTarget(PixivHost.Web.rawHost, listOf(PixivHost.Web)),
            DnsTarget(PixivHost.Source.rawHost, listOf(PixivHost.Source)),
            DnsTarget(PixivHost.PublicApi.rawHost, listOf(PixivHost.PublicApi)),
            DnsTarget("i.pximg.net", listOf(PixivHost.Image)),
            DnsTarget("s.pximg.net", listOf(PixivHost.StaticImage)),
            DnsTarget("www.pixivision.net", listOf(PixivHost.Pixivision)),
        )
    }
}
