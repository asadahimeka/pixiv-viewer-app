<template>
  <div class="Downloads">
    <top-bar />
    <h3 class="af_title">
      {{ $t('5wkdnjEH9KXox8uIHhQmm') }}
      <div class="clear-ih" @click="clearHistory">
        <Icon name="del" scale="2" />
      </div>
    </h3>
    <van-tabs v-model="activeTab" animated swipeable color="#F2C358">
      <van-tab :title="$t('HYU_Dtvsq74EoxIp0TEOn')" name="0" />
      <van-tab :title="$t('LnRdC18i8h90keGy4mNmv')" name="1" />
      <van-tab :title="$t('D8R2062pjASZe9mgvpeLr')" name="2" />
    </van-tabs>
    <div style="margin-top: 0.2rem;">
      <van-card
        v-for="(d,i) in dlList"
        :key="i"
        lazy-load
        :title="d.fileName"
      >
        <template v-if="d.isImage && d.imgSrc" #thumb>
          <LazyImage :src="d.imgSrc" style="width: 100%;height: 100%;object-fit: cover;" />
        </template>
        <template #desc>
          <p style="line-height: 2;color: #555;">{{ d.date }} <span v-if="d.size" style="margin-left: 1em;">{{ d.size }}</span></p>
          <p style="margin-bottom: 0.2rem;line-height: 1.3;color: #777;word-break: break-all;"><i>{{ d.status == 'ok' ? d.url : d.error }}</i></p>
        </template>
        <template #footer>
          <div class="dl-status-icon">
            <van-icon v-if="d.status == 'ok'" name="passed" color="green" size="0.6rem" />
            <van-icon v-if="d.status == 'error'" name="warning-o" color="red" size="0.6rem" />
          </div>
          <van-button v-if="d.status == 'ok' && d.path" icon="share-o" color="#FC9F4D" size="small" @click="openFile(d.path)">{{ $t('4A4oYtzfF0C8cA59wAXBF') }}</van-button>
          <van-button v-if="d.id" icon="link-o" size="small" color="#005CAF" @click="toDetail(d)">{{ $t('kv6zdp6UsJDYstYPq-p50') }}</van-button>
          <van-button v-if="d.status == 'error' && d.url" icon="replay" color="#F17C67" size="small" @click="retryDl(d)">{{ $t('d1aggG8fdPzwvQMZYbzdg') }}</van-button>
        </template>
      </van-card>
      <van-empty v-if="!dlList.length" :description="$t('tips.no_data')" />
    </div>
  </div>
</template>

<script>
import { Dialog } from 'vant'
import TopBar from '@/components/TopBar'
import LazyImage from '@/components/LazyImage.vue'
import { downloadFile } from '@/utils'
import { getCache, setCache } from '@/utils/storage/siteCache'

export default {
  name: 'SettingDownloads',
  components: {
    TopBar,
    LazyImage,
  },
  beforeRouteEnter(_to, from, next) {
    next(vm => {
      vm.isFromSetting = from.name == 'Setting'
    })
  },
  data() {
    return {
      activeTab: '0',
      dlList: [],
      isFromSetting: false,
    }
  },
  watch: {
    activeTab() {
      this.init()
    },
  },
  activated() {
    this.isFromSetting && this.init()
  },
  methods: {
    async init() {
      switch (this.activeTab) {
        case '0':
          this.dlList = await this.getHistory()
          break
        case '1':
          this.dlList = await this.getDlDirFiles()
          break
        case '2':
          this.dlList = (await this.getHistory()).filter(e => e.status == 'error')
          break
        default:
          break
      }
    },
    async openFile(filePath) {
      try {
        const { openFile } = await import('@/platform/capacitor/utils')
        await openFile(filePath)
      } catch (err) {
        this.$toast(err?.message || 'Open file failed.')
      }
    },
    toDetail(item) {
      this.$router.push(`/${item.isNovel ? 'n' : 'i'}/${item.id}`)
    },
    async retryDl(item) {
      await downloadFile(item.url, item.fileName)
      location.reload()
    },
    async getHistory() {
      const { convertFileSrc } = await import('@/platform/capacitor/utils')
      const res = await getCache('downloads.history') || []
      return res.map(e => {
        e.imgSrc = convertFileSrc(e.path)
        e.fileName = e.fileName.split('/').pop()
        e.id = e.fileName.match(/_(\d{4,})[_.]/)?.[1]
        e.isNovel = /\.txt$/.test(e.fileName)
        e.isImage = /\.(jpe?g|png|gif)$/.test(e.fileName)
        return e
      })
    },
    clearHistory() {
      Dialog.confirm({
        message: this.$t('vfK4o14WHBwqoxlLGXBhw'),
        cancelButtonText: this.$t('common.cancel'),
        confirmButtonText: this.$t('common.confirm'),
      }).then(() => {
        this.dlList = []
        return setCache('downloads.history', null)
      }).catch(() => {})
    },
    async getDlDirFiles() {
      const { readDlDir } = await import('@/platform/capacitor/utils')
      const files = await readDlDir()
      return files.sort((a, b) => b.ms - a.ms)
    },
  },
}
</script>

<style lang="stylus" scoped>
.af_title
  position relative
  margin-top 40px
  margin-bottom 40px
  text-align center
  font-size 28px

  .clear-ih
    position absolute
    top -10px
    right 20px

    ::v-deep .svg-icon
      font-size 0.6rem !important

.dl-status-icon
  position absolute
  top 0.2rem
  right 0.4rem

.Downloads
  padding-bottom 80px
  ::v-deep
    .top-bar-wrap
      width 10%
      height 1.2rem
      padding-top calc(20px + var(--status-bar-height))
      background transparent
    .van-card__thumb
      width 2rem
      height 2rem
    .van-card__title
      display block
      max-height unset
      font-size 0.35rem
      font-weight bold
      line-height 1.4
      white-space pre-wrap
    .van-card__content
      padding-right 0.7rem
      min-height unset
    .van-card__desc
      max-height unset
      white-space pre-wrap
</style>
<style lang="stylus">
.dark .Downloads
  .van-card
    background 0
    &:not(:last-child)
      border-bottom 1px solid #666
  .van-card__title,.van-card__desc
    color #fff
</style>
