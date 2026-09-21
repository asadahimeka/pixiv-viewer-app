/*
https://github.com/Tsuk1ko/pxder

GNU General Public License v3.0

Copyright (c) 2023 神代綺凛(Tsuk1ko) <i@loli.best>
*/

import CryptoJS from 'crypto-js'
import { stringify } from 'qs'
import Pixiv from './pixiv-auth'

function randomInteger(max, min = 0) {
  return Math.floor(Math.random() * (max - min + 1) + min)
}

// https://github.com/Mapaler/PixivUserBatchDownload/blob/master/PixivUserBatchDownload.user.js#L379
function genCodeVerifier() {
  const len = randomInteger(43, 128) // 产生43~128位
  const unreservedChars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~'
  const charsLength = unreservedChars.length
  let array = new Uint8Array(len)
  window.crypto.getRandomValues(array) // 获取符合密码学要求的安全的随机值
  array = array.map(x => unreservedChars.charCodeAt(x % charsLength)) // 将0~255转换到可选字符位置区间
  return String.fromCharCode(...array) // 将数字变回字符串
}

// https://github.com/Mapaler/PixivUserBatchDownload/blob/master/PixivUserBatchDownload.user.js#L394
function genCodeChallenge(code_verifier) {
  const base64 = CryptoJS.SHA256(code_verifier).toString(CryptoJS.enc.Base64)
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function oauthPkce() {
  const code_verifier = genCodeVerifier()
  const code_challenge = genCodeChallenge(code_verifier)
  return { code_verifier, code_challenge }
}

function pixivLogin() {
  const { code_verifier, code_challenge } = oauthPkce()
  const params = {
    code_challenge,
    code_challenge_method: 'S256',
    client: 'pixiv-android',
  }
  return {
    login_url: `https://app-api.pixiv.net/web/v1/login?${stringify(params)}`,
    code_verifier,
  }
}

function getLoginURL() {
  console.log('\nPixiv Login\n')
  try {
    // OAuth Login
    const { login_url, code_verifier } = pixivLogin()

    console.log('Before login, please read this first ->', 'https://github.com/Tsuk1ko/pxder#%E7%99%BB%E5%BD%95')
    console.log('\nLogin URL:', login_url)

    return { login_url, code_verifier }
  } catch (error) {
    console.log('\nLogin fail!', 'Please check your input or proxy setting.\n', error)
  }
}

async function login(code, code_verifier) {
  console.log('code: ', code)
  console.log('code_verifier: ', code_verifier)
  if (!(code && code_verifier)) throw new Error('Missing param.')
  return Pixiv.login(code, code_verifier)
}

/**
 * 应用内 WebView 登录（Android 专用，IllustFerry 方案移植）
 *
 * 流程：prepare → 原生 WebView 打开 PKCE 登录页 → 截获 pixiv:// 回调 code
 *   → 复用现有 login() 换 token（常规通道失败时自动走本机代理兜底）
 *   → finally 停止代理
 *
 * 默认 useProxy=false（直连模式）：2025-09 实测 pixiv 源站对无 SNI 一律 403、
 * 带 SNI 在墙内被 GFW RST，MITM 代理已无法覆盖真墙内直连环境，UI 不再提供代理开关；
 * 应用内登录限定在能访问 Pixiv 的网络（直连可达或设备 VPN）下使用。
 *
 * @param {object} [options]
 * @param {boolean} [options.useProxy=false] 是否启用内置 MITM 代理
 * @returns {Promise<{ refreshToken: string, mode: 'proxy'|'direct' }>}
 */
async function loginViaWebView({ useProxy = false } = {}) {
  const loginProxy = await import('@/platform/capacitor/loginProxy')
  if (!(await loginProxy.checkInAppLoginAvailable())) {
    throw new Error('In-app login is only available on Android.')
  }
  const { login_url, code_verifier } = getLoginURL()
  try {
    const prepareRes = await loginProxy.prepareInAppLogin({ useProxy })
    const { code } = await loginProxy.openInAppLogin(login_url, prepareRes.mode == 'proxy')
    const refreshToken = await login(code, code_verifier)
    return { refreshToken, mode: prepareRes.mode }
  } finally {
    await loginProxy.stopInAppLogin()
  }
}

export {
  getLoginURL,
  login,
  loginViaWebView,
}
