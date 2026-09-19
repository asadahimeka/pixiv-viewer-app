import { Dialog } from '@/lib/vant-apis'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileDownload } from 'capacitor-plugin-filedownload'
import { FileOpener } from 'capacitor-plugin-file-opener'
import { Mediastore } from 'capacitor-mediastore'
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings'
import { PixivCronet } from 'capacitor-plugin-pixiv-cronet'
import { Saf } from 'capacitor-plugin-saf'
import writeBlob from 'capacitor-blob-writer'
import { LocalStorage } from '@/utils/storage'
import { getCache, setCache } from '@/utils/storage/siteCache'
import { i18n } from '@/i18n'
import {
  formatBytes,
  formatDlError,
  replaceValidFileName,
  safeDecodeURIComponent,
  markDlError,
  isRetryableDlError,
  retryWhere,
} from '@/utils'
import store from '@/store'
import platform from '..'

export async function copyText(string, cb, errCb) {
  try {
    await Clipboard.write({ string })
    cb()
  } catch (error) {
    errCb(error)
  }
}

function replaceValidFilename(str = '') {
  // 与全局清洗逻辑一致，但下载文件名上限 72 字符
  return replaceValidFileName(str).slice(-72)
}

async function addDownloadHistory(args) {
  const historyList = await getCache('downloads.history') || []
  historyList.unshift({ ...args, date: new Date().toLocaleString() })
  setCache('downloads.history', historyList)
}

const isDirect = LocalStorage.get('PXV_PXIMG_DIRECT', false)
const dlBaseDir = 'pixiv-viewer'

function getDLDir(isCache = false) {
  return platform.isAndroid
    ? (isCache ? Directory.External : Directory.Pictures)
    : Directory.Documents
}

// 发起 Filesystem 下载；传入 onProgress 时开启原生 progress 回报并监听事件。
// progress 事件负载为 { url, bytes, contentLength }（Android/iOS/web 一致），
// 每个监听会收到所有并发任务的事件，需按发起下载的 URL 过滤后转发给当前任务
export async function fsDownloadFile(options, onProgress) {
  if (typeof onProgress != 'function') return Filesystem.downloadFile(options)
  const listener = await Filesystem.addListener('progress', evt => {
    if (evt.url === options.url) onProgress(evt.bytes || 0, evt.contentLength || 0)
  })
  try {
    return await Filesystem.downloadFile({ ...options, progress: true })
  } finally {
    listener.remove()
  }
}

async function fsDirectDownload(url, fileName, isCache = false, onProgress) {
  const newUrl = new URL(url)
  if (platform.isIOS) newUrl.protocol = 'http:'
  newUrl.host = window.p_pximg_ip
  const downloadUrl = newUrl.href
  const res = await fsDownloadFile({
    url: downloadUrl,
    path: `${dlBaseDir}/${fileName}`,
    directory: getDLDir(isCache),
    recursive: true,
    headers: platform.isIOS
      ? ({ Referer: 'https://www.pixiv.net' })
      : ({ Host: 'i.pximg.net', Referer: 'https://www.pixiv.net' }),
  }, onProgress)
  return { res, downloadUrl }
}

async function fsDownload(url, fileName, isCache = false, onProgress) {
  const res = await fsDownloadFile({
    url,
    path: `${dlBaseDir}/${fileName}`,
    directory: getDLDir(isCache),
    recursive: true,
  }, onProgress)
  return { res, downloadUrl: url }
}

async function dmDownload(url, fileName) {
  const res = await FileDownload.download({
    uri: url,
    fileName: `${dlBaseDir}/${fileName}`,
  })
  return { res, downloadUrl: url }
}

/**
 * @typedef {keyof import('capacitor-mediastore').MediastorePlugin} MediastoreFn
 * @param {MediastoreFn} func
 * @param {string} path
 * @param {string} fileNameSub
 */
async function mediaSave(func, path, fileNameSub) {
  try {
    path = safeDecodeURIComponent(path.replace('file://', ''))
    const nameParts = fileNameSub.split('/')
    const filename = nameParts.pop()
    const album = [dlBaseDir].concat(nameParts).join('/')
    const { uri } = await Mediastore[func]({ album, filename, path })
    await Filesystem.deleteFile({ path }).catch(() => {})
    const dirMap = { savePicture: 'Pictures', saveVideo: 'Movies', saveToDownloads: 'Download' }
    return { uri, tipPath: `/storage/emulated/0/${dirMap[func]}/${album}/${filename}` }
  } catch (err) {
    throw markDlError(err, 'mediaSave')
  }
}

function toFileUri(path) {
  return path.startsWith('file://') ? path : 'file://' + path
}

