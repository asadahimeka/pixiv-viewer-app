import nprogress from 'nprogress'
import { Toast } from '@/lib/vant-apis'
import api, { imgProxy } from '@/api'
import store from '@/store'
import platform from '@/platform'
import { i18n } from '@/i18n'
import { getArtworkFileName } from '@/store/actions/filename'
import { BASE_URL, COMMON_IMAGE_PROXY, UA_Header, ugoiraAvifSrc } from '@/consts'
import { downloadFile, loadScript, sleep, formatDlError } from '.'

const ZIP_FETCH_TIMEOUT = 60 * 1000

/**
 * 历史缓存的 zip URL 可能是图床代理 URL（或已被替换为 1920 尺寸），
 * 统一归一化为原始 pximg 600x600 URL，尺寸替换延迟到播放时按当前设置进行
 */
function normalizePximgZipUrl(url) {
  let result = url.replace(/_ugoira\d+x\d+/, '_ugoira600x600')
  if (result.startsWith('/-/')) {
    result = `https://i.pximg.net${result.slice(2)}`
  } else {
    result = result.replace(/^https?:\/\/[^/]+/i, 'https://i.pximg.net')
  }
  return result
}

function zipUrlWithSize(rawUrl, size) {
  return rawUrl.replace(/_ugoira\d+x\d+/, `_ugoira${size}`)
}

async function getZipCacheDir() {
  const { Directory } = await import('@capacitor/filesystem')
  // Android 落 External（随"清理图片缓存"一并清理），iOS 的 External 等同 Documents，落 Cache
  return { directory: platform.isAndroid ? Directory.External : Directory.Cache }
}

/** 读取已落盘的 zip 缓存，未命中返回 null */
async function readZipCache(path) {
  try {
    const [{ Capacitor }, { Filesystem }, { directory }] = await Promise.all([
      import('@capacitor/core'),
      import('@capacitor/filesystem'),
      getZipCacheDir(),
    ])
    const stats = await Filesystem.stat({ path, directory }).catch(() => null)
    if (!stats?.uri) return null
    const fetchFn = window.CapacitorWebFetch || window.fetch
    const resp = await fetchFn(Capacitor.convertFileSrc(stats.uri)).catch(() => null)
    if (resp?.ok) return resp.blob()
    // convertFileSrc 读取失败时退回 readFile 的 base64 数据
    const data = await Filesystem.readFile({ path, directory })
    if (typeof data?.data === 'string') {
      const b64Resp = await fetchFn(`data:application/zip;base64,${data.data}`)
      return b64Resp.blob()
    }
    return data?.data instanceof Blob ? data.data : null
  } catch (err) {
    console.log('readZipCache err: ', err)
    return null
  }
}

/** 尽力把 zip 落盘缓存，失败不影响本次播放 */
async function writeZipCache(path, blob) {
  try {
    const { default: writeBlob } = await import('capacitor-blob-writer')
    const { directory } = await getZipCacheDir()
    await writeBlob({ blob, path, directory, recursive: true })
  } catch (err) {
    console.log('writeZipCache err: ', err)
  }
}

/** 直连模式：p_pximg_ip + Host 头原生下载（与直连图片同链路），失败直接抛错不回退 */
async function directDownloadZip(rawZip, path, onProgress) {
  const [{ directory }, { fsDownloadFile }] = await Promise.all([
    getZipCacheDir(),
    // 动态导入避免把 Capacitor 依赖带进 Tauri 构建（此函数仅 Capacitor 直连模式可达）
    import('@/platform/capacitor/utils'),
  ])
  const url = new URL(rawZip)
  const isIOS = platform.isIOS
  if (isIOS) url.protocol = 'http:'
  url.host = window.p_pximg_ip
  await fsDownloadFile({
    url: url.href,
    path,
    directory,
    recursive: true,
    headers: isIOS
      ? { Referer: 'https://www.pixiv.net' }
      : { Host: 'i.pximg.net', Referer: 'https://www.pixiv.net' },
  }, onProgress)
  return readZipCache(path)
}

/**
 * 浏览器级 fetch：Capacitor 上是原生桥保存的原始 fetch（CapacitorWebFetch），受 CORS 限制，
 * 要求图床返回 CORS 头；支持流式读取上报进度与超时
 */
