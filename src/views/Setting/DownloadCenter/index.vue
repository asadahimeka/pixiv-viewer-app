<template>
  <div class="DownloadCenter">
    <top-bar />
    <h3 class="af_title">{{ $t('dlc.title') }}</h3>

    <!-- 存储概览 -->
    <div v-if="totalCount" class="dlc-overview num">
      <van-icon name="apps-o" />
      <span>{{ $t('dlc.overview_files', { n: totalCount, size: totalSizeText }) }}</span>
    </div>

    <!-- 正在下载:进度回到页面里,不再只存在于 toast -->
    <div v-if="tasks.length" class="dlc-active">
      <div class="dlc-section-head">
        <span>{{ $t('dlc.section_active') }} ({{ tasks.length }})</span>
        <span class="dlc-cancel-all" @click="onCancelAll">{{ $t('dlc.cancel_all') }}</span>
      </div>
      <ActiveTaskCard v-for="t in tasks" :key="t.id" :task="t" @cancel="onCancelTask(t)" />
    </div>

    <!-- 筛选 -->
    <div v-if="records.length || filter != 'all'" class="dlc-filters">
      <span class="dlc-chip" :class="{ 'is-active': filter == 'all' }" @click="setFilter('all')">
        {{ $t('dlc.filter_all') }}
      </span>
      <span class="dlc-chip" :class="{ 'is-active': filter == 'failed' }" @click="setFilter('failed')">
        {{ $t('dlc.filter_failed') }}{{ failedNum ? ` (${failedNum})` : '' }}
      </span>
    </div>

    <!-- 记录流:虚拟化窗口渲染(VirtualWaterfall,定高模型) -->
    <van-pull-refresh v-model="refreshing" :head-distance="60" @refresh="onRefresh">
      <VirtualWaterfall
        :items="renderItems"
        row-key="id"
        :gap="0"
        :item-min-width="9999"
        :min-column-count="1"
        :max-column-count="1"
        :preload-screen-count="[1, 2]"
        wrapper-height="auto"
        :calc-item-height="calcItemHeight"
      >
        <template #default="{ item }">
          <div v-if="item.type == 'header'" class="dlc-section-head dlc-group-row">
            <span>{{ groupLabel(item.key) }} ({{ item.count }})</span>
          </div>
          <RecordCard
            v-else
            class="dlc-record-row"
            :record="item.record"
            @open="onOpen(item.record)"
            @detail="onDetail(item.record)"
            @retry="onRetry(item.record)"
            @menu="onMenu(item.record, $event)"
          />
        </template>
      </VirtualWaterfall>

      <van-empty v-if="!filteredRecords.length && !tasks.length" :description="emptyText" />
    </van-pull-refresh>

    <!-- 未识别文件:磁盘有、账本没有(清数据/换机后的孤儿文件) -->
    <div v-if="orphans.length" class="dlc-orphans">
      <div class="dlc-section-head" @click="showOrphans = !showOrphans">
        <span>{{ $t('dlc.orphans') }} ({{ orphans.length }})</span>
        <van-icon :name="showOrphans ? 'arrow-up' : 'arrow-down'" />
      </div>
      <template v-if="showOrphans">
        <p class="dlc-orphans-tip">{{ $t('dlc.orphans_tip') }}</p>
        <OrphanCard
          v-for="o in orphans"
          :key="o.path"
          :orphan="o"
          @claim="onClaim(o)"
          @delete="onDeleteOrphan(o)"
        />
      </template>
    </div>
  </div>
</template>

<script>
import { Dialog } from '@/lib/vant-apis'
import TopBar from '@/components/TopBar'
import VirtualWaterfall from '@/components/VirtualWaterfall.vue'
import ActiveTaskCard from './components/ActiveTaskCard.vue'
import RecordCard from './components/RecordCard.vue'
import OrphanCard from './components/OrphanCard.vue'
import { formatBytes } from '@/utils'
import {
  getDownloadState,
  ensureInit,
  reconcile,
  cancelTask,
  cancelAllTasks,
  retryRecord,
  removeRecord,
  removeRecordAndFile,
  claimOrphan,
  deleteOrphan,
  openDest,
  locateDest,
  groupRecords,
} from '@/store/downloads'

