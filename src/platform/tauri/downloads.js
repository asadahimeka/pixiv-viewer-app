/**
 * Tauri 下载执行层:与 capacitor/downloads.js 同一接口
 *
 * - 进度:监听 Rust 端 download_file_progress 事件,按 taskId 路由到任务
 * - 取消:cancel_download 命令(服务端 select! 中断 + 清理半成品)
 * - thumbnail:按需生成 320px 缩略(canvas,会话内缓存)
 * - listDisk:递归扫描下载目录(pictureDir/pixiv-viewer,或用户自定义 PXV_DL_DIR)
 */
import { invoke, convertFileSrc } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import * as fs from '@tauri-apps/plugin-fs'
import { sep as sepFn } from '@tauri-apps/api/path'
import { Toast } from '@/lib/vant-apis'
import { i18n } from '@/i18n'
import { dlErrorText, formatBytes, formatDlError, replaceValidFileName } from '@/utils'

const sep = sepFn()

// ---------------- asset 协议 scope 注册 ----------------
// 静态配置只兜底默认目录($PICTURE/pixiv-viewer);用户自定义目录在
// 会话内通过 register_asset_dir 动态注册。scope 内存态,重启后重新注册
const registeredAssetDirs = new Set()

export async function registerAssetDir(path) {
  if (!path || registeredAssetDirs.has(path)) return
  try {
    await invoke('register_asset_dir', { path })
    registeredAssetDirs.add(path)
  } catch (err) {
    console.warn('register asset dir failed:', err)
  }
}

export async function initAssetScope() {
  const tauriUtils = await import('@/platform/tauri/utils')
  await registerAssetDir(await tauriUtils.baseDlDir())
}

// asset 协议要求正斜杠,Windows 的 pictureDir/sep 给的是反斜杠
function toAssetPath(path) {
  return String(path).replace(/\\/g, '/')
}

// progress 事件路由:id → (current, total) => void
const progressRoutes = new Map()
let unlistenProgress = null

async function ensureProgressListener() {
  if (unlistenProgress) return
  unlistenProgress = await listen('download_file_progress', event => {
    const { id, current, total } = event.payload || {}
    const cb = id != null && progressRoutes.get(id)
    if (cb) cb(current || 0, total || 0)
  }).catch(err => {
    console.warn('bind download progress failed:', err)
    return null
  })
}

export async function runDownload(task, { showToast = true } = {}) {
  // 排队期间已被取消的任务直接短路
  if (task.cancelToken && task.cancelToken()) {
    return { ok: false, canceled: true }
  }
  const subDir = task.subDir ? replaceValidFileName(task.subDir, true) : ''
  const isBlob = task.source instanceof Blob
  const tauriUtils = await import('@/platform/tauri/utils')
  let loading = null
  try {
    let baseMsg = ''
    if (showToast) {
      baseMsg = task.options?.message
        ? `${task.options.message}: ${task.fileName}`
        : `${i18n.t('tip.downloading')}: ${task.fileName}`
      Toast.allowMultiple()
      loading = Toast({
        duration: 0,
        className: 'download-toast',
        message: baseMsg,
        getContainer: '#app .app-base',
      })
    }

    let lastProgressMsg = baseMsg
    let lastProgressAt = 0
    const onDlProgress = (bytes, contentLength) => {
      try {
        task.onProgress?.(bytes, contentLength)
        const now = Date.now()
        if (!loading || now - lastProgressAt < 100) return
        lastProgressAt = now
        const progress = contentLength > 0
          ? Math.min(99, Math.round(bytes / contentLength * 100)) + '%'
          : formatBytes(bytes)
        const msg = `${progress} ${baseMsg}`
        if (msg != lastProgressMsg) {
          lastProgressMsg = msg
          loading.message = msg
        }
      } catch (err) {}
    }

    let result
    if (isBlob) {
      result = await tauriUtils.downloadBlob(task.source, task.fileName, subDir, {
        cancelToken: task.cancelToken,
      })
    } else {
      await ensureProgressListener()
      progressRoutes.set(task.id, onDlProgress)
      try {
        result = await tauriUtils.downloadFile(task.source, task.fileName, subDir, {
          taskId: task.id,
        })
      } finally {
        progressRoutes.delete(task.id)
      }
    }

    if (result.error) {
      throw result.error instanceof Error ? result.error : new Error(result.error)
    }

    if (task.cancelToken && task.cancelToken()) {
      // 下载已完成但期间收到取消:删除落盘成品后按取消处理
      await fs.remove(result.res).catch(() => {})
      return { ok: false, canceled: true }
    }

    // 成品目录(可能是用户改过的自定义目录)注册进 asset scope
    const destDir = String(result.res).replace(/[\\/][^\\/]*$/, '')
    registerAssetDir(destDir)

    let fileSize = null
    try {
      const stat = await fs.stat(result.res)
      fileSize = stat?.size || null
    } catch (err) {}

    // 记录 fileName 用实际落盘路径的 basename:Rust 侧会对文件名再消毒
    // (非法字符替换为 _),只有以真实盘上名字为准,对账匹配才不会落空
    const diskName = String(result.res)
      .replace(/[\\/]/g, '/')
      .split('/')
      .pop()

    if (loading) {
      try {
        loading.message = result.successMsg
        setTimeout(() => {
          loading?.clear()
        }, 2000)
      } catch (err) {}
    }

    return {
      ok: true,
      key: `${subDir || ''}/${diskName}`,
      fileName: diskName,
      subDir,
      destType: 'pictures',
      destPath: result.res,
      tipPath: null,
      fileSize,
      successMsg: result.successMsg,
    }
  } catch (err) {
    try {
      loading?.clear()
    } catch (e) {}

    if (err && (err.canceled || String(err.message || '').includes('DOWNLOAD_CANCELLED'))) {
      return { ok: false, canceled: true }
    }

    console.log('download err: ', err)
    window.umami?.track('download_file_err', { err: formatDlError(err) })

    // 与旧版行为对齐:字符串源失败时提供浏览器下载兜底
    if (!isBlob && typeof task.source == 'string') {
      try {
        const { Dialog } = await import('@/lib/vant-apis')
        const { downloadLink } = await import('@/utils')
        const action = await Dialog.confirm({
          title: i18n.t('D8R2062pjASZe9mgvpeLr'),
          message: `${dlErrorText(err)}<br>${err}<br>${i18n.t('rTIZ1T04iT1thVsaytEQF')}`,
          lockScroll: false,
          closeOnPopstate: true,
          cancelButtonText: i18n.t('common.cancel'),
          confirmButtonText: i18n.t('common.confirm'),
        }).catch(() => 'cancel')
        if (action == 'confirm') downloadLink(task.source, task.fileName)
      } catch (e) {}
    } else {
      Toast(i18n.t('D8R2062pjASZe9mgvpeLr') + ': ' + dlErrorText(err))
    }

    return {
      ok: false,
      error: { step: null, message: dlErrorText(err), raw: `${err}` },
    }
  }
}

