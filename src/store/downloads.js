/**
 * 下载中心服务:队列 / 取消 / 进度 / 记录持久化 / 磁盘对账
 *
 * - 活跃任务只存内存(state.tasks),落库的都是终态记录(state.records)
 * - enqueueDownload 返回的 promise 与旧版 downloadFile 契约兼容:永不 reject
 * - 平台执行层(capacitor/tauri downloads.js)按需动态加载,避免包体积与循环依赖
 * - 终态记录同时写入旧版 downloads.history 镜像,过渡期旧页面仍可用
 */
import Vue from 'vue'
import platform from '@/platform'
import { Toast } from '@/lib/vant-apis'
import { i18n } from '@/i18n'
import { replaceValidFileName, safeDecodeURIComponent } from '@/utils'
import {
  makeRecordKey,
  guessKind,
  guessArtworkId,
  loadRecords,
  saveRecords,
  toLegacyMirror,
  upsertRecord,
  migrateLegacyHistory,
  dayGroup,
} from '@/utils/downloadRecords'

const MAX_CONCURRENT = 3

const state = Vue.observable({
  tasks: [], // 活跃任务:queued / downloading / postprocess / canceling
  records: [], // 终态记录,新→旧
  orphans: [], // 磁盘有、账本没有的未识别文件
  reconciling: false,
  diskScanned: false,
  initialized: false,
})

const tasksById = new Map()
let initPromise = null
let saveTimer = null

export function getDownloadState() {
  return state
}

function persist() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    // 初始化完成前禁止落盘:此时 state.records 可能尚未从磁盘加载,
    // 落盘会用空列表覆盖存量记录
    if (!state.initialized) return
    saveRecords(state.records)
      .then(() => setCacheMirror())
      .catch(err => console.warn('save download records failed:', err))
  }, 300)
}

function setCacheMirror() {
  // 旧版页面镜像:动态引入避免与 siteCache 初始化顺序耦合
  return import('@/utils/storage/siteCache')
    .then(({ setCache }) => setCache('downloads.history', toLegacyMirror(state.records)))
    .catch(() => {})
}

export function ensureInit() {
  if (state.initialized) return Promise.resolve()
  if (!initPromise) {
    initPromise = (async () => {
      // Tauri:把当前下载目录注册进 asset 协议 scope,缩略图/原图才能加载
      if (platform.isTauri) {
        loadPlatformDownloads()
          .then(mod => mod.initAssetScope?.())
          .catch(() => {})
      }
      let records = await loadRecords()
      records = await migrateLegacyHistory(records)
      // 与内存中已有记录按 key 合并(初始化期间可能有下载刚完成),
      // 以内存侧(更新)为准,避免加载结果覆盖掉新完成的记录
      if (state.records.length) {
        const existKeys = new Set(state.records.map(r => r.key))
        records = [...state.records, ...records.filter(r => !existKeys.has(r.key))]
          .sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
      }
      state.records = records
      state.initialized = true
      // 加载结果为空时不落盘:无论真是空库还是一次瞬时读取失败,
      // 不写都不会破坏既有数据( absence 本身就等于空 )
      if (records.length) persist()
    })().catch(err => {
      console.warn('init download center failed:', err)
      state.initialized = true
    })
  }
  return initPromise
}

// ---------------- 队列 ----------------

// 调试浮层:localStorage.PXV_DEBUG_DL === '1' 开启(同直连预览的 dbgDirect 模式),
// 实时显示入队/完成/对账/缩略图解析等关键链路信息
let dbgEl = null
export function dbgDl(msg) {
  if (localStorage.PXV_DEBUG_DL !== '1') return
  if (!dbgEl) {
    dbgEl = document.createElement('div')
    dbgEl.style.cssText = 'position:fixed;right:4px;bottom:4px;z-index:99999;max-width:80vw;max-height:50vh;overflow:hidden;background:rgba(0,0,0,.72);color:#4ade80;font:10px/1.5 monospace;padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre-wrap'
    document.body.appendChild(dbgEl)
  }
  dbgEl.textContent = (`${new Date().toTimeString().slice(0, 8)} ${msg}\n` + dbgEl.textContent).split('\n').slice(0, 20).join('\n')
}

