import axios from 'axios'
import * as fs from '@tauri-apps/plugin-fs'
import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-shell'
import { writeText } from '@tauri-apps/plugin-clipboard-manager'
import { sep as sepFn, pictureDir } from '@tauri-apps/api/path'
import { open as openFileDialog } from '@tauri-apps/plugin-dialog'
import { i18n } from '@/i18n'
import { LocalStorage } from '@/utils/storage'
import {
  safeDecodeURIComponent,
  markDlError,
  isRetryableDlError,
  retryWhere,
} from '@/utils'
import axiosTauriAdapter from './axios-tauri-adapter'

const sep = sepFn()
const client = axios.create({ adapter: axiosTauriAdapter })

export function copyText(text, cb, errCb) {
  writeText(`${text}`).then(cb, errCb)
}

export async function openUrl(url) {
  try {
    await open(url)
  } catch (error) {
    window.open(url, '_blank', 'noopener noreferrer')
  }
}

export async function getSelectedSaveDir() {
  try {
    const selected = await openFileDialog({ directory: true })
    return selected
  } catch (err) {
    return null
  }
}

const baseDlDir = async () => LocalStorage.get('PXV_DL_DIR', `${await pictureDir()}${sep}pixiv-viewer`)
export async function ensureDownloadDir(sub = '') {
  const dir = (await baseDlDir()) + (sub || '')
  const isExist = await fs.exists(dir)
  if (!isExist) {
    await fs.mkdir(dir, { recursive: true })
  }
}

const isDirect = LocalStorage.get('PXV_PXIMG_DIRECT', false)
export async function downloadFile(url, fileName, subDir = '') {
  try {
    if (subDir) subDir = sep + subDir
    await ensureDownloadDir(subDir)

    const isDirectImg = isDirect && /\.(jpe?g|png)$/.test(url)
    let directUrl = url
    if (isDirectImg) {
      const newUrl = new URL(url)
      newUrl.protocol = 'http:'
      newUrl.host = window.p_pximg_ip
      directUrl = newUrl.href
    }

    const resPath = await retryWhere(
      async () => invoke('download_file', {
        url: directUrl,
        writePath: `${await baseDlDir()}${subDir || ''}`,
        fileName,
        id: fileName,
        headers: isDirectImg ? { Host: 'i.pximg.net', Referer: 'https://www.pixiv.net/' } : undefined,
      }),
      isRetryableDlError
    )

    const successMsg = i18n.t('tip.downloaded') + ': ' + safeDecodeURIComponent(resPath)
    return { res: resPath, successMsg }
  } catch (error) {
    return { error: markDlError(error, 'tauriDl', url) }
  }
}

/**
 * @param {Blob} blob
 * @param {string} fileName
 * @param {string} subDir
 */
export async function downloadBlob(blob, fileName, subDir = '') {
  try {
    if (subDir) subDir = sep + subDir

    await ensureDownloadDir(subDir)
    const res = `${await baseDlDir()}${subDir}${sep}${fileName}`
    await fs.writeFile(res, await blob.arrayBuffer())

    const successMsg = i18n.t('tip.downloaded') + ': ' + safeDecodeURIComponent(res)
    return { res, successMsg }
  } catch (error) {
    return { error: markDlError(error, 'tauriBlob') }
  }
}

// export async function downloadText(text, fileName, authorName) {
//   try {
//     fileName = replaceValidFilename(fileName)

//     const dir = (isDlDirByAuthor && authorName) ? authorName : '_txt'
//     await ensureDownloadDir(sep + dir)
//     const path = `${await baseDlDir()}${sep}${dir}${sep}${fileName}`
//     await fs.writeTextFile(path, text)

//     Toast({
//       message: i18n.t('tip.downloaded') + ': ' + decodeURIComponent(path),
//       duration: 3000,
//     })

//     return path
//   } catch (err) {
//     Toast(i18n.t('KCziWydyIc-nodsgMmA2D') + ': ' + err)
//   }
// }

export async function getPximgUri(url) {
  url.protocol = 'http:'
  url.host = window.p_pximg_ip
  const { data } = await client(url.href, {
    responseType: 'blob',
    headers: { Host: 'i.pximg.net', Referer: 'https://www.pixiv.net/' },
  })
  return URL.createObjectURL(data)
}