export async function cancelTask(taskId) {
  await invoke('cancel_download', { id: taskId }).catch(() => {})
}

// ---------------- 按需缩略(canvas) ----------------

const THUMB_MAX_PX = 320
const thumbCache = new Map()
const THUMB_CACHE_LIMIT = 400

function loadImageEl(src, cors = false) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (cors) img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

function compressToDataUrl(img) {
  const scale = Math.min(1, THUMB_MAX_PX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d').drawImage(img, 0, 0, w, h)
  return canvas.toDataURL('image/jpeg', 0.82)
}

// 缩略:先以 crossOrigin 加载并压成 320px dataURL(不设 crossOrigin 会污染画布,
// toDataURL 抛 SecurityError);任何一步失败退回原图直载,再失败 null
export async function thumbnail({ path } = {}) {
  if (!path) return null
  if (thumbCache.has(path)) return thumbCache.get(path)
  const assetUrl = convertFileSrc(toAssetPath(path))
  try {
    const img = await loadImageEl(assetUrl, true)
    const dataUrl = compressToDataUrl(img)
    if (thumbCache.size >= THUMB_CACHE_LIMIT) thumbCache.clear()
    thumbCache.set(path, dataUrl)
    return dataUrl
  } catch (err) {}
  try {
    await loadImageEl(assetUrl, false)
    if (thumbCache.size >= THUMB_CACHE_LIMIT) thumbCache.clear()
    thumbCache.set(path, assetUrl)
    return assetUrl
  } catch (err) {
    return null
  }
}

// 清理会话内缩略图缓存(缩略图未落盘,无需文件清理),供 ClearCache 页调用
export async function clearThumbCache() {
  thumbCache.clear()
}

// ---------------- 目录扫描 / 文件操作 ----------------

async function statSafe(p) {
  try {
    const stat = await fs.stat(p)
    return {
      size: stat?.size || 0,
      mtime: stat?.mtime ? new Date(stat.mtime).getTime() : 0,
    }
  } catch (err) {
    return { size: 0, mtime: 0 }
  }
}

export async function listDisk() {
  const tauriUtils = await import('@/platform/tauri/utils')
  const baseDir = await tauriUtils.baseDlDir()
  const out = []
  // 先递归收集文件路径(目录遍历必须串行),再并发分批 stat:
  // 逐文件串行 stat 意味着每文件一次桥接往返,几百文件时下拉刷新会明显卡顿
  const walk = async (dir, depth) => {
    let entries = []
    try {
      entries = await fs.readDir(dir)
    } catch (err) {
      return
    }
    for (const it of entries) {
      const full = `${dir}${sep}${it.name}`
      if (it.isDirectory) {
        if (depth < 3) await walk(full, depth + 1)
        continue
      }
      out.push({ name: it.name, uri: full })
    }
  }
  await walk(baseDir, 0)

  const CONCURRENCY = 8
  for (let i = 0; i < out.length; i += CONCURRENCY) {
    const batch = out.slice(i, i + CONCURRENCY)
    const stats = await Promise.all(batch.map(it => statSafe(it.uri)))
    batch.forEach((it, j) => {
      it.size = stats[j].size
      it.mtime = stats[j].mtime
    })
  }
  return out
}

export async function deleteDestFile(dest = {}) {
  if (!dest.path) return false
  await fs.remove(dest.path).catch(() => {})
  return true
}

// 系统默认程序打开文件/目录:走自定义 open_path 命令
// (shell 插件 JS 桥的 open 只放行 mailto/tel/http,本地路径会被正则拦下)
export async function openDest(dest = {}, _fileName) {
  await invoke('open_path', { path: dest.path })
  return true
}

export async function locateDest(dest = {}) {
  if (!dest.path) return false
  const idx = dest.path.lastIndexOf(sep)
  const dir = idx > 0 ? dest.path.slice(0, idx) : dest.path
  await invoke('open_path', { path: dir })
  return true
}
