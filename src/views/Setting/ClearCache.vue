<template>
  <div class="setting-page">
    <top-bar id="top-bar-wrap" />
    <h3 class="af_title">{{ $t('cache.title') }}</h3>
    <van-cell center :title="$t('cache.db')">
      <template #label>
        <span>{{ $t('cache.records', [size.db[1]]) }} ~ {{ size.db[0] | bytes }}</span>
      </template>
      <template #right-icon>
        <van-button type="info" size="small" @click="clearCache('db')">
          <span>{{ $t('cache.clear') }}</span>
        </van-button>
      </template>
    </van-cell>
    <van-cell center :title="$t('cache.local')">
      <template #label>
        <span>{{ $t('cache.records', [size.local[1]]) }} ~ {{ size.local[0] | bytes }}</span>
      </template>
      <template #right-icon>
        <van-button size="small" color="linear-gradient(to right, #ff6034, #ee0a24)" @click="clearCache('local')">
          <span>{{ $t('cache.clear') }}</span>
        </van-button>
      </template>
    </van-cell>
    <van-cell center :title="$t('cache.session')">
      <template #label>
        <span>{{ $t('cache.records', [size.session[1]]) }} ~ {{ size.session[0] | bytes }}</span>
      </template>
      <template #right-icon>
        <van-button type="primary" size="small" @click="clearCache('session')">
          <span>{{ $t('cache.clear') }}</span>
        </van-button>
      </template>
    </van-cell>
    <van-cell v-if="platform.isCapacitor" center :title="$t('ltKHIZm9mBZ8Dit_u8aW4')">
      <template v-if="platform.isAndroid" #label>
        <span>{{ $t('cache.records', [size.imgCache[1]]) }} ~ {{ size.imgCache[0] | bytes }}</span>
      </template>
      <template #right-icon>
        <van-button type="primary" size="small" @click="clearCache('imgCache')">
          <span>{{ $t('cache.clear') }}</span>
        </van-button>
      </template>
    </van-cell>
    <van-cell v-if="platform.isCapacitor" center is-link :title="$t('I9MyPQxu3O04E3h2qRBzN')" @click="openSettings" />
  </div>
</template>

<script>
import { Dialog } from 'vant'
import { formatBytes } from '@/utils'
import { LocalStorage, SessionStorage } from '@/utils/storage'
import localDb from '@/utils/storage/localDb'
import platform from '@/platform'

export default {
  name: 'SettingClearCache',
  filters: {
    bytes(bytes) {
      return formatBytes(bytes)
    },
  },
  data() {
    return {
      platform,
      size: {
        db: [0, 0],
        local: [0, 0],
        session: [0, 0],
        imgCache: [0, 0],
      },
    }
  },
  head() {
    return { title: this.$t('cache.title') }
  },
  activated() {
    this.calcCacheSize()
  },
  methods: {
    async calcCacheSize() {
      this.size.local = [LocalStorage.size(), localStorage.length]
      this.size.session = [SessionStorage.size(), sessionStorage.length]
      this.size.db = [
        (await navigator.storage.estimate()).usage,
        await localDb.length(),
      ]
      if (platform.isAndroid) {
        const { getCacheSize } = await import('@/platform/capacitor/utils')
        this.size.imgCache = await getCacheSize()
      }
    },
    clearCache(type) {
      const showNames = {
        db: this.$t('cache.db'),
        local: this.$t('cache.local'),
        session: this.$t('cache.session'),
        imgCache: this.$t('ltKHIZm9mBZ8Dit_u8aW4'),
      }
      let message = this.$t('cache.confirm.first', [showNames[type]])
      if (type == 'db') message += this.$t('cache.confirm.second')
      if (type == 'local') message += this.$t('a1HSQm-WYv6GDFwhKr9x_')
      Dialog.confirm({
        message,
        confirmButtonColor: 'black',
        cancelButtonColor: '#1989fa',
        closeOnPopstate: true,
        confirmButtonText: this.$t('common.confirm'),
        cancelButtonText: this.$t('common.cancel'),
      }).then(async () => {
        window.umami?.track('clear_cache', { type })
        if (type === 'db') {
          await localDb.clear()
          const cacheKeys = await caches.keys()
          await Promise.all(cacheKeys.map(key => caches.delete(key)))
        }
        if (type === 'local') LocalStorage.clear()
        if (type === 'session') SessionStorage.clear()
        if (type === 'imgCache') {
          const { clearImageCache } = await import('@/platform/capacitor/utils')
          await clearImageCache()
        }

        this.calcCacheSize()
        this.$toast.success(this.$t('cache.success_tip'))
      }).catch(() => {})
    },
    async openSettings() {
      const { openAppSettings } = await import('@/platform/capacitor/utils')
      openAppSettings()
    },
  },
}
</script>

<style lang="stylus" scoped>

</style>
