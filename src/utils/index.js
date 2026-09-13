import Vue from 'vue'
import axios from 'axios'
import dayjs from 'dayjs'
import { Dialog, Toast } from '@/lib/vant-apis'
import store from '@/store'
import platform from '@/platform'
import { i18n, isCNLocale } from '@/i18n'
import { getArtworkFileName } from '@/store/actions/filename'
import { BASE_URL } from '@/consts'
import { LocalStorage } from './storage'

export const eventBus = new Vue()

export function throttleScroll(el, downFn, upFn) {
  let position = el.scrollTop
  let ticking = false
  return function (arg) {
    if (ticking) return
    ticking = true
    window.requestAnimationFrame(() => {
      const scroll = el.scrollTop
      scroll > position ? downFn?.(scroll, arg) : upFn?.(scroll, arg)
      position = scroll
      ticking = false
    })
  }
}

function fallbackCopyTextToClipboard(text, cb, errCb) {
  const textArea = document.createElement('textarea')
  textArea.value = text
  textArea.style.top = '0'
  textArea.style.left = '0'
  textArea.style.position = 'fixed'

  document.body.appendChild(textArea)
  textArea.focus()
  textArea.select()

  try {
    const successful = document.execCommand('copy')
    successful ? cb?.() : errCb?.()
  } catch (err) {
    console.error('Fallback: Oops, unable to copy', err)
    errCb?.(err)
  }

  document.body.removeChild(textArea)
}

export function copyText(text, cb, errCb) {
  try {
    text = `${text}`
    if (platform.isCapacitor) {
      import('@/platform/capacitor/utils').then(({ copyText }) => {
        copyText(text, cb, errCb)
      })
      return
    }
    if (platform.isTauri) {
      import('@/platform/tauri/utils').then(({ copyText }) => {
        copyText(text, cb, errCb)
      })
      return
    }
    navigator.clipboard.writeText(text).then(cb, errCb)
  } catch (error) {
    fallbackCopyTextToClipboard(text, cb, errCb)
  }
}

export function setCookieOnce(key, val) {
  document.cookie = `${key}=${val}; expires=Fri, 31 Dec 9999 23:59:59 GMT; path=/;Secure`
}

