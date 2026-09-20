<template>
  <div class="record-card" :class="{ 'is-failed': isFailed }">
    <div class="record-card__thumb" @click="onPrimaryClick">
      <img v-if="thumbSrc" :src="thumbSrc" :alt="baseName" class="record-card__thumb-img" @error="onThumbError">
      <van-icon v-else-if="thumbResolved" :name="kindIcon" class="record-card__thumb-icon" />
      <span v-else class="record-card__thumb-ph"></span>
    </div>
    <div class="record-card__body" @click="onPrimaryClick">
      <div class="record-card__title">{{ baseName }}</div>
      <div class="record-card__meta">
        <van-tag v-if="destLabel" plain size="medium" :type="destTagType" class="record-card__dest">{{ destLabel }}</van-tag>
        <span v-if="sizeText" class="num">{{ sizeText }}</span>
        <span class="num">{{ timeText }}</span>
        <span v-if="record.downloadCount > 1" class="num">×{{ record.downloadCount }}</span>
      </div>
      <div class="record-card__meta">
        <span v-if="fsLabel" class="fs-state" :class="`fs-state--${fsStateClass}`">
          <i class="fs-dot"></i>{{ fsLabel }}
        </span>
        <span v-if="displayPath" class="record-card__path">{{ displayPath }}</span>
      </div>
      <div v-if="isFailed" class="record-card__error">
        {{ record.error?.message || record.error?.raw || $t('dlc.unknown_error') }}
      </div>
    </div>
    <div class="record-card__actions">
      <van-button v-if="canOpen" size="small" type="info" plain round @click="$emit('open')">
        {{ $t('dlc.open') }}
      </van-button>
      <van-button v-if="canDetail" size="small" plain round @click="$emit('detail')">
        {{ $t('dlc.detail') }}
      </van-button>
      <van-button v-if="canRetry" size="small" type="danger" plain round @click="$emit('retry')">
        {{ $t('dlc.retry') }}
      </van-button>
      <van-popover
        v-model="showMenu"
        trigger="click"
        placement="bottom-end"
        :actions="menuActions"
        @select="onMenuSelect"
      >
        <template #reference>
          <van-button size="small" plain round icon="more-o" />
        </template>
      </van-popover>
    </div>
  </div>
</template>

<script>
import dayjs from 'dayjs'
import { formatBytes } from '@/utils'
import platform from '@/platform'
import { destDisplayPath } from '@/utils/downloadRecords'
import { thumbSrcCacheGet, thumbSrcCacheSet, dbgDl } from '@/store/downloads'

const KIND_ICONS = {
  image: 'photo-o',
  video: 'video-o',
  ugoira: 'bulb-o',
  novel: 'notes-o',
  epub: 'bookmark-o',
  backup: 'description',
}

const DEST_LABELS = {
  pictures: 'dlc.dest_pictures',
  external: 'dlc.dest_external',
  mediastore: 'dlc.dest_mediastore',
  saf: 'dlc.dest_saf',
  download_manager: 'dlc.dest_download_manager',
  shared: 'dlc.dest_shared',
  browser: 'dlc.dest_browser',
}

const DEST_TAG_TYPES = {
  pictures: 'primary',
  mediastore: 'primary',
  saf: 'warning',
  download_manager: 'primary',
}

// 文件型路径:file:// / POSIX 绝对路径 / Windows 盘符路径(D:\... 或 D:/...)
// Tauri 的落盘路径是盘符开头,漏判会导致"删除文件"按钮消失
function isFileLikePath(p) {
  return !!p && (p.startsWith('file://') || p.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(p))
}

