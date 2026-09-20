/**
 * 下载中心 v2 记录模型 + 旧数据迁移
 *
 * 设计要点(对应 Downloads 重设计方案):
 * - 一份记录 = 一个文件的下载任务终态,带稳定 id / 去重 key / 结构化 dest
 * - 去重 key = `${subDir}/${fileName}`(与旧 inflight 去重同构,跨会话稳定)
 * - 旧版 downloads.history 迁移:按 key 去重合并,只去重不截断
 * - 本模块保持纯净:不 import Vue / store,方便测试与复用
 */
import { getCache, setCache } from '@/utils/storage/siteCache'
import { LocalStorage } from '@/utils/storage'

export const DLC_RECORDS_KEY = 'downloads.center.records'
const DLC_MIGRATED_FLAG = 'PXV_DLC_MIGRATED'
const LEGACY_HISTORY_KEY = 'downloads.history'

// 生成稳定去重 key:subDir + fileName(裁掉可能的扩展名补全差异,以最终落盘名为准由执行层回填)
export function makeRecordKey(subDir = '', fileName = '') {
  return `${subDir || ''}/${fileName || ''}`
}

// 轻量字符串 hash(djb2),用于补 id / 缩略图缓存键,不引入 crypto 依赖
export function hashStr(str = '') {
  let h = 5381
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

export function makeRecordId() {
  return `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

const KIND_BY_EXT = [
  [/\.(jpe?g|png|gif|webp|avif|bmp)$/i, 'image'],
  [/\.(mp4|webm|mkv|mov)$/i, 'video'],
  [/\.(zip|ugoira)$/i, 'ugoira'],
  [/\.txt$/i, 'novel'],
  [/\.epub$/i, 'epub'],
  [/\.(json|txt)$/i, 'backup'],
]

export function guessKind(fileName = '') {
  for (const [re, kind] of KIND_BY_EXT) {
    if (re.test(fileName)) return kind
  }
  return 'other'
}

// 旧版就是用这个正则从文件名反推作品 id,保留同一约定
export function guessArtworkId(fileName = '') {
  return fileName.match(/_(\d{4,})[_.]/)?.[1] || null
}

// 从落盘路径形态推断 dest.type(迁移旧记录时用;新记录由执行层精确写入)
export function inferDestType(path = '') {
  if (!path) return null
  if (path.startsWith('content://')) return 'mediastore'
  if (path.startsWith('SAF:/')) return 'saf'
  if (path.includes('/Android/data/')) return 'external'
  if (path.includes('/Download/')) return 'download_manager'
  if (path.includes('/Pictures/') || path.includes('/Documents/')) return 'pictures'
  return 'pictures'
}

// 给人看的落盘位置(优先用执行层带回的 tipPath)
export function destDisplayPath(record = {}) {
  if (record.dest?.displayPath) return record.dest.displayPath
  if (record.dest?.path) {
    return String(record.dest.path).replace(/^file:\/\//, '')
  }
  return ''
}

// 与旧版 Downloads.vue 兼容的镜像结构,保证旧页面在过渡期仍可读
export function toLegacyMirror(records = []) {
  return records
    .filter(r => r.status != 'canceled')
    .map(r => ({
      status: r.status == 'done' ? 'ok' : 'error',
      url: r.url,
      fileName: r.fileName,
      path: r.dest?.path,
      date: new Date(r.finishedAt || r.createdAt || Date.now()).toLocaleString(),
      error: r.error?.raw || r.error?.message,
    }))
}

function normalizeRecord(raw = {}) {
  // backup 目录里只会是设置/历史导出;旧版 .txt 被扩展名误判成 novel(guessKind 按
  // 扩展名猜、看不到子目录),读入时按子目录纠正,存量记录也一并生效
  const kind = raw.subDir == 'backup' ? 'backup' : raw.kind || guessKind(raw.fileName || '')
  return {
    id: raw.id || makeRecordId(),
    key: raw.key || makeRecordKey(raw.subDir, raw.fileName),
    artworkId: raw.artworkId ?? guessArtworkId(raw.fileName || ''),
    kind,
    url: raw.url || null,
    fileName: raw.fileName || '',
    subDir: raw.subDir || '',
    dest: raw.dest || null,
    status: raw.status || 'done',
    error: raw.error || null,
    fileSize: raw.fileSize || null,
    createdAt: raw.createdAt || raw.finishedAt || Date.now(),
    finishedAt: raw.finishedAt || raw.createdAt || Date.now(),
    downloadCount: raw.downloadCount || 1,
    fs: raw.fs || null,
  }
}

// 按 key 合并:已存在则更新终态并累计次数,否则插入队首
export function upsertRecord(records = [], patch = {}) {
  const key = patch.key || makeRecordKey(patch.subDir, patch.fileName)
  const idx = records.findIndex(r => r.key === key)
  if (idx === -1) {
    return [normalizeRecord({ ...patch, key }), ...records]
  }
  const prev = records[idx]
  // 同一文件再次下载成功时累计次数;失败→成功等状态迁移不计
  const bumpCount = patch.status == 'done' && prev.status == 'done'
  const next = normalizeRecord({
    ...prev,
    ...patch,
    key,
    id: prev.id,
    // 保留首次下载时间;失败重试成功后清掉 error
    createdAt: prev.createdAt,
    finishedAt: patch.finishedAt || Date.now(),
    downloadCount: (prev.downloadCount || 1) + (bumpCount ? 1 : 0),
    fs: patch.fs !== undefined ? patch.fs : prev.fs,
  })
  const list = records.slice()
  list.splice(idx, 1)
  // 重新按完成时间插入队首(保持新→旧)
  const insertAt = list.findIndex(r => (r.finishedAt || 0) <= next.finishedAt)
  if (insertAt === -1) list.push(next)
  else list.splice(insertAt, 0, next)
  return list
}

export async function loadRecords() {
  const list = await getCache(DLC_RECORDS_KEY)
  if (!Array.isArray(list) || !list.length) return []
  // 读时兜底去重(同 key 保留最新一条并累计次数),保证迁移异常也不会重复展示
  const byKey = new Map()
  for (const raw of list) {
    if (!raw || !raw.fileName) continue
    const rec = normalizeRecord(raw)
    const prev = byKey.get(rec.key)
    if (!prev) {
      byKey.set(rec.key, rec)
    } else {
      prev.downloadCount += rec.downloadCount
      if ((rec.finishedAt || 0) >= (prev.finishedAt || 0)) {
        rec.createdAt = prev.createdAt
        rec.downloadCount = Math.max(rec.downloadCount, prev.downloadCount)
        byKey.set(rec.key, rec)
      }
    }
  }
  return [...byKey.values()].sort((a, b) => (b.finishedAt || 0) - (a.finishedAt || 0))
}

export async function saveRecords(records = []) {
  if (!records.length) {
    // setCache 对空数组会直接 return,清空必须走 null
    await setCache(DLC_RECORDS_KEY, null)
  } else {
    await setCache(DLC_RECORDS_KEY, records)
  }
}

/**
 * 旧版 downloads.history → v2 记录一次性迁移(只去重,不截断)
 * 幂等:迁移后打 LocalStorage 标记,避免用户清空 v2 记录后被旧数据再次灌入
 */
export async function migrateLegacyHistory(records = []) {
  let merged = records
  if (!LocalStorage.get(DLC_MIGRATED_FLAG, false)) {
    try {
      const legacy = await getCache(LEGACY_HISTORY_KEY)
      if (Array.isArray(legacy) && legacy.length) {
        const existKeys = new Set(merged.map(r => r.key))
        for (const item of legacy) {
          if (!item || !item.fileName) continue
          // 旧记录 fileName 可能带子目录前缀,拆成 subDir + basename
          const rawName = String(item.fileName)
          const sepIdx = rawName.lastIndexOf('/')
          const subDir = sepIdx > 0 ? rawName.slice(0, sepIdx) : ''
          const baseName = sepIdx > 0 ? rawName.slice(sepIdx + 1) : rawName
          const finishedAt = Date.parse(item.date) || Date.now()
          const rec = normalizeRecord({
            key: makeRecordKey(subDir, baseName),
            url: item.url || null,
            fileName: baseName,
            subDir,
            status: item.status == 'ok' ? 'done' : 'failed',
            error: item.status == 'ok' ? null : { step: null, message: item.error, raw: item.error },
            dest: item.path
              ? { type: inferDestType(item.path), path: item.path, displayPath: null }
              : null,
            finishedAt,
            createdAt: finishedAt,
          })
          if (existKeys.has(rec.key)) continue
          existKeys.add(rec.key)
          merged = upsertRecord(merged, rec)
        }
      }
      // 旧记录已吸收进 v2,清掉旧 key,避免旧页面与新页面数据分叉
      await setCache(LEGACY_HISTORY_KEY, null)
    } catch (err) {
      console.warn('migrate downloads history failed:', err)
    }
    LocalStorage.set(DLC_MIGRATED_FLAG, true)
  }
  return merged
}

// 时间分组:'today' | 'yesterday' | 'earlier'
export function dayGroup(ts) {
  const d = new Date(ts)
  const now = new Date()
  const startOfDay = date => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const diff = startOfDay(now) - startOfDay(d)
  if (diff <= 0) return 'today'
  if (diff <= 86400000) return 'yesterday'
  return 'earlier'
}