const GROUP_LABELS = {
  today: 'dlc.group_today',
  yesterday: 'dlc.group_yesterday',
  earlier: 'dlc.group_earlier',
}

// 定高模型:VirtualWaterfall 的 calcItemHeight 需要 px 数值,
// 而页面尺寸用 rem 定义(html font-size 由 flexible 按屏宽设定),实时换算
function htmlFontSize() {
  const fs = parseFloat(getComputedStyle(document.documentElement).fontSize)
  return Number.isFinite(fs) && fs > 0 ? fs : 50
}
const CARD_HEIGHT = () => Math.round(htmlFontSize() * 1.76)
const HEADER_HEIGHT = () => Math.round(htmlFontSize() * 0.76)

export default {
  name: 'DownloadCenter',
  components: {
    TopBar,
    VirtualWaterfall,
    ActiveTaskCard,
    RecordCard,
    OrphanCard,
  },
  beforeRouteEnter(_to, _from, next) {
    // 在 next 回调里初始化:修复旧页面"activated 先于 next 回调,首次进入不加载"的时序问题
    next(vm => {
      vm.refresh()
    })
  },
  data() {
    return {
      state: getDownloadState(),
      filter: 'all',
      refreshing: false,
      showOrphans: false,
    }
  },
  computed: {
    tasks() {
      return this.state.tasks
    },
    records() {
      return this.state.records
    },
    orphans() {
      return this.state.orphans
    },
    failedNum() {
      return this.records.filter(r => r.status == 'failed').length
    },
    filteredRecords() {
      return this.filter == 'failed'
        ? this.records.filter(r => r.status == 'failed')
        : this.records
    },
    // 展开成分组头 + 记录的线性列表,交给 VirtualWaterfall 窗口化渲染
    renderItems() {
      const list = []
      for (const group of groupRecords(this.filteredRecords)) {
        list.push({ id: `h_${group.key}`, type: 'header', key: group.key, count: group.items.length })
        for (const record of group.items) {
          list.push({ id: record.id, type: 'record', record })
        }
      }
      return list
    },
    totalCount() {
      return this.records.filter(r => r.status == 'done').length + this.orphans.length
    },
    totalSizeText() {
      let size = 0
      for (const r of this.records) {
        if (r.status != 'done') continue
        if (r.fs?.size) size += r.fs.size
        else if (r.fileSize) size += r.fileSize
      }
      for (const o of this.orphans) size += o.size || 0
      return size ? formatBytes(size) : '--'
    },
    emptyText() {
      return this.filter == 'failed'
        ? this.$t('dlc.empty_failed')
        : this.$t('dlc.empty')
    },
  },
  activated() {
    // keep-alive 重进页面:数据可能已变化,做一次静默对账
    this.refresh()
  },
  methods: {
    async refresh(force = false) {
      await ensureInit()
      reconcile(force)
    },
    calcItemHeight(item) {
      return item.type == 'header' ? HEADER_HEIGHT() : CARD_HEIGHT()
    },
    groupLabel(key) {
      return this.$t(GROUP_LABELS[key] || 'dlc.group_earlier')
    },
    setFilter(filter) {
      this.filter = filter
    },
    async onRefresh() {
      try {
        await this.refresh(true)
      } finally {
        this.refreshing = false
      }
    },
    onCancelTask(task) {
      cancelTask(task)
    },
    onCancelAll() {
      Dialog.confirm({
        message: this.$t('dlc.cancel_all_confirm'),
        cancelButtonText: this.$t('common.cancel'),
        confirmButtonText: this.$t('common.confirm'),
      }).then(() => {
        cancelAllTasks()
      }).catch(() => {})
    },
    onOpen(record) {
      openDest(record.dest, record.fileName)
    },
    onDetail(record) {
      if (!record.artworkId) return
      const isNovel = record.kind == 'novel' || record.kind == 'epub'
      this.$router.push(`/${isNovel ? 'n' : 'i'}/${record.artworkId}`)
    },
    onRetry(record) {
      retryRecord(record)
    },
    // RecordCard 的 ⋯ Popover 菜单:动作在卡片内构建,这里只负责确认与执行
    async onMenu(record, { key } = {}) {
      if (!record || !key) return
      if (key == 'locate') {
        locateDest(record.dest)
      } else if (key == 'delete_file') {
        const ok = await this.confirm(this.$t('dlc.delete_file_confirm'))
        if (!ok) return
        await removeRecordAndFile(record)
      } else if (key == 'delete_record') {
        const ok = await this.confirm(this.$t('dlc.delete_record_confirm'))
        if (!ok) return
        removeRecord(record.id)
      }
    },
    async onClaim(orphan) {
      claimOrphan(orphan)
    },
    async onDeleteOrphan(orphan) {
      const ok = await this.confirm(this.$t('dlc.delete_file_confirm'))
      if (!ok) return
      await deleteOrphan(orphan)
    },
    confirm(message) {
      return Dialog.confirm({
        message,
        cancelButtonText: this.$t('common.cancel'),
        confirmButtonText: this.$t('common.confirm'),
      }).then(() => true).catch(() => false)
    },
  },
}
</script>

