import { Toast } from 'vant'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { Preferences } from '@capacitor/preferences'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileDownload } from 'capacitor-plugin-filedownload'
import { FileOpener } from 'capacitor-plugin-file-opener'
import { Mediastore } from 'capacitor-mediastore'
import { NativeSettings, AndroidSettings, IOSSettings } from 'capacitor-native-settings'
import writeBlob from 'capacitor-blob-writer'
import { LocalStorage } from '@/utils/storage'
import { getCache, setCache } from '@/utils/storage/siteCache'
import { i18n } from '@/i18n'
import { formatBytes } from '@/utils'
import platform from '..'
import store from '@/store'

export async function copyText(string, cb, errCb) {
  try {
    await Clipboard.write({ string })
    cb()
  } catch (error) {
    errCb(error)
  }
}

function replaceValidFilename(str = '') {
  const maxLen = 72
  const strArr = str.split('.')
  const ext = strArr.pop()
  str = strArr.join('').replace(/[\\/|?*:<>'"\s.]/g, '_') + '.' + ext
  if (str.length > maxLen) str = str.slice(-maxLen)
  return str
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
async function fsDirectDownload(url, fileName, isCache = false) {
  const newUrl = new URL(url)
  if (platform.isIOS) newUrl.protocol = 'http:'
  newUrl.host = window.p_pximg_ip
  const downloadUrl = newUrl.href
  const res = await Filesystem.downloadFile({
    url: downloadUrl,
    path: `${dlBaseDir}/${fileName}`,
    directory: getDLDir(isCache),
    recursive: true,
    headers: platform.isIOS
      ? ({ Referer: 'https://www.pixiv.net' })
      : ({ Host: 'i.pximg.net', Referer: 'https://www.pixiv.net' }),
  })
  return { res, downloadUrl }
}
async function fsDownload(url, fileName, isCache = false) {
  const res = await Filesystem.downloadFile({
    url,
    path: `${dlBaseDir}/${fileName}`,
    directory: getDLDir(isCache),
    recursive: true,
  })
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
  path = decodeURIComponent(path.replace('file://', ''))
  const nameParts = fileNameSub.split('/')
  const filename = nameParts.pop()
  const album = [dlBaseDir].concat(nameParts).join('/')
  const { uri } = await Mediastore[func]({ album, filename, path })
  await Filesystem.deleteFile({ path })
  const dirMap = { savePicture: 'Pictures', saveVideo: 'Movies', saveToDownloads: 'Download' }
  return { uri, tipPath: `/storage/emulated/0/${dirMap[func]}/${func == 'saveToDownloads' ? '' : `${album}/`}${filename}` }
}
export async function downloadFile(url, fileName, subpath) {
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    const { preferMediaStore, preferDownloadManager } = store.state.appSetting
    const actions = [
      {
        test: () => isDirect && /\.(jpe?g|png|gif)$/.test(url),
        fn: async () => {
          const result = await fsDirectDownload(url, fileName, preferMediaStore)
          if (preferMediaStore) {
            const { uri, tipPath } = await mediaSave('savePicture', result.res.path, fileName)
            result.res.path = uri
            result.res.tipPath = tipPath
          }
          return result
        },
      },
      {
        test: () => preferDownloadManager,
        fn: async () => {
          const result = await dmDownload(url, fileName.split('/').pop())
          return result
        },
      },
      {
        test: () => true,
        fn: async () => {
          const result = await fsDownload(url, fileName, preferMediaStore)
          if (preferMediaStore) {
            const { uri, tipPath } = await mediaSave(
              /\.(jpe?g|png|gif)$/.test(url) ? 'savePicture' : 'saveToDownloads',
              result.res.path,
              fileName
            )
            result.res.path = uri
            result.res.tipPath = tipPath
          }
          return result
        },
      },
    ]
    const { res, downloadUrl } = await actions.find(e => e.test()).fn()

    addDownloadHistory({ status: 'ok', url: downloadUrl, fileName, path: res.path })

    Toast.clear(true)
    Toast({
      message: `${i18n.t('tip.downloaded')}: ${res.tipPath || decodeURIComponent(res.path.replace('file://', ''))}`,
      duration: 3000,
    })
    return { res }
  } catch (error) {
    addDownloadHistory({ status: 'error', url, fileName, error: `${error}` })
    return { error }
  }
}

export async function downloadBlob(blob, fileName, subpath) {
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    const { preferMediaStore } = store.state.appSetting
    const path = `${dlBaseDir}/${fileName}`
    const directory = getDLDir(preferMediaStore)
    await writeBlob({ blob, path, directory, recursive: true })
    let { uri } = await Filesystem.getUri({ path, directory })
    let tipPath = ''
    if (preferMediaStore) {
      /** @type {[() => boolean, MediastoreFn][]} */
      const actions = [
        [() => /\.(jpe?g|png|gif)$/.test(fileName), 'savePicture'],
        [() => /\.(webm|mp4)$/.test(fileName), 'saveVideo'],
        [() => true, 'saveToDownloads'],
      ]
      const func = actions.find(e => e[0]())[1]
      const res = await mediaSave(func, uri, fileName)
      uri = res.uri
      tipPath = res.tipPath
    }

    addDownloadHistory({ status: 'ok', fileName, path: uri })
    Toast.clear(true)
    Toast({
      message: `${i18n.t('tip.downloaded')}: ${tipPath || decodeURIComponent(uri.replace('file://', ''))}`,
      duration: 3000,
    })
    return { res: { uri } }
  } catch (error) {
    addDownloadHistory({ status: 'error', fileName, error: error + '' })
    return { error }
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

export async function getPximgUri(url) {
  return platform.isAndroid ? getPximgUriAndroid(url) : getPximgUriIOS(url)
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
