/**
 * Capacitor 下载执行层:下载中心服务与平台下载策略之间的桥
 *
 * - runDownload:包一层 toast/进度/取消,调 @/platform/capacitor/utils 的下载策略
 * - cancelTask:同时通知 Filesystem(私有点对点下载)与 FileDownload(系统下载管理器)
 * - thumbnail:按需生成 320px 小图(原生),失败回退原图 URL,再失败 null(显示类型图标)
 * - listDisk:递归扫描下载目录,供对账与未识别文件展示
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { FileDownload } from 'capacitor-plugin-filedownload'
import { Saf } from 'capacitor-plugin-saf'
import { Toast } from '@/lib/vant-apis'
import { i18n } from '@/i18n'
import { dlErrorText, formatBytes, formatDlError, isFileLikePath, replaceValidFileName, safeDecodeURIComponent } from '@/utils'
import { isContentUri } from '@/utils/downloadRecords'
import platform from '..'

const DL_BASE_DIR = 'pixiv-viewer'
const THUMB_MAX_SIZE = 320
let thumbWarned = false

export async function runDownload(task, { showToast = true } = {}) {
  // 排队期间已被取消的任务直接短路
  if (task.cancelToken && task.cancelToken()) {
    return { ok: false, canceled: true }
  }
  const subDir = task.subDir ? replaceValidFileName(task.subDir, true) : ''
  const isBlob = task.source instanceof Blob
  const capUtils = await import('@/platform/capacitor/utils')
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

    // 进度 toast 文本节流(与旧实现一致,100ms),同时把字节进度转发给下载中心
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

    const result = isBlob
      ? await capUtils.downloadBlob(task.source, task.fileName, subDir, {
        taskId: task.id,
        cancelToken: task.cancelToken,
        onStep: task.onStep,
      })
      : await capUtils.downloadFile(task.source, task.fileName, subDir, onDlProgress, {
        taskId: task.id,
        cancelToken: task.cancelToken,
        onStep: task.onStep,
      })

    if (result.error) {
      throw result.error instanceof Error ? result.error : new Error(result.error)
    }

    // 读取实际文件大小与修改时间,供下载中心记录、存储概览与完成时播种使用
    let fileSize = null
    let fileMtime = null
    const dlPath = result.res?.path || result.res?.uri
    if (dlPath && (dlPath.startsWith('file://') || dlPath.startsWith('/'))) {
      try {
        const stat = await Filesystem.stat({ path: dlPath.replace('file://', '') })
        fileSize = stat?.size || null
        fileMtime = stat?.mtime || null
      } catch (err) {}
    }
    // content://(SAF/媒体库非图片目录)没有 stat 途径,Saf.writeFile 也只回 {uri,name},
    // 拿不到大小就一路回退:平台层落盘前 stat 到的 res.size → Blob 源自身大小(生成型下载必有)
    fileSize = fileSize ??
      result.res?.size ??
      (isBlob ? task.source.size : null)

    if (loading) {
      try {
        loading.message = result.successMsg
        setTimeout(() => {
          loading?.clear()
        }, 2000)
      } catch (err) {}
    }

    // 记录模型统一存 basename,subDir 独立存放;平台层返回的 fileName 可能含子目录前缀
    const resultName = String(result.fileName || task.fileName)
    return {
      ok: true,
      key: `${subDir || ''}/${resultName.split('/').pop()}`,
      fileName: resultName.split('/').pop(),
      subDir,
      destType: result.destType,
      destPath: result.res?.path || result.res?.uri || null,
      tipPath: result.res?.tipPath || null,
      fileSize,
      fileMtime,
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
      error: { step: err?.step || null, message: dlErrorText(err), raw: `${err}` },
    }
  }
}

export async function cancelTask(taskId) {
  await Filesystem.cancelDownload({ taskId }).catch(() => {})
  await FileDownload.cancelDownload({ taskId }).catch(() => {})
}

// 按需缩略:原生生成 320px 小图(解码快、缩略框下清晰度足够),
// 失败回退原图 URL(常见可解码格式),再失败 null(显示类型图标)。
// content://(SAF/媒体库)原样透传,原生侧不认就走下面的回退
export async function thumbnail({ path, fileName } = {}) {
  if (!path) return null
  const target = await resolveDestPath(path, fileName)
  if (!target) return null

  // content:// 必须分两个走向:打开文件要真 URI(原生 FileOpener 认 content scheme),
  // 而 generateThumbnail 内部走 new File() 只认文件路径,喂 content:// 必失败,
  // 所以缩略图这里单独按记录文件名猜回旧映射的 Pictures/pixiv-viewer 真实文件
  if (target.startsWith('content://')) {
    const name = safeDecodeURIComponent(String(fileName || '').split('/').pop())
    if (!name || !/\.\w+$/.test(name)) return null
    const { uri } = await Filesystem
      .getUri({
        path: `${DL_BASE_DIR}/${name}`,
        directory: platform.isAndroid ? Directory.Pictures : Directory.Documents,
      })
      .catch(() => ({}))
    if (!uri) return null
    try {
      const res = await Filesystem.generateThumbnail({ path: uri, maxSize: THUMB_MAX_SIZE })
      if (res?.uri) return Capacitor.convertFileSrc(res.uri)
    } catch (err) {
      if (!thumbWarned) {
        thumbWarned = true
        console.warn('generateThumbnail unavailable/failing, fallback to original file:', err?.message || err)
      }
    }
    // 猜出来的 uri 仍是本地图,图片扩展名可直接回退原图
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(uri)) {
      return Capacitor.convertFileSrc(uri)
    }
    return null
  }

  try {
    const res = await Filesystem.generateThumbnail({ path: target, maxSize: THUMB_MAX_SIZE })
    // 原生返回裸 file:// URI,WebView(https 源)禁止直接加载,
    // 必须转成 _capacitor_file_ 形式
    if (res?.uri) return Capacitor.convertFileSrc(res.uri)
  } catch (err) {
    // 只打一次:APK 未包含新 Java 方法时会显示 "not implemented",
    // 此时走原图回退(需要重编原生包才能得到小图)
    if (!thumbWarned) {
      thumbWarned = true
      console.warn('generateThumbnail unavailable/failing, fallback to original file:', err?.message || err)
    }
  }
  if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(target)) {
    return Capacitor.convertFileSrc(target)
  }
  return null
}

// 清理缩略图产物(cache 目录下的 download_thumbs),供 ClearCache 页调用
export async function clearThumbCache() {
  await Filesystem.rmdir({
    path: 'download_thumbs',
    directory: Directory.Cache,
    recursive: true,
  }).catch(() => {})
}

// 递归(限深)扫描 pixiv-viewer 下载目录,输出扁平文件列表供对账。
// 顶层目录读取失败(权限被拒等)抛错,让对账整体放弃;
// 子目录读取失败(可能已被删除)静默跳过。
// rel 为相对 pixiv-viewer 的 '/' 分隔路径,root 为目录的绝对 file:// 位置,
// 供对账按 subDir 精确匹配并校验记录是否落在扫描根内
export async function listDisk() {
  const base = platform.isIOS ? Directory.Documents : Directory.Pictures
  const out = []
  const walk = async (path, rel, depth) => {
    const { files = [] } = await Filesystem
      .readdir({ path, directory: base })
      .catch(err => {
        if (depth == 0) throw err
        return { files: [] }
      })
    for (const it of files) {
      const relFull = rel ? `${rel}/${it.name}` : it.name
      if (it.type == 'directory') {
        if (depth < 3) await walk(`${path}/${it.name}`, relFull, depth + 1)
        continue
      }
      const ms = it.ctime || it.mtime
      out.push({
        name: it.name,
        uri: it.uri,
        size: it.size,
        mtime: ms,
        rel: relFull,
      })
    }
  }
  await walk(DL_BASE_DIR, '', 0)
  const root = await Filesystem
    .getUri({ path: DL_BASE_DIR, directory: base })
    .then(({ uri }) => uri)
    .catch(() => null)
  return { root, files: out }
}

// 删除落盘文件。返回值契约(UI 层依赖,勿改):
//   true  = 目标已不存在(本次删掉了,或本来就没有),期望终态达成
//   false = 尝试删除但没成功(记录保留,UI 提示 dlc.delete_file_failed)
// file:// 与绝对路径交给 Filesystem(无 directory 时原生侧按绝对路径/file:// 解析);
// content:// 走 SAF 的 delete(SafPlugin 持有树的持久授权),SAF 树之外的媒体库
// URI 会失败——如实返回 false,不谎报成功
export async function deleteDestFile(dest = {}) {
  const path = dest.path
  if (!path) return false
  if (isContentUri(path)) {
    try {
      const { deleted } = await Saf.delete({ uri: path })
      return !!deleted
    } catch (err) {
      return false
    }
  }
  if (!isFileLikePath(path)) return false
  const clean = safeDecodeURIComponent(path).replace('file://', '')
  // 先 stat:拿不到 stat(文件已不在,或权限等原因读不到)一律视为已不在,
  // 期望终态已达成,返回 true
  try {
    await Filesystem.stat({ path: clean })
  } catch (err) {
    return true
  }
  try {
    await Filesystem.deleteFile({ path: clean })
    return true
  } catch (err) {
    return false
  }
}

// 把落盘位置解析成可访问的路径:
// content://(SAF/媒体库)URI 原样返回——FileOpener 原生侧识别 content scheme 后
// 直接拿 URI 打开(不走 new File()),应用又持有 SAF 树的持久读写授权(覆盖其后代文档),
// 按文件名回查 Pictures/pixiv-viewer 只会猜出一个不存在的文件(subDir 也会被忽略);
// 部分来源(如 DownloadManager 的 COLUMN_LOCAL_URI)存的是百分号编码路径,
// Java 侧 File API 不解码 %XX,必须先安全解码,否则缩略图/打开全部 FILE_NOT_FOUND
async function resolveDestPath(path, fileName) {
  if (!path) return null
  path = safeDecodeURIComponent(path)
  if (path.startsWith('file://') || path.startsWith('/')) return path
  if (path.startsWith('content://')) return path
  return null
}

// 打开落盘位置。返回值是普通值(不抛错),契约(UI 层依赖,勿改形状):
//   { ok: true }                          — 已唤起系统打开
//   { ok: false, reason: 'unresolvable' } — dest.path 为空/无法解析
//   { ok: false, reason: 'no_app' }       — 设备上没有能处理该文件的应用
//   { ok: false, reason: 'no_grant' }     — SAF 目录授权已失效,需重新选择
//   { ok: false, reason: 'failed' }       — 其它打开失败
// 'no_app' 依赖原生侧 reject 文案 "No default apps for open file",
// 'no_grant' 依赖 SafPlugin 的 "SAF permission lost",均按稳定子串匹配;
// 若上游文案改动则降级为 'failed'(不会误报成 no_app/no_grant)
export async function openDest(dest = {}, fileName) {
  // SAF 记录不能走 FileOpener:树授权无法经 intent 传播给查看器,系统会以
  // SecurityException 拒绝(Fix A 后不再崩进程,但仍打不开)。改走
  // Saf.openDocument:用我们自己的授权复制到缓存,再以应用自有 URI 唤起查看器
  if (dest?.type === 'saf') {
    if (!dest.path) return { ok: false, reason: 'unresolvable' }
    try {
      await Saf.openDocument({ uri: dest.path })
      return { ok: true }
    } catch (err) {
      const msg = `${err?.message || err || ''}`
      if (msg.includes('No default apps for open file')) return { ok: false, reason: 'no_app' }
      if (msg.includes('SAF permission lost')) return { ok: false, reason: 'no_grant' }
      return { ok: false, reason: 'failed' }
    }
  }
  const target = await resolveDestPath(dest.path, fileName)
  if (!target) return { ok: false, reason: 'unresolvable' }
  const { openFile } = await import('@/platform/capacitor/utils')
  try {
    await openFile(target)
  } catch (err) {
    const msg = `${err?.message || err || ''}`
    return { ok: false, reason: msg.includes('No default apps for open file') ? 'no_app' : 'failed' }
  }
  return { ok: true }
}
