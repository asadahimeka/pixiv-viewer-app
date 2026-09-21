/*
 * Ported from IllustFerry (https://github.com/peasoft/IllustFerry) — GPL-3.0
 * Original: app/src/main/java/JunZi/Pixiv/data/network/PixivHost.kt
 * 本文件为近乎逐行的移植，仅调整包名。
 */
package com.pixiv.login.network

/**
 * 已知的 Pixiv 域名清单。
 *
 * 这里不保留任何兜底 IP。所有可路由 IP 由 [PixivDnsUpdater] 在运行时拉取，并由
 * [PixivNetworkConfig] 持久化。兼容路由开启时，运行时表为空就等待拉取
 * 或使用上次持久化结果，绝不回退系统 DNS。
 */
enum class PixivHost(
    val rawHost: String,
    val isApiHost: Boolean,
) {
    AppApi("app-api.pixiv.net", true),
    OAuth("oauth.secure.pixiv.net", true),
    Accounts("accounts.pixiv.net", true),
    Source("source.pixiv.net", true),
    PublicApi("public-api.secure.pixiv.net", true),
    Image("i.pximg.net", false),
    StaticImage("s.pximg.net", false),
    Pixivision("www.pixivision.net", false),
    Web("www.pixiv.net", false);

    companion object {
        private val byHost = entries.associateBy { it.rawHost }

        fun from(host: String?): PixivHost? = byHost[host]
    }
}