async function confirmShareFallback() {
  const action = await Dialog.confirm({
    title: i18n.t('D8R2062pjASZe9mgvpeLr'),
    message: i18n.t('tip.dl_share_fallback'),
    lockScroll: false,
    closeOnPopstate: true,
    cancelButtonText: i18n.t('common.cancel'),
    confirmButtonText: i18n.t('common.confirm'),
  }).catch(() => 'cancel')
  return action == 'confirm'
}

async function shareFile(filePath, fileName) {
  await Share.share({
    title: fileName,
    dialogTitle: i18n.t('tip.dl_share_fallback'),
    files: [toFileUri(filePath)],
  })
}

// 文件已完整但转存失败时：确认后调起系统分享，由用户手动保存
async function offerShare(filePath, fileName) {
  if (!(await confirmShareFallback())) return false
  await shareFile(filePath, fileName)
  return true
}

const SAF_URI_KEY = 'PXV_DL_SAF_URI'
const SAF_ON_KEY = 'PXV_DL_USE_SAF'

export function isSafEnabled() {
  return platform.isAndroid && LocalStorage.get(SAF_ON_KEY, false) && !!LocalStorage.get(SAF_URI_KEY)
}

function getMime(fileName) {
  const ext = (fileName.split('.').pop() || '').toLowerCase()
  const map = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    avif: 'image/avif',
    apng: 'image/apng',
    mp4: 'video/mp4',
    webm: 'video/webm',
    zip: 'application/zip',
    txt: 'text/plain',
  }
  return map[ext] || 'application/octet-stream'
}

// 把私有目录里的成品文件复制进 SAF 授权目录（同名覆盖，系统自动处理重名去重）
async function safSave(tempPath, fileName) {
  try {
    const nameParts = fileName.split('/')
    const baseName = nameParts.pop()
    const relativeDir = [dlBaseDir].concat(nameParts).join('/')
    const treeUri = LocalStorage.get(SAF_URI_KEY)
    const res = await Saf.writeFile({
      treeUri,
      relativeDir,
      fileName: baseName,
      srcPath: tempPath.replace('file://', ''),
      mime: getMime(fileName),
    })
    await Filesystem.deleteFile({ path: tempPath }).catch(() => {})
    const treeSeg = safeDecodeURIComponent((treeUri || '').split('/').pop())
    return { uri: res.uri, tipPath: `SAF:/${treeSeg}/${relativeDir}/${res.name || baseName}` }
  } catch (err) {
    throw markDlError(err, 'safWrite')
  }
}

// onProgress: (bytes, contentLength) => void，仅 Filesystem 下载路径支持进度回报
export async function downloadFile(url, fileName, subpath, onProgress) {
  let step = 'fsDownload'
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    const { preferMediaStore, preferDownloadManager } = store.state.appSetting
    const actions = [
      {
        test: () => isDirect && /\.(jpe?g|png|gif)$/.test(url),
        fn: async () => {
          step = 'fsDirect'
          const result = await retryWhere(
            () => fsDirectDownload(url, fileName, preferMediaStore, onProgress),
            isRetryableDlError
          )
          if (preferMediaStore) {
            step = 'mediaSave'
            try {
              const { uri, tipPath } = await mediaSave('savePicture', result.res.path, fileName)
              result.res.path = uri
              result.res.tipPath = tipPath
            } catch (err) {
              step = 'share'
              if (!(await offerShare(result.res.path, fileName))) throw err
              result.res.tipPath = i18n.t('tip.dl_share_done')
            }
          }
          return result
        },
      },
      {
        test: () => preferDownloadManager,
        fn: async () => {
          step = 'downloadManager'
          const result = await retryWhere(
            () => dmDownload(url, fileName.split('/').pop()),
            isRetryableDlError
          )
          return result
        },
      },
      {
        test: () => isSafEnabled(),
        fn: async () => {
          step = 'fsDownload'
          const result = await retryWhere(() => fsDownload(url, fileName, true, onProgress), isRetryableDlError)
          step = 'safWrite'
          try {
            const { uri, tipPath } = await safSave(result.res.path, fileName)
            result.res.path = uri
            result.res.tipPath = tipPath
          } catch (err) {
            step = 'share'
            if (!(await offerShare(result.res.path, fileName))) throw err
            result.res.tipPath = i18n.t('tip.dl_share_done')
          }
          return result
        },
      },
      {
        test: () => true,
        fn: async () => {
          step = 'fsDownload'
          let result
          try {
            result = await retryWhere(() => fsDownload(url, fileName, preferMediaStore, onProgress), isRetryableDlError)
          } catch (err) {
            // 直接写公共目录失败且文件还没落地时，询问后改为私有目录下载 + 系统分享保存
            if (preferMediaStore || !(await confirmShareFallback())) throw err
            step = 'fsDownload'
            result = await fsDownload(url, fileName, true, onProgress)
            step = 'share'
            await shareFile(result.res.path, fileName)
            result.res.tipPath = i18n.t('tip.dl_share_done')
            return result
          }
          if (preferMediaStore) {
            step = 'mediaSave'
            try {
              const { uri, tipPath } = await mediaSave(
                /\.(jpe?g|png|gif)$/.test(url) ? 'savePicture' : 'saveToDownloads',
                result.res.path,
                fileName
              )
              result.res.path = uri
              result.res.tipPath = tipPath
            } catch (err) {
              step = 'share'
              if (!(await offerShare(result.res.path, fileName))) throw err
              result.res.tipPath = i18n.t('tip.dl_share_done')
            }
          }
          return result
        },
      },
    ]
    const { res, downloadUrl } = await actions.find(e => e.test()).fn()

    addDownloadHistory({ status: 'ok', url: downloadUrl, fileName, path: res.path })

    const successMsg = `${i18n.t('tip.downloaded')}: ${res.tipPath || safeDecodeURIComponent(res.path.replace('file://', ''))}`
    return { res, successMsg }
  } catch (error) {
    addDownloadHistory({ status: 'error', url, fileName, error: `${error}` })
    return { error: markDlError(error, step, url) }
  }
}