async function fetchZipAsBlob(url, onProgress) {
  const fetchFn = window.CapacitorWebFetch || window.fetch
  const ctrl = typeof AbortController === 'function' ? new AbortController() : null
  const timer = ctrl ? setTimeout(() => ctrl.abort(), ZIP_FETCH_TIMEOUT) : null
  try {
    const resp = await fetchFn(url, { headers: UA_Header, signal: ctrl?.signal })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    if (resp.body?.getReader) {
      const total = Number(resp.headers.get('content-length')) || 0
      const reader = resp.body.getReader()
      const chunks = []
      let loaded = 0
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.length
        if (onProgress && total) onProgress({ loaded, total })
      }
      return new Blob(chunks, { type: resp.headers.get('content-type') || 'application/zip' })
    }
    return resp.blob()
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/** __httpRequest__：Capacitor/Tauri polyfill 提供的原生请求（无 CORS 限制），带超时保护 */
async function requestZipAsBlob(url) {
  if (typeof window.__httpRequest__ !== 'function') {
    throw new Error('__httpRequest__ unavailable')
  }
  let timer = null
  try {
    const res = await Promise.race([
      window.__httpRequest__(url, JSON.stringify({ responseType: 'blob', headers: UA_Header })),
      new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error('__httpRequest__ timeout')), ZIP_FETCH_TIMEOUT)
      }),
    ])
    const data = res?.data
    if (!(data instanceof Blob)) throw new Error('invalid blob response')
    return data
  } finally {
    if (timer) clearTimeout(timer)
  }
}

/**
 * 加载动图 zip 并解出全部帧的 ImageBitmap
 * @param {Number} id 作品 ID
 * @param {Function} [onProgress] 下载进度回调 ({ loaded, total })，fetch 流式与直连原生下载支持
 */
export async function loadUgoira(id, onProgress) {
  const res = await api.ugoiraMetadata(id)
  if (res.status !== 0) {
    throw new Error(res.msg)
  }

  const ugoira = Object.freeze(res.data)
  const rawZip = normalizePximgZipUrl(ugoira.zip)
  const size = store.state.appSetting.ugoiraZipReso == '1920' ? '1920x1080' : '600x600'
  const fetchZip = zipUrlWithSize(rawZip, size)
  const cachePath = `zipcache/${id}_${size}.zip`
  const meta = {
    // ZIP 下载固定使用全尺寸原始帧归档
    zip: zipUrlWithSize(rawZip, '1920x1080'),
    frames: ugoira.frames.reduce((acc, frame) => {
      acc[frame.file] = frame
      return acc
    }, {}),
  }

  nprogress.start()
  const reportProgress = e => {
    if (onProgress && e?.total) onProgress(e)
  }

  let blob = null
  let level = ''

  // 磁盘缓存（直连/非直连都先查），文件名带尺寸，切换清晰度自动失效
  if (platform.isCapacitor) {
    blob = await readZipCache(cachePath)
    if (blob) level = 'cache'
  }

  // 直连模式：zip 与直连图片同链路下载，失败不回退代理
  const isDirectMode = platform.isCapacitor && store.state.appSetting.isDirectPximg
  if (!blob && isDirectMode) {
    if (!window.p_pximg_ip) {
      nprogress.done()
      throw new Error(i18n.t('ugoira.direct_ip_missing'))
    }
    blob = await directDownloadZip(fetchZip, cachePath, (bytes, contentLength) => {
      reportProgress({ loaded: bytes, total: contentLength })
    })
    if (!blob) {
      nprogress.done()
      throw new Error(i18n.t('D8R2062pjASZe9mgvpeLr'))
    }
    level = 'direct'
  }

  // 非直连：图床 fetch → __httpRequest__ 原生请求 → 自建通用代理 三级回退
  if (!blob && !isDirectMode) {
    const imgZip = imgProxy(fetchZip)
    const attempts = [
      { level: 'l1', url: imgZip, fn: fetchZipAsBlob, progress: true },
      { level: 'l2', url: imgZip, fn: requestZipAsBlob, progress: false },
    ]
    if (COMMON_IMAGE_PROXY) {
      attempts.push({ level: 'l3', url: COMMON_IMAGE_PROXY + rawZip, fn: fetchZipAsBlob, progress: true })
    }
    let firstErr = null
    for (const it of attempts) {
      try {
        blob = await it.fn(it.url, it.progress ? reportProgress : null)
        level = it.level
        break
      } catch (err) {
        if (!firstErr) firstErr = err
        console.log(`ugoira zip ${it.level} failed: `, err)
      }
    }
    if (!blob) {
      nprogress.done()
      window.umami?.track('ugoira_zip_fail', { err: firstErr ? formatDlError(firstErr) : 'unknown' })
      throw new Error(`${i18n.t('D8R2062pjASZe9mgvpeLr')} (${firstErr?.message || 'unknown'})`)
    }
    // 下载成功后尽力落盘缓存，下次同尺寸直接读文件
    if (platform.isCapacitor) writeZipCache(cachePath, blob)
  }

  window.umami?.track('ugoira_zip_level', { level })
  nprogress.done()

  const { default: JSZip } = await import('jszip')
  const jszip = new JSZip()
  const zip = await jszip.loadAsync(blob)
  const files = Object.keys(zip.files)
  await Promise.all(files.map(async name => {
    const entry = zip.file(name)
    if (!entry || !meta.frames[name]) return
    const frameBlob = await entry.async('blob')
    const bmp = await createImageBitmap(frameBlob)
    meta.frames[name].blob = frameBlob
    meta.frames[name].bmp = bmp
  }))

  return meta
}