<style lang="stylus" scoped>
// 本页自定义类名会被 postcss-pxtorem(rootValue 75)换算,自定义文本一律用 rem;
// Vant 组件(van-*)不在换算黑名单外,保持原生 px
.DownloadCenter
  padding-bottom 80px

  // TopBar 默认带全宽黑色渐变遮罩(图片页用),列表页改窄条透明,同旧版下载记录页
  ::v-deep
    .top-bar-wrap
      width 10%
      height 1.2rem
      padding-top calc(20px + var(--status-bar-height))
      background transparent

    // 下拉刷新文案居中(被全局样式重置过)
    .van-pull-refresh__head
      left 0
      width 100%
      text-align center

.af_title
  position relative
  margin-top 40px
  margin-bottom 30px
  text-align center
  font-size 28px

.num
  font-variant-numeric tabular-nums

.dlc-overview
  display flex
  align-items center
  justify-content center
  gap 0.12rem
  margin 0 auto 0.24rem
  font-size 0.24rem
  color #969799

  .van-icon
    font-size 0.28rem

.dlc-section-head
  display flex
  align-items center
  justify-content space-between
  padding 0.2rem 0.4rem 0.12rem
  font-size 0.26rem
  font-weight 600
  color #969799

// VirtualWaterfall 的两种定高行,与 index.vue 的 CARD_HEIGHT/HEADER_HEIGHT 对应
.dlc-record-row
  height 100%
  box-sizing border-box

.dlc-group-row
  height 100%
  box-sizing border-box
  overflow hidden

.dlc-cancel-all
  font-weight 400
  color #ee0a24

.dlc-filters
  display flex
  gap 0.16rem
  padding 0.08rem 0.4rem 0.16rem

  .dlc-chip
    padding 0.08rem 0.24rem
    font-size 0.24rem
    border-radius 999px
    background #f2f3f5
    color #646566
    transition background-color 0.15s ease-out, color 0.15s ease-out

    &.is-active
      background var(--accent-color, #f2c358)
      color #fff

.dlc-orphans
  margin-top 0.32rem

  .dlc-orphans-tip
    padding 0 0.4rem 0.12rem
    font-size 0.24rem
    color #c8c9cc

.dark
  .dlc-section-head
    color #7d7e80

  .dlc-filters .dlc-chip
    background #3a3a3c
    color #aaa

    &.is-active
      background var(--accent-color, #f2c358)
      color #fff
</style>
