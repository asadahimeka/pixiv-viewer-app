import { fetch as tauriFetch } from '@tauri-apps/plugin-http'
import { open } from '@tauri-apps/plugin-shell'

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

if (!window._open) window._open = window.open
window.open = function (url) {
  open(url).catch(() => {
    window._open(url, '_blank', 'noopener noreferrer')
  })
}

/**
 * __httpRequest__：对齐 Web 版 HTTP Helper 用户脚本的请求契约，
 * 底层走 Tauri plugin-http（Rust reqwest，无 CORS 限制，支持自定义 Referer 等头）。
 * 契约：(url, JSON.stringify({ method?, headers?, data?, responseType? }))
 *   => Promise.resolve({ data }) / Promise.reject(new Error('HTTP <status> <statusText>'))
 * responseType: 'json'(默认) | 'text' | 'blob' | 'blobUrl'
 */
if (typeof window.__httpRequest__ !== 'function') {
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
    const hasBody = config.method && !['GET', 'HEAD'].includes(config.method.toUpperCase())
    return tauriFetch(url, {
      method: config.method || 'GET',
      headers: config.headers,
      body: hasBody && config.data != null
        ? (typeof config.data === 'string' ? config.data : JSON.stringify(config.data))
        : undefined,
    }).then(async res => {
      if (!res.ok) {
        throw new Error(`HTTP ${res.status} ${res.statusText || ''}`.trim())
      }
      let data
      if (isBlobUrl || config.responseType === 'blob') {
        const blob = await res.blob()
        data = isBlobUrl ? URL.createObjectURL(blob) : blob
      } else if (config.responseType === 'text') {
        data = await res.text()
      } else {
        data = safeJsonParse(await res.text())
      }
      return { data }
    })
  }
}