export const ugoiraDownloadActions = () => [
  { name: 'ZIP', subname: i18n.t('artwork.download.zip') },
  { name: 'GIF', subname: i18n.t('artwork.download.gif') },
  { name: 'WebM', subname: i18n.t('artwork.download.webm') }, // chrome only
  { name: 'APNG', subname: i18n.t('artwork.download.webm') },
  { name: 'MP4(Browser)', subname: i18n.t('pIghtXdU8socMNNRUn5UR') },
  { name: 'MP4(Server)', subname: i18n.t('zuVom-C8Ss8JTEDZIhzBj') },
  { name: 'AVIF', subname: i18n.t('zuVom-C8Ss8JTEDZIhzBj') },
  { name: 'Other', subname: i18n.t('artwork.download.mp4') },
]

export async function downloadUgoira(type, ugoira, artwork, resetUgoira) {
  try {
    window.umami?.track('download_ugoira', { dl_type: type })
    switch (type) {
      case 'ZIP':
        // ugoira.zip 为原始 pximg URL，下载时按当前图床设置走代理
        await downloadFile(imgProxy(ugoira.zip), `${getArtworkFileName(artwork)}.zip`, { subDir: 'ugoira' })
        break
      case 'GIF':
        await downloadGIF(ugoira, artwork)
        break
      case 'WebM':
        await downloadWebM(ugoira, artwork)
        break
      case 'APNG':
        await downloadAPNG(ugoira, artwork)
        break
      case 'MP4(Browser)':
        await downloadMP4(ugoira, artwork, resetUgoira)
        break
      case 'MP4(Server)':
        // window.open(`https://ugoira-mp4-dl.cocomi.eu.org/${artwork.id}`, '_blank', 'noopener')
        await downloadFile(`https://ugoira-mp4-dl.cocomi.eu.org/${artwork.id}`, `${getArtworkFileName(artwork)}.mp4`, { subDir: 'ugoira' })
        break
      case 'AVIF':
        // window.open(ugoiraAvifSrc(artwork.id), '_blank', 'noopener')
        await downloadFile(ugoiraAvifSrc(artwork.id), `${getArtworkFileName(artwork)}.avif`, { subDir: 'ugoira' })
        break
      case 'Other':
        window.open(`https://ugoira.cocomi.eu.org/?id=${artwork.id}`, '_blank', 'noopener')
        break
      default:
        break
    }
  } catch (err) {
    console.log('err: ', err)
    window.umami?.track('download_ugoira_err', { error: formatDlError(err) })
    Toast({ message: i18n.t('H_rYWoPA0uI7TU4YCbIz0') })
  }
}