// 从 URL 提取可信扩展名:只认 pathname 末尾 1-5 位字母数字。
// 旧实现 source.split('.').pop() 会把代理路径/查询串里的任意点段
// (如 xxx.best_12345678.bset_1234678)当成扩展名拼到文件上
function extFromSource(source) {
  try {
    const m = new URL(source).pathname.match(/\.([a-z0-9]{1,5})$/i)
    if (m) return m[1].toLowerCase()
  } catch (err) {}
  const m = String(source).match(/\.([a-z0-9]{1,5})(?:[?#]|$)/i)
  return m ? m[1].toLowerCase() : ''
}

function normalizeFileName(fileName = '', source) {
  let name = `${fileName}`
  // 与旧 _downloadFile 一致:字符串 URL 且文件名无扩展名时按 URL 补扩展名
  if (typeof source == 'string' && !/\.[a-z0-9]{1,5}$/.test(name)) {
    const ext = extFromSource(source)
    if (ext) name += `.${ext}`
  }
  // 与旧 _downloadFile 一致:入队前先消毒文件名。
  // 记录的 fileName 必须与盘上文件名一致,否则对账匹配不上,
  // 文件会被误归入"未识别"(Rust/原生侧的替换集是这里的子集,二次消毒为空操作)
  name = replaceValidFileName(name)
  return name
}

export function enqueueDownload({ source, fileName, options = {} } = {}) {
  const subDir = options.subDir || ''
  const finalName = normalizeFileName(fileName, source)
  const key = makeRecordKey(subDir, finalName)

  // 同一目标文件的并发请求共享同一任务(与旧 inflightDlTasks 行为一致)
  const inflight = tasksById.get(key)
  if (inflight && inflight.status != 'failed') return inflight.promise

  const task = Vue.observable({
    id: `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    key,
    source,
    fileName: finalName,
    subDir,
    options,
    kind: options.kind || guessKind(finalName),
    artworkId: options.artworkId ?? guessArtworkId(finalName),
    status: 'queued', // queued → downloading → postprocess → done
    received: 0,
    total: 0,
    createdAt: Date.now(),
    cancelRequested: false,
    promise: null,
  })
  task.promise = new Promise(resolve => {
    task._resolve = resolve
  })
  tasksById.set(key, task)
  tasksById.set(task.id, task)
  state.tasks.push(task)
  dbgDl(`enqueue ${task.key} <- ${typeof source == 'string' ? source : 'Blob'}`)
  pump()
  return task.promise
}

function pump() {
  const running = state.tasks.filter(t => t.status == 'downloading' || t.status == 'postprocess').length
  let slots = Math.max(0, MAX_CONCURRENT - running)
  for (const t of state.tasks) {
    if (slots <= 0) break
    if (t.status == 'queued') {
      slots--
      runTask(t)
    }
  }
}

async function runTask(task) {
  task.status = 'downloading'
  task._started = true
  // 关键:完成任务前必须确保记录已从磁盘加载并完成迁移,
  // 否则重启(如切换下载方式的 reload)后首个下载会用空列表
  // 覆盖掉全部存量记录
  await ensureInit()
  let result
  try {
    const mod = await loadPlatformDownloads()
    result = await mod.runDownload(
      {
        id: task.id,
        source: task.source,
        fileName: task.fileName,
        subDir: task.subDir,
        cancelToken: () => task.cancelRequested,
        onProgress: (bytes, total) => {
          task.received = bytes
          task.total = total
        },
        onStep: step => {
          if (step != 'fsDownload') task.status = 'postprocess'
        },
      },
      { showToast: true }
    )
  } catch (err) {
    console.warn('download task error:', err)
    result = { ok: false, error: { message: `${err}`, raw: `${err}` } }
  }
  finishTask(task, result)
}

function finishTask(task, result = {}) {
  tasksById.delete(task.key)
  tasksById.delete(task.id)
  const idx = state.tasks.indexOf(task)
  if (idx != -1) state.tasks.splice(idx, 1)

  if (result.ok) {
    // 完成即播种 fs 状态:不必等下一轮对账,缩略图与"打开"立即可用
    const seedFs = seedFsFor(result.destType, result.destPath, result.fileSize)
    dbgDl(`done ${result.fileName} dest=${result.destType}:${result.destPath} size=${result.fileSize || '?'}`)
    state.records = upsertRecord(state.records, {
      key: result.key || task.key,
      url: typeof task.source == 'string' ? task.source : null,
      fileName: result.fileName || task.fileName,
      subDir: result.subDir ?? task.subDir,
      artworkId: task.artworkId,
      kind: task.kind,
      status: 'done',
      error: null,
      dest: {
        type: result.destType || null,
        path: result.destPath || null,
        displayPath: result.tipPath || null,
      },
      fileSize: result.fileSize || null,
      fs: seedFs,
      finishedAt: Date.now(),
    })
  } else if (!result.canceled) {
    dbgDl(`failed ${task.key}: ${result.error?.message || 'unknown'}`)
    state.records = upsertRecord(state.records, {
      key: task.key,
      url: typeof task.source == 'string' ? task.source : null,
      fileName: task.fileName,
      subDir: task.subDir,
      artworkId: task.artworkId,
      kind: task.kind,
      status: 'failed',
      error: result.error || { message: 'unknown' },
      dest: null,
      finishedAt: Date.now(),
    })
  }
  // canceled:用户主动取消,不留记录,避免噪音

  pump()
  persist()
  // 兼容旧 downloadFile 返回契约:调用方可能读取 res.path / successMsg
  task._resolve({
    ...result,
    res: { path: result.destPath, uri: result.destPath, tipPath: result.tipPath },
    successMsg: result.successMsg,
  })
}

export async function cancelTask(taskOrId) {
  const task = typeof taskOrId == 'string'
    ? tasksById.get(taskOrId)
    : taskOrId
  if (!task || task._resolve == null) return
  task.cancelRequested = true
  task.status = 'canceling'
  // 排队中尚未启动的任务:直接按取消收尾,避免 pump() 永远不再启动它而滞留列表
  if (task.status == 'canceling' && !task._started) {
    finishTask(task, { ok: false, canceled: true })
    return
  }
  try {
    const mod = await loadPlatformDownloads()
    await mod.cancelTask(task.id)
  } catch (err) {
    console.warn('cancel download failed:', err)
  }
}

export function cancelAllTasks() {
  // 拷贝后遍历:排队中任务的取消会同步收尾并从 state.tasks 移除,
  // 直接 forEach 活数组会因 splice 跳过部分任务
  state.tasks.slice().forEach(t => cancelTask(t))
}

// ---------------- 记录操作 ----------------

export async function retryRecord(record) {
  if (!record?.url) {
    Toast(i18n.t('dlc.retry_no_url'))
    return null
  }
  // 记录模型:fileName 只存 basename,subDir 独立存放,重试直接原样还原
  return enqueueDownload({
    source: record.url,
    fileName: record.fileName,
    options: {
      subDir: record.subDir,
      artworkId: record.artworkId,
      kind: record.kind,
    },
  })
}

export function removeRecord(recordId) {
  state.records = state.records.filter(r => r.id != recordId)
  persist()
}

export async function removeRecordAndFile(record) {
  if (record?.dest?.path) {
    try {
      const mod = await loadPlatformDownloads()
      await mod.deleteDestFile(record.dest)
    } catch (err) {
      console.warn('delete file failed:', err)
    }
  }
  removeRecord(record.id)
}

// ---------------- 磁盘对账 ----------------

/**
 * 判断一个落盘位置是否属于可被磁盘扫描覆盖的目录:
 * - pictures / external:直接可扫
 * - mediastore 且为图片桶(content URI 含 /images/):MediaStore 写入的就是
 *   Pictures/pixiv-viewer,物理文件可扫;视频/下载桶落在 Movies|Download,扫不到
 */
function isScannableDest(destType, destPath) {
  if (!destType) return false
  if (destType == 'pictures' || destType == 'external') return true
  if (destType == 'mediastore') {
    return String(destPath || '').includes('/images/')
  }
  return false
}

// 完成时播种:存在即为 true,mtime 置 0 由下一次对账用真实 mtime 覆盖
function seedFsFor(destType, destPath, fileSize) {
  if (!isScannableDest(destType, destPath)) return null
  return { exists: true, mtime: 0, size: fileSize || null }
}

/**
 * 账本 ∪ 磁盘:records 标注 fs.exists,磁盘未匹配项进 orphans。
 * - 匹配优先用 dest.path 的 basename;content://(媒体库)路径的尾段是
 *   数字 id 而非文件名,回退用 record.fileName 的 basename 匹配
 * - 媒体库记录匹配不上时记为未知(fs=null)而不是"已不在":
 *   系统重名时会自动改名,content id 无法反查,宁可不确定不误报
 * - SAF / 下载管理器 / 系统分享的落点扫不到,fs = null(未知)
 */
export async function reconcile(force = false) {
  if (state.reconciling) return
  if (state.diskScanned && !force) return
  state.reconciling = true
  try {
    await ensureInit()
    const mod = await loadPlatformDownloads()
    // listDisk 内部失败(如权限被拒)会抛错,整个对账放弃,不得把记录全部标成"已不在"
    const diskFiles = await mod.listDisk()
    dbgDl(`reconcile: disk=${diskFiles.length} records=${state.records.length}`)
    const byName = new Map()
    diskFiles.forEach(f => byName.set(f.name, f))

    const baseName = p => String(p || '').split('/').pop()?.split('?')[0]
    // 匹配候选:原始 basename、解码后的 basename(部分来源存的是百分号编码路径)、
    // 按现行规则重新消毒的名字(修复早期版本未消毒 fileName 的历史记录)
    const nameCandidates = p => {
      const base = baseName(p) || ''
      const decoded = safeDecodeURIComponent(base)
      return [...new Set([base, decoded, replaceValidFileName(decoded)])].filter(Boolean)
    }
    const matchedNames = new Set()
    const records = state.records.map(record => {
      const scanned = isScannableDest(record.dest?.type, record.dest?.path)
      if (!scanned || !record.dest?.path) {
        return record.fs === null ? record : { ...record, fs: null }
      }
      const file =
        nameCandidates(record.dest.path).map(k => byName.get(k)).find(Boolean) ||
        nameCandidates(record.fileName).map(k => byName.get(k)).find(Boolean)
      if (file) {
        matchedNames.add(file.name)
        if (
          record.fs && record.fs.exists && record.fs.mtime === file.mtime &&
          record.fileName === file.name
        ) return record
        // fileName 以盘上真名为准:自愈早期未消毒版本留下的不一致,
        // 后续对账即可直接命中
        const healed = file.name === record.fileName
          ? record
          : { ...record, fileName: file.name }
        return { ...healed, fs: { exists: true, mtime: file.mtime, size: file.size } }
      }
      // 刚完成播种(mtime=0)的记录可能晚于本轮 listDisk 快照落盘,
      // 不能据此降级为"已不在",留给下一轮对账确认
      if (record.fs && record.fs.exists === true && record.fs.mtime === 0) return record
      if (record.fs && record.fs.exists === false) return record
      if (record.dest.type == 'mediastore') {
        return { ...record, fs: null }
      }
      return { ...record, fs: { exists: false, mtime: null, size: null } }
    })
    state.records = records
    persist()

    const orphans = diskFiles
      .filter(f => !matchedNames.has(f.name))
      .map(f => ({
        name: f.name,
        path: f.uri || f.path,
        size: f.size,
        mtime: f.mtime,
        kind: guessKind(f.name),
        artworkId: guessArtworkId(f.name),
      }))
    state.orphans = orphans
    state.diskScanned = true
    dbgDl(`reconcile done: matched=${matchedNames.size} orphans=${orphans.length}`)
  } catch (err) {
    dbgDl(`reconcile FAILED: ${err?.message || err}`)
    console.warn('reconcile downloads failed:', err)
  } finally {
    state.reconciling = false
  }
}

// 认领未识别文件:按文件名反推 id(与旧版逻辑一致),生成 done 记录
export function claimOrphan(orphan) {
  state.records = upsertRecord(state.records, {
    key: makeRecordKey('', orphan.name),
    url: null,
    fileName: orphan.name,
    subDir: '',
    artworkId: orphan.artworkId,
    kind: orphan.kind,
    status: 'done',
    dest: { type: 'pictures', path: orphan.path, displayPath: null },
    fileSize: orphan.size,
    finishedAt: orphan.mtime || Date.now(),
  })
  state.orphans = state.orphans.filter(o => o.path != orphan.path)
  persist()
}

export async function deleteOrphan(orphan) {
  try {
    const mod = await loadPlatformDownloads()
    await mod.deleteDestFile({ path: orphan.path })
  } catch (err) {
    console.warn('delete orphan failed:', err)
  }
  state.orphans = state.orphans.filter(o => o.path != orphan.path)
}

// ---------------- 平台能力代理 ----------------

export function loadPlatformDownloads() {
  if (platform.isTauri) return import('@/platform/tauri/downloads')
  return import('@/platform/capacitor/downloads')
}

export async function openDest(dest, fileName) {
  if (!dest?.path) return false
  try {
    const mod = await loadPlatformDownloads()
    return await mod.openDest(dest, fileName)
  } catch (err) {
    Toast(err?.message || i18n.t('dlc.open_failed'))
    return false
  }
}

export async function locateDest(dest) {
  try {
    const mod = await loadPlatformDownloads()
    return await mod.locateDest ? await mod.locateDest(dest) : false
  } catch (err) {
    Toast(err?.message || i18n.t('dlc.open_failed'))
    return false
  }
}

// ---------------- 页面辅助 ----------------

// ---------------- 缩略图解析缓存(RecordCard 与本模块共享) ----------------

const THUMB_SRC_CACHE_LIMIT = 400
const thumbSrcCache = new Map()

export function thumbSrcCacheGet(key) {
  return thumbSrcCache.get(key)
}

export function thumbSrcCacheSet(key, val) {
  if (thumbSrcCache.size >= THUMB_SRC_CACHE_LIMIT) thumbSrcCache.clear()
  thumbSrcCache.set(key, val)
}

// 清理下载缩略图:JS 侧解析缓存 + 各平台的存储(capacitor 为 cache 目录下的
// download_thumbs;tauri 为会话内存缓存),供 ClearCache 页调用
export async function clearThumbCaches() {
  thumbSrcCache.clear()
  try {
    const mod = await loadPlatformDownloads()
    await mod.clearThumbCache?.()
  } catch (err) {
    console.warn('clear thumb cache failed:', err)
  }
}

export function groupRecords(records = []) {
  const groups = []
  const indexOf = { today: 0, yesterday: 1, earlier: 2 }
  for (const record of records) {
    const g = dayGroup(record.finishedAt)
    const found = groups.find(x => x.key == g)
    if (found) found.items.push(record)
    else groups.push({ key: g, items: [record] })
  }
  return groups.sort((a, b) => indexOf[a.key] - indexOf[b.key])
}

export function failedCount(records = []) {
  return records.filter(r => r.status == 'failed').length
}

export { state as downloadsState }