export async function downloadBlob(blob, fileName, subpath) {
  let step = 'blobWrite'
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    const { preferMediaStore } = store.state.appSetting
    const useSaf = isSafEnabled()
    const path = `${dlBaseDir}/${fileName}`
    const directory = getDLDir(preferMediaStore || useSaf)
    await writeBlob({
      blob,
      path,
      directory,
      recursive: true,
      // 原生快速通道失败会静默回退到 bridge 慢速写入，记录一下便于统计
      on_fallback: err => {
        window.umami?.track('dl_blob_fallback', { err: formatDlError(markDlError(err, 'blobFallback')) })
      },
    })
    let { uri } = await Filesystem.getUri({ path, directory })
    let tipPath = ''
    if (useSaf) {
      step = 'safWrite'
      try {
        const res = await safSave(uri, fileName)
        uri = res.uri
        tipPath = res.tipPath
      } catch (err) {
        step = 'share'
        if (!(await offerShare(uri, fileName))) throw err
        tipPath = i18n.t('tip.dl_share_done')
      }
    } else if (preferMediaStore) {
      step = 'mediaSave'
      /** @type {[() => boolean, MediastoreFn][]} */
      const actions = [
        [() => /\.(jpe?g|png|gif)$/.test(fileName), 'savePicture'],
        [() => /\.(webm|mp4)$/.test(fileName), 'saveVideo'],
        [() => true, 'saveToDownloads'],
      ]
      const func = actions.find(e => e[0]())[1]
      try {
        const res = await mediaSave(func, uri, fileName)
        uri = res.uri
        tipPath = res.tipPath
      } catch (err) {
        step = 'share'
        // blob 成品已在私有目录，转存失败时可调起系统分享手动保存
        if (!(await offerShare(uri, fileName))) throw err
        tipPath = i18n.t('tip.dl_share_done')
      }
    }

    addDownloadHistory({ status: 'ok', fileName, path: uri })

    const successMsg = `${i18n.t('tip.downloaded')}: ${tipPath || safeDecodeURIComponent(uri.replace('file://', ''))}`
    return { res: { uri }, successMsg }
  } catch (error) {
    addDownloadHistory({ status: 'error', fileName, error: error + '' })
    return { error: markDlError(error, step) }
  }
}

export async function shareSettingsFile(blob) {
  const path = `pixiv-viewer-settings-${Date.now()}.txt`
  const directory = Directory.External
  await writeBlob({ blob, path, directory })
  const { uri } = await Filesystem.getUri({ path, directory })
  await Share.share({
    title: i18n.t('V8DX1WzGd142O8SUrOlMP'),
    dialogTitle: i18n.t('V8DX1WzGd142O8SUrOlMP'),
    files: [uri],
  })
}

// in-flight 去重：同一图片 URL 的并发加载共享同一个下载任务。
// 原生下载已改为异步并行，若无去重，两个组件同时加载同一张图会对同一路径
// 并发写入（FileOutputStream 截断）导致文件损坏；顺带避免重复下载
const pximgUriTasks = new Map()

export function getPximgUri(url) {
  const key = url.href
  let task = pximgUriTasks.get(key)
  if (!task) {
    task = (platform.isAndroid ? getPximgUriAndroid(url) : getPximgUriIOS(url))
      .finally(() => pximgUriTasks.delete(key))
    pximgUriTasks.set(key, task)
  }
  return task
}

