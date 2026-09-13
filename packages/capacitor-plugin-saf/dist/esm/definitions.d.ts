import type { Plugin } from '@capacitor/core'

export interface SafPlugin extends Plugin {
  /** 调起系统目录选择器并持久化授权，返回所选目录的 tree uri */
  pickFolder(): Promise<{ uri: string }>
  /** 读取已持久化的目录授权（无则 uri 为 null） */
  getPersistedFolder(): Promise<{ uri: string | null }>
  /** 将本地文件复制进 SAF 目录树（同名文件会被覆盖，重名创建由系统自动去重） */
  writeFile(options: {
    treeUri: string
    relativeDir: string
    fileName: string
    srcPath: string
    /** 缺省为 application/octet-stream */
    mime?: string
  }): Promise<{ uri: string; name: string | null }>
}