export function resetCookieOnce(key) {
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; Secure`
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export function setCookie(name, value, days) {
  let expires = ''
  if (days) {
    const date = new Date()
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000))
    expires = '; expires=' + date.toUTCString()
  }
  document.cookie = name + '=' + (value || '') + expires + '; path=/;Secure'
}

export function getCookie(cname) {
  const name = cname + '='
  const ca = document.cookie.split(';')
  for (let i = 0; i < ca.length; i++) {
    let c = ca[i]
    while (c.charAt(0) == ' ') {
      c = c.substring(1)
    }
    if (c.indexOf(name) == 0) {
      return c.substring(name.length, c.length)
    }
  }
  return ''
}

export function removeCookie(key) {
  document.cookie = `${key}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; Secure`
}

export function objectToQueryString(queryParameters) {
  return queryParameters
    ? Object.entries(queryParameters).reduce(
      (queryString, [key, val]) => {
        const symbol = queryString.length === 0 ? '?' : '&'
        queryString += `${symbol}${key}=${val}`
        return queryString
      },
      ''
    )
    : ''
}

export function isURL(s) {
  return /^https?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b(?:[-a-zA-Z0-9()@:%_+.~#?&/=]*)$/i.test(s)
}

export function tryURL(url) {
  try {
    return new URL(url)
  } catch (_err) {
    return null
  }
}

export async function checkImgAvailable(src) {
  return Promise.race([
    new Promise((resolve, reject) => {
      let img = document.createElement('img')
      img.referrerPolicy = 'no-referrer'
      img.src = src
      img.onload = () => {
        resolve(true)
        img = null
      }
      img.onerror = () => {
        reject(new Error('Network error.'))
        img = null
      }
    }),
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error('请求超时')), 5000)
    }),
  ])
}

export async function checkUrlAvailable(url) {
  const res = await axios.get(url, { timeout: 5000 })
  if (res.data) return true
  throw new Error('Resp not ok.')
}

export function replaceValidFileName(str = '', isDir = false) {
  const maxLen = 128
  if (isDir) {
    str = str.replace(/[\\/|?*:<>'"\s.]/g, '_')
  } else {
    // 只把最后一个 '.' 之后视为扩展名，并对扩展名同样消毒，
    // 避免 'xxx.best/148114052' 这类脏名把 '/' 带进文件系统
    const dotIdx = str.lastIndexOf('.')
    let ext = dotIdx > 0 ? str.slice(dotIdx + 1).replace(/[\\/|?*:<>'"\s]/g, '_') : ''
    let base = (dotIdx > 0 ? str.slice(0, dotIdx) : str).replace(/[\\/|?*:<>'"\s.]/g, '_').replace(/_+$/, '')
    if (!base) {
      // 标题清洗后为空时，从原始串中恢复作品 id 兜底，避免退化成 '_.png'
      const id = (str.match(/_(\d{6,})(?:_p\d+)?\./) || [])[1]
      base = 'PXV_' + (id || Date.now())
    }
    if (ext && !ext.replace(/_/g, '')) ext = ''
    str = ext ? `${base}.${ext}` : base
  }
  if (str.length > maxLen) str = str.slice(-maxLen)
  return str
}

export function safeDecodeURIComponent(str = '') {
  try {
    return decodeURIComponent(str)
  } catch (e) {
    return str
  }
}

// ==== 下载错误分类 / 归一化 ====

export function getDlErrMsg(err) {
  if (err == null) return ''
  if (typeof err == 'string') return err
  if (err.message) return err.message
  return `${err}`
}

const DL_ERR_MATCHERS = [
  [/ENOSPC|Insufficient space|No space left/i, 'noSpace'],
  [/EACCES|EPERM|Permission Denial|Permission denied|denied permission request|WRITE_EXTERNAL_STORAGE/i, 'noPerm'],
  [/Unable to resolve host|No address associated|ENOTFOUND|getaddrinfo/i, 'dnsFail'],
  [/not verified: certificate|Hostname .*not verified/i, 'tlsHost'],
  [/BAD_DECRYPT|DECRYPTION_FAILED|BAD_RECORD_MAC/i, 'tlsBroken'],
  [/unexpected end of stream|Connection reset|reset by peer|connection closed|socket closed|ECONNRESET/i, 'connReset'],
  [/connection abort|ECONNABORTED/i, 'connAbort'],
  [/Failed to connect|ECONNREFUSED|Failed to fetch|NetworkError|network error/i, 'connFail'],
  [/ETIMEDOUT|timed out|timeout/i, 'timeout'],
  [/EBADF|interrupted by close/i, 'badFd'],
  [/ETXTBSY|Text file busy/i, 'busy'],
  [/ENOENT|No such file|File does not exist|Unable to read file/i, 'noFile'],
  [/Failed to build unique file|Invalid file path/i, 'badName'],
  [/Parent folder|parent directory|NOT_CREATED_DIR|FILE_NOTCREATED|Unable to write file/i, 'fsFail'],
  [/HTTP 错误|HTTP error|\bHTTP \d{3}\b/i, 'httpErr'],
]

export function getDlErrCategory(err) {
  const msg = getDlErrMsg(err)
  for (const [reg, key] of DL_ERR_MATCHERS) {
    if (reg.test(msg)) return key
  }
  if (/^https?:\/\//i.test(msg)) return 'httpErr'
  if (msg.includes('网络错误')) return 'netErr'
  return 'unknown'
}

function dlCatKey(category) {
  return category.replace(/([A-Z])/g, m => '_' + m.toLowerCase())
}

// 面向用户的错误文案（含低版本环境提示）
export function dlErrorText(err) {
  const category = getDlErrCategory(err)
  let text = i18n.t(`tip.dl_${dlCatKey(category)}`)
  if (isDlEnvLegacy() && (category == 'noPerm' || category == 'tlsHost')) {
    text += '\n' + i18n.t('tip.dl_legacy_hint')
  }
  return text
}

// 面向 umami 的归一化分组串：[step] host :: category(:: 抹噪详情)
export function formatDlError(err) {
  const category = getDlErrCategory(err)
  const step = (err && err.dlStep) || 'download'
  let host = '-'
  if (err && err.dlUrl) {
    try {
      host = new URL(err.dlUrl).host
    } catch (e) {}
  }
  let detail = ''
  if (category == 'unknown' || category == 'httpErr') {
    detail =
      ' :: ' +
      getDlErrMsg(err)
        .replace(/0x[0-9a-fA-F]+/g, '0xX')
        .replace(/\d{4,}/g, '#')
        .replace(/https?:\/\/\S+/g, 'URL')
        .slice(0, 80)
  }
  return `[${step}] ${host} :: ${category}${detail}`
}

// 给平台层抛出的错误附加 step/url 上下文（字符串错误会被包装成 Error）
export function markDlError(err, step, url) {
  if (err instanceof Error) {
    if (step && !err.dlStep) err.dlStep = step
    if (url && !err.dlUrl) err.dlUrl = url
    return err
  }
  const wrapped = new Error(getDlErrMsg(err) || 'unknown error')
  wrapped.dlStep = step
  wrapped.dlUrl = url
  return wrapped
}

const RETRYABLE_DL_ERR_REG = /unexpected end of stream|Connection reset|reset by peer|connection closed|Software caused connection abort|Failed to connect|Unable to resolve host|No address associated|Failed to fetch|ECONNRESET|ECONNABORTED|ECONNREFUSED|ETIMEDOUT|timed out|timeout|BAD_DECRYPT|DECRYPTION_FAILED|网络错误/i

export function isRetryableDlError(err) {
  return RETRYABLE_DL_ERR_REG.test(getDlErrMsg(err))
}

// 带条件的重试：should 返回 false 时立即抛出
export async function retryWhere(fn, should, retries = 3, delay = 1500) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      if (i >= retries - 1 || !should(err)) throw err
      await sleep(delay)
    }
  }
}

// ==== 低版本设备/WebView 检测 ====

const dlEnv = { checked: false, legacy: false, osVersion: '', webViewVersion: '' }

export function isDlEnvLegacy() {
  return dlEnv.legacy
}

export function getDlEnv() {
  return dlEnv
}

let dlEnvChecking = null

// 单例检测：capacitor 用 @capacitor/device，tauri 桌面端从 UA 解析 WebView2(Edge) 内核版本
export function checkDlEnvCompat() {
  if (!dlEnvChecking) {
    dlEnvChecking = (async () => {
      try {
        if (platform.isCapacitor && !platform.isIOS) {
          const { Device } = await import('@capacitor/device')
          const info = await Device.getInfo()
          const osMajor = parseInt(info.osVersion, 10) || 0
          const wvMajor = parseInt(`${info.webViewVersion || ''}`.split('.')[0], 10) || 0
          dlEnv.osVersion = info.osVersion || ''
          dlEnv.webViewVersion = info.webViewVersion || ''
          dlEnv.legacy = (osMajor > 0 && osMajor < 10) || (wvMajor > 0 && wvMajor < 105)
        } else if (platform.isTauri) {
          const ua = navigator.userAgent
          const m = ua.match(/Edg\/(\d+)/) || ua.match(/Chrome\/(\d+)/)
          const wvMajor = m ? parseInt(m[1], 10) || 0 : 0
          dlEnv.webViewVersion = wvMajor ? String(wvMajor) : ''
          dlEnv.legacy = wvMajor > 0 && wvMajor < 105
        }
      } catch (e) {}
      dlEnv.checked = true
      return dlEnv
    })()
  }
  return dlEnvChecking
}

const inflightDlTasks = new Map()

/**
 * 对外入口：同一目标文件的并发下载共享同一个任务，避免临时文件互相覆盖/删除
 * @param {string|Blob} source
 * @param {string} fileName
 * @param {object} options
 * @param {string} options.message
 * @param {string} options.subDir
 * @returns {ReturnType<typeof _downloadFile>}
 */
export function downloadFile(source, fileName, options = {}) {
  const key = `${options.subDir || ''}/${fileName}`
  if (inflightDlTasks.has(key)) return inflightDlTasks.get(key)
  const task = _downloadFile(source, fileName, options)
  const cleanup = () => inflightDlTasks.delete(key)
  task.then(cleanup, cleanup)
  inflightDlTasks.set(key, task)
  return task
}

async function _downloadFile(source, fileName, options = {}) {
  let loading
  try {
    if (typeof source == 'string' && !/\.\w+$/.test(fileName)) {
      fileName += `.${source.split('.').pop()}`
    }
    fileName = replaceValidFileName(fileName)
    if (options.subDir) options.subDir = replaceValidFileName(options.subDir, true)

    Toast.allowMultiple()
    loading = Toast({
      duration: 0,
      // forbidClick: true,
      className: 'download-toast',
      message: options.message ? `${options.message}: ${fileName}` : `${i18n.t('tip.downloading')}: ${fileName}`,
      getContainer: '#app .app-base',
    })

    const doneToast = msg => {
      try {
        loading.message = msg || `${i18n.t('tip.downloaded')}: ${fileName}`
        setTimeout(() => {
          loading.clear()
        }, 2000)
      } catch (err) {}
    }

    if (platform.isCapacitor) {
      if (store.state.appSetting.preferDownloadManager) {
        setTimeout(() => {
          loading?.clear?.()
        }, 2000)
      }
      const util = await import('@/platform/capacitor/utils')
      const result = source instanceof Blob
        ? await util.downloadBlob(source, fileName, options.subDir)
        : await util.downloadFile(source, fileName, options.subDir)
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(result.error)
      }
      doneToast(result.successMsg)
      return result
    }

    if (platform.isTauri) {
      const util = await import('@/platform/tauri/utils')
      const result = source instanceof Blob
        ? await util.downloadBlob(source, fileName, options.subDir)
        : await util.downloadFile(source, fileName, options.subDir)
      if (result.error) {
        throw result.error instanceof Error ? result.error : new Error(result.error)
      }
      doneToast(result.successMsg)
      return result
    }

    downloadLink(source, fileName)
    doneToast()
  } catch (err) {
    console.log('err: ', err)
    window.umami?.track('download_file_err', { err: formatDlError(err) })
    loading?.clear()
    const friendly = dlErrorText(err)
    if (typeof source != 'string') {
      Toast(i18n.t('D8R2062pjASZe9mgvpeLr') + ': ' + friendly)
      return
    }
    const action = await Dialog.confirm({
      title: i18n.t('D8R2062pjASZe9mgvpeLr'),
      message: `${friendly}<br>${err}<br>${i18n.t('rTIZ1T04iT1thVsaytEQF')}`,
      lockScroll: false,
      closeOnPopstate: true,
      cancelButtonText: i18n.t('common.cancel'),
      confirmButtonText: i18n.t('common.confirm'),
    }).catch(() => 'cancel')
    if (action != 'confirm') return
    downloadLink(source, fileName)
  }
}

/**
 * @param {string} source
 * @param {string} fileName
 */
export async function downloadLink(source, fileName) {
  const a = document.createElement('a')
  a.href = source
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  a.style.display = 'none'
  a.setAttribute('download', fileName)
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const isAnalyticsOn = LocalStorage.get('PXV_ANALYTICS', true)
export function trackEvent(name, properties) {
  if (!isAnalyticsOn) return
  window.umami?.track(name, properties)
}

const isOverlayOff = LocalStorage.get('PXV_STATUSBAR_OVERLAY_OFF', false)

export function dealStatusBarOnEnter() {
  if (!platform.isAndroid || isOverlayOff) return
  document.documentElement.classList.add('pt0')
  window['nav-bar-overlay']?.classList.add('op0')
}

export async function dealStatusBarOnLeave() {
  if (!platform.isAndroid || isOverlayOff) return
  if (store.state.appSetting.pageTransition) {
    setTimeout(() => {
      document.documentElement.classList.remove('pt0')
      window['nav-bar-overlay']?.classList.remove('op0', 'show')
    }, 16)
  } else {
    document.documentElement.classList.remove('pt0')
    window['nav-bar-overlay']?.classList.remove('op0', 'show')
  }
}

export function formatBytes(bytes) {
  bytes = Number(bytes)
  if (!bytes) return '0 B'

  const k = 1024
  const dm = 1
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB', 'EiB', 'ZiB', 'YiB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const n = parseFloat((bytes / Math.pow(k, i)).toFixed(dm))

  return `${i18n.locale.includes('zh') ? n : n.toLocaleString(i18n.locale)} ${sizes[i]}`
}

export function randomBg() {
  const getRandomRangeNum = (min, max) => min + Math.floor(Math.random() * (max - min))
  const leftHue = getRandomRangeNum(0, 360)
  const bottomHue = getRandomRangeNum(0, 360)
  return `linear-gradient(to right bottom,hsl(${leftHue}, 100%, 90%) 0%,hsl(${bottomHue}, 100%, 90%) 100%)`
}

/** 生成随机中间范围的颜色 */
export function generateRandomColor() {
  const min = 195
  const max = 245
  const r = Math.floor(Math.random() * (max - min)) + min
  const g = Math.floor(Math.random() * (max - min)) + min
  const b = Math.floor(Math.random() * (max - min)) + min
  return `rgb(${r}, ${g}, ${b})`
}

/** 根据背景色生成对比强的文本色 */
export function getContrastingTextColor(backgroundColor) {
  const rgb = backgroundColor.match(/\d+/g).map(Number)
  const luminance = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  return luminance > 0.5 ? '#333' : 'white' // 浅色背景用黑字，深色背景用白字
}

export function hexToRgb(hex, onlyReturnNum = false) {
  // 移除 "#" 号（如果有的话）
  hex = hex.replace(/^#/, '')

  // 处理简写形式 (例如: #03F 变成 #0033FF)
  if (hex.length === 3) {
    hex = hex.split('').map(char => char + char).join('')
  }

  // 解析 r, g, b
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)

  return onlyReturnNum ? `${r}, ${g}, ${b}` : `rgb(${r}, ${g}, ${b})`
}

export async function readTextFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsText(file)
  })
}

export function loadScript(src) {
  return new Promise(resolve => {
    const script = document.createElement('script')
    script.src = src
    script.addEventListener('load', () => { resolve() }, false)
    document.head.appendChild(script)
  })
}

export function isSafari() {
  if (platform.isIOS) return true
  const ua = navigator.userAgent
  if (/Macintosh/i.test(ua)) return true
  if (!/Chrome/i.test(ua) && /Safari/i.test(ua)) return true
  return false
}

export async function fancyboxShow(artwork, index = 0, getSrc = e => e.o) {
  if (!window.Fancybox) {
    document.head.insertAdjacentHTML('beforeend', `<link href="${BASE_URL}static/css/fancybox.min.css" rel="stylesheet">`)
    await loadScript(`${BASE_URL}static/js/fancybox.umd.min.js`)
  }
  window.Fancybox.show(artwork.images.map(e => ({
    src: getSrc(e),
    thumb: e.m,
    thumbSrc: e.m,
    caption: `${artwork.title} by ${artwork.author.name}`,
    _artwork: artwork,
  })), {
    compact: false,
    startIndex: index,
    backdropClick: 'close',
    contentClick: store.state.isMobile ? 'close' : 'toggleZoom',
    hideScrollbar: false,
    placeFocusBack: false,
    trapFocus: false,
    Hash: false,
    Thumbs: { showOnStart: false },
    Carousel: { infinite: false },
    Toolbar: {
      display: {
        left: ['infobar'],
        middle: platform.isCapacitor ? ['toggleZoom', 'myDownload', 'rotateCW', 'flipX', 'flipY', 'close'] : [],
        right: platform.isCapacitor ? [] : ['toggleZoom', 'thumbs', 'myDownload', 'rotateCW', 'flipX', 'flipY', 'close'],
      },
      items: {
        myDownload: {
          tpl: '<button class="f-button"><svg><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5 5-5M12 4v12"></path></svg></button>',
          click: async ev => {
            console.log('ev: ', ev)
            const { page } = ev.instance.carousel
            const art = ev.instance.userSlides[page]._artwork
            const item = art.images[page]
            const fileName = `${getArtworkFileName(art, page)}.${item.o.split('.').pop()}`
            await downloadFile(item.o, fileName, { subDir: store.state.appSetting.dlSubDirByAuthor ? art.author.name : undefined })
          },
        },
      },
    },
  })
}

export function formatIntlNumber(num) {
  try {
    return new Intl.NumberFormat(i18n.locale, {
      notation: 'compact',
      compactDisplay: 'short',
    }).format(num)
  } catch (err) {
    return num
  }
}

export function formatIntlDate(date) {
  try {
    if (isCNLocale()) return dayjs(date).format('YYYY-MM-DD HH:mm')
    date = dayjs(date).toDate()
    return new Intl.DateTimeFormat(i18n.locale, {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(date)
  } catch (err) {
    return date
  }
}

/**
 * @param {string[]} blockTags
 * @param {string[]|undefined} value
 */
export function isBlockTagHit(blockTags, value) {
  let tags = Array.isArray(value) ? value : []
  if (!tags.length || !blockTags.length) return false
  if (typeof tags[0] != 'string') tags = tags.map(e => e.name)
  const tagSet = new Set(tags)
  return blockTags.some(tag => tagSet.has(tag))
}

export async function retry(fn, retries = 2, delay = 1500) {
  let lastError
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      if (i < retries - 1) {
        await sleep(delay)
      }
    }
  }
  throw lastError
}

export function setProperFontSize(elements) {
  elements = Array.from(elements)
  if (!elements.length) return
  const MAX_FONT_SIZE = 330
  const MIN_FONT_SIZE = 164
  const BUCKET_SIZE = 10
  let maxCharCount = 0
  const charCounts = []
  elements.forEach(el => {
    const count = el.textContent.length
    charCounts.push(count)
    if (count > maxCharCount) maxCharCount = count
  })
  if (maxCharCount === 0) maxCharCount = 1
  const minSize = navigator.userAgent.includes('Mobile') ? 12 : 16
  if (elements.length == 1) {
    elements[0].style.fontSize = charCounts[0] > 40 ? `${minSize}px` : `max(${minSize}px, 3.2vw)`
    return
  }
  elements.forEach((el, index) => {
    const charCount = charCounts[index]
    if (charCount > 80) {
      el.style.fontSize = `${minSize}px`
      return
    }
    // const fontSize = MAX_FONT_SIZE - (charCount / maxCharCount) * (MAX_FONT_SIZE - MIN_FONT_SIZE)
    const bucket = Math.ceil(charCount / BUCKET_SIZE)
    const maxBucket = Math.ceil(maxCharCount / BUCKET_SIZE)
    const fontSize = Math.max(
      MIN_FONT_SIZE,
      MAX_FONT_SIZE - (bucket - 1) * ((MAX_FONT_SIZE - MIN_FONT_SIZE) / (maxBucket - 1 || 1))
    )
    el.style.fontSize = `max(${minSize}px, ${fontSize / 100}vw)`
  })
}

export async function previewXMedia(item) {
  if (!window.Fancybox) {
    document.head.insertAdjacentHTML('beforeend', `<link href="${BASE_URL}static/css/fancybox.min.css" rel="stylesheet">`)
    await loadScript(`${BASE_URL}static/js/fancybox.umd.min.js`)
  }
  window.Fancybox.show(item.images.map(e => ({
    src: e.l,
    thumb: e.l,
    thumbSrc: e.l,
    downloadSrc: e.o,
    caption: item.createdDate + ' ' + item.title,
    twitterStatusId: item.id,
    twitterName: item.userName,
  })), {
    compact: false,
    backdropClick: 'close',
    contentClick: store.state.isMobile ? 'close' : 'toggleZoom',
    startIndex: 0,
    hideScrollbar: false,
    placeFocusBack: false,
    trapFocus: false,
    Hash: false,
    Thumbs: { showOnStart: false },
    Carousel: { infinite: false },
    Toolbar: {
      display: {
        left: ['infobar'],
        middle: platform.isCapacitor ? ['myDetail', 'myDownload', 'toggleZoom', 'thumbs', 'rotateCW', 'flipX', 'flipY', 'close'] : [],
        right: platform.isCapacitor ? [] : ['myDetail', 'myDownload', 'toggleZoom', 'thumbs', 'rotateCW', 'flipX', 'flipY', 'close'],
      },
      items: {
        myDetail: {
          tpl: '<button class="f-button" title="Detail"><svg viewBox="0 0 1024 1024" style="transform:scale(0.8)"><path d="M593.94368 715.648a10.688 10.688 0 0 0-14.976 0L424.21568 870.4c-71.68 71.68-192.576 79.232-271.68 0-79.232-79.232-71.616-200 0-271.616l154.752-154.752a10.688 10.688 0 0 0 0-15.04l-52.992-52.992a10.688 10.688 0 0 0-15.04 0L84.50368 530.688a287.872 287.872 0 0 0 0 407.488 288 288 0 0 0 407.488 0l154.752-154.752a10.688 10.688 0 0 0 0-15.04l-52.736-52.736z m344.384-631.168a288.256 288.256 0 0 1 0 407.616l-154.752 154.752a10.688 10.688 0 0 1-15.04 0l-52.992-52.992a10.688 10.688 0 0 1 0-15.104l154.752-154.688c71.68-71.68 79.232-192.448 0-271.68-79.104-79.232-200-71.68-271.68 0L443.92768 307.2a10.688 10.688 0 0 1-15.04 0l-52.864-52.864a10.688 10.688 0 0 1 0-15.04l154.88-154.752a287.872 287.872 0 0 1 407.424 0z m-296.32 240.896l52.672 52.736a10.688 10.688 0 0 1 0 15.04l-301.504 301.44a10.688 10.688 0 0 1-15.04 0l-52.736-52.672a10.688 10.688 0 0 1 0-15.04l301.632-301.504a10.688 10.688 0 0 1 15.04 0z" fill="#fff"></path></svg></button>',
          click: async ev => {
            console.log('ev: ', ev)
            const { page } = ev.instance.carousel
            const item = ev.instance.userSlides[page]
            window.open(`https://x.com/${item.twitterName}/status/${item.twitterStatusId}`, '_blank', 'noreferrer')
          },
        },
        myDownload: {
          tpl: '<button class="f-button" title="Download"><svg><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M7 11l5 5 5-5M12 4v12"></path></svg></button>',
          click: async ev => {
            console.log('ev: ', ev)
            const { page } = ev.instance.carousel
            const item = ev.instance.userSlides[page]
            const format = item.downloadSrc.match(/\?format=(\w+)&/)?.[1] || 'jpg'
            const fileName = `${item.twitterName}_${item.twitterStatusId}_${page}.${format}`
            await downloadFile(item.downloadSrc, fileName)
          },
        },
      },
    },
  })
}

/**
 * @param {File} file
 * @param {string} algorithm
 */
export async function calculateFileHash(file, algorithm = 'SHA-256') {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest(algorithm, buffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

/**
 * 带超时与 onerror 保护地加载 Blob 为 Image；失败 reject 而非永久挂起
 * @param {Blob} blob
 * @returns {Promise<Image>}
 */
export function loadBlobAsImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(blob)
    const timer = setTimeout(() => {
      URL.revokeObjectURL(url)
      reject(new Error('缓存图片加载超时'))
    }, 5000)
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      URL.revokeObjectURL(url)
      reject(new Error('缓存图片解码失败'))
    }
    img.src = url
  })
}