export default {
  name: 'RecordCard',
  components: {},
  props: {
    record: {
      type: Object,
      required: true,
    },
  },
  data() {
    return {
      showMenu: false,
      thumbSrc: '',
      thumbResolved: false,
    }
  },
  computed: {
    baseName() {
      return String(this.record.fileName || '').split('/').pop()
    },
    // dest.path 是否为可直接访问的文件路径(默认下载落盘是不带 scheme 的绝对路径)
    fileLikeDest() {
      return isFileLikePath(this.record.dest?.path)
    },
    // 是否尝试加载原图:仅图片类型;fs 状态未知时按文件型路径乐观处理
    thumbPath() {
      if (this.record.kind != 'image') return ''
      const p = this.record.dest?.path
      if (!p) return ''
      if (this.record.fs) return this.record.fs.exists ? p : ''
      return this.fileLikeDest ? p : ''
    },
    kindIcon() {
      return KIND_ICONS[this.record.kind] || 'description'
    },
    destLabel() {
      if (platform.isTauri) return ''
      const key = DEST_LABELS[this.record.dest?.type]
      return key ? this.$t(key) : ''
    },
    // Vant 2 Tag 无 default 类型,返回空串让标签走默认灰样式
    destTagType() {
      return DEST_TAG_TYPES[this.record.dest?.type] || ''
    },
    displayPath() {
      const p = destDisplayPath(this.record)
      if (!p || p == this.baseName) return ''
      return p
    },
    sizeText() {
      const size = this.record.fileSize || this.record.fs?.size
      return size ? formatBytes(size) : ''
    },
    timeText() {
      return dayjs(this.record.finishedAt || this.record.createdAt).format('YYYY-MM-DD HH:mm:ss')
    },
    fsState() {
      // true 在架 / false 悬空 / null 未知(不在扫描范围的 dest)
      if (!this.record.dest || !['pictures', 'external', 'mediastore'].includes(this.record.dest.type)) {
        return null
      }
      if (this.record.status != 'done') return null
      return this.record.fs ? this.record.fs.exists : null
    },
    fsStateClass() {
      if (this.fsState === true) return 'ok'
      if (this.fsState === false) return 'missing'
      return 'unknown'
    },
    fsLabel() {
      if (this.fsState === true) return this.$t('dlc.fs_on_disk')
      if (this.fsState === false) return this.$t('dlc.fs_missing')
      return ''
    },
    isFailed() {
      return this.record.status == 'failed'
    },
    canOpen() {
      if (this.record.status != 'done' || !this.record.dest?.path) return false
      if (this.record.fs) return this.record.fs.exists === true
      // 对账尚未运行时,文件型路径先按可打开处理
      return this.fileLikeDest
    },
    canDetail() {
      return !!this.record.artworkId
    },
    canRetry() {
      return this.isFailed && !!this.record.url
    },
    // ⋯ 菜单:定位(桌面)、删除文件(仅文件型路径且仍在架)、删除记录
    menuActions() {
      const actions = []
      if (platform.isTauri) {
        actions.push({ text: this.$t('dlc.locate'), key: 'locate' })
      }
      const p = this.record.dest?.path
      if (isFileLikePath(p) && this.record.fs?.exists !== false) {
        actions.push({ text: this.$t('dlc.delete_file'), key: 'delete_file', color: '#ee0a24' })
      }
      actions.push({ text: this.$t('dlc.delete_record'), key: 'delete_record', color: '#ee0a24' })
      return actions
    },
  },
  watch: {
    thumbPath: {
      immediate: true,
      handler() {
        this.resolveThumb()
      },
    },
  },
  methods: {
    // 按需缩略:平台层生成 320px 小图(原生 generateThumbnail / canvas),
    // 失败(文件被删/格式不支持)退到类型图标;
    // mtime 参与缓存键,文件被覆盖后自然失效
    async resolveThumb() {
      this.thumbSrc = ''
      this.thumbResolved = false
      const path = this.thumbPath
      if (!path) {
        this.thumbResolved = true
        return
      }
      const mtime = this.record.fs?.mtime || 0
      const cacheKey = `${path}|${mtime}`
      const cached = thumbSrcCacheGet(cacheKey)
      if (cached !== undefined) {
        this.applyThumb(cached)
        return
      }
      try {
        const { loadPlatformDownloads } = await import('@/store/downloads')
        const mod = await loadPlatformDownloads()
        const src = await mod.thumbnail({ path, fileName: this.record.fileName })
        thumbSrcCacheSet(cacheKey, src || null)
        dbgDl(`thumb ${this.baseName} -> ${src == null ? 'icon(生成失败)' : src.startsWith('data:') ? 'canvas-320' : src}`)
        if (this.thumbPath === path) this.applyThumb(src || null)
      } catch (err) {
        thumbSrcCacheSet(cacheKey, null)
        dbgDl(`thumb ${this.baseName} -> icon(异常: ${err?.message || err})`)
        if (this.thumbPath === path) this.applyThumb(null)
      }
    },
    applyThumb(src) {
      this.thumbResolved = true
      this.thumbSrc = src || ''
    },
    // 缩略加载失败(文件被删/格式不支持):退到类型图标
    onThumbError() {
      this.applyThumb(null)
    },
    // 主点击:优先打开文件;不可打开时退到作品详情
    onPrimaryClick() {
      if (this.canOpen) {
        this.$emit('open')
      } else if (this.canDetail) {
        this.$emit('detail')
      }
    },
    onMenuSelect(action) {
      this.showMenu = false
      if (action?.key) this.$emit('menu', { key: action.key })
    },
  },
}
</script>

