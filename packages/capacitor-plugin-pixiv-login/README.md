# capacitor-plugin-pixiv-login

应用内 Pixiv 官网登录（Android），移植自 [IllustFerry](https://github.com/peasoft/IllustFerry)（GPL-3.0）。

## 组成

- **原生登录 WebView**（`LoginWebViewActivity.java`）：打开 PKCE 登录页
  `https://app-api.pixiv.net/web/v1/login?code_challenge=...&client=pixiv-android`，
  截获 `pixiv://` / `pixiv-inner://` / `app-api.pixiv.net/web/v1/users/auth/pixiv/callback`
  回调中的授权 `code`（query 或 fragment），回传 JS。code 不再依赖外部浏览器 + deep link 回跳。
- **本机 MITM 代理**（`network/LocalLoginProxy.kt`，移植自 IllustFerry `LocalPixivProxy.kt`）：
  进程内 HTTP 代理，对 pixiv 域名终止 TLS（内存 CA 按域现签叶子证书）后按动态 DoH IP 表
  **带 SNI 直拨**上游（TCP+TLS 原子回退），让 WebView 在墙内也能打开登录页。注意：IllustFerry
  原版的 no-SNI 策略已失效（pixiv 源站对无 SNI 一律 403，2025-09 实测），现改为 SNI 直拨。
  含 recaptcha.net 改写（登录人机验证）与广告域 502 快断。
- **动态 DNS**（`network/PixivDnsUpdater.kt`）：`api.sb6.me/getdnsipv4` 拉取公网 IPv4，
  bogon 过滤后进 IP 表并持久化（SharedPreferences），绝不回退系统 DNS。
- **token 交换兜底通道**（`request()`）：常规 axios/云代理/Cronet QUIC 失败时，
  JS 可经本机代理直发 `oauth.secure.pixiv.net/auth/token`（动态 IP + SNI 直拨上游）。

## JS API

```ts
prepare({ useProxy = true }): Promise<{ mode: 'proxy'|'direct', port, dnsSummary?, proxySupported? }>
refreshDns(): Promise<{ updated, errors, summary }>
openLogin({ url, useProxy }): Promise<{ code }>   // 用户关闭时 reject('cancelled')
stop(): Promise<void>
request({ url, method?, headers?, body?, timeout? }): Promise<{ status, body }>
isAvailable(): Promise<{ available }>
```

JS 封装：`src/platform/capacitor/loginProxy.js`；登录编排：`src/api/client/login.js` `loginViaWebView()`。

## 生命周期约定

1. 登录前 `prepare()`：启动代理（7891 占用时回退随机端口）→ DoH 刷新（失败即 reject）→
   `ProxyController.setProxyOverride(127.0.0.1:{port} + addDirect)`。
2. `openLogin()`：原生 WebView 全屏打开；成功 resolve `{ code }` / 用户返回 reject `'cancelled'`；
   Activity 结束时自动 `clearProxyOverride()`（全局覆盖只影响本应用 WebView）。
3. `stop()`：reject 残留挂起调用 + 清覆盖 + 停代理，登录流程 finally 必调。
4. 代理本体在 `openLogin` 结束后保留，供 `request()` 兜底使用，直到 `stop()`。

## 已知限制（2025-09 实测）

- pixiv 源站已对无 SNI 连接一律 403，墙内带 SNI 的 TCP 又会被 GFW RST——**真墙内无 VPN 环境下
  WebView 的 TCP 通道不可达**，MITM 代理无法覆盖该场景。应用内登录适用于「能访问 Pixiv 的网络」
  （直连可达或设备 VPN），UI 默认直连模式（useProxy=false），代理开关已从界面移除。
- 若需真墙内直连，后续方向是把 MITM 上游改接 Cronet QUIC（UDP 绕 TCP RST，directMode 已验证的同族）。

## 威胁模型声明（与 IllustFerry 一致）

MITM 模式下 WebView 对登录会话不做端到端 TLS 校验（内存 CA 不受信，`onReceivedSslError` proceed）。
仅登录会话期间生效；直连模式严格校验（SSL 错误 cancel）。

## 许可

GPL-3.0，移植代码版权与说明见各文件头注释，归属记录见仓库根 `THIRD_PARTY_NOTICES`。
