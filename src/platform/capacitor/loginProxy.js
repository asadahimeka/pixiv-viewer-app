/**
 * 应用内 Pixiv 官网登录（Android 专用）
 *
 * 封装 capacitor-plugin-pixiv-login（PixivLoginProxy）：
 * - 原生 WebView 截获 pixiv:// 回调里的授权 code，不再依赖外部浏览器 + deep link 回跳
 * - 插件内置 MITM 代理能力（IllustFerry LocalLoginProxy 移植）保留但默认不启用：
 *   pixiv 源站策略变化后已无法覆盖真墙内直连，仅适用于可访问 Pixiv 的网络
 *
 * 非 Android 平台 isAvailable() 恒为 false，走现有外部浏览器 OAuth 流程。
 */
import { PixivLoginProxy } from 'capacitor-plugin-pixiv-login'
import platform from '..'

const proxyState = {
  prepared: false,
  mode: 'direct',
  port: 0,
}

export function isInAppLoginSupported() {
  return platform.isAndroid && !!PixivLoginProxy
}

/**
 * 原生实现是否可用（dev:web 下平台同为 android，但无原生实现，web stub 返回 false）
 */
export async function checkInAppLoginAvailable() {
  if (!isInAppLoginSupported()) return false
  try {
    const { available } = await PixivLoginProxy.isAvailable()
    return !!available
  } catch (err) {
    console.log('checkInAppLoginAvailable err: ', err)
    return false
  }
}

/**
 * 准备登录环境：按需启动本机代理 + 刷新动态 IP + 设置 WebView 代理覆盖。
 * 默认直连模式（useProxy=false，仅清理代理覆盖）；MITM 模式的能力保留在插件里，
 * 但因 pixiv 源站策略变化（无 SNI 403 / 墙内 SNI RST）已不再从 UI 触发。
 *
 * @param {object} [options]
 * @param {boolean} [options.useProxy=false] 是否启用内置 MITM 代理
 * @returns {Promise<{ mode: 'proxy'|'direct', port: number, dnsSummary?: string, proxySupported?: boolean }>}
 */
export async function prepareInAppLogin({ useProxy = false } = {}) {
  const res = await PixivLoginProxy.prepare({ useProxy })
  proxyState.prepared = true
  proxyState.mode = res.mode
  proxyState.port = res.port
  return res
}

/**
 * 手动刷新动态 Host IP 表（prepare 失败后的重试入口）
 */
export function refreshInAppLoginDns() {
  return PixivLoginProxy.refreshDns()
}

/**
 * 打开应用内登录 WebView，截获回调 code
 *
 * @param {string} loginUrl PKCE 登录页 URL
 * @param {boolean} [useProxy=false] 是否为 MITM 模式
 * @returns {Promise<{ code: string }>} 用户关闭时 reject('cancelled')
 */
export function openInAppLogin(loginUrl, useProxy = false) {
  return PixivLoginProxy.openLogin({ url: loginUrl, useProxy })
}

/**
 * 停止本机代理并清理 WebView 代理覆盖（幂等，登录流程 finally 必调）
 */
export async function stopInAppLogin() {
  proxyState.prepared = false
  proxyState.mode = 'direct'
  proxyState.port = 0
  try {
    await PixivLoginProxy.stop()
  } catch (err) {
    console.log('stopInAppLogin err: ', err)
  }
}

/**
 * 经本机代理（动态 IP + SNI 直拨上游）发一次 HTTP 请求。
 * 用于 oauth.secure.pixiv.net 的 token 交换兜底通道。
 *
 * @param {{ url: string, method?: string, headers?: object, body?: string, timeout?: number }} options
 * @returns {Promise<{ status: number, body: string }>}
 */
export function requestViaInAppProxy(options) {
  return PixivLoginProxy.request(options)
}

/**
 * 当前是否已 prepare 且处于代理模式（tokenRequest 兜底通道的可用性判断）
 */
export function isInAppProxyReady() {
  return proxyState.prepared && proxyState.mode == 'proxy' && proxyState.port > 0
}