// ref: https://github.com/xuejianxianzun/PixivBatchDownloader/blob/master/src/ts/ConvertUgoira/ToAPNG.ts
async function downloadAPNG(ugoira, artwork) {
  Toast(i18n.t('tip.down_wait'))

  if (!window.UPNG) {
    await loadScript(`${BASE_URL}static/js/pako_deflate.min.js`)
    await loadScript(`${BASE_URL}static/js/UPNG.min.js`)
  }

  await sleep(200)

  const { width, height } = artwork
  let canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  let ctx = canvas.getContext('2d', { willReadFrequently: true })

  let images = []
  const delays = []
  Object.values(ugoira.frames).forEach(frame => {
    ctx.drawImage(frame.bmp, 0, 0)
    images.push(ctx.getImageData(0, 0, width, height).data.buffer)
    delays.push(frame.delay)
  })

  const pngFile = window.UPNG.encode(images, width, height, 0, delays)
  const blob = new Blob([pngFile], { type: 'image/vnd.mozilla.apng' })

  images = null
  ctx = null
  canvas = null

  const { isUgoiraApngSaveAsPng } = store.state.appSetting
  const suffix = isUgoiraApngSaveAsPng ? 'png' : 'apng'
  await downloadFile(blob, `${getArtworkFileName(artwork)}.${suffix}`, { subDir: 'ugoira' })
}

async function downloadWebM(ugoira, artwork) {
  Toast(i18n.t('tip.down_wait'))
  await sleep(200)

  const { width, height } = artwork

  let cacheCanvas = document.createElement('canvas')
  cacheCanvas.width = width
  cacheCanvas.height = height
  let ctx = cacheCanvas.getContext('2d')

  // const encoder = new global.Whammy.Video()
  // Object.values(ugoira.frames).forEach(frame => {
  //   ctx.clearRect(0, 0, width, height)
  //   ctx.drawImage(frame.bmp, 0, 0, width, height)
  //   encoder.add(ctx, frame.delay)
  // })
  // const webm = encoder.compile()

  let images = []
  let duration = 0
  Object.values(ugoira.frames).forEach(frame => {
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(frame.bmp, 0, 0, width, height)
    images.push(ctx.canvas.toDataURL('image/webp'))
    duration += frame.delay
  })

  const { default: tsWhammy } = await import('ts-whammy')
  const webm = tsWhammy.fromImageArrayWithOptions(images, { duration: duration / 1000 })

  images = null
  ctx = null
  cacheCanvas = null

  await downloadFile(webm, `${getArtworkFileName(artwork)}.webm`, { subDir: 'ugoira' })
}

async function downloadGIF(ugoira, artwork) {
  Toast(i18n.t('tip.down_wait'))

  let images = Object.values(ugoira.frames)
  let offset = 1
  if (images.length >= 100) {
    // 抽帧间隔
    offset = 2
    images = images.filter((_, idx) => idx % offset === 0) // 抽帧
    // .map(frame => URL.createObjectURL(frame.blob));
  }

  const { width, height } = artwork

  const cacheCanvas = document.createElement('canvas')
  cacheCanvas.width = width
  cacheCanvas.height = height
  const ctx = cacheCanvas.getContext('2d')

  const { default: GIF } = await import('gif.js')
  const gif = new GIF({
    workers: 10,
    quality: 10,
    width,
    height,
    workerScript: `${BASE_URL}static/js/gif.worker.js`,
  })
  Object.values(images).forEach(frame => {
    ctx.clearRect(0, 0, width, height)
    ctx.drawImage(frame.bmp, 0, 0, width, height)
    gif.addFrame(ctx, { copy: true, delay: frame.delay * offset })
  })
  gif.on('progress', percent => {
    Toast(i18n.t('tip.down_wait') + ': ' + (percent * 100).toFixed(2) + '%')
  })
  gif.on('finished', async blob => {
    Toast.clear(true)
    await downloadFile(blob, `${getArtworkFileName(artwork)}.gif`, { subDir: 'ugoira' })
  })
  gif.render()
}

// ref: https://github.com/FreeNowOrg/PixivNow/blob/master/src/utils/UgoiraPlayer.ts#L195
async function downloadMP4(ugoira, artwork, resetUgoira) {
  Toast(i18n.t('tip.down_wait'))

  const { width, height } = artwork
  let frames = Object.values(ugoira.frames).map(frame => ({
    data: frame.bmp,
    duration: frame.delay,
  }))
  resetUgoira()
  const { encode } = await import('modern-mp4')
  const videoBitrate = parseInt(store.state.appSetting.ugoiraMp4Bitrate) * 1e6
  const mp4File = await encode({ frames, width, height, audio: false, videoBitrate })
  const blob = new Blob([mp4File], { type: 'video/mp4' })
  frames = null
  await downloadFile(blob, `${getArtworkFileName(artwork)}.mp4`, { subDir: 'ugoira' })
}
