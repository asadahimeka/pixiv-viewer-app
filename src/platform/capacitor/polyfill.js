import { CapacitorHttp } from '@capacitor/core'

/* Safari and Edge polyfill for createImageBitmap
 * https://developer.mozilla.org/en-US/docs/Web/API/WindowOrWorkerGlobalScope/createImageBitmap
 */
if (!('createImageBitmap' in window)) {
  window.createImageBitmap = async function (blob) {
    return new Promise((resolve, reject) => {
      const img = document.createElement('img')
      img.addEventListener('load', function () {
        resolve(this)
      })
      img.addEventListener('error', function () {
        // eslint-disable-next-line prefer-promise-reject-errors
        reject(this)
      })
      img.src = URL.createObjectURL(blob)
    })
  }
}

if (!String.prototype.replaceAll) {
  // eslint-disable-next-line no-extend-native
  String.prototype.replaceAll = function (search, replacement) {
    return this.split(search).join(replacement)
  }
}

/**
 * __httpRequest__：对齐 Web 版 HTTP Helper 用户脚本的请求契约，
 * 底层走 CapacitorHttp 原生请求（无 CORS 限制，支持自定义 Referer 等头）。
 * 契约：(url, JSON.stringify({ method?, headers?, data?, responseType? }))
 *   => Promise.resolve({ data }) / Promise.reject(new Error('HTTP <status> <statusText>'))
 * responseType: 'json'(默认) | 'text' | 'blob' | 'blobUrl'
 */
if (typeof window.__httpRequest__ !== 'function') {
  const base64ToBlob = (b64, mime) =>
    window.CapacitorWebFetch(`data:${mime || 'application/octet-stream'};base64,${b64}`).then(r => r.blob())

  const toBlob = (data, mime) => {
    if (data instanceof Blob) return Promise.resolve(data)
    if (data instanceof ArrayBuffer) return Promise.resolve(new Blob([data], { type: mime }))
    if (typeof data === 'string') return base64ToBlob(data, mime)
    return Promise.reject(new Error('Unsupported binary response'))
  }

  const safeJsonParse = s => {
    try {
      return JSON.parse(s)
    } catch (e) {
      return s
    }
  }

  window.__httpRequest__ = (url, configStr) => {
    const config = JSON.parse(configStr)
    if (config.headers?.['Content-Type']?.includes('application/json') && config.data && typeof config.data !== 'string') {
      config.data = JSON.stringify(config.data)
    }
    const isBlobUrl = config.responseType === 'blobUrl'
    const responseType = isBlobUrl ? 'blob' : (config.responseType === 'blob' || config.responseType === 'text' ? config.responseType : 'json')
    const hasBody = config.method && !['GET', 'HEAD'].includes(config.method.toUpperCase())
    return CapacitorHttp.request({
      url,
      method: config.method || 'GET',
      headers: config.headers,
      data: hasBody ? config.data : undefined,
      responseType,
    }).then(async res => {
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim())
      }
      let data = res.data
      if (responseType === 'json') {
        data = typeof data === 'string' ? safeJsonParse(data) : data
      } else if (responseType === 'blob') {
        const header = res.headers?.['content-type'] || res.headers?.['Content-Type']
        const mime = Array.isArray(header) ? header[0] : header
        data = await toBlob(data, mime)
        if (isBlobUrl) data = URL.createObjectURL(data)
      }
      return { data }
    })
  }
}
