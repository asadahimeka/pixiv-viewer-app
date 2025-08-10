import { Toast } from 'vant'
import { Capacitor } from '@capacitor/core'
import { Clipboard } from '@capacitor/clipboard'
import { Share } from '@capacitor/share'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileDownload } from 'capacitor-plugin-filedownload'
import { FileOpener } from '@capacitor-community/file-opener'
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
export async function downloadFile(url, fileName, subpath) {
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    let res
    let downloadUrl
    if (isDirect && /\.(jpe?g|png)$/.test(url)) {
      const newUrl = new URL(url)
      if (platform.isIOS) newUrl.protocol = 'http:'
      newUrl.host = window.p_pximg_ip
      downloadUrl = newUrl.href
      res = await Filesystem.downloadFile({
        url: downloadUrl,
        path: 'pixiv-viewer/' + fileName,
        directory: platform.isAndroid ? Directory.Downloads : Directory.Documents,
        recursive: true,
        headers: platform.isIOS
          ? ({ Referer: 'https://www.pixiv.net' })
          : ({ Host: 'i.pximg.net', Referer: 'https://www.pixiv.net' }),
      })
    } else if (store.state.appSetting.preferDownloadByDM) {
      downloadUrl = url
      res = await FileDownload.download({
        uri: downloadUrl,
        fileName: 'pixiv-viewer/' + fileName,
      })
    } else {
      downloadUrl = url
      res = await Filesystem.downloadFile({
        url: downloadUrl,
        path: 'pixiv-viewer/' + fileName,
        directory: platform.isAndroid ? Directory.Downloads : Directory.Documents,
        recursive: true,
      })
    }

    addDownloadHistory({ status: 'ok', url: downloadUrl, fileName, path: res.path })

    Toast.clear(true)
    Toast({
      message: i18n.t('tip.downloaded') + ': ' + decodeURIComponent(res.path.replace('file://', '')),
      duration: 3000,
    })
    return { res }
  } catch (error) {
    addDownloadHistory({ status: 'error', url, fileName, error: error + '' })
    return { error }
  }
}

export async function downloadBlob(blob, fileName, subpath) {
  try {
    fileName = replaceValidFilename(fileName)
    if (subpath) fileName = subpath + '/' + fileName

    const path = 'pixiv-viewer/' + fileName
    const directory = Directory.Downloads

    await writeBlob({ blob, path, directory, recursive: true })
    const { uri } = await Filesystem.getUri({ path, directory })

    addDownloadHistory({ status: 'ok', fileName, path: uri })
    Toast.clear(true)
    Toast({
      message: i18n.t('tip.downloaded') + ': ' + decodeURIComponent(uri.replace('file://', '')),
      duration: 3000,
    })
    return { res: { uri } }
  } catch (error) {
    addDownloadHistory({ status: 'error', fileName, error: error + '' })
    return { error }
  }
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

export async function openFile(filePath) {
  await FileOpener.open({ filePath })
}

export function convertFileSrc(path) {
  return Capacitor.convertFileSrc(path)
}

export async function readDlDir(path) {
  const directory = platform.isIOS ? Directory.Documents : Directory.Downloads
  const { files } = await Filesystem.readdir({ path, directory }).catch(() => ({ files: [] }))
  const res = await Promise.all(files.map(async it => {
    if (it.type == 'file') {
      return {
        path: it.uri,
        imgSrc: convertFileSrc(it.uri),
        fileName: it.name,
        id: it.name.match(/_(\d{4,})[_.]/)?.[1],
        isNovel: /\.txt$/.test(it.name),
        isImage: /\.(jpe?g|png|gif)$/.test(it.name),
        size: formatBytes(it.size),
        date: new Date(it.ctime).toLocaleString(),
        status: 'ok',
        ms: it.ctime || it.mtime,
      }
    }
  }))
  return res.filter(Boolean)
}