<style lang="stylus" scoped>
// 注意:本页自定义类名会被 postcss-pxtorem(rootValue 75)换算,
// 自定义文本一律用 rem(旧版页面同规则),Vant 组件保持原生 px。
// 卡片定高(1.76rem,对应 index.vue 的 CARD_HEIGHT),内容单行化,
// 由 VirtualWaterfall 窗口化渲染,滚出视口即销毁
.record-card
  display flex
  align-items center
  height 100%
  box-sizing border-box
  padding 0.26rem 0.4rem
  position relative
  border-bottom 1px solid rgba(0, 0, 0, 0.04)
  overflow hidden

  &__thumb
    width 1.2rem
    height 1.2rem
    flex none
    margin-right 0.24rem
    border-radius 0.08rem
    overflow hidden
    background #f2f3f5

  &__thumb-img
    width 100%
    height 100%
    object-fit cover
    display block
    // 图片边缘 1px 低透明度描边,避免缩略图融进背景
    outline 1px solid rgba(0, 0, 0, 0.08)
    outline-offset -1px

  &__thumb-icon
    width 100%
    height 100%
    display flex
    align-items center
    justify-content center
    color #c8c9cc
    font-size 0.56rem

  &__thumb-ph
    width 100%
    height 100%
    display block

  &__body
    flex 1
    min-width 0

  &__title
    font-size 0.3rem
    font-weight 600
    line-height 1.4
    color #323233
    white-space nowrap
    overflow hidden
    text-overflow ellipsis

  &__meta
    display flex
    align-items center
    gap 0.12rem
    margin-top 0.06rem
    font-size 0.24rem
    color #969799
    white-space nowrap
    overflow hidden

    .num
      font-variant-numeric tabular-nums

  &__path
    flex 1
    min-width 0
    overflow hidden
    text-overflow ellipsis
    white-space nowrap

  &__error
    margin-top 0.06rem
    font-size 0.24rem
    line-height 1.3
    color #ee0a24
    white-space nowrap
    overflow hidden
    text-overflow ellipsis

  &__actions
    display flex
    align-items center
    gap 0.12rem
    flex none
    margin-left 0.16rem

    // 弹出菜单项撑到 40px+ 命中区
    ::v-deep .van-popover__action
      min-height 40px

.fs-state
  display inline-flex
  align-items center
  gap 0.06rem
  flex none

  .fs-dot
    width 0.12rem
    height 0.12rem
    border-radius 50%
    display inline-block

  &--ok .fs-dot
    background #07c160

  &--missing .fs-dot
    background #c8c9cc

  &--missing
    color #c8c9cc

.dark .record-card
  &__title
    color #fff

  &__error
    color #f56c6c

  &__thumb
    background #3a3a3c

  &__thumb-icon
    color #6b6b6d

  &__thumb-img
    outline-color rgba(255, 255, 255, 0.1)

  border-bottom-color rgba(255, 255, 255, 0.08)
</style>