export async function getPximgUriIOS(url) {
  url.protocol = 'http:'
  url.host = window.p_pximg_ip
  const path = url.pathname.slice(1)
  const directory = Directory.Cache
  const stats = await Filesystem.stat({ path, directory }).catch(() => ({ uri: null }))
  if (stats.uri) {
    return Capacitor.convertFileSrc(stats.uri)
  }
  const res = await Filesystem.downloadFile({
    url: url.href,
    path,
    directory,
    recursive: true,
    headers: { Referer: 'https://www.pixiv.net' },
  })
  return Capacitor.convertFileSrc(res.path)
}

export async function getPximgUriAndroid(url) {
  url.protocol = 'https:'
  url.host = window.p_pximg_ip
  const path = url.pathname.slice(1)
  const directory = Directory.External
  const stats = await Filesystem.stat({ path, directory }).catch(() => ({ uri: null }))
  if (stats.uri) {
    return Capacitor.convertFileSrc(stats.uri)
  }
  const res = await Filesystem.downloadFile({
    url: url.href,
    path,
    directory,
    recursive: true,
    headers: { Host: 'i.pximg.net', Referer: 'https://www.pixiv.net' },
  })
  return Capacitor.convertFileSrc(res.path)
}

export async function share(...args) {
  return Share.share(...args)
}

export async function getCacheSize() {
  const { size = 0, len = 0 } = await Filesystem
    .getFileSize({ path: '', directory: Directory.External })
    .catch(() => ({}))
  return [size, len]
}

export async function clearImageCache() {
  const directory = platform.isIOS ? Directory.Cache : Directory.External
  const { files } = await Filesystem.readdir({ path: '', directory })
  await Promise.all(files.map(async it => {
    if (it.type == 'directory') {
      await Filesystem.rmdir({ path: it.name, directory, recursive: true })
    } else {
      await Filesystem.deleteFile({ path: it.name, directory })
    }
  }))
}

export function openAppSettings() {
  platform.isIOS
    ? NativeSettings.openIOS({
      option: IOSSettings.App,
    })
    : NativeSettings.openAndroid({
      option: AndroidSettings.ApplicationDetails,
    })
}

export async function openFile(path) {
  await FileOpener.open({ path })
}

export function convertFileSrc(path) {
  return Capacitor.convertFileSrc(path)
}

export async function readDlDir() {
  const directory = platform.isIOS ? Directory.Documents : Directory.Pictures
  const read = async path => {
    const { files } = await Filesystem.readdir({ path, directory }).catch(() => ({ files: [] }))
    return files
  }
  let files = await read(dlBaseDir)
  const subDirs = files.filter(e => e.type == 'directory')
  files = files.filter(e => e.type == 'file')
  let subFiles = await Promise.all(subDirs.map(e => read(`${dlBaseDir}/${e.name}`)))
  subFiles = subFiles.flat().filter(e => e.type == 'file')
  return files.concat(subFiles).map(it => {
    const ms = it.ctime || it.mtime
    return {
      path: it.uri,
      imgSrc: convertFileSrc(it.uri),
      fileName: it.name,
      id: it.name.match(/_(\d{4,})[_.]/)?.[1],
      isNovel: /\.txt$/.test(it.name),
      isImage: /\.(jpe?g|png|gif)$/.test(it.name),
      size: formatBytes(it.size),
      date: new Date(ms).toLocaleString(),
      status: 'ok',
      ms,
    }
  })
}

const SKIP_SSL_VERIFICATION_KEY = 'skip_ssl_verification'
export async function getSkipSslSetting() {
  const { value } = await Preferences.get({ key: SKIP_SSL_VERIFICATION_KEY })
  return value === 'true'
}
export async function setSkipSslSetting(shouldSkip = false) {
  await Preferences.set({
    key: SKIP_SSL_VERIFICATION_KEY,
    value: shouldSkip.toString(),
  })
}

let _isCronetAvailable = false
export async function getPixivQuicClient() {
  if (!_isCronetAvailable) {
    const { available } = await PixivCronet.isAvailable()
    if (!available) {
      throw new Error('Cronet not available')
    }
    _isCronetAvailable = true
  }
  return async (url, config) => {
    const options = { url }
    if (config.method) options.method = config.method
    if (config.headers) options.headers = config.headers
    if (config.data) {
      options.body = typeof config.data == 'string' ? config.data : JSON.stringify(config.data)
    }
    const res = await PixivCronet.request(options)
    if (res.status == 200) {
      return { data: config.responseType == 'text' ? res.data : JSON.parse(res.data) }
    } else {
      try {
        const err = { response: { data: JSON.parse(res.data) } }
        throw err
      } catch (err) {
        throw new Error(res.data)
      }
    }
  }
}
